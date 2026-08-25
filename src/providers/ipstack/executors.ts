import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "ipstack";
const ipstackApiBaseUrl = "https://api.ipstack.com";

type IpstackRequestPhase = "validate" | "execute";
type IpstackActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type IpstackActionHandler = (input: Record<string, unknown>, context: IpstackActionContext) => Promise<unknown>;

export const ipstackActionHandlers: ProviderActionHandlers<"ipstack", IpstackActionHandler> = {
  lookup_current_ip(input, context) {
    return requestIpstackLookup(
      {
        path: "/check",
        phase: "execute",
        fields: readFields(input),
      },
      context,
    );
  },
  lookup_ip(input, context) {
    return requestIpstackLookup(
      {
        path: `/${encodeURIComponent(readRequiredString(input.ip, "ip"))}`,
        phase: "execute",
        fields: readFields(input),
      },
      context,
    );
  },
  bulk_lookup(input, context) {
    return requestIpstackLookup(
      {
        path: `/${readStringArray(input.ips, "ips").map(encodeURIComponent).join(",")}`,
        phase: "execute",
        fields: readFields(input),
      },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ipstackActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestIpstackLookup(
      {
        path: "/check",
        phase: "validate",
        fields: ["ip", "country_name"],
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    );
    const record = requireIpstackObject(payload);

    return {
      profile: {
        accountId: "api_key",
        displayName: "ipstack API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/check",
        apiBaseUrl: ipstackApiBaseUrl,
        validatedIp: optionalString(record.ip),
        validatedCountry: optionalString(record.country_name),
      }),
    };
  },
};

async function requestIpstackLookup(
  input: {
    path: string;
    phase: IpstackRequestPhase;
    fields?: string[];
  },
  context: IpstackActionContext,
): Promise<unknown> {
  const url = new URL(input.path, ipstackApiBaseUrl);
  url.searchParams.set("access_key", context.apiKey);
  if (input.fields && input.fields.length > 0) {
    url.searchParams.set("fields", input.fields.join(","));
  }

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
    payload = await readIpstackPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ipstack request failed: ${error.message}` : "ipstack request failed",
      error,
    );
  }

  const providerError = readIpstackError(payload);
  if (providerError) {
    throw mapIpstackError(providerError, input.phase);
  }
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : response.status || 500,
      `ipstack request failed with HTTP ${response.status}`,
      payload,
    );
  }
  return payload;
}

async function readIpstackPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(response.status === 429 ? 429 : 502, "ipstack returned empty response body");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : 502,
      error instanceof Error ? `ipstack returned invalid JSON: ${error.message}` : "ipstack returned invalid JSON",
      error,
    );
  }
}

function readIpstackError(payload: unknown): { code?: number; type?: string; info: string } | null {
  const record = optionalRecord(payload);
  if (!record || record.success !== false) {
    return null;
  }

  const errorRecord = optionalRecord(record.error);
  if (!errorRecord) {
    return {
      info: "ipstack request failed",
    };
  }
  return {
    code: typeof errorRecord.code === "number" ? errorRecord.code : undefined,
    type: optionalString(errorRecord.type),
    info: optionalString(errorRecord.info) ?? "ipstack request failed",
  };
}

function mapIpstackError(
  error: { code?: number; type?: string; info: string },
  phase: IpstackRequestPhase,
): ProviderRequestError {
  if (error.code === 104 || error.type === "usage_limit_reached") {
    return new ProviderRequestError(429, error.info);
  }
  if (error.code === 101 || error.type === "invalid_access_key") {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, error.info);
  }
  if (
    error.code === 102 ||
    error.code === 103 ||
    error.code === 105 ||
    error.type === "invalid_api_function" ||
    error.type === "invalid_api_function_access" ||
    error.type === "function_access_restricted"
  ) {
    return new ProviderRequestError(400, error.info);
  }
  return new ProviderRequestError(502, error.info);
}

function requireIpstackObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "ipstack returned an invalid object response", payload);
  }
  return record;
}

function readFields(input: Record<string, unknown>): string[] | undefined {
  if (input.fields === undefined) {
    return undefined;
  }
  return readStringArray(input.fields, "fields");
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  const values = value.map((item, index) => readRequiredString(item, `${fieldName}[${index}]`));
  if (values.some((value) => !value)) {
    throw new ProviderRequestError(400, `${fieldName} must not contain empty values`);
  }
  return values;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}
