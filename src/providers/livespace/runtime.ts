import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

interface LivespaceCredentials {
  apiKey: string;
  apiSecret: string;
  subdomain: string;
}

export interface LivespaceContext extends LivespaceCredentials {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface LivespaceToken {
  token: string;
  sessionId: string;
}

interface LivespaceActionHandler {
  (input: Record<string, unknown>, context: LivespaceContext): Promise<unknown>;
}

interface LivespaceRequestInput {
  methodPath: string;
  data?: Record<string, unknown>;
  credentialPhase?: boolean;
}

interface LivespaceApiPayload {
  status?: boolean;
  result?: number;
  data?: unknown;
  error?: unknown;
}

const authFailureResultCodes = new Set([530, 560, 561, 562, 563, 564]);
const invalidInputResultCodes = new Set([400, 420, 514, 515, 516, 550]);

export const livespaceApiPathPrefix = "/api/public/json/";

export const livespaceActionHandlers: ProviderActionHandlers<"livespace", LivespaceActionHandler> = {
  get_current_user(_input, context) {
    return requestLivespaceApi(context, { methodPath: "Default/User_getInfo" });
  },
  list_users(_input, context) {
    return requestLivespaceApi(context, { methodPath: "Default/User_getAll" });
  },
  get_person(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Contact/get",
      data: { type: "contact", id: input.id },
    });
  },
  list_people(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Contact/getAllSimple",
      data: compactObject({
        type: "contact",
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
      }),
    });
  },
  search_people(input, context) {
    return searchLivespaceObjects("contact", input, context);
  },
  create_person(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Contact/addContact",
      data: { contact: input.contact },
    });
  },
  update_person(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Contact/editContact",
      data: { contact: { ...optionalRecord(input.contact), id: input.id } },
    });
  },
  delete_person(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Contact/deleteContact",
      data: { contact: { id: input.id } },
    });
  },
  get_company(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Contact/get",
      data: { type: "company", id: input.id },
    });
  },
  list_companies(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Contact/getAllSimple",
      data: compactObject({
        type: "company",
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
      }),
    });
  },
  search_companies(input, context) {
    return searchLivespaceObjects("company", input, context);
  },
  create_company(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Contact/addCompany",
      data: { company: input.company },
    });
  },
  update_company(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Contact/editCompany",
      data: { company: { ...optionalRecord(input.company), id: input.id } },
    });
  },
  delete_company(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Contact/deleteCompany",
      data: { company: { id: input.id } },
    });
  },
  get_deal(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Deal/get",
      data: { id: input.id },
    });
  },
  list_deals(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Deal/getAll",
      data: optionalRecord(input.filters) ?? {},
    });
  },
  search_deals(input, context) {
    return searchLivespaceObjects("deal", input, context);
  },
  create_deal(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Deal/addDeal",
      data: { deal: input.deal },
    });
  },
  update_deal(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Deal/editDeal",
      data: { deal: { ...optionalRecord(input.deal), id: input.id } },
    });
  },
  delete_deal(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Deal/deleteDeal",
      data: { deal: { id: input.id } },
    });
  },
  get_task(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Todo/get",
      data: { id: input.id },
    });
  },
  list_tasks(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Todo/getTodoObjects",
      data: optionalRecord(input.filters) ?? {},
    });
  },
  get_tasks_for_object(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Todo/getForObject",
      data: { type: input.type, id: input.id },
    });
  },
  create_task(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Todo/addTodo",
      data: { todo: input.todo },
    });
  },
  update_task(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Todo/editTodo",
      data: { todo: { ...optionalRecord(input.todo), id: input.id } },
    });
  },
  delete_task(input, context) {
    return requestLivespaceApi(context, {
      methodPath: "Todo/removeTodo",
      data: { id: input.id },
    });
  },
};

export async function validateLivespaceCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credentials = readLivespaceCredentials({ apiKey, values });
  const payload = await requestLivespaceApi(
    {
      ...credentials,
      fetcher,
      signal,
    },
    {
      methodPath: "Default/User_getAll",
      credentialPhase: true,
    },
  );

  return {
    profile: {
      accountId: `livespace:${credentials.subdomain}:api_key:${hashSecret(credentials.apiKey)}`,
      displayName: buildAccountLabel(credentials.subdomain, payload.data),
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: buildLivespaceApiBaseUrl(credentials.subdomain),
      subdomain: credentials.subdomain,
      validationMethod: "Default/User_getAll",
    },
  };
}

