import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "logsnag";
const logsnagApiBaseUrl = "https://api.logsnag.com/v1";

type LogsnagActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const logsnagActionHandlers: ProviderActionHandlers<"logsnag", LogsnagActionHandler> = {
  publish_event(input, context) {
    return requestLogsnag("log", "POST", input, context);
  },
  identify_user(input, context) {
    return requestLogsnag("identify", "POST", input, context);
  },
  publish_insight(input, context) {
    return requestLogsnag("insight", "POST", input, context);
  },
  mutate_insight(input, context) {
    return requestLogsnag("insight", "PATCH", input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, logsnagActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    const apiKey = input.apiKey.trim();
    if (!apiKey) {
      throw new ProviderRequestError(400, "LogSnag API token is required.");
    }

    return {
      profile: {
        displayName: "LogSnag API Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: logsnagApiBaseUrl,
        validationMode: "format_only",
      },
    };
  },
};

async function requestLogsnag(
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const response = await context.fetcher(new URL(path, `${logsnagApiBaseUrl}/`), {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: JSON.stringify(body),
    signal: context.signal,
  });
  const payload = await readLogsnagPayload(response);
  if (!response.ok) {
    throw createLogsnagError(response, payload);
  }

  return compactObject({
    ok: true,
    status: response.status,
    payload,
  });
}

async function readLogsnagPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return undefined;
  }

  if (!response.headers.get("content-type")?.includes("json")) {
    return text;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createLogsnagError(response: Response, payload: unknown): ProviderRequestError {
  const status = response.status;
  const message = extractLogsnagErrorMessage(payload) ?? `LogSnag request failed with ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractLogsnagErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "error", "detail"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}
