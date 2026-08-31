import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "linkly";
const linklyApiBaseUrl = "https://api.linklyhq.com";
const linklyApiPrefix = "/api/v1";
const filterKeys = ["domain", "slug", "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term"] as const;
const linkMutationFields = [
  "url",
  "domain",
  "domain_id",
  "slug",
  "name",
  "note",
  "enabled",
  "forward_params",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "expiry_datetime",
  "expiry_destination",
  "expiry_clicks",
  "public_analytics",
  "block_bots",
  "hide_referrer",
  "cloaking",
  "gtm_id",
  "ga4_tag_id",
  "fb_pixel_id",
  "tiktok_pixel_id",
  "og_title",
  "og_description",
  "og_image",
  "head_tags",
  "body_tags",
  "linkify_words",
  "replacements",
  "rules",
] as const;

type LinklyPhase = "validate" | "execute";
type LinklyMethod = "GET" | "POST" | "DELETE";
type LinklyQuery = Record<string, string | number | boolean | null | undefined>;
type LinklyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const linklyActionHandlers: ProviderActionHandlers<"linkly", LinklyActionHandler> = {
  async list_workspaces(_input, context) {
    return {
      workspaces: await fetchWorkspaces(context, "execute"),
    };
  },
  async list_links(input, context) {
    const workspaceId = requiredString(input.workspace_id, "workspace_id", providerInputError);
    const query: LinklyQuery = {
      search: optionalString(input.search),
      page: optionalNumber(input.page),
      page_size: optionalNumber(input.page_size),
      sort_by: optionalString(input.sort_by),
      sort_dir: optionalString(input.sort_dir),
    };
    const filter = optionalRecord(input.filter);
    if (filter) {
      for (const key of filterKeys) {
        const value = optionalString(filter[key]);
        if (value !== undefined) {
          query[`filter[${key}]`] = value;
        }
      }
    }

    const payload = await requestLinklyJson({
      context,
      path: `${linklyApiPrefix}/workspace/${encodeURIComponent(workspaceId)}/list_links`,
      query,
      phase: "execute",
    });

    return normalizeLinkList(payload);
  },
  async get_link(input, context) {
    const id = readRequiredNumber(input.id, "id");
    const payload = await requestLinklyJson({
      context,
      path: `${linklyApiPrefix}/link/${encodeURIComponent(String(id))}`,
      query: {
        workspace_id: optionalString(input.workspace_id),
      },
      phase: "execute",
    });

    return {
      link: requireObject(payload, "Linkly link response"),
    };
  },
  async create_link(input, context) {
    const workspaceId = requiredString(input.workspace_id, "workspace_id", providerInputError);
    const payload = await requestLinklyJson({
      context,
      path: `${linklyApiPrefix}/workspace/${encodeURIComponent(workspaceId)}/links`,
      method: "POST",
      body: buildLinkMutationBody(input),
      phase: "execute",
    });

    return {
      link: requireObject(payload, "Linkly create link response"),
    };
  },
  async update_link(input, context) {
    const workspaceId = requiredString(input.workspace_id, "workspace_id", providerInputError);
    const payload = await requestLinklyJson({
      context,
      path: `${linklyApiPrefix}/workspace/${encodeURIComponent(workspaceId)}/links`,
      method: "POST",
      body: buildLinkMutationBody(input, { includeId: true }),
      phase: "execute",
    });

    return {
      link: requireObject(payload, "Linkly update link response"),
    };
  },
  async delete_link(input, context) {
    const workspaceId = requiredString(input.workspace_id, "workspace_id", providerInputError);
    const id = readRequiredNumber(input.id, "id");
    const payload = await requestLinklyJson({
      context,
      path: `${linklyApiPrefix}/workspace/${encodeURIComponent(workspaceId)}/links/${encodeURIComponent(String(id))}`,
      method: "DELETE",
      phase: "execute",
    });

    return {
      message: readDeleteMessage(payload),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, linklyActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiKey = input.apiKey.trim();
    if (!apiKey) {
      throw new ProviderRequestError(400, "Linkly API key is required.");
    }

    const workspaces = await fetchWorkspaces({ apiKey, fetcher, signal }, "validate");
    const firstWorkspace = workspaces[0];

    return {
      profile: {
        accountId: firstWorkspace ? String(firstWorkspace.id) : undefined,
        displayName: firstWorkspace?.name || "Linkly API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: linklyApiBaseUrl,
        validationEndpoint: `${linklyApiPrefix}/workspaces`,
        workspaceCount: workspaces.length,
        firstWorkspaceId: firstWorkspace?.id,
        firstWorkspaceName: firstWorkspace?.name,
      }),
    };
  },
};

async function fetchWorkspaces(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: LinklyPhase,
): Promise<Array<{ id: number; name: string }>> {
  const payload = await requestLinklyJson({
    context,
    path: `${linklyApiPrefix}/workspaces`,
    phase,
  });

  return normalizeWorkspaces(payload);
}

async function requestLinklyJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: LinklyPhase;
  method?: LinklyMethod;
  query?: LinklyQuery;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);

  try {
    const response = await input.context.fetcher(buildLinklyUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildLinklyHeaders(input.context.apiKey, input.body !== undefined),
      signal: timeout.signal,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });

    const payload = await readLinklyPayload(response);
    if (!response.ok) {
      throw createLinklyError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Linkly request timed out.");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Linkly request failed: ${error.message}` : "Linkly request failed.",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildLinklyUrl(path: string, query: LinklyQuery = {}): URL {
  const url = new URL(path, linklyApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildLinklyHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return compactObject({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "content-type": hasBody ? "application/json" : undefined,
    "user-agent": providerUserAgent,
  }) as Record<string, string>;
}

async function readLinklyPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createLinklyError(status: number, payload: unknown, phase: LinklyPhase): ProviderRequestError {
  const message = extractLinklyErrorMessage(payload) ?? `Linkly request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractLinklyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message);
}

function normalizeWorkspaces(payload: unknown): Array<{ id: number; name: string }> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Linkly workspace response must be an array.", payload);
  }
  return payload.map((item) => {
    const record = requireObject(item, "Linkly workspace");
    return {
      id: readRequiredNumber(record.id, "workspace.id"),
      name: requiredString(record.name, "workspace.name", providerResponseError),
    };
  });
}

function normalizeLinkList(payload: unknown): Record<string, unknown> {
  const record = requireObject(payload, "Linkly link list response");
  const links = record.links;
  if (!Array.isArray(links)) {
    throw new ProviderRequestError(502, "Linkly link list response is missing links.", record);
  }

  return compactObject({
    links: links.map((item) => requireObject(item, "Linkly link")),
    page_number: optionalNumber(record.page_number),
    page_size: optionalNumber(record.page_size),
    total_entries: optionalNumber(record.total_entries),
    total_pages: optionalNumber(record.total_pages),
    total_rows: optionalNumber(record.total_rows),
    workspace_link_count: optionalNumber(record.workspace_link_count),
  });
}

function buildLinkMutationBody(
  input: Record<string, unknown>,
  options: { includeId?: boolean } = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (options.includeId) {
    body.id = readRequiredNumber(input.id, "id");
  }
  for (const field of linkMutationFields) {
    if (input[field] !== undefined) {
      body[field] = input[field];
    }
  }
  return body;
}

function readDeleteMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? "Link deleted.";
}

function requireObject(value: unknown, name: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${name} must be an object.`, value);
  }
  return record;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  const numberValue = optionalNumber(value);
  if (numberValue === undefined) {
    throw new ProviderRequestError(502, `${fieldName} must be a number.`, value);
  }
  return numberValue;
}
