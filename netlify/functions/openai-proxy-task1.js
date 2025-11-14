// openai-proxy-task1.js
// PNG first (120s timeout), ASCII fallback, Upstash for both

const { Sandbox } = require("@e2b/code-interpreter");
const { Redis } = require("@upstash/redis");

// Initialize Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Job status types
const JobStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// Emoji dictionary for map features
const MAP_EMOJIS = {
  // Natural
  "river": "🌊", "lake": "💧", "pond": "💦",
  "woodland": "🌲", "forest": "🌲", "park": "🌳",
  "garden": "🌸", "farmland": "🌾", "beach": "🏖️",
  "tree": "🌳", "trees": "🌳",
  
  // Water
  "sea": "🌊", "ocean": "🌊", "water": "💧",
  
  // Buildings
  "housing": "🏠", "house": "🏠", "apartments": "🏢",
  "hotel": "🏨", "restaurant": "🍽️", "cafe": "☕",
  "shop": "🏬", "shops": "🏬", "supermarket": "🛒",
  "market": "🛍️", "office": "🏢", "factory": "🏭",
  "warehouse": "🏚️", "post_office": "📮", "bank": "🏦",
  "community_centre": "🏛️",
  
  // Institutional
  "school": "🏫", "university": "🎓", "hospital": "🏥",
  "museum": "🖼️", "library": "📚", "theatre": "🎭",
  "cinema": "🎞️",
  
  // Transport
  "road": "⬛", "path": "⬛", "bridge": "🌉",
  "railway": "🚆", "pier": "🛳️", "airport": "✈️",
  "car_park": "🅿️",
  
  // Recreation
  "stadium": "⚽", "tennis": "🎾", "tennis_court": "🎾",
  "golf": "⛳", "golf_course": "⛳", "play_area": "🛝",
  "fountain": "💦", "amphitheatre": "🎶",
  
  // Tourism
  "accommodation": "🛖", "reception": "🪪",
  "hut": "🛖", "huts": "🛖",
  
  // Compass
  "north": "⬆️", "south": "⬇️", "east": "➡️", "west": "⬅️",
  
  // Default
  "default": "⬜"
};

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

    const OPENAI_API = "https://api.openai.com/v1";
    const fetch = globalThis.fetch;

    // ---------------------------
    // 0) POLL ANY JOB (PNG or ASCII)
    // ---------------------------
    if (phase === "poll" && job_id) {
      console.log(`🔍 Polling job: ${job_id}`);
      
      const jobData = await redis.get(job_id);
      
      if (!jobData) {
        return ok({ 
          status: "error", 
          error: "Job not found",
          message: "Job may have expired or invalid job_id"
        });
      }

      const job = typeof jobData === 'string' ? JSON.parse(jobData) : jobData;

      // Return current status for any job type
      if (job.status === JobStatus.PROCESSING || job.status === JobStatus.PENDING) {
        return ok({ status: job.status });
      }

      if (job.status === JobStatus.COMPLETED) {
        return ok({ 
          status: "completed", 
          ...job.result,
          feedback: job.feedback
        });
      }

      if (job.status === JobStatus.FAILED) {
        return ok({ 
          status: "error", 
          error: job.error || "Job failed"
        });
      }

      return ok({ status: job.status });
    }

    // -----------------------------------
    // 1) FEEDBACK ONLY (quick help)
    // -----------------------------------
    if (requestType === "help") {
      const feedbackPrompt = `You are an IELTS examiner. Give SHORT helpful hints (under 150 words) for improving this IELTS Task 1 answer:\n\n${content}`;

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
      const feedback = fjson?.choices?.[0]?.message?.content?.trim() || "Unable to generate feedback.";
      return ok({ feedback });
    }

    // --------------------------------------------------
    // 2) MAPS - SUBMIT PNG JOB (async, 2x timeout)
    // --------------------------------------------------
    if (requestType === "full-feedback" && taskType === "maps" && phase === "submit") {
      console.log("🖼️ Submitting async PNG generation job...");
      
      const job_id = `png-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Create job entry
      const job = {
        id: job_id,
        type: 'png_dalle',
        status: JobStatus.PENDING,
        createdAt: Date.now(),
        content: content,
        feedback: null,
        result: null,
        error: null
      };
      
      // Store in Redis with 2 hour expiration (increased from 1 hour)
      await redis.setex(job_id, 7200, JSON.stringify(job));
      console.log(`✅ Job stored in Redis: ${job_id}`);

      // Start async processing (don't await)
      processPngJob(job_id, content, OPENAI_API, redis).catch(err => {
        console.error("PNG job processing error:", err);
      });

      return ok({ 
        job_id, 
        status: "submitted",
        message: "PNG generation started"
      });
    }

    // --------------------------------------------------
    // 3) MAPS FALLBACK - SUBMIT ASCII JOB
    // --------------------------------------------------
    if (requestType === "full-feedback" && taskType === "maps" && phase === "submit-ascii") {
      console.log("🗺️ Submitting ASCII emoji map job (fallback)...");
      
      const job_id = `ascii-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Create job entry
      const job = {
        id: job_id,
        type: 'ascii_map',
        status: JobStatus.PENDING,
        createdAt: Date.now(),
        content: content,
        feedback: null,
        result: null,
        error: null
      };
      
      await redis.setex(job_id, 3600, JSON.stringify(job));
      console.log(`✅ ASCII job stored in Redis: ${job_id}`);

      // Start async processing
      processAsciiMapJob(job_id, content, OPENAI_API, redis).catch(err => {
        console.error("ASCII map job processing error:", err);
      });

      return ok({ 
        job_id, 
        status: "submitted",
        message: "ASCII emoji map generation started"
      });
    }

    // --------------------------------------
    // 4) Tables & Charts (non-maps, immediate)
    // --------------------------------------
    if (requestType === "full-feedback" && taskType !== "maps") {
      let feedback = "";
      let asciiTable = null;
      let generatedImageBase64 = null;

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
                  content: "You are a Python matplotlib code generator. Output ONLY executable Python code, no markdown, no explanations. Do NOT include plt.show()." 
                },
                { 
                  role: "user", 
                  content: `Extract ALL data from this description and generate clean matplotlib code to recreate the chart. 

Requirements:
- Import necessary libraries
- Extract all numerical data accurately
- Choose appropriate chart type (${taskType})
- Add title, axis labels, and legend
- Use clear colors and styling
- DO NOT include plt.show()

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
              sandbox = await Sandbox.create({ 
                apiKey: process.env.E2B_API_KEY, 
                timeoutMs: 30000 
              });
              
              console.log("Running matplotlib code...");
              const run = await sandbox.runCode(code);
              
              if (run?.results) {
                for (const r of run.results) {
                  if (r.png) {
                    generatedImageBase64 = `data:image/png;base64,${r.png}`;
                    console.log("✅ Chart generated");
                    break;
                  }
                }
              }
              
              if (!generatedImageBase64) {
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
                }
              }
            }
          }
        } catch (chartError) {
          console.error("Chart generation error:", chartError);
        } finally {
          if (sandbox) {
            try {
              await sandbox.close();
            } catch (closeErr) {
              console.error("Failed to close sandbox:", closeErr);
            }
          }
        }
      }

      return ok({ feedback, asciiTable, generatedImageBase64 });
    }

    // Default fallback
    return ok({ 
      feedback: "No operation matched your request."
    });

  } catch (err) {
    console.error("❌ HANDLER ERROR:", err);
    return fail(err);
  }
};

// Async PNG processing function
async function processPngJob(job_id, content, OPENAI_API, redis) {
  const jobData = await redis.get(job_id);
  if (!jobData) {
    console.error(`Job ${job_id} not found in Redis`);
    return;
  }

  const job = typeof jobData === 'string' ? JSON.parse(jobData) : jobData;
  job.status = JobStatus.PROCESSING;
  await redis.setex(job_id, 7200, JSON.stringify(job));
  
  try {
    const fetch = globalThis.fetch;

    // Get feedback
    let feedback = "";
    try {
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
    } catch (err) {
      console.error("Feedback generation error:", err);
    }

    job.feedback = feedback;
    await redis.setex(job_id, 7200, JSON.stringify(job));

    // Detect content type for adaptive styling
    const hasNatural = /island|beach|forest|tree|park|lake|countryside/i.test(content);
    const hasUrban = /road|street|building|shop|school|housing|apartment/i.test(content);

    let styleGuide = "";
    if (hasNatural && !hasUrban) {
      styleGuide = "Use illustrated pictorial style with soft 3D elements, like a storybook map. Warm, artistic rendering.";
    } else if (hasUrban && !hasNatural) {
      styleGuide = "Use clean architectural plan view, geometric 2D top-down perspective. Professional urban planning style.";
    } else {
      styleGuide = "Use balanced semi-illustrated style mixing plan view and pictorial elements.";
    }

    // Generate image with adaptive prompt
    const imgPrompt = `Create a professional IELTS Task 1 map showing "Before" and "After" side-by-side.

${styleGuide}

REQUIREMENTS:
- Two clearly labeled panels with consistent scale
- Compass rose (N/S/E/W) if directional info mentioned
- Legend/key if multiple feature types exist
- Clear labels for all features
- Professional exam-quality formatting

COLORS:
- Water: blue shades | Vegetation: green shades | Buildings: grey/tan | Roads: grey with dashes

ACCURACY (CRITICAL):
- Include ONLY features explicitly mentioned below
- Correct spatial relationships and quantities
- No invented or decorative additions

Description:
${content.substring(0, 900)}

Style: Official IELTS examination material - clear, educational, professional.`;

    console.log(`🎨 Generating DALL-E image for job ${job_id}...`);
    const ir = await fetch(`${OPENAI_API}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: imgPrompt,
        size: "1792x1024",
        quality: "standard",
        style: "natural",
        n: 1
      })
    });

    if (!ir.ok) {
      const errorText = await ir.text();
      throw new Error(`DALL-E failed: ${ir.status} - ${errorText}`);
    }

    const ij = await ir.json();
    const imageUrl = ij?.data?.[0]?.url;
    
    if (!imageUrl) {
      throw new Error("No image URL in response");
    }

    console.log("✅ PNG URL generated, converting to base64...");
    
    // Download and convert to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    
    // Update job with result
    job.status = JobStatus.COMPLETED;
    job.result = {
      generatedImageBase64: `data:image/png;base64,${base64}`,
      usedPipeline: "dall-e-3"
    };
    await redis.setex(job_id, 7200, JSON.stringify(job));

    console.log(`✅ PNG job ${job_id} completed successfully`);

  } catch (error) {
    console.error(`❌ PNG job ${job_id} failed:`, error);
    job.status = JobStatus.FAILED;
    job.error = error.message;
    await redis.setex(job_id, 7200, JSON.stringify(job));
  }
}

