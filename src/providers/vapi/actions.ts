import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "vapi";

const jsonValueSchema = s.unknown("A raw JSON value returned by Vapi.");
const jsonObjectSchema = s.looseObject("A raw JSON object returned by Vapi.");
const jsonObjectArraySchema = s.array("A list of raw Vapi objects.", jsonObjectSchema);
const stringArraySchema = s.array("A list of string values.", s.string("A string item."));
const idSchema = s.nonEmptyString("The unique identifier of the target resource.");
const pageSchema = s.integer("The page number for pagination.", { minimum: 1 });
const limitSchema = s.integer("The maximum number of items to return.", { minimum: 1, maximum: 1000 });
const sortOrderSchema = s.stringEnum("The sort order for pagination.", ["ASC", "DESC"]);
const timestampFilterFields: Record<string, JsonSchema> = {
  createdAtGe: s.string("Return items created on or after this ISO 8601 date-time string."),
  createdAtGt: s.string("Return items created after this ISO 8601 date-time string."),
  createdAtLe: s.string("Return items created on or before this ISO 8601 date-time string."),
  createdAtLt: s.string("Return items created before this ISO 8601 date-time string."),
  updatedAtGe: s.string("Return items updated on or after this ISO 8601 date-time string."),
  updatedAtGt: s.string("Return items updated after this ISO 8601 date-time string."),
  updatedAtLe: s.string("Return items updated on or before this ISO 8601 date-time string."),
  updatedAtLt: s.string("Return items updated before this ISO 8601 date-time string."),
};

const paginationMetadataSchema = s.looseObject("Pagination metadata returned by Vapi.", {
  page: s.integer("The current page number."),
  limit: s.integer("The configured page size."),
  total: s.integer("The total number of matching items."),
  currentPage: s.integer("The current page number reported by Vapi."),
  itemsPerPage: s.integer("The number of items per page reported by Vapi."),
  totalItems: s.integer("The total number of items reported by Vapi."),
});

const assistantSchema = s.looseObject("A Vapi assistant.", {
  id: s.string("The unique identifier of the assistant."),
  name: s.string("The assistant name."),
  orgId: s.string("The organization identifier that owns the assistant."),
  model: jsonObjectSchema,
  voice: jsonObjectSchema,
  metadata: jsonObjectSchema,
  transcriber: jsonObjectSchema,
  createdAt: s.string("When the assistant was created."),
  updatedAt: s.string("When the assistant was last updated."),
  firstMessage: s.string("The first message spoken by the assistant."),
});

const callSchema = s.looseObject("A Vapi call.", {
  id: s.string("The unique identifier of the call."),
  status: s.string("The call status reported by Vapi."),
  type: s.string("The call type."),
  cost: s.number("The total cost for the call."),
  duration: s.number("The call duration in seconds."),
  assistantId: s.string("The assistant identifier attached to the call."),
  phoneNumberId: s.string("The phone number identifier attached to the call."),
  createdAt: s.string("When the call was created."),
  startedAt: s.string("When the call started."),
  endedAt: s.string("When the call ended."),
  messages: jsonObjectArraySchema,
  artifact: jsonObjectSchema,
});

const chatSchema = s.looseObject("A Vapi chat.", {
  id: s.string("The unique identifier of the chat."),
  name: s.string("The chat name."),
  assistantId: s.string("The assistant identifier used for the chat."),
  sessionId: s.string("The session identifier attached to the chat."),
  squadId: s.string("The squad identifier attached to the chat."),
  previousChatId: s.string("The previous chat identifier used as context."),
  createdAt: s.string("When the chat was created."),
  updatedAt: s.string("When the chat was last updated."),
  messages: jsonObjectArraySchema,
  input: jsonValueSchema,
  output: jsonValueSchema,
});

const evalSchema = s.looseObject("A Vapi eval.", {
  id: s.string("The unique identifier of the eval."),
  name: s.string("The eval name."),
  type: s.string("The eval type."),
  description: s.string("The eval description."),
  orgId: s.string("The organization identifier that owns the eval."),
  messages: jsonObjectArraySchema,
  createdAt: s.string("When the eval was created."),
  updatedAt: s.string("When the eval was last updated."),
});

