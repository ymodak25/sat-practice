import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDirectory = resolve(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const maxBodyBytes = 1_000_000;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function getOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") return content.text;
      if (typeof content.refusal === "string") {
        throw new Error("The AI could not complete this request. Please try a different prompt.");
      }
    }
  }
  throw new Error("The AI returned no readable content.");
}

function parseJsonResponse(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("The AI returned an invalid response. Please try again.");
  }
}

async function callOpenAI({ apiKey, model, instructions, input, schema }) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("Add an API key in Settings to use AI practice.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: typeof model === "string" && model.trim() ? model.trim() : "gpt-5-mini",
      instructions,
      input,
      text: {
        format: {
          type: "json_schema",
          name: schema.name,
          strict: true,
          schema: schema.definition,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI request failed (${response.status}).`;
    throw new Error(message);
  }
  return parseJsonResponse(getOutputText(payload));
}

const questionSchema = {
  name: "sat_practice_set",
  definition: {
    type: "object",
    additionalProperties: false,
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "section",
            "domainId",
            "skillId",
            "difficulty",
            "type",
            "stem",
            "choices",
            "answer",
            "explanation",
            "strategy",
          ],
          properties: {
            id: { type: "string" },
            section: { type: "string", enum: ["Math", "Reading & Writing"] },
            domainId: { type: "string" },
            skillId: { type: "string" },
            difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
            type: { type: "string", enum: ["multiple_choice", "grid_in"] },
            stem: { type: "string" },
            choices: { type: "array", items: { type: "string" } },
            answer: { type: "string" },
            explanation: { type: "string" },
            strategy: { type: "string" },
          },
        },
      },
    },
  },
};

const analysisSchema = {
  name: "sat_answer_feedback",
  definition: {
    type: "object",
    additionalProperties: false,
    required: ["isCorrect", "misconception", "feedback", "nextStep"],
    properties: {
      isCorrect: { type: "boolean" },
      misconception: { type: "string" },
      feedback: { type: "string" },
      nextStep: { type: "string" },
    },
  },
};

const questionInstructions = `You create original, high-quality Digital SAT practice questions. You are not a source of official College Board questions. Never reproduce, paraphrase too closely, or refer to any copyrighted test or Question Bank item. Follow the given official topic metadata exactly. Produce self-contained, accurate questions. Reading & Writing questions must use a brief original passage or notes when needed and have exactly four plausible choices. Math questions should be solvable without hidden assumptions; use four choices for multiple_choice and an empty choices array for grid_in. The answer must be the exact correct option text for multiple choice or a simple accepted numeric expression for grid in. Explain the key reasoning succinctly.`;

const analysisInstructions = `You are a supportive SAT tutor reviewing one answer. Be precise, concise, and encouraging. Do not falsely claim an answer is correct. Identify the likely reasoning error rather than merely saying it was wrong. Use the supplied official skill metadata; do not reproduce copyrighted SAT material.`;

async function handleGenerate(request, response) {
  const body = await readJson(request);
  const topics = Array.isArray(body.topics) ? body.topics.slice(0, 10) : [];
  if (!topics.length) throw new Error("Choose at least one SAT skill first.");

  const count = Math.max(1, Math.min(10, Number(body.count) || 5));
  const input = JSON.stringify({
    task: "Create an adaptive SAT practice set.",
    requestedQuestionCount: count,
    difficulty: ["Easy", "Medium", "Hard"].includes(body.difficulty) ? body.difficulty : "Medium",
    learnerContext: typeof body.learnerContext === "string" ? body.learnerContext.slice(0, 1600) : "New learner; create a balanced diagnostic set.",
    allowedTopics: topics,
    requiredRules: [
      "Use only the supplied domainId and skillId values.",
      "Use original content, never official or scraped SAT questions.",
      "Include a short strategy and a correct explanation for every question.",
      "Return exactly the requested number of questions when feasible.",
    ],
  });
  const result = await callOpenAI({
    apiKey: body.apiKey,
    model: body.model,
    instructions: questionInstructions,
    input,
    schema: questionSchema,
  });
  sendJson(response, 200, result);
}

async function handleAnalyze(request, response) {
  const body = await readJson(request);
  const input = JSON.stringify({
    task: "Analyze the learner's answer and suggest the most useful next step.",
    question: body.question,
    learnerAnswer: body.learnerAnswer,
    correctAnswer: body.correctAnswer,
    skill: body.skill,
    deterministicResult: Boolean(body.deterministicResult),
  });
  const result = await callOpenAI({
    apiKey: body.apiKey,
    model: body.model,
    instructions: analysisInstructions,
    input,
    schema: analysisSchema,
  });
  sendJson(response, 200, result);
}

async function handleHealth(request, response) {
  const body = await readJson(request);
  if (typeof body.apiKey !== "string" || !body.apiKey.trim()) {
    throw new Error("Enter an API key first.");
  }
  const upstream = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${body.apiKey.trim()}` },
  });
  if (!upstream.ok) {
    const payload = await upstream.json().catch(() => ({}));
    throw new Error(payload?.error?.message || "The API key could not be verified.");
  }
  sendJson(response, 200, { ok: true });
}

function serveStatic(request, response, pathname) {
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const targetPath = normalize(join(publicDirectory, relativePath));
  if (!targetPath.startsWith(publicDirectory) || !existsSync(targetPath) || !statSync(targetPath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(targetPath)] || "application/octet-stream",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(targetPath).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "POST" && url.pathname === "/api/generate") return await handleGenerate(request, response);
    if (request.method === "POST" && url.pathname === "/api/analyze") return await handleAnalyze(request, response);
    if (request.method === "POST" && url.pathname === "/api/health") return await handleHealth(request, response);
    if (request.method === "GET") return serveStatic(request, response, url.pathname);
    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : "Unexpected server error." });
  }
});

server.listen(port, () => {
  console.log(`Northstar SAT is running at http://localhost:${port}`);
});
