import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "moonclerk";
const moonclerkApiBaseUrl = "https://api.moonclerk.com";
const moonclerkVersionHeader = "application/vnd.moonclerk+json;version=1";

type MoonclerkRequestPhase = "validate" | "execute";
type MoonclerkActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const moonclerkActionHandlers: ProviderActionHandlers<"moonclerk", MoonclerkActionHandler> = {
  async list_forms(input, context): Promise<unknown> {
    const payload = await requestMoonclerk({
      path: "/forms",
      context,
      phase: "execute",
      query: queryParams({
        count: input.count as number | undefined,
        offset: input.offset as number | undefined,
      }),
    });
    return {
      forms: requiredArrayField(payload, "forms"),
    };
  },
  async get_form(input, context): Promise<unknown> {
    const payload = await requestMoonclerk({
      path: `/forms/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      context,
      phase: "execute",
    });
    return {
      form: requiredRecordField(payload, "form"),
    };
  },
  async list_customers(input, context): Promise<unknown> {
    const payload = await requestMoonclerk({
      path: "/customers",
      context,
      phase: "execute",
      query: queryParams({
        count: input.count as number | undefined,
        offset: input.offset as number | undefined,
        form_id: input.form_id as number | undefined,
        checkout_from: optionalString(input.checkout_from),
        checkout_to: optionalString(input.checkout_to),
        next_payment_from: optionalString(input.next_payment_from),
        next_payment_to: optionalString(input.next_payment_to),
        status: optionalString(input.status),
      }),
    });
    return {
      customers: requiredArrayField(payload, "customers"),
    };
  },
  async get_customer(input, context): Promise<unknown> {
    const payload = await requestMoonclerk({
      path: `/customers/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      context,
      phase: "execute",
    });
    return {
      customer: requiredRecordField(payload, "customer"),
    };
  },
  async list_payments(input, context): Promise<unknown> {
    const payload = await requestMoonclerk({
      path: "/payments",
      context,
      phase: "execute",
      query: queryParams({
        count: input.count as number | undefined,
        offset: input.offset as number | undefined,
        form_id: input.form_id as number | undefined,
        customer_id: input.customer_id as number | undefined,
        date_from: optionalString(input.date_from),
        date_to: optionalString(input.date_to),
        status: optionalString(input.status),
      }),
    });
    return {
      payments: requiredArrayField(payload, "payments"),
    };
  },
  async get_payment(input, context): Promise<unknown> {
    const payload = await requestMoonclerk({
      path: `/payments/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      context,
      phase: "execute",
    });
    return {
      payment: requiredRecordField(payload, "payment"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, moonclerkActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestMoonclerk({
      path: "/forms",
      context: { apiKey: input.apiKey, fetcher, signal },
      phase: "validate",
      query: queryParams({ count: 1 }),
    });

    const forms = optionalRecord(payload)?.forms;
    return {
      profile: {
        accountId: `moonclerk:${input.apiKey.slice(-6)}`,
        displayName: "MoonClerk API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: moonclerkApiBaseUrl,
        validationEndpoint: "/forms?count=1",
        formCountSample: Array.isArray(forms) ? forms.length : undefined,
      },
    };
  },
};

async function requestMoonclerk(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: MoonclerkRequestPhase;
  query?: Record<string, string>;
}): Promise<unknown> {
  const url = new URL(input.path, moonclerkApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: moonclerkVersionHeader,
        authorization: `Token token=${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `MoonClerk request failed: ${error.message}` : "MoonClerk request failed",
    );
  }

  const payload = await readMoonclerkPayload(response);
  if (!response.ok) {
    throw createMoonclerkError(response, payload, input.phase);
  }

  return payload;
}

async function readMoonclerkPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createMoonclerkError(
  response: Response,
  payload: unknown,
  phase: MoonclerkRequestPhase,
): ProviderRequestError {
  const message =
    extractMoonclerkErrorMessage(payload) ?? response.statusText ?? `MoonClerk request failed with ${response.status}`;

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractMoonclerkErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim().slice(0, 200);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.detail);
}

function requiredArrayField(payload: unknown, fieldName: string): unknown[] {
  const record = optionalRecord(payload);
  const value = record?.[fieldName];
  if (Array.isArray(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `MoonClerk returned an invalid ${fieldName} response`, payload);
}

function requiredRecordField(payload: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  const value = optionalRecord(record?.[fieldName]);
  if (value) {
    return value;
  }
  throw new ProviderRequestError(502, `MoonClerk returned an invalid ${fieldName} response`, payload);
}
