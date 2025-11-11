// openai-proxy-task1.js
// Full merged version: Backup logic for non-maps + Architecture C for maps

const { Sandbox } = require('@e2b/code-interpreter');

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { 
      content, 
      requestType, 
      taskType, 
      imageUrl,
      imageName,
      phase,
      job_id
    } = body;

    if (!content || !requestType) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: true, feedback: "Missing required data." }),
      };
    }

    console.log(`📩 ${requestType} | ${taskType} | phase=${phase || 'none'}`);

    const OPENAI_API = "https://api.openai.com/v1";
    let feedback = "";
    let asciiTable = null;
    let generatedImageBase64 = null;
    let generatedSvg = null;

    // ----------------------------------------------------------------------
    // ✅ 0. MAPS — POLL BATCH JOB
    // ----------------------------------------------------------------------
    if (taskType === "maps" && phase === "poll" && job_id) {
      console.log("🔁 Polling Batch Job:", job_id);

      const jobRes = await fetch(`${OPENAI_API}/batches/${job_id}`, {
        headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` }
      });
      const jobData = await jobRes.json();

      if (jobData.status !== "completed") {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: jobData.status,
            generatedSvg: null
          })
        };
      }

      const fileId = jobData.output_file_id;
      const fileRes = await fetch(`${OPENAI_API}/files/${fileId}/content`, {
        headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` }
      });

      const svg = await fileRes.text();

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          generatedSvg: svg
        })
      };
    }

    // ----------------------------------------------------------------------
    // ✅ 1. FEEDBACK SECTION (unchanged from backup)
    // ----------------------------------------------------------------------
    const feedbackPrompt =
      requestType === "help"
        ? `IELTS examiner: Give short hints (< 150 words) for:\n\n${content}`
        : `IELTS Task 1 examiner: Evaluate on Task Achievement, Coherence/Cohesion, Lexical Resource, Grammar. Bold section titles.\n\n${content}`;

    const feedbackRes = await fetch(`${OPENAI_API}/chat/completions`, {
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

    console.log("✅ Feedback complete");

    // ----------------------------------------------------------------------
    // ✅ 2. MAPS — SUBMIT BATCH JOB (Architecture C)
    // ----------------------------------------------------------------------
    if (requestType === "full-feedback" && taskType === "maps" && phase === "submit") {
      console.log("🚀 Submitting Batch Job for MAP → SVG");

      const batchRes = await fetch(`${OPENAI_API}/batches`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input: [
            {
              model: "gpt-5",
              input: `
Convert this IELTS Task 1 MAP description into a clean SVG diagram.
Output ONLY valid <svg>...</svg> markup.

DESCRIPTION:
${content}
              `
            }
          ],
          endpoint: "/v1/chat/completions"
        })
      });

      const batchData = await batchRes.json();

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: batchData.id,
          status: "submitted"
        })
      };
    }

    // ----------------------------------------------------------------------
    // ✅ 3. NON-MAPS — RESTORE BACKUP LOGIC
    // ----------------------------------------------------------------------
    if (requestType === "full-feedback" && taskType !== "maps") {

      // ----------------------
      // 3a. ASCII TABLE
      // ----------------------
      if (taskType === "table") {
        console.log("📊 Generating ASCII Table…");

        const asciiRes = await fetch(`${OPENAI_API}/chat/completions`, {
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
        console.log("✅ ASCII table complete");
      }

      // ----------------------
      // 3b. CHARTS (matplotlib via E2B)
      // ----------------------
      else {
        console.log(`📈 Generating chart via E2B (${taskType})`);

        const codeGenPrompt = `
Extract ALL data from this IELTS Task 1 description and generate Python matplotlib code.

DESCRIPTION:
${content}

TASK TYPE: ${taskType}

REQUIREMENTS:
- matplotlib + pandas
- figsize=(10,6)
- No plt.show()
- Clean style
- If colors are described, match them.
- Return ONLY pure Python code.
`;

        const codeRes = await fetch(`${OPENAI_API}/chat/completions`, {
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
                content:
                  "You convert IELTS descriptions into matplotlib code. Output ONLY code, no backticks."
              },
              { role: "user", content: codeGenPrompt },
            ],
            temperature: 0.2,
          }),
        });

        const codeData = await codeRes.json();
        let pythonCode = codeData.choices?.[0]?.message?.content?.trim() || "";

        pythonCode = pythonCode
          .replace(/```python/g, "")
          .replace(/```/g, "")
          .replace(/plt\.show\(\)/g, "")
          .trim();

        console.log("📦 Python generated.");

        // Execute Python code
        try {
          const sandbox = await Sandbox.create({
            apiKey: process.env.E2B_API_KEY,
            timeoutMs: 30000
          });

          const run = await sandbox.runCode(pythonCode);

          if (run.error) {
            throw new Error(run.error.value || "Python execution failed");
          }

          if (run.results) {
            for (const result of run.results) {
              if (result.png) {
                generatedImageBase64 = `data:image/png;base64,${result.png}`;
              }
            }
          }

          if (!generatedImageBase64) {
            const saveCode = `
import matplotlib.pyplot as plt
import io, base64

buf = io.BytesIO()
plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
buf.seek(0)
print(base64.b64encode(buf.read()).decode())
            `;

            const saveExec = await sandbox.runCode(saveCode);

            if (saveExec.logs?.stdout?.length > 0) {
              const b64 = saveExec.logs.stdout.join("").trim();
              if (b64.length > 100) {
                generatedImageBase64 = `data:image/png;base64,${b64}`;
              }
            }
          }

          await sandbox.close();
        } catch (err) {
          console.error("❌ E2B failure:", err);
        }
      }
    }

    // ----------------------------------------------------------------------
    // ✅ FINAL RESPONSE
    // ----------------------------------------------------------------------
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
        generatedSvg
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
