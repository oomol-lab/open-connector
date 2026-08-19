import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { isAbortLikeError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
import { kaleidoDefaultBaseUrl } from "./constants.ts";

export interface KaleidoActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const membershipsValidationPath = "/memberships";

type KaleidoActionHandler = (input: Record<string, unknown>, context: KaleidoActionContext) => Promise<unknown>;

export const kaleidoActionHandlers: ProviderActionHandlers<"kaleido", KaleidoActionHandler> = {
  list_memberships(_input, context) {
    return kaleidoGet(context, membershipsValidationPath);
  },
  list_consortia(_input, context) {
    return kaleidoGet(context, "/consortia");
  },
  get_consortium(input, context) {
    return kaleidoGet(context, `/consortia/${encodeKaleidoPathField(input, "consortia_id")}`);
  },
  list_environments(input, context) {
    return kaleidoGet(context, `/consortia/${encodeKaleidoPathField(input, "consortia_id")}/environments`);
  },
  get_environment(input, context) {
    return kaleidoGet(context, environmentPath(input));
  },
  get_environment_status(input, context) {
    return kaleidoGet(context, `${environmentPath(input)}/status`);
  },
  list_nodes(input, context) {
    return kaleidoGet(context, `${environmentPath(input)}/nodes`);
  },
  get_node(input, context) {
    return kaleidoGet(context, `${environmentPath(input)}/nodes/${encodeKaleidoPathField(input, "node_id")}`);
  },
  get_node_status(input, context) {
    return kaleidoGet(context, `${environmentPath(input)}/nodes/${encodeKaleidoPathField(input, "node_id")}/status`);
  },
  list_services(input, context) {
    return kaleidoGet(context, `${environmentPath(input)}/services`);
  },
  get_service(input, context) {
    return kaleidoGet(context, `${environmentPath(input)}/services/${encodeKaleidoPathField(input, "service_id")}`);
  },
  get_service_status(input, context) {
    return kaleidoGet(
      context,
      `${environmentPath(input)}/services/${encodeKaleidoPathField(input, "service_id")}/status`,
    );
  },
};

export interface KaleidoCredentialValidationInput {
  apiKey: string;
  baseUrl?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export async function validateKaleidoCredential(
  input: KaleidoCredentialValidationInput,
): Promise<CredentialValidationResult> {
  const baseUrl = normalizeKaleidoBaseUrl(input.baseUrl);
  const response = await requestKaleidoGet({
    baseUrl,
    path: membershipsValidationPath,
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
  });

  if (!response.ok) {
    throw await normalizeKaleidoError(response);
  }

  const payload = await readKaleidoJson(response);
  const memberships = Array.isArray(payload) ? payload : [];
  const firstMembership = memberships.find(optionalRecord);
  const membershipId = optionalString(firstMembership?._id);
  const orgId = optionalString(firstMembership?.org_id);

  return {
    profile: {
      accountId: membershipId ?? orgId ?? `kaleido:api_key:${hashKaleidoCredential(baseUrl, input.apiKey)}`,
      displayName:
        optionalString(firstMembership?.org_name) ?? optionalString(firstMembership?.name) ?? "Kaleido Account",
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl,
      validationEndpoint: membershipsValidationPath,
      membershipId,
      orgId,
      membershipCount: memberships.length,
    }),
  };
}

export function normalizeKaleidoBaseUrl(value: string | undefined): string {
  const raw = value?.trim() || kaleidoDefaultBaseUrl;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "baseUrl must be a valid http(s) URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use https");
  }

  if (url.username || url.password) {
    throw new ProviderRequestError(400, "baseUrl must not include username or password");
  }

  if (url.port) {
    throw new ProviderRequestError(400, "baseUrl must not include a port");
  }

  const hostname = url.hostname.toLowerCase();
  const allowedHosts = new Set([
    "console.kaleido.io",
    "console-eu.kaleido.io",
    "console-ap.kaleido.io",
    "console-ko.kaleido.io",
    "console-us1.kaleido.io",
  ]);
  if (!allowedHosts.has(hostname)) {
    throw new ProviderRequestError(400, "baseUrl must be an official Kaleido API endpoint");
  }

  const normalizedPath = url.pathname.replace(/\/+$/u, "");
  if (normalizedPath !== "/api/v1") {
    throw new ProviderRequestError(400, "baseUrl path must be /api/v1");
  }

  url.pathname = normalizedPath;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

async function kaleidoGet(context: KaleidoActionContext, path: string): Promise<unknown> {
  const baseUrl = normalizeKaleidoBaseUrl(context.baseUrl);
  const response = await requestKaleidoGet({
    baseUrl,
    path,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  if (!response.ok) {
    throw await normalizeKaleidoError(response);
  }

  return readKaleidoJson(response);
}

function buildKaleidoUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function kaleidoHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

async function requestKaleidoGet(input: {
  baseUrl: string;
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<Response> {
  try {
    return await input.fetcher(buildKaleidoUrl(input.baseUrl, input.path), {
      method: "GET",
      headers: kaleidoHeaders(input.apiKey),
      signal: input.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw normalizeKaleidoTransportError(error);
  }
}

async function normalizeKaleidoError(response: Response): Promise<ProviderRequestError> {
  const message = await readKaleidoErrorMessage(response);
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message);
  }

  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

async function readKaleidoErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  const payload = parseJson(text);
  const record = optionalRecord(payload);
  if (record) {
    return (
      optionalString(record.errorMessage) ??
      optionalString(record.message) ??
      optionalString(record.error) ??
      `Kaleido API request failed with status ${response.status}`
    );
  }

  if (text) {
    return text;
  }

  return `Kaleido API request failed with status ${response.status}`;
}

function normalizeKaleidoTransportError(error: unknown): ProviderRequestError {
  if (isAbortLikeError(error)) {
    return new ProviderRequestError(504, "Kaleido API request timed out");
  }

  return new ProviderRequestError(
    502,
    error instanceof Error ? `Kaleido API request failed: ${error.message}` : "Kaleido API request failed",
  );
}

async function readKaleidoJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  const payload = parseJson(text);
  if (payload === undefined) {
    throw new ProviderRequestError(502, "Kaleido API returned invalid JSON");
  }

  return payload;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function environmentPath(input: Record<string, unknown>): string {
  return `/consortia/${encodeKaleidoPathField(input, "consortia_id")}/environments/${encodeKaleidoPathField(
    input,
    "environment_id",
  )}`;
}

function encodeKaleidoPathField(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) {
    throw new ProviderRequestError(400, `${key} is required`);
  }

  return encodeURIComponent(value);
}

function hashKaleidoCredential(baseUrl: string, apiKey: string): string {
  return createHash("sha256").update(`${baseUrl}:${apiKey}`).digest("hex").slice(0, 16);
}
