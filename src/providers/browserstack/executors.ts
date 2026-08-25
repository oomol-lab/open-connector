import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "browserstack";
const browserstackApiBaseUrl = "https://api.browserstack.com";
const browserstackDefaultRequestTimeoutMs = 30_000;

interface BrowserstackContext {
  username: string;
  accessKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type BrowserstackQueryValue = string | number | undefined;
type BrowserstackActionHandler = (input: Record<string, unknown>, context: BrowserstackContext) => Promise<unknown>;

export const browserstackActionHandlers: ProviderActionHandlers<"browserstack", BrowserstackActionHandler> = {
  list_builds(input, context) {
    return listBuilds(input, context);
  },
  list_build_sessions(input, context) {
    return listBuildSessions(input, context);
  },
  get_session(input, context) {
    return getSession(input, context);
  },
  update_session_status(input, context) {
    return updateSessionStatus(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<BrowserstackContext>({
  service,
  handlers: browserstackActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<BrowserstackContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      username: requireUsername(credential.values.username),
      accessKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: browserstackApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    const token = Buffer.from(`${requireUsername(credential.values.username)}:${credential.apiKey}`).toString("base64");
    headers.set("authorization", `Basic ${token}`);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const username = requireUsername(input.values.username);
    await requestBrowserstackJson({
      context: { username, accessKey: input.apiKey, fetcher, signal },
      path: "/automate/builds.json",
      method: "GET",
      query: { limit: 1 },
    });
    return {
      profile: {
        accountId: username,
        displayName: username,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: browserstackApiBaseUrl,
        validationEndpoint: "/automate/builds.json",
        username,
      },
    };
  },
};

async function listBuilds(
  input: Record<string, unknown>,
  context: BrowserstackContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBrowserstackJson({
    context,
    path: "/automate/builds.json",
    method: "GET",
    query: compactObject({
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
      status: optionalString(input.status),
      projectId: optionalInteger(input.project_id),
    }),
  });
  return {
    builds: readWrappedObjectArray(payload, "automation_build", "BrowserStack builds response"),
  };
}

async function listBuildSessions(
  input: Record<string, unknown>,
  context: BrowserstackContext,
): Promise<Record<string, unknown>> {
  const buildId = requireInputString(input, "build_id");
  const payload = await requestBrowserstackJson({
    context,
    path: `/automate/builds/${encodeURIComponent(buildId)}/sessions.json`,
    method: "GET",
    query: compactObject({
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
      status: optionalString(input.status),
    }),
  });
  return {
    sessions: readWrappedObjectArray(payload, "automation_session", "BrowserStack sessions response"),
  };
}

async function getSession(
  input: Record<string, unknown>,
  context: BrowserstackContext,
): Promise<Record<string, unknown>> {
  const sessionId = requireInputString(input, "session_id");
  const payload = await requestBrowserstackJson({
    context,
    path: `/automate/sessions/${encodeURIComponent(sessionId)}.json`,
    method: "GET",
  });
  return {
    session: readWrappedObject(payload, "automation_session", "BrowserStack session response"),
  };
}

async function updateSessionStatus(
  input: Record<string, unknown>,
  context: BrowserstackContext,
): Promise<Record<string, unknown>> {
  const sessionId = requireInputString(input, "session_id");
  const payload = await requestBrowserstackJson({
    context,
    path: `/automate/sessions/${encodeURIComponent(sessionId)}.json`,
    method: "PUT",
    body: {
      status: requireInputString(input, "status"),
      reason: requireInputString(input, "reason"),
    },
  });
  return {
    session: readWrappedObject(payload, "automation_session", "BrowserStack session response"),
  };
}

async function requestBrowserstackJson(input: {
  context: BrowserstackContext;
  path: string;
  method: string;
  query?: Record<string, BrowserstackQueryValue>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(input.path, browserstackApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.context.signal, browserstackDefaultRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(url, {
      method: input.method,
      headers: buildBrowserstackHeaders(input.context, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "BrowserStack returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : (text) => text,
    });
    if (!response.ok) {
      throw mapBrowserstackError(response.status, payload);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(
        504,
        `BrowserStack request timed out after ${browserstackDefaultRequestTimeoutMs}ms`,
      );
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

function buildBrowserstackHeaders(
  credential: Pick<BrowserstackContext, "username" | "accessKey">,
  hasBody: boolean,
): Record<string, string> {
  const token = Buffer.from(`${credential.username}:${credential.accessKey}`).toString("base64");
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Basic ${token}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function mapBrowserstackError(status: number, payload: unknown): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `BrowserStack request failed with ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const root = optionalRecord(payload);
  return (
    optionalString(root?.message) ??
    optionalString(root?.error) ??
    optionalString(root?.error_message) ??
    optionalString(root?.detail)
  );
}

function requireUsername(value: unknown): string {
  return requiredString(value, "username", (message) => new ProviderRequestError(400, `browserstack ${message}`));
}

function requireInputString(input: Record<string, unknown>, fieldName: string): string {
  return requiredString(input[fieldName], fieldName, (message) => new ProviderRequestError(400, message));
}

function readWrappedObjectArray(payload: unknown, key: string, context: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${context} must be an array`);
  }
  return payload.map((item) => readWrappedObject(item, key, context));
}

function readWrappedObject(payload: unknown, key: string, context: string): Record<string, unknown> {
  const value = optionalRecord(optionalRecord(payload)?.[key]);
  if (!value) {
    throw new ProviderRequestError(502, `${context} must include ${key}`);
  }
  return value;
}
