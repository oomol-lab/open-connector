import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { TailscaleOperationDefinition } from "./operations.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  readProviderJsonBody,
  readProviderTextBody,
  requireCustomCredential,
} from "../provider-runtime.ts";
import { tailscaleOperations } from "./operations.ts";

const service = "tailscale";
const tailscaleApiBaseUrl = "https://api.tailscale.com/api/v2";
const tailscaleOAuthTokenUrl = `${tailscaleApiBaseUrl}/oauth/token`;
const defaultTailnet = "-";

interface TailscaleContext {
  clientId: string;
  clientSecret: string;
  tailnet: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface TailscaleAccessToken {
  accessToken: string;
  tokenType: string;
  grantedScopes: string[];
}

const tailscaleActionHandlers = Object.fromEntries(
  tailscaleOperations.map((operation) => [operation.name, createOperationHandler(operation)]),
) as Record<string, ProviderRuntimeHandler<TailscaleContext>>;

export const executors: ProviderExecutors = defineProviderExecutors<TailscaleContext>({
  service,
  handlers: tailscaleActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<TailscaleContext> {
    const credential = await requireCustomCredential(context, service);
    return readTailscaleContext(credential.values, fetcher, context.signal);
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const context = readTailscaleContext(input.values, fetcher, signal);
    const token = await requestTailscaleAccessToken(context, []);
    const metadata: Record<string, unknown> = { tailnet: context.tailnet };
    if (grantsTailscaleDeviceRead(token.grantedScopes)) {
      metadata.verifiedDeviceCount = await countTailscaleDevices(context, token);
    }
    return {
      profile: {
        accountId: `tailscale:${context.tailnet}`,
        displayName: context.tailnet === defaultTailnet ? "Tailscale tailnet" : context.tailnet,
        grantedScopes: token.grantedScopes,
      },
      grantedScopes: token.grantedScopes,
      metadata,
    };
  },
};

/**
 * Whether a token can read devices, so validation only probes when the probe can succeed.
 *
 * Tailscale reports the coarse `devices` scope or a fine-grained `devices:core*` scope; a client
 * scoped for only the DNS, policy, or logging actions has neither and skips the probe entirely.
 */
function grantsTailscaleDeviceRead(grantedScopes: readonly string[]): boolean {
  return grantedScopes.some((scope) => scope === "devices" || scope.startsWith("devices:core"));
}

/**
 * Count devices for connection metadata, reusing the validation token.
 *
 * Failures propagate: reaching this point means the token can read devices, so an error here is a
 * real problem — a mistyped `tailnet` above all — and must fail the connection rather than hide.
 */
async function countTailscaleDevices(context: TailscaleContext, token: TailscaleAccessToken): Promise<number> {
  const payload = await tailscaleRequestWithToken(
    new URL(`${tailscaleApiBaseUrl}/tailnet/${encodeURIComponent(context.tailnet)}/devices`),
    context,
    { method: "GET" },
    token,
    "json",
  );
  const devices = optionalRecord(payload)?.devices;
  return Array.isArray(devices) ? devices.length : 0;
}

function createOperationHandler(operation: TailscaleOperationDefinition): ProviderRuntimeHandler<TailscaleContext> {
  return async (input, context): Promise<unknown> => {
    const path = resolveOperationPath(operation, input, context.tailnet);
    const url = new URL(`${tailscaleApiBaseUrl}${path}`);
    appendOperationQuery(url, operation, input);
    return tailscaleRequestUrl(
      url,
      context,
      createOperationRequestInit(operation, input),
      operation.requiredScopes,
      operation.responseFormat ?? "json",
    );
  };
}

function createOperationRequestInit(
  operation: TailscaleOperationDefinition,
  input: Record<string, unknown>,
): RequestInit {
  const init: RequestInit = { method: operation.method };
  if (operation.bodyInputName) {
    const body = input[operation.bodyInputName];
    init.body = operation.bodyFormat === "text" ? String(body) : JSON.stringify(body);
  } else if (operation.bodyFields) {
    init.body = JSON.stringify(
      Object.fromEntries(
        operation.bodyFields.filter((field) => input[field] !== undefined).map((field) => [field, input[field]]),
      ),
    );
  }
  if (init.body !== undefined) {
    init.headers = { "content-type": operation.contentType ?? "application/json" };
  }
  return init;
}

function resolveOperationPath(
  operation: TailscaleOperationDefinition,
  input: Record<string, unknown>,
  tailnet: string,
): string {
  let path = operation.path.replace("/tailnet/-", `/tailnet/${encodeURIComponent(tailnet)}`);
  for (const parameter of operation.pathParameters ?? []) {
    const value = requiredString(input[parameter], parameter, (message) => new ProviderRequestError(400, message));
    path = path.replace(`{${parameter}}`, encodeURIComponent(value));
  }
  return path;
}

function appendOperationQuery(url: URL, operation: TailscaleOperationDefinition, input: Record<string, unknown>): void {
  for (const parameter of operation.queryParameters ?? []) {
    const value = input[parameter.inputName] ?? parameter.defaultValue;
    if (value === undefined) {
      continue;
    }
    if (parameter.repeated) {
      if (!Array.isArray(value)) {
        throw new ProviderRequestError(400, `${parameter.inputName} must be an array.`);
      }
      for (const item of value) {
        url.searchParams.append(parameter.parameterName, String(item));
      }
      continue;
    }
    url.searchParams.set(parameter.parameterName, String(value));
  }
}

function readTailscaleContext(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal: AbortSignal | undefined,
): TailscaleContext {
  const tailnet = optionalString(values.tailnet)?.trim() || defaultTailnet;
  return {
    clientId: requiredString(values.clientId, "clientId", (message) => new ProviderRequestError(400, message)),
    clientSecret: requiredString(
      values.clientSecret,
      "clientSecret",
      (message) => new ProviderRequestError(400, message),
    ),
    tailnet,
    fetcher,
    signal,
  };
}

async function requestTailscaleAccessToken(
  context: TailscaleContext,
  requiredScopes: readonly string[],
): Promise<TailscaleAccessToken> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: context.clientId,
    client_secret: context.clientSecret,
  });
  // An empty scope list mints a token carrying every scope the OAuth client holds, which is how
  // Tailscale's own clients verify a credential without assuming any particular scope.
  if (requiredScopes.length > 0) {
    body.set("scope", requiredScopes.join(" "));
  }
  const response = await context.fetcher(tailscaleOAuthTokenUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    signal: context.signal,
  });
  const payload = await readTailscaleJsonResponse(response);
  if (!response.ok) {
    throwTailscaleRequestError(response.status, payload, "Tailscale OAuth token request failed");
  }

  const record = optionalRecord(payload);
  const accessToken = optionalString(record?.access_token);
  if (!accessToken) {
    throw new ProviderRequestError(502, "Tailscale OAuth token response did not include an access token.", payload);
  }

  return {
    accessToken,
    tokenType: optionalString(record?.token_type) ?? "Bearer",
    grantedScopes: optionalString(record?.scope)?.split(/\s+/).filter(Boolean) ?? [],
  };
}

