// E2B Code Interpreter with SVG support for maps/diagrams

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
        // SVG GENERATION for maps and flowcharts
        console.log(`🗺️ SVG generation for ${taskType}`);
        
        const svgPrompt = `Generate an SVG visualization for this IELTS Task 1 ${taskType} description:

${content}

REQUIREMENTS:
- Create a complete, valid SVG with viewBox
- Use clear shapes: rectangles, circles, paths, text
- Include labels for all locations/elements
- Use professional colors (blues, greens, grays)
- Make it visually clear and organized
- Size: viewBox="0 0 800 600" or similar
- Add a title at the top

For MAPS:
- Show buildings as rectangles with labels
- Use different colors for different zones
- Include roads/paths as lines or rectangles
- Add compass direction if mentioned
- Show water as blue areas

For FLOWCHARTS:
- Use rectangles for processes
- Use arrows to show flow
- Label each step clearly
- Use consistent spacing

Return ONLY the complete SVG code, starting with <svg> and ending with </svg>.
NO explanations, NO markdown backticks.`;

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
                content: "You are an expert at creating SVG visualizations. Generate clean, valid SVG code only. No markdown, no explanations." 
              },
              { role: "user", content: svgPrompt },
            ],
            temperature: 0.3,
          }),
        });

        const svgData = await svgRes.json();
        let svgCode = svgData.choices?.[0]?.message?.content?.trim() || "";
        
        // Clean SVG code
        svgCode = svgCode
          .replace(/```svg\n?/g, '')
          .replace(/```xml\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();

        if (svgCode.startsWith('<svg')) {
          generatedSvg = svgCode;
          console.log("✅ SVG generated");
        }

      } else {
        // MATPLOTLIB for charts (line-graph, bar-chart, pie-chart)
        console.log(`📈 Matplotlib for ${taskType}`);
        
        const codeGenPrompt = `Generate Python matplotlib code for ${taskType} from this IELTS description:

${content}

REQUIREMENTS:
- Extract ALL data accurately
- Create professional ${taskType}
- Use matplotlib.pyplot as plt and pandas as pd
- Include: title, labels, legend, grid
- Style: white background, clear fonts, figsize=(10,6)
- Match colors if mentioned in description
- Return ONLY executable Python code, no explanations

Example structure:
import matplotlib.pyplot as plt
import pandas as pd

# Extract data
data = {...}

# Create figure
fig, ax = plt.subplots(figsize=(10, 6))

# Plot with colors
ax.plot(data['x'], data['y'], color='blue', marker='o', label='Series')

# Styling
ax.grid(True, alpha=0.3)
ax.set_xlabel('X Label')
ax.set_ylabel('Y Label')
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
              { role: "system", content: "Generate clean Python matplotlib code. Output only code, no markdown." },
              { role: "user", content: codeGenPrompt },
            ],
            temperature: 0.2,
          }),
        });

        const codeData = await codeRes.json();
        let pythonCode = codeData.choices?.[0]?.message?.content?.trim() || "";
        
        // Clean code
        pythonCode = pythonCode
          .replace(/```python\n?/g, '')
          .replace(/```\n?/g, '')
          .replace(/plt\.show\(\)/g, '')
          .trim();

        console.log("✅ Python code generated");

        try {
          const sandbox = await Sandbox.create({
            apiKey: process.env.E2B_API_KEY,
            timeoutMs: 30000
          });

          console.log("📦 E2B sandbox created");

          const execution = await sandbox.runCode(pythonCode);

          if (execution.error) {
            console.error("❌ Python error:", execution.error);
            throw new Error(execution.error.value || "Python execution failed");
          }

          if (execution.results && execution.results.length > 0) {
            for (const result of execution.results) {
              if (result.png) {
                generatedImageBase64 = `data:image/png;base64,${result.png}`;
                console.log("✅ Matplotlib chart generated");
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
                console.log("✅ Chart via explicit save");
              }
            }
          }

          await sandbox.close();
          console.log("📦 E2B sandbox closed");

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
        generatedSvg,  // NEW: SVG for maps/flowcharts
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
