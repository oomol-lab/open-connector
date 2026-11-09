import type { ActionDefinition, JsonSchema } from "../../core/types.ts";
import type { AisaActionRoute } from "./routes.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { aisaJobOutput, aisaJobSubmissionProperties, aisaJobTaskId } from "./async-job-schema.ts";

const exaInput = s.object(
  "Start an Exa research task.",
  {
    ...aisaJobSubmissionProperties,
    query: s.string("The research question or instructions.", {
      minLength: 1,
    }),
    systemPrompt: s.nullable(s.string("Optional system instructions for the research agent.")),
    effort: s.nullable(
      s.stringEnum("Research effort; AIsa currently supports only minimal, which is the default.", ["", "minimal"]),
    ),
  },
  { required: ["query"] },
);

const oxylabsInput = s.object(
  "Collect an answer from a consumer AI service with Oxylabs.",
  {
    ...aisaJobSubmissionProperties,
    source: s.stringEnum("The consumer AI service to query.", ["chatgpt", "gemini", "perplexity"]),
    prompt: s.string(
      "The prompt; at most 4000 UTF-8 bytes for ChatGPT or 8000 for Gemini and Perplexity after trimming.",
      {
        minLength: 1,
      },
    ),
    context: s.unknown("Provider-defined context for the requested source."),
    geoLocation: s.nullable(s.string("Geographic location used for the request.")),
    locale: s.nullable(s.string("Locale used for the request.")),
    parse: s.nullable(s.boolean("Whether Oxylabs should parse the response.")),
    render: s.nullable(s.string("Rendering mode supported by the selected source.")),
    userAgentType: s.nullable(s.string("User agent type used for the request.")),
  },
  { required: ["source", "prompt"] },
);

interface ResearchTaskFamily {
  name: string;
  label: string;
  path: string;
  inputSchema: JsonSchema;
  description: string;
  body: Record<string, string>;
}

const families: ResearchTaskFamily[] = [
  {
    name: "exa_research",
    label: "Exa research",
    path: "/apis/v1/exa/agent/runs",
    inputSchema: exaInput,
    description: "Start background web research with Exa. Poll the returned task ID for the research output.",
    body: { query: "query", systemPrompt: "systemPrompt", effort: "effort" },
  },
  {
    name: "oxylabs_answer",
    label: "Oxylabs answer collection",
    path: "/apis/v1/oxylabs/llm",
    inputSchema: oxylabsInput,
    description:
      "Collect a ChatGPT, Gemini or Perplexity answer with Oxylabs for AI visibility research. Poll the returned task ID for results.",
    body: {
      source: "source",
      prompt: "prompt",
      context: "context",
      geoLocation: "geo_location",
      locale: "locale",
      parse: "parse",
      render: "render",
      userAgentType: "user_agent_type",
    },
  },
];

export const researchTaskActions: readonly ActionDefinition[] = families.flatMap((family) => [
  defineProviderAction("aisa", {
    name: `submit_${family.name}`,
    operationType: "write",
    requiredScopes: [],
    description: family.description,
    inputSchema: family.inputSchema,
    outputSchema: s.object("The submitted task handle.", { taskId: aisaJobTaskId }, { optional: [] }),
    asyncLifecycle: { startActionId: "aisa." + `submit_${family.name}`, statusActionId: `aisa.get_${family.name}` },
  }),
  defineProviderAction("aisa", {
    name: `get_${family.name}`,
    operationType: "read",
    requiredScopes: [],
    description: `Get the ${family.label} task state, output and final pricing. Check outputExpired and job errors even after completion.`,
    inputSchema: s.object("Identify the task to query.", { taskId: aisaJobTaskId }, { optional: [] }),
    outputSchema: aisaJobOutput,
  }),
  defineProviderAction("aisa", {
    name: `cancel_${family.name}`,
    operationType: "destructive",
    requiredScopes: [],
    description: `Request cancellation of the ${family.label} task. Work already performed may still be charged; poll for final state and pricing.`,
    inputSchema: s.object("Identify the task to cancel.", { taskId: aisaJobTaskId }, { optional: [] }),
    outputSchema: aisaJobOutput,
  }),
]);

export const researchTaskRoutes: Record<string, AisaActionRoute> = {};

for (const family of families) {
  researchTaskRoutes[`submit_${family.name}`] = {
    path: family.path,
    method: "POST",
    query: {},
    body: family.body,
    asyncJob: "submit",
  };
  researchTaskRoutes[`get_${family.name}`] = {
    path: `${family.path}/{taskId}`,
    query: {},
    pathParams: { taskId: "taskId" },
    asyncJob: "get",
  };
  researchTaskRoutes[`cancel_${family.name}`] = {
    path: `${family.path}/{taskId}/cancel`,
    method: "POST",
    query: {},
    pathParams: { taskId: "taskId" },
    asyncJob: "cancel",
  };
}