async function tailscaleRequestUrl(
  url: URL,
  context: TailscaleContext,
  init: RequestInit,
  requiredScopes: readonly string[],
  responseFormat: "json" | "text",
): Promise<unknown> {
  const token = await requestTailscaleAccessToken(context, requiredScopes);
  return tailscaleRequestWithToken(url, context, init, token, responseFormat);
}

async function tailscaleRequestWithToken(
  url: URL,
  context: TailscaleContext,
  init: RequestInit,
  token: TailscaleAccessToken,
  responseFormat: "json" | "text",
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("authorization", `${token.tokenType} ${token.accessToken}`);
  const response = await context.fetcher(url.toString(), {
    ...init,
    headers,
    signal: context.signal,
  });
  if (response.ok && responseFormat === "text") {
    return readProviderTextBody(response, "Tailscale text response");
  }
  const payload = await readTailscaleJsonResponse(response);
  if (!response.ok) {
    throwTailscaleRequestError(response.status, payload, "Tailscale request failed");
  }
  return payload;
}

async function readTailscaleJsonResponse(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Tailscale returned an invalid JSON response.",
    invalidJsonStatus: response.ok ? 502 : response.status,
    invalidJsonFallback: response.ok ? undefined : (text) => ({ message: text }),
  });
}

function throwTailscaleRequestError(status: number, payload: unknown, fallback: string): never {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error_description) ??
    optionalString(record?.error) ??
    `${fallback} with HTTP ${status}.`;
  throw new ProviderRequestError(status, message, payload);
}
