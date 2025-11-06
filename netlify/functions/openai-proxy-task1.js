const axios = require("axios");
const fs = require("fs");
const path = require("path");

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers };
  }

  try {
    const { content, requestType, taskType } = JSON.parse(event.body || "{}");

    // === Branch 1: Table → ASCII table only ===
    if (taskType === "table") {
      const asciiPrompt = `
You are an IELTS Task 1 helper.
The student's description below refers to a TABLE.
Recreate it as a neat ASCII table (plain text, no markdown).
Do not explain — only output the table itself.

Student's description:
"""
${content}
"""`;

      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Output only ASCII tables." },
            { role: "user", content: asciiPrompt },
          ],
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const asciiTable = response.data.choices[0].message.content.trim();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ asciiTable }),
      };
    }

    // === Branch 2: Other visuals → Python-based processing ===
    const pythonPrompt = `
You are a Python data visualization assistant.
Your task: read the student's IELTS Task 1 description below, identify what kind of chart it describes (line graph, bar chart, pie chart, etc.), then write a Python script that recreates a simple version of the described data visualization.

Rules:
- Use well-known libraries: pandas and matplotlib.
- You may create synthetic example data consistent with the student's description (approximate values are fine).
- Plot clearly labelled axes and use 2D flat design.
- Save the chart to a file named "chart.png".
- Output only the Python code, nothing else.

Student's description:
"""
${content}
"""`;

    const codeResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You output only executable Python scripts that use pandas and matplotlib.",
          },
          { role: "user", content: pythonPrompt },
        ],
        max_tokens: 800,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const pythonCode = codeResponse.data.choices[0].message.content;

    // === Run Python code locally ===
    const tmpFile = path.join("/tmp", `chart_${Date.now()}.py`);
    fs.writeFileSync(tmpFile, pythonCode);

    const { spawnSync } = require("child_process");
    const result = spawnSync("python3", [tmpFile], { encoding: "utf8" });

    const chartPath = path.join("/tmp", "chart.png");
    if (fs.existsSync(chartPath)) {
      const imgData = fs.readFileSync(chartPath).toString("base64");
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          feedback: "Python chart generated successfully.",
          pythonCode,
          generatedImageBase64: `data:image/png;base64,${imgData}`,
        }),
      };
    } else {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: true,
          feedback:
            "Python did not produce an image. Output:\n" + result.stderr,
          pythonCode,
        }),
      };
    }
  } catch (error) {
    console.error("Error:", error);
    const msg = error.response?.data?.error?.message || error.message;
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: true, feedback: msg }),
    };
  }
};
