const axios = require('axios');

exports.handler = async function(event, context) {
  // Enable CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers
    };
  }
  
  try {
    const { content, requestType, taskType, imageUrl } = JSON.parse(event.body);
    
    // Different system prompts based on request type
    let systemPrompt;
    let userPrompt;
    let generateImage = false;
    
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
- Format your response as: "<strong>Good progress!</strong> Your description is taking shape well. Ready for full feedback?"

Choose only ONE category and keep your hint brief and actionable.`;
      
      userPrompt = `Task type: ${taskType || 'visual description'}
Student's description so far: "${content}"`;
      
    } else if (requestType === 'full-feedback') {
      systemPrompt = `You are an expert IELTS Task 1 assessor. Analyze this visual description according to the four Task 1 criteria. Provide balanced feedback suitable for a B2 ESL student.

Structure your response with these exact sections (use <strong> tags):

<strong>Task Achievement:</strong>
Evaluate if the student:
- Provided a clear overview of main trends/features
- Selected and reported key information appropriately
- Highlighted important comparisons
- Included relevant data/figures
- Met the 150-word minimum

<strong>Coherence and Cohesion:</strong>
Evaluate:
- Overall organization and paragraphing
- Use of cohesive devices (linking words, references)
- Logical progression of ideas
- Clear topic sentences

<strong>Lexical Resource:</strong>
Evaluate:
- Range of vocabulary for describing trends/data
- Accuracy of word choice
- Variety in language (avoiding repetition)
- Use of appropriate academic/formal vocabulary

<strong>Grammatical Range and Accuracy:</strong>
Evaluate:
- Variety of sentence structures
- Accuracy of grammar
- Use of appropriate tenses (usually present or past)
- Complex sentences where appropriate

Keep each section concise (2-3 sentences). Be constructive and specific.`;

      userPrompt = `Task type: ${taskType || 'visual description'}
Task image URL: ${imageUrl}

Student's description:
${content}

Provide feedback on how well this description represents the visual data.`;
      
      generateImage = true;
      
    } else {
      // Regular feedback during typing
      systemPrompt = `You are a helpful writing assistant for IELTS Task 1. Provide brief, constructive feedback on the student's description in progress. Focus on one key improvement. Keep your response under 50 words and be specific.`;
      userPrompt = `Task type: ${taskType}
Description fragment: "${content}"`;
    }
    
    // Generate text feedback
    const feedbackResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
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
    
    // Generate image if requested (for full feedback only)
    let generatedImageUrl = null;
    
    if (generateImage && content.length > 100) {
      try {
        console.log('Attempting to generate comparison image...');
        
        // Create a prompt for DALL-E based on the task type
        const imagePrompt = createImagePrompt(taskType);
        
        console.log('DALL-E prompt:', imagePrompt.substring(0, 100) + '...');
        
        const imageResponse = await axios.post(
          'https://api.openai.com/v1/images/generations',
          {
            model: 'dall-e-3',
            prompt: imagePrompt,
            n: 1,
            size: '1024x1024',
            quality: 'standard',
            style: 'natural'
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 60000 // 60 second timeout
          }
        );
        
        generatedImageUrl = imageResponse.data.data[0].url;
        console.log('Image generated successfully');
      } catch (imageError) {
        console.error('Error generating image:', imageError.response?.data || imageError.message);
        // Continue without image - feedback is still valuable
        // Don't fail the whole request just because image generation failed
      }
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
    let errorMessage = 'Unable to generate feedback at this time.';
    
    if (error.response) {
      console.error('API Error:', error.response.data);
      errorMessage += ` Error: ${error.response.status} - ${error.response.data.error?.message || 'API error'}. `;
    } else if (error.request) {
      errorMessage += ' Network error - couldn\'t connect to the API. ';
    } else {
      errorMessage += ` ${error.message}. `;
    }
    
    errorMessage += 'Please try again!';
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: true, feedback: errorMessage })
    };
  }
};

// Simplified image prompt that avoids DALL-E content policy issues
function createImagePrompt(taskType) {
  const prompts = {
    'table': 'A clean, minimalist data table design in educational style. Simple grid layout with 3-4 rows and 3-4 columns, showing abstract data visualization. White background, thin gray lines, professional appearance like IELTS exam materials. No specific text or numbers, just the table structure with neutral blue header.',
    
    'line-graph': 'A simple line graph with 2-3 colored lines showing different trends over time. Clean white background, gray gridlines, axis lines visible. Lines show various patterns: one increasing, one decreasing, one stable. Minimalist design suitable for educational materials. Professional data visualization style.',
    
    'bar-chart': 'A clean bar chart with 3-4 groups of bars in neutral colors (blue, gray, green). White background with subtle gridlines. Bars of varying heights showing comparison data. Minimalist, professional style suitable for IELTS exam visuals. Simple and clear design.',
    
    'pie-chart': 'A simple pie chart divided into 4-5 segments in neutral colors (blue, green, gray, teal). Clean white background, thin border lines. Professional educational style. Segments of different sizes showing proportion data. Minimalist design suitable for exam materials.',
    
    'flowchart': 'A simple process flowchart with 4-6 rectangular boxes connected by arrows. Clean white background, boxes in light blue. Arrows showing flow direction. Minimalist professional style suitable for educational diagrams. Clear visual hierarchy.',
    
    'maps': 'Two simple maps side by side showing geographical comparison. Clean white background, minimal colors (light blue, green, gray). Simple shapes representing regions or areas. Professional educational style suitable for exam materials. Abstract geographic visualization.'
  };

  return prompts[taskType] || prompts['line-graph'];
}
