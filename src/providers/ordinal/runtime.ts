import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const ordinalApiBaseUrl = "https://app.tryordinal.com/api/v1";

const ordinalValidationPath = "/workspace";

type OrdinalRequestPhase = "validate" | "execute";
type OrdinalActionContext = ApiKeyProviderContext;
type OrdinalActionHandler = (input: Record<string, unknown>, context: OrdinalActionContext) => Promise<unknown>;

export const ordinalActionHandlers: ProviderActionHandlers<"ordinal", OrdinalActionHandler> = {
  async get_workspace(_input, context) {
    const workspace = await requestOrdinalJson({
      context,
      path: "/workspace",
      phase: "execute",
    });
    return { workspace };
  },
  async list_scheduling_profiles(_input, context) {
    const profiles = await requestOrdinalJson({
      context,
      path: "/profiles/scheduling",
      phase: "execute",
    });
    return { profiles: readArrayPayload(profiles, "Ordinal returned invalid scheduling profiles") };
  },
  async list_engagement_profiles(_input, context) {
    const profiles = await requestOrdinalJson({
      context,
      path: "/profiles/engagement",
      phase: "execute",
    });
    return { profiles: readArrayPayload(profiles, "Ordinal returned invalid engagement profiles") };
  },
  async list_users(_input, context) {
    const users = await requestOrdinalJson({
      context,
      path: "/users",
      phase: "execute",
    });
    return { users: readArrayPayload(users, "Ordinal returned invalid users") };
  },
  async list_labels(_input, context) {
    const payload = await requestOrdinalJson({
      context,
      path: "/labels",
      phase: "execute",
    });
    return { labels: readArrayProperty(payload, "labels", "Ordinal returned invalid labels") };
  },
  async list_posts(input, context) {
    const payload = await requestOrdinalJson({
      context,
      path: "/posts",
      query: input,
      phase: "execute",
    });
    const record = readObjectPayload(payload, "Ordinal returned invalid posts response");
    return {
      posts: readArrayProperty(record, "posts", "Ordinal returned invalid posts"),
      nextCursor: optionalString(record.nextCursor) ?? null,
      hasMore: typeof record.hasMore === "boolean" ? record.hasMore : false,
    };
  },
  async get_post(input, context) {
    const id = requireStringInput(input, "id");
    const payload = await requestOrdinalJson({
      context,
      path: `/posts/${encodeURIComponent(id)}`,
      phase: "execute",
    });
    return { post: readObjectProperty(payload, "post", "Ordinal returned invalid post") };
  },
  async list_ideas(input, context) {
    const payload = await requestOrdinalJson({
      context,
      path: "/ideas",
      query: input,
      phase: "execute",
    });
    const record = readObjectPayload(payload, "Ordinal returned invalid ideas response");
    return {
      ideas: readArrayProperty(record, "ideas", "Ordinal returned invalid ideas"),
      nextCursor: optionalString(record.nextCursor) ?? null,
      hasMore: typeof record.hasMore === "boolean" ? record.hasMore : false,
    };
  },
  async get_idea(input, context) {
    const id = requireStringInput(input, "id");
    const payload = await requestOrdinalJson({
      context,
      path: `/ideas/${encodeURIComponent(id)}`,
      phase: "execute",
    });
    return { idea: readObjectProperty(payload, "idea", "Ordinal returned invalid idea") };
  },
};

export async function validateOrdinalCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: OrdinalActionContext = {
    apiKey: requiredString(apiKey, "apiKey", (message) => new ProviderRequestError(401, message)),
    fetcher,
    signal,
  };
  const workspace = await requestOrdinalJson({
    context,
    path: ordinalValidationPath,
    phase: "validate",
  });
  const record = readObjectPayload(workspace, "Ordinal returned invalid workspace response");
  const workspaceId = optionalString(record.id);
  const workspaceName = optionalString(record.name);
  const workspaceSlug = optionalString(record.slug);
  const timezone = optionalString(record.timezone);

  return {
    profile: {
      accountId: workspaceId ?? buildOrdinalProviderAccountId(apiKey),
      displayName: workspaceName ?? workspaceSlug ?? "Ordinal API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: ordinalApiBaseUrl,
      validationEndpoint: ordinalValidationPath,
      workspaceId,
      workspaceSlug,
      timezone,
    }),
  };
}

async function requestOrdinalJson(input: {
  context: Pick<OrdinalActionContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  query?: Record<string, unknown>;
  phase: OrdinalRequestPhase;
}): Promise<unknown> {
  const response = await requestOrdinalResponse(input);
  const payload = await readOrdinalPayload(response);
  handleOrdinalError(response, payload, input.phase);
  return payload;
}

async function requestOrdinalResponse(input: {
  context: Pick<OrdinalActionContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  query?: Record<string, unknown>;
}): Promise<Response> {
  const apiKey = requiredString(input.context.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const timeout = createProviderTimeout(input.context.signal);
  try {
    return await input.context.fetcher(buildOrdinalUrl(input.path, input.query), {
      method: "GET",
      headers: buildOrdinalHeaders(apiKey),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Ordinal request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Ordinal request failed: ${error.message}` : "Ordinal request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildOrdinalHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

function buildOrdinalUrl(path: string, query?: Record<string, unknown>): URL {
  const normalizedBaseUrl = ordinalApiBaseUrl.endsWith("/") ? ordinalApiBaseUrl.slice(0, -1) : ordinalApiBaseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizedBaseUrl}${normalizedPath}`);
  if (!query) {
    return url;
  }

  for (const [key, value] of Object.entries(query)) {
    appendOrdinalQueryValue(url, key, value);
  }
  return url;
}

function appendOrdinalQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (Array.isArray(value)) {
    const values = value.filter((item) => item !== undefined && item !== null && item !== "");
    if (values.length > 0) {
      url.searchParams.set(key, values.map((item) => String(item)).join(","));
    }
    return;
  }

  url.searchParams.set(key, String(value));
}

async function readOrdinalPayload(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function handleOrdinalError(response: Response, payload: unknown, phase: OrdinalRequestPhase): void {
  if (response.ok) {
    return;
  }

  const record = optionalRecord(payload);
  const code = optionalString(record?.code);
  const message =
    optionalString(record?.message) ??
    (response.statusText ? `Ordinal request failed: ${response.statusText}` : "Ordinal request failed");

  if (code === "UNAUTHORIZED" || response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  }
  if (code === "TOO_MANY_REQUESTS" || response.status === 429) {
    throw new ProviderRequestError(429, message, payload);
  }
  if (code === "NOT_FOUND" || response.status === 404 || response.status === 400) {
    throw new ProviderRequestError(400, message, payload);
  }

  throw new ProviderRequestError(502, message, payload);
}

function readArrayPayload(payload: unknown, message: string): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, message);
  }
  return payload;
}

function readObjectPayload(payload: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readArrayProperty(payload: unknown, key: string, message: string): unknown[] {
  const record = readObjectPayload(payload, message);
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value;
}

function readObjectProperty(payload: unknown, key: string, message: string): Record<string, unknown> {
  const record = readObjectPayload(payload, message);
  const value = optionalRecord(record[key]);
  if (!value) {
    throw new ProviderRequestError(502, message);
  }
  return value;
}

function requireStringInput(input: Record<string, unknown>, key: string): string {
  return requiredString(input[key], key, (message) => new ProviderRequestError(400, message));
}

function buildOrdinalProviderAccountId(apiKey: string): string {
  const hash = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
  return `ordinal:api_key:${hash}`;
}
