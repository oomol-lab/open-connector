import type { CredentialValidationResult } from "../../core/types.ts";
import type { BearerProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { GiteeActionName } from "./actions.ts";

import { compactObject, optionalIntegerLike, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment, queryParams } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const giteeApiBaseUrl = "https://gitee.com/api/v5";

type GiteeRequestPhase = "validate" | "execute";

interface GiteeRequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
}

export const giteeActionHandlers: Record<GiteeActionName, ProviderRuntimeHandler<BearerProviderContext>> = {
  async get_current_user(_input, context) {
    return requireGiteeObject(await giteeRequestJson("/user", context), "current user");
  },
  async list_my_repositories(input, context) {
    const payload = await giteeRequestJson<unknown>("/user/repos", context, "execute", {
      query: {
        visibility: optionalString(input.visibility),
        q: optionalString(input.q),
        sort: optionalString(input.sort),
        direction: optionalString(input.direction),
        page: optionalIntegerLike(input.page, "page", createInputError),
        per_page: optionalIntegerLike(input.perPage, "perPage", createInputError),
      },
    });
    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Gitee repositories response is not an array", payload);
    }
    return { repositories: payload };
  },
  async get_repository(input, context) {
    const owner = requiredString(input.owner, "owner", createInputError);
    const repo = requiredString(input.repo, "repo", createInputError);
    return requireGiteeObject(
      await giteeRequestJson(`/repos/${encodePathSegment(owner)}/${encodePathSegment(repo)}`, context),
      "repository",
    );
  },
};

export async function validateGiteeCredential(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  grantedScopes: string[] = [],
): Promise<CredentialValidationResult> {
  const currentUser = requireGiteeObject(
    await giteeRequestJson("/user", { accessToken, fetcher, signal }, "validate"),
    "current user",
  );
  const id = readPrimitive(currentUser.id);
  const login = optionalString(currentUser.login);
  const name = optionalString(currentUser.name);
  const accountId = id ? `gitee:${id}` : login ? `gitee:${login}` : "gitee:user";

  return {
    profile: {
      accountId,
      displayName: name ?? login ?? id ?? "Gitee User",
    },
    grantedScopes,
    metadata: {
      apiBaseUrl: giteeApiBaseUrl,
      validationEndpoint: "/user",
      currentUser: compactObject({
        id: currentUser.id,
        login,
        name,
        email: optionalString(currentUser.email),
        html_url: optionalString(currentUser.html_url),
      }),
    },
  };
}

export function parseGiteeScopes(value: unknown): string[] {
  const scope = optionalString(value);
  return scope ? [...new Set(scope.split(/\s+/u).filter(Boolean))] : [];
}

async function giteeRequestJson<T = unknown>(
  path: string,
  context: Pick<BearerProviderContext, "accessToken" | "fetcher" | "signal">,
  phase: GiteeRequestPhase = "execute",
  options: GiteeRequestOptions = {},
): Promise<T> {
  const url = new URL(`${giteeApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(queryParams(options.query ?? {}))) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.accessToken}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Gitee request failed: ${error.message}` : "Gitee request failed",
    );
  }

  const text = await response.text().catch(() => "");
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      if (response.ok) {
        throw new ProviderRequestError(502, "Gitee returned invalid JSON");
      }
      payload = text;
    }
  }

  if (!response.ok) {
    throw createGiteeError(response, payload, phase);
  }
  return payload as T;
}

function createGiteeError(response: Response, payload: unknown, phase: GiteeRequestPhase): ProviderRequestError {
  const providerMessage = extractGiteeErrorMessage(payload) ?? response.statusText ?? "Gitee request failed";
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : response.status,
      `Gitee authentication failed: ${providerMessage}`,
      payload,
    );
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, `Gitee rate limit exceeded: ${providerMessage}`, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, `Gitee request failed: ${providerMessage}`, payload);
  }
  return new ProviderRequestError(
    response.status >= 500 ? 502 : 400,
    `Gitee request failed: ${providerMessage}`,
    payload,
  );
}

function extractGiteeErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload || undefined;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error_description) ?? optionalString(record?.error);
}

function readPrimitive(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function requireGiteeObject(value: unknown, resource: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, `Gitee ${resource} response is not an object`, value);
}

function createInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
