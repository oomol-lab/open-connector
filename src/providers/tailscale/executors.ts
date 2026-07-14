import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";
import type { TailscaleActionName } from "./actions.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineOAuthProviderExecutors, ProviderRequestError, readProviderJsonBody } from "../provider-runtime.ts";

const service = "tailscale";
const tailscaleApiBaseUrl = "https://api.tailscale.com/api/v2";

type TailscaleActionHandler = (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>;

export const tailscaleActionHandlers: Record<TailscaleActionName, TailscaleActionHandler> = {
  list_devices(_input, context) {
    return tailscaleJsonRequest("/tailnet/-/devices", context);
  },
  get_device(input, context) {
    const deviceId = requiredString(input.deviceId, "deviceId", (message) => new ProviderRequestError(400, message));
    return tailscaleJsonRequest(`/device/${encodeURIComponent(deviceId)}`, context);
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, tailscaleActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const payload = await tailscaleJsonRequest("/tailnet/-/devices", {
      accessToken: input.accessToken,
      tokenType: input.tokenType,
      fetcher,
      signal,
    });
    const devices = optionalRecord(payload)?.devices;
    return {
      profile: {
        grantedScopes: input.profile.grantedScopes,
      },
      metadata: {
        verifiedDeviceCount: Array.isArray(devices) ? devices.length : 0,
      },
    };
  },
};

export async function tailscaleJsonRequest(path: string, context: OAuthProviderContext): Promise<unknown> {
  const response = await context.fetcher(`${tailscaleApiBaseUrl}${path}`, {
    headers: {
      accept: "application/json",
      authorization: `${context.tokenType ?? "Bearer"} ${context.accessToken}`,
    },
    signal: context.signal,
  });
  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Tailscale returned an invalid JSON response.",
    invalidJsonStatus: response.ok ? 502 : response.status,
    invalidJsonFallback: response.ok ? undefined : (text) => ({ message: text }),
  });

  if (!response.ok) {
    const message = optionalString(optionalRecord(payload)?.message);
    throw new ProviderRequestError(
      response.status,
      message ?? `Tailscale request failed with HTTP ${response.status}.`,
      payload,
    );
  }

  return payload;
}