export function createLivespaceContext(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): LivespaceContext {
  return {
    ...readLivespaceCredentials({ apiKey, values }),
    fetcher,
    signal,
  };
}

export async function createLivespaceProxyBody(body: unknown, context: LivespaceContext): Promise<string> {
  const token = await fetchLivespaceToken(context, false);
  const signedData = signLivespaceData(context, token, readProxyBodyData(body));
  return new URLSearchParams({ data: JSON.stringify(signedData) }).toString();
}

export function buildLivespaceApiBaseUrl(subdomain: string): string {
  return `https://${normalizeLivespaceSubdomain(subdomain)}.livespace.io${livespaceApiPathPrefix}`;
}

export function normalizeLivespaceSubdomain(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, "Livespace subdomain is required");
  }

  let hostname = trimmed;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new ProviderRequestError(400, "Livespace workspace URL is invalid");
    }
    if (url.protocol !== "https:") {
      throw new ProviderRequestError(400, "Livespace workspace URL must use https");
    }
    hostname = url.hostname;
  } else if (trimmed.includes("/")) {
    throw new ProviderRequestError(400, "Livespace subdomain must not include a path");
  }

  const lowerHostname = hostname.toLowerCase();
  const suffix = ".livespace.io";
  if (lowerHostname.endsWith(suffix)) {
    const account = lowerHostname.slice(0, lowerHostname.length - suffix.length);
    if (!account || account.includes(".")) {
      throw new ProviderRequestError(400, "Livespace workspace host is invalid");
    }
    return account;
  }
  if (lowerHostname.includes(".") || lowerHostname.includes(":")) {
    throw new ProviderRequestError(
      400,
      "Livespace subdomain must be an account subdomain or a livespace.io workspace URL",
    );
  }
  const expectedHostname = `${lowerHostname}.livespace.io`;
  try {
    const workspaceUrl = new URL(`https://${expectedHostname}/`);
    if (workspaceUrl.hostname !== expectedHostname || workspaceUrl.username || workspaceUrl.password) {
      throw new ProviderRequestError(400, "Livespace subdomain is invalid");
    }
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(400, "Livespace subdomain is invalid");
  }
  return lowerHostname;
}

async function searchLivespaceObjects(objectType: string, input: Record<string, unknown>, context: LivespaceContext) {
  return requestLivespaceApi(context, {
    methodPath: "Search/getResult",
    data: compactObject({
      object_type: objectType,
      q: input.query,
      type: optionalString(input.type),
      condition: optionalString(input.condition),
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
    }),
  });
}

async function requestLivespaceApi(
  context: LivespaceContext,
  input: LivespaceRequestInput,
): Promise<LivespaceApiPayload> {
  const token = await fetchLivespaceToken(context, Boolean(input.credentialPhase));
  const responsePayload = await postLivespaceForm(
    context,
    input.methodPath,
    {
      data: JSON.stringify(signLivespaceData(context, token, input.data ?? {})),
    },
    Boolean(input.credentialPhase),
  );
  return normalizeLivespacePayload(responsePayload, Boolean(input.credentialPhase));
}

async function fetchLivespaceToken(context: LivespaceContext, credentialPhase: boolean): Promise<LivespaceToken> {
  const payload = await postLivespaceForm(
    context,
    "_Api/auth_call/_api_method/getToken",
    {
      _api_auth: "key",
      _api_key: context.apiKey,
    },
    credentialPhase,
  );
  const normalized = normalizeLivespacePayload(payload, credentialPhase);
  const data = optionalRecord(normalized.data);
  const token = optionalString(data?.token);
  const sessionId = optionalString(data?.session_id);
  if (!token || !sessionId) {
    throw new ProviderRequestError(502, "Livespace token response is missing token data");
  }
  return { token, sessionId };
}

async function postLivespaceForm(
  context: LivespaceContext,
  methodPath: string,
  formData: Record<string, string>,
  credentialPhase: boolean,
) {
  const timeout = createProviderTimeout(context.signal, 30_000);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(new URL(methodPath, buildLivespaceApiBaseUrl(context.subdomain)), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": providerUserAgent,
      },
      body: new URLSearchParams(formData).toString(),
      signal: timeout.signal,
    });
    payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Livespace returned a non-JSON response",
      maxBytes: 10 * 1024 * 1024,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Livespace request timed out");
    }
    throw new ProviderRequestError(
      credentialPhase ? 400 : error instanceof ProviderRequestError ? error.status : 502,
      error instanceof Error ? `Livespace request failed: ${error.message}` : "Livespace request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      credentialPhase ? 400 : response.status,
      readLivespaceErrorMessage(payload, `Livespace request failed with HTTP ${response.status}`),
      payload,
    );
  }
  return payload;
}

