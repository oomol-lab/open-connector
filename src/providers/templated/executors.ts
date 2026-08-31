import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "templated";
const templatedApiBaseUrl = "https://api.templated.io/v1";

type TemplatedRequestPhase = "validate" | "execute";
type TemplatedActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const templatedActionHandlers: ProviderActionHandlers<"templated", TemplatedActionHandler> = {
  async get_account(_input, context): Promise<unknown> {
    const payload = await requestTemplatedJson({
      apiKey: context.apiKey,
      path: "/account",
      context,
      phase: "execute",
    });
    return { account: normalizeAccount(payload) };
  },
  async list_templates(input, context): Promise<unknown> {
    const payload = await requestTemplatedJson({
      apiKey: context.apiKey,
      path: "/templates",
      query: compactObject({
        query: optionalString(input.query),
        page: optionalInteger(input.page),
        limit: optionalInteger(input.limit),
        width: optionalInteger(input.width),
        height: optionalInteger(input.height),
        tags: readOptionalStringArray(input.tags, "tags")?.join(","),
        externalId: optionalString(input.externalId),
        includeLayers: optionalBoolean(input.includeLayers),
        includePages: optionalBoolean(input.includePages),
      }),
      context,
      phase: "execute",
    });
    return { templates: readCollection(payload, "template").map((item) => normalizeTemplate(item)) };
  },
  async get_template(input, context): Promise<unknown> {
    const templateId = requiredInputString(input.templateId, "templateId");
    const payload = await requestTemplatedJson({
      apiKey: context.apiKey,
      path: `/template/${encodeURIComponent(templateId)}`,
      query: compactObject({
        includeLayers: optionalBoolean(input.includeLayers),
        includePages: optionalBoolean(input.includePages),
      }),
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { template: normalizeTemplate(payload) };
  },
  async create_render(input, context): Promise<unknown> {
    const payload = await requestTemplatedJson({
      apiKey: context.apiKey,
      path: "/render",
      method: "POST",
      body: compactObject({
        template: requiredInputString(input.templateId, "templateId"),
        format: optionalString(input.format),
        transparent: optionalBoolean(input.transparent),
        flatten: optionalBoolean(input.flatten),
        cmyk: optionalBoolean(input.cmyk),
        name: optionalString(input.name),
        background: optionalString(input.background),
        width: optionalInteger(input.width),
        height: optionalInteger(input.height),
        scale: optionalNumber(input.scale),
        external_id: optionalString(input.externalId),
        async: optionalBoolean(input.async),
        webhook_url: optionalString(input.webhookUrl),
        layers: readOptionalLayerOverrides(input.layers),
      }),
      context,
      phase: "execute",
    });
    return { renders: readRenderCreatePayload(payload).map((item) => normalizeRender(item)) };
  },
  async list_renders(_input, context): Promise<unknown> {
    const payload = await requestTemplatedJson({
      apiKey: context.apiKey,
      path: "/renders",
      context,
      phase: "execute",
    });
    return { renders: readCollection(payload, "render").map((item) => normalizeRender(item)) };
  },
  async get_render(input, context): Promise<unknown> {
    const renderId = requiredInputString(input.renderId, "renderId");
    const payload = await requestTemplatedJson({
      apiKey: context.apiKey,
      path: `/render/${encodeURIComponent(renderId)}`,
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { render: normalizeRender(payload) };
  },
  async delete_render(input, context): Promise<unknown> {
    const renderId = requiredInputString(input.renderId, "renderId");
    await requestTemplatedAck({
      apiKey: context.apiKey,
      path: `/render/${encodeURIComponent(renderId)}`,
      context,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { deleted: true, renderId };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, templatedActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestTemplatedJson({
      apiKey: input.apiKey,
      path: "/account",
      context: { fetcher, signal },
      phase: "validate",
    });
    const account = normalizeAccount(payload);
    return {
      profile: {
        accountId: optionalString(account.id) ?? optionalString(account.email) ?? "templated-account",
        displayName: optionalString(account.name) ?? optionalString(account.email) ?? "Templated",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: templatedApiBaseUrl,
        validationEndpoint: "/account",
        email: account.email,
        plan: account.plan,
        watermark: account.watermark,
      }),
    };
  },
};

async function requestTemplatedJson(input: {
  apiKey: string;
  path: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: TemplatedRequestPhase;
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const response = await templatedFetch(input);
  const payload = await readTemplatedPayload(response);
  if (!response.ok) {
    throw createTemplatedError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }
  return payload;
}

async function requestTemplatedAck(input: {
  apiKey: string;
  path: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: TemplatedRequestPhase;
  notFoundAsInvalidInput?: boolean;
}): Promise<void> {
  const response = await templatedFetch({
    ...input,
    method: "DELETE",
  });
  const payload = await readTemplatedPayload(response);
  if (!response.ok) {
    throw createTemplatedError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }
}

async function templatedFetch(input: {
  apiKey: string;
  path: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}): Promise<Response> {
  const resolvedPath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(resolvedPath, `${templatedApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  try {
    return await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: templatedHeaders(input.apiKey, Boolean(input.body)),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `templated request failed: ${error.message}` : "templated request failed",
    );
  }
}

function templatedHeaders(apiKey: string, hasJsonBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (hasJsonBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readTemplatedPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }
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

function createTemplatedError(
  response: Response,
  payload: unknown,
  phase: TemplatedRequestPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const message = extractTemplatedErrorMessage(payload) ?? response.statusText ?? "templated request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && response.status === 401) {
    return new ProviderRequestError(400, message);
  }
  if (notFoundAsInvalidInput && response.status === 404) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

function extractTemplatedErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail))
    : undefined;
}

function readCollection(payload: unknown, entityName: string): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => requiredProviderRecord(item, entityName));
  }
  const record = requiredProviderRecord(payload, entityName);
  const data = record.data;
  if (Array.isArray(data)) {
    return data.map((item) => requiredProviderRecord(item, entityName));
  }
  const pluralEntity = `${entityName}s`;
  const pluralData = record[pluralEntity];
  if (Array.isArray(pluralData)) {
    return pluralData.map((item) => requiredProviderRecord(item, entityName));
  }
  throw new ProviderRequestError(502, `templated returned an unexpected ${pluralEntity} payload`);
}

function readRenderCreatePayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => requiredProviderRecord(item, "render"));
  }
  const record = requiredProviderRecord(payload, "render");
  if (Array.isArray(record.data)) {
    return record.data.map((item) => requiredProviderRecord(item, "render"));
  }
  return [record];
}

function normalizeAccount(payload: unknown): Record<string, unknown> {
  const record = requiredProviderRecord(payload, "account");
  const user = optionalRecord(record.user);
  return compactObject({
    id: optionalString(record.id) ?? optionalString(user?.id),
    name: optionalString(record.name) ?? optionalString(user?.name),
    email: optionalString(record.email) ?? optionalString(user?.email),
    plan: nullableStringValue(record.plan),
    watermark: typeof record.watermark === "boolean" ? record.watermark : undefined,
    createdAt: nullableStringValue(record.createdAt),
  });
}

function normalizeTemplate(payload: unknown): Record<string, unknown> {
  const record = requiredProviderRecord(payload, "template");
  return compactObject({
    id: requiredResponseString(record.id, "template.id"),
    name: requiredResponseString(record.name, "template.name"),
    description: nullableStringValue(record.description),
    width: readNullableInteger(record.width),
    height: readNullableInteger(record.height),
    thumbnail: nullableStringValue(record.thumbnail),
    background: nullableStringValue(record.background),
    layersCount: readNullableInteger(record.layersCount),
    folderId: nullableStringValue(record.folderId),
    externalId: nullableStringValue(record.externalId),
    user: normalizeOptionalUser(record.user),
    layers: Array.isArray(record.layers) ? record.layers : undefined,
    pages: Array.isArray(record.pages) ? record.pages : undefined,
    tags: Array.isArray(record.tags) ? record.tags.filter((item) => typeof item === "string") : undefined,
  });
}

function normalizeRender(payload: unknown): Record<string, unknown> {
  const record = requiredProviderRecord(payload, "render");
  return compactObject({
    id: requiredResponseString(record.id, "render.id"),
    url: nullableStringValue(record.url),
    width: readNullableInteger(record.width),
    height: readNullableInteger(record.height),
    name: nullableStringValue(record.name),
    status: nullableStringValue(record.status),
    format: nullableStringValue(record.format),
    templateId: nullableStringValue(record.templateId),
    templateName: nullableStringValue(record.templateName),
    createdAt: nullableStringValue(record.createdAt),
    externalId: nullableStringValue(record.externalId),
  });
}

function normalizeOptionalUser(value: unknown): Record<string, unknown> | undefined {
  const user = optionalRecord(value);
  if (!user) {
    return undefined;
  }
  return compactObject({
    id: optionalString(user.id),
    name: optionalString(user.name),
  });
}

function requiredResponseString(value: unknown, fieldName: string): string {
  return requiredString(
    value,
    fieldName,
    () => new ProviderRequestError(502, `templated response is missing ${fieldName}`),
  );
}

function requiredProviderRecord(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, (message) => new ProviderRequestError(502, message));
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => requiredInputString(item, `${fieldName}[]`));
}

function readOptionalLayerOverrides(value: unknown): Record<string, Record<string, unknown>> | undefined {
  if (value == null) {
    return undefined;
  }
  const overrides = requiredProviderRecord(value, "layers");
  return Object.fromEntries(
    Object.entries(overrides).map(([layerName, layerValue]) => [
      layerName,
      requiredProviderRecord(layerValue, `layers.${layerName}`),
    ]),
  );
}

function nullableStringValue(value: unknown): string | null | undefined {
  return value === null ? null : optionalString(value);
}

function readNullableInteger(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}
