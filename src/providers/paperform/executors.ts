import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalBoolean, optionalIntegerLike, optionalRawString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "paperform";
const paperformApiBaseUrl = "https://api.paperform.co/v1/";

type PaperformContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type PaperformActionHandler = (input: Record<string, unknown>, context: PaperformContext) => Promise<unknown>;
type PaperformRequestPhase = "validate" | "execute";

interface PaperformCollectionPage<T> {
  items: T[];
  info: {
    total: number | null;
    has_more: boolean | null;
    limit: number | null;
    skip: number | null;
  };
}

export const paperformActionHandlers: ProviderActionHandlers<"paperform", PaperformActionHandler> = {
  list_forms: listForms,
  get_form: getForm,
  list_form_fields: listFormFields,
  get_form_field: getFormField,
  list_form_submissions: listFormSubmissions,
  get_form_submission: getFormSubmission,
  get_submission: getSubmission,
  list_form_partial_submissions: listFormPartialSubmissions,
  get_form_partial_submission: getFormPartialSubmission,
  get_partial_submission: getPartialSubmission,
  list_form_products: listFormProducts,
  get_form_product: getFormProduct,
  list_form_coupons: listFormCoupons,
  get_form_coupon: getFormCoupon,
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, paperformActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestJson(buildPath("forms", { limit: 1 }), { apiKey: input.apiKey, fetcher, signal }, "validate");

    return {
      profile: {
        accountId: "paperform:api-key",
        displayName: "Paperform API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: paperformApiBaseUrl,
      },
    };
  },
};

async function listForms(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const payload = await requestJson(
    buildPath("forms", {
      search: optionalRawString(input.search),
      ...buildPaginationQuery(input),
    }),
    context,
    "execute",
  );
  const page = normalizeCollectionPage(payload, "forms", normalizeForm, "Paperform forms page");
  return {
    forms: page.items,
    page: page.info,
    raw: normalizeRawObject(payload),
  };
}

async function getForm(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const slugOrId = requiredString(input.slug_or_id, "slug_or_id", providerInputError);
  const payload = await requestJson(`forms/${encodeURIComponent(slugOrId)}`, context, "execute");
  return {
    form: normalizeForm(extractResultObject(payload, "form", "Paperform form")),
  };
}

async function listFormFields(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const slugOrId = requiredString(input.slug_or_id, "slug_or_id", providerInputError);
  const payload = await requestJson(
    buildPath(`forms/${encodeURIComponent(slugOrId)}/fields`, {
      search: optionalRawString(input.search),
    }),
    context,
    "execute",
  );
  return {
    fields: normalizeCollection(payload, "fields", normalizeField, "Paperform fields response"),
    raw: normalizeRawObject(payload),
  };
}

async function getFormField(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const slugOrId = requiredString(input.slug_or_id, "slug_or_id", providerInputError);
  const fieldKey = requiredString(input.field_key, "field_key", providerInputError);
  const payload = await requestJson(
    `forms/${encodeURIComponent(slugOrId)}/fields/${encodeURIComponent(fieldKey)}`,
    context,
    "execute",
  );
  return {
    field: normalizeField(extractResultObject(payload, "field", "Paperform field")),
  };
}

async function listFormSubmissions(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const slugOrId = requiredString(input.slug_or_id, "slug_or_id", providerInputError);
  const payload = await requestJson(
    buildPath(`forms/${encodeURIComponent(slugOrId)}/submissions`, buildPaginationQuery(input)),
    context,
    "execute",
  );
  const page = normalizeCollectionPage(payload, "submissions", normalizeSubmission, "Paperform submissions page");
  return {
    submissions: page.items,
    page: page.info,
    raw: normalizeRawObject(payload),
  };
}

async function getFormSubmission(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const slugOrId = requiredString(input.slug_or_id, "slug_or_id", providerInputError);
  const id = requiredString(input.id, "id", providerInputError);
  const payload = await requestJson(
    `forms/${encodeURIComponent(slugOrId)}/submissions/${encodeURIComponent(id)}`,
    context,
    "execute",
  );
  return {
    submission: normalizeSubmission(extractResultObject(payload, "submission", "Paperform submission")),
  };
}

async function getSubmission(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const id = requiredString(input.id, "id", providerInputError);
  const payload = await requestJson(`submissions/${encodeURIComponent(id)}`, context, "execute");
  return {
    submission: normalizeSubmission(extractResultObject(payload, "submission", "Paperform submission")),
  };
}

async function listFormPartialSubmissions(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const slugOrId = requiredString(input.slug_or_id, "slug_or_id", providerInputError);
  const payload = await requestJson(
    buildPath(`forms/${encodeURIComponent(slugOrId)}/partial-submissions`, buildPaginationQuery(input)),
    context,
    "execute",
  );
  const page = normalizeCollectionPage(
    payload,
    "partial-submissions",
    normalizePartialSubmission,
    "Paperform partial submissions page",
  );
  return {
    partial_submissions: page.items,
    page: page.info,
    raw: normalizeRawObject(payload),
  };
}