const fileSchema = s.looseObject("A Vapi file.", {
  id: s.string("The unique identifier of the file."),
  name: s.string("The file name."),
  status: s.string("The file processing status."),
  url: s.string("The canonical URL of the file."),
  path: s.string("The storage path of the file."),
  bytes: s.integer("The file size in bytes."),
  bucket: s.string("The storage bucket name."),
  mimetype: s.string("The file MIME type."),
  purpose: s.string("The purpose assigned to the file."),
  metadata: jsonObjectSchema,
  orgId: s.string("The organization identifier that owns the file."),
  createdAt: s.string("When the file was created."),
  updatedAt: s.string("When the file was last updated."),
  parsedTextUrl: s.string("The URL of the parsed text artifact."),
});

const policySchema = s.looseObject("A Vapi monitoring policy.", {
  id: s.string("The unique identifier of the monitoring policy."),
  name: s.string("The policy name."),
  severity: s.string("The policy severity."),
  threshold: jsonObjectSchema,
  interval: jsonObjectSchema,
  schedule: jsonObjectSchema,
  monitorIds: stringArraySchema,
  lookbackWindowMinutes: s.integer("The lookback window, in minutes."),
  createdAt: s.string("When the policy was created."),
  updatedAt: s.string("When the policy was last updated."),
});

const providerResourceSchema = s.looseObject("A Vapi provider resource.", {
  id: s.string("The unique identifier of the provider resource."),
  provider: s.string("The provider that owns the resource."),
  resourceName: s.string("The provider resource type."),
  resourceId: s.string("The provider-side resource identifier."),
  resource: jsonObjectSchema,
  orgId: s.string("The organization identifier that owns the resource."),
  createdAt: s.string("When the resource was created."),
  updatedAt: s.string("When the resource was last updated."),
});

const phoneNumberSchema = s.looseObject("A Vapi phone number.", {
  id: s.string("The unique identifier of the phone number."),
  name: s.string("The display name of the phone number."),
  number: s.string("The E.164 phone number."),
  provider: s.string("The provider that manages the phone number."),
  status: s.string("The phone number status reported by Vapi."),
  assistantId: s.string("The assistant identifier attached to the phone number."),
  workflowId: s.string("The workflow identifier attached to the phone number."),
  squadId: s.string("The squad identifier attached to the phone number."),
  createdAt: s.string("When the phone number was created."),
  updatedAt: s.string("When the phone number was last updated."),
});

const structuredOutputSchema = s.looseObject("A Vapi structured output definition.", {
  id: s.string("The unique identifier of the structured output."),
  name: s.string("The structured output name."),
  schema: jsonObjectSchema,
  createdAt: s.string("When the structured output was created."),
  updatedAt: s.string("When the structured output was last updated."),
});

const insightSchema = s.looseObject("A Vapi insight.", {
  id: s.string("The unique identifier of the insight."),
  name: s.string("The insight name."),
  type: s.string("The visualization type for the insight."),
  groupBy: s.string("The field used to group the insight."),
  queries: jsonObjectArraySchema,
  formulas: jsonObjectArraySchema,
  formula: jsonObjectSchema,
  metadata: jsonObjectSchema,
  timeRange: jsonValueSchema,
  orgId: s.string("The organization identifier that owns the insight."),
  createdAt: s.string("When the insight was created."),
  updatedAt: s.string("When the insight was last updated."),
});

const scorecardSchema = s.looseObject("A Vapi scorecard.", {
  id: s.string("The unique identifier of the scorecard."),
  name: s.string("The scorecard name."),
  description: s.string("The scorecard description."),
  metrics: jsonObjectArraySchema,
  assistantIds: stringArraySchema,
  orgId: s.string("The organization identifier that owns the scorecard."),
  createdAt: s.string("When the scorecard was created."),
  updatedAt: s.string("When the scorecard was last updated."),
});

