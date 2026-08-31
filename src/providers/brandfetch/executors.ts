import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "brandfetch";
const brandfetchApiBaseUrl = "https://api.brandfetch.io";
const brandfetchValidationIdentifier = "brandfetch.com";
const brandfetchValidationPath = `/v2/brands/${brandfetchValidationIdentifier}`;

type BrandfetchPhase = "validate" | "execute";
type BrandfetchActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const brandfetchActionHandlers: ProviderActionHandlers<"brandfetch", BrandfetchActionHandler> = {
  async get_brand(input, context) {
    const identifier = requiredInputString(input.identifier, "identifier");
    const payload = await requestBrandfetchJson({
      apiKey: context.apiKey,
      path: `/v2/brands/${encodeURIComponent(identifier)}`,
      method: "GET",
      context,
      phase: "execute",
    });
    return normalizeBrandfetchBrand(extractBrandfetchRecord(payload));
  },
  async get_transaction_info(input, context) {
    const transactionLabel = requiredInputString(input.transactionLabel, "transactionLabel");
    const countryCode = requiredInputString(input.countryCode, "countryCode").toUpperCase();
    const payload = await requestBrandfetchJson({
      apiKey: context.apiKey,
      path: "/v2/transactions",
      method: "POST",
      body: {
        transactionLabel,
        countryCode,
      },
      context,
      phase: "execute",
    });
    return normalizeBrandfetchBrand(extractBrandfetchRecord(payload));
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, brandfetchActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestBrandfetchJson({
      apiKey: input.apiKey,
      path: brandfetchValidationPath,
      method: "GET",
      context: {
        fetcher,
        signal,
      },
      phase: "validate",
    });
    normalizeBrandfetchBrand(extractBrandfetchRecord(payload));

    return {
      profile: {
        accountId: "brandfetch-api-key",
        displayName: "Brandfetch API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: brandfetchValidationPath,
        apiBaseUrl: brandfetchApiBaseUrl,
        validationIdentifier: brandfetchValidationIdentifier,
      },
    };
  },
};

async function requestBrandfetchJson(input: {
  apiKey: string;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: BrandfetchPhase;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildBrandfetchUrl(input.path), {
      method: input.method,
      headers: buildBrandfetchHeaders(input.apiKey, input.body === undefined ? undefined : "application/json"),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
    payload = await readBrandfetchPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Brandfetch request failed: ${error.message}` : "Brandfetch request failed",
    );
  }

  if (!response.ok) {
    throw createBrandfetchError(response, payload, input.phase);
  }
  return payload;
}

function buildBrandfetchUrl(path: string): string {
  return new URL(path, brandfetchApiBaseUrl).toString();
}

function buildBrandfetchHeaders(apiKey: string, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (contentType) {
    headers["content-type"] = contentType;
  }
  return headers;
}

async function readBrandfetchPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text,
    };
  }
}

function extractBrandfetchRecord(payload: unknown): Record<string, unknown> {
  const wrapped = optionalRecord(payload);
  if (!wrapped) {
    throw new ProviderRequestError(502, "Brandfetch returned a non-object response");
  }

  const data = optionalRecord(wrapped.data);
  if (data) {
    return data;
  }

  const brand = optionalRecord(wrapped.brand);
  if (brand) {
    return brand;
  }

  return wrapped;
}

function normalizeBrandfetchBrand(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: optionalString(record.id),
    urn: optionalString(record.urn),
    name: optionalString(record.name),
    domain: optionalString(record.domain),
    claimed: optionalBoolean(record.claimed),
    description: optionalString(record.description),
    longDescription: optionalString(record.longDescription),
    qualityScore: optionalNumber(record.qualityScore),
    isNsfw: optionalBoolean(record.isNsfw),
    logos: normalizeLogoArray(record.logos),
    colors: normalizeColorArray(record.colors),
    fonts: normalizeFontArray(record.fonts),
    images: normalizeImageArray(record.images),
    links: normalizeLinkArray(record.links),
    company: optionalRecord(record.company),
  });
}

function normalizeLogoArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return normalizeObjectArray(value)
    ?.map((item) =>
      compactObject({
        type: optionalString(item.type),
        theme: optionalString(item.theme),
        formats: normalizeFormatArray(item.formats),
      }),
    )
    .filter((item) => item.type || item.theme || item.formats);
}

function normalizeImageArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return normalizeObjectArray(value)
    ?.map((item) =>
      compactObject({
        type: optionalString(item.type),
        formats: normalizeFormatArray(item.formats),
      }),
    )
    .filter((item) => item.type || item.formats);
}

function normalizeColorArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return normalizeObjectArray(value)
    ?.map((item) =>
      compactObject({
        hex: optionalString(item.hex),
        type: optionalString(item.type),
        brightness: optionalNumber(item.brightness),
      }),
    )
    .filter((item) => item.hex || item.type || item.brightness !== undefined);
}

function normalizeFontArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return normalizeObjectArray(value)
    ?.map((item) =>
      compactObject({
        name: optionalString(item.name),
        type: optionalString(item.type),
        origin: optionalString(item.origin),
        originId: optionalString(item.originId),
      }),
    )
    .filter((item) => item.name || item.type || item.origin || item.originId);
}

function normalizeLinkArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return normalizeObjectArray(value)
    ?.map((item) =>
      compactObject({
        name: optionalString(item.name),
        url: optionalString(item.url),
      }),
    )
    .filter((item) => item.name || item.url);
}

function normalizeFormatArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return normalizeObjectArray(value)
    ?.map((item) =>
      compactObject({
        src: optionalString(item.src),
        format: optionalString(item.format),
        width: optionalNumber(item.width),
        height: optionalNumber(item.height),
        size: optionalNumber(item.size),
        background: optionalString(item.background),
      }),
    )
    .filter((item) => item.src || item.format || item.width || item.height || item.size || item.background);
}

function normalizeObjectArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined);
}

function createBrandfetchError(response: Response, payload: unknown, phase: BrandfetchPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const rawMessage =
    optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.details);
  const message = rawMessage ?? `Brandfetch request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (response.status === 404) {
    const fallback =
      phase === "validate"
        ? "Brandfetch credential validation failed."
        : "Brandfetch could not find a matching brand for the provided input.";
    return new ProviderRequestError(404, rawMessage ?? fallback, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}
