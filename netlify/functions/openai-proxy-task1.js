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
        console.log(`📈 Python SVG generation for ${taskType}`);
        
        // Use GPT-4 to generate SVG directly (works better than base64 images)
        const svgPrompt = `You are a data visualization expert. Create an SVG chart based on this IELTS description.

TASK: ${taskType}
DESCRIPTION: ${content}

Create a professional SVG visualization that:
1. Extracts ALL data accurately from the description
2. Creates appropriate ${taskType} 
3. Uses clean styling: white background, grid lines, clear labels
4. Includes axis labels, title, and legend
5. Size: 800x600 viewBox

CRITICAL: Return ONLY the complete SVG code, starting with <svg> and ending with </svg>. No explanations, no markdown, just the SVG.`;

        try {
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
                  content: "You generate clean, professional SVG charts. Output only valid SVG code, no explanations." 
                },
                { role: "user", content: svgPrompt },
              ],
              temperature: 0.3,
            }),
          });

          const svgData = await svgRes.json();
          let svgCode = svgData.choices?.[0]?.message?.content?.trim() || "";
          
          // Clean SVG code
          svgCode = svgCode
            .replace(/```svg\n?/g, '')
            .replace(/```xml\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

          // Convert SVG to base64
          const svgBase64 = Buffer.from(svgCode).toString('base64');
          generatedImageBase64 = `data:image/svg+xml;base64,${svgBase64}`;
          
          console.log("✅ SVG generated, length:", svgCode.length);

        } catch (svgError) {
          console.error("❌ SVG generation failed:", svgError.message);
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