async function getFormPartialSubmission(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const slugOrId = requiredString(input.slug_or_id, "slug_or_id", providerInputError);
  const id = requiredString(input.id, "id", providerInputError);
  const payload = await requestJson(
    `forms/${encodeURIComponent(slugOrId)}/partial-submissions/${encodeURIComponent(id)}`,
    context,
    "execute",
  );
  return {
    partial_submission: normalizePartialSubmission(
      extractResultObject(payload, "partial-submission", "Paperform partial submission"),
    ),
  };
}

async function getPartialSubmission(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const id = requiredString(input.id, "id", providerInputError);
  const payload = await requestJson(`partial-submissions/${encodeURIComponent(id)}`, context, "execute");
  return {
    partial_submission: normalizePartialSubmission(
      extractResultObject(payload, "partial-submission", "Paperform partial submission"),
    ),
  };
}

async function listFormProducts(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const slugOrId = requiredString(input.slug_or_id, "slug_or_id", providerInputError);
  const payload = await requestJson(
    buildPath(`forms/${encodeURIComponent(slugOrId)}/products`, {
      search: optionalRawString(input.search),
    }),
    context,
    "execute",
  );
  return {
    products: normalizeCollection(payload, "products", normalizeProduct, "Paperform products response"),
    raw: normalizeRawObject(payload),
  };
}

async function getFormProduct(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const slugOrId = requiredString(input.slug_or_id, "slug_or_id", providerInputError);
  const productSku = requiredString(input.product_sku, "product_sku", providerInputError);
  const payload = await requestJson(
    `forms/${encodeURIComponent(slugOrId)}/products/${encodeURIComponent(productSku)}`,
    context,
    "execute",
  );
  return {
    product: normalizeProduct(extractFirstResultObject(payload, "products", "Paperform product")),
  };
}

async function listFormCoupons(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const slugOrId = requiredString(input.slug_or_id, "slug_or_id", providerInputError);
  const payload = await requestJson(`forms/${encodeURIComponent(slugOrId)}/coupons`, context, "execute");
  return {
    coupons: normalizeCollection(payload, "coupons", normalizeCoupon, "Paperform coupons response"),
    raw: normalizeRawObject(payload),
  };
}

async function getFormCoupon(input: Record<string, unknown>, context: PaperformContext): Promise<unknown> {
  const slugOrId = requiredString(input.slug_or_id, "slug_or_id", providerInputError);
  const code = requiredString(input.code, "code", providerInputError);
  const payload = await requestJson(
    `forms/${encodeURIComponent(slugOrId)}/coupons/${encodeURIComponent(code)}`,
    context,
    "execute",
  );
  return {
    coupon: normalizeCoupon(extractResultObject(payload, "coupon", "Paperform coupon")),
  };
}

async function requestJson(path: string, context: PaperformContext, phase: PaperformRequestPhase): Promise<unknown> {
  const response = await paperformFetch(path, context);
  const payload = await readPaperformPayload(response);
  if (!response.ok) {
    throw createPaperformError(response, payload, phase);
  }
  return payload;
}

