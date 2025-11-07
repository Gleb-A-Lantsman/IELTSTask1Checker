export const handler = async (event) => {
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
        console.log(`📈 Python chart for ${taskType}`);
        
        // Generate Python code
        const codeGenPrompt = `Generate EXECUTABLE Python code for matplotlib chart from this IELTS description.

TASK: ${taskType}
DATA: ${content}

CRITICAL REQUIREMENTS:
1. Extract ALL numbers, categories, and labels from the description
2. Create ${taskType} that matches the data EXACTLY
3. Use professional styling: white background, grid, clear labels, legend
4. Output base64 between markers: BASE64_START and BASE64_END
5. NO explanations, NO comments outside code, ONLY executable Python

EXACT template to follow:
\`\`\`python
import matplotlib.pyplot as plt
import pandas as pd
import io
import base64
import sys

# Parse data from description above
# Example: data = {'Year': [1988, 2000, 2030], 'Germany': [20, 21, 30], ...}

# Create figure
fig, ax = plt.subplots(figsize=(10, 6))

# Create your chart here (line plot, bar chart, etc.)
# Example for line graph:
# for country in countries:
#     ax.plot(years, values[country], marker='o', label=country)

# Styling
ax.grid(True, alpha=0.3, linestyle='--')
ax.set_xlabel('X Label', fontsize=11)
ax.set_ylabel('Y Label', fontsize=11)
ax.set_title('Chart Title', fontsize=13, fontweight='bold')
ax.legend(loc='best')
plt.tight_layout()

# Export - DO NOT MODIFY THIS SECTION
buf = io.BytesIO()
plt.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor='white')
buf.seek(0)
img_b64 = base64.b64encode(buf.read()).decode('utf-8')
sys.stdout.write(f"BASE64_START{img_b64}BASE64_END")
sys.stdout.flush()
plt.close()
\`\`\`

CRITICAL: Use sys.stdout.write() NOT print() for the base64 output.
Return ONLY the Python code, no markdown, no explanations.`;

        const codeRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "Expert Python matplotlib developer. Output only code." },
              { role: "user", content: codeGenPrompt },
            ],
            temperature: 0.3,
          }),
        });

        const codeData = await codeRes.json();
        let pythonCode = codeData.choices?.[0]?.message?.content?.trim() || "";
        
        // Clean code - remove markdown and explanations
        pythonCode = pythonCode
          .replace(/```python\n?/g, '')
          .replace(/```\n?/g, '')
          .replace(/^#.*$/gm, '')  // Remove comment-only lines
          .trim();

        // Validate code has required components
        if (!pythonCode.includes('BASE64_START') || !pythonCode.includes('BASE64_END')) {
          console.error("Generated code missing BASE64 markers!");
          pythonCode += `\n
# Fallback base64 output
buf = io.BytesIO()
plt.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor='white')
buf.seek(0)
img_b64 = base64.b64encode(buf.read()).decode('utf-8')
sys.stdout.write(f"BASE64_START{img_b64}BASE64_END")
sys.stdout.flush()
plt.close()
`;
        }

        console.log("✅ Python code generated:", pythonCode.substring(0, 200));

        try {
          // Execute Python code
          const base64Image = await executePython(pythonCode);
          generatedImageBase64 = `data:image/png;base64,${base64Image}`;
          console.log("✅ Python execution success");
        } catch (execError) {
          console.error("❌ Python execution failed:", execError.message);
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

/**
 * Execute Python code and return base64 image
 * Using E2B Code Interpreter API
 */
async function executePython(code) {
  const E2B_API_KEY = process.env.E2B_API_KEY;
  
  if (!E2B_API_KEY) {
    throw new Error("E2B_API_KEY not configured. Sign up at https://e2b.dev");
  }

  try {
    // Create sandbox
    const createRes = await fetch("https://api.e2b.dev/sandboxes", {
      method: "POST",
      headers: {
        "X-API-Key": E2B_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template: "base", // Python 3.11 with common packages
      }),
    });

    const sandbox = await createRes.json();
    const sandboxId = sandbox.sandboxId;

    // Execute code
    const execRes = await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}/commands`, {
      method: "POST",
      headers: {
        "X-API-Key": E2B_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        command: "python3",
        args: ["-u", "-c", code],  // -u for unbuffered output
      }),
    });

    const result = await execRes.json();
    
    console.log("E2B execution result:", {
      stdout: result.stdout?.substring(0, 100),
      stderr: result.stderr?.substring(0, 200),
      exitCode: result.exitCode
    });

    // Clean up sandbox
    await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}`, {
      method: "DELETE",
      headers: { "X-API-Key": E2B_API_KEY },
    });

    // Check for errors first
    if (result.exitCode !== 0) {
      throw new Error(`Python execution failed: ${result.stderr || 'Unknown error'}`);
    }

    // Extract base64 from output
    const output = result.stdout || "";
    const match = output.match(/BASE64_START([A-Za-z0-9+/=]+)BASE64_END/);
    
    if (match && match[1]) {
      console.log("✅ Base64 extracted, length:", match[1].length);
      return match[1];
    }

    // If no match, log what we got
    console.error("Failed to extract base64. Output:", output.substring(0, 500));
    throw new Error(`No base64 output found. Got: ${output.substring(0, 100)}`);

  } catch (error) {
    console.error("E2B execution error:", error);
    throw new Error(`Python execution failed: ${error.message}`);
  }
}
