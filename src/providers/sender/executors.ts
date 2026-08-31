import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "sender";
const senderApiBaseUrl = "https://api.sender.net/v2";

type SenderPhase = "validate" | "execute";
type SenderRequestOptions = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
};
type SenderActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

const subscriberMutationKeys = ["email", "firstname", "lastname", "groups", "fields", "phone", "trigger_automation"];
const subscriberUpdateKeys = [
  "firstname",
  "lastname",
  "groups",
  "fields",
  "phone",
  "trigger_automation",
  "subscriber_status",
  "sms_status",
  "transactional_email_status",
];

const senderActionHandlers: ProviderActionHandlers<"sender", SenderActionHandler> = {
  async list_subscribers(input, context) {
    return normalizePaginatedResponse(
      await senderRequest(context, "/subscribers", { method: "GET", query: paginationQuery(input) }, "execute"),
      "subscribers",
    );
  },
  async get_subscriber(input, context) {
    return normalizeDataObjectResponse(
      await senderRequest(
        context,
        `/subscribers/${encodeURIComponent(requiredString(input.identifier, "identifier", providerInputError))}`,
        { method: "GET" },
        "execute",
      ),
      "subscriber",
    );
  },
  async create_subscriber(input, context) {
    return normalizeMutationResponse(
      await senderRequest(
        context,
        "/subscribers",
        { method: "POST", body: pickDefined(input, subscriberMutationKeys) },
        "execute",
      ),
      "subscriber",
    );
  },
  async update_subscriber(input, context) {
    return normalizeMutationResponse(
      await senderRequest(
        context,
        `/subscribers/${encodeURIComponent(requiredString(input.identifier, "identifier", providerInputError))}`,
        { method: "PATCH", body: pickDefined(input, subscriberUpdateKeys) },
        "execute",
      ),
      "subscriber",
    );
  },
  async add_subscribers_to_group(input, context) {
    return normalizeGenericMutationResponse(
      await senderRequest(
        context,
        `/subscribers/groups/${encodeURIComponent(requiredString(input.groupId, "groupId", providerInputError))}`,
        { method: "POST", body: groupMembershipBody(input, true) },
        "execute",
      ),
    );
  },
  async remove_subscribers_from_group(input, context) {
    return normalizeGenericMutationResponse(
      await senderRequest(
        context,
        `/subscribers/groups/${encodeURIComponent(requiredString(input.groupId, "groupId", providerInputError))}`,
        { method: "DELETE", body: groupMembershipBody(input, false) },
        "execute",
      ),
    );
  },
  async list_groups(input, context) {
    return normalizePaginatedResponse(
      await senderRequest(context, "/groups", { method: "GET", query: paginationQuery(input) }, "execute"),
      "groups",
    );
  },
  async get_group(input, context) {
    return normalizeDataObjectResponse(
      await senderRequest(
        context,
        `/groups/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
        { method: "GET" },
        "execute",
      ),
      "group",
    );
  },
  async list_fields(input, context) {
    return normalizePaginatedResponse(
      await senderRequest(context, "/fields", { method: "GET", query: paginationQuery(input) }, "execute"),
      "fields",
    );
  },
  async create_field(input, context) {
    return normalizeMutationResponse(
      await senderRequest(
        context,
        "/fields",
        { method: "POST", body: pickDefined(input, ["title", "type"]) },
        "execute",
      ),
      "field",
    );
  },
  async list_campaigns(input, context) {
    return normalizePaginatedResponse(
      await senderRequest(context, "/campaigns", { method: "GET", query: campaignListQuery(input) }, "execute"),
      "campaigns",
    );
  },
  async get_campaign(input, context) {
    return normalizeDataObjectResponse(
      await senderRequest(
        context,
        `/campaigns/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
        { method: "GET" },
        "execute",
      ),
      "campaign",
    );
  },
  async list_workflows(input, context) {
    return normalizePaginatedResponse(
      await senderRequest(context, "/workflows", { method: "GET", query: workflowListQuery(input) }, "execute"),
      "workflows",
    );
  },
  async get_workflow(input, context) {
    return normalizeDataObjectResponse(
      await senderRequest(
        context,
        `/workflows/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
        { method: "GET" },
        "execute",
      ),
      "workflow",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, senderActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    await senderRequest(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "/groups",
      { method: "GET", query: { limit: 1 } },
      "validate",
    );

    return {
      profile: {
        accountId: "sender",
        displayName: "Sender API Access Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: senderApiBaseUrl,
        validationEndpoint: "/groups",
      },
    };
  },
};

async function senderRequest(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  options: SenderRequestOptions,
  phase: SenderPhase,
): Promise<unknown> {
  const url = new URL(path.startsWith("/") ? `${senderApiBaseUrl}${path}` : `${senderApiBaseUrl}/${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${context.apiKey}`,
    "user-agent": providerUserAgent,
  });
  const init: RequestInit = {
    method: options.method,
    headers,
    signal: context.signal,
  };
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(compactObject(options.body));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url.toString(), init);
    payload = await readSenderPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Sender request failed: ${error.message}` : "Sender request failed",
    );
  }

  if (!response.ok) {
    throw senderHttpError(response.status, payload, phase);
  }
  if (isSenderFailurePayload(payload)) {
    throw new ProviderRequestError(400, senderErrorMessage(payload, "Sender rejected the request"), payload);
  }
  return payload;
}

function paginationQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  return compactObject({
    page: optionalInteger(input.page),
    limit: optionalInteger(input.limit),
  }) as Record<string, number | undefined>;
}

function campaignListQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    ...paginationQuery(input),
    status: optionalString(input.status),
  }) as Record<string, string | number | undefined>;
}

function workflowListQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    ...paginationQuery(input),
    status: optionalString(input.status),
    title: optionalString(input.title),
  }) as Record<string, string | number | undefined>;
}

function groupMembershipBody(input: Record<string, unknown>, includeAutomation: boolean): Record<string, unknown> {
  return pickDefined(
    input,
    includeAutomation ? ["subscribers", "conditions", "trigger_automation"] : ["subscribers", "conditions"],
  );
}

function normalizePaginatedResponse(payload: unknown, key: string): Record<string, unknown> {
  const record = requiredRecord(payload, "Sender paginated response", providerResponseError);
  return compactObject({
    [key]: readObjectArray(record.data),
    links: optionalRecord(record.links),
    meta: optionalRecord(record.meta),
    hasMoreResources:
      optionalBoolean(record.has_more_resources) ?? optionalBoolean(record.has_more_not_deleted_subscribers),
  });
}

function normalizeDataObjectResponse(payload: unknown, key: string): Record<string, unknown> {
  const record = requiredRecord(payload, "Sender detail response", providerResponseError);
  return {
    [key]: requiredRecord(record.data, `Sender ${key} response data`, providerResponseError),
  };
}

function normalizeMutationResponse(payload: unknown, key: string): Record<string, unknown> {
  const record = requiredRecord(payload, "Sender mutation response", providerResponseError);
  return compactObject({
    success: typeof record.success === "boolean" ? record.success : true,
    message: record.message,
    [key]: optionalRecord(record.data),
  });
}

function normalizeGenericMutationResponse(payload: unknown): Record<string, unknown> {
  const record = requiredRecord(payload, "Sender mutation response", providerResponseError);
  return {
    success: typeof record.success === "boolean" ? record.success : true,
    message: record.message,
  };
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return objectArray(value, "Sender response data item", providerResponseError);
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [requiredRecord(value, "Sender response data item", providerResponseError)];
}

function pickDefined(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (input[key] !== undefined) {
      output[key] = input[key];
    }
  }
  return output;
}

async function readSenderPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isSenderFailurePayload(payload: unknown): boolean {
  const record = optionalRecord(payload);
  return record?.success === false;
}

function senderHttpError(status: number, payload: unknown, phase: SenderPhase): ProviderRequestError {
  const message = senderErrorMessage(payload, "Sender request failed");
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function senderErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return fallback;
  }

  if (typeof record.message === "string" && record.message) {
    return record.message;
  }
  if (Array.isArray(record.message) && record.message.length > 0) {
    return record.message.map(String).join("; ");
  }
  if (record.message && typeof record.message === "object") {
    return JSON.stringify(record.message);
  }
  if (typeof record.error === "string" && record.error) {
    return record.error;
  }
  if (Array.isArray(record.errors) && record.errors.length > 0) {
    return record.errors.map(String).join("; ");
  }
  return fallback;
}