async function paperformFetch(path: string, context: PaperformContext): Promise<Response> {
  const url = new URL(path, paperformApiBaseUrl);
  const timeout = createProviderTimeout(context.signal);
  try {
    return await context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        timeout.didTimeout() ? "Paperform request timed out" : "Paperform request aborted",
      );
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Paperform request failed: ${error.message}` : "Paperform request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPaperformPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Paperform returned malformed JSON");
    }
    return { message: text };
  }
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, unknown> {
  return removeUndefined({
    limit: optionalIntegerLike(input.limit, "limit", providerInputError),
    skip: optionalIntegerLike(input.skip, "skip", providerInputError),
    after_id: optionalRawString(input.after_id),
    before_id: optionalRawString(input.before_id),
    before_date: optionalRawString(input.before_date),
    after_date: optionalRawString(input.after_date),
    sort: optionalRawString(input.sort),
  });
}

function buildPath(path: string, query: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }
  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function normalizeCollectionPage<T>(
  payload: unknown,
  key: string,
  normalizeItem: (value: unknown) => T,
  label: string,
): PaperformCollectionPage<T> {
  const record = normalizeObject(payload, label);
  return {
    items: normalizeCollection(payload, key, normalizeItem, label),
    info: {
      total: asNullableInteger(record.total),
      has_more: asNullableBoolean(record.has_more),
      limit: asNullableInteger(record.limit),
      skip: asNullableInteger(record.skip),
    },
  };
}

function normalizeCollection<T>(
  payload: unknown,
  key: string,
  normalizeItem: (value: unknown) => T,
  label: string,
): T[] {
  const results = extractResults(payload, label);
  const items = results[key];
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map(normalizeItem);
}

function extractResultObject(payload: unknown, key: string, label: string): Record<string, unknown> {
  const results = extractResults(payload, label);
  return normalizeObject(results[key], label);
}

function extractFirstResultObject(payload: unknown, key: string, label: string): Record<string, unknown> {
  const results = extractResults(payload, label);
  const items = results[key];
  if (!Array.isArray(items) || items.length === 0) {
    throw new ProviderRequestError(502, `${label} response must include ${key}`);
  }
  return normalizeObject(items[0], label);
}

function extractResults(payload: unknown, label: string): Record<string, unknown> {
  const record = normalizeObject(payload, label);
  return normalizeObject(record.results, `${label} results`);
}

function normalizeForm(value: unknown): Record<string, unknown> {
  const record = normalizeObject(value, "Paperform form");
  return {
    ...record,
    id: asNullableString(record.id),
    slug: asNullableString(record.slug),
    custom_slug: asNullableString(record.custom_slug),
    title: asNullableString(record.title),
    description: asNullableString(record.description),
    url: asNullableString(record.url),
    live: asNullableBoolean(record.live),
    submission_count: asNullableInteger(record.submission_count),
    created_at_utc: asNullableString(record.created_at_utc),
    updated_at_utc: asNullableString(record.updated_at_utc),
    raw: record,
  };
}

function normalizeField(value: unknown): Record<string, unknown> {
  const record = normalizeObject(value, "Paperform field");
  return {
    ...record,
    key: asNullableString(record.key),
    title: asNullableString(record.title),
    description: asNullableString(record.description),
    type: asNullableString(record.type),
    required: asNullableBoolean(record.required),
    custom_key: asNullableString(record.custom_key),
    placeholder: asNullableString(record.placeholder),
    raw: record,
  };
}

function normalizeSubmission(value: unknown): Record<string, unknown> {
  const record = normalizeObject(value, "Paperform submission");
  return {
    ...record,
    id: asNullableString(record.id),
    form_id: asNullableString(record.form_id),
    data: normalizeLooseObject(record.data),
    created_at: asNullableString(record.created_at),
    created_at_utc: asNullableString(record.created_at_utc),
    account_timezone: asNullableString(record.account_timezone),
    raw: record,
  };
}

function normalizePartialSubmission(value: unknown): Record<string, unknown> {
  const record = normalizeObject(value, "Paperform partial submission");
  return {
    ...record,
    id: asNullableString(record.id),
    form_id: asNullableString(record.form_id),
    data: normalizeLooseObject(record.data),
    last_answered: asNullableString(record.last_answered),
    submitted_at: asNullableString(record.submitted_at),
    updated_at: asNullableString(record.updated_at),
    created_at: asNullableString(record.created_at),
    submitted_at_utc: asNullableString(record.submitted_at_utc),
    created_at_utc: asNullableString(record.created_at_utc),
    updated_at_utc: asNullableString(record.updated_at_utc),
    account_timezone: asNullableString(record.account_timezone),
    raw: record,
  };
}

function normalizeProduct(value: unknown): Record<string, unknown> {
  const record = normalizeObject(value, "Paperform product");
  return {
    ...record,
    SKU: asNullableString(record.SKU),
    name: asNullableString(record.name),
    quantity: asNullableNumber(record.quantity),
    price: asNullableNumber(record.price),
    minimum: asNullableNumber(record.minimum),
    maximum: asNullableNumber(record.maximum),
    discountable: asNullableBoolean(record.discountable),
    raw: record,
  };
}

function normalizeCoupon(value: unknown): Record<string, unknown> {
  const record = normalizeObject(value, "Paperform coupon");
  return {
    ...record,
    code: asNullableString(record.code),
    enabled: asNullableBoolean(record.enabled),
    target: asNullableString(record.target),
    discountAmount: asNullableNumber(record.discountAmount),
    discountPercentage: asNullableNumber(record.discountPercentage),
    expiresAt: asNullableString(record.expiresAt),
    raw: record,
  };
}

function normalizeObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} response must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalizeLooseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeRawObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { results: value };
}

function asNullableString(value: unknown): string | null {
  return value === undefined ? null : (optionalRawString(value) ?? null);
}

function asNullableBoolean(value: unknown): boolean | null {
  return value === undefined ? null : (optionalBoolean(value) ?? null);
}

function asNullableInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function asNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createPaperformError(
  response: Response,
  payload: unknown,
  phase: PaperformRequestPhase,
): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Paperform request failed with ${response.status}`;
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const message = record.message ?? record.error ?? record.detail;
  if (typeof message === "string") {
    return message;
  }
  if (Array.isArray(record.details)) {
    return record.details.map((item) => String(item)).join("; ");
  }
  return undefined;
}

function removeUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
