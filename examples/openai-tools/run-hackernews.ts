// OpenAI Responses API docs: https://platform.openai.com/docs/api-reference/responses/create
// OpenAI function calling flow: https://platform.openai.com/docs/guides/function-calling

import { adminHeaders, fetchJson, runtimeHeaders } from "../local-http/client.ts";

interface CatalogAction {
  id: string;
  description: string;
  inputSchema: unknown;
}

interface OpenAiFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: unknown;
}

interface OpenAiResponse {
  id: string;
  output?: OpenAiOutputItem[];
  output_text?: string;
}

type OpenAiOutputItem =
  | OpenAiFunctionCall
  | {
      type: string;
      text?: string;
      content?: Array<{ type: string; text?: string }>;
    };

interface OpenAiFunctionCall {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.log("Set OPENAI_API_KEY to run this example.");
  process.exit(0);
}

const model = process.env.OPENAI_MODEL;
if (!model) {
  console.log("Set OPENAI_MODEL to run this example.");
  process.exit(0);
}
const actions = (
  await fetchJson<CatalogAction[]>("http://localhost:3000/api/actions", {
    headers: adminHeaders(),
  })
).filter((action) => action.id.startsWith("hackernews."));
const toolNameToActionId = new Map(actions.map((action) => [toOpenAiToolName(action.id), action.id]));
const tools: OpenAiFunctionTool[] = actions.map((action) => ({
  type: "function",
  name: toOpenAiToolName(action.id),
  description: action.description,
  parameters: action.inputSchema,
}));

let input: unknown[] = [
  {
    role: "user",
    content: "Find the current top Hacker News story ids, then summarize what tool you used.",
  },
];

let response = await createResponse(model, tools, input);
const toolCalls = response.output?.filter(isFunctionCall) ?? [];
for (const toolCall of toolCalls) {
  const actionId = toolNameToActionId.get(toolCall.name);
  if (!actionId) {
    throw new Error(`Unknown tool call: ${toolCall.name}`);
  }

  const executionResult = await fetchJson(`http://localhost:3000/v1/actions/${actionId}`, {
    method: "POST",
    headers: runtimeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ input: JSON.parse(toolCall.arguments || "{}") }),
  });

  input.push(toolCall);
  input.push({
    type: "function_call_output",
    call_id: toolCall.call_id,
    output: JSON.stringify(executionResult),
  });
}

if (toolCalls.length > 0) {
  response = await createResponse(model, tools, input);
}

console.log(response.output_text ?? JSON.stringify(response.output, null, 2));

async function createResponse(model: string, tools: OpenAiFunctionTool[], input: unknown[]): Promise<OpenAiResponse> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      tools,
      input,
      tool_choice: "auto",
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as OpenAiResponse;
}

function toOpenAiToolName(actionId: string): string {
  return actionId.replaceAll(".", "__");
}

function isFunctionCall(item: OpenAiOutputItem): item is OpenAiFunctionCall {
  return item.type === "function_call";
}
