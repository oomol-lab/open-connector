import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  recordOrEmpty,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const cyberimpactApiBaseUrl = "https://api.cyberimpact.com";

type CyberimpactPhase = "validate" | "execute";
type CyberimpactHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const cyberimpactActionHandlers: ProviderActionHandlers<"cyberimpact", CyberimpactHandler> = {
  list_members(input, context) {
    return listRecords("members", input, context);
  },
  get_member(input, context) {
    return getRecord("members", "member", String(input.key), input, context);
  },
  create_member(input, context) {
    return writeRecord("POST", "members", "member", undefined, input, context);
  },
  update_member(input, context) {
    assertAtLeastOne(
      input,
      [
        "email",
        "gender",
        "firstname",
        "lastname",
        "company",
        "language",
        "birthdate",
        "postalCode",
        "country",
        "note",
        "customFields",
      ],
      "at least one member field is required",
    );
    return writeRecord("PATCH", "members", "member", String(input.key), input, context);
  },
  delete_member(input, context) {
    return deleteRecord("members", String(input.key), context);
  },
  list_groups(input, context) {
    return listRecords("groups", input, context);
  },
  get_group(input, context) {
    return getRecord("groups", "group", String(input.id), input, context);
  },
  create_group(input, context) {
    return writeRecord("POST", "groups", "group", undefined, input, context);
  },
  update_group(input, context) {
    assertAtLeastOne(input, ["title", "isPublic"], "title or isPublic is required");
    return writeRecord("PATCH", "groups", "group", String(input.id), input, context);
  },
  delete_group(input, context) {
    return deleteRecord("groups", String(input.id), context);
  },
  list_templates(input, context) {
    return listRecords("templates", input, context);
  },
  get_template(input, context) {
    return getRecord("templates", "template", String(input.id), input, context);
  },
  create_template(input, context) {
    assertAtLeastOne(input, ["bodyHtml", "bodyText"], "bodyHtml or bodyText is required");
    return writeRecord("POST", "templates", "template", undefined, input, context);
  },
  replace_template(input, context) {
    assertAtLeastOne(input, ["bodyHtml", "bodyText"], "bodyHtml or bodyText is required");
    return writeRecord("PUT", "templates", "template", String(input.id), input, context);
  },
  delete_template(input, context) {
    return deleteRecord("templates", String(input.id), context);
  },
};

export async function validateCyberimpactCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestCyberimpactJson({ path: "/ping", apiKey, fetcher, signal, phase: "validate" });
  const account = recordOrEmpty(payload);
  const email = optionalString(account.email);
  const username = optionalString(account.username);
  const accountName = optionalString(account.account);
  return {
    profile: {
      accountId: email ?? username ?? "cyberimpact:token",
      displayName: accountName ?? email ?? username ?? "Cyberimpact API Token",
    },
    grantedScopes: [],
    metadata: compactObject({ email, username, account: accountName, validationEndpoint: "/ping" }),
  };
}

async function listRecords(
  resource: "members" | "groups" | "templates",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) {
  const payload = await requestCyberimpactJson({
    path: `/${resource}`,
    query: compactObject({
      page: optionalInteger(input.page),
      limit: optionalInteger(input.limit),
      status: optionalString(input.status),
      sort: optionalString(input.sort),
      joinedOnFrom: optionalString(input.joinedOnFrom),
      joinedOnTo: optionalString(input.joinedOnTo),
      updatedOnFrom: optionalString(input.updatedOnFrom),
      updatedOnTo: optionalString(input.updatedOnTo),
      dateReturnFormat: optionalString(input.dateReturnFormat),
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return normalizePaginatedPayload(payload, resource);
}

async function getRecord(
  resource: "members" | "groups" | "templates",
  outputField: "member" | "group" | "template",
  id: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) {
  const payload = await requestCyberimpactJson({
    path: `/${resource}/${encodePathSegment(id)}`,
    query: compactObject({ dateReturnFormat: optionalString(input.dateReturnFormat) }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { [outputField]: recordOrEmpty(payload) };
}

async function writeRecord(
  method: "POST" | "PATCH" | "PUT",
  resource: "members" | "groups" | "templates",
  outputField: "member" | "group" | "template",
  id: string | undefined,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) {
  const payload = await requestCyberimpactJson({
    path: id ? `/${resource}/${encodePathSegment(id)}` : `/${resource}`,
    method,
    body: buildCyberimpactBody(input),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { [outputField]: recordOrEmpty(payload) };
}

async function deleteRecord(resource: "members" | "groups" | "templates", id: string, context: ApiKeyProviderContext) {
  const payload = await requestCyberimpactJson({
    path: `/${resource}/${encodePathSegment(id)}`,
    method: "DELETE",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { result: recordOrEmpty(payload) };
}

function buildCyberimpactBody(input: Record<string, unknown>): Record<string, unknown> {
  const groupIds = Array.isArray(input.groupIds)
    ? input.groupIds.map((groupId) => String(groupId)).join(",")
    : undefined;
  const body = compactObject({
    email: input.email,
    gender: input.gender,
    groups: groupIds,
    firstname: input.firstname,
    lastname: input.lastname,
    company: input.company,
    language: input.language,
    birthdate: input.birthdate,
    postalCode: input.postalCode,
    country: input.country,
    note: input.note,
    customFields: input.customFields,
    title: input.title,
    isPublic: optionalBoolean(input.isPublic),
    bodyHtml: input.bodyHtml,
    bodyText: input.bodyText,
  });
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== "id" && key !== "key" && key !== "groupIds"),
  );
}

async function requestCyberimpactJson(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: CyberimpactPhase;
  method?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<unknown> {
  const url = new URL(input.path, cyberimpactApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
    "user-agent": providerUserAgent,
  });
  const init: RequestInit = { method: input.method ?? "GET", headers, signal: input.signal };
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(input.body);
  }
  const response = await input.fetcher(url, init);
  const text = await response.text();
  const payload = parseJson(text, response.status, response.ok);
  if (!response.ok) throw createCyberimpactError(response.status, payload, input.phase);
  return payload;
}

function parseJson(text: string, status: number, requireJson: boolean): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!requireJson) return {};
    throw new ProviderRequestError(502, `Cyberimpact returned invalid JSON with status ${status}`);
  }
}

function normalizePaginatedPayload(
  payload: unknown,
  fieldName: "members" | "groups" | "templates",
): Record<string, unknown> {
  const object = recordOrEmpty(payload);
  const records = object[fieldName];
  if (!Array.isArray(records)) throw new ProviderRequestError(502, `Cyberimpact ${fieldName} response is invalid`);
  return {
    [fieldName]: records.map(recordOrEmpty),
    totalCount: optionalInteger(object.totalCount) ?? records.length,
    page: optionalInteger(object.page) ?? 1,
    limit: optionalInteger(object.limit) ?? records.length,
    sort: optionalString(object.sort) ?? "",
    raw: object,
  };
}

function createCyberimpactError(status: number, payload: unknown, phase: CyberimpactPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Cyberimpact request failed with status ${status}`;
  if (phase === "validate" && (status === 401 || status === 403)) return new ProviderRequestError(400, message);
  return new ProviderRequestError(status || 502, message);
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.description))
    : undefined;
}

function assertAtLeastOne(input: Record<string, unknown>, keys: string[], message: string): void {
  if (keys.every((key) => input[key] === undefined)) throw new ProviderRequestError(400, message);
}
