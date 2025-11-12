// openai-proxy-task1.js
// Fixed version with proper Batch API implementation

const { Sandbox } = require('@e2b/code-interpreter');
const FormData = require('form-data');

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

    console.log(`📩 Request: ${requestType} | ${taskType} | phase=${phase || 'none'}`);

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

      console.log(`📊 Job status: ${jobData.status}`);

      if (jobData.status === "failed" || jobData.status === "expired" || jobData.status === "cancelled") {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "error",
            error: `Batch job ${jobData.status}`,
            generatedSvg: null
          })
        };
      }

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

      // Job completed - fetch results
      const fileId = jobData.output_file_id;
      console.log("📁 Fetching output file:", fileId);

      const fileRes = await fetch(`${OPENAI_API}/files/${fileId}/content`, {
        headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` }
      });

      const fileContent = await fileRes.text();
      console.log("📄 File content received, length:", fileContent.length);

      // Parse JSONL output
      const lines = fileContent.trim().split('\n');
      let svg = null;

      for (const line of lines) {
        try {
          const result = JSON.parse(line);
          if (result.response?.body?.choices?.[0]?.message?.content) {
            let content = result.response.body.choices[0].message.content;
            
            // Clean up markdown if present
            content = content.replace(/```svg\n?/g, '').replace(/```\n?/g, '').trim();
            
            // Extract SVG
            const svgMatch = content.match(/<svg[\s\S]*?<\/svg>/i);
            if (svgMatch) {
              svg = svgMatch[0];
              console.log("✅ SVG extracted successfully");
              break;
            }
          }
        } catch (parseError) {
          console.error("Failed to parse line:", parseError);
        }
      }

      if (!svg) {
        console.error("❌ No SVG found in output");
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "error",
            error: "No SVG generated",
            generatedSvg: null
          })
        };
      }

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
    // ✅ 1. FEEDBACK SECTION (for help and feedback)
    // ----------------------------------------------------------------------
    if (requestType === "help" || (requestType === "full-feedback" && !phase)) {
      const feedbackPrompt =
        requestType === "help"
          ? `You are an IELTS examiner. Give SHORT helpful hints (under 150 words) for improving this IELTS Task 1 answer:\n\n${content}`
          : `You are an IELTS Task 1 examiner. Evaluate this answer based on:
1. Task Achievement
2. Coherence and Cohesion
3. Lexical Resource
4. Grammatical Range and Accuracy

Make section titles bold with **Title**. Be specific and constructive.

ANSWER:
${content}`;

      const feedbackRes = await fetch(`${OPENAI_API}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are an experienced IELTS Writing Task 1 examiner." },
            { role: "user", content: feedbackPrompt },
          ],
        }),
      });

      const feedbackData = await feedbackRes.json();
      feedback = feedbackData.choices?.[0]?.message?.content?.trim() || "";

      console.log("✅ Feedback generated");

      return {
        statusCode: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ feedback }),
      };
    }

    // ----------------------------------------------------------------------
    // ✅ 2. MAPS — SUBMIT BATCH JOB
    // ----------------------------------------------------------------------
    if (requestType === "full-feedback" && taskType === "maps" && phase === "submit") {
      console.log("🚀 Submitting Batch Job for MAP → SVG");

      // Step 1: Create JSONL content
      const batchRequest = {
        custom_id: `map-${Date.now()}`,
        method: "POST",
        url: "/v1/chat/completions",
        body: {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are an SVG diagram generator. Output ONLY valid SVG markup with no markdown, no backticks, no explanations. The SVG should be standalone and render correctly."
            },
            {
              role: "user",
              content: `Convert this IELTS Task 1 MAP description into a clean, accurate SVG diagram.

Requirements:
- Output ONLY <svg>...</svg> markup
- Include proper viewBox
- Use clear labels
- Match the described features accurately
- Use appropriate colors if mentioned

DESCRIPTION:
${content}`
            }
          ],
          max_tokens: 4000
        }
      };

      const jsonlContent = JSON.stringify(batchRequest);
      console.log("📝 JSONL created");

      // Step 2: Upload JSONL file
      const formData = new FormData();
      formData.append('file', Buffer.from(jsonlContent), {
        filename: 'batch_input.jsonl',
        contentType: 'application/jsonl'
      });
      formData.append('purpose', 'batch');

      const uploadRes = await fetch(`${OPENAI_API}/files`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      const uploadData = await uploadRes.json();
      
      if (uploadData.error) {
        throw new Error(`File upload failed: ${uploadData.error.message}`);
      }

      const fileId = uploadData.id;
      console.log("📁 File uploaded:", fileId);

      // Step 3: Create batch job
      const batchRes = await fetch(`${OPENAI_API}/batches`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input_file_id: fileId,
          endpoint: "/v1/chat/completions",
          completion_window: "24h"
        })
      });

      const batchData = await batchRes.json();

      if (batchData.error) {
        throw new Error(`Batch creation failed: ${batchData.error.message}`);
      }

      console.log("✅ Batch job created:", batchData.id);

      return {
        statusCode: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          job_id: batchData.id,
          status: "submitted"
        })
      };
    }

    // ----------------------------------------------------------------------
    // ✅ 3. NON-MAPS — CHARTS AND TABLES
    // ----------------------------------------------------------------------
    if (requestType === "full-feedback" && taskType !== "maps") {

      // Generate feedback first
      const feedbackPrompt = `You are an IELTS Task 1 examiner. Evaluate this answer based on:
1. Task Achievement
2. Coherence and Cohesion
3. Lexical Resource
4. Grammatical Range and Accuracy

Make section titles bold with **Title**. Be specific and constructive.

ANSWER:
${content}`;

      const feedbackRes = await fetch(`${OPENAI_API}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are an experienced IELTS Writing Task 1 examiner." },
            { role: "user", content: feedbackPrompt },
          ],
        }),
      });

      const feedbackData = await feedbackRes.json();
      feedback = feedbackData.choices?.[0]?.message?.content?.trim() || "";
      console.log("✅ Feedback complete");

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
              { 
                role: "system", 
                content: "Convert descriptions into ASCII tables. Use | for borders. Be precise with data." 
              },
              { 
                role: "user", 
                content: `Create an ASCII table with borders based on this description. Output ONLY the table:\n\n${content}` 
              },
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

        const codeGenPrompt = `Extract ALL data from this IELTS Task 1 description and generate Python matplotlib code.

DESCRIPTION:
${content}

TASK TYPE: ${taskType}

REQUIREMENTS:
- Use matplotlib and pandas
- figsize=(10,6)
- Remove plt.show()
- Clean, professional style
- If colors are described, match them exactly
- Include all data points mentioned
- Return ONLY pure Python code (no markdown, no explanations)

Output the complete, executable Python code:`;

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
                content: "You convert IELTS descriptions into matplotlib code. Output ONLY executable Python code with no markdown formatting."
              },
              { role: "user", content: codeGenPrompt },
            ],
            temperature: 0.2,
          }),
        });

        const codeData = await codeRes.json();
        let pythonCode = codeData.choices?.[0]?.message?.content?.trim() || "";

        // Clean markdown formatting
        pythonCode = pythonCode
          .replace(/```python\n?/g, "")
          .replace(/```\n?/g, "")
          .replace(/plt\.show\(\)/g, "")
          .trim();

        console.log("📦 Python code generated, executing...");

        // Execute in E2B sandbox
        try {
          const sandbox = await Sandbox.create({
            apiKey: process.env.E2B_API_KEY,
            timeoutMs: 30000
          });

          const run = await sandbox.runCode(pythonCode);

          if (run.error) {
            console.error("Python execution error:", run.error);
            throw new Error(run.error.value || "Python execution failed");
          }

          // Check for PNG output
          if (run.results) {
            for (const result of run.results) {
              if (result.png) {
                generatedImageBase64 = `data:image/png;base64,${result.png}`;
                console.log("✅ Chart generated from results");
                break;
              }
            }
          }

          // Fallback: manually save figure
          if (!generatedImageBase64) {
            console.log("🔄 Using fallback save method...");
            
            const saveCode = `
import matplotlib.pyplot as plt
import io, base64

buf = io.BytesIO()
plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
buf.seek(0)
img_base64 = base64.b64encode(buf.read()).decode()
print(img_base64)
plt.close()
`;

            const saveExec = await sandbox.runCode(saveCode);

            if (saveExec.logs?.stdout?.length > 0) {
              const b64 = saveExec.logs.stdout.join("").trim();
              if (b64.length > 100) {
                generatedImageBase64 = `data:image/png;base64,${b64}`;
                console.log("✅ Chart generated via fallback");
              }
            }
          }

          await sandbox.close();
        } catch (err) {
          console.error("❌ E2B error:", err);
          // Don't throw - return feedback without chart
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
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: true,
        message: error.message,
        feedback: `Server error: ${error.message}`,
      }),
    };
  }
};
