import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  createProviderTimeout,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  readProviderTextBody,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const hotjarApiBaseUrl = "https://api.hotjar.io";
const hotjarTokenUrl = `${hotjarApiBaseUrl}/v1/oauth/token`;
const hotjarMaxResponseBytes = 10 * 1024 * 1024;
const hotjarFetch = createProviderFetch({ skipDnsValidation: true });

interface HotjarCredential {
  clientId: string;
  clientSecret: string;
}

interface HotjarActionContext {
  credential: HotjarCredential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface HotjarActionHandler {
  (input: Record<string, unknown>, context: HotjarActionContext): Promise<unknown>;
}

interface HotjarRequestInput {
  accessToken: string;
  path: string;
  fetcher: typeof fetch;
  operation: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}

interface HotjarPage {
  results: unknown[];
  nextCursor: string | null;
}

export const hotjarActionHandlers: ProviderActionHandlers<"hotjar", HotjarActionHandler> = {
  async list_surveys(input, context) {
    const accessToken = await exchangeHotjarAccessToken(context.credential, context.fetcher, "execute", context.signal);
    const siteId = requiredString(input.siteId, "siteId");
    const payload = await requestHotjarJson({
      accessToken,
      path: `/v1/sites/${encodeURIComponent(siteId)}/surveys`,
      query: {
        limit: optionalInteger(input.limit),
        cursor: optionalString(input.cursor),
        with_questions: optionalBoolean(input.withQuestions),
      },
      fetcher: context.fetcher,
      operation: "list surveys",
      signal: context.signal,
    });
    const page = readHotjarPage(payload, "survey list");
    return { surveys: page.results, nextCursor: page.nextCursor };
  },
  async get_survey(input, context) {
    const accessToken = await exchangeHotjarAccessToken(context.credential, context.fetcher, "execute", context.signal);
    const siteId = requiredString(input.siteId, "siteId");
    const surveyId = requiredString(input.surveyId, "surveyId");
    const survey = requireObject(
      await requestHotjarJson({
        accessToken,
        path: `/v1/sites/${encodeURIComponent(siteId)}/surveys/${encodeURIComponent(surveyId)}`,
        fetcher: context.fetcher,
        operation: "get survey",
        signal: context.signal,
      }),
      "Hotjar get survey returned an invalid response",
    );
    return { survey };
  },
  async list_survey_responses(input, context) {
    const accessToken = await exchangeHotjarAccessToken(context.credential, context.fetcher, "execute", context.signal);
    const siteId = requiredString(input.siteId, "siteId");
    const surveyId = requiredString(input.surveyId, "surveyId");
    const payload = await requestHotjarJson({
      accessToken,
      path: `/v1/sites/${encodeURIComponent(siteId)}/surveys/${encodeURIComponent(surveyId)}/responses`,
      query: {
        limit: optionalInteger(input.limit),
        cursor: optionalString(input.cursor),
      },
      fetcher: context.fetcher,
      operation: "list survey responses",
      signal: context.signal,
    });
    const page = readHotjarPage(payload, "survey response list");
    return { responses: page.results, nextCursor: page.nextCursor };
  },
  async submit_user_lookup(input, context) {
    const accessToken = await exchangeHotjarAccessToken(context.credential, context.fetcher, "execute", context.signal);
    const organizationId = requiredString(input.organizationId, "organizationId");
    const deleteAllHits = input.deleteAllHits;
    if (typeof deleteAllHits != "boolean") {
      throw new ProviderRequestError(400, "deleteAllHits is required");
    }
    validateUserLookupIdentity(input);
    await requestHotjarJson({
      accessToken,
      path: `/v1/organizations/${encodeURIComponent(organizationId)}/user-lookup`,
      method: "POST",
      body: compactObject({
        data_subject_email: optionalString(input.dataSubjectEmail),
        data_subject_site_id_to_user_id_map: readOptionalStringRecord(input.dataSubjectSiteIdToUserIdMap),
        delete_all_hits: deleteAllHits,
      }),
      fetcher: context.fetcher,
      operation: "submit user lookup",
      signal: context.signal,
    });
    return { accepted: true };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<HotjarActionContext>({
  service: "hotjar",
  handlers: hotjarActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<HotjarActionContext> {
    const credential = await requireCustomCredential(context, "hotjar");
    return {
      credential: readHotjarCredential(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireCustomCredential(context, "hotjar");
    const accessToken = await exchangeHotjarAccessToken(
      readHotjarCredential(credential.values),
      hotjarFetch,
      "execute",
      context.signal,
    );
    const url = createProviderProxyUrl(hotjarApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("authorization", `Bearer ${accessToken}`);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await hotjarFetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    await exchangeHotjarAccessToken(readHotjarCredential(input.values), fetcher, "validate", signal);
    return {
      profile: {
        displayName: "Hotjar API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: hotjarApiBaseUrl,
        tokenEndpoint: hotjarTokenUrl,
      },
    };
  },
};

async function exchangeHotjarAccessToken(
  credential: HotjarCredential,
  fetcher: typeof fetch,
  phase: "validate" | "execute",
  signal?: AbortSignal,
) {
  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credential.clientId,
    client_secret: credential.clientSecret,
  });
  const response = await fetchHotjarResponse({
    fetcher,
    url: hotjarTokenUrl,
    init: {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      body: form.toString(),
    },
    operation: "exchange access token",
    signal,
  });
  const payload = await readHotjarPayload(response, "access token");
  if (!response.ok) {
    throw mapHotjarError(response.status, payload, phase, "access token exchange");
  }
  const tokenResponse = optionalRecord(payload);
  const accessToken = optionalString(tokenResponse?.access_token)?.trim();
  if (!accessToken) {
    throw new ProviderRequestError(502, "Hotjar access token is missing");
  }
  return accessToken;
}

function readHotjarCredential(input: Record<string, string>): HotjarCredential {
  return {
    clientId: requiredString(input.clientId, "clientId"),
    clientSecret: requiredString(input.clientSecret, "clientSecret"),
  };
}

async function requestHotjarJson(input: HotjarRequestInput) {
  const url = new URL(`${hotjarApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  }
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.accessToken}`,
    "user-agent": providerUserAgent,
  });
  if (input.body != null) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  const response = await fetchHotjarResponse({
    fetcher: input.fetcher,
    url,
    init: {
      method: input.method ?? "GET",
      headers,
      body: input.body == null ? undefined : JSON.stringify(input.body),
    },
    operation: input.operation,
    signal: input.signal,
  });
  const payload = await readHotjarPayload(response, input.operation);
  if (!response.ok) {
    throw mapHotjarError(response.status, payload, "execute", input.operation);
  }
  return payload;
}

async function fetchHotjarResponse(input: {
  fetcher: typeof fetch;
  url: string | URL;
  init: RequestInit;
  operation: string;
  signal?: AbortSignal;
}) {
  const timeout = createProviderTimeout(input.signal);
  try {
    return await input.fetcher(input.url, { ...input.init, signal: timeout.signal });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, `Hotjar ${input.operation} request timed out`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `Hotjar ${input.operation} request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

async function readHotjarPayload(response: Response, operation: string) {
  const text = await readProviderTextBody(response, "Hotjar response", hotjarMaxResponseBytes);
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, `Hotjar ${operation} returned malformed JSON`);
    }
    return text;
  }
}

function readHotjarPage(payload: unknown, label: string): HotjarPage {
  const body = requireObject(payload, `Hotjar ${label} returned an invalid response`);
  if (!Array.isArray(body.results)) {
    throw new ProviderRequestError(502, `Hotjar ${label} response is missing results`);
  }
  const nextCursor = body.next_cursor;
  if (nextCursor != null && typeof nextCursor != "string") {
    throw new ProviderRequestError(502, `Hotjar ${label} response has an invalid next_cursor`);
  }
  return {
    results: body.results,
    nextCursor: nextCursor ?? null,
  };
}

function requireObject(value: unknown, message: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message);
  }
  return object;
}

function readOptionalStringRecord(value: unknown) {
  if (value == null) {
    return undefined;
  }
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(400, "dataSubjectSiteIdToUserIdMap must be an object");
  }
  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [key, requiredString(child, `dataSubjectSiteIdToUserIdMap.${key}`)]),
  );
}

function validateUserLookupIdentity(input: Record<string, unknown>): void {
  const siteUserMap = optionalRecord(input.dataSubjectSiteIdToUserIdMap);
  if (input.dataSubjectEmail == null && (!siteUserMap || Object.keys(siteUserMap).length === 0)) {
    throw new ProviderRequestError(
      400,
      "At least one of dataSubjectEmail or dataSubjectSiteIdToUserIdMap is required.",
    );
  }
}

function requiredString(value: unknown, fieldName: string) {
  const text = optionalString(value)?.trim();
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function mapHotjarError(status: number, payload: unknown, phase: "validate" | "execute", operation: string) {
  const message = readHotjarErrorMessage(payload) ?? `Hotjar ${operation} failed with status ${status}`;
  if (phase == "validate" && (status == 400 || status == 401 || status == 403)) {
    return new ProviderRequestError(400, message);
  } else if (status == 401 || (operation == "access token exchange" && (status == 400 || status == 403))) {
    return new ProviderRequestError(401, message);
  } else if (status == 403) {
    return new ProviderRequestError(403, message);
  } else if (status == 429) {
    return new ProviderRequestError(429, message);
  } else if (status == 400 || status == 404 || status == 409 || status == 422) {
    return new ProviderRequestError(status == 404 ? 404 : 400, message);
  } else {
    return new ProviderRequestError(502, message);
  }
}

function readHotjarErrorMessage(payload: unknown) {
  if (typeof payload == "string") {
    return payload;
  }
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }
  for (const key of ["msg", "error_description", "message", "error", "code"]) {
    const value = optionalString(body[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}
