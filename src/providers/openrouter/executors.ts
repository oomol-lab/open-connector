import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "openrouter";
const openrouterApiBaseUrl = "https://openrouter.ai/api/v1";
const openrouterHeaderInputKeys = ["httpReferer", "xTitle"] as const;

type QueryValue = string | number | boolean | undefined;
type OpenrouterActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface OpenrouterRequestInput {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  headerSource?: Record<string, unknown>;
  allowText?: boolean;
  mode?: "validate" | "execute";
}

export const openrouterActionHandlers: ProviderActionHandlers<"openrouter", OpenrouterActionHandler> = {
  create_chat_completion(input, context) {
    assertStreamingDisabled(input);
    return openrouterRequest(
      context.apiKey,
      {
        method: "POST",
        path: "/chat/completions",
        body: buildOpenrouterChatCompletionBody(input),
        headerSource: input,
      },
      context,
    );
  },
  create_coinbase_charge(input, context) {
    return openrouterRequest(
      context.apiKey,
      {
        method: "POST",
        path: "/credits/coinbase",
        body: stripOpenrouterHeaderInputs(input),
        headerSource: input,
      },
      context,
    );
  },
  create_message(input, context) {
    assertStreamingDisabled(input);
    return openrouterRequest(
      context.apiKey,
      {
        method: "POST",
        path: "/messages",
        body: stripOpenrouterHeaderInputs(input),
        headerSource: input,
      },
      context,
    );
  },
  get_credits(_input, context) {
    return openrouterRequest(context.apiKey, { path: "/credits" }, context);
  },
  get_current_key(input, context) {
    return openrouterRequest(context.apiKey, { path: "/key", headerSource: input }, context);
  },
  get_generation(input, context) {
    return openrouterRequest(
      context.apiKey,
      {
        path: "/generation",
        query: {
          id: String(input.id),
        },
      },
      context,
    );
  },
  get_models_count(input, context) {
    return openrouterRequest(
      context.apiKey,
      {
        path: "/models/count",
        query: buildModelsCountQuery(input),
        headerSource: input,
      },
      context,
    );
  },
  list_available_models(input, context) {
    return openrouterRequest(
      context.apiKey,
      {
        path: "/models",
        query: buildAvailableModelsQuery(input),
        allowText: optionalBoolean(input.useRss) === true,
      },
      context,
    );
  },
  list_embedding_models(input, context) {
    return openrouterRequest(context.apiKey, { path: "/embeddings/models", headerSource: input }, context);
  },
  list_model_endpoints(input, context) {
    return openrouterRequest(
      context.apiKey,
      {
        path: `/models/${encodeURIComponent(String(input.author))}/${encodeURIComponent(String(input.slug))}/endpoints`,
      },
      context,
    );
  },
  list_providers(_input, context) {
    return openrouterRequest(context.apiKey, { path: "/providers" }, context);
  },
  list_user_models(input, context) {
    return openrouterRequest(context.apiKey, { path: "/models/user", headerSource: input }, context);
  },
  list_zdr_endpoints(input, context) {
    return openrouterRequest(context.apiKey, { path: "/endpoints/zdr", headerSource: input }, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, openrouterActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await openrouterRequest(
      input.apiKey,
      {
        path: "/key",
        mode: "validate",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    );
    const data = optionalRecordFrom(payload)?.data;
    const dataRecord = optionalRecordFrom(data);
    const label = optionalString(dataRecord?.label) ?? "OpenRouter API Key";
    const accountId = optionalString(dataRecord?.creator_user_id) ?? label;

    return {
      profile: {
        accountId,
        displayName: label,
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/key",
        currentKey: dataRecord ?? {},
      },
    };
  },
};

async function openrouterRequest(
  apiKey: string,
  input: OpenrouterRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const url = buildOpenrouterUrl(input.path, input.query ?? {});
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildOpenrouterHeaders(apiKey, input.headerSource, input.body != null),
      body: input.body == null ? undefined : JSON.stringify(compactObject(input.body)),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OpenRouter request failed: ${error.message}` : "OpenRouter request failed",
    );
  }

  await assertOpenrouterResponse(response, input.mode ?? "execute");
  return readOpenrouterSuccess(response, { allowText: input.allowText === true });
}

function buildOpenrouterHeaders(
  apiKey: string,
  input: Record<string, unknown> | undefined,
  includeJsonContentType: boolean,
): Headers {
  const referer = input ? optionalString(input.httpReferer) : undefined;
  const title = input ? optionalString(input.xTitle) : undefined;

  const headers = new Headers({
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });

  if (includeJsonContentType) {
    headers.set("content-type", "application/json");
  }
  if (referer) {
    headers.set("HTTP-Referer", referer);
  }
  if (title) {
    headers.set("X-Title", title);
  }

  return headers;
}

function buildOpenrouterUrl(path: string, query: Record<string, QueryValue>): string {
  const url = new URL(`${openrouterApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildOpenrouterChatCompletionBody(input: Record<string, unknown>): Record<string, unknown> {
  const body = stripOpenrouterHeaderInputs(input);
  const normalizedTools = body.tools !== undefined ? body.tools : mapLegacyChatFunctions(input.functions);
  const normalizedToolChoice =
    body.tool_choice !== undefined ? body.tool_choice : mapLegacyFunctionCall(input.function_call);

  return compactObject({
    ...body,
    tools: normalizedTools,
    tool_choice: normalizedToolChoice,
    functions: undefined,
    function_call: undefined,
  });
}

function mapLegacyChatFunctions(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((tool) => ({
    type: "function",
    function: tool,
  }));
}

function mapLegacyFunctionCall(value: unknown): Record<string, unknown> | string | undefined {
  if (value === "none" || value === "auto") {
    return value;
  }

  const record = optionalRecordFrom(value);
  const name = optionalString(record?.name);
  if (!name) {
    return undefined;
  }

  return {
    type: "function",
    function: {
      name,
    },
  };
}

function stripOpenrouterHeaderInputs(input: Record<string, unknown>): Record<string, unknown> {
  const nextInput: Record<string, unknown> = {};
  const skippedKeys = new Set<string>(openrouterHeaderInputKeys);
  for (const [key, value] of Object.entries(input)) {
    if (skippedKeys.has(key) || value === undefined) {
      continue;
    }
    nextInput[key] = value;
  }
  return nextInput;
}

function buildModelsCountQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    output_modalities: optionalString(input.outputModalities),
  });
}

function buildAvailableModelsQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    category: optionalString(input.category),
    supported_parameters: optionalString(input.supportedParameters),
    output_modalities: optionalString(input.outputModalities),
    use_rss: optionalBoolean(input.useRss),
    use_rss_chat_links: optionalBoolean(input.useRssChatLinks),
  });
}

