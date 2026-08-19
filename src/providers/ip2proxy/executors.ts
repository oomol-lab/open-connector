import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "ip2proxy";
const ip2proxyApiBaseUrl = "https://api.ip2proxy.com";
const ip2proxyValidationIp = "8.8.8.8";
const ip2proxyValidationPackage = "PX1";

type Ip2proxyRequestPhase = "validate" | "execute";
type Ip2proxyActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type Ip2proxyActionHandler = (input: Record<string, unknown>, context: Ip2proxyActionContext) => Promise<unknown>;

export const ip2proxyActionHandlers: ProviderActionHandlers<"ip2proxy", Ip2proxyActionHandler> = {
  lookup_ip(input, context) {
    return requestIp2proxyJson(
      {
        ip: readRequiredString(input.ip, "ip"),
        package: readRequiredString(input.package, "package"),
      },
      context,
      "execute",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ip2proxyActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestIp2proxyJson(
      {
        ip: ip2proxyValidationIp,
        package: ip2proxyValidationPackage,
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "IP2Proxy API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: ip2proxyApiBaseUrl,
        validationEndpoint: "/",
        validatedIp: ip2proxyValidationIp,
        validatedPackage: ip2proxyValidationPackage,
      }),
    };
  },
};

async function requestIp2proxyJson(
  query: {
    ip: string;
    package: string;
  },
  context: Ip2proxyActionContext,
  phase: Ip2proxyRequestPhase,
): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;

  try {
    response = await context.fetcher(buildIp2proxyUrl(context.apiKey, query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readIp2proxyPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "IP2Proxy request failed", error);
  }

  const payloadError = readIp2proxyErrorPayload(payload);
  if (payloadError) {
    throw mapIp2proxyError(payloadError, phase);
  }

  if (!response.ok) {
    throw new ProviderRequestError(response.status || 500, response.statusText || "IP2Proxy request failed", payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "IP2Proxy returned an invalid JSON object", payload);
  }

  return record;
}

function buildIp2proxyUrl(
  apiKey: string,
  query: {
    ip: string;
    package: string;
  },
): URL {
  const url = new URL("/", ip2proxyApiBaseUrl);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("ip", query.ip);
  url.searchParams.set("package", query.package);
  return url;
}

async function readIp2proxyPayload(response: Response): Promise<unknown> {
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

function readIp2proxyErrorPayload(payload: unknown): { responseMessage: string } | null {
  const responseMessage = optionalString(optionalRecord(payload)?.response);
  if (!responseMessage || responseMessage === "OK") {
    return null;
  }

  return {
    responseMessage,
  };
}

function mapIp2proxyError(
  input: {
    responseMessage: string;
  },
  phase: Ip2proxyRequestPhase,
): ProviderRequestError {
  const normalizedMessage = input.responseMessage.toLowerCase();
  if (normalizedMessage.includes("api key") || normalizedMessage.includes("credit")) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, input.responseMessage, input);
  }

  return new ProviderRequestError(502, input.responseMessage, input);
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new ProviderRequestError(400, `${fieldName} is required`);
}
