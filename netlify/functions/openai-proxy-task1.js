const axios = require('axios');

exports.handler = async function(event, context) {
  // --- Basic CORS setup ---
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  // --- Handle OPTIONS (preflight) requests ---
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers };
  }

  try {
    const { content, requestType } = JSON.parse(event.body || '{}');

    // --- Route 1: Visualization only (student description → image) ---
    if (requestType === "visualize-only") {
      console.log("Generating visualization from description...");

      const generatedImageUrl = await visualizeDescription(content);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          feedback: "Visualization generated successfully.",
          generatedImageUrl
        })
      };
    }

    // --- Default fallback for unsupported request types ---
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: true,
        feedback: "Unsupported requestType. Use 'visualize-only'."
      })
    };

  } catch (error) {
    console.error("Error:", error);
    let message = "Unable to generate visualization at this time.";
    if (error.response) {
      console.error("API error:", error.response.data);
      message += ` API Error: ${error.response.status} - ${error.response.data.error?.message || 'Unknown issue'}`;
    }
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: true, feedback: message })
    };
  }
};



// --- Helper function to generate visualization using DALL-E 3 ---
async function visualizeDescription(content) {
  try {
    const prompt = `
You are generating an educational-style visual that represents the student's written description of a chart, table, or diagram.

Read the student's text carefully and imagine what visual data representation (line graph, bar chart, map, or table) best fits it.

Then, create an image that visually represents the trends, comparisons, or structures mentioned — without using any actual words or numbers.

Keep the design clean and minimalist: white background, clear axes, simple colours, and no text labels.

Student's description:
"""
${content}
"""`;

    const response = await axios.post(
      "https://api.openai.com/v1/images/generations",
      {
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard"
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 60000
      }
    );

    const imageUrl = response.data.data[0].url;
    console.log("Image generated successfully:", imageUrl);
    return imageUrl;

  } catch (error) {
    console.error("Error generating visualization:", error.response?.data || error.message);
    return null;
  }
}
