// VISION PRELOAD VERSION - Load Vision analysis when image loads

const { Sandbox } = require('@e2b/code-interpreter');

exports.handler = async (event) => {
  try {
    const { content, requestType, taskType, imageUrl, imageName, cachedVisionAnalysis } = JSON.parse(event.body || "{}");

    if (!requestType) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: true, feedback: "Missing required data." }),
      };
    }

    console.log(`📩 ${requestType} | ${taskType} | ${imageName || 'no-name'}`);

    // SPECIAL REQUEST TYPE: Just preload Vision analysis
    if (requestType === "preload-vision") {
      console.log(`👁️ Preloading Vision analysis for ${imageName}`);
      
      try {
        // Check for cached analysis first
        if (imageName) {
          const visionFileName = imageName.replace(/\.(png|jpg|jpeg|webp)$/i, '.txt');
          const owner = "Gleb-A-Lantsman";
          const repo = "IELTSTask1Checker";
          const visionPath = `visuals/${taskType}/${visionFileName}`;
          const visionUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${visionPath}`;
          
          console.log(`📂 Checking cache: ${visionFileName}`);
          
          try {
            const cacheResponse = await fetch(visionUrl);
            
            if (cacheResponse.ok) {
              const cacheData = await cacheResponse.json();
              const visionAnalysis = Buffer.from(cacheData.content, 'base64').toString('utf-8');
              console.log("✅ Loaded from cache");
              
              return {
                statusCode: 200,
                headers: { 
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({
                  visionAnalysis,
                  cached: true,
                }),
              };
            }
          } catch (cacheError) {
            console.log("⚠️ Cache miss");
          }
        }

        // No cache - run Vision API
        console.log("👁️ Running Vision API...");
        console.log("Image URL:", imageUrl?.substring(0, 100));
        console.log("Task type:", taskType);
        
        const visionPrompt = `Analyze this IELTS map in DETAIL for accurate SVG recreation:

**STRUCTURE:**
- Before/after comparison or single view?
- Layout orientation (horizontal/vertical split?)

**SPATIAL LAYOUT (be very specific):**
- Island shape and outline
- Water body positions (which edges: north/south/east/west?)
- Beach/shore locations and extent
- Pier/jetty locations and orientations
- Road/path layouts (describe curves, intersections)

**FEATURES - BEFORE MAP:**
For each feature type, describe:
- Exact count
- Spatial distribution (clustered? scattered? in a line?)
- Specific locations (e.g., "3 trees in NW corner", "palm trees along eastern shore")
- Relative positions to each other

**FEATURES - AFTER MAP:**
Same detail as above, plus:
- NEW buildings: locations, sizes, arrangements (grid? scattered?)
- NEW infrastructure: describe layout precisely
- REMOVED features: what disappeared?
- UNCHANGED features: what stayed?

**VISUAL DETAILS:**
- Colors used for each element type
- Icon styles (simple shapes? detailed drawings?)
- Size relationships between elements
- Any labels or legends

**KEY LANDMARKS:**
- Any distinctive features that anchor the layout
- Reference points for positioning other elements

Be specific about POSITIONS - use compass directions, relative distances, groupings. This will be used to recreate the map accurately.`;

        const visionRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: visionPrompt },
                  { 
                    type: "image_url", 
                    image_url: { 
                      url: imageUrl,
                      detail: "high"  // Changed to high for better analysis
                    }
                  }
                ]
              }
            ],
            max_tokens: 1500,
            temperature: 0.1,
          }),
        });

        if (!visionRes.ok) {
          const errorText = await visionRes.text();
          console.error(`❌ Vision API error: ${visionRes.status}`, errorText);
          throw new Error(`Vision API error: ${visionRes.status} - ${errorText.substring(0, 200)}`);
        }

        // Check if response has content before parsing
        const responseText = await visionRes.text();
        if (!responseText || responseText.trim().length === 0) {
          throw new Error('Vision API returned empty response');
        }

        let visionData;
        try {
          visionData = JSON.parse(responseText);
        } catch (parseError) {
          console.error('❌ JSON parse error:', responseText.substring(0, 500));
          throw new Error(`Failed to parse Vision API response: ${parseError.message}`);
        }

        const visionAnalysis = visionData.choices?.[0]?.message?.content?.trim() || "";
        
        if (!visionAnalysis) {
          console.error('❌ No vision analysis in response:', JSON.stringify(visionData));
          throw new Error('Vision API returned no analysis content');
        }
        
        console.log("✅ Vision complete:", visionAnalysis.length, "chars");
        
        // Generate proper filename for GitHub structure
        const txtFilename = imageName ? imageName.replace(/\.(png|jpg|jpeg|webp)$/i, '.txt') : 'vision-analysis.txt';
        
        return {
          statusCode: 200,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
          body: JSON.stringify({
            visionAnalysis,
            cached: false,
            shouldDownload: true,
            downloadFilename: txtFilename,
            githubPath: `visuals/${taskType}/${txtFilename}`, // Include full path for reference
          }),
        };

      } catch (error) {
        console.error("❌ Vision preload error:", error.message);
        console.error("Error stack:", error.stack);
        return {
          statusCode: 200,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
          body: JSON.stringify({
            error: true,
            message: `Vision analysis failed: ${error.message}`,
            details: error.stack ? error.stack.substring(0, 500) : 'No stack trace'
          }),
        };
      }
    }

    // REGULAR FEEDBACK REQUEST
    let feedback = "";
    let asciiTable = null;
    let generatedImageBase64 = null;
    let generatedSvg = null;

    // STEP 1: Feedback
    if (!content) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: true, feedback: "Missing content." }),
      };
    }

    const feedbackPrompt =
      requestType === "help"
        ? `IELTS examiner: Give short hints (< 150 words) for:\n\n${content}`
        : `IELTS Task 1 examiner: Evaluate on Task Achievement, Coherence/Cohesion, Lexical Resource, Grammar. Bold section titles.\n\n${content}`;

    const feedbackRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "IELTS Writing Task 1 examiner." },
          { role: "user", content: feedbackPrompt },
        ],
      }),
    });

    const feedbackData = await feedbackRes.json();
    feedback = feedbackData.choices?.[0]?.message?.content?.trim() || "";
    console.log("✅ Feedback done");

    // STEP 2: Visualization
    if (requestType === "full-feedback") {
      if (taskType === "table") {
        console.log("📊 ASCII table");
        const asciiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "Convert to ASCII table with | borders." },
              { role: "user", content: `ASCII table only:\n\n${content}` },
            ],
          }),
        });

        const asciiData = await asciiRes.json();
        asciiTable = asciiData.choices?.[0]?.message?.content?.trim() || "";
        console.log("✅ ASCII done");

      } else if (taskType === "maps" || taskType === "flowchart") {
        // USE PRELOADED VISION ANALYSIS
        console.log(`🗺️ Map SVG (using ${cachedVisionAnalysis ? 'preloaded' : 'no'} analysis)`);
        
        if (!cachedVisionAnalysis) {
          console.error("❌ No preloaded Vision analysis provided");
          // Return error but with feedback still intact
          return {
            statusCode: 200,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
              feedback,
              error: true,
              message: "Vision analysis not loaded. Please reload the image.",
            }),
          };
        }

        try {
          // Generate SVG using preloaded analysis
          console.log("🎨 Generating SVG...");

          const svgPrompt = `Create an ACCURATE SVG that matches BOTH the Vision analysis AND the student's description:

IMAGE ANALYSIS (Technical details):
${cachedVisionAnalysis}

STUDENT DESCRIPTION (Spatial structure - FOLLOW THIS):
${content}

CRITICAL: Extract spatial information from STUDENT DESCRIPTION first:
1. Parse phrases like "two main areas", "near the beach", "eastern part", "central area", "southern tip"
2. Count features mentioned (e.g., "several huts" might mean 6-12)
3. Identify spatial relationships (e.g., "one near X and another near Y" = TWO clusters)
4. Use student's structure as PRIMARY guide for positioning

REQUIREMENTS:
1. **Spatial positioning from student description:**
   - "two main areas" = Create TWO distinct separated clusters, NOT one continuous line
   - "near the beach" / "western" = Position on LEFT side near beach edge
   - "eastern part" = Position on RIGHT side of island
   - "central area" = Position in CENTER of island
   - "southern" / "south" = Position at BOTTOM edge
   
2. **Use emoji/Unicode symbols** for visual elements:
   - Trees: 🌴
   - Huts/accommodation: 🏠 
   - Reception: 🏢
   - Restaurant: 🍽️
   - Pier: Brown rectangle (#8B4513)
   - Paths: Dashed lines (stroke-dasharray)
   - Boats: ⛵ (if mentioned)
   
3. **Layout structure:**
   - Before map: viewBox top half (y: 0-340)
   - After map: viewBox bottom half (y: 360-700)
   - Island: Elongated oval shape
   - Water: #4A90E2 (surrounds island)
   - Beach: #F5DEB3 (where student describes it)
   - Land: #90EE90

4. **Match student's descriptions:**
   - If student says "several", show 6-8 items
   - If student says "many", show 12+ items
   - If student describes arrangement (e.g., "in a row", "in a circle"), follow that pattern
   - If student says "connected by", draw paths/tracks between those features

5. **Visual hierarchy:**
   - Make features mentioned multiple times slightly larger
   - Central/important features (reception, restaurant) should be prominent
   - Use size to show importance: 🏢 (bigger) vs 🏠 (smaller)

EXAMPLE SPATIAL PARSING:
"Several huts in two main areas — one near the beach and another in the eastern part"
→ Create TWO separate hut clusters:
   Cluster 1: 5-6 huts at x:200-350, y:600-650 (western/beach side)
   Cluster 2: 5-6 huts at x:650-750, y:600-650 (eastern side)

"Reception and restaurant in the central area"
→ Position both in center: x:450-500, y:580-620

"Pier in the south"  
→ Position at bottom: x:400-450, y:720-770

Output ONLY the complete SVG code with NO markdown formatting.`;

          const svgRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o",
              messages: [
                { 
                  role: "system", 
                  content: "Create accurate SVG. Output only SVG code, no markdown." 
                },
                { role: "user", content: svgPrompt },
              ],
              temperature: 0.2,
              max_tokens: 3500,
            }),
          });

          if (!svgRes.ok) {
            throw new Error(`SVG error: ${svgRes.status}`);
          }

          const svgData = await svgRes.json();
          let svgCode = svgData.choices?.[0]?.message?.content?.trim() || "";
          
          // Clean
          svgCode = svgCode
            .replace(/```svg\s*/gi, '')
            .replace(/```xml\s*/gi, '')
            .replace(/```\s*/g, '')
            .replace(/^[^<]*(<svg)/i, '$1')
            .replace(/(<\/svg>)[^>]*$/i, '$1')
            .trim();

          const svgMatch = svgCode.match(/<svg[\s\S]*?<\/svg>/i);
          if (svgMatch) {
            svgCode = svgMatch[0];
          }

          if (svgCode.startsWith('<svg') && svgCode.includes('</svg>')) {
            generatedSvg = svgCode;
            console.log("✅ SVG generated:", svgCode.length, "chars");
          }

        } catch (error) {
          console.error("❌ SVG error:", error.message);
        }

      } else {
        // MATPLOTLIB for charts
        console.log(`📈 Matplotlib for ${taskType}`);
        
        const codeGenPrompt = `Generate Python matplotlib code for ${taskType}:

${content}

Requirements:
- Extract data accurately
- Use matplotlib.pyplot as plt
- figsize=(10,6)
- Include title, labels, legend
- Return ONLY code`;

        const codeRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "Generate Python code only." },
              { role: "user", content: codeGenPrompt },
            ],
            temperature: 0.2,
          }),
        });

        const codeData = await codeRes.json();
        let pythonCode = codeData.choices?.[0]?.message?.content?.trim() || "";
        
        pythonCode = pythonCode
          .replace(/```python\n?/g, '')
          .replace(/```\n?/g, '')
          .replace(/plt\.show\(\)/g, '')
          .trim();

        try {
          const sandbox = await Sandbox.create({
            apiKey: process.env.E2B_API_KEY,
            timeoutMs: 20000
          });

          const execution = await sandbox.runCode(pythonCode);

          if (execution.error) {
            throw new Error(execution.error.value || "Python failed");
          }

          if (execution.results && execution.results.length > 0) {
            for (const result of execution.results) {
              if (result.png) {
                generatedImageBase64 = `data:image/png;base64,${result.png}`;
                break;
              }
            }
          }

          if (!generatedImageBase64) {
            const saveCode = `
import matplotlib.pyplot as plt
import io
import base64
fig = plt.gcf()
if fig.get_axes():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close('all')
    print(img_base64)
`;
            const saveExec = await sandbox.runCode(saveCode);
            
            if (saveExec.logs && saveExec.logs.stdout && saveExec.logs.stdout.length > 0) {
              const output = saveExec.logs.stdout.join('').trim();
              if (output && output.length > 100) {
                generatedImageBase64 = `data:image/png;base64,${output}`;
              }
            }
          }

          await sandbox.close();

        } catch (e2bError) {
          console.error("❌ E2B failed:", e2bError.message);
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        feedback,
        asciiTable,
        generatedImageBase64,
        generatedSvg,
      }),
    };

  } catch (error) {
    console.error("❌ ERROR:", error);
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: true,
        feedback: "An error occurred. Please try again.",
      }),
    };
  }
};
