// SIMPLIFIED APPROACH - Direct SVG Generation from Student Description
// No Vision API needed for maps - just use GPT to create SVG directly!

const { Sandbox } = require('@e2b/code-interpreter');

exports.handler = async (event) => {
  try {
    const { content, requestType, taskType, imageUrl, imageName } = JSON.parse(event.body || "{}");

    if (!requestType) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: true, feedback: "Missing required data." }),
      };
    }

    console.log(`📩 ${requestType} | ${taskType} | ${imageName || 'no-name'}`);

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
        model: "gpt-5",
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
            model: "gpt-5",
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
        // NEW APPROACH: Direct SVG generation from description
        console.log(`🎨 Direct SVG generation for ${taskType}`);
        
        try {
          const svgPrompt = `You are an SVG diagram generator for IELTS Task 1 practice.

STUDENT'S DESCRIPTION:
${content}

TASK: Create an accurate SVG visualization that represents what the student described.

CRITICAL INSTRUCTIONS:
1. **Parse the description carefully:**
   - If they mention "before and after", create TWO side-by-side diagrams
   - If they mention "two main areas", create TWO distinct clusters
   - Extract all spatial information (north, south, east, west, central, near X, etc.)
   - Count features mentioned (several = 5-7, many = 10+)

2. **Use emoji/Unicode for features:**
   - Trees/palms: 🌴
   - Small buildings/huts: 🏠
   - Large buildings: 🏢
   - Reception: 🏛️
   - Restaurant: 🍽️
   - Boats: ⛵
   - Paths: Dashed lines

3. **SVG structure for before/after:**
   <svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg">
     <!-- Before (top half) -->
     <g id="before">
       <text x="500" y="30" font-size="24" font-weight="bold" text-anchor="middle">Before</text>
       <rect x="50" y="50" width="900" height="300" fill="#87CEEB" rx="20"/>
       <ellipse cx="500" cy="200" rx="400" ry="130" fill="#90EE90"/>
       <!-- Features here -->
     </g>
     
     <!-- After (bottom half) -->
     <g id="after">
       <text x="500" y="380" font-size="24" font-weight="bold" text-anchor="middle">After</text>
       <rect x="50" y="400" width="900" height="300" fill="#87CEEB" rx="20"/>
       <ellipse cx="500" cy="550" rx="400" ry="130" fill="#90EE90"/>
       <!-- Features here -->
     </g>
   </svg>

4. **Positioning rules:**
   - "near beach" / "western" → x: 100-300
   - "central" → x: 400-600
   - "eastern" → x: 700-900
   - "northern" → y: 80-150 (before) or 430-500 (after)
   - "southern" → y: 250-290 (before) or 600-640 (after)

5. **Clustering:**
   If description says "two areas", create TWO visibly separated groups:
   - Group 1: Cluster elements close together (30-50px spacing)
   - Gap: Leave 150-250px between groups
   - Group 2: Cluster elements close together

6. **Colors:**
   - Water: #87CEEB (light blue)
   - Land: #90EE90 (light green)
   - Beach/sand: #F5DEB3 (wheat)
   - Paths: #8B4513 (brown) with stroke-dasharray="5,5"
   - Pier: #654321 (dark brown)

7. **Size hierarchy:**
   - Important/central buildings: font-size="30"
   - Regular buildings/huts: font-size="24"
   - Trees: font-size="20"
   - Boats: font-size="18"

RESPOND ONLY WITH VALID SVG CODE. NO MARKDOWN. NO EXPLANATIONS.`;

          const svgRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-5", // Use latest GPT-4o for best SVG generation
              messages: [
                { 
                  role: "system", 
                  content: "You are an expert SVG generator. Output only valid SVG code with no markdown formatting." 
                },
                { role: "user", content: svgPrompt },
              ],
              temperature: 0.1,
              max_tokens: 4000,
            }),
          });

          if (!svgRes.ok) {
            const errorText = await svgRes.text();
            throw new Error(`SVG generation error: ${svgRes.status} - ${errorText}`);
          }

          const svgData = await svgRes.json();
          let svgCode = svgData.choices?.[0]?.message?.content?.trim() || "";
          
          // Clean markdown formatting
          svgCode = svgCode
            .replace(/```svg\s*/gi, '')
            .replace(/```xml\s*/gi, '')
            .replace(/```\s*/g, '')
            .replace(/^[^<]*(<svg)/i, '$1')
            .replace(/(<\/svg>)[^>]*$/i, '$1')
            .trim();

          // Extract SVG
          const svgMatch = svgCode.match(/<svg[\s\S]*?<\/svg>/i);
          if (svgMatch) {
            svgCode = svgMatch[0];
          }

          if (svgCode.startsWith('<svg') && svgCode.includes('</svg>')) {
            generatedSvg = svgCode;
            console.log("✅ SVG generated:", svgCode.length, "chars");
          } else {
            console.error("❌ Invalid SVG generated");
          }

        } catch (error) {
          console.error("❌ SVG generation error:", error.message);
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
            model: "gpt-5",
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
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: true,
        feedback: "An error occurred. Please try again.",
      }),
    };
  }
};
