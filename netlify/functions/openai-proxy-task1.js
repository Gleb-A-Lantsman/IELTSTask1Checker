export const handler = async (event) => {
  try {
    const { content, requestType, taskType, imageUrl } = JSON.parse(event.body || "{}");

    if (!content || !requestType) {
      console.error("❌ Missing required fields", { contentLength: content?.length, requestType });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: true, feedback: "Missing required data." }),
      };
    }

    console.log(`📩 Request received: ${requestType} | ${taskType}`);

    let feedback = "";
    let asciiTable = null;
    let generatedImageUrl = null;

    // -------------------------------
    // STEP 1: Prepare prompts
    // -------------------------------
    const feedbackPrompt =
      requestType === "help"
        ? `You are an IELTS examiner. Give short writing hints (under 150 words) for this Task 1 description:\n\n${content}`
        : `You are an IELTS Writing Task 1 examiner.
Evaluate the student's description based on Task Achievement, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy.
Provide specific feedback for each criterion with bold section titles.\n\nStudent's description:\n${content}`;

    // -------------------------------
    // STEP 2: Get textual feedback
    // -------------------------------
    const feedbackRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an IELTS Writing Task 1 examiner." },
          { role: "user", content: feedbackPrompt },
        ],
      }),
    });

    const feedbackData = await feedbackRes.json();
    feedback = feedbackData.choices?.[0]?.message?.content?.trim() || "";
    console.log("✅ Feedback generated, length:", feedback.length);

    // -------------------------------
    // STEP 3: Visualization logic
    // -------------------------------
    if (requestType === "full-feedback") {
      if (taskType === "table") {
        console.log("📊 Table detected → ASCII generation");

        const asciiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You convert English descriptions into ASCII tables." },
              { role: "user", content: `Convert this IELTS table description into an ASCII table only:\n\n${content}` },
            ],
          }),
        });

        const asciiData = await asciiRes.json();
        asciiTable = asciiData.choices?.[0]?.message?.content?.trim() || "";
        console.log("✅ ASCII table generated");
      } else {
        console.log("📈 Non-table task → DALL·E image generation");

        const imagePrompt = `Create a simple, clear IELTS-style chart or diagram (white background, 2D) that matches this description:\n${content}`;

        const imgRes = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt: imagePrompt,
            size: "1024x1024",
          }),
        });

        const imgData = await imgRes.json();
        generatedImageUrl = imgData.data?.[0]?.url || null;
        console.log("✅ DALL·E image generated");
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        feedback,
        asciiTable,
        generatedImageUrl,
      }),
    };
  } catch (error) {
    console.error("❌ ERROR inside function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: true,
        feedback: `Internal error: ${error.message}`,
      }),
    };
  }
};