const sessionSchema = s.looseObject("A Vapi session.", {
  id: s.string("The unique identifier of the session."),
  name: s.string("The session name."),
  assistantId: s.string("The assistant identifier attached to the session."),
  orgId: s.string("The organization identifier that owns the session."),
  createdAt: s.string("When the session was created."),
  updatedAt: s.string("When the session was last updated."),
});

const toolSchema = s.looseObject("A Vapi tool.", {
  id: s.string("The unique identifier of the tool."),
  name: s.string("The tool name."),
  type: s.string("The tool type."),
  async: s.boolean("Whether the tool executes asynchronously."),
  url: s.string("The URL used by the tool."),
  method: s.string("The HTTP method used by the tool."),
  description: s.string("The tool description."),
  server: jsonObjectSchema,
  function: jsonObjectSchema,
  messages: jsonObjectArraySchema,
  destinations: jsonObjectArraySchema,
  createdAt: s.string("When the tool was created."),
  updatedAt: s.string("When the tool was last updated."),
});

const analyticsResultSchema = s.looseObject("A Vapi analytics query result.", {
  name: s.string("The query name returned by the analytics request."),
  rows: jsonObjectArraySchema,
  result: jsonValueSchema,
});

const openAiChatResponseSchema = s.looseObject("A Vapi OpenAI-compatible chat response.", {
  id: s.string("The unique identifier of the OpenAI-compatible response."),
  object: s.string("The response object type."),
  status: s.string("The response status."),
  output: jsonValueSchema,
  error: s.string("The response error message, when present."),
  message: s.string("The response message, when present."),
  createdAt: s.string("When the response was created."),
});

const toolExecutionResultSchema = s.object(
  "The result of testing code in Vapi's code tool environment.",
  {
    success: s.boolean("Whether the code execution completed successfully."),
    result: jsonValueSchema,
    error: s.string("The error message returned by the execution."),
    logs: s.array("Console logs emitted during execution.", s.string("A log line emitted during execution.")),
    executionTimeMs: s.number("The execution duration in milliseconds."),
  },
  { optional: ["success", "result", "error", "logs", "executionTimeMs"] },
);

const uploadableFileSchema = s.object(
  "A file payload to upload to Vapi.",
  {
    name: s.nonEmptyString("The filename that will be uploaded to Vapi."),
    mimetype: s.string("The MIME type of the uploaded file."),
    url: s.url("A public URL that the local runtime fetches before uploading to Vapi."),
    contentBase64: s.string("Base64-encoded file content used when no public URL is available."),
  },
  { required: ["name"], optional: ["mimetype", "url", "contentBase64"] },
);

function inputSchema(description: string, properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.object(description, properties, { required, additionalProperties: true });
}

function singleOutput(key: string, schema: JsonSchema, description: string): JsonSchema {
  return s.actionOutput({ [key]: schema }, description, [key]);
}

function arrayOutput(key: string, schema: JsonSchema, description: string): JsonSchema {
  return s.actionOutput({ [key]: s.array(description, schema) }, "The output payload for this action.", [key]);
}

function paginatedOutput(key: string, schema: JsonSchema, description: string): JsonSchema {
  return s.actionOutput(
    {
      [key]: s.array(description, schema),
      metadata: paginationMetadataSchema,
    },
    "The output payload for this action.",
    [key, "metadata"],
  );
}

function action(name: string, description: string, input: JsonSchema, output: JsonSchema): ActionDefinition {
  return defineProviderAction(service, {
    name,
    description,
    requiredScopes: [],
    inputSchema: input,
    outputSchema: output,
  });
}

const listInput = inputSchema("The input payload for this action.", { limit: limitSchema, ...timestampFilterFields });
const idInput = (): JsonSchema => inputSchema("The input payload for this action.", { id: idSchema }, ["id"]);
const pageInput = (extra: Record<string, JsonSchema> = {}): JsonSchema =>
  inputSchema("The input payload for this action.", {
    id: s.string("Filter by identifier."),
    page: pageSchema,
    limit: limitSchema,
    sortOrder: sortOrderSchema,
    ...timestampFilterFields,
    ...extra,
  });

