// DALL-E APPROACH - Fast image generation from student description
// UPDATED: Architecture C (OpenAI Batch Jobs) ONLY for MAPS

const { Sandbox } = require('@e2b/code-interpreter');
const fetch = require("node-fetch");
const OPENAI_API = "https://api.openai.com/v1";

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

    console.log(`📩 ${requestType} | ${taskType} | ${imageName || 'no-name'}`);

    let feedback = "";
    let asciiTable = null;
    let generatedImageBase64 = null;
    let generatedSvg = null;

    // --------------------------------------------------------------------
    // ✅ NEW: BATCH JOB POLLING for MAPS
    // --------------------------------------------------------------------
    if (taskType === "maps" && phase === "poll" && job_id) {
      console.log("🔁 Polling Batch Job:", job_id);

      // fetch job status
      const jobRes = await fetch(`${OPENAI_API}/batches/${job_id}`, {
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        }
      });
      const jobData = await jobRes.json();

      if (jobData.status !== "completed") {
        console.log("⏳ Job pending:", jobData.status);

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: jobData.status,
            generatedSvg: null
          })
        };
      }

      // ✅ When completed → download the output file
      const fileId = jobData.output_file_id;
      console.log("✅ Job completed. Output file:", fileId);

      const fileRes = await fetch(`${OPENAI_API}/files/${fileId}/content`, {
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        }
      });

      const text = await fileRes.text();

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          generatedSvg: text
        })
      };
    }

    // --------------------------------------------------------------------
    // ✅ Phase detection
    // For MAPS → always use job submit
    // --------------------------------------------------------------------
    if (taskType === "maps" && requestType === "full-feedback") {
      if (phase === "submit") {
        console.log("🚀 Submitting Batch Job for SVG map generation");

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
Convert the IELTS-style map description to an SVG diagram.
Output ONLY the <svg>…</svg> markup, no explanations.

Description:
${content}
                `
              }
            ],
            endpoint: "/v1/chat/completions"
          }),
        });

        const batchData = await batchRes.json();
        console.log("✅ Job submitted:", batchData.id);

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id: batchData.id,
            status: "submitted"
          })
        };
      }
    }

    // --------------------------------------------------------------------
    // ✅ FEEDBACK (UNCHANGED)
    // --------------------------------------------------------------------
    if (!requestType) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: true, feedback: "Missing required data." })
      };
    }

    if (!content) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: true, feedback: "Missing content." })
      };
    }

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

    console.log("✅ Feedback done");

    // --------------------------------------------------------------------
    // ✅ VISUALIZATION (UNTOUCHED FOR EVERYTHING EXCEPT MAPS)
    // --------------------------------------------------------------------

    if (requestType === "full-feedback") {

      // ✅ TABLE → unchanged
      if (taskType === "table") {
        /* … existing table code … */
      }

      // ✅ FLOWCHART → unchanged
      else if (taskType === "flowchart") {
        /* … existing flowchart code … */
      }

      // ✅ MAPS → handled by Batch Job (SVG)
      else if (taskType === "maps") {
        console.log("✅ SVG handled asynchronously by Batch Jobs");
      }

      // ✅ CHARTS → unchanged
      else {
        /* … existing Python/matplotlib code … */
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
        generatedSvg
      })
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
        feedback: "An error occurred. Please try again."
      })
    };
  }
};
