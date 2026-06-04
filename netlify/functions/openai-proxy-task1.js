// openai-proxy-task1.js
// Centralized feedback generation

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

// ===================================================================
// CENTRALIZED FEEDBACK GENERATION
// ===================================================================

async function generateIELTSFeedback(content, taskType, OPENAI_API) {
  console.log(`📝 Generating IELTS feedback for ${taskType}...`);
  
  const fetch = globalThis.fetch;
  
  // Determine task-specific guidance
  let taskSpecificGuidance = "";
  
  if (taskType === "maps") {
    taskSpecificGuidance = `
**1. Task Achievement**
- Does the description cover ALL key features visible in the maps (buildings, roads, natural features, changes)?
- What percentage of statements are supported by specific data (years, quantities, compass directions)? Calculate this percentage explicitly.
- Are there any opinions or speculation? (There should be NONE - only factual descriptions)
- Is there an overview statement summarizing the main changes?
- Are comparisons made between "before" and "after"?

**2. Coherence and Cohesion**
- Is the text organized into at least 3 paragraphs (introduction + 2+ body paragraphs)?
- Does the introduction clearly state what the maps show (location, time periods, what changed)?
- Does each body paragraph have a clear topic sentence explaining the uniting principle (e.g., "The northern part of the island...", "In terms of accommodation...")?
- Are there smooth transitions between sentences using cohesive devices (while, whereas, in contrast, additionally)?
- Are there logical connections between paragraphs?
- Does it include all output data (years, place names, compass directions, any labels from the legend/key)?

**3. Lexical Resource (Vocabulary)**
- Are words used accurately and appropriately?
- Is there variety in vocabulary to avoid repetition (e.g., "constructed/built/developed", "removed/demolished/cleared")?
- Are there good collocations for describing changes (e.g., "underwent development", "remained unchanged")?
- Is location vocabulary used effectively (northern/southern, adjacent to, in the vicinity of)?

**4. Grammatical Range and Accuracy**
- Are sentences grammatically correct?
- Is there variety in sentence structures (simple, compound, complex)?
- Are passive constructions used appropriately for describing changes (e.g., "A hotel was built...")?
- Are there different ways to express changes to avoid repetition?
- Are tenses used correctly (past simple for completed changes, past perfect for sequences)?`;
    
  } else if (taskType === "table") {
    taskSpecificGuidance = `
**1. Task Achievement**
- Does the description cover ALL key data from the table (categories, time periods, major values)?
- What percentage of statements are supported by specific numbers from the table? Calculate this percentage explicitly.
- Are there any opinions or speculation? (There should be NONE - only factual descriptions)
- Is there an overview statement identifying the main trends or most significant data?
- Are comparisons made between different categories or time periods?

**2. Coherence and Cohesion**
- Is the text organized into at least 3 paragraphs (introduction + 2+ body paragraphs)?
- Does the introduction clearly state what the table shows (title, time period, categories, units)?
- Does each body paragraph have a clear topic sentence explaining what aspect is being discussed?
- Are there smooth transitions between sentences using cohesive devices (similarly, in contrast, furthermore)?
- Are there logical connections between paragraphs?
- Does it include all output data (years, category names, units of measurement)?

**3. Lexical Resource (Vocabulary)**
- Are words used accurately and appropriately?
- Is there variety in vocabulary to describe data (e.g., "increased/rose/grew", "decreased/fell/dropped")?
- Are there good collocations for describing trends (e.g., "experienced a sharp rise", "remained relatively stable")?
- Are comparison structures used effectively (higher than, the highest, more than)?

**4. Grammatical Range and Accuracy**
- Are sentences grammatically correct?
- Is there variety in sentence structures (simple, compound, complex)?
- Are comparison structures used correctly (comparative and superlative adjectives)?
- Are there different ways to express data to avoid repetition?
- Are tenses used correctly (past tense for historical data, present perfect for recent trends)?`;
    
  } else {
    // For charts (line-graph, bar-chart, pie-chart, flowchart)
    taskSpecificGuidance = `
**1. Task Achievement**
- Does the description cover ALL key features of the ${taskType} (major trends, peaks/troughs, significant data points)?
- What percentage of statements are supported by specific numbers or data from the visual? Calculate this percentage explicitly.
- Are there any opinions or speculation? (There should be NONE - only factual descriptions)
- Is there an overview statement identifying the main trends or patterns?
- Are comparisons made where appropriate?

**2. Coherence and Cohesion**
- Is the text organized into at least 3 paragraphs (introduction + 2+ body paragraphs)?
- Does the introduction clearly state what the ${taskType} shows (title, time period, categories, axes, units)?
- Does each body paragraph have a clear topic sentence explaining what aspect is being discussed?
- Are there smooth transitions between sentences using cohesive devices (however, moreover, similarly)?
- Are there logical connections between paragraphs?
- Does it include all output data (years, category names, axis labels, units of measurement, legend items)?

**3. Lexical Resource (Vocabulary)**
- Are words used accurately and appropriately?
- Is there variety in vocabulary to describe trends (e.g., "surged/soared/climbed", "plummeted/declined/decreased")?
- Are there good collocations for describing changes (e.g., "witnessed a dramatic increase", "fluctuated slightly")?
- Are numerical expressions varied (approximately, roughly, nearly, just over)?

**4. Grammatical Range and Accuracy**
- Are sentences grammatically correct?
- Is there variety in sentence structures (simple, compound, complex)?
- Are different sentence patterns used to describe trends?
- Are there various ways to express data to avoid repetition?
- Are tenses used correctly (past tense for completed periods, present tense for current data)?`;
  }

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
          { 
            role: "system", 
            content: "You are an experienced IELTS Writing Task 1 examiner with deep knowledge of the official scoring rubrics. You provide detailed, constructive feedback based on the four assessment criteria." 
          },
          { 
            role: "user", 
            content: `You are an IELTS Task 1 examiner. Evaluate this ${taskType} description based on the official IELTS criteria. Be specific and constructive.

**ANSWER:**
${content}

**EVALUATION CRITERIA:**

${taskSpecificGuidance}

**INSTRUCTIONS:**
- Make section titles bold with **Task Achievement**, **Coherence and Cohesion**, **Lexical Resource**, and **Grammatical Range and Accuracy**
- Provide specific examples from the text to support your points
- Calculate and state the percentage of statements supported by data
- Be constructive and actionable in your feedback
- Identify both strengths and areas for improvement` 
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });
    
    if (!feedbackRes.ok) {
      throw new Error(`Feedback API failed: ${feedbackRes.status}`);
    }
    
    const feedbackJson = await feedbackRes.json();
    const feedback = feedbackJson?.choices?.[0]?.message?.content?.trim() || "Unable to generate feedback.";
    
    console.log("✅ Feedback generated successfully");
    return feedback;
    
  } catch (err) {
    console.error("❌ Feedback generation error:", err);
    return "Unable to generate feedback at this time. Please try again.";
  }
}

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    let {  
      content,
      requestType,
      taskType,
      imageUrl,
      imageName,
      phase,
      job_id
    } = body;

    if (requestType === "full-feedback" && (taskType === "maps" || taskType === "flowchart") && !phase) {
      phase = "submit";
    }

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
    // 2) MAPS & FLOWCHARTS - SUBMIT IMAGE JOB (async)
    // --------------------------------------------------
    if (requestType === "full-feedback" && (taskType === "maps" || taskType === "flowchart") && phase === "submit") {
      console.log(`🖼️ Submitting async ${taskType} generation job...`);
      const job_id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const job = {
        id: job_id,
        type: taskType === "maps" ? 'png_dalle' : 'flowchart_dalle',
        status: JobStatus.PENDING,
        createdAt: Date.now(),
        content: content,
        taskType: taskType,
        feedback: null,
        result: null,
        error: null
      };
      
      await redis.setex(job_id, 7200, JSON.stringify(job));
      console.log(`✅ Job stored in Redis: ${job_id}`);

      processPngJob(job_id, content, taskType, OPENAI_API, redis).catch(err => {
        console.error(`${taskType} job processing error:`, err);
      });

      return ok({ 
        job_id, 
        status: "submitted",
        message: `${taskType} generation started`
      });
    }

    // --------------------------------------------------
    // 3) MAPS FALLBACK - SUBMIT ASCII JOB
    // --------------------------------------------------
    if (requestType === "full-feedback" && taskType === "maps" && phase === "submit-ascii") {
      console.log("🗺️ Submitting ASCII emoji map job (fallback)...");
      
      const job_id = `ascii-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
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

      processAsciiMapJob(job_id, content, taskType, OPENAI_API, redis).catch(err => {
        console.error("ASCII map job processing error:", err);
      });

      return ok({ 
        job_id, 
        status: "submitted",
        message: "ASCII emoji map generation started"
      });
    }

    // --------------------------------------
    // 4) Tables & Charts ONLY (non-maps, non-flowchart, immediate)
    // --------------------------------------
    if (requestType === "full-feedback" && taskType !== "maps" && taskType !== "flowchart") {
      let feedback = "";
      let asciiTable = null;
      let generatedImageBase64 = null;

      // Get feedback using centralized function
      feedback = await generateIELTSFeedback(content, taskType, OPENAI_API);

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
        // -------------------------------------------------------
        // Handle charts (line-graph, bar-chart, pie-chart) via E2B
        // -------------------------------------------------------
        let sandbox = null;
        try {
          console.log("🔬 Creating E2B sandbox for chart generation...");
          sandbox = await Sandbox.create();
          console.log("✅ Sandbox created successfully");

          // ✅ FIX: Use Agg backend + plt.gcf() so E2B can capture the figure
          const pythonPrompt = `Create Python matplotlib code to generate a ${taskType} based on this description: ${content}.

Requirements:
- The FIRST line must be: import matplotlib
- The SECOND line must be: matplotlib.use('Agg')
- The THIRD line must be: import matplotlib.pyplot as plt
- Use plain Python lists for all data values (no pandas, no numpy, no external libraries)
- Maximum 10 data points on any axis
- For x-axis labels use plain strings or integers only — NO dates, NO pd.date_range(), NO datetime objects
- DO NOT use plt.show()
- DO NOT use plt.savefig()
- DO NOT use assert statements
- DO NOT import any library other than matplotlib
- Call plt.tight_layout() as the second-to-last line
- The LAST line must be exactly: plt.gcf()
- Include a clear title, axis labels, and legend`;

          console.log("🤖 Requesting Python code from GPT...");
          
          const codeResponse = await fetch(`${OPENAI_API}/chat/completions`, {
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
                  content: "You are a Python matplotlib expert. Output ONLY raw Python code — no markdown fences, no triple backticks, no explanations. The code must be ready to execute as-is." 
                },
                { role: "user", content: pythonPrompt },
              ],
              temperature: 0.3,
            }),
          });
          
          if (!codeResponse.ok) {
            throw new Error(`Code generation failed: ${codeResponse.status}`);
          }
          
          const codeJson = await codeResponse.json();
          let pythonCode = codeJson?.choices?.[0]?.message?.content?.trim() || "";
          
          if (!pythonCode) {
            throw new Error("No Python code generated");
          }

          // Strip any markdown fences GPT may have added despite instructions
          pythonCode = pythonCode
            .replace(/^```python\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          
          console.log("📊 Executing Python code in sandbox...");
          console.log("=== FULL PYTHON CODE SENT TO E2B ===\n", pythonCode);
          
          const execution = await sandbox.runCode(pythonCode);

          console.log("=== E2B EXECUTION RESULT ===");
          console.log(JSON.stringify({
            error: execution.error,
            resultsCount: execution.results?.length,
            resultKeys: execution.results?.[0] ? Object.keys(execution.results[0]) : [],
            hasPng: !!execution.results?.[0]?.png,
            logs: execution.logs
          }, null, 2));

          if (execution.results && execution.results.length > 0) {
            const chartImage = execution.results[0];
            if (chartImage.png) {
  generatedImageBase64 = `data:image/png;base64,${chartImage.png}`;
  console.log("✅ Chart generated as PNG via E2B");
} else if (chartImage.svg) {
  // E2B returns SVG — encode it as a data URL the browser can render in <img>
  const svgBase64 = Buffer.from(chartImage.svg).toString('base64');
  generatedImageBase64 = `data:image/svg+xml;base64,${svgBase64}`;
  console.log("✅ Chart generated as SVG via E2B");
} else {
  console.warn("⚠️ Result exists but has no PNG or SVG. Keys:", Object.keys(chartImage));
  if (execution.error) {
    throw new Error(`Code execution failed: ${execution.error.value || JSON.stringify(execution.error)}`);
  }
}
            
          } else {
            console.warn("⚠️ No results array from E2B execution");
            if (execution.error) {
              throw new Error(`Code execution failed: ${execution.error.value || JSON.stringify(execution.error)}`);
            }
          }
          
        } catch (chartErr) {
          console.error("❌ Chart generation error:", chartErr.message);
          console.error("Stack:", chartErr.stack);
          // Fail gracefully — feedback still returns, chart panel just won't show
        } finally {
          if (sandbox) {
            try {
              console.log("🧹 Cleaning up sandbox...");
              await sandbox.kill();
              console.log("✅ Sandbox terminated");
            } catch (killErr) {
              console.error("⚠️ Error killing sandbox:", killErr);
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
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    return fail(err);
  }
};

// ===================================================================
// ASYNC PNG PROCESSING (handles both maps and flowcharts)
// ===================================================================

async function processPngJob(job_id, content, taskType, OPENAI_API, redis) {
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

    const feedback = await generateIELTSFeedback(content, taskType, OPENAI_API);
    
    job.feedback = feedback;
    await redis.setex(job_id, 7200, JSON.stringify(job));

    let imgPrompt = "";
    
    if (taskType === "flowchart") {
      imgPrompt = `Create a professional IELTS Task 1 flowchart/process diagram based on this description.

REQUIREMENTS:
- Clean, professional diagram style
- Clear arrows showing process flow/sequence
- Numbered steps if applicable
- Labels for all stages/components
- Simple, readable layout
- Educational quality suitable for IELTS examination

STYLE:
- Use simple shapes (rectangles, circles, diamonds)
- Clear directional arrows
- Consistent spacing and alignment
- Professional colors (blues, greys, neutral tones)
- Black text labels in sans-serif font

Description: ${content}

Create a clear, educational flowchart that accurately represents this process.`;
      
    } else {
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

      imgPrompt = `Create a professional IELTS Task 1 map comparison in LANDSCAPE format showing "BEFORE" and "AFTER" layouts side-by-side.

**LAYOUT SPECIFICATIONS:**
- Format: Horizontal/landscape orientation
- Include generous margins: 8-10% padding on all sides
- Position compass rose in bottom-left of BEFORE map, away from edge
- Place legend at bottom center with clear spacing
- Ensure "BEFORE" and "AFTER" titles have headroom

${styleGuide}

SPATIAL ACCURACY (CRITICAL):
- Maintain accurate compass directions (${extractDirections(content)})
- Preserve relative distances and proportions
- Show exact quantities: ${extractQuantities(content)}

VISUAL REQUIREMENTS:
- Two equally-sized panels with shared scale bar
- Clear "BEFORE" and "AFTER" labels
- Consistent legend/key between both maps
- Compass rose if directional information provided
- Professional examination quality

FEATURES TO INCLUDE:
${extractFeatures(content)}

COLORS & STYLE:
- Water: blue gradient | Vegetation: green tones | Buildings: neutral grey/beige
- Roads: dark grey with dashes | Labels: black sans-serif
- ${styleGuide}

Format: High-quality IELTS examination material - educational, precise, uncluttered.

Description: ${content.substring(0, 900)}`;
    }

    console.log(`🎨 Generating ${taskType} image for job ${job_id}...`);

    const requestBody = {
      model: "gpt-image-1.5",
      prompt: imgPrompt,
      size: "1536x1024",
      quality: "high",
      n: 1
    };

    console.log(`Request body:`, JSON.stringify(requestBody, null, 2));

    const ir = await fetch(`${OPENAI_API}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`Response status: ${ir.status}`);
    const responseText = await ir.text();
    console.log(`Response body (full): ${responseText}`);

    if (!ir.ok) {
      throw new Error(`Image API failed: ${ir.status} - ${responseText}`);
    }

    let ij;
    try {
      ij = JSON.parse(responseText);
    } catch (parseErr) {
      throw new Error(`Failed to parse response: ${parseErr.message}`);
    }

    let imageUrl = null;

    if (ij?.data?.[0]?.url) {
      imageUrl = ij.data[0].url;
      console.log(`✅ Found image URL in data[0].url`);
    } else if (ij?.data?.[0]?.image_url) {
      imageUrl = ij.data[0].image_url;
      console.log(`✅ Found image URL in data[0].image_url`);
    } else if (ij?.url) {
      imageUrl = ij.url;
      console.log(`✅ Found image URL in root url`);
    } else if (ij?.data?.[0]?.b64_json) {
      console.log(`✅ Found base64 image in response`);
      const base64 = ij.data[0].b64_json;
      
      job.status = JobStatus.COMPLETED;
      job.result = {
        generatedImageBase64: `data:image/png;base64,${base64}`,
        usedPipeline: "gpt-image-1.5"
      };
      await redis.setex(job_id, 7200, JSON.stringify(job));
      console.log(`✅ ${taskType} job ${job_id} completed successfully (base64)`);
      return;
    }

    if (!imageUrl) {
      console.error(`❌ Could not find image URL in response structure`);
      console.error(`Available keys in response:`, Object.keys(ij));
      if (ij?.data?.[0]) {
        console.error(`Available keys in data[0]:`, Object.keys(ij.data[0]));
      }
      throw new Error("No image URL found in any expected location");
    }

    console.log("✅ Image URL generated, converting to base64...");
    
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    
    job.status = JobStatus.COMPLETED;
    job.result = {
      generatedImageBase64: `data:image/png;base64,${base64}`,
      usedPipeline: "gpt-image-1.5"
    };
    await redis.setex(job_id, 7200, JSON.stringify(job));

    console.log(`✅ ${taskType} job ${job_id} completed successfully`);

  } catch (error) {
    console.error(`❌ ${taskType} job ${job_id} failed:`, error);
    job.status = JobStatus.FAILED;
    job.error = error.message;
    await redis.setex(job_id, 7200, JSON.stringify(job));
  }
}

// ===================================================================
// ASYNC ASCII MAP PROCESSING
// ===================================================================

async function processAsciiMapJob(job_id, content, taskType, OPENAI_API, redis) {
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

    let feedback = job.feedback || "";
    
    if (!feedback) {
      feedback = await generateIELTSFeedback(content, taskType, OPENAI_API);
    }

    job.feedback = feedback;
    await redis.setex(job_id, 3600, JSON.stringify(job));

    const asciiPrompt = `You are an ASCII emoji map generator for IELTS Task 1 practice.

Create TWO side-by-side ASCII emoji maps (BEFORE and AFTER) based on this description.

STRICT RULES:
1. Grid size: Each map should be approximately 30 columns × 12 rows
   
2. Use ONLY these emojis (choose the MINIMUM needed):
   - Sea/Water: 🌊
   - Trees/Forest/Park: 🌳
   - Beach/Sand: 🏖️
   - Farmland/Grass: 🌾
   - Roads/Paths: ⬛
   - Buildings (ANY type): 🏠
   - Empty space: ⬜
   
   IMPORTANT: Use as FEW different emojis as possible.
   
3. Layout: Place maps SIDE BY SIDE horizontally (not vertically)
   
   Format:
   BEFORE (left)              AFTER (right)
   🌊🌊🌊🌊🌊🌊...            🌊🌊🌊🌊🌊🌊...
   ⬜🌳🌳⬜⬜⬜...            ⬜🏠🏠⬜⬜⬜...
   
4. Perfect alignment:
   - Each emoji must align vertically in columns
   - Use monospace formatting
   - Test alignment before finalizing
   
5. Clear labels:
   - Title each map at the top: "BEFORE" and "AFTER"
   - Add simple legend at bottom
   
6. Compass rose: Add (N ⬆️  S ⬇️  E ➡️  W ⬅️) ONLY if mentioned in description

7. Content accuracy:
   - ONLY include features EXPLICITLY mentioned
   - Represent quantities accurately (if "3 buildings" → exactly 3 🏠 emojis)

EXAMPLE OUTPUT:

     BEFORE                              AFTER
🌊🌊🌊🌊🌊🌊🌊🌊🌊🌊        🌊🌊🌊🌊🌊🌊🌊🌊🌊🌊
🌊⬜⬜🌳🌳🌳🌊🌊🌊🌊        🌊⬜⬛⬛🌳🌳🌊🌊🌊🌊
⬜⬜🌳🌳🌳🌳⬜⬜⬜🌊        ⬜🏠⬛🏠🌳🌳⬜⬜⬜🌊
⬜🌳🌳🌳🌳🌳🌳⬜⬜⬜        ⬜🏠⬛🏠🏠🌳🌳⬜⬜⬜
⬜⬜🌳🌳🌳⬜⬜⬜⬜⬜        ⬜⬜⬛⬛🏠⬜⬜⬜⬜⬜
🌊⬜⬜🌳⬜⬜⬜⬜⬜🌊        🌊⬜⬜⬛⬛⬜⬜⬜⬜🌊
🌊🌊⬜⬜⬜⬜⬜🌊🌊🌊        🌊🌊⬜⬜⬛🏠⬜🌊🌊🌊
🌊🌊🌊⬜⬜⬜🌊🌊🌊🌊        🌊🌊🌊⬜⬜⬜🌊🌊🌊🌊

Legend: 🌊 Sea | 🌳 Vegetation | 🏠 Buildings | ⬛ Roads | ⬜ Empty

NOW GENERATE ASCII EMOJI MAPS FOR THIS DESCRIPTION:

${content}

Output ONLY the maps in monospace format. No markdown code blocks, no explanations.`;

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

// ===================================================================
// HELPER FUNCTIONS FOR PROMPT GENERATION
// ===================================================================

function extractDirections(content) {
  const directions = [];
  if (/north/i.test(content)) directions.push("north");
  if (/south/i.test(content)) directions.push("south");
  if (/east/i.test(content)) directions.push("east");
  if (/west/i.test(content)) directions.push("west");
  return directions.length > 0 ? directions.join(", ") : "not specified";
}

function extractQuantities(content) {
  const numberMatches = content.match(/\d+\s+(?:building|house|hotel|shop|road|tree|facility|facilities)/gi);
  if (numberMatches && numberMatches.length > 0) {
    return numberMatches.slice(0, 5).join(", ");
  }
  return "see description";
}

function extractFeatures(content) {
  const features = [];
  
  if (/beach|coast|shore/i.test(content)) features.push("- Beach/coastal areas");
  if (/forest|tree|woodland/i.test(content)) features.push("- Trees/forested areas");
  if (/water|lake|pond|river/i.test(content)) features.push("- Water bodies");
  if (/road|street|path/i.test(content)) features.push("- Roads/pathways");
  if (/hotel|accommodation/i.test(content)) features.push("- Hotels/accommodation");
  if (/house|housing|residential/i.test(content)) features.push("- Residential buildings");
  if (/restaurant|cafe/i.test(content)) features.push("- Restaurants/cafes");
  if (/shop|store/i.test(content)) features.push("- Shops/retail");
  if (/pier|dock/i.test(content)) features.push("- Pier/dock structures");
  
  return features.length > 0 ? features.join("\n") : "- General buildings and features";
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

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
