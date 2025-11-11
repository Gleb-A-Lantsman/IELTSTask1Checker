// CACHED VISION VERSION - Store Vision analysis for reuse

const { Sandbox } = require('@e2b/code-interpreter');

exports.handler = async (event) => {
  try {
    const { content, requestType, taskType, imageUrl, imageName } = JSON.parse(event.body || "{}");

    if (!content || !requestType) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: true, feedback: "Missing required data." }),
      };
    }

    console.log(`📩 ${requestType} | ${taskType} | ${imageName || 'no-name'}`);

    let feedback = "";
    let asciiTable = null;
    let generatedImageBase64 = null;
    let generatedSvg = null;
    let visionAnalysis = null;

    // STEP 1: Feedback (always fast)
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
        // VISION WITH CACHING
        console.log(`🗺️ Map visualization`);
        
        try {
          // STEP 2A: Try to load cached Vision analysis from GitHub
          if (imageName) {
            const visionFileName = imageName.replace(/\.(png|jpg|jpeg|webp)$/i, '.txt');
            const owner = "Gleb-A-Lantsman";
            const repo = "IELTSTask1Checker";
            const visionPath = `visuals/${taskType}/${visionFileName}`;
            const visionUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${visionPath}`;
            
            console.log(`📂 Checking for cached analysis: ${visionFileName}`);
            
            try {
              const cacheResponse = await fetch(visionUrl);
              
              if (cacheResponse.ok) {
                const cacheData = await cacheResponse.json();
                // Decode base64 content
                visionAnalysis = Buffer.from(cacheData.content, 'base64').toString('utf-8');
                console.log("✅ Loaded cached Vision analysis");
                console.log("📋 Cached analysis preview:", visionAnalysis.substring(0, 150));
              } else {
                console.log("⚠️ No cached analysis found, will use Vision API");
              }
            } catch (cacheError) {
              console.log("⚠️ Cache check failed, will use Vision API");
            }
          }

          // STEP 2B: If no cache, use Vision API
          if (!visionAnalysis) {
            console.log("👁️ Running Vision API analysis...");
            
            const visionPrompt = `Analyze this IELTS map briefly:

1. Structure: before/after or single view?
2. Count each feature type (trees, huts, buildings)
3. Main areas: water, beach, land positions
4. Key colors used

Be concise - just the facts needed for visualization.`;

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
                          detail: "low"
                        }
                      }
                    ]
                  }
                ],
                max_tokens: 600,
                temperature: 0.1,
              }),
            });

            if (!visionRes.ok) {
              throw new Error(`Vision API error: ${visionRes.status}`);
            }

            const visionData = await visionRes.json();
            visionAnalysis = visionData.choices?.[0]?.message?.content?.trim() || "";
            
            console.log("✅ Vision analysis complete");
            console.log("📋 New analysis preview:", visionAnalysis.substring(0, 150));
            console.log("💡 Note: Save this analysis to a .txt file in your GitHub repo for caching!");
          }

          // STEP 2C: Generate SVG using Vision analysis
          console.log("🎨 Generating SVG from analysis...");

          const svgPrompt = `Create accurate SVG from this analysis:

IMAGE ANALYSIS:
${visionAnalysis}

STUDENT DESCRIPTION:
${content}

SVG STRUCTURE:
<svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg">
  <!-- Before (top half, y=50-300) -->
  <g id="before">
    <text x="500" y="30" font-size="20" font-weight="bold" text-anchor="middle">Before</text>
    <!-- features here -->
  </g>
  
  <!-- After (bottom half, y=400-650) -->
  <g id="after" transform="translate(0,350)">
    <text x="500" y="30" font-size="20" font-weight="bold" text-anchor="middle">After</text>
    <!-- features here -->
  </g>
</svg>

QUICK REFERENCE:
- Trees: <circle cx="X" cy="Y" r="15" fill="#228B22"/>
- Huts: <rect x="X" y="Y" width="50" height="40" fill="#8B4513"/>
- Water: bottom area, fill="#87CEEB"
- Beach: above water, fill="#F5DEB3"

Match the analysis feature counts. Output ONLY SVG code.`;

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
              max_tokens: 2500,
            }),
          });

          if (!svgRes.ok) {
            throw new Error(`SVG generation error: ${svgRes.status}`);
          }

          const svgData = await svgRes.json();
          let svgCode = svgData.choices?.[0]?.message?.content?.trim() || "";
          
          console.log("📄 SVG length:", svgCode.length);
          
          // Clean
          svgCode = svgCode
            .replace(/```svg\s*/gi, '')
            .replace(/```xml\s*/gi, '')
            .replace(/```\s*/g, '')
            .replace(/^[^<]*(<svg)/i, '$1')
            .replace(/(<\/svg>)[^>]*$/i, '$1')
            .trim();

          // Extract
          const svgMatch = svgCode.match(/<svg[\s\S]*?<\/svg>/i);
          if (svgMatch) {
            svgCode = svgMatch[0];
          }

          // Validate
          if (svgCode.startsWith('<svg') && svgCode.includes('</svg>')) {
            generatedSvg = svgCode;
            console.log("✅ SVG generated:", svgCode.length, "chars");
          } else {
            console.error("❌ Invalid SVG");
          }

        } catch (error) {
          console.error("❌ Map visualization error:", error.message);
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
        visionAnalysisForCaching: visionAnalysis, // Return analysis so you can save it
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
        asciiTable: null,
        generatedImageBase64: null,
        generatedSvg: null,
      }),
    };
  }
};
