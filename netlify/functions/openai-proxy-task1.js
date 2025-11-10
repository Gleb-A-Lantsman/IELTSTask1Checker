// IMPROVED SVG Generation - Better quality and proper display

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
        // IMPROVED SVG GENERATION
        console.log(`🗺️ SVG generation for ${taskType}`);
        
        const svgPrompt = `You are creating an SVG visualization for an IELTS Task 1 ${taskType}.

DESCRIPTION TO VISUALIZE:
${content}

CRITICAL SVG REQUIREMENTS:

1. STRUCTURE:
   - Start with: <svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg">
   - End with: </svg>
   - Use clean, organized groups with <g> tags

2. LAYOUT (for maps):
   - Use a top-down or side-by-side layout showing different time periods if applicable
   - Add clear title/year labels for each section
   - Place compass (N arrow) in top-right corner
   - Use consistent scale between sections

3. VISUAL ELEMENTS:
   - Buildings: Use <rect> with rounded corners (rx="3")
   - Water/Sea: Use light blue (#87CEEB or #B8D4E8)
   - Land/Beach: Use tan/beige (#F5DEB3 or #F0E68C)
   - Trees: Use <circle> with green (#228B22 or #32CD32)
   - Roads/Paths: Use gray rectangles (#999 or #CCC)
   - Compass: Simple cross with "N" label

4. COLORS:
   - Buildings: Brown (#8B4513), dark blue (#1E4D7B), or gray (#666)
   - Labels: White text on dark backgrounds, or dark gray (#333) on light
   - Water: Light blue (#87CEEB)
   - Land: Beige/tan (#F5DEB3)
   - Trees: Green (#228B22)

5. TEXT:
   - Font: Arial or sans-serif
   - Building labels: 14-16px, white on dark background
   - Section titles: 24px, bold
   - Feature labels: 12px

6. PROPORTIONS:
   - Make buildings appropriately sized (50x40 to 120x80)
   - Leave adequate spacing between elements (20-30px minimum)
   - Use realistic proportions

7. FOR "BEFORE/AFTER" MAPS:
   - Place two maps side-by-side or top-bottom
   - Label clearly: "1967" and "Now" or "Before" and "After"
   - Keep same scale and orientation
   - Show what changed, what stayed the same

EXAMPLE STRUCTURE FOR A MAP:
<svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg">
  <!-- Title -->
  <text x="500" y="30" font-size="24" font-weight="bold" text-anchor="middle" fill="#333">
    Location Name (Year)
  </text>
  
  <!-- Compass -->
  <g transform="translate(950, 80)">
    <line x1="0" y1="-20" x2="0" y2="20" stroke="#333" stroke-width="2"/>
    <line x1="-20" y1="0" x2="20" y2="0" stroke="#333" stroke-width="2"/>
    <text x="5" y="-25" font-size="16" font-weight="bold">N</text>
  </g>
  
  <!-- Water -->
  <rect x="0" y="550" width="1000" height="150" fill="#87CEEB"/>
  <text x="500" y="630" font-size="16" text-anchor="middle" fill="#333">Sea</text>
  
  <!-- Land -->
  <rect x="0" y="450" width="1000" height="100" fill="#F5DEB3"/>
  
  <!-- Building example -->
  <rect x="200" y="250" width="80" height="60" fill="#8B4513" rx="3"/>
  <text x="240" y="285" font-size="14" fill="white" text-anchor="middle" font-weight="bold">Hotel</text>
  
  <!-- Tree example -->
  <circle cx="350" cy="280" r="25" fill="#228B22"/>
</svg>

Return ONLY the complete, valid SVG code. NO markdown, NO explanations, NO backticks.`;

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
                content: "You are an expert SVG designer creating clean, professional map visualizations for IELTS students. Output ONLY valid SVG code with no markdown formatting." 
              },
              { role: "user", content: svgPrompt },
            ],
            temperature: 0.3,
          }),
        });

        const svgData = await svgRes.json();
        let svgCode = svgData.choices?.[0]?.message?.content?.trim() || "";
        
        // Clean SVG code thoroughly
        svgCode = svgCode
          .replace(/```svg\s*/g, '')
          .replace(/```xml\s*/g, '')
          .replace(/```\s*/g, '')
          .trim();

        // Validate it starts with <svg
        if (svgCode.startsWith('<svg')) {
          generatedSvg = svgCode;
          console.log("✅ SVG generated successfully");
        } else {
          console.error("❌ Invalid SVG code generated");
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
