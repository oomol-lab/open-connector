import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { Ip2locationActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "ip2location";
const ip2locationApiBaseUrl = "https://api.ip2location.io";
const ip2locationDomainWhoisApiBaseUrl = "https://api.ip2whois.com";
const ip2locationHostedDomainsApiBaseUrl = "https://domains.ip2whois.com";
const ip2locationValidationIp = "8.8.8.8";

type Ip2locationRequestPhase = "validate" | "execute";
type Ip2locationQueryValue = string | number | undefined;
type Ip2locationActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type Ip2locationActionHandler = (input: Record<string, unknown>, context: Ip2locationActionContext) => Promise<unknown>;

interface Ip2locationRequestInput {
  baseUrl: string;
  path: string;
  query: Record<string, Ip2locationQueryValue>;
  phase: Ip2locationRequestPhase;
}

export const ip2locationActionHandlers: Record<Ip2locationActionName, Ip2locationActionHandler> = {
  get_ip_geolocation(input, context) {
    return requestIp2locationJson(
      {
        baseUrl: ip2locationApiBaseUrl,
        path: "/",
        query: {
          ip: readRequiredString(input.ip, "ip"),
          lang: optionalString(input.lang),
        },
        phase: "execute",
      },
      context,
    );
  },
  get_domain_whois(input, context) {
    return requestIp2locationJson(
      {
        baseUrl: ip2locationDomainWhoisApiBaseUrl,
        path: "/v2",
        query: {
          domain: readRequiredString(input.domain, "domain"),
        },
        phase: "execute",
      },
      context,
    );
  },
  list_hosted_domains(input, context) {
    return requestIp2locationJson(
      {
        baseUrl: ip2locationHostedDomainsApiBaseUrl,
        path: "/domains",
        query: {
          ip: readRequiredString(input.ip, "ip"),
          page: optionalNumber(input.page),
        },
        phase: "execute",
      },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ip2locationActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestIp2locationJson(
      {
        baseUrl: ip2locationApiBaseUrl,
        path: "/",
        query: {
          ip: ip2locationValidationIp,
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
        displayName: "IP2Location.io API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: ip2locationApiBaseUrl,
        domainWhoisApiBaseUrl: ip2locationDomainWhoisApiBaseUrl,
        hostedDomainsApiBaseUrl: ip2locationHostedDomainsApiBaseUrl,
        validationEndpoint: "/",
        validatedIp: ip2locationValidationIp,
      }),
    };
  },
};

async function requestIp2locationJson(
  input: Ip2locationRequestInput,
  context: Ip2locationActionContext,
): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;

  try {
    response = await context.fetcher(buildIp2locationUrl(input, context.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readIp2locationPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? error.message : "IP2Location.io request failed",
      error,
    );
  }

  const payloadError = readIp2locationErrorPayload(payload);
  if (payloadError) {
    throw mapIp2locationError(payloadError, input.phase);
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      response.status || 500,
      response.statusText || "IP2Location.io request failed",
      payload,
    );
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "IP2Location.io returned an invalid JSON object", payload);
  }

  return record;
}

function buildIp2locationUrl(input: Ip2locationRequestInput, apiKey: string): URL {
  const url = new URL(input.path, input.baseUrl);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("format", "json");

  for (const [key, value] of Object.entries(input.query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function readIp2locationPayload(response: Response): Promise<unknown> {
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

function readIp2locationErrorPayload(payload: unknown): { errorCode: number; errorMessage: string } | null {
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

function mapIp2locationError(
  input: {
    errorCode: number;
    errorMessage: string;
  },
  phase: Ip2locationRequestPhase,
): ProviderRequestError {
  const message = input.errorMessage;
  const lowerMessage = message.toLowerCase();
  const looksLikeCredentialError = lowerMessage.includes("api key") || lowerMessage.includes("insufficient query");

  if (looksLikeCredentialError) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, input);
  }

  if (
    input.errorCode === 10001 ||
    input.errorCode === 10006 ||
    input.errorCode === 10007 ||
    input.errorCode === 10008 ||
    lowerMessage.includes("missing parameter") ||
    lowerMessage.includes("invalid ip") ||
    lowerMessage.includes("invalid domain") ||
    lowerMessage.includes("invalid page")
  ) {
    return new ProviderRequestError(400, message, input);
  }

  return new ProviderRequestError(502, message, input);
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.ip2location.io",
  auth: { type: "api_key_query", name: "key" },
});
