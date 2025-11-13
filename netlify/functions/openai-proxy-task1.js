// openai-proxy-task1.js
// PNG-first for maps via images.generate; SVG batch is fallback; tables/charts unchanged.

const { Sandbox } = require("@e2b/code-interpreter");

// Use undici's Blob/FormData only when we need multipart for batch upload
let UndiciBlob, UndiciFormData;
try {
  const undici = require("undici");
  UndiciBlob = undici.Blob;
  UndiciFormData = undici.FormData;
} catch {
  console.warn("⚠️ undici not found; using global Blob/FormData if present");
}
const useBlob = UndiciBlob || globalThis.Blob;
const useFormData = UndiciFormData || globalThis.FormData;

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const {
      content,
      requestType,
      taskType,
      imageUrl,   // (unused right now, but kept for parity)
      imageName,  // (unused)
      phase,      // "submit" for SVG fallback submit; "poll" for polling
      job_id
    } = body;

    const OPENAI_API = "https://api.openai.com/v1";
    const fetch = globalThis.fetch;

    let feedback = "";
    let asciiTable = null;
    let generatedImageBase64 = null;
    let generatedSvg = null;

    // ---------------------------
    // 0) POLL SVG BATCH (fallback)
    // ---------------------------
    if (taskType === "maps" && phase === "poll" && job_id) {
      const jobRes = await fetch(`${OPENAI_API}/batches/${job_id}`, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      });
      const jobData = await jobRes.json();

      if (["failed", "expired", "cancelled"].includes(jobData.status)) {
        return ok({ status: "error", error: `Batch job ${jobData.status}`, generatedSvg: null });
      }
      if (jobData.status !== "completed") {
        return ok({ status: jobData.status, generatedSvg: null });
      }

      // Completed: read JSONL output and extract SVG
      const fileId = jobData.output_file_id;
      const fileRes = await fetch(`${OPENAI_API}/files/${fileId}/content`, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      });
      const fileText = await fileRes.text();
      let svg = null;

      for (const line of fileText.trim().split("\n")) {
        try {
          const obj = JSON.parse(line);
          const content = obj?.response?.body?.choices?.[0]?.message?.content || "";
          const cleaned = content.replace(/```svg\n?/g, "").replace(/```\n?/g, "").trim();
          const m = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
          if (m) { svg = m[0]; break; }
        } catch { /* ignore */ }
      }

      if (!svg) return ok({ status: "error", error: "No SVG generated", generatedSvg: null });
      return ok({ status: "completed", generatedSvg: svg });
    }

    // -----------------------------------
    // 1) FEEDBACK ONLY (non-map immediate)
    // -----------------------------------
    if (requestType === "help" || (requestType === "full-feedback" && !phase && taskType !== "maps")) {
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

      const fr = await fetch(`${OPENAI_API}/chat/completions`, {
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
      const fjson = await fr.json();
      feedback = fjson?.choices?.[0]?.message?.content?.trim() || "";
      return ok({ feedback });
    }

    // --------------------------------------------------
    // 1.1) MAPS PRIMARY: PNG via images.generate (no phase)
    // --------------------------------------------------
    if (requestType === "full-feedback" && taskType === "maps" && !phase) {
      try {
        const imgPrompt = `
Create a clean, formal IELTS Writing Task 1 style educational diagram.
Two side-by-side panels labelled 'BEFORE' and 'AFTER'.
Use small, simple icons for: trees, huts, reception, restaurant, footpath, pier, beach.
Colours: blue for sea, green for land, grey for paths/roads, yellow for buildings. Minimal palette.
Very clear labels, readable text, no artistic textures, schematic layout only.
Text to visualize:
${content}`.trim();

        const ir = await fetch(`${OPENAI_API}/images/generations`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt: imgPrompt,
            size: "1024x512",
            response_format: "b64_json"
          })
        });

        if (!ir.ok) {
          // fall back to SVG
          return ok({ status: "fallback" });
        }

        const ij = await ir.json();
        const b64 = ij?.data?.[0]?.b64_json;
        if (b64) {
          return ok({
            status: "completed",
            usedPipeline: "image.generate",
            generatedImageBase64: `data:image/png;base64,${b64}`
          });
        }
        // If no image returned, ask client to fallback
        return ok({ status: "fallback" });

      } catch {
        return ok({ status: "fallback" });
      }
    }

    // -------------------------------------------
    // 2) MAPS FALLBACK: submit SVG batch (phase=submit)
    // -------------------------------------------
    if (requestType === "full-feedback" && taskType === "maps" && phase === "submit") {
      const batchRequest = {
        custom_id: `map-${Date.now()}`,
        method: "POST",
        url: "/v1/chat/completions",
        body: {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are an SVG diagram generator. Output ONLY valid SVG markup, no markdown, no backticks, no commentary."
            },
            {
              role: "user",
              content: `Convert this IELTS Task 1 map description into a clean, accurate SVG diagram.

Rules:
- Output ONLY <svg>...</svg> with a proper viewBox
- Clear labels and schematic shapes
- Use blue for sea, green for land, grey for roads/paths, yellow for buildings where applicable
- No raster images, only vector shapes

DESCRIPTION:
${content}`
            }
          ],
          max_tokens: 4000
        }
      };

      // create multipart/form-data with JSONL line (no custom boundary)
      const jsonlLine = JSON.stringify(batchRequest) + "\n";
      const form = new useFormData();
      form.append("purpose", "batch");
      form.append("file", new useBlob([jsonlLine], { type: "application/jsonl" }), "batch_input.jsonl");

      const upload = await fetch(`${OPENAI_API}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form
      });

      const ct = upload.headers.get("content-type") || "";
      const bodyText = await upload.text();
      if (!upload.ok) throw new Error(`File upload failed: ${upload.status} ${bodyText}`);

      const fileId = (ct.includes("application/json") ? JSON.parse(bodyText) : {})?.id;
      if (!fileId) throw new Error("Upload response missing file id");

      const br = await fetch(`${OPENAI_API}/batches`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input_file_id: fileId,
          endpoint: "/v1/chat/completions",
          completion_window: "24h",
          metadata: { source: "IELTS-map", type: "SVG-fallback" }
        })
      });
      const bj = await br.json();
      if (bj.error) throw new Error(bj.error.message);

      return ok({ job_id: bj.id, status: "submitted" });
    }

    // --------------------------------------
    // 3) Tables & Charts (same as your build)
    // --------------------------------------
    if (requestType === "full-feedback" && taskType !== "maps") {
      const fr = await fetch(`${OPENAI_API}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are an experienced IELTS Writing Task 1 examiner." },
            { role: "user", content: `You are an IELTS Task 1 examiner. Evaluate this answer based on:
1. Task Achievement
2. Coherence and Cohesion
3. Lexical Resource
4. Grammatical Range and Accuracy
Make section titles bold with **Title**. Be specific and constructive.

ANSWER:
${content}` },
          ],
        }),
      });
      const fj = await fr.json();
      feedback = fj?.choices?.[0]?.message?.content?.trim() || "";

      if (taskType === "table") {
        const ar = await fetch(`${OPENAI_API}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "Convert descriptions into precise ASCII tables with | borders." },
              { role: "user", content: `Output ONLY the ASCII table:\n\n${content}` },
            ],
          }),
        });
        const aj = await ar.json();
        asciiTable = aj?.choices?.[0]?.message?.content?.trim() || "";
      } else {
        // charts via e2b (unchanged)
        try {
          const cr = await fetch(`${OPENAI_API}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o",
              messages: [
                { role: "system", content: "Output ONLY executable matplotlib code. No markdown." },
                { role: "user", content: `Extract ALL data and generate matplotlib code (no plt.show()).\n\n${content}` },
              ],
              temperature: 0.2,
            }),
          });
          const cj = await cr.json();
          let code = (cj?.choices?.[0]?.message?.content || "")
            .replace(/```python\n?/g, "")
            .replace(/```\n?/g, "")
            .replace(/plt\.show\(\)/g, "")
            .trim();

          const sb = await Sandbox.create({ apiKey: process.env.E2B_API_KEY, timeoutMs: 30000 });
          const run = await sb.runCode(code);
          if (run?.results) {
            for (const r of run.results) {
              if (r.png) {
                generatedImageBase64 = `data:image/png;base64,${r.png}`;
                break;
              }
            }
          }
          if (!generatedImageBase64) {
            const save = await sb.runCode(`
import matplotlib.pyplot as plt, io, base64
buf=io.BytesIO(); plt.savefig(buf, format='png', dpi=100, bbox_inches='tight'); buf.seek(0)
print(base64.b64encode(buf.read()).decode()); plt.close()
`);
            const b64 = (save?.logs?.stdout || []).join("").trim();
            if (b64.length > 100) generatedImageBase64 = `data:image/png;base64,${b64}`;
          }
          await sb.close();
        } catch { /* ignore chart errors, return feedback only */ }
      }

      return ok({ feedback, asciiTable, generatedImageBase64, generatedSvg });
    }

    // default
    return ok({ feedback, asciiTable, generatedImageBase64, generatedSvg });

  } catch (err) {
    return fail(err);
  }
};

// helpers
function ok(obj) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(obj),
  };
}
function fail(err) {
  console.error("❌ ERROR:", err);
  return {
    statusCode: 500,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ error: true, message: err.message }),
  };
}
