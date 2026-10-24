import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyActionRequest } from "../provider-executors.ts";
import type { ProviderActionHandlers, ProviderActionName } from "../provider-executors.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const justCallApiBaseUrl = "https://api.justcall.io";
export const justCallValidationPath = "/v2.1/users";

export interface JustCallActionContext {
  apiKey: string;
  apiSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface JustCallRequestOptions extends JustCallActionContext {
  path: string;
  phase: "validate" | "execute";
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}

type JustCallActionHandler = (input: Record<string, unknown>, context: JustCallActionContext) => Promise<unknown>;

export const justCallActionHandlers: ProviderActionHandlers<"justcall", JustCallActionHandler> = {
  list_contacts(input, context) {
    return listRecords(
      "/v2.1/contacts",
      compactObject({
        across_team: stringifyBoolean(input.acrossTeam),
        agent_ids: stringifyArray(input.agentIds),
        contact_number: optionalString(input.contactNumber),
        first_name: optionalString(input.firstName),
        last_name: optionalString(input.lastName),
        status: stringifyArray(input.statuses),
        per_page: stringifyValue(input.perPage),
        page: stringifyValue(input.page),
        order: optionalString(input.order),
        last_contact_id_fetched: stringifyValue(input.lastContactIdFetched),
      }),
      context,
    );
  },
  get_contact(input, context) {
    return getRecord(`/v2.1/contacts/${readIdentifier(input.id, "id")}`, context);
  },
  create_contact(input, context) {
    return writeRecord("/v2.1/contacts", "POST", buildContactBody(input), context);
  },
  update_contact(input, context) {
    assertContactSelector(input);
    return writeRecord(
      "/v2.1/contacts",
      "PUT",
      compactObject({
        ...buildContactBody(input),
        id: input.id,
        notes: input.notes,
      }),
      context,
    );
  },
  update_contact_status(input, context) {
    assertContactSelector(input);
    if (input.addTo === undefined && input.removeFrom === undefined) {
      throw new ProviderRequestError(400, "addTo or removeFrom is required");
    }
    return writeRecord(
      "/v2.1/contacts/status",
      "PUT",
      compactObject({
        id: input.id,
        contact_number: input.contactNumber,
        add_to: input.addTo,
        remove_from: input.removeFrom,
        across_team: input.acrossTeam,
      }),
      context,
    );
  },
  async delete_contact(input, context) {
    assertContactSelector(input);
    const payload = await requestJustCallJson({
      ...context,
      path: "/v2.1/contacts",
      phase: "execute",
      method: "DELETE",
      query: compactObject({
        id: stringifyValue(input.id),
        contact_number: optionalString(input.contactNumber),
        across_team: stringifyBoolean(input.acrossTeam),
      }),
    });
    return normalizeRecord(payload, "delete contact");
  },
  list_users(input, context) {
    return listRecords(
      "/v2.1/users",
      compactObject({
        available: stringifyBoolean(input.available),
        email: optionalString(input.email),
        group_id: stringifyValue(input.groupId),
        role: optionalString(input.role),
        page: stringifyValue(input.page),
        per_page: stringifyValue(input.perPage),
        order: optionalString(input.order),
      }),
      context,
    );
  },
  get_user(input, context) {
    return getRecord(`/v2.1/users/${readIdentifier(input.id, "id")}`, context);
  },
};

export async function validateJustCallCredential(
  input: { apiKey: string; apiSecret: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = input.apiKey;
  const apiSecret = requiredInputString(input.apiSecret, "apiSecret");
  await requestJustCallJson({
    apiKey,
    apiSecret,
    fetcher,
    signal,
    path: justCallValidationPath,
    phase: "validate",
    query: { page: "0", per_page: "1" },
  });

  return {
    profile: { displayName: "JustCall API Credentials" },
    metadata: {
      apiBaseUrl: justCallApiBaseUrl,
      validationEndpoint: justCallValidationPath,
    },
  };
}

export async function executeJustCallAction(
  input: ApiKeyActionRequest & {
    actionName: ProviderActionName<"justcall">;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  return justCallActionHandlers[input.actionName](input.input, {
    apiKey: input.apiKey,
    apiSecret: requiredInputString(input.values?.apiSecret, "apiSecret"),
    fetcher,
  });
}

async function listRecords(path: string, query: Record<string, string | undefined>, context: JustCallActionContext) {
  const payload = await requestJustCallJson({
    ...context,
    path,
    phase: "execute",
    query,
  });
  const raw = requiredResponseRecord(payload, "JustCall list response");
  const data = raw.data;
  const dataObject = optionalRecord(data);
  const records = readListRecords(raw, data, dataObject);
  const pagination =
    optionalRecord(raw.pagination) ?? optionalRecord(raw.meta) ?? optionalRecord(dataObject?.pagination) ?? {};

  return {
    records,
    pagination,
    raw,
  };
}

function readListRecords(raw: Record<string, unknown>, data: unknown, dataObject: Record<string, unknown> | undefined) {
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(dataObject?.data)) {
    return dataObject.data;
  }
  if (Array.isArray(raw.records)) {
    return raw.records;
  }
  throw new ProviderRequestError(502, "JustCall list response did not include a record array");
}

async function getRecord(path: string, context: JustCallActionContext) {
  const payload = await requestJustCallJson({ ...context, path, phase: "execute" });
  return normalizeRecord(payload, "record");
}

async function writeRecord(
  path: string,
  method: "POST" | "PUT",
  body: Record<string, unknown>,
  context: JustCallActionContext,
) {
  const payload = await requestJustCallJson({
    ...context,
    path,
    phase: "execute",
    method,
    body,
  });
  return normalizeRecord(payload, "write response");
}

function normalizeRecord(payload: unknown, label: string) {
  const raw = requiredResponseRecord(payload, `JustCall ${label}`);
  return {
    record: optionalRecord(raw.data) ?? raw,
    raw,
  };
}

async function requestJustCallJson(options: JustCallRequestOptions) {
  return runProviderRequest({ label: "JustCall", signal: options.signal }, async (signal) => {
    const url = new URL(options.path, justCallApiBaseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: buildJustCallAuthorizationHeader(options.apiKey, options.apiSecret),
      "user-agent": providerUserAgent,
    };
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
    const payload = await readJustCallPayload(response);
    if (!response.ok) {
      throw mapJustCallError(response.status, payload, options.phase);
    }
    return payload;
  });
}

async function readJustCallPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "JustCall returned invalid JSON");
    }
    return { message: text };
  }
}

