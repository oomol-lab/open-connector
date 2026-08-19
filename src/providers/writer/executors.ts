import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "writer";
const writerApiBaseUrl = "https://api.writer.com";

type WriterRequestMode = "validate" | "execute";
type WriterActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface WriterRequestInput {
  method?: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  mode: WriterRequestMode;
}

export const writerActionHandlers: ProviderActionHandlers<"writer", WriterActionHandler> = {
  list_models(_input, context) {
    return writerRequest(context, {
      path: "/v1/models",
      mode: "execute",
    });
  },
  create_chat_completion(input, context) {
    assertStreamingDisabled(input);
    return writerRequest(context, {
      method: "POST",
      path: "/v1/chat",
      body: compactObject(input) as Record<string, unknown>,
      mode: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, writerActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await writerRequest(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      {
        path: "/v1/models",
        mode: "validate",
      },
    );
    const models = optionalModelArray(optionalRecord(payload)?.models);

    return {
      profile: {
        accountId: "writer-api-key",
        displayName: "Writer API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v1/models",
        availableModels: models.map((model) => model.id).filter((model): model is string => typeof model === "string"),
      },
    };
  },
};

async function writerRequest(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  input: WriterRequestInput,
): Promise<unknown> {
  const apiKey = context.apiKey.trim();
  if (!apiKey) {
    throw new ProviderRequestError(400, "writer apiKey is required");
  }

  let response: Response;
  try {
    response = await context.fetcher(`${writerApiBaseUrl}${input.path}`, {
      method: input.method ?? "GET",
      headers: writerHeaders(apiKey),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Writer request failed: ${error.message}` : "Writer request failed",
    );
  }

  if (!response.ok) {
    throw await createWriterError(response, input.mode);
  }

  return response.json();
}

function writerHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }
}

async function createWriterError(response: Response, mode: WriterRequestMode): Promise<ProviderRequestError> {
  const error = await readWriterError(response);

  if (response.status === 429) {
    return new ProviderRequestError(429, error.message, error);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, error.message, error);
  }
  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, error.message, error);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, error.message, error);
  }

  return new ProviderRequestError(response.status, error.message, error);
}

async function readWriterError(response: Response): Promise<{ type: string; message: string }> {
  try {
    const payload = (await response.json()) as {
      tpe?: unknown;
      errors?: Array<{ description?: unknown; key?: unknown }>;
      message?: unknown;
      error?: unknown;
    };
    const descriptions = Array.isArray(payload.errors)
      ? payload.errors
          .map((item) => item.description)
          .filter((description): description is string => typeof description === "string")
      : [];
    const nestedMessage =
      payload.error && typeof payload.error === "object" ? (payload.error as { message?: unknown }).message : undefined;
    const message =
      descriptions.length > 0
        ? descriptions.join("; ")
        : typeof payload.message === "string"
          ? payload.message
          : typeof nestedMessage === "string"
            ? nestedMessage
            : `Writer API request failed with HTTP ${response.status}`;

    return {
      type: typeof payload.tpe === "string" ? payload.tpe : "provider_error",
      message,
    };
  } catch {
    return {
      type: "provider_error",
      message: `Writer API request failed with HTTP ${response.status}`,
    };
  }
}

function optionalModelArray(value: unknown): Array<{ id?: unknown }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is { id?: unknown } => typeof item === "object" && item !== null);
}
