import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  integer,
  optionalBoolean,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const owlProtocolApiBaseUrl = "https://api.owl.build";

const owlProtocolDefaultRequestTimeoutMs = 30_000;
const authProbePath = "/api/auth";
const projectInfoPath = "/api/project/info";

type OwlProtocolRequestPhase = "validate" | "execute";
type OwlProtocolActionContext = ApiKeyProviderContext;
type OwlProtocolActionHandler = (input: Record<string, unknown>, context: OwlProtocolActionContext) => Promise<unknown>;

interface OwlProtocolProject {
  slug: string;
  teamId: string;
  name: string;
  defaultChainId: number;
  description?: string;
  authorizedDomains?: string[];
  coverImage?: string;
  projectType?: string;
  isArchived?: boolean;
  hasPublicUsers?: boolean;
}

interface OwlProtocolToken {
  chainId: number;
  address: string;
  tokenId: string;
  metadata?: Record<string, unknown>;
}

export const owlProtocolActionHandlers: ProviderActionHandlers<"owl_protocol", OwlProtocolActionHandler> = {
  async get_project_info(_input, context) {
    const project = normalizeProject(
      await requestOwlProtocolJson({
        context,
        method: "GET",
        path: projectInfoPath,
        phase: "execute",
      }),
    );

    return { project };
  },

  async get_project_token(input, context) {
    const token = normalizeToken(
      await requestOwlProtocolJson({
        context,
        method: "GET",
        path: buildProjectTokenPath(input),
        phase: "execute",
      }),
    );

    return { token };
  },

  async patch_project_token(input, context) {
    const token = normalizeToken(
      await requestOwlProtocolJson({
        context,
        method: "PATCH",
        path: buildProjectTokenPath(input),
        phase: "execute",
        body: {
          metadata: requiredRecord(input.metadata, "metadata", providerInputError),
        },
      }),
    );

    return { token };
  },
};

export async function validateOwlProtocolCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: Pick<OwlProtocolActionContext, "apiKey" | "fetcher" | "signal"> = {
    apiKey: requiredString(apiKey, "apiKey", (message) => new ProviderRequestError(401, message)),
    fetcher,
    signal,
  };
  const authResult = await requestOwlProtocolJson({
    context,
    method: "POST",
    path: authProbePath,
    phase: "validate",
  });

  if (typeof authResult !== "string" || authResult.toLowerCase() !== "ok") {
    throw new ProviderRequestError(502, "invalid Owl Protocol auth probe response", authResult);
  }

  const project = normalizeProject(
    await requestOwlProtocolJson({
      context,
      method: "GET",
      path: projectInfoPath,
      phase: "validate",
    }),
  );

  return {
    profile: {
      accountId: project.slug,
      displayName: project.name,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: owlProtocolApiBaseUrl,
      authProbeEndpoint: authProbePath,
      projectInfoEndpoint: projectInfoPath,
      slug: project.slug,
      teamId: project.teamId,
      defaultChainId: project.defaultChainId,
      hasPublicUsers: project.hasPublicUsers,
    }),
  };
}

async function requestOwlProtocolJson(input: {
  context: Pick<OwlProtocolActionContext, "apiKey" | "fetcher" | "signal">;
  method: "GET" | "POST" | "PATCH";
  path: string;
  phase: OwlProtocolRequestPhase;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, owlProtocolDefaultRequestTimeoutMs);
  const apiKey = requiredString(input.context.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));

  try {
    const response = await input.context.fetcher(new URL(input.path, owlProtocolApiBaseUrl), {
      method: input.method,
      headers: buildRequestHeaders(apiKey, input.body !== undefined),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readOwlProtocolPayload(response);

    if (response.status === 401 || response.status === 403) {
      throw new ProviderRequestError(
        input.phase === "validate" ? 400 : response.status,
        readOwlProtocolErrorMessage(payload, "Unauthorized"),
        payload,
      );
    }

    if (response.status === 429) {
      throw new ProviderRequestError(
        429,
        readOwlProtocolErrorMessage(payload, "Owl Protocol rate limit exceeded"),
        payload,
      );
    }

    if (!response.ok) {
      throw new ProviderRequestError(
        response.status || 500,
        readOwlProtocolErrorMessage(payload, "Owl Protocol request failed"),
        payload,
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Owl Protocol request timed out", error);
    }

    throw new ProviderRequestError(
      input.phase === "validate" ? 502 : 500,
      error instanceof Error && error.message ? error.message : "Owl Protocol request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readOwlProtocolPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "invalid Owl Protocol JSON response", text);
    }
    return text;
  }
}

function buildProjectTokenPath(input: Record<string, unknown>): string {
  const chainId = integer(input.chainId, "chainId", providerInputError);
  const address = requiredString(input.address, "address", providerInputError);
  const tokenId = requiredString(input.tokenId, "tokenId", providerInputError);

  return `/api/project/contract/${encodeURIComponent(chainId)}/${encodeURIComponent(address)}/token/${encodeURIComponent(
    tokenId,
  )}`;
}

function buildRequestHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };

  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

function normalizeProject(value: unknown): OwlProtocolProject {
  const project = requiredRecord(value, "Owl Protocol project", providerResponseError);
  return compactObject({
    slug: requiredResponseString(project.slug, "slug"),
    teamId: requiredResponseString(project.teamId, "teamId"),
    name: requiredResponseString(project.name, "name"),
    defaultChainId: integer(project.defaultChainId, "defaultChainId", providerResponseError),
    description: optionalString(project.description),
    authorizedDomains: optionalStringArray(project.authorizedDomains),
    coverImage: optionalString(project.coverImage),
    projectType: optionalString(project.projectType),
    isArchived: optionalBoolean(project.isArchived),
    hasPublicUsers: optionalBoolean(project.hasPublicUsers),
  }) as OwlProtocolProject;
}

function normalizeToken(value: unknown): OwlProtocolToken {
  const token = requiredRecord(value, "Owl Protocol token", providerResponseError);
  return compactObject({
    chainId: integer(token.chainId, "chainId", providerResponseError),
    address: requiredResponseString(token.address, "address"),
    tokenId: requiredResponseString(token.tokenId, "tokenId"),
    metadata: optionalRecord(token.metadata),
  }) as OwlProtocolToken;
}

function readOwlProtocolErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const object = optionalRecord(payload);
  const directMessage = optionalString(object?.message);
  if (directMessage) {
    return directMessage;
  }

  const nestedError = optionalRecord(object?.error);
  return optionalString(nestedError?.message) ?? fallback;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return items.length > 0 ? items : [];
}

function requiredResponseString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerResponseError);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `invalid Owl Protocol ${message} response`);
}