function mapJustCallError(status: number, payload: unknown, phase: "validate" | "execute") {
  const message = readErrorMessage(payload) ?? `JustCall request failed with status ${status}`;
  if (phase === "validate" && (status === 401 || status === 403)) {
    return providerInputError(message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status, message);
}

function readErrorMessage(payload: unknown) {
  const body = optionalRecord(payload);
  return (
    optionalString(body?.message) ?? optionalString(body?.error) ?? optionalString(optionalRecord(body?.error)?.message)
  );
}

function buildContactBody(input: Record<string, unknown>) {
  return compactObject({
    first_name: input.firstName,
    last_name: input.lastName,
    contact_number: input.contactNumber,
    other_numbers: input.otherNumbers,
    extension: input.extension,
    email: input.email,
    company: input.company,
    address: input.address,
    notes: input.notes,
    across_team: input.acrossTeam,
    agent_id: input.agentId,
    agent_ids: input.agentIds,
  });
}

function assertContactSelector(input: Record<string, unknown>) {
  if (input.id === undefined && input.contactNumber === undefined) {
    throw new ProviderRequestError(400, "id or contactNumber is required");
  }
}

function readIdentifier(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return String(value);
}

function stringifyValue(value: unknown) {
  return value === undefined ? undefined : String(value);
}

function stringifyBoolean(value: unknown) {
  return typeof value === "boolean" ? String(value) : undefined;
}

function stringifyArray(value: unknown) {
  return Array.isArray(value) ? value.join(",") : undefined;
}

export function buildJustCallAuthorizationHeader(apiKey: string, apiSecret: string) {
  return `${apiKey}:${apiSecret}`;
}
