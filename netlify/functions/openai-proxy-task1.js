// E2B Code Interpreter for matplotlib charts

const { CodeInterpreter } = require('@e2b/code-interpreter');

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
- CRITICAL: Save plot to buffer, NOT to file
- Return ONLY executable Python code, no explanations

Example structure:
import matplotlib.pyplot as plt
import pandas as pd
import io

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
plt.tight_layout()

# DO NOT include plt.show() - E2B will capture the plot automatically`;

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
          // Execute Python code in E2B sandbox
          const sandbox = await CodeInterpreter.create({
            apiKey: process.env.E2B_API_KEY,
            timeoutMs: 30000 // 30 second timeout
          });

          console.log("📦 E2B sandbox created");

          // Execute the matplotlib code
          const execution = await sandbox.notebook.execCell(pythonCode);

          // Check for errors
          if (execution.error) {
            console.error("❌ Python execution error:", execution.error);
            throw new Error(execution.error.value || "Python execution failed");
          }

          // Get the plot image from results
          if (execution.results && execution.results.length > 0) {
            for (const result of execution.results) {
              if (result.png) {
                generatedImageBase64 = `data:image/png;base64,${result.png}`;
                console.log("✅ E2B matplotlib chart generated successfully");
                break;
              }
            }
          }

          if (!generatedImageBase64) {
            console.log("⚠️ No image in results, checking for matplotlib figure");
            // Sometimes matplotlib doesn't auto-display, try to save explicitly
            const saveCode = `
import matplotlib.pyplot as plt
import io
import base64

buf = io.BytesIO()
plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
buf.seek(0)
img_base64 = base64.b64encode(buf.read()).decode('utf-8')
print(img_base64)
plt.close('all')
`;
            const saveExec = await sandbox.notebook.execCell(saveCode);
            if (saveExec.logs && saveExec.logs.stdout && saveExec.logs.stdout.length > 0) {
              const base64Data = saveExec.logs.stdout.join('').trim();
              if (base64Data) {
                generatedImageBase64 = `data:image/png;base64,${base64Data}`;
                console.log("✅ Chart extracted via explicit save");
              }
            }
          }

          // Close sandbox to free resources
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
