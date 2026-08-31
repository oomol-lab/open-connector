import type { ExecutionContext } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

export const evervaultApiBaseUrl = "https://api.evervault.com";
interface EvervaultContext {
  appId: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export async function createEvervaultContext(
  context: ExecutionContext,
  fetcher: typeof fetch,
): Promise<EvervaultContext> {
  const credential = await requireApiKeyCredential(context, "evervault");
  return {
    appId: requiredString(credential.values.appId, "appId", providerInputError),
    apiKey: credential.apiKey,
    fetcher,
    signal: context.signal,
  };
}
export const evervaultActionHandlers: ProviderActionHandlers<
  "evervault",
  (input: Record<string, unknown>, context: EvervaultContext) => Promise<unknown>
> = {
  async encrypt_json(input, context) {
    return { value: await request("/encrypt", input.value, context, "execute") };
  },
  async decrypt_json(input, context) {
    return { value: await request("/decrypt", input.value, context, "execute") };
  },
  inspect_token(input, context) {
    return request("/inspect", { token: input.token }, context, "execute");
  },
};
export async function validateEvervault(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const context = {
    apiKey: input.apiKey,
    appId: requiredString(input.values.appId, "appId", providerInputError),
    fetcher,
    signal,
  };
  await request("/encrypt", "oomol-evervault-credential-check", context, "validate");
  const fingerprint = createHash("sha256").update(context.apiKey).digest("hex").slice(0, 16);
  return {
    profile: { accountId: `evervault:${context.appId}:key:${fingerprint}`, displayName: `Evervault ${context.appId}` },
    grantedScopes: [],
    metadata: { appId: context.appId, apiBaseUrl: evervaultApiBaseUrl, validationEndpoint: "/encrypt" },
  };
}
async function request(
  path: string,
  body: unknown,
  context: EvervaultContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, 30_000);
  try {
    const response = await context.fetcher(new URL(path, evervaultApiBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${context.appId}:${context.apiKey}`).toString("base64")}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ProviderRequestError(502, "Evervault returned invalid JSON");
      }
    }
    if (!response.ok) throw mapError(response, payload, phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "Evervault request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Evervault request failed: ${error.message}` : "Evervault request failed",
    );
  } finally {
    timeout.cleanup();
  }
}
function mapError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.detail) ??
    optionalString(record?.title) ??
    `Evervault request failed with status ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && response.status < 500) return new ProviderRequestError(400, message);
  if (response.status === 401) return new ProviderRequestError(401, message);
  if (response.status === 403) return new ProviderRequestError(403, message);
  return new ProviderRequestError(response.status < 500 ? 400 : 502, message);
}
