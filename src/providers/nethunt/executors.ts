import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { NethuntActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "nethunt";
const nethuntApiBaseUrl = "https://nethunt.com/api/v1/zapier";
const nethuntAuthTestPath = "/triggers/auth-test";

type NethuntRequestPhase = "validate" | "execute";

interface NethuntContext {
  apiKey: string;
  email: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type NethuntActionHandler = (input: Record<string, unknown>, context: NethuntContext) => Promise<unknown>;

export const nethuntActionHandlers: Record<NethuntActionName, NethuntActionHandler> = {
  async list_readable_folders(_input, context): Promise<unknown> {
    return {
      folders: await nethuntGetJson("/triggers/readable-folder", context, "execute"),
    };
  },
  async list_writable_folders(_input, context): Promise<unknown> {
    return {
      folders: await nethuntGetJson("/triggers/writable-folder", context, "execute"),
    };
  },
  async list_folder_fields(input, context): Promise<unknown> {
    return {
      fields: await nethuntGetJson(
        `/triggers/folder-field/${encodeURIComponent(readRequiredInputString(input, "folderId"))}`,
        context,
        "execute",
      ),
    };
  },
  async find_records(input, context): Promise<unknown> {
    if (!optionalString(input.recordId) && !optionalString(input.query)) {
      throw new ProviderRequestError(400, "recordId or query is required.");
    }
    return {
      records: await nethuntGetJson(buildFindRecordsPath(input), context, "execute"),
    };
  },
  async list_new_records(input, context): Promise<unknown> {
    return {
      records: await nethuntGetJson(buildRecentFolderPath("/triggers/new-record", input), context, "execute"),
    };
  },
  async list_updated_records(input, context): Promise<unknown> {
    return {
      records: await nethuntGetJson(buildUpdatedRecordPath("/triggers/updated-record", input), context, "execute"),
    };
  },
  async list_record_changes(input, context): Promise<unknown> {
    return {
      changes: await nethuntGetJson(buildUpdatedRecordPath("/triggers/record-change", input), context, "execute"),
    };
  },
  async create_record(input, context): Promise<unknown> {
    const folderId = readRequiredInputString(input, "folderId");
    const payload = compactObject({
      timeZone: readRequiredInputString(input, "timeZone"),
      fields: input.fields,
    });

    return {
      record: await nethuntPostJson(`/actions/create-record/${encodeURIComponent(folderId)}`, payload, context),
    };
  },
  async update_record(input, context): Promise<unknown> {
    const recordId = readRequiredInputString(input, "recordId");
    const url = createNethuntUrl(`/actions/update-record/${encodeURIComponent(recordId)}`);
    const overwrite = optionalBoolean(input.overwrite);
    if (overwrite !== undefined) {
      url.searchParams.set("overwrite", String(overwrite));
    }

    return {
      record: await nethuntPostJson(pathFromNethuntUrl(url), { fieldActions: input.fieldActions }, context),
    };
  },
  async delete_record(input, context): Promise<unknown> {
    await nethuntPostJson(
      `/actions/delete-record/${encodeURIComponent(readRequiredInputString(input, "recordId"))}`,
      undefined,
      context,
    );
    return { deleted: true };
  },
  async create_comment(input, context): Promise<unknown> {
    return {
      comment: await nethuntPostJson(
        `/actions/create-comment/${encodeURIComponent(readRequiredInputString(input, "recordId"))}`,
        { text: readRequiredInputString(input, "text") },
        context,
      ),
    };
  },
  async list_new_comments(input, context): Promise<unknown> {
    return {
      comments: await nethuntGetJson(buildRecentFolderPath("/triggers/new-comment", input), context, "execute"),
    };
  },
  async create_call_log(input, context): Promise<unknown> {
    return {
      callLog: await nethuntPostJson(
        `/actions/create-call-log/${encodeURIComponent(readRequiredInputString(input, "recordId"))}`,
        compactObject({
          text: readRequiredInputString(input, "text"),
          time: optionalString(input.time),
          duration: typeof input.duration === "number" ? input.duration : undefined,
        }),
        context,
      ),
    };
  },
  async list_new_call_logs(input, context): Promise<unknown> {
    return {
      callLogs: await nethuntGetJson(buildRecentFolderPath("/triggers/new-call-log", input), context, "execute"),
    };
  },
  async auth_test(_input, context): Promise<unknown> {
    return normalizeAuthTestPayload(await nethuntGetJson(nethuntAuthTestPath, context, "execute"));
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<NethuntContext>({
  service,
  handlers: nethuntActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<NethuntContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      email: readCredentialEmail(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(nethuntApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", nethuntBasicAuthorization(readCredentialEmail(credential.values), credential.apiKey));
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `NetHunt request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "NetHunt request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const context = {
      apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
      email: readCredentialEmail(input.values),
      fetcher,
      signal,
    };
    const payload = normalizeAuthTestPayload(await nethuntGetJson(nethuntAuthTestPath, context, "validate"));
    const user = readPayloadObject(payload, "user");
    const userName = optionalString(user.personalName);
    const userEmail = optionalString(user.emailAddress);
    if (!userEmail) {
      throw new ProviderRequestError(502, "NetHunt auth-test response missing user.emailAddress");
    }

    return {
      profile: {
        accountId: `nethunt:${userEmail}`,
        displayName: userName ? `${userName} <${userEmail}>` : userEmail,
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: nethuntApiBaseUrl,
        validationEndpoint: nethuntAuthTestPath,
        userName,
        userEmail,
      }),
    };
  },
};

function buildFindRecordsPath(input: Record<string, unknown>): string {
  const folderId = readRequiredInputString(input, "folderId");
  const url = createNethuntUrl(`/searches/find-record/${encodeURIComponent(folderId)}`);
  setOptionalQuery(url, "recordId", optionalString(input.recordId));
  setOptionalQuery(url, "query", optionalString(input.query));
  setOptionalQuery(url, "limit", optionalInteger(input.limit));
  return pathFromNethuntUrl(url);
}

function buildRecentFolderPath(prefix: string, input: Record<string, unknown>): string {
  const folderId = readRequiredInputString(input, "folderId");
  const url = createNethuntUrl(`${prefix}/${encodeURIComponent(folderId)}`);
  setOptionalQuery(url, "since", optionalString(input.since));
  setOptionalQuery(url, "limit", optionalInteger(input.limit));
  return pathFromNethuntUrl(url);
}

function buildUpdatedRecordPath(prefix: string, input: Record<string, unknown>): string {
  const folderId = readRequiredInputString(input, "folderId");
  const url = createNethuntUrl(`${prefix}/${encodeURIComponent(folderId)}`);
  setOptionalQuery(url, "recordId", optionalString(input.recordId));
  setRepeatedQuery(url, "fieldName", readOptionalStringArray(input.fieldName));
  setOptionalQuery(url, "since", optionalString(input.since));
  setOptionalQuery(url, "limit", optionalInteger(input.limit));
  return pathFromNethuntUrl(url);
}

async function nethuntGetJson(path: string, context: NethuntContext, phase: NethuntRequestPhase): Promise<unknown> {
  return nethuntRequestJson("GET", path, undefined, context, phase);
}

async function nethuntPostJson(
  path: string,
  body: Record<string, unknown> | undefined,
  context: NethuntContext,
): Promise<unknown> {
  return nethuntRequestJson("POST", path, body, context, "execute");
}

async function nethuntRequestJson(
  method: "GET" | "POST",
  path: string,
  body: Record<string, unknown> | undefined,
  context: NethuntContext,
  phase: NethuntRequestPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(createNethuntUrl(path), {
      method,
      headers: nethuntHeaders(context, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readNethuntPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `NetHunt request failed: ${error.message}` : "NetHunt request failed",
    );
  }

  if (!response.ok) {
    throw createNethuntError(response, payload, phase);
  }

  return payload;
}

function nethuntHeaders(context: NethuntContext, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: nethuntBasicAuthorization(context.email, context.apiKey),
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function createNethuntUrl(path: string): URL {
  return new URL(`${nethuntApiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);
}

function pathFromNethuntUrl(url: URL): string {
  return `${url.pathname.slice("/api/v1/zapier".length)}${url.search}`;
}

function normalizeAuthTestPayload(payload: unknown): unknown {
  return Array.isArray(payload) ? (payload[0] ?? {}) : payload;
}

async function readNethuntPayload(response: Response): Promise<unknown> {
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

function createNethuntError(response: Response, payload: unknown, phase: NethuntRequestPhase): ProviderRequestError {
  const message = extractNethuntErrorMessage(payload) ?? response.statusText ?? "NetHunt request failed";
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function extractNethuntErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "error", "errorMessage", "description"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function readPayloadObject(payload: unknown, key: string): Record<string, unknown> {
  return optionalRecord(optionalRecord(payload)?.[key]) ?? {};
}

function readCredentialEmail(input: Record<string, unknown>): string {
  return requiredString(input.email, "email", () => new ProviderRequestError(400, "NetHunt email is required"));
}

function readRequiredInputString(input: Record<string, unknown>, key: string): string {
  return requiredString(input[key], key, (message) => new ProviderRequestError(400, message));
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function setOptionalQuery(url: URL, name: string, value: string | number | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(name, String(value));
  }
}

function setRepeatedQuery(url: URL, name: string, values: string[] | undefined): void {
  for (const value of values ?? []) {
    url.searchParams.append(name, value);
  }
}

function nethuntBasicAuthorization(email: string, apiKey: string): string {
  return `Basic ${Buffer.from(`${email}:${apiKey}`).toString("base64")}`;
}
