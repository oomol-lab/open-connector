import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  looseArray,
  optionalBoolean,
  optionalRecord,
  optionalString,
  rawStringOrNull,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "woodpecker_co";

export const woodpeckerCoApiBaseUrl = "https://api.woodpecker.co/rest";

const woodpeckerCoDefaultRequestTimeoutMs = 30_000;

type WoodpeckerCoPhase = "validate" | "execute";
type WoodpeckerCoContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type WoodpeckerCoActionHandler = (input: Record<string, unknown>, context: WoodpeckerCoContext) => Promise<unknown>;

interface NormalizedWoodpeckerUser {
  id: number | null;
  name: string | null;
  email: string | null;
  role: string | null;
  raw: Record<string, unknown>;
}

export const woodpeckerCoActionHandlers: ProviderActionHandlers<"woodpecker_co", WoodpeckerCoActionHandler> = {
  async list_users(input, context) {
    const payload = await requestWoodpeckerCoJson({
      method: "GET",
      path: "/v2/users",
      params: compactObject({
        page: readOptionalIntegerString(input.page),
        sort: readOptionalString(input.sort),
      }),
      context,
      phase: "execute",
    });

    return normalizeUsersPayload(payload);
  },
  async list_campaigns(input, context) {
    const payload = await requestWoodpeckerCoJson({
      method: "GET",
      path: "/v1/campaign_list",
      params: compactObject({
        status: readOptionalString(input.status),
      }),
      context,
      phase: "execute",
    });

    const payloadList = readV1ListPayload(payload);

    return {
      campaigns: normalizeCampaignList(payloadList.items),
      raw: payloadList.raw,
    };
  },
  async get_campaign(input, context) {
    const campaignId = readRequiredPositiveInteger(input.campaign_id, "campaign_id");
    const payload = await requestWoodpeckerCoJson({
      method: "GET",
      path: `/v2/campaigns/${encodeURIComponent(String(campaignId))}`,
      context,
      phase: "execute",
    });

    return {
      campaign: normalizeCampaign(requireRecordPayload(payload)),
    };
  },
  async get_campaign_statistics(input, context) {
    const campaignId = readRequiredPositiveInteger(input.campaign_id, "campaign_id");
    const payload = await requestWoodpeckerCoJson({
      method: "GET",
      path: "/v1/campaign_list",
      params: {
        id: String(campaignId),
      },
      context,
      phase: "execute",
    });

    const payloadList = readV1ListPayload(payload);
    const campaignRecord = optionalRecord(payloadList.items[0]) ?? {};

    return {
      statistics: optionalRecord(campaignRecord.stats) ?? {},
      raw: campaignRecord,
    };
  },
  async list_prospects(input, context) {
    const payload = await requestWoodpeckerCoJson({
      method: "GET",
      path: "/v1/prospects",
      params: compactObject({
        page: readOptionalIntegerString(input.page),
        per_page: readOptionalIntegerString(input.per_page),
        sort: readOptionalString(input.sort),
        id: readOptionalIntegerList(input.ids)?.join(","),
        status: readOptionalString(input.status),
        contacted:
          optionalBoolean(input.contacted) === undefined ? undefined : String(optionalBoolean(input.contacted)),
        interested: readOptionalString(input.interested),
        activity: readOptionalString(input.activity),
        diff: readOptionalString(input.diff),
      }),
      context,
      phase: "execute",
    });

    const payloadList = readV1ListPayload(payload);

    return {
      prospects: normalizeProspectList(payloadList.items),
      raw: payloadList.raw,
    };
  },
  async list_mailboxes(_input, context) {
    const payload = await requestWoodpeckerCoJson({
      method: "GET",
      path: "/v2/mailboxes",
      context,
      phase: "execute",
    });
    const mailboxes = looseArray(payload);

    return {
      mailboxes: normalizeMailboxList(mailboxes),
      raw: mailboxes.map((item) => optionalRecord(item) ?? {}),
    };
  },
  async get_mailbox(input, context) {
    const mailboxId = readRequiredPositiveInteger(input.mailbox_id, "mailbox_id");
    const payload = await requestWoodpeckerCoJson({
      method: "GET",
      path: `/v2/mailboxes/${encodeURIComponent(String(mailboxId))}`,
      context,
      phase: "execute",
    });

    return {
      mailbox: normalizeMailbox(requireRecordPayload(payload)),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, woodpeckerCoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestWoodpeckerCoJson({
      method: "GET",
      path: "/v2/users",
      params: {
        page: "0",
        sort: "+id",
      },
      context: {
        apiKey: readWoodpeckerCoApiKey(input),
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const usersPayload = normalizeUsersPayload(payload);
    const firstUser = usersPayload.users[0];

    return {
      profile: {
        accountId: firstUser?.id == null ? "woodpecker-api-key" : `woodpecker:${firstUser.id}`,
        displayName: firstUser?.email ?? "Woodpecker.co API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: woodpeckerCoApiBaseUrl,
        validationEndpoint: "/v2/users",
        userCount: usersPayload.users.length,
        firstUserId: firstUser?.id ?? undefined,
        firstUserEmail: firstUser?.email ?? undefined,
      }),
    };
  },
};

async function requestWoodpeckerCoJson(input: {
  method: "GET";
  path: string;
  params?: Record<string, string | undefined>;
  context: WoodpeckerCoContext;
  phase: WoodpeckerCoPhase;
}): Promise<unknown> {
  const url = new URL(normalizeWoodpeckerCoPath(input.path), `${woodpeckerCoApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.params ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.context.signal, woodpeckerCoDefaultRequestTimeoutMs);

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.context.apiKey,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      timeout.didTimeout() ? 504 : 502,
      timeout.didTimeout()
        ? `Woodpecker.co request timed out after ${woodpeckerCoDefaultRequestTimeoutMs}ms`
        : `Woodpecker.co request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readWoodpeckerCoPayload(response);
  if (!response.ok || isWoodpeckerV1Error(payload)) {
    throw mapWoodpeckerCoError(response.status, payload, input.phase);
  }

  return payload;
}

async function readWoodpeckerCoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Woodpecker.co returned malformed JSON");
    }
    return { message: text };
  }
}

function mapWoodpeckerCoError(status: number, payload: unknown, phase: WoodpeckerCoPhase): ProviderRequestError {
  const v1Code = readWoodpeckerV1ErrorCode(payload);
  const message = extractWoodpeckerCoErrorMessage(payload) || `Woodpecker.co request failed with status ${status}`;

  if (v1Code === "E_TOO_MANY_REQUESTS" || status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403 || v1Code === "E_SESSION")) {
    return new ProviderRequestError(401, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function extractWoodpeckerCoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const directMessage = optionalString(object.detail) ?? optionalString(object.message) ?? optionalString(object.error);
  if (directMessage) {
    return directMessage.trim();
  }

  const status = optionalRecord(object.status);
  return optionalString(status?.msg)?.trim();
}

function isWoodpeckerV1Error(payload: unknown): boolean {
  const status = optionalRecord(optionalRecord(payload)?.status);
  return optionalString(status?.status) === "ERROR";
}

function readWoodpeckerV1ErrorCode(payload: unknown): string | undefined {
  const status = optionalRecord(optionalRecord(payload)?.status);
  return optionalString(status?.code);
}

function normalizeUsersPayload(payload: unknown): {
  users: NormalizedWoodpeckerUser[];
  pagination: Record<string, number | null>;
  raw: Record<string, unknown>;
} {
  const object = requireRecordPayload(payload);

  return {
    users: normalizeUserList(looseArray(object.content)),
    pagination: normalizePagination(object.pagination_data),
    raw: object,
  };
}

function normalizeUserList(value: unknown[]): NormalizedWoodpeckerUser[] {
  return value.map((item) => {
    const object = optionalRecord(item) ?? {};
    return {
      id: readNullableInteger(object.id),
      name: rawStringOrNull(object.name),
      email: rawStringOrNull(object.email),
      role: rawStringOrNull(object.role),
      raw: object,
    };
  });
}

function normalizeCampaignList(value: unknown[]): Array<Record<string, unknown>> {
  return value.map((item) => normalizeCampaign(optionalRecord(item) ?? {}));
}

function normalizeCampaign(object: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableInteger(object.id),
    name: rawStringOrNull(object.name),
    status: rawStringOrNull(object.status),
    raw: object,
  };
}

function normalizeProspectList(value: unknown[]): Array<Record<string, unknown>> {
  return value.map((item) => {
    const object = optionalRecord(item) ?? {};
    return {
      id: readNullableInteger(object.id),
      email: rawStringOrNull(object.email),
      status: rawStringOrNull(object.status),
      first_name: rawStringOrNull(object.first_name),
      last_name: rawStringOrNull(object.last_name),
      raw: object,
    };
  });
}

function normalizeMailboxList(value: unknown[]): Array<Record<string, unknown>> {
  return value.map((item) => normalizeMailbox(optionalRecord(item) ?? {}));
}

function normalizeMailbox(object: Record<string, unknown>): Record<string, unknown> {
  const details = optionalRecord(object.details) ?? {};

  return {
    id: readNullableInteger(object.id),
    type: rawStringOrNull(object.type),
    email: rawStringOrNull(details.email),
    provider: rawStringOrNull(details.provider),
    login: rawStringOrNull(details.login),
    details,
    raw: object,
  };
}

function normalizePagination(value: unknown): Record<string, number | null> {
  const object = optionalRecord(value) ?? {};

  return {
    total_elements: readNullableInteger(object.total_elements),
    total_pages: readNullableInteger(object.total_pages),
    current_page_number: readNullableInteger(object.current_page_number),
    page_size: readNullableInteger(object.page_size),
  };
}

function requireRecordPayload(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, "Woodpecker.co returned an invalid JSON object", payload);
  }
  return object;
}

