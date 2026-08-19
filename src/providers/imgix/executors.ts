import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "imgix";
const imgixApiBaseUrl = "https://api.imgix.com/api/v1/";
const sourcesPath = "sources";
const purgesPath = "purges";

type ImgixRequestPhase = "validate" | "execute";
type ImgixMethod = "GET" | "PATCH" | "POST";
type ImgixActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type ImgixActionHandler = (input: Record<string, unknown>, context: ImgixActionContext) => Promise<unknown>;

interface ImgixRequestInput {
  path: string;
  method?: ImgixMethod;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  phase: ImgixRequestPhase;
}

export const imgixActionHandlers: ProviderActionHandlers<"imgix", ImgixActionHandler> = {
  list_sources(input, context) {
    return executeListSources(input, context);
  },
  get_source(input, context) {
    return executeGetSource(input, context);
  },
  update_source(input, context) {
    return executeUpdateSource(input, context);
  },
  purge_asset(input, context) {
    return executePurgeAsset(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, imgixActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await imgixRequestJson(
      {
        path: sourcesPath,
        phase: "validate",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    );
    const data = optionalRecord(payload)?.data;
    const resourceCount = Array.isArray(data) ? data.length : undefined;

    return {
      profile: {
        accountId: "api_key",
        displayName: "Imgix API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: imgixApiBaseUrl,
        validationEndpoint: `/${sourcesPath}`,
        resourceCount,
      }),
    };
  },
};

async function executeListSources(input: Record<string, unknown>, context: ImgixActionContext): Promise<unknown> {
  const payload = await imgixRequestJson(
    {
      path: sourcesPath,
      phase: "execute",
      query: buildListSourcesQuery(input),
    },
    context,
  );
  const record = requireResponseRecord(payload);
  const data = record.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, "Imgix list sources response missing data array");
  }

  return {
    sources: data,
    meta: optionalRecord(record.meta) ?? null,
    jsonapi: optionalRecord(record.jsonapi) ?? null,
  };
}

async function executeGetSource(input: Record<string, unknown>, context: ImgixActionContext): Promise<unknown> {
  const sourceId = readRequiredString(input.sourceId, "sourceId");
  const payload = await imgixRequestJson(
    {
      path: `${sourcesPath}/${encodeURIComponent(sourceId)}`,
      phase: "execute",
      query: compactObject({
        "fields[sources]": optionalString(input.fieldsSources),
      }),
    },
    context,
  );
  return normalizeSourceResponse(payload, "get source");
}

async function executeUpdateSource(input: Record<string, unknown>, context: ImgixActionContext): Promise<unknown> {
  const sourceId = readRequiredString(input.sourceId, "sourceId");
  const attributes = optionalRecord(input.attributes);
  if (!attributes) {
    throw new ProviderRequestError(400, "attributes must be an object");
  }

  const payload = await imgixRequestJson(
    {
      path: `${sourcesPath}/${encodeURIComponent(sourceId)}`,
      method: "PATCH",
      phase: "execute",
      body: {
        data: {
          type: "sources",
          id: sourceId,
          attributes,
        },
      },
    },
    context,
  );
  return normalizeSourceResponse(payload, "update source");
}

async function executePurgeAsset(input: Record<string, unknown>, context: ImgixActionContext): Promise<unknown> {
  const payload = await imgixRequestJson(
    {
      path: purgesPath,
      method: "POST",
      phase: "execute",
      body: {
        data: {
          type: "purges",
          attributes: compactObject({
            url: readRequiredString(input.url, "url"),
            source_id: optionalString(input.sourceId),
            sub_image: optionalBoolean(input.subImage),
          }),
        },
      },
    },
    context,
  );
  const record = requireResponseRecord(payload);
  const purge = optionalRecord(record.data);
  if (!purge) {
    throw new ProviderRequestError(502, "Imgix purge response missing data object");
  }

  return {
    purge,
    jsonapi: optionalRecord(record.jsonapi) ?? null,
  };
}

function buildListSourcesQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    sort: optionalString(input.sort),
    "page[size]": stringifyOptionalNumber(input.pageSize),
    "page[number]": stringifyOptionalNumber(input.pageNumber),
    "fields[sources]": optionalString(input.fieldsSources),
    "filter[name]": optionalString(input.filterName),
    "filter[enabled]": stringifyOptionalBoolean(optionalBoolean(input.filterEnabled)),
    "filter[deployment.type]": optionalString(input.filterDeploymentType),
    "filter[deployment.region]": optionalString(input.filterDeploymentRegion),
    "filter[deployment.s3_bucket]": optionalString(input.filterDeploymentS3Bucket),
    "filter[deployment.gcs_bucket]": optionalString(input.filterDeploymentGcsBucket),
    "filter[deployment.bucket_name]": optionalString(input.filterDeploymentBucketName),
    "filter[deployment.azure_bucket]": optionalString(input.filterDeploymentAzureBucket),
    "filter[deployment.custom_domains]": optionalString(input.filterDeploymentCustomDomains),
    "filter[deployment.imgix_subdomains]": optionalString(input.filterDeploymentImgixSubdomains),
    "filter[deployment.storage_provider]": optionalString(input.filterDeploymentStorageProvider),
    "filter[deployment.webfolder_base_url]": optionalString(input.filterDeploymentWebfolderBaseUrl),
  });
}

async function imgixRequestJson(input: ImgixRequestInput, context: ImgixActionContext): Promise<unknown> {
  const url = new URL(input.path, imgixApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: imgixHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: context.signal,
    });
    payload = await readImgixPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Imgix request failed: ${error.message}` : "Imgix request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createImgixError(response, payload, input.phase);
  }

  return payload;
}

function imgixHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/vnd.api+json, application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/vnd.api+json";
  }
  return headers;
}

async function readImgixPayload(response: Response): Promise<unknown> {
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

function createImgixError(response: Response, payload: unknown, phase: ImgixRequestPhase): ProviderRequestError {
  const message = extractImgixErrorMessage(payload) ?? response.statusText ?? "Imgix request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if ([400, 404, 409, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractImgixErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const firstMessage = errors
      .map((error) => optionalRecord(error))
      .map((error) => optionalString(error?.detail) ?? optionalString(error?.title))
      .find((message) => message && message.trim());
    if (firstMessage) {
      return firstMessage;
    }
  }

  return (
    optionalString(record.detail) ??
    optionalString(record.title) ??
    optionalString(record.message) ??
    optionalString(record.error)
  );
}

function normalizeSourceResponse(payload: unknown, action: string): Record<string, unknown> {
  const record = requireResponseRecord(payload);
  const source = optionalRecord(record.data);
  if (!source) {
    throw new ProviderRequestError(502, `Imgix ${action} response missing data object`);
  }

  return {
    source,
    meta: optionalRecord(record.meta) ?? null,
    jsonapi: optionalRecord(record.jsonapi) ?? null,
  };
}

function requireResponseRecord(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Imgix returned an invalid JSON:API response");
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function stringifyOptionalNumber(value: unknown): string | undefined {
  return typeof value === "number" ? String(value) : undefined;
}

function stringifyOptionalBoolean(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}
