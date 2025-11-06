const axios = require('axios');

exports.handler = async function(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers };
  }

  try {
    const { content, requestType, taskType, imageUrl } = JSON.parse(event.body || '{}');

    let systemPrompt;
    let userPrompt;
    let generateImage = false;

    // ========== NEW ROUTE: VISUALIZE ONLY ==========
    if (requestType === 'visualize-only') {
      console.log("Generating visualization directly from description...");
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

    // ========== HELP MODE ==========
    if (requestType === 'help') {
      systemPrompt = `You are a helpful writing assistant for IELTS Task 1 (visual description). When students click "Help Me!", identify the SINGLE most important issue and provide focused guidance:

If there's no overview statement or it's in the wrong place:
- Format your response as: "<strong>Missing content:</strong> [5-10 word hint about writing an overview]"

If key features or trends are missing:
- Format your response as: "<strong>Missing content:</strong> [5-10 word hint about what data to describe]"

If there are no comparisons or the structure is unclear:
- Format your response as: "<strong>Structure issue:</strong> [5-10 word hint about organizing the description]"

If data is described inaccurately or numbers are wrong:
- Format your response as: "<strong>Data accuracy:</strong> [5-10 word hint about checking the visual]"

If the description is too repetitive or uses limited vocabulary:
- Format your response as: "<strong>Word choice:</strong> [suggest specific words to replace or vary]"

If the grammar is faulty:
- Format your response as: "<strong>Grammar check:</strong> [sentence to review]"

If the essay is generally good:
- Format your response as: "<strong>Good progress!</strong> Your description is taking shape well. Ready for full feedback?"`;

      userPrompt = `Task type: ${taskType || 'visual description'}
Student's description: "${content}"`;
    }

    // ========== FULL FEEDBACK MODE ==========
    else if (requestType === 'full-feedback') {
      systemPrompt = `You are an expert IELTS Task 1 assessor. Analyze this visual description according to the four Task 1 criteria. Provide balanced feedback suitable for a B2 ESL student.

Structure your response with these exact sections (use <strong> tags):

<strong>Task Achievement:</strong>
<strong>Coherence and Cohesion:</strong>
<strong>Lexical Resource:</strong>
<strong>Grammatical Range and Accuracy:</strong>

Be specific, constructive, and concise.`;

      userPrompt = `Task type: ${taskType || 'visual description'}
Task image URL: ${imageUrl}

Student's description:
${content}

Provide feedback on how well this description represents the visual data.`;

      generateImage = true;
    }

    // ========== LIVE TYPING FEEDBACK ==========
    else {
      systemPrompt = `You are a helpful writing assistant for IELTS Task 1. Provide brief, constructive feedback (under 50 words) on the student's description.`;
      userPrompt = `Task type: ${taskType}
Description fragment: "${content}"`;
    }

    // --- Get text feedback ---
    const feedbackResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: requestType === 'full-feedback' ? 600 : 200
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const feedback = feedbackResponse.data.choices[0].message.content;

    // --- Generate visualization for full feedback ---
    let generatedImageUrl = null;
    if (generateImage && content.length > 100) {
      generatedImageUrl = await visualizeDescription(content);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        feedback,
        generatedImageUrl
      })
    };

  } catch (error) {
    console.error('Error:', error);
    const msg = error.response?.data?.error?.message || error.message;
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: true, feedback: msg })
    };
  }
};


// --- Visualization helper ---
async function visualizeDescription(content) {
  const axios = require("axios");
  try {
    const prompt = `
Render a neutral technical diagram that visually represents the student's description below.

Style guide:
• White background, 2-D flat layout.
• Use thin grey lines for borders or axes.
• Only rectangles, straight lines, or filled bars — NO icons, people, flags, shading, patterns, or text.
• Never include numbers or symbols (% etc.).
• If description mentions “table”, “columns”, or “rows”, draw a simple rectangular grid with a few cells.
• If it mentions “chart”, “graph”, or “trend”, draw 2–4 plain bars or lines.
• If it mentions “map”, draw two plain outline shapes side-by-side.
• Use 2–3 muted colours (light blue / grey tones only).

Goal: make it look like a blank IELTS-style exam visual, not artwork.

Student description:
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
        quality: "standard",
        style: "natural" // natural suppresses surreal/illustrative
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 60000
      }
    );

    return response.data.data[0].url;
  } catch (error) {
    console.error("Error generating visualization:", error.response?.data || error.message);
    return null;
  }
}