function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }
}

async function readOpenrouterSuccess(response: Response, options: { allowText: boolean }): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (
    options.allowText &&
    (contentType.includes("xml") || contentType.includes("rss") || contentType.startsWith("text/"))
  ) {
    return {
      rss: await response.text(),
    };
  }

  return response.json() as Promise<unknown>;
}

async function assertOpenrouterResponse(response: Response, mode: "validate" | "execute"): Promise<void> {
  if (response.ok) {
    return;
  }

  const error = await readOpenrouterError(response);
  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message, error);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message, error);
  }
  if (mode === "execute" && response.status === 401) {
    throw new ProviderRequestError(401, error.message, error);
  }
  if (response.status === 400 || response.status === 404 || response.status === 413 || response.status === 422) {
    throw new ProviderRequestError(400, error.message, error);
  }

  throw new ProviderRequestError(response.status || 502, error.message, error);
}

async function readOpenrouterError(response: Response): Promise<{
  type: string;
  code?: string | number;
  message: string;
}> {
  const rawText = (await response.text().catch(() => "")) || `OpenRouter request failed with status ${response.status}`;

  try {
    const payload = JSON.parse(rawText) as Record<string, unknown>;
    const nestedError = optionalRecordFrom(payload.error);

    return {
      type: optionalString(nestedError?.type) ?? optionalString(payload.type) ?? "provider_error",
      code: readErrorCode(nestedError?.code),
      message: optionalString(nestedError?.message) ?? optionalString(payload.message) ?? rawText,
    };
  } catch {
    return {
      type: "provider_error",
      message: rawText,
    };
  }
}

function readErrorCode(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function optionalRecordFrom(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
