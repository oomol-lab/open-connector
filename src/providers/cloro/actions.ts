import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  aiModeMonitorRequest,
  bingAiModeMonitorRequest,
  chatGPTMonitorRequest,
  geminiMonitorRequest,
  googleGotoRequest,
  googleMonitorRequest,
  googleNewsMonitorRequest,
  googleProductRequest,
} from "./inputs.ts";
const actionLifecycles: Record<string, ActionDefinition["asyncLifecycle"]> = {
  create_task: { startActionId: "cloro.create_task", statusActionId: "cloro.get_task" },
};
const empty = s.requiredObject("No parameters.", {});
const success = s.boolean("Whether the request succeeded.");
const rawResult = s.looseObject(
  "Engine-specific structured result, including answer text, sources, search results and requested extra formats.",
  {},
);
const monitorOutput = s.looseRequiredObject("Monitoring response.", {
  success,
  result: s.anyOf("Structured result, or one result per ChatGPT conversation turn.", [
    rawResult,
    s.array("Conversation results in prompt order.", rawResult),
  ]),
});
const task = s.looseRequiredObject("Task identity and state.", {
  id: s.string("Task ID.", { format: "uuid" }),
  taskType: s.string("Task engine."),
  status: s.string("Task state: QUEUED, PROCESSING, COMPLETED or FAILED."),
  priority: s.integer("Task priority."),
  createdAt: s.string("Task creation timestamp."),
});
const credits = s.looseObject("Task credit usage reported by Cloro.", {});
const submitOutput = s.looseRequiredObject("Submitted task and credit information.", {
  success,
  task,
  credits,
});
const resultOutput = s.object(
  "Task state and final response. Finished tasks are retained for about 24 hours after creation.",
  {
    task,
    credits,
    response: s.looseObject(
      "Completed engine response or failed task error, including its code, message and details.",
      {},
    ),
    webhook: s.looseObject("Webhook delivery status, if configured.", {}),
  },
  {
    optional: ["response", "webhook"],
    additionalProperties: true,
  },
);
const engines = [
  { name: "chatgpt", taskType: "CHATGPT", schema: chatGPTMonitorRequest, label: "ChatGPT" },
  { name: "gemini", taskType: "GEMINI", schema: geminiMonitorRequest, label: "Gemini" },
  { name: "google", taskType: "GOOGLE", schema: googleMonitorRequest, label: "Google Search" },
  {
    name: "google/news",
    taskType: "GOOGLE_NEWS",
    schema: googleNewsMonitorRequest,
    label: "Google News",
  },
  { name: "aimode", taskType: "AIMODE", schema: aiModeMonitorRequest, label: "Google AI Mode" },
  {
    name: "bing/aimode",
    taskType: "BING_AIMODE",
    schema: bingAiModeMonitorRequest,
    label: "Bing AI Mode",
  },
  {
    name: "google/product",
    taskType: "GOOGLE_PRODUCT",
    schema: googleProductRequest,
    label: "Google product details",
  },
];
const taskInput = s.anyOf(
  "Task parameters matched to the selected engine.",
  engines.map((engine) =>
    s.object(
      `Async ${engine.label} task.`,
      {
        taskType: { type: "string", const: engine.taskType, description: "Task engine." },
        payload: engine.schema,
        priority: s.integer(
          "Priority from 1 to 10; higher runs first. Defaults to 1. Use high priority for product tokens that expire after five minutes.",
          { minimum: 1, maximum: 10 },
        ),
        idempotencyKey: s.string(
          "Account-wide unique key to prevent duplicate task submission. Reuse returns a conflict rather than creating another task.",
        ),
        webhook: s.requiredObject("Optional completion webhook delivered by Cloro.", {
          url: s.string("Webhook destination URL.", { format: "uri" }),
        }),
      },
      { optional: ["priority", "idempotencyKey", "webhook"] },
    ),
  ),
);
export interface CloroEndpoint {
  action: ActionDefinition;
  path: string;
  method: "GET" | "POST" | "DELETE";
  timeoutMs?: number;
  arrayField?: string;
}
function endpoint(
  name: string,
  description: string,
  path: string,
  method: CloroEndpoint["method"],
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
  operationType: ActionDefinition["operationType"] = "read",
  timeoutMs?: number,
  arrayField?: string,
): CloroEndpoint {
  return {
    path,
    method,
    timeoutMs,
    arrayField,
    action: defineProviderAction("cloro", {
      name,
      description,
      operationType,
      requiredScopes: [],
      inputSchema,
      outputSchema,
      asyncLifecycle: actionLifecycles[name],
    }),
  };
}
const endpoints: CloroEndpoint[] = [
  ...engines.map((engine) =>
    endpoint(
      `monitor_${engine.name.replaceAll("/", "_")}`,
      `Retrieve ${engine.label} results synchronously. For long-running or bulk work, use create_task or create_batch_tasks. Sync calls include a credit surcharge; Google product tokens expire after five minutes.`,
      `/v1/monitor/${engine.name}`,
      "POST",
      engine.schema,
      monitorOutput,
      "read",
      310000,
    ),
  ),
  endpoint(
    "resolve_google_link",
    "Resolve a Google redirect link through Cloro without consuming credits.",
    "/v1/monitor/google/goto",
    "POST",
    googleGotoRequest,
    s.looseRequiredObject("Resolved Google link.", { url: s.string("Resolved destination URL.") }),
  ),
  endpoint(
    "create_task",
    "Submit a native asynchronous monitoring task. Use get_task for the result; priority, idempotency and webhooks are supported.",
    "/v1/async/task",
    "POST",
    taskInput,
    submitOutput,
    "write",
  ),
  endpoint(
    "create_batch_tasks",
    "Submit up to 500 monitoring tasks. Each task is validated independently upstream; inspect results for partial failures.",
    "/v1/async/task/batch",
    "POST",
    s.requiredObject("Batch task submission.", {
      tasks: s.array("Tasks in submission order.", taskInput, { minItems: 1, maxItems: 500 }),
    }),
    s.looseRequiredObject("Batch submission results.", {
      success,
      summary: s.looseRequiredObject("Batch totals.", {
        total: s.integer("Total tasks."),
        succeeded: s.integer("Accepted tasks."),
        failed: s.integer("Rejected tasks."),
      }),
      results: s.array(
        "Per-task success or failure in original index order.",
        s.looseObject("Task submission result with index, success and task or error.", {}),
      ),
    }),
    "write",
  ),
  endpoint(
    "get_task",
    "Read task status and final engine response. Failed task details remain available in response.",
    "/v1/async/task/{taskId}",
    "GET",
    s.requiredObject("Task lookup.", { taskId: s.string("Task ID.", { format: "uuid" }) }),
    resultOutput,
    "read",
  ),
  endpoint(
    "get_queue_status",
    "Read queued and processing task counts and concurrency usage.",
    "/v1/async/status",
    "GET",
    empty,
    s.object(
      "Organization queue status.",
      {
        queuedTasks: s.integer("Queued task count."),
        processingTasks: s.integer("Processing task count."),
        priorityBreakdown: s.array(
          "Queue counts by priority.",
          s.looseRequiredObject("One priority level.", {
            priority: s.integer("Task priority."),
            count: s.integer("Queued task count."),
          }),
        ),
        concurrency: s.nullable(
          s.looseRequiredObject("Concurrency usage.", {
            used: s.integer("Used slots."),
            max: s.integer("Maximum slots."),
          }),
        ),
      },
      {
        optional: ["concurrency"],
        additionalProperties: true,
      },
    ),
  ),
  endpoint(
    "clear_queue",
    "Delete all QUEUED tasks in the organization. Processing, completed and failed tasks are unaffected.",
    "/v1/async/queue",
    "DELETE",
    empty,
    s.looseRequiredObject("Queue clearing result.", {
      success,
      cleared: s.integer("Number of removed queued tasks."),
    }),
    "destructive",
  ),
  endpoint(
    "get_credits",
    "Read organization credit balance and billing cycle. Values can be cached for up to 60 seconds.",
    "/v1/credits",
    "GET",
    empty,
    s.looseRequiredObject("Organization credit balance.", {
      remaining: s.integer("Remaining credits."),
      perCycle: s.nullable(s.integer("Credits per billing cycle; null without a subscription.")),
      cycleResetsAt: s.nullable(s.string("Cycle reset timestamp; null without a subscription.")),
    }),
  ),
  endpoint(
    "list_countries",
    "List supported country codes, optionally filtered by engine.",
    "/v1/countries",
    "GET",
    s.object(
      "Country lookup.",
      {
        model: s.stringEnum("Engine filter.", ["aimode", "aioverview", "bing_aimode", "chatgpt", "gemini", "google"]),
      },
      { optional: ["model"] },
    ),
    s.looseRequiredObject("Supported countries.", {
      countries: s.array("Country codes.", s.string("ISO country code.")),
    }),
    "read",
    undefined,
    "countries",
  ),
  endpoint(
    "list_states",
    "List supported US states. Other country codes return an empty list.",
    "/v1/states",
    "GET",
    s.requiredObject("State lookup.", {
      country: s.string("Uppercase ISO country code. Only US returns states.", {
        pattern: "^[A-Z]{2}$",
      }),
    }),
    s.looseRequiredObject("Supported states.", {
      states: s.array(
        "States.",
        s.looseRequiredObject("One state.", {
          code: s.string("USPS state code."),
          name: s.string("State name."),
        }),
      ),
    }),
    "read",
    undefined,
    "states",
  ),
];
export const cloroActions: ActionDefinition[] = endpoints.map(({ action }) => action);
export const cloroEndpointByName: Map<string, (typeof endpoints)[number]> = new Map(
  endpoints.map((value) => [value.action.name, value]),
);
