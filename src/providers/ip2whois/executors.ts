import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { Ip2whoisActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "ip2whois";
const ip2whoisWhoisApiBaseUrl = "https://api.ip2whois.com";
const ip2whoisWhoisPath = "/v2";
const ip2whoisHostedDomainsApiBaseUrl = "https://domains.ip2whois.com";
const ip2whoisHostedDomainsPath = "/domains";
const ip2whoisValidationDomain = "example.com";

type Ip2whoisRequestPhase = "validate" | "execute";
type Ip2whoisActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type Ip2whoisActionHandler = (input: Record<string, unknown>, context: Ip2whoisActionContext) => Promise<unknown>;

interface Ip2whoisRequestInput {
  baseUrl: string;
  path: string;
  query: Record<string, unknown>;
  phase: Ip2whoisRequestPhase;
}

export const ip2whoisActionHandlers: Record<Ip2whoisActionName, Ip2whoisActionHandler> = {
  lookup_domain(input, context) {
    return requestIp2whoisJson(
      {
        baseUrl: ip2whoisWhoisApiBaseUrl,
        path: ip2whoisWhoisPath,
        query: {
          domain: input.domain,
        },
        phase: "execute",
      },
      context,
    );
  },
  lookup_hosted_domains(input, context) {
    return requestIp2whoisJson(
      {
        baseUrl: ip2whoisHostedDomainsApiBaseUrl,
        path: ip2whoisHostedDomainsPath,
        query: {
          ip: input.ip,
          page: input.page,
        },
        phase: "execute",
      },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ip2whoisActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestIp2whoisJson(
      {
        baseUrl: ip2whoisWhoisApiBaseUrl,
        path: ip2whoisWhoisPath,
        query: {
          domain: ip2whoisValidationDomain,
        },
        phase: "validate",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "IP2WHOIS API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: ip2whoisWhoisApiBaseUrl,
        hostedDomainsApiBaseUrl: ip2whoisHostedDomainsApiBaseUrl,
        validationEndpoint: ip2whoisWhoisPath,
        validatedDomain: ip2whoisValidationDomain,
      },
    };
  },
};

async function requestIp2whoisJson(input: Ip2whoisRequestInput, context: Ip2whoisActionContext): Promise<unknown> {
  const url = buildIp2whoisUrl(input, context.apiKey);

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readIp2whoisPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "IP2WHOIS request failed", error);
  }

  const payloadError = readIp2whoisErrorPayload(payload);
  if (payloadError) {
    throw mapIp2whoisError(payloadError, input.phase);
  }

  if (!response.ok) {
    throw new ProviderRequestError(502, response.statusText || "IP2WHOIS request failed", payload);
  }

  return payload;
}

function buildIp2whoisUrl(input: Ip2whoisRequestInput, apiKey: string): URL {
  const url = new URL(input.path, input.baseUrl);
  url.searchParams.set("key", apiKey);
  for (const [key, value] of Object.entries(input.query)) {
    appendQueryValue(url, key, value);
  }
  url.searchParams.set("format", "json");
  return url;
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  url.searchParams.set(key, String(value));
}

async function readIp2whoisPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readIp2whoisErrorPayload(payload: unknown): { errorCode: number; errorMessage: string } | null {
  const error = optionalRecord(optionalRecord(payload)?.error);
  const errorCode = error?.error_code;
  const errorMessage = optionalString(error?.error_message);
  if (typeof errorCode !== "number" || !errorMessage) {
    return null;
  }

  return {
    errorCode,
    errorMessage,
  };
}

function mapIp2whoisError(
  input: {
    errorCode: number;
    errorMessage: string;
  },
  phase: Ip2whoisRequestPhase,
): ProviderRequestError {
  switch (input.errorCode) {
    case 10001:
    case 10002:
    case 10003:
      return new ProviderRequestError(phase === "validate" ? 400 : 401, input.errorMessage, input);
    case 10006:
    case 10007:
    case 10008:
      return new ProviderRequestError(400, input.errorMessage, input);
    default:
      return new ProviderRequestError(502, input.errorMessage, input);
  }
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.ip2whois.com",
  auth: { type: "api_key_query", name: "key" },
});
