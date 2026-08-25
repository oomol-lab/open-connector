import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "mx_toolbox";
const mxToolboxLookupApiBaseUrl = "https://mxtoolbox.com";
const mxToolboxAccountApiBaseUrl = "https://api.mxtoolbox.com";
const mxToolboxUsagePath = "/api/v1/Usage";
const mxToolboxMonitorPath = "/api/v1/monitor";

type MxToolboxPhase = "validate" | "execute";
type LookupInputKey = "domain" | "domain_or_ip";
type MxToolboxLookupCommand =
  | "bimi"
  | "blacklist"
  | "dkim"
  | "dmarc"
  | "dns"
  | "http"
  | "mta-sts"
  | "mx"
  | "ping"
  | "smtp"
  | "spf";

interface MxToolboxActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface MxToolboxLookupInput {
  command: MxToolboxLookupCommand;
  argument: string;
}

type MxToolboxActionHandler = (input: Record<string, unknown>, context: MxToolboxActionContext) => Promise<unknown>;

export const mxToolboxActionHandlers: ProviderActionHandlers<"mx_toolbox", MxToolboxActionHandler> = {
  lookup_dns: mxToolboxLookupHandler("dns", "domain"),
  lookup_mx: mxToolboxLookupHandler("mx", "domain"),
  lookup_dkim: mxToolboxLookupHandler("dkim", "domain"),
  lookup_dmarc: mxToolboxLookupHandler("dmarc", "domain"),
  lookup_spf: mxToolboxLookupHandler("spf", "domain"),
  lookup_blacklist: mxToolboxLookupHandler("blacklist", "domain_or_ip"),
  lookup_http: mxToolboxLookupHandler("http", "domain"),
  lookup_smtp: mxToolboxLookupHandler("smtp", "domain"),
  lookup_ping: mxToolboxLookupHandler("ping", "domain_or_ip"),
  lookup_mta_sts_record: mxToolboxLookupHandler("mta-sts", "domain"),
  lookup_bimi_record: mxToolboxLookupHandler("bimi", "domain"),
  usage_check(_input, context) {
    return executeMxToolboxAccountRequest(mxToolboxUsagePath, context, "execute");
  },
  monitor_status(_input, context) {
    return executeMxToolboxAccountRequest(mxToolboxMonitorPath, context, "execute");
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<MxToolboxActionContext>({
  service,
  handlers: mxToolboxActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<MxToolboxActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await executeMxToolboxAccountRequest(
      mxToolboxUsagePath,
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const usage = optionalRecord(payload) ?? {};

    return {
      profile: {
        accountId: "api_key",
        displayName: "MxToolbox API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: mxToolboxLookupApiBaseUrl,
        accountApiBaseUrl: mxToolboxAccountApiBaseUrl,
        validationEndpoint: mxToolboxUsagePath,
        dnsRequests: optionalInteger(usage.DnsRequests),
        dnsMax: optionalInteger(usage.DnsMax),
        networkRequests: optionalInteger(usage.NetworkRequests),
        networkMax: optionalInteger(usage.NetworkMax),
      }),
    };
  },
};

function mxToolboxLookupHandler(command: MxToolboxLookupCommand, inputKey: LookupInputKey): MxToolboxActionHandler {
  return (input, context) => {
    const argument = requiredString(input[inputKey], inputKey, providerInputError);
    return executeMxToolboxLookup({ command, argument }, context);
  };
}

function executeMxToolboxLookup(input: MxToolboxLookupInput, context: MxToolboxActionContext): Promise<unknown> {
  return executeMxToolboxRequest(buildMxToolboxLookupUrl(input), context, "execute");
}

function executeMxToolboxAccountRequest(
  path: string,
  context: MxToolboxActionContext,
  phase: MxToolboxPhase,
): Promise<unknown> {
  return executeMxToolboxRequest(new URL(path, mxToolboxAccountApiBaseUrl), context, phase);
}

async function executeMxToolboxRequest(
  url: URL,
  context: MxToolboxActionContext,
  phase: MxToolboxPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readMxToolboxPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `MxToolbox request failed: ${error.message}` : "MxToolbox request failed",
    );
  }

  if (!response.ok) {
    throw createMxToolboxError(response, payload, phase);
  }

  return payload;
}

function buildMxToolboxLookupUrl(input: MxToolboxLookupInput): URL {
  return new URL(
    `/api/v1/lookup/${encodeURIComponent(input.command)}/${encodeURIComponent(input.argument)}`,
    mxToolboxLookupApiBaseUrl,
  );
}

async function readMxToolboxPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createMxToolboxError(response: Response, payload: unknown, phase: MxToolboxPhase): ProviderRequestError {
  const message = extractMxToolboxErrorMessage(payload) ?? response.statusText ?? "MxToolbox request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 400 || response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }

  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractMxToolboxErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.Message) ??
    optionalString(record.error) ??
    optionalString(record.Error)
  );
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://mxtoolbox.com",
  auth: { type: "api_key_authorization", prefix: "" },
});
