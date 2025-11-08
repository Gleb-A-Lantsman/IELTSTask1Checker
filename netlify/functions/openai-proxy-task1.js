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

      } else {
        console.log(`📈 E2B matplotlib for ${taskType}`);
        
        // Generate Python code
        const codeGenPrompt = `Generate Python matplotlib code for ${taskType} from this IELTS description:

${content}

Requirements:
- Extract ALL data accurately
- Create professional ${taskType}
- Use matplotlib.pyplot as plt and pandas as pd
- Include: title, labels, legend, grid
- Style: white background, clear fonts, figsize=(10,6)
- Return ONLY executable Python code, no explanations

Example structure:
import matplotlib.pyplot as plt
import pandas as pd

# Extract data from description
data = {...}

# Create figure
fig, ax = plt.subplots(figsize=(10, 6))

# Plot data
# ... your plotting code ...

# Style
ax.grid(True, alpha=0.3)
ax.set_xlabel('...')
ax.set_ylabel('...')
ax.set_title('...')
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
            temperature: 0.3,
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

        console.log("✅ Python code generated:", pythonCode.substring(0, 150));

        try {
          // Create E2B sandbox
          const sandbox = await Sandbox.create({
            apiKey: process.env.E2B_API_KEY,
            timeoutMs: 30000
          });

          console.log("📦 E2B sandbox created");

          // Execute Python code
          const execution = await sandbox.notebook.execCell(pythonCode);

          console.log("🔍 Execution result:", JSON.stringify(execution, null, 2).substring(0, 200));

          // Check for errors
          if (execution.error) {
            console.error("❌ Python execution error:", execution.error);
            throw new Error(execution.error.value || "Python execution failed");
          }

          // Get plot from results
          if (execution.results && execution.results.length > 0) {
            for (const result of execution.results) {
              console.log("📊 Result type:", result.formats());
              
              if (result.png) {
                generatedImageBase64 = `data:image/png;base64,${result.png}`;
                console.log("✅ E2B chart generated from result.png");
                break;
              }
            }
          }

          // If no image found, try to get current matplotlib figure
          if (!generatedImageBase64) {
            console.log("⚠️ No image in results, trying to get matplotlib figure");
            
            const figureCode = `
import matplotlib.pyplot as plt
import io
import base64

# Get current figure
fig = plt.gcf()
if fig.get_axes():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close('all')
    print(img_base64)
else:
    print("NO_FIGURE")
`;

            const figExec = await sandbox.notebook.execCell(figureCode);
            
            if (figExec.logs && figExec.logs.stdout && figExec.logs.stdout.length > 0) {
              const output = figExec.logs.stdout.join('').trim();
              if (output && output !== "NO_FIGURE") {
                generatedImageBase64 = `data:image/png;base64,${output}`;
                console.log("✅ Chart extracted via matplotlib.gcf()");
              }
            }
          }

          // Close sandbox
          await sandbox.close();
          console.log("📦 E2B sandbox closed");

        } catch (e2bError) {
          console.error("❌ E2B execution failed:", e2bError.message);
          console.error("Stack trace:", e2bError.stack);
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
