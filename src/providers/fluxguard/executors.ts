import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FluxguardActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "fluxguard";
const fluxguardApiBaseUrl = "https://api.fluxguard.com";
const fluxguardDefaultRequestTimeoutMs = 30_000;

type FluxguardPhase = "validate" | "execute";
type FluxguardActionContext = ApiKeyProviderContext;
type FluxguardActionHandler = (input: Record<string, unknown>, context: FluxguardActionContext) => Promise<unknown>;

interface FluxguardRequestInput {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  phase: FluxguardPhase;
}

export const fluxguardActionHandlers: Record<FluxguardActionName, FluxguardActionHandler> = {
  async get_account(_input, context) {
    const payload = await requestFluxguardJson(context, {
      method: "GET",
      path: "/account",
      phase: "execute",
    });

    return {
      account: normalizeAccount(payload),
    };
  },
  async add_page(input, context) {
    const payload = await requestFluxguardJson(context, {
      method: "POST",
      path: "/add-page",
      body: compactObject({
        url: readRequiredInputString(input.url, "url"),
        siteId: optionalString(input.siteId),
        sessionId: optionalString(input.sessionId),
        nickname: optionalString(input.nickname),
        categoryIds: readOptionalStringArray(input.categoryIds),
      }),
      phase: "execute",
    });

    return {
      page: normalizeAddPageResult(payload),
    };
  },
  async initiate_crawl(input, context) {
    const payload = await requestFluxguardJson(context, {
      method: "POST",
      path: `/site/${encodeURIComponent(readRequiredInputString(input.siteId, "siteId"))}/session/${encodeURIComponent(readRequiredInputString(input.sessionId, "sessionId"))}/crawl`,
      phase: "execute",
    });

    return {
      result: normalizeOperationResult(payload),
    };
  },
  async get_page(input, context) {
    const payload = await requestFluxguardJson(context, {
      method: "GET",
      path: `/site/${encodeURIComponent(readRequiredInputString(input.siteId, "siteId"))}/session/${encodeURIComponent(readRequiredInputString(input.sessionId, "sessionId"))}/page/${encodeURIComponent(readRequiredInputString(input.pageId, "pageId"))}`,
      phase: "execute",
    });

    return {
      page: normalizePage(payload),
    };
  },
  async get_sample_webhook(_input, context) {
    const payload = await requestFluxguardJson(context, {
      method: "GET",
      path: "/account/webhook/sample",
      phase: "execute",
    });

    return {
      sample: requireRecordPayload(payload),
    };
  },
  async list_webhooks(_input, context) {
    const payload = await requestFluxguardJson(context, {
      method: "GET",
      path: "/account/webhook",
      phase: "execute",
    });

    return {
      webhooks: normalizeWebhookList(payload),
    };
  },
  async upsert_webhook(input, context) {
    const payload = await requestFluxguardJson(context, {
      method: "PUT",
      path: "/account/webhook",
      body: compactObject({
        url: readRequiredInputString(input.url, "url"),
        siteCategoryIds: readOptionalStringArray(input.siteCategoryIds),
      }),
      phase: "execute",
    });

    return {
      webhook: normalizeWebhook(payload),
    };
  },
  async delete_webhook(_input, context) {
    const payload = await requestFluxguardJson(context, {
      method: "DELETE",
      path: "/account/webhook",
      phase: "execute",
    });

    return {
      result: normalizeOperationResult(payload),
    };
  },
  async list_categories(_input, context) {
    const payload = await requestFluxguardJson(context, {
      method: "GET",
      path: "/account/category",
      phase: "execute",
    });

    return {
      categories: normalizeCategoryList(payload),
      raw: requireRecordPayload(payload),
    };
  },
  async create_category(input, context) {
    const payload = await requestFluxguardJson(context, {
      method: "POST",
      path: "/account/category",
      body: {
        name: readRequiredInputString(input.name, "name"),
      },
      phase: "execute",
    });

    return {
      category: normalizeCategory(payload),
    };
  },
  async delete_site(input, context) {
    const payload = await requestFluxguardJson(context, {
      method: "DELETE",
      path: `/site/${encodeURIComponent(readRequiredInputString(input.siteId, "siteId"))}`,
      phase: "execute",
    });

    return {
      result: normalizeOperationResult(payload),
    };
  },
  async delete_page(input, context) {
    const payload = await requestFluxguardJson(context, {
      method: "DELETE",
      path: `/site/${encodeURIComponent(readRequiredInputString(input.siteId, "siteId"))}/session/${encodeURIComponent(readRequiredInputString(input.sessionId, "sessionId"))}/page/${encodeURIComponent(readRequiredInputString(input.pageId, "pageId"))}`,
      phase: "execute",
    });

    return {
      result: normalizeOperationResult(payload),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fluxguardActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestFluxguardJson(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      {
        method: "GET",
        path: "/account",
        phase: "validate",
      },
    );
    const account = normalizeAccount(payload);

    return {
      profile: {
        accountId: account.id ?? "api_key",
        displayName: account.id ? `Fluxguard ${account.id}` : "Fluxguard API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        accountId: account.id ?? undefined,
        accountStatus: account.status ?? undefined,
        validationEndpoint: "/account",
      }),
    };
  },
};

