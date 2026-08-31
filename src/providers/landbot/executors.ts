import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "landbot";
const landbotApiBaseUrl = "https://api.landbot.io/v1/";

type LandbotPhase = "execute" | "validate";
type LandbotQueryValue = boolean | number | string | undefined;
type LandbotActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const landbotActionHandlers: ProviderActionHandlers<"landbot", LandbotActionHandler> = {
  list_channels(input, context) {
    return landbotRequest({
      path: "channels/",
      context,
      query: pickQuery(input, ["offset", "limit", "type", "active"]),
    });
  },
  list_customers(input, context) {
    return landbotRequest({
      path: "customers/",
      context,
      query: pickQuery(input, [
        "offset",
        "limit",
        "channel_id",
        "agent_id",
        "archived",
        "opt_in",
        "search_by",
        "search",
      ]),
    });
  },
  get_customer_messages(input, context) {
    return landbotRequest({
      path: `customers/${readCustomerId(input)}/messages/`,
      context,
    });
  },
  send_text(input, context) {
    return landbotRequest({
      path: `customers/${readCustomerId(input)}/send_text/`,
      method: "POST",
      context,
      body: {
        message: requiredString(input.message, "message", providerInputError),
      },
    });
  },
  set_customer_field(input, context) {
    validateFieldValue(input.type, input.value);
    return landbotRequest({
      path: `customers/${readCustomerId(input)}/fields/${encodeURIComponent(
        requiredString(input.field_name, "field_name", providerInputError),
      )}/`,
      method: "POST",
      context,
      body: compactObject({
        type: optionalString(input.type),
        value: input.value,
        extra: optionalRecord(input.extra),
      }),
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, landbotActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLandbotCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};

async function validateLandbotCredential(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<CredentialValidationResult> {
  await landbotRequest({
    path: "channels/",
    query: { limit: 1 },
    context,
    phase: "validate",
  });

  return {
    profile: {
      accountId: "landbot",
      displayName: "Landbot",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: landbotApiBaseUrl,
      validationEndpoint: "channels/",
    },
  };
}

async function landbotRequest(input: {
  path: string;
  method?: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  query?: Record<string, LandbotQueryValue>;
  body?: Record<string, unknown>;
  phase?: LandbotPhase;
}): Promise<unknown> {
  const url = new URL(input.path, landbotApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Token ${input.context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Landbot request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readLandbotPayload(response);
  if (!response.ok) {
    throw mapLandbotError(response.status, payload, input.phase ?? "execute");
  }

  return payload;
}

async function readLandbotPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    const payload = JSON.parse(text) as unknown;
    return optionalRecord(payload) ?? { data: payload };
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Landbot returned malformed JSON");
    }
    return { error: text };
  }
}

function pickQuery(input: Record<string, unknown>, keys: string[]): Record<string, LandbotQueryValue> {
  const query: Record<string, LandbotQueryValue> = {};
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      query[key] = typeof value === "string" ? value.trim() : value;
    }
  }
  return query;
}

function validateFieldValue(type: unknown, value: unknown): void {
  if (type === "string" || type === "date" || type === "datetime") {
    if (typeof value === "string") {
      return;
    }
    throw new ProviderRequestError(400, `Landbot ${type} field value must be a string`);
  }

  if (type === "integer") {
    if (typeof value === "number" && Number.isInteger(value)) {
      return;
    }
    throw new ProviderRequestError(400, "Landbot integer field value must be an integer");
  }

  if (type === "float") {
    if (typeof value === "number" && Number.isFinite(value)) {
      return;
    }
    throw new ProviderRequestError(400, "Landbot float field value must be a number");
  }

  if (type === "boolean") {
    if (typeof value === "boolean") {
      return;
    }
    throw new ProviderRequestError(400, "Landbot boolean field value must be a boolean");
  }
}

function mapLandbotError(status: number, payload: Record<string, unknown>, phase: LandbotPhase): ProviderRequestError {
  const message = extractLandbotErrorMessage(payload);
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function extractLandbotErrorMessage(payload: Record<string, unknown>): string {
  const error = optionalString(payload.error);
  if (error) {
    return error;
  }
  const errors = optionalRecord(payload.errors);
  if (errors) {
    for (const value of Object.values(errors)) {
      if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) {
        return value[0].trim();
      }
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return "Landbot request failed";
}

function readCustomerId(input: Record<string, unknown>): string {
  const customerId = optionalInteger(input.customer_id);
  if (customerId == null) {
    throw new ProviderRequestError(400, "customer_id is required");
  }
  return encodeURIComponent(String(customerId));
}
