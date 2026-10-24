import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { createHash } from "node:crypto";
import { optionalNumber, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerInputError,
  providerResponseError,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";
import { panjivaActionSpecs } from "./actions.ts";
const service = "panjiva",
  baseUrl = "https://api.panjiva.com/latest";
interface Context {
  clientId: string;
  clientSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
interface CachedToken {
  token: string;
  expiresAt: number;
}
const cache = new Map<string, CachedToken>();
const handlers = mapProviderActionHandlers(service, panjivaActionSpecs, (spec) => {
  return async (input: Record<string, unknown>, context: Context): Promise<unknown> => {
    validateDimensions(input.dimensions);
    let path = spec.path;
    if (path.includes("{data_source}")) path = path.replace("{data_source}", segment(input.data_source, "data_source"));
    if (path.includes("{job_id}")) path = path.replace("{job_id}", segment(input.job_id, "job_id"));
    const payload = await request(
      path,
      spec.method,
      spec.method === "POST" ? input : undefined,
      await token(context),
      context,
    );
    if (spec.name === "get_company_network") return { network: payload };
    if (spec.name === "get_data_source_schema") return { schemas: payload };
    return payload;
  };
});
export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher) {
    const credential = await requireCustomCredential(context, service);
    return {
      clientId: requiredString(credential.values.clientId, "clientId"),
      clientSecret: requiredString(credential.values.clientSecret, "clientSecret"),
      fetcher,
      signal: context.signal,
    };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  skipDnsValidation: true,
  auth: {
    type: "bearer_resolver",
    async resolve({ context, fetcher, signal }) {
      const credential = await requireCustomCredential(context, service);
      return {
        accessToken: await token({
          clientId: requiredString(credential.values.clientId, "clientId"),
          clientSecret: requiredString(credential.values.clientSecret, "clientSecret"),
          fetcher,
          signal,
        }),
        tokenType: "Bearer",
      };
    },
  },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const context = {
      clientId: requiredString(input.values.clientId, "clientId"),
      clientSecret: requiredString(input.values.clientSecret, "clientSecret"),
      fetcher,
      signal,
    };
    await token(context);
    const hash = createHash("sha256").update(context.clientId).digest("hex");
    return {
      profile: { accountId: `panjiva:${hash}`, displayName: "Panjiva Account" },
      grantedScopes: [],
      metadata: {},
    };
  },
};
async function token(context: Context): Promise<string> {
  const key = createHash("sha256").update(`${context.clientId}\0${context.clientSecret}`).digest("hex");
  const hit = cache.get(key);
  if (hit && hit.expiresAt - Date.now() > 60_000) return hit.token;
  const payload = requiredRecord(
    await request(
      "/auth/token",
      "POST",
      { grant_type: "client_credentials", client_id: context.clientId, client_secret: context.clientSecret },
      undefined,
      context,
    ),
    "Panjiva token response",
  );
  const value = requiredString(payload.token, "Panjiva token");
  const expiresAt = Date.parse(requiredString(payload.expires_at, "Panjiva expires_at"));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
    throw providerResponseError("Panjiva returned an invalid token expiration");
  cache.set(key, { token: value, expiresAt });
  return value;
}
async function request(
  path: string,
  method: "GET" | "POST",
  body: Record<string, unknown> | undefined,
  accessToken: string | undefined,
  context: Context,
): Promise<Record<string, unknown>> {
  const headers = new Headers({ accept: "application/json" });
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  if (body) headers.set("content-type", "application/json");
  const response = await context.fetcher(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: context.signal,
  });
  let payload: unknown;
  try {
    payload = await readProviderJsonBody(response, {
      emptyBody: undefined,
      invalidJsonMessage: "Panjiva returned invalid JSON",
    });
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    throw new ProviderRequestError(
      response.status,
      optionalString(record?.error) ??
        optionalString(record?.message) ??
        `Panjiva request failed with status ${response.status}`,
      payload,
    );
  }
  return requiredRecord(payload, "Panjiva response");
}
function segment(value: unknown, field: string): string {
  const text = requiredString(value, field);
  if (text === "." || text === ".." || text.includes("/") || text.includes("\\"))
    throw providerInputError(`Invalid Panjiva ${field}`);
  return encodeURIComponent(text);
}
function validateDimensions(value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const [index, item] of value.entries()) {
    const d = optionalRecord(item);
    const offset = optionalNumber(d?.offset) ?? 0,
      size = optionalNumber(d?.size) ?? 10;
    if ((index > 0 && offset > 0) || offset + size > 1000)
      throw providerInputError(
        "Panjiva only permits offset on the first dimension, and offset plus size must not exceed 1000",
      );
  }
}