async function requestFluxguardJson(context: FluxguardActionContext, input: FluxguardRequestInput): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(fluxguardDefaultRequestTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-api-key": context.apiKey,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    const response = await context.fetcher(buildFluxguardUrl(input.path), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });
    const payload = await readFluxguardPayload(response);

    if (!response.ok) {
      throw buildFluxguardError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, "Fluxguard request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Fluxguard request failed: ${error.message}` : "Fluxguard request failed",
      error,
    );
  }
}

function buildFluxguardUrl(path: string): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${fluxguardApiBaseUrl}/`);
}

async function readFluxguardPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Fluxguard returned invalid JSON");
  }
}

function buildFluxguardError(status: number, payload: unknown, phase: FluxguardPhase): ProviderRequestError {
  const message = extractFluxguardErrorMessage(payload) ?? `Fluxguard request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractFluxguardErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.errorMessage);
}

function normalizeAccount(payload: unknown): Record<string, unknown> & {
  id: string | null;
  status: string | null;
} {
  const record = requireRecordPayload(payload);
  return {
    id: readFirstString(record, ["id", "accountId", "account_id", "orgId", "org_id"]),
    status: readFirstString(record, ["status", "accountStatus", "account_status"]),
    raw: record,
  };
}

function normalizeAddPageResult(payload: unknown): Record<string, unknown> {
  const record = requireRecordPayload(payload);
  return {
    siteId: readFirstString(record, ["siteId", "site_id"]),
    sessionId: readFirstString(record, ["sessionId", "session_id"]),
    pageId: readFirstString(record, ["pageId", "page_id"]),
    raw: record,
  };
}

function normalizePage(payload: unknown): Record<string, unknown> {
  const record = requireRecordPayload(payload);
  return {
    siteId: readFirstString(record, ["siteId", "site_id"]),
    sessionId: readFirstString(record, ["sessionId", "session_id"]),
    pageId: readFirstString(record, ["pageId", "page_id", "id"]),
    url: readFirstString(record, ["url", "href"]),
    raw: record,
  };
}

function normalizeWebhook(payload: unknown): Record<string, unknown> {
  const record = requireRecordPayload(payload);
  return {
    id: readFirstString(record, ["id", "webhookId", "webhook_id"]),
    url: readFirstString(record, ["url", "webhookUrl", "webhook_url"]),
    raw: record,
  };
}

function normalizeWebhookList(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      const record = optionalRecord(item);
      return record ? [normalizeWebhook(record)] : [];
    });
  }

  const record = requireRecordPayload(payload);
  const candidate = Array.isArray(record.webhooks) ? record.webhooks : Array.isArray(record.data) ? record.data : [];
  return candidate.flatMap((item) => {
    const itemRecord = optionalRecord(item);
    return itemRecord ? [normalizeWebhook(itemRecord)] : [];
  });
}

function normalizeCategory(payload: unknown, idOverride?: string): Record<string, unknown> {
  const record = requireRecordPayload(payload);
  const id = readFirstString(record, ["id", "categoryId", "category_id"]) ?? idOverride;
  if (!id) {
    throw new ProviderRequestError(502, "Fluxguard returned a category without an ID");
  }

  return {
    id,
    name: readFirstString(record, ["name"]),
    type: readFirstString(record, ["type", "categoryType", "category_type"]),
    raw: record,
  };
}

function normalizeCategoryList(payload: unknown): Array<Record<string, unknown>> {
  const record = requireRecordPayload(payload);
  if (Array.isArray(record.categories)) {
    return record.categories.flatMap((item) => {
      const itemRecord = optionalRecord(item);
      return itemRecord ? [normalizeCategory(itemRecord)] : [];
    });
  }
  if (Array.isArray(record.data)) {
    return record.data.flatMap((item) => {
      const itemRecord = optionalRecord(item);
      return itemRecord ? [normalizeCategory(itemRecord)] : [];
    });
  }

  return Object.entries(record).flatMap(([id, value]) => {
    const category = optionalRecord(value);
    return category ? [normalizeCategory(category, id)] : [];
  });
}

function normalizeOperationResult(payload: unknown): Record<string, unknown> {
  return {
    ok: true,
    raw: optionalRecord(payload) ?? null,
  };
}

function requireRecordPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Fluxguard returned an invalid payload");
  }
  return record;
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.flatMap((item) => {
    const text = optionalString(item);
    return text ? [text] : [];
  });
  return values.length > 0 ? values : undefined;
}

function readFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
