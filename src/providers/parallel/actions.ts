import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "parallel";

const rawObjectSchema = s.looseObject("The raw object returned by Parallel.");
const metadataValueSchema = s.anyOf("One metadata value stored with a Parallel task run.", [
  s.string("A metadata string value."),
  s.integer("A metadata integer value."),
  s.number("A metadata number value."),
  s.boolean("A metadata boolean value."),
]);
const warningSchema = s.looseObject("A warning returned by Parallel.", {
  type: s.string("The warning type."),
  message: s.string("The human-readable warning message."),
  detail: s.unknown("Optional detail supporting the warning."),
});
const usageItemSchema = s.object("A Parallel usage item.", {
  name: s.string("The SKU name reported by Parallel."),
  count: s.integer("The usage count for the SKU."),
});
const errorSchema = s.looseObject("A Parallel error object.", {
  ref_id: s.string("The Parallel error reference ID."),
  message: s.string("The human-readable error message."),
  detail: s.unknown("Optional detail supporting the error."),
});
const sourcePolicySchema = s.object(
  "Source policy for Parallel web results.",
  {
    include_domains: s.array(
      "Domains that Parallel should restrict results to.",
      s.string("One domain or bare domain extension."),
      { maxItems: 200 },
    ),
    exclude_domains: s.array(
      "Domains that Parallel should exclude from results.",
      s.string("One domain or bare domain extension."),
      { maxItems: 200 },
    ),
    after_date: s.date("Only include content published on or after this YYYY-MM-DD date."),
  },
  { optional: ["include_domains", "exclude_domains", "after_date"] },
);
const advancedSettingsSchema = s.looseObject("Advanced Parallel request settings.");
const taskSpecSchema = s.looseObject("Parallel task specification with input and output schemas.");
const webResultSchema = s.looseObject("A Parallel web search result.", {
  url: s.url("The result URL."),
  title: s.nullable(s.string("The webpage title, if available.")),
  publish_date: s.nullable(s.string("The webpage publish date in YYYY-MM-DD format.")),
  excerpts: s.array(
    "Relevant excerpts from the result URL, formatted as markdown.",
    s.string("One excerpt from the result."),
  ),
});
const extractResultSchema = s.looseObject("A Parallel extract result.", {
  url: s.url("The extracted URL."),
  title: s.nullable(s.string("The webpage title, if available.")),
  publish_date: s.nullable(s.string("The webpage publish date in YYYY-MM-DD format.")),
  excerpts: s.array(
    "Relevant excerpts from the extracted URL, formatted as markdown.",
    s.string("One excerpt from the extracted URL."),
  ),
  full_content: s.nullable(s.string("Full content from the URL formatted as markdown, if requested.")),
});
const extractErrorSchema = s.object("A Parallel extract error.", {
  url: s.url("The URL that failed extraction."),
  error_type: s.string("The Parallel extract error type."),
  http_status_code: s.nullable(s.integer("The upstream HTTP status code, if available.")),
  content: s.nullable(s.string("The error content returned by Parallel, if available.")),
});
const taskRunSchema = s.looseObject("A Parallel task run.", {
  run_id: s.string("The Parallel task run ID.", { minLength: 1 }),
  interaction_id: s.string("The interaction ID to reuse context in a future task run.", {
    minLength: 1,
  }),
  status: s.stringEnum("The current task run status.", [
    "queued",
    "action_required",
    "running",
    "completed",
    "failed",
    "cancelling",
    "cancelled",
  ]),
  is_active: s.boolean("Whether the run is currently active."),
  warnings: s.nullable(s.array("Warnings for the task run.", warningSchema)),
  error: s.nullable(errorSchema),
  processor: s.string("The processor used by the task run."),
  metadata: s.nullable(s.record("User-provided metadata stored with the run.", metadataValueSchema)),
  taskgroup_id: s.nullable(s.string("The task group ID, if the run belongs to a group.")),
  created_at: s.nullable(s.string("The task run creation timestamp as an RFC 3339 string.")),
  modified_at: s.nullable(s.string("The task run modification timestamp as an RFC 3339 string.")),
});
const taskRunOutputSchema = s.looseObject("Output from a completed Parallel task run.", {
  type: s.stringEnum("The output type.", ["json", "text"]),
  content: s.unknown("The output content returned by Parallel."),
  basis: s.array("Basis entries supporting the output.", rawObjectSchema),
  output_schema: s.nullable(rawObjectSchema),
  mcp_tool_calls: s.nullable(s.array("MCP tool calls made by the task.", rawObjectSchema)),
});

