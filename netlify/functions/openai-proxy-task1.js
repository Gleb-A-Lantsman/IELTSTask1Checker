// MAXIMUM ACCURACY VERSION - With GPT-4o Vision API

const { Sandbox } = require('@e2b/code-interpreter');

exports.handler = async (event) => {
  try {
    const { content, requestType, taskType, imageUrl } = JSON.parse(event.body || "{}");

    if (!content || !requestType) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: true, feedback: "Missing required data." }),
      };
    }

    console.log(`📩 ${requestType} | ${taskType}`);

    let feedback = "";
    let asciiTable = null;
    let generatedImageBase64 = null;
    let generatedSvg = null;

    // STEP 1: Feedback
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
        // VISION-ENHANCED SVG GENERATION
        console.log(`🔍 Using Vision API for accurate SVG`);
        
        try {
          // STEP 2A: Analyze original image with Vision
          console.log("👁️ Analyzing original image with Vision API...");
          
          const visionPrompt = `Analyze this IELTS Task 1 map image in detail.

Describe:
1. **Layout**: How is the map structured? (single view, before/after comparison, top-bottom, side-by-side?)
2. **Features**: List EVERY feature visible (buildings, trees, water, beach, roads, etc.) with their:
   - Exact count (e.g., "5 trees", "3 huts")
   - Approximate positions (e.g., "top-left", "center", "bottom-right")
   - Sizes (small, medium, large)
3. **Colors**: What colors are used for each element?
4. **Spatial relationships**: What is near what? What connects to what?
5. **Labels**: What text labels are visible?
6. **Scale/Legend**: Any scale bars or legends?

If this is a before/after comparison:
- Clearly distinguish what appears in "before" vs "after"
- Note what changed, was added, or removed

Be extremely specific and detailed. This analysis will be used to create an accurate visualization.`;

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
                        detail: "high" // High detail for better analysis
                      }
                    }
                  ]
                }
              ],
              max_tokens: 1500,
            }),
          });

          if (!visionRes.ok) {
            throw new Error(`Vision API error: ${visionRes.status}`);
          }

          const visionData = await visionRes.json();
          const imageAnalysis = visionData.choices?.[0]?.message?.content?.trim() || "";
          
          console.log("✅ Vision analysis complete");
          console.log("📋 Analysis preview:", imageAnalysis.substring(0, 200));

          // STEP 2B: Generate SVG based on Vision analysis + student description
          console.log("🎨 Generating SVG based on Vision analysis...");

          const svgPrompt = `You are creating an SVG visualization based on BOTH the original image analysis AND the student's description.

ORIGINAL IMAGE ANALYSIS (from Vision API):
${imageAnalysis}

STUDENT'S DESCRIPTION:
${content}

TASK: Create an accurate SVG that:
1. Matches the layout and structure from the original image
2. Uses the same colors from the original
3. Shows the same features in similar positions
4. Reflects what the student described (to compare accuracy)

SVG REQUIREMENTS:
- viewBox="0 0 1000 700"
- If before/after: put "before" at top (y=50-300), "after" at bottom (y=400-650)
- Use <g> groups for organization
- Label everything clearly

ELEMENTS TO USE:
Trees: <circle cx="X" cy="Y" r="15" fill="[color from analysis]"/>
Buildings/Huts: <rect x="X" y="Y" width="60" height="45" fill="[color from analysis]"/>
  <text x="[center]" y="[center]" font-size="11" fill="white" text-anchor="middle">[Label]</text>
Water: <rect x="0" y="[bottom area]" width="1000" height="150" fill="#87CEEB"/>
Beach: <rect x="0" y="[above water]" width="1000" height="100" fill="#F5DEB3"/>
Pier: <rect x="X" y="Y" width="15" height="80" fill="#8B7355"/>

CRITICAL:
- Use the EXACT feature counts from the Vision analysis
- Position features in similar locations as described in the analysis
- Use the same color scheme
- If before/after, show clear differences

Output ONLY the SVG code. No markdown. No explanations.`;

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
                  content: "You create accurate SVG visualizations based on detailed image analysis. Output only SVG code, no markdown." 
                },
                { role: "user", content: svgPrompt },
              ],
              temperature: 0.2,
              max_tokens: 3000,
            }),
          });

          if (!svgRes.ok) {
            throw new Error(`SVG generation error: ${svgRes.status}`);
          }

          const svgData = await svgRes.json();
          let svgCode = svgData.choices?.[0]?.message?.content?.trim() || "";
          
          console.log("📄 SVG generated, length:", svgCode.length);
          
          // Clean thoroughly
          svgCode = svgCode
            .replace(/```svg\s*/gi, '')
            .replace(/```xml\s*/gi, '')
            .replace(/```\s*/g, '')
            .replace(/^[^<]*(<svg)/i, '$1')
            .replace(/(<\/svg>)[^>]*$/i, '$1')
            .trim();

          // Extract if needed
          const svgMatch = svgCode.match(/<svg[\s\S]*?<\/svg>/i);
          if (svgMatch) {
            svgCode = svgMatch[0];
          }

          // Validate
          if (svgCode.startsWith('<svg') && svgCode.includes('</svg>')) {
            generatedSvg = svgCode;
            console.log("✅ Vision-enhanced SVG generated:", svgCode.length, "chars");
          } else {
            console.error("❌ Invalid SVG structure");
          }

        } catch (visionError) {
          console.error("❌ Vision/SVG error:", visionError.message);
          // Continue without SVG rather than failing completely
        }

      } else {
        // MATPLOTLIB for charts (unchanged)
        console.log(`📈 Matplotlib for ${taskType}`);
        
        const codeGenPrompt = `Generate Python matplotlib code for ${taskType}:

${content}

Requirements:
- Extract ALL data accurately from description
- Use matplotlib.pyplot as plt and pandas as pd
- figsize=(10,6)
- Professional styling with grid, labels, legend
- Match colors if mentioned in description
- Return ONLY executable code`;

        const codeRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "Generate clean Python matplotlib code only." },
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
            timeoutMs: 25000
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
        asciiTable: null,
        generatedImageBase64: null,
        generatedSvg: null,
      }),
    };
  }
};
