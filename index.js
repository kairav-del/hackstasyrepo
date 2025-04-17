require("dotenv").config();
const express = require("express");
const { OpenAI } = require("openai");
const axios = require("axios");
const cors = require("cors");

const app = express(); // Move this up
app.use(express.json());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

// Environment Variables
const VEYRAX_API_KEY = process.env.VEYRAX_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Add this after your environment variables declarations
if (!VEYRAX_API_KEY || !OPENAI_API_KEY) {
  throw new Error("Missing required environment variables");
}

const headers = { VEYRAX_API_KEY: VEYRAX_API_KEY };

// Initialize OpenAI Client
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// Fetch available tools from Veyrax
let available_tools;
(async () => {
  try {
    const response = await axios.get("https://veyraxapp.com/get-tools", {
      headers,
    });
    available_tools = response.data;
    console.log(available_tools);
  } catch (error) {
    console.error("Error fetching tools:", error);
  }
})();

async function openaiCall(question) {
  const systemPrompt =
    `Available tools: ${JSON.stringify(available_tools)}. ` +
    'Please format your response as JSON with keys: "tool", "method", "parameters".';

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ],
    response_format: { type: "json_object" },
  });
  return JSON.parse(response.choices[0].message.content);
}

async function callTool(toolName, methodName, parameters) {
  const url = `https://veyraxapp.com/tool-call/${toolName}/${methodName}`;
  const response = await axios.post(url, parameters, { headers });
  return response.data;
}

// Add this function after the callTool function
async function processResultWithGPT(question, toolResult) {
  const systemPrompt =
    "You are a helpful assistant that explains tool results in a clear and concise way.";

  const userPrompt = `
  Original question: ${question}
  Tool execution result: ${JSON.stringify(toolResult)}
  Please provide a natural language response explaining the results.`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  return response.choices[0].message.content;
}

// Add root route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to NexFlow API",
    status: "active",
    timestamp: new Date().toISOString(),
  });
});

app.post("/process", async (req, res) => {
  console.log(req.body);
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    // Get tool selection from GPT
    const gptResponse = await openaiCall(question);

    // Execute the tool
    const toolResult = await callTool(
      gptResponse.tool,
      gptResponse.method,
      gptResponse.parameters
    );

    // Process results with GPT
    const finalResponse = await processResultWithGPT(question, toolResult);

    res.json({
      gpt_response: gptResponse,
      tool_result: toolResult,
      final_response: finalResponse,
      success: true,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 4000;

// Only start the server if not running on Vercel
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
