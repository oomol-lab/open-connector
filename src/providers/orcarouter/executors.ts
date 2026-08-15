import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "orcarouter";
const orcarouterApiBaseUrl = "https://api.orcarouter.ai/v1";

type QueryValue = string | number | boolean | undefined;
type OrcarouterActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface OrcarouterRequestInput {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  mode?: "validate" | "execute";
}

export const orcarouterActionHandlers: Record<string, OrcarouterActionHandler> = {
  create_chat_completion(input, context) {
    assertStreamingDisabled(input);
    return orcarouterRequest(
      context.apiKey,
      {
        method: "POST",
        path: "/chat/completions",
        body: compactObject(input),
      },
      context,
    );
  },
  create_message(input, context) {
    assertStreamingDisabled(input);
    return orcarouterRequest(
      context.apiKey,
      {
        method: "POST",
        path: "/messages",
        body: compactObject(input),
      },
      context,
    );
  },
  list_models(_input, context) {
    return orcarouterRequest(context.apiKey, { path: "/models" }, context);
  },
  create_embeddings(input, context) {
    return orcarouterRequest(
      context.apiKey,
      {
        method: "POST",
        path: "/embeddings",
        body: compactObject(input),
      },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, orcarouterActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = (await orcarouterRequest(
      input.apiKey,
      {
        path: "/models",
        mode: "validate",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    )) as {
      data?: Array<{ id?: unknown }>;
    };

    return {
      profile: {
        displayName: "OrcaRouter API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/models",
        availableModels: (payload.data ?? [])
          .map((model) => model.id)
          .filter((model): model is string => typeof model === "string"),
      },
    };
  },
};

async function orcarouterRequest(
  apiKey: string,
  input: OrcarouterRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const url = buildOrcarouterUrl(input.path, input.query ?? {});
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildOrcarouterHeaders(apiKey, input.body != null),
      body: input.body == null ? undefined : JSON.stringify(input.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OrcaRouter request failed: ${error.message}` : "OrcaRouter request failed",
    );
  }

  await assertOrcarouterResponse(response, input.mode ?? "execute");
  return response.json() as Promise<unknown>;
}

function buildOrcarouterHeaders(apiKey: string, includeJsonContentType: boolean): Headers {
  const headers = new Headers({
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });

  if (includeJsonContentType) {
    headers.set("content-type", "application/json");
  }

  return headers;
}

function buildOrcarouterUrl(path: string, query: Record<string, QueryValue>): string {
  const url = new URL(`${orcarouterApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }
}

async function assertOrcarouterResponse(response: Response, mode: "validate" | "execute"): Promise<void> {
  if (response.ok) {
    return;
  }

  const error = await readOrcarouterError(response);
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

async function readOrcarouterError(response: Response): Promise<{
  type: string;
  code?: string | number;
  message: string;
}> {
  const rawText = (await response.text().catch(() => "")) || `OrcaRouter request failed with status ${response.status}`;

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
