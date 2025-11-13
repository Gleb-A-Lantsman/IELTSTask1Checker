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
      
      if (!jobRes.ok) {
        return ok({ status: "error", error: `Failed to fetch batch status: ${jobRes.status}`, generatedSvg: null });
      }
      
      const jobData = await jobRes.json();

      if (["failed", "expired", "cancelled"].includes(jobData.status)) {
        return ok({ status: "error", error: `Batch job ${jobData.status}`, generatedSvg: null });
      }
      if (jobData.status !== "completed") {
        return ok({ status: jobData.status, generatedSvg: null });
      }

      // Completed: read JSONL output and extract SVG
      const fileId = jobData.output_file_id;
      if (!fileId) {
        return ok({ status: "error", error: "No output file ID from batch", generatedSvg: null });
      }
      
      const fileRes = await fetch(`${OPENAI_API}/files/${fileId}/content`, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      });
      
      if (!fileRes.ok) {
        return ok({ status: "error", error: "Failed to fetch output file", generatedSvg: null });
      }
      
      const fileText = await fileRes.text();
      let svg = null;

      for (const line of fileText.trim().split("\n")) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          const content = obj?.response?.body?.choices?.[0]?.message?.content || "";
          const cleaned = content.replace(/```svg\n?/g, "").replace(/```\n?/g, "").trim();
          const m = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
          if (m) { 
            svg = m[0]; 
            break; 
          }
        } catch (parseErr) {
          console.warn("Failed to parse JSONL line:", parseErr);
        }
      }

      if (!svg) {
        return ok({ status: "error", error: "No SVG found in batch output", generatedSvg: null });
      }
      
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
          temperature: 0.7,
        }),
      });
      
      if (!fr.ok) {
        throw new Error(`OpenAI API failed: ${fr.status}`);
      }
      
      const fjson = await fr.json();
      feedback = fjson?.choices?.[0]?.message?.content?.trim() || "Unable to generate feedback.";
      return ok({ feedback });
    }

    // --------------------------------------------------
    // 1.1) MAPS PRIMARY: PNG via images.generate (no phase)
    // --------------------------------------------------
    if (requestType === "full-feedback" && taskType === "maps" && !phase) {
      console.log("🖼️ Attempting PNG generation via ChatGPT...");
      
      try {
        // First, get feedback text
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
              { role: "user", content: `You are an IELTS Task 1 examiner. Evaluate this map description based on:
1. Task Achievement
2. Coherence and Cohesion
3. Lexical Resource
4. Grammatical Range and Accuracy

Make section titles bold with **Title**. Be specific and constructive.

ANSWER:
${content}` },
            ],
            temperature: 0.7,
          }),
        });
        
        if (feedbackRes.ok) {
          const feedbackJson = await feedbackRes.json();
          feedback = feedbackJson?.choices?.[0]?.message?.content?.trim() || "";
        }

        // Attempt PNG generation
        const imgPrompt = `Create a simple, schematic diagram showing a map transformation with two panels labeled 'BEFORE' and 'AFTER'.

Style requirements:
- Clean, educational diagram style (not photorealistic)
- Simple geometric shapes for buildings, paths, and natural features
- Clear labels for all elements
- Use basic colors: blue for water, green for vegetation, grey for paths/roads, yellow/beige for buildings
- Top-down view, schematic layout
- Readable text labels

Based on this description:
${content.substring(0, 800)}`;

        const ir = await fetch(`${OPENAI_API}/images/generations`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt: imgPrompt,
            size: "1024x1024",
            quality: "standard",
            response_format: "b64_json",
            n: 1
          })
        });

        if (!ir.ok) {
          const errorText = await ir.text();
          console.warn(`⚠️ ChatGPT failed (${ir.status}): ${errorText}`);
          // Signal fallback needed without throwing
          return ok({ 
            status: "error", 
            error: "PNG generation failed",
            message: "Falling back to SVG batch processing"
          });
        }

        const ij = await ir.json();
        const b64 = ij?.data?.[0]?.b64_json;
        
        if (b64) {
          console.log("✅ PNG generated successfully");
          return ok({
            status: "completed",
            usedPipeline: "gpt-image-1",
            feedback: feedback || "**Task Achievement**: Map visualization generated successfully.",
            generatedImageBase64: `data:image/png;base64,${b64}`
          });
        }
        
        // No image in response
        console.warn("⚠️ ChatGPT response missing image data");
        return ok({ 
          status: "error",
          error: "No image data in response",
          message: "Falling back to SVG batch processing"
        });

      } catch (pngError) {
        console.error("❌ PNG generation error:", pngError.message);
        // Return error status to trigger fallback
        return ok({ 
          status: "error",
          error: pngError.message,
          message: "Falling back to SVG batch processing"
        });
      }
    }

    // -------------------------------------------
    // 2) MAPS FALLBACK: submit SVG batch (phase=submit)
    // -------------------------------------------
    if (requestType === "full-feedback" && taskType === "maps" && phase === "submit") {
      console.log("📦 Submitting SVG batch job (fallback)...");
      
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
- Output ONLY <svg>...</svg> with a proper viewBox (e.g., viewBox="0 0 800 600")
- Create two side-by-side panels for BEFORE and AFTER
- Use clear labels and simple geometric shapes
- Use blue for sea/water, green for land/vegetation, grey for roads/paths, yellow for buildings
- Include a legend if helpful
- No raster images, only vector shapes (rect, circle, path, text, etc.)
- Make text readable (font-size at least 14)

DESCRIPTION:
${content}`
            }
          ],
          max_tokens: 4000,
          temperature: 0.3
        }
      };

      try {
        // Create multipart/form-data with JSONL line
        const jsonlLine = JSON.stringify(batchRequest) + "\n";
        const form = new useFormData();
        form.append("purpose", "batch");
        form.append("file", new useBlob([jsonlLine], { type: "application/jsonl" }), "batch_input.jsonl");

        const upload = await fetch(`${OPENAI_API}/files`, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: form
        });

        const bodyText = await upload.text();
        
        if (!upload.ok) {
          throw new Error(`File upload failed: ${upload.status} ${bodyText}`);
        }

        let uploadData;
        try {
          uploadData = JSON.parse(bodyText);
        } catch {
          throw new Error("Invalid JSON response from file upload");
        }

        const fileId = uploadData?.id;
        if (!fileId) {
          throw new Error("Upload response missing file id");
        }

        console.log(`✅ File uploaded: ${fileId}`);

        // Create batch job
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
        
        if (!br.ok) {
          const errorText = await br.text();
          throw new Error(`Batch creation failed: ${br.status} ${errorText}`);
        }
        
        const bj = await br.json();
        
        if (bj.error) {
          throw new Error(bj.error.message || "Batch creation error");
        }
        
        if (!bj.id) {
          throw new Error("Batch response missing job ID");
        }

        console.log(`✅ Batch job created: ${bj.id}`);
        return ok({ job_id: bj.id, status: "submitted" });
        
      } catch (batchError) {
        console.error("❌ Batch submission error:", batchError);
        throw batchError;
      }
    }

    // --------------------------------------
    // 3) Tables & Charts (E2B sandbox)
    // --------------------------------------
    if (requestType === "full-feedback" && taskType !== "maps") {
      // Get feedback first
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
            { 
              role: "user", 
              content: `You are an IELTS Task 1 examiner. Evaluate this answer based on:
1. Task Achievement
2. Coherence and Cohesion
3. Lexical Resource
4. Grammatical Range and Accuracy

Make section titles bold with **Title**. Be specific and constructive.

ANSWER:
${content}` 
            },
          ],
          temperature: 0.7,
        }),
      });
      
      if (!fr.ok) {
        throw new Error(`Feedback API failed: ${fr.status}`);
      }
      
      const fj = await fr.json();
      feedback = fj?.choices?.[0]?.message?.content?.trim() || "Unable to generate feedback.";

      // Handle tables
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
              { 
                role: "system", 
                content: "You are an ASCII table generator. Convert descriptions into precise ASCII tables using | borders and proper alignment. Output ONLY the table, no explanations." 
              },
              { 
                role: "user", 
                content: `Create an ASCII table based on this description. Use | for borders and align columns properly:\n\n${content}` 
              },
            ],
            temperature: 0.3,
          }),
        });
        
        if (ar.ok) {
          const aj = await ar.json();
          asciiTable = aj?.choices?.[0]?.message?.content?.trim() || "";
        }
        
      } else {
        // Handle charts via E2B
        let sandbox = null;
        try {
          // Generate Python code
          const cr = await fetch(`${OPENAI_API}/chat/completions`, {
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
                  content: "You are a Python matplotlib code generator. Output ONLY executable Python code, no markdown, no explanations, no ```python blocks. Do NOT include plt.show()." 
                },
                { 
                  role: "user", 
                  content: `Extract ALL data from this description and generate clean matplotlib code to recreate the chart. 
                  
Requirements:
- Import necessary libraries (matplotlib.pyplot as plt, numpy as np if needed)
- Extract all numerical data accurately
- Choose appropriate chart type (${taskType})
- Add title, axis labels, and legend where appropriate
- Use clear colors and styling
- DO NOT include plt.show()
- Save figure using plt.savefig() is optional

Description:
${content}` 
                },
              ],
              temperature: 0.2,
            }),
          });
          
          if (!cr.ok) {
            console.warn(`Code generation failed: ${cr.status}`);
          } else {
            const cj = await cr.json();
            let code = (cj?.choices?.[0]?.message?.content || "")
              .replace(/```python\n?/g, "")
              .replace(/```\n?/g, "")
              .replace(/plt\.show\(\)/g, "")
              .trim();

            if (code) {
              // Create sandbox and run code
              sandbox = await Sandbox.create({ 
                apiKey: process.env.E2B_API_KEY, 
                timeoutMs: 30000 
              });
              
              console.log("Running matplotlib code...");
              const run = await sandbox.runCode(code);
              
              // Check for PNG output
              if (run?.results) {
                for (const r of run.results) {
                  if (r.png) {
                    generatedImageBase64 = `data:image/png;base64,${r.png}`;
                    console.log("✅ Chart generated from results");
                    break;
                  }
                }
              }
              
              // Fallback: explicitly save figure
              if (!generatedImageBase64) {
                console.log("No PNG in results, trying explicit save...");
                const saveCode = `
import matplotlib.pyplot as plt
import io
import base64

buf = io.BytesIO()
plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
buf.seek(0)
print(base64.b64encode(buf.read()).decode())
plt.close()
`;
                const save = await sandbox.runCode(saveCode);
                const b64 = (save?.logs?.stdout || []).join("").trim();
                if (b64 && b64.length > 100) {
                  generatedImageBase64 = `data:image/png;base64,${b64}`;
                  console.log("✅ Chart generated via explicit save");
                }
              }
              
              // Check for errors
              if (run?.error) {
                console.error("Code execution error:", run.error);
              }
            }
          }
        } catch (chartError) {
          console.error("Chart generation error:", chartError);
          // Continue anyway, will return feedback without chart
        } finally {
          // Always close sandbox
          if (sandbox) {
            try {
              await sandbox.close();
              console.log("Sandbox closed");
            } catch (closeErr) {
              console.error("Failed to close sandbox:", closeErr);
            }
          }
        }
      }

      return ok({ feedback, asciiTable, generatedImageBase64, generatedSvg });
    }

    // Default fallback
    return ok({ 
      feedback: "No operation matched your request.",
      asciiTable, 
      generatedImageBase64, 
      generatedSvg 
    });

  } catch (err) {
    console.error("❌ HANDLER ERROR:", err);
    return fail(err);
  }
};

// Helper functions
function ok(obj) {
  return {
    statusCode: 200,
    headers: { 
      "Content-Type": "application/json", 
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(obj),
  };
}

function fail(err) {
  console.error("❌ ERROR:", err);
  return {
    statusCode: 500,
    headers: { 
      "Content-Type": "application/json", 
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify({ 
      error: true, 
      message: err.message || "Internal server error",
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }),
  };
}