export const vapiActions: ActionDefinition[] = [
  action(
    "list_assistants",
    "List Vapi assistants with optional created/updated timestamp filters and a configurable page size.",
    listInput,
    arrayOutput("assistants", assistantSchema, "The assistants returned by Vapi."),
  ),
  action(
    "create_assistant",
    "Create a new Vapi assistant with required transcriber, voice, and model settings plus optional messaging and duration controls.",
    inputSchema(
      "The input payload for this action.",
      {
        name: s.string("Assistant identifier or display name."),
        model: jsonObjectSchema,
        voice: jsonObjectSchema,
        transcriber: jsonObjectSchema,
        firstMessage: s.string("The first message the assistant should say."),
        systemPrompt: s.string("The system prompt that controls assistant behavior."),
        clientMessages: stringArraySchema,
        serverMessages: stringArraySchema,
        maxDurationSeconds: s.integer("The maximum call duration in seconds."),
        voicemailDetection: jsonObjectSchema,
      },
      ["model", "voice", "transcriber"],
    ),
    singleOutput("assistant", assistantSchema, "The assistant created by Vapi."),
  ),
  action(
    "get_assistant",
    "Retrieve a Vapi assistant by its unique identifier.",
    idInput(),
    singleOutput("assistant", assistantSchema, "The assistant returned by Vapi."),
  ),
  action(
    "update_assistant",
    "Update an existing Vapi assistant and keep only the fields that should change in the request body.",
    inputSchema(
      "The input payload for this action.",
      {
        id: idSchema,
        name: s.string("The updated assistant name."),
        model: jsonObjectSchema,
        voice: jsonObjectSchema,
        metadata: jsonObjectSchema,
        serverUrl: s.string("The server URL that should receive assistant events."),
        messagePlan: jsonObjectSchema,
        monitorPlan: jsonObjectSchema,
        transcriber: jsonObjectSchema,
        analysisPlan: jsonObjectSchema,
        artifactPlan: jsonObjectSchema,
        firstMessage: s.string("The first message that the assistant should say."),
        hipaaEnabled: s.boolean("Whether HIPAA mode should be enabled."),
        credentialIds: stringArraySchema,
        clientMessages: stringArraySchema,
        maxDurationPlan: jsonObjectSchema,
        serverMessages: stringArraySchema,
        backgroundSound: s.string("The background sound profile to use during calls."),
        endCallMessage: s.string("The message spoken before ending the call."),
        endCallPhrases: stringArraySchema,
        stopSpeakingPlan: jsonObjectSchema,
        serverUrlSecret: s.string("The secret used to authenticate requests to the server URL."),
        startSpeakingPlan: jsonObjectSchema,
        voicemailMessage: s.string("The message spoken when voicemail is detected."),
        firstMessageMode: s.string("Whether the assistant should speak first or wait for the user."),
        backchannelEnabled: s.boolean("Whether verbal backchannel acknowledgments are enabled."),
        maxDurationSeconds: s.integer("The maximum call duration in seconds."),
        responseDelaySeconds: s.number("The delay before the assistant responds."),
        silenceTimeoutSeconds: s.integer("The silence timeout, in seconds."),
        transportConfigurations: jsonObjectArraySchema,
        llmRequestDelaySeconds: s.number("The delay before sending LLM requests."),
        backgroundDenoisingEnabled: s.boolean("Whether background denoising is enabled."),
        modelOutputInMessagesEnabled: s.boolean("Whether model output should be included in message payloads."),
        numWordsToInterruptAssistant: s.integer("The number of spoken words required to interrupt the assistant."),
      },
      ["id"],
    ),
    singleOutput("assistant", assistantSchema, "The updated assistant returned by Vapi."),
  ),
  action(
    "list_calls",
    "List Vapi calls with optional filtering by call, assistant, phone number, and created or updated timestamps.",
    inputSchema("The input payload for this action.", {
      id: s.string("Filter results by a specific call identifier."),
      limit: limitSchema,
      assistantId: s.string("Filter results by the assistant identifier."),
      phoneNumberId: s.string("Filter results by the phone number identifier."),
      ...timestampFilterFields,
    }),
    arrayOutput("calls", callSchema, "The calls returned by Vapi."),
  ),
  action(
    "get_call",
    "Retrieve a single Vapi call by its unique identifier.",
    idInput(),
    singleOutput("call", callSchema, "The call returned by Vapi."),
  ),
  action(
    "delete_call",
    "Delete a Vapi call by its unique identifier.",
    idInput(),
    singleOutput("call", callSchema, "The deleted call returned by Vapi."),
  ),
  action(
    "list_chats",
    "List Vapi chats with pagination plus optional assistant, squad, session, previous chat, and timestamp filters.",
    pageInput({
      squadId: s.string("Filter results by the squad identifier."),
      sessionId: s.string("Filter results by the session identifier."),
      assistantId: s.string("Filter results by the assistant identifier."),
      assistantIdAny: s.string("Filter results by multiple assistant identifiers separated by commas."),
      previousChatId: s.string("Filter results by the previous chat identifier."),
    }),
    paginatedOutput("chats", chatSchema, "The chats returned by Vapi."),
  ),
  action(
    "get_chat",
    "Retrieve a Vapi chat by its unique identifier.",
    idInput(),
    singleOutput("chat", chatSchema, "The chat returned by Vapi."),
  ),
  action(
    "delete_chat",
    "Delete a Vapi chat by its unique identifier.",
    idInput(),
    singleOutput("chat", chatSchema, "The deleted chat returned by Vapi."),
  ),
  action(
    "create_openai_chat",
    "Create an OpenAI-compatible Vapi chat response using an assistant or squad, with optional session and transport settings.",
    inputSchema(
      "The input payload for this action.",
      {
        name: s.string("The chat name for reference."),
        input: s.anyOf("The input text or messages for the chat.", [
          s.string("A plain-text chat input."),
          jsonObjectArraySchema,
        ]),
        squad: jsonObjectSchema,
        stream: s.boolean("Whether Vapi should stream the response. This connector only supports false."),
        squadId: s.string("The identifier of an existing squad."),
        assistant: jsonObjectSchema,
        sessionId: s.string("The identifier of an existing session."),
        transport: jsonObjectSchema,
        assistantId: s.string("The identifier of an existing assistant."),
        previousChatId: s.string("The previous chat identifier used as conversation context."),
        assistantOverrides: jsonObjectSchema,
      },
      ["input"],
    ),
    singleOutput("response", openAiChatResponseSchema, "The OpenAI-compatible response returned by Vapi."),
  ),
  action(
    "create_analytics_query",
    "Create and execute one or more Vapi analytics queries across call and subscription data.",
    inputSchema(
      "The input payload for this action.",
      { queries: s.array("The analytics queries to execute.", jsonObjectSchema, { minItems: 1 }) },
      ["queries"],
    ),
    s.actionOutput(
      { results: s.array("The analytics results returned by Vapi.", analyticsResultSchema) },
      "The output payload for this action.",
    ),
  ),
  action(
    "create_eval",
    "Create a Vapi eval for a mock conversation and define the checkpoint messages used to evaluate model behavior.",
    inputSchema(
      "The input payload for this action.",
      {
        name: s.string("The eval name."),
        type: s.string("The eval type."),
        messages: s.array("The mock conversation and evaluation messages.", jsonObjectSchema, { minItems: 1 }),
        description: s.string("The eval description."),
      },
      ["messages"],
    ),
    singleOutput("eval", evalSchema, "The eval created by Vapi."),
  ),
  action(
    "get_eval",
    "Retrieve a Vapi eval by its unique identifier.",
    idInput(),
    singleOutput("eval", evalSchema, "The eval returned by Vapi."),
  ),
  action(
    "update_eval",
    "Update a Vapi eval and keep only the fields that should change in the request body.",
    inputSchema(
      "The input payload for this action.",
      {
        id: idSchema,
        name: s.string("The updated eval name."),
        type: s.string("The updated eval type."),
        messages: jsonObjectArraySchema,
        description: s.string("The updated eval description."),
      },
      ["id"],
    ),
    singleOutput("eval", evalSchema, "The updated eval returned by Vapi."),
  ),
  action(
    "delete_eval",
    "Delete a Vapi eval by its unique identifier.",
    idInput(),
    singleOutput("eval", evalSchema, "The deleted eval returned by Vapi."),
  ),
  action(
    "delete_eval_run",
    "Delete a Vapi eval run by its unique identifier.",
    idInput(),
    singleOutput(
      "details",
      s.looseObject("The details returned after deleting an eval run."),
      "The deletion details returned by Vapi.",
    ),
  ),
  action(
    "list_evals",
    "List Vapi evals with pagination plus optional identifier and timestamp-based filters.",
    pageInput(),
    paginatedOutput("evals", evalSchema, "The evals returned by Vapi."),
  ),
  action(
    "get_file",
    "Retrieve Vapi file metadata by file identifier.",
    idInput(),
    singleOutput("file", fileSchema, "The file returned by Vapi."),
  ),
  action(
    "upload_file",
    "Upload a file to Vapi knowledge storage from a public URL or base64 payload and return the resulting file metadata.",
    inputSchema("The input payload for this action.", { file: uploadableFileSchema }, ["file"]),
    singleOutput("file", fileSchema, "The uploaded file returned by Vapi."),
  ),
  action(
    "list_monitoring_policies",
    "List Vapi monitoring policies with optional severity, monitor, and timestamp filters.",
    pageInput({
      severity: s.stringEnum("The monitoring policy severity level.", ["error", "warning", "info"]),
      monitorId: s.string("Filter results by monitor identifier."),
    }),
    arrayOutput("policies", policySchema, "The monitoring policies returned by Vapi."),
  ),
  action(
    "create_policy",
    "Create a Vapi monitoring policy with severity, threshold, and schedule or interval configuration.",
    inputSchema(
      "The input payload for this action.",
      {
        name: s.string("The policy name."),
        interval: jsonObjectSchema,
        schedule: jsonObjectSchema,
        severity: s.stringEnum("The severity level of the policy.", ["error", "warning", "info"]),
        threshold: jsonObjectSchema,
        monitorIds: stringArraySchema,
        lookbackWindowMinutes: s.integer("The lookback window, in minutes."),
      },
      ["name", "severity", "threshold", "lookbackWindowMinutes"],
    ),
    singleOutput("policy", policySchema, "The monitoring policy created by Vapi."),
  ),
  action(
    "list_provider_resources",
    "List Vapi provider resources for a provider and resource type with optional identifier and timestamp filters.",
    pageInput({
      provider: s.stringEnum("The provider that owns the resource.", ["11labs", "cartesia"]),
      resourceName: s.string("The provider resource type, such as pronunciation-dictionary."),
      resourceId: s.string("Filter results by the provider-side resource identifier."),
    }),
    paginatedOutput("providerResources", providerResourceSchema, "The provider resources returned by Vapi."),
  ),
  action(
    "create_provider_resource",
    "Create a pronunciation dictionary provider resource in Vapi, defaulting to the 11labs pronunciation-dictionary route used by the upstream toolkit.",
    inputSchema(
      "The input payload for this action.",
      {
        provider: s.stringEnum("The provider that should own the resource. Defaults to 11labs.", [
          "11labs",
          "cartesia",
        ]),
        resourceName: s.string("The provider resource type. Defaults to pronunciation-dictionary."),
        name: s.string("The display name of the pronunciation dictionary."),
        rules: s.array("The pronunciation rules to create.", jsonObjectSchema, { minItems: 1 }),
      },
      ["name", "rules"],
    ),
    singleOutput("providerResource", providerResourceSchema, "The provider resource created by Vapi."),
  ),
  action(
    "list_phone_numbers",
    "List Vapi phone numbers with optional created and updated timestamp filters.",
    listInput,
    arrayOutput("phoneNumbers", phoneNumberSchema, "The phone numbers returned by Vapi."),
  ),
  action(
    "create_phone_number",
    "Create a Vapi phone number using Vapi, Twilio, Vonage, Telnyx, or bring-your-own provider settings.",
    inputSchema(
      "The input payload for this action.",
      {
        name: s.string("The display name of the phone number."),
        number: s.string("The E.164 phone number, when the provider requires one."),
        sipUri: s.string("The SIP URI used by Vapi-managed SIP numbers."),
        provider: s.stringEnum("The phone number provider.", [
          "byo-phone-number",
          "twilio",
          "vonage",
          "vapi",
          "telnyx",
        ]),
        squadId: s.string("The squad identifier attached to the phone number."),
        smsEnabled: s.boolean("Whether SMS is enabled for the phone number."),
        workflowId: s.string("The workflow identifier attached to the phone number."),
        assistantId: s.string("The assistant identifier attached to the phone number."),
        credentialId: s.string("The credential identifier used by the phone provider."),
        twilioApiKey: s.string("The Twilio API key."),
        twilioApiSecret: s.string("The Twilio API secret."),
        twilioAuthToken: s.string("The Twilio auth token."),
        twilioAccountSid: s.string("The Twilio account SID."),
        numberDesiredAreaCode: s.string("The desired area code when Vapi provisions a number automatically."),
        numberE164CheckEnabled: s.boolean("Whether E.164 validation should be enforced."),
      },
      ["provider"],
    ),
    singleOutput("phoneNumber", phoneNumberSchema, "The phone number created by Vapi."),
  ),
  action(
    "update_phone_number",
    "Update a Vapi phone number and keep only the fields that should change in the request body.",
    inputSchema(
      "The input payload for this action.",
      {
        id: idSchema,
        name: s.string("The updated display name of the phone number."),
        hooks: jsonObjectArraySchema,
        number: s.string("The updated E.164 phone number."),
        server: jsonObjectSchema,
        sipUri: s.string("The updated SIP URI."),
        squadId: s.string("The updated squad identifier."),
        smsEnabled: s.boolean("Whether SMS is enabled."),
        workflowId: s.string("The updated workflow identifier."),
        assistantId: s.string("The updated assistant identifier."),
        credentialId: s.string("The updated credential identifier."),
        authentication: jsonObjectSchema,
        twilioApiKey: s.string("The updated Twilio API key."),
        twilioApiSecret: s.string("The updated Twilio API secret."),
        twilioAuthToken: s.string("The updated Twilio auth token."),
        twilioAccountSid: s.string("The updated Twilio account SID."),
        fallbackDestination: jsonObjectSchema,
        numberE164CheckEnabled: s.boolean("Whether E.164 validation is enabled."),
      },
      ["id"],
    ),
    singleOutput("phoneNumber", phoneNumberSchema, "The updated phone number returned by Vapi."),
  ),
  action(
    "delete_phone_number",
    "Delete a Vapi phone number by its unique identifier.",
    idInput(),
    singleOutput("phoneNumber", phoneNumberSchema, "The deleted phone number returned by Vapi."),
  ),
  action(
    "list_structured_outputs",
    "List Vapi structured outputs with pagination plus optional identifier, name, and timestamp filters.",
    pageInput({ name: s.string("Filter results by a specific structured output name.") }),
    paginatedOutput("structuredOutputs", structuredOutputSchema, "The structured outputs returned by Vapi."),
  ),
  action(
    "list_insights",
    "List Vapi insights with pagination plus optional identifier and timestamp filters.",
    pageInput(),
    paginatedOutput("insights", insightSchema, "The insights returned by Vapi."),
  ),
  action(
    "update_insight",
    "Update a Vapi insight by replacing its name, queries, formulas, grouping, and time range settings.",
    inputSchema(
      "The input payload for this action.",
      {
        id: idSchema,
        name: s.string("The updated insight name."),
        type: s.string("The updated insight type."),
        formula: jsonObjectSchema,
        groupBy: s.string("The grouping field for the insight."),
        queries: s.array("The updated query definitions.", jsonObjectSchema, { minItems: 1 }),
        formulas: jsonObjectArraySchema,
        metadata: jsonObjectSchema,
        timeRange: s.anyOf("The updated time range for the insight.", [
          s.string("A named time range."),
          jsonObjectSchema,
        ]),
      },
      ["id", "type", "queries"],
    ),
    singleOutput("insight", insightSchema, "The updated insight returned by Vapi."),
  ),
  action(
    "create_scorecard",
    "Create a Vapi scorecard for observability and evaluation using structured output metrics and conditions.",
    inputSchema(
      "The input payload for this action.",
      {
        name: s.string("The scorecard name."),
        metrics: s.array("The scorecard metrics.", jsonObjectSchema, { minItems: 1 }),
        description: s.string("The scorecard description."),
        assistantIds: stringArraySchema,
      },
      ["metrics"],
    ),
    singleOutput("scorecard", scorecardSchema, "The scorecard created by Vapi."),
  ),
  action(
    "list_scorecards",
    "List Vapi scorecards with pagination plus optional identifier and timestamp filters.",
    pageInput(),
    paginatedOutput("scorecards", scorecardSchema, "The scorecards returned by Vapi."),
  ),
  action(
    "create_session",
    "Create a Vapi session with either an assistant identifier or an inline assistant configuration.",
    inputSchema("The input payload for this action.", {
      name: s.string("The session name."),
      assistant: jsonObjectSchema,
      assistantId: s.string("The identifier of an existing assistant."),
    }),
    singleOutput("session", sessionSchema, "The session created by Vapi."),
  ),
  action(
    "list_sessions",
    "List Vapi sessions with pagination plus optional identifier, name, assistant, workflow, squad, and timestamp filters.",
    pageInput({
      name: s.string("Filter results by a specific session name."),
      squadId: s.string("Filter results by the squad identifier."),
      workflowId: s.string("Filter results by the workflow identifier."),
      assistantId: s.string("Filter results by the assistant identifier."),
      assistantIdAny: s.string("Filter results by multiple assistant identifiers separated by commas."),
    }),
    paginatedOutput("sessions", sessionSchema, "The sessions returned by Vapi."),
  ),
  action(
    "get_tool",
    "Retrieve a Vapi tool by its unique identifier.",
    idInput(),
    singleOutput("tool", toolSchema, "The tool returned by Vapi."),
  ),
  action(
    "update_tool",
    "Update a Vapi tool configuration, including function definitions, HTTP request settings, and retry policies.",
    inputSchema(
      "The input payload for this action.",
      {
        id: idSchema,
        url: s.string("The request URL for apiRequest tools."),
        type: s.string("The tool type."),
        async: s.boolean("Whether the tool executes asynchronously."),
        method: s.string("The HTTP method for apiRequest tools."),
        server: jsonObjectSchema,
        function: jsonObjectSchema,
        messages: jsonObjectArraySchema,
        backoffPlan: jsonObjectSchema,
        destinations: jsonObjectArraySchema,
        rejectionPlan: jsonObjectSchema,
        variableExtractionPlan: jsonObjectSchema,
      },
      ["id"],
    ),
    singleOutput("tool", toolSchema, "The updated tool returned by Vapi."),
  ),
  action(
    "test_code_tool_execution",
    "Execute TypeScript code inside Vapi's code tool sandbox and return the logs, result, and execution outcome.",
    inputSchema(
      "The input payload for this action.",
      { code: s.string("The TypeScript code that should be executed in Vapi's sandbox.") },
      ["code"],
    ),
    toolExecutionResultSchema,
  ),
];
