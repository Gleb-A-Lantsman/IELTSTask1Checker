// FINAL OPTIMIZED VERSION - Fast and reliable

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
        // FAST SVG GENERATION using GPT-4o-mini
        console.log(`🗺️ Fast SVG generation for ${taskType}`);
        
        try {
          // Simple, concise prompt for speed
          const svgPrompt = `Create a simple SVG map from this description:

${content}

Requirements:
- Start with: <svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
- Buildings: rectangles with labels
- Trees: green circles
- Water: light blue rectangles
- Beach: tan/beige rectangles
- Keep it simple and clear

Output ONLY the SVG code. No markdown. No explanations.`;

          const svgRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini", // FAST MODEL
              messages: [
                { role: "system", content: "Generate SVG code only. No markdown." },
                { role: "user", content: svgPrompt },
              ],
              temperature: 0.3,
              max_tokens: 2000,
            }),
          });

          if (!svgRes.ok) {
            throw new Error(`OpenAI API error: ${svgRes.status}`);
          }

          const svgData = await svgRes.json();
          let svgCode = svgData.choices?.[0]?.message?.content?.trim() || "";
          
          console.log("📄 SVG response length:", svgCode.length);
          
          // Aggressive cleaning
          svgCode = svgCode
            .replace(/```svg\s*/gi, '')
            .replace(/```xml\s*/gi, '')
            .replace(/```\s*/g, '')
            .replace(/^[^<]*(<svg)/i, '$1')
            .replace(/(<\/svg>)[^>]*$/i, '$1')
            .trim();

          // Extract if buried
          const svgMatch = svgCode.match(/<svg[\s\S]*?<\/svg>/i);
          if (svgMatch) {
            svgCode = svgMatch[0];
          }

          // Validate
          if (svgCode.startsWith('<svg') && svgCode.includes('</svg>')) {
            generatedSvg = svgCode;
            console.log("✅ SVG validated:", svgCode.length, "chars");
          } else {
            console.error("❌ Invalid SVG");
          }

        } catch (svgError) {
          console.error("❌ SVG error:", svgError.message);
          // Continue without SVG
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

    // ALWAYS return valid response
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
    
    // Return valid JSON even on error
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
