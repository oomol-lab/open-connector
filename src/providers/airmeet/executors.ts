import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";

import { optionalRecord, optionalString, recordOrEmpty, requiredString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "airmeet";
const baseUrls = {
  default: "https://api-gateway.airmeet.com/prod",
  eu: "https://api-gateway-prod.eu.airmeet.com/prod",
  us: "https://api-gateway-prod.us.airmeet.com/prod",
};
type Region = keyof typeof baseUrls;
interface Context {
  accessKey: string;
  secretKey: string;
  region: Region;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
type Handler = (input: Record<string, unknown>, context: Context) => Promise<unknown>;

const handlers: ProviderActionHandlers<"airmeet", Handler> = {
  list_airmeets: (input, context) => requestAction("list_airmeets", "/airmeets", input, context),
  list_sessions: (input, context) => requestAction("list_sessions", eventPath(input, "/info"), input, context),
  list_booths: (input, context) => requestAction("list_booths", eventPath(input, "/booths"), input, context),
  list_tracks: (input, context) => requestAction("list_tracks", eventPath(input, "/tracks"), input, context),
  list_custom_registration_fields: (input, context) =>
    requestAction("list_custom_registration_fields", eventPath(input, "/custom-fields"), input, context),
};

export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      accessKey: requiredString(credential.values.accessKey, "accessKey", providerInputError),
      secretKey: credential.apiKey,
      region: readRegion(credential.values.region ?? optionalString(credential.metadata?.region)),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const region = readRegion(input.values.region);
    const auth = await authenticate(
      {
        accessKey: requiredString(input.values.accessKey, "accessKey", providerInputError),
        secretKey: input.apiKey,
        region,
        fetcher,
        signal,
      },
      "validate",
    );
    return {
      profile: { displayName: auth.label ?? "Airmeet API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrls[region], region },
    };
  },
};

async function requestAction(
  actionName: string,
  path: string,
  input: Record<string, unknown>,
  context: Context,
): Promise<unknown> {
  const auth = await authenticate(context, "execute");
  return runProviderRequest({ label: "Airmeet", signal: context.signal }, async (signal) => {
    const url = new URL(`${baseUrls[context.region]}${path}`);
    if (actionName == "list_airmeets")
      for (const key of ["before", "after", "size"])
        if (input[key] !== undefined) url.searchParams.set(key, String(input[key]));
    const response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-airmeet-access-token": auth.token,
      },
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createError(response.status, payload, "action");
    return normalize(actionName, payload);
  });
}

async function authenticate(
  context: Context,
  phase: "validate" | "execute",
): Promise<{ label?: string; token: string }> {
  return runProviderRequest({ label: "Airmeet authentication", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(`${baseUrls[context.region]}/auth`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-airmeet-access-key": context.accessKey,
        "x-airmeet-secret-key": context.secretKey,
      },
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createError(response.status, payload, phase);
    const data = requiredResponseRecord(payload.data, "Airmeet authentication data");
    return {
      label: optionalString(data.label)?.trim(),
      token: requiredString(data.token, "Airmeet authentication token", providerResponseError),
    };
  });
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return requiredResponseRecord(JSON.parse(text), "Airmeet response");
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw providerResponseError("Airmeet returned invalid JSON");
  }
}
function createError(
  status: number,
  payload: Record<string, unknown>,
  phase: "validate" | "execute" | "action",
): ProviderRequestError {
  const message =
    optionalString(payload.message)?.trim() ??
    optionalString(payload.statusMessage)?.trim() ??
    optionalString(optionalRecord(payload.error)?.message)?.trim() ??
    `Airmeet request failed with HTTP ${status}`;
  if ((status == 400 || status == 403) && phase == "validate") return providerInputError(message);
  return new ProviderRequestError(status >= 400 ? status : 502, message);
}
function normalize(actionName: string, payload: Record<string, unknown>): unknown {
  if (actionName == "list_airmeets")
    return { data: requiredArray(payload.data, "data"), cursors: recordOrEmpty(payload.cursors) };
  if (actionName == "list_sessions") return { sessions: requiredArray(payload.sessions, "sessions") };
  if (actionName == "list_booths") return { booths: requiredArray(payload.booths, "booths") };
  if (actionName == "list_tracks") return { tracks: requiredArray(payload.tracks, "tracks") };
  return { customFields: requiredArray(payload.customFields, "customFields") };
}
function eventPath(input: Record<string, unknown>, suffix: string): string {
  return `/airmeet/${encodeURIComponent(requiredInputString(input.airmeetId, "airmeetId"))}${suffix}`;
}
function readRegion(value: unknown): Region {
  const region = optionalString(value)?.trim().toLowerCase() ?? "default";
  if (region == "default" || region == "eu" || region == "us") return region;
  throw providerInputError("region must be default, eu, or us");
}
function requiredArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw providerResponseError(`Airmeet ${name} must be an array`);
  return value;
}
