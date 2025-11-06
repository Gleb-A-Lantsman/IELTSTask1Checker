import axios from "axios";

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

    // -------------------------------
    // ✳️ STEP 1: Choose request mode
    // -------------------------------
    let prompt = "";
    let image_prompt = "";
    let asciiTable = null;
    let generatedImageBase64 = null;
    let generatedImageUrl = null;

    if (requestType === "help") {
      prompt = `You are an IELTS examiner.
Give short writing hints (under 150 words) for this Task 1 description:\n\n${content}\n\nReturn quick, clear advice.`;
    } else if (requestType === "full-feedback") {
      prompt = `You are an IELTS Writing Task 1 examiner.
Evaluate the student's description based on Task Achievement, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy.
Provide specific feedback for each criterion in markdown format with bold section titles.

Student's description:
${content}`;
    } else {
      console.warn("⚠️ Unsupported requestType", requestType);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: true, feedback: "Unsupported requestType." }),
      };
    }

    // -------------------------------
    // ✳️ STEP 2: Generate textual feedback via ChatGPT
    // -------------------------------
    const feedbackResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an IELTS Writing Task 1 examiner." },
          { role: "user", content: prompt },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const feedback = feedbackResponse.data.choices[0].message.content.trim();
    console.log("✅ Feedback generated, length:", feedback.length);

    // -------------------------------
    // ✳️ STEP 3: Visualization logic
    // -------------------------------
    if (requestType === "full-feedback") {
      if (taskType === "table") {
        console.log("📊 Table detected → ASCII generation");

        // Generate ASCII table
        const asciiResponse = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a data formatter that converts descriptions into ASCII tables." },
              { role: "user", content: `Convert this Task 1 description into an ASCII table only:\n\n${content}` },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );

        asciiTable = asciiResponse.data.choices[0].message.content.trim();
        console.log("✅ ASCII table generated");
      } else {
        console.log("📈 Non-table task → Python visualization or image");

        image_prompt = `Generate a clear visualization (chart, map, or diagram) that corresponds to this IELTS Task 1 description:\n${content}`;

        const imageResponse = await axios.post(
          "https://api.openai.com/v1/images/generations",
          {
            model: "gpt-image-1",
            prompt: image_prompt,
            size: "1024x1024",
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );

        generatedImageUrl = imageResponse.data.data[0].url;
        console.log("✅ DALL·E image generated");
      }
    }

    // -------------------------------
    // ✳️ STEP 4: Respond
    // -------------------------------
    return {
      statusCode: 200,
      body: JSON.stringify({
        feedback,
        asciiTable,
        generatedImageBase64,
        generatedImageUrl,
      }),
    };
  } catch (error) {
    console.error("❌ ERROR inside function:", error.message || error);
    if (error.response?.data) console.error("OpenAI response:", JSON.stringify(error.response.data, null, 2));

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: true,
        feedback: `Internal server error: ${error.message || "Unknown"}`,
      }),
    };
  }
};
