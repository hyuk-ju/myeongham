import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const evidencePath = ".omo/evidence/business-card-priority-fixes/task-4-openai-live.json";
const company = process.env.OPENAI_LIVE_COMPANY?.trim() || "OpenAI";
const model = process.env.OPENAI_SEARCH_MODEL?.trim() || "gpt-5.6";

await mkdir(".omo/evidence/business-card-priority-fixes", { recursive: true });

if (!process.env.OPENAI_API_KEY) {
  await writeFile(
    evidencePath,
    JSON.stringify({ status: "blocked_external", reason: "missing_openai_api_key" }) + "\n",
  );
  console.log(JSON.stringify({ status: "blocked_external", reason: "missing_openai_api_key" }));
  process.exit(0);
}

if (model !== "gpt-5.6") {
  await writeFile(
    evidencePath,
    JSON.stringify({ status: "blocked_external", reason: "disallowed_search_model" }) + "\n",
  );
  console.log(JSON.stringify({ status: "blocked_external", reason: "disallowed_search_model" }));
  process.exit(0);
}

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    input: `Research this company and return a concise structured result: ${company}`,
    tools: [{ type: "web_search" }],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "company_enrichment",
        strict: true,
        schema: {
          type: "object",
          properties: {
            industry: { type: ["string", "null"] },
            capabilities: { type: "array", items: { type: "string" } },
            summary: { type: ["string", "null"] },
            confident: { type: "boolean" },
          },
          required: ["industry", "capabilities", "summary", "confident"],
          additionalProperties: false,
        },
      },
    },
  }),
});

const body = await response.json();
const searches = Array.isArray(body.output)
  ? body.output.filter((item) => item?.type === "web_search_call" && item?.status === "completed")
  : [];
const sourceCount = searches.reduce(
  (total, item) =>
    total + (Array.isArray(item.action?.sources) ? item.action.sources.length : 0),
  0,
);
const responseId = typeof body.id === "string" ? body.id : "";
const result = {
  status: response.ok && body.status === "completed" ? "passed" : "blocked_external",
  company,
  model,
  searched: searches.length > 0,
  sourceCount,
  responseIdHash: responseId
    ? createHash("sha256").update(responseId).digest("hex")
    : null,
};
await writeFile(evidencePath, JSON.stringify(result) + "\n");
console.log(JSON.stringify(result));