function signLivespaceData(
  credentials: Pick<LivespaceCredentials, "apiKey" | "apiSecret">,
  token: LivespaceToken,
  data: Record<string, unknown>,
) {
  return {
    ...data,
    _api_auth: "key",
    _api_key: credentials.apiKey,
    _api_sha: createHash("sha1").update(`${credentials.apiKey}${token.token}${credentials.apiSecret}`).digest("hex"),
    _api_session: token.sessionId,
  };
}

function normalizeLivespacePayload(payload: unknown, credentialPhase: boolean): LivespaceApiPayload {
  const objectPayload = optionalRecord(payload);
  if (!objectPayload) {
    throw new ProviderRequestError(502, "Livespace returned an invalid response payload");
  }
  const normalized: LivespaceApiPayload = {
    status: typeof objectPayload.status === "boolean" ? objectPayload.status : undefined,
    result: typeof objectPayload.result === "number" ? objectPayload.result : undefined,
    data: objectPayload.data,
    error: objectPayload.error,
  };

  if (normalized.status === false) {
    throw createLivespaceApiError(normalized, credentialPhase);
  }
  return normalized;
}

function createLivespaceApiError(payload: LivespaceApiPayload, credentialPhase: boolean) {
  const resultCode = payload.result;
  const message = readLivespaceErrorMessage(payload.error, "Livespace API request failed");
  if (typeof resultCode === "number" && authFailureResultCodes.has(resultCode)) {
    return new ProviderRequestError(credentialPhase ? 400 : 401, message, payload);
  }
  if (typeof resultCode === "number" && invalidInputResultCodes.has(resultCode)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (resultCode === 540) {
    return new ProviderRequestError(403, message, payload);
  }
  return new ProviderRequestError(credentialPhase ? 400 : 502, message, payload);
}

function readLivespaceCredentials(input: {
  apiKey?: string;
  apiSecret?: string;
  subdomain?: string;
  values?: Record<string, string>;
  providerMetadata?: Record<string, unknown>;
}): LivespaceCredentials {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const apiSecret = requiredString(
    input.apiSecret ?? input.values?.apiSecret,
    "apiSecret",
    (message) => new ProviderRequestError(400, message),
  );
  const metadataSubdomain =
    typeof input.providerMetadata?.subdomain === "string" ? input.providerMetadata.subdomain : undefined;
  return {
    apiKey,
    apiSecret,
    subdomain: normalizeLivespaceSubdomain(input.subdomain ?? input.values?.subdomain ?? metadataSubdomain),
  };
}

function readProxyBodyData(body: unknown): Record<string, unknown> {
  if (body == null) {
    return {};
  }
  if (typeof body === "string") {
    const form = new URLSearchParams(body);
    const data = form.get("data");
    if (data) {
      return readJsonObject(data, "Livespace proxy data field must be a JSON object");
    }
    return Object.fromEntries(form.entries());
  }
  if (body instanceof URLSearchParams) {
    const data = body.get("data");
    if (data) {
      return readJsonObject(data, "Livespace proxy data field must be a JSON object");
    }
    return Object.fromEntries(body.entries());
  }
  if (typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  throw new ProviderRequestError(400, "Livespace proxy requires an object or form body");
}

function readJsonObject(value: string, message: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    const objectValue = optionalRecord(parsed);
    if (objectValue) {
      return objectValue;
    }
  } catch {}
  throw new ProviderRequestError(400, message);
}

function readLivespaceErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  const errorObject = optionalRecord(error);
  const message = optionalString(errorObject?.message) ?? optionalString(errorObject?.msg);
  if (message) {
    return message;
  }
  return fallback;
}

function buildAccountLabel(subdomain: string, data: unknown) {
  const users = Array.isArray(data) ? data : undefined;
  const firstUser = optionalRecord(users?.[0]);
  const name = optionalString(firstUser?.name) ?? optionalString(firstUser?.login) ?? optionalString(firstUser?.email);
  if (name) {
    return `${name} (${subdomain}.livespace.io)`;
  }
  return `${subdomain}.livespace.io`;
}

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex").slice(0, 16);
}
