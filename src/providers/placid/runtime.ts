import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { compactObject } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const placidApiBaseUrl = "https://api.placid.app";
const templatesPath = "/api/rest/templates";
const imagesPath = "/api/rest/images";

type PlacidPhase = "validate" | "execute";
type PlacidHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const placidActionHandlers: ProviderActionHandlers<"placid", PlacidHandler> = {
  list_templates(input, context) {
    return listTemplates(input, context);
  },
  get_template(input, context) {
    return getTemplate(input, context);
  },
  create_image(input, context) {
    return createImage(input, context);
  },
  get_image(input, context) {
    return getImage(input, context);
  },
  delete_image(input, context) {
    return deleteImage(input, context);
  },
};

export async function validatePlacidCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await requestJson({
    url: new URL(templatesPath, placidApiBaseUrl),
    method: "GET",
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const record = readObject(payload, "validation response");
  if (!Array.isArray(record.data)) {
    throw new ProviderRequestError(502, "placid validation response was invalid");
  }
  return {
    profile: { accountId: "api_key", displayName: "Placid API Token" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: placidApiBaseUrl,
      validationEndpoint: templatesPath,
      docsUrl: "https://placid.app/docs/2.0/rest/authentication",
    },
  };
}

async function listTemplates(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestJson({ url: buildTemplatesUrl(input), method: "GET", ...context, phase: "execute" });
  const record = readObject(payload, "template list response");
  const items = Array.isArray(record.data) ? record.data : [];
  return {
    templates: items.map((item, index) => normalizeTemplate(item, `data[${index}]`)),
    links: normalizeLinks(record.links),
    meta: normalizeTemplateListMeta(record.meta),
  };
}

async function getTemplate(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const templateUuid = requiredString(input.template_uuid, "template_uuid", providerError);
  const payload = await requestJson({
    url: new URL(`${templatesPath}/${encodeURIComponent(templateUuid)}`, placidApiBaseUrl),
    method: "GET",
    ...context,
    phase: "execute",
  });
  return { template: normalizeTemplate(payload, "template") };
}

async function createImage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestJson({
    url: new URL(imagesPath, placidApiBaseUrl),
    method: "POST",
    body: compactObject({
      template_uuid: requiredString(input.template_uuid, "template_uuid", providerError),
      webhook_success: optionalString(input.webhook_success),
      create_now: typeof input.create_now === "boolean" ? input.create_now : undefined,
      passthrough: input.passthrough,
      errors: Array.isArray(input.errors) ? input.errors : undefined,
      layers: optionalRecord(input.layers),
      modifications: optionalRecord(input.modifications),
      transfer: optionalRecord(input.transfer),
    }),
    ...context,
    phase: "execute",
  });
  return { image: normalizeImage(payload, "image") };
}

async function getImage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const imageId = readPositiveInteger(input.image_id, "image_id");
  const payload = await requestJson({
    url: new URL(`${imagesPath}/${imageId}`, placidApiBaseUrl),
    method: "GET",
    ...context,
    phase: "execute",
  });
  return { image: normalizeImage(payload, "image") };
}

async function deleteImage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const imageId = readPositiveInteger(input.image_id, "image_id");
  await requestJson({
    url: new URL(`${imagesPath}/${imageId}`, placidApiBaseUrl),
    method: "DELETE",
    acceptedStatuses: [204],
    ...context,
    phase: "execute",
  });
  return { deleted: true };
}

async function requestJson(input: {
  url: URL;
  method: "GET" | "POST" | "DELETE";
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: PlacidPhase;
  body?: Record<string, unknown>;
  acceptedStatuses?: number[];
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.fetcher(input.url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `placid request failed: ${error.message}` : "placid request failed",
    );
  }

  const payload = await readPayload(response);
  if (!(input.acceptedStatuses ?? [200]).includes(response.status)) {
    throw createPlacidError(response.status, payload, input.phase);
  }
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "placid returned invalid JSON");
  }
}

function createPlacidError(status: number, payload: unknown, phase: PlacidPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.detail) ??
    `placid request failed with status ${status}`;
  if (status === 401 && phase === "validate") {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 && phase === "execute") {
    return new ProviderRequestError(401, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status === 429 ? 429 : status >= 500 ? 502 : status, message);
}

function buildTemplatesUrl(input: Record<string, unknown>): URL {
  const pageUrl = optionalString(input.page_url);
  const url = pageUrl ? readTemplatesPageUrl(pageUrl) : new URL(templatesPath, placidApiBaseUrl);
  setParam(url, "collection_id", optionalString(input.collection_id));
  setParam(url, "title_filter", optionalString(input.title_filter));
  setParam(url, "tag", optionalString(input.tag));
  setParam(url, "order_by", optionalString(input.order_by));
  return url;
}

function normalizeTemplate(value: unknown, label: string): Record<string, unknown> {
  const record = readObject(value, label);
  return {
    uuid: requiredString(record.uuid, `${label}.uuid`, providerError),
    title: requiredString(record.title, `${label}.title`, providerError),
    thumbnail: readOptionalUrl(record.thumbnail),
    tags: Array.isArray(record.tags) ? record.tags.map(String) : [],
    layers: Array.isArray(record.layers) ? record.layers.map((item) => normalizeLayer(item, `${label}.layers[]`)) : [],
    raw: record,
  };
}

function normalizeLayer(value: unknown, label: string): Record<string, string> {
  const record = readObject(value, label);
  return {
    name: requiredString(record.name, `${label}.name`, providerError),
    type: requiredString(record.type, `${label}.type`, providerError),
  };
}

function normalizeImage(value: unknown, label: string): Record<string, unknown> {
  const record = readObject(value, label);
  return {
    id: readPositiveInteger(record.id, `${label}.id`),
    status: requiredString(record.status, `${label}.status`, providerError),
    image_url: readOptionalUrl(record.image_url),
    polling_url: readOptionalUrl(record.polling_url),
    raw: record,
  };
}

function normalizeLinks(value: unknown): Record<string, string | null> {
  const record = optionalRecord(value);
  return {
    first: readOptionalUrl(record?.first),
    last: readOptionalUrl(record?.last),
    prev: readOptionalUrl(record?.prev),
    next: readOptionalUrl(record?.next),
  };
}

function normalizeTemplateListMeta(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  return {
    path: readOptionalUrl(record?.path),
    per_page: optionalInteger(record?.per_page) ?? null,
    raw: record ?? {},
  };
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `placid ${label} was not an object`);
  }
  return record;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (!parsed || parsed <= 0) {
    throw new ProviderRequestError(502, `placid response did not include numeric ${fieldName}`);
  }
  return parsed;
}

function readOptionalUrl(value: unknown): string | null {
  return optionalString(value) ?? null;
}

function setParam(url: URL, key: string, value: string | undefined): void {
  if (value) {
    url.searchParams.set(key, value);
  }
}

function readTemplatesPageUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.origin === placidApiBaseUrl && stripTrailingSlashes(url.pathname) === templatesPath) {
      return url;
    }
  } catch {
    // Fall through to the structured validation error below.
  }
  throw new ProviderRequestError(
    400,
    `page_url must be a Placid templates pagination URL under ${templatesPath}: ${value}`,
  );
}

function stripTrailingSlashes(value: string): string {
  let normalized = value;
  while (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `placid response did not include ${message.replace(/ is required\.$/, "")}`);
}