function readV1ListPayload(payload: unknown): {
  items: unknown[];
  raw: Array<Record<string, unknown>> | Record<string, unknown>;
} {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      raw: payload.map((item) => optionalRecord(item) ?? {}),
    };
  }

  const object = optionalRecord(payload);
  if (object && (Object.keys(object).length === 0 || isWoodpeckerV1EmptyListPayload(object))) {
    return {
      items: [],
      raw: object,
    };
  }

  throw new ProviderRequestError(502, "Woodpecker.co returned an invalid JSON array", payload);
}

function isWoodpeckerV1EmptyListPayload(payload: Record<string, unknown>): boolean {
  const status = optionalRecord(payload.status);
  return optionalString(status?.status) === "OK" && optionalString(payload.message)?.trim() !== undefined;
}

function readWoodpeckerCoApiKey(input: { apiKey?: string }): string {
  return requiredString(input.apiKey, "woodpecker_co apiKey", (message) => new ProviderRequestError(400, message));
}

function normalizeWoodpeckerCoPath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

function readOptionalString(value: unknown): string | undefined {
  const stringValue = optionalString(value);
  return stringValue ? stringValue : undefined;
}

function readNullableInteger(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

function readOptionalIntegerString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return String(readRequiredInteger(value, "integer"));
}

function readOptionalIntegerList(value: unknown): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "integer array input is required");
  }
  return value.map((item) => readRequiredInteger(item, "ids"));
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = readRequiredInteger(value, fieldName);
  if (parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return parsed;
}
