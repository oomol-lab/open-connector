import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { TailscaleActionName } from "./actions.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  readProviderJsonBody,
  requireCustomCredential,
} from "../provider-runtime.ts";
import { tailscaleDeviceReadScope } from "./actions.ts";

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
}

type TailscaleActionHandler = (input: Record<string, unknown>, context: TailscaleContext) => Promise<unknown>;

export const tailscaleActionHandlers: Record<TailscaleActionName, TailscaleActionHandler> = {
  async list_devices(_input, context) {
    return tailscaleJsonRequest(`/tailnet/${encodeURIComponent(context.tailnet)}/devices`, context);
  },
  async get_device(input, context) {
    const deviceId = requiredString(input.deviceId, "deviceId", (message) => new ProviderRequestError(400, message));
    return tailscaleJsonRequest(`/device/${encodeURIComponent(deviceId)}`, context);
  },
};

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
    const payload = await tailscaleJsonRequest(`/tailnet/${encodeURIComponent(context.tailnet)}/devices`, context);
    const devices = optionalRecord(payload)?.devices;
    return {
      profile: {
        accountId: `tailscale:${context.tailnet}`,
        displayName: context.tailnet === defaultTailnet ? "Tailscale tailnet" : context.tailnet,
        grantedScopes: [tailscaleDeviceReadScope],
      },
      grantedScopes: [tailscaleDeviceReadScope],
      metadata: {
        tailnet: context.tailnet,
        verifiedDeviceCount: Array.isArray(devices) ? devices.length : 0,
      },
    };
  },
};

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

async function requestTailscaleAccessToken(context: TailscaleContext): Promise<TailscaleAccessToken> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: tailscaleDeviceReadScope,
    client_id: context.clientId,
    client_secret: context.clientSecret,
  });
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
  };
}

async function tailscaleJsonRequest(path: string, context: TailscaleContext): Promise<unknown> {
  const token = await requestTailscaleAccessToken(context);
  const response = await context.fetcher(`${tailscaleApiBaseUrl}${path}`, {
    headers: {
      accept: "application/json",
      authorization: `${token.tokenType} ${token.accessToken}`,
    },
    signal: context.signal,
  });
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