const searchAction = defineProviderAction(service, {
  name: "search",
  description: "Search the web with Parallel and return ranked source excerpts.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for Parallel Search.",
    {
      search_queries: s.array(
        "Concise keyword search queries. Parallel recommends at least one query and 2-3 for best results.",
        s.string("One concise keyword search query.", { minLength: 1 }),
        { minItems: 1 },
      ),
      objective: s.string(
        "Natural-language description of the search goal used with search_queries to focus results.",
        { minLength: 1 },
      ),
      mode: s.stringEnum("The Parallel search mode preset.", ["turbo", "basic", "advanced"]),
      max_chars_total: s.integer("Upper bound on total characters across excerpts from all results."),
      session_id: s.string("Session identifier shared across related Search and Extract calls.", {
        minLength: 1,
        maxLength: 1000,
      }),
      client_model: s.string("The model generating this request and consuming the results.", {
        minLength: 1,
      }),
      advanced_settings: advancedSettingsSchema,
    },
    {
      optional: ["objective", "mode", "max_chars_total", "session_id", "client_model", "advanced_settings"],
    },
  ),
  outputSchema: s.object("The response returned by Parallel Search.", {
    search_id: s.string("The Parallel search request ID."),
    results: s.array("Search results ordered by decreasing relevance.", webResultSchema),
    warnings: s.nullable(s.array("Warnings for the search request.", warningSchema)),
    usage: s.nullable(s.array("Usage metrics for the search request.", usageItemSchema)),
    session_id: s.string("Session identifier for related Search and Extract calls."),
    raw: rawObjectSchema,
  }),
});

const extractAction = defineProviderAction(service, {
  name: "extract",
  description: "Extract relevant markdown excerpts or full content from public URLs with Parallel.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for Parallel Extract.",
    {
      urls: s.array("URLs to extract content from. Parallel supports up to 20 URLs.", s.url("One URL to extract."), {
        minItems: 1,
        maxItems: 20,
      }),
      objective: s.string("Natural-language description of the extraction goal used to focus excerpts.", {
        minLength: 1,
      }),
      search_queries: s.array(
        "Optional keyword search queries used with objective to focus excerpts.",
        s.string("One keyword search query.", { minLength: 1 }),
        { minItems: 1 },
      ),
      max_chars_total: s.integer("Upper bound on total characters across excerpts from all extracted results."),
      session_id: s.string("Session identifier shared across related Search and Extract calls.", {
        minLength: 1,
        maxLength: 1000,
      }),
      client_model: s.string("The model generating this request and consuming the results.", {
        minLength: 1,
      }),
      advanced_settings: advancedSettingsSchema,
    },
    {
      optional: ["objective", "search_queries", "max_chars_total", "session_id", "client_model", "advanced_settings"],
    },
  ),
  outputSchema: s.object("The response returned by Parallel Extract.", {
    extract_id: s.string("The Parallel extract request ID."),
    results: s.array("Successful extract results.", extractResultSchema),
    errors: s.array("Extract errors for requested URLs not in the results.", extractErrorSchema),
    warnings: s.nullable(s.array("Warnings for the extract request.", warningSchema)),
    usage: s.nullable(s.array("Usage metrics for the extract request.", usageItemSchema)),
    session_id: s.string("Session identifier for related Search and Extract calls."),
    raw: rawObjectSchema,
  }),
});

const createTaskRunAction = defineProviderAction(service, {
  name: "create_task_run",
  description: "Create a Parallel task run for web research or structured data enrichment.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a Parallel task run.",
    {
      processor: s.string("The Parallel processor to use for the task.", { minLength: 1 }),
      input: s.anyOf("The task input as text or a JSON object.", [
        s.string("Text input for the task.", { minLength: 1 }),
        rawObjectSchema,
      ]),
      metadata: s.record("User-provided metadata stored with the run.", metadataValueSchema),
      source_policy: sourcePolicySchema,
      advanced_settings: advancedSettingsSchema,
      task_spec: taskSpecSchema,
      previous_interaction_id: s.string("Interaction ID to use as context for this request.", {
        minLength: 1,
      }),
      enable_events: s.boolean("Whether Parallel should record progress events for the run."),
      webhook: rawObjectSchema,
      parallel_beta: s.string("Optional Parallel beta header value to enable beta features.", {
        minLength: 1,
      }),
    },
    {
      optional: [
        "metadata",
        "source_policy",
        "advanced_settings",
        "task_spec",
        "previous_interaction_id",
        "enable_events",
        "webhook",
        "parallel_beta",
      ],
    },
  ),
  outputSchema: s.object("The response returned when creating a Parallel task run.", {
    run: taskRunSchema,
  }),
});

const retrieveTaskRunAction = defineProviderAction(service, {
  name: "retrieve_task_run",
  description: "Retrieve the current status of a Parallel task run.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving a Parallel task run.", {
    run_id: s.string("The Parallel task run ID.", { minLength: 1 }),
  }),
  outputSchema: s.object("The response returned when retrieving a Parallel task run.", {
    run: taskRunSchema,
  }),
});

const retrieveTaskRunResultAction = defineProviderAction(service, {
  name: "retrieve_task_run_result",
  description: "Retrieve the result of a Parallel task run, blocking until completion or timeout.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for retrieving a Parallel task run result.",
    {
      run_id: s.string("The Parallel task run ID.", { minLength: 1 }),
      timeout: s.integer("Maximum seconds Parallel should wait for the result."),
      parallel_beta: s.string("Optional Parallel beta header value to enable beta features.", {
        minLength: 1,
      }),
    },
    { optional: ["timeout", "parallel_beta"] },
  ),
  outputSchema: s.object("The response returned when retrieving a Parallel task run result.", {
    run: taskRunSchema,
    output: taskRunOutputSchema,
    raw: rawObjectSchema,
  }),
});

export const parallelActions: ActionDefinition[] = [
  searchAction,
  extractAction,
  createTaskRunAction,
  retrieveTaskRunAction,
  retrieveTaskRunResultAction,
];
