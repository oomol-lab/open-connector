import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ConfluenceContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalString, optionalStringArray, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  readProviderJsonBody,
  providerUserAgent,
} from "../provider-runtime.ts";
import {
  buildConfluenceOAuthApiBaseUrls,
  confluenceActionHandlers,
  confluenceValidationPath,
  requestConfluenceJson,
  validateConfluenceCredential,
} from "./runtime.ts";
import {
  confluencePageReadScope,
  confluencePageWriteScope,
  confluenceSearchScope,
  confluenceSpaceReadScope,
} from "./scopes.ts";

const service = "confluence";
const confluenceAccessibleResourcesUrl = "https://api.atlassian.com/oauth/token/accessible-resources";
const confluenceProductScopes = [
  confluenceSearchScope,
  confluenceSpaceReadScope,
  confluencePageReadScope,
  confluencePageWriteScope,
];

interface ConfluenceAccessibleResource {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  scopes?: unknown;
  avatarUrl?: unknown;
}

export const executors: ProviderExecutors = defineProviderExecutors<ConfluenceContext>({
  service,
  handlers: confluenceActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ConfluenceContext> {
    const credential = await requireConfluenceCredential(context);
    return buildConfluenceContext(credential, fetcher, context.signal);
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => resolveConfluenceCredentialBaseUrl(await requireConfluenceCredential(context)),
  auth: { type: "none" },
  async customizeRequest({ credential, headers }) {
    if (credential?.authType === "oauth2") {
      headers.set("authorization", `${credential.tokenType} ${credential.accessToken}`);
      return;
    }
    if (credential?.authType === "api_key") {
      const email = resolveConfluenceEmail(credential);
      headers.set("authorization", `Basic ${Buffer.from(`${email}:${credential.apiKey}`).toString("base64")}`);
      return;
    }
    throw new ProviderRequestError(401, "Configure Confluence OAuth or API token credentials first.");
  },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    return validateConfluenceOAuthCredential(input, fetcher, signal);
  },
  async apiKey(input, { fetcher, signal }) {
    return validateConfluenceCredential(
      {
        apiKey: input.apiKey,
        ...input.values,
      },
      fetcher,
      signal,
    );
  },
};

async function validateConfluenceOAuthCredential(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const resourcesResponse = await fetcher(confluenceAccessibleResourcesUrl, {
    headers: {
      authorization: `${credential.tokenType} ${credential.accessToken}`,
      accept: "application/json",
      "user-agent": providerUserAgent,
    },
    signal,
  });
  const resourcesPayload = await readProviderJsonBody(resourcesResponse, {
    emptyBody: null,
    invalidJsonMessage: "Confluence accessible-resources response must be valid JSON",
    invalidJsonFallback: (text) => text,
  });
  if (!resourcesResponse.ok) {
    throw new ProviderRequestError(
      resourcesResponse.status,
      extractAtlassianErrorMessage(resourcesPayload) ?? "Unable to discover accessible Confluence sites",
      resourcesPayload,
    );
  }

  const resources = readAccessibleResources(resourcesPayload);
  const resource = pickPrimaryResource(resources);
  if (!resource) {
    throw new ProviderRequestError(
      400,
      "Confluence authorization does not include an accessible Confluence Cloud site",
    );
  }

  const cloudId = requiredString(resource.id, "cloudId", providerResponseError);
  const siteUrl = requiredString(resource.url, "site URL", providerResponseError);
  const siteName = optionalString(resource.name) ?? siteUrl;
  const siteAvatarUrl = optionalString(resource.avatarUrl);
  const resourceScopes = optionalStringArray(resource.scopes) ?? [];
  const { baseUrl, restApiBaseUrl } = buildConfluenceOAuthApiBaseUrls(cloudId);
  const payload = await requestConfluenceJson({
    baseUrl,
    restApiBaseUrl,
    auth: {
      type: "oauth2",
      accessToken: credential.accessToken,
      tokenType: credential.tokenType,
    },
    fetcher,
    signal,
    method: "GET",
    path: confluenceValidationPath,
    phase: "validate",
    query: { limit: 1 },
  });
  const payloadObject = optionalRecord(payload);
  const validationResultCount = Array.isArray(payloadObject?.results) ? payloadObject.results.length : undefined;

  return {
    profile: {
      accountId: `confluence:${cloudId}`,
      displayName: siteName,
      grantedScopes: resourceScopes,
    },
    grantedScopes: resourceScopes,
    metadata: compactObject({
      cloudId,
      siteUrl,
      siteName,
      siteAvatarUrl,
      resourceScopes,
      resourceCount: resources.length,
      baseUrl,
      restApiBaseUrl,
      validationEndpoint: confluenceValidationPath,
      validationResultCount,
    }),
  };
}

function buildConfluenceContext(
  credential: Exclude<ResolvedCredential, { authType: "no_auth" | "custom_credential" }>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): ConfluenceContext {
  if (credential.authType === "oauth2") {
    return {
      baseUrl: credential.metadata.baseUrl,
      restApiBaseUrl: credential.metadata.restApiBaseUrl,
      auth: {
        type: "oauth2",
        accessToken: credential.accessToken,
        tokenType: credential.tokenType,
      },
      fetcher,
      signal,
    };
  }
  return {
    baseUrl: credential.metadata.baseUrl,
    restApiBaseUrl: credential.metadata.restApiBaseUrl,
    auth: {
      type: "basic",
      email: credential.metadata.email ?? credential.values.email,
      apiToken: credential.apiKey,
    },
    fetcher,
    signal,
  };
}

async function requireConfluenceCredential(
  context: ExecutionContext,
): Promise<Exclude<ResolvedCredential, { authType: "no_auth" | "custom_credential" }>> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "oauth2" || credential?.authType === "api_key") {
    return credential;
  }
  throw new ProviderRequestError(401, "Configure Confluence OAuth or API token credentials first.");
}