// Async ASCII emoji map processing function
async function processAsciiMapJob(job_id, content, OPENAI_API, redis) {
  const jobData = await redis.get(job_id);
  if (!jobData) {
    console.error(`Job ${job_id} not found in Redis`);
    return;
  }

  const job = typeof jobData === 'string' ? JSON.parse(jobData) : jobData;
  job.status = JobStatus.PROCESSING;
  await redis.setex(job_id, 3600, JSON.stringify(job));
  
  try {
    const fetch = globalThis.fetch;

    // Get feedback (reuse from PNG if available, otherwise generate)
    let feedback = job.feedback || "";
    
    if (!feedback) {
      try {
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
      } catch (err) {
        console.error("Feedback generation error:", err);
      }
    }

    job.feedback = feedback;
    await redis.setex(job_id, 3600, JSON.stringify(job));

    // Generate ASCII emoji maps
    const asciiPrompt = `You are an ASCII emoji map generator for IELTS Task 1 practice.

Create TWO side-by-side ASCII emoji maps (BEFORE and AFTER) based on this description.

STRICT RULES:
1. Use ONLY these emojis (choose based on what's mentioned):
   - Sea/Water: 🌊
   - Trees/Forest: 🌳 or 🌲
   - Beach/Sand: 🏖️
   - Farmland: 🌾
   - Park: 🌳
   - Housing: 🏠
   - Apartments: 🏢
   - Hotel: 🏨
   - Restaurant: 🍽️
   - Cafe: ☕
   - Shop: 🏬
   - Road/Path: ⬛ (black square - like Dune 2 concrete slabs)
   - Pier: 🛳️
   - Golf: ⛳
   - Tennis: 🎾
   - School: 🏫
   - Huts: 🛖
   - Reception: 🪪
   - Factory: 🏭
   - Bridge: 🌉
   - Empty space: ⬜ (white square)

2. Create a grid layout (approximately 20x15 cells each)

3. Label each map clearly at the top: "BEFORE" and "AFTER"

4. Add compass rose (N ⬆️  S ⬇️  E ➡️  W ⬅️) if directions mentioned

5. Add a simple legend at the bottom showing what emojis represent

6. Use spacing and alignment to show spatial relationships clearly

7. ONLY include features EXPLICITLY mentioned in the description

8. Roads should be drawn as connected ⬛ squares forming paths (like Dune 2)

EXAMPLE FORMAT:

         BEFORE                          AFTER
    
    ⬜⬜⬜🌊🌊🌊🌊🌊        ⬜⬜⬜🌊🌊🌊🌊🌊
    ⬜🌳🌳🏖️🏖️🌊🌊        ⬜⬛⬛🏖️🏖️🌊🌊
    ⬜🌳🌳🌳⬜⬜⬜        🏨⬛🏠🏠⬜⬜⬜
    ⬜⬜🌳🌳🌳⬜⬜        🏠⬛🏠🏠⬜⬜⬜
    ⬜⬜⬜🌳⬜⬜⬜        ⬛⬛⬛🛳️🌊🌊🌊

Legend: 🌊 Sea | 🌳 Trees | 🏖️ Beach | ⬛ Road | 🏠 Housing | 🏨 Hotel | 🛳️ Pier

NOW GENERATE ASCII EMOJI MAPS FOR THIS DESCRIPTION:

${content}

Output ONLY the maps with labels and legend. No explanations.`;

    console.log(`🗺️ Generating ASCII emoji maps for job ${job_id}...`);
    const mapRes = await fetch(`${OPENAI_API}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an ASCII emoji map generator. Output ONLY the maps with proper emoji alignment and spacing. No markdown, no explanations."
          },
          {
            role: "user",
            content: asciiPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!mapRes.ok) {
      const errorText = await mapRes.text();
      throw new Error(`ASCII map generation failed: ${mapRes.status} - ${errorText}`);
    }

    const mapJson = await mapRes.json();
    const asciiMaps = mapJson?.choices?.[0]?.message?.content?.trim();
    
    if (!asciiMaps) {
      throw new Error("No ASCII maps generated");
    }

    console.log("✅ ASCII emoji maps generated");
    
    // Update job with result
    job.status = JobStatus.COMPLETED;
    job.result = {
      asciiMaps: asciiMaps,
      usedPipeline: "ascii-emoji"
    };
    await redis.setex(job_id, 3600, JSON.stringify(job));

    console.log(`✅ ASCII map job ${job_id} completed successfully`);

  } catch (error) {
    console.error(`❌ ASCII map job ${job_id} failed:`, error);
    job.status = JobStatus.FAILED;
    job.error = error.message;
    await redis.setex(job_id, 3600, JSON.stringify(job));
  }
}

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
