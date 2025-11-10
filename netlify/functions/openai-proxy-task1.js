// E2B Code Interpreter with ROBUST SVG validation

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
        // SVG GENERATION with robust cleaning
        console.log(`🗺️ SVG generation for ${taskType}`);
        
        const svgPrompt = `Create an SVG visualization for this IELTS Task 1 ${taskType}:

${content}

CRITICAL REQUIREMENTS:
1. Start with <svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg">
2. End with </svg>
3. Use professional layout and colors
4. Include clear labels and compass
5. For before/after maps, show both side-by-side or top-bottom

COLOR PALETTE:
- Water: #87CEEB
- Land/Beach: #F5DEB3
- Buildings: #8B4513 or #1E4D7B
- Trees: #228B22
- Text: #333 or white on dark backgrounds

LAYOUT:
- Buildings as rectangles (rx="3" for rounded corners)
- Trees as circles
- Water as large rectangles at bottom
- Clear spacing between elements (20-30px)
- Font: Arial, sizes 12-24px

Return ONLY the SVG code. NO explanations. NO markdown. NO backticks. Just pure SVG starting with <svg and ending with </svg>.`;

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
                content: "You generate SVG code ONLY. Never use markdown formatting. Output pure SVG starting with <svg> tag." 
              },
              { role: "user", content: svgPrompt },
            ],
            temperature: 0.3,
          }),
        });

        const svgData = await svgRes.json();
        let svgCode = svgData.choices?.[0]?.message?.content?.trim() || "";
        
        console.log("📄 Raw SVG response (first 200 chars):", svgCode.substring(0, 200));
        
        // AGGRESSIVE cleaning - remove ALL markdown formatting
        svgCode = svgCode
          // Remove markdown code blocks
          .replace(/```svg\s*/gi, '')
          .replace(/```xml\s*/gi, '')
          .replace(/```html\s*/gi, '')
          .replace(/```\s*/g, '')
          // Remove any leading/trailing text before <svg
          .replace(/^[^<]*(<svg)/i, '$1')
          // Remove any trailing text after </svg>
          .replace(/(<\/svg>)[^>]*$/i, '$1')
          .trim();

        console.log("🧹 Cleaned SVG (first 200 chars):", svgCode.substring(0, 200));
        
        // Validate SVG
        const svgValid = svgCode.startsWith('<svg') && svgCode.includes('</svg>');
        
        if (svgValid) {
          generatedSvg = svgCode;
          console.log("✅ SVG validated and ready");
          console.log("📏 SVG length:", svgCode.length);
        } else {
          console.error("❌ Invalid SVG structure");
          console.error("Starts with:", svgCode.substring(0, 50));
          console.error("Ends with:", svgCode.substring(svgCode.length - 50));
          
          // Try to extract SVG if it's buried in text
          const svgMatch = svgCode.match(/<svg[\s\S]*?<\/svg>/i);
          if (svgMatch) {
            generatedSvg = svgMatch[0];
            console.log("✅ Extracted SVG from response");
          }
        }

      } else {
        // MATPLOTLIB for charts
        console.log(`📈 Matplotlib for ${taskType}`);
        
        const codeGenPrompt = `Generate Python matplotlib code for ${taskType} from this IELTS description:

${content}

REQUIREMENTS:
- Extract ALL data accurately
- Create professional ${taskType}
- Use matplotlib.pyplot as plt and pandas as pd
- Include: title, labels, legend, grid
- Style: white background, clear fonts, figsize=(10,6)
- Match colors if mentioned
- Return ONLY executable Python code

Example:
import matplotlib.pyplot as plt
import pandas as pd

data = {...}
fig, ax = plt.subplots(figsize=(10, 6))
ax.plot(data['x'], data['y'], color='blue', marker='o', label='Series')
ax.grid(True, alpha=0.3)
ax.set_xlabel('X')
ax.set_ylabel('Y')
ax.set_title('Title')
ax.legend()
plt.tight_layout()`;

        const codeRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "Generate clean Python matplotlib code. Output only code." },
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
            timeoutMs: 30000
          });

          const execution = await sandbox.runCode(pythonCode);

          if (execution.error) {
            throw new Error(execution.error.value || "Python execution failed");
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
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: true,
        feedback: `Error: ${error.message}`,
      }),
    };
  }
};