function resolveConfluenceCredentialBaseUrl(
  credential: Exclude<ResolvedCredential, { authType: "no_auth" | "custom_credential" }>,
): string {
  const baseUrl = optionalString(credential.metadata.baseUrl);
  if (baseUrl) {
    return baseUrl;
  }
  if (credential.authType === "oauth2") {
    const cloudId = optionalString(credential.metadata.cloudId);
    if (cloudId) {
      return buildConfluenceOAuthApiBaseUrls(cloudId).baseUrl;
    }
  }
  throw new ProviderRequestError(400, "Confluence credential metadata is missing baseUrl");
}

function resolveConfluenceEmail(credential: Extract<ResolvedCredential, { authType: "api_key" }>): string {
  const email = optionalString(credential.metadata.email) ?? optionalString(credential.values.email);
  if (email) {
    return email;
  }
  throw new ProviderRequestError(400, "Confluence email is required");
}

function readAccessibleResources(payload: unknown): ConfluenceAccessibleResource[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Confluence accessible-resources response must be an array");
  }
  return payload.map((item) => {
    const resource = optionalRecord(item);
    if (!resource) {
      throw new ProviderRequestError(502, "Confluence accessible resource must be an object");
    }
    return resource;
  });
}

function pickPrimaryResource(resources: ConfluenceAccessibleResource[]): ConfluenceAccessibleResource | undefined {
  const candidates = resources.filter((resource) => {
    const scopes = optionalStringArray(resource.scopes) ?? [];
    return (
      confluenceProductScopes.some((scope) => scopes.includes(scope)) &&
      optionalString(resource.id) !== undefined &&
      optionalString(resource.url) !== undefined
    );
  });
  if (candidates.length > 1) {
    const sites = candidates
      .map((candidate) => `${optionalString(candidate.id) ?? "unknown"}:${optionalString(candidate.url) ?? "unknown"}`)
      .join(", ");
    throw new ProviderRequestError(
      400,
      `Confluence authorization matches multiple sites; explicit site selection is required (${sites})`,
    );
  }
  return candidates[0];
}

function extractAtlassianErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  return optionalString(object?.message) ?? optionalString(object?.error_description) ?? optionalString(object?.error);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Confluence ${message}`);
}
