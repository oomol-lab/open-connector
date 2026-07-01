import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FidelApiActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "fidel_api";
const fidelApiBaseUrl = "https://api.fidel.uk/v1";
const fidelApiTimeoutMs = 30_000;

interface FidelApiResponse {
  payload: unknown;
  status: number;
  path: string;
}

interface FidelApiRequestSignal {
  signal: AbortSignal;
  cleanup: () => void;
}

type FidelApiRequestPhase = "validate" | "execute";
type FidelApiActionContext = ApiKeyProviderContext;
type FidelApiActionHandler = (input: Record<string, unknown>, context: FidelApiActionContext) => Promise<unknown>;

export const fidelApiActionHandlers: Record<FidelApiActionName, FidelApiActionHandler> = {
  async list_brands(input, context): Promise<unknown> {
    return normalizeBrandListResponse(
      await requestFidelJson({
        apiKey: context.apiKey,
        path: "/brands",
        query: compactObject({
          limit: readOptionalPositiveInteger(input.limit, "limit"),
          start: optionalString(input.start),
          order: optionalString(input.order),
          name: optionalString(input.name),
        }),
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
  },
  async get_brand(input, context): Promise<unknown> {
    return normalizeBrandResponse(
      await requestFidelJson({
        apiKey: context.apiKey,
        path: `/brands/${encodeURIComponent(readRequiredActionString(input.brandId, "brandId"))}`,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
  },
  async list_cards(input, context): Promise<unknown> {
    return normalizeCardListResponse(
      await requestFidelJson({
        apiKey: context.apiKey,
        path: `/programs/${encodeURIComponent(readRequiredActionString(input.programId, "programId"))}/cards`,
        query: compactObject({
          limit: readOptionalPositiveInteger(input.limit, "limit"),
          start: optionalString(input.start),
          order: optionalString(input.order),
        }),
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
  },
  async get_card(input, context): Promise<unknown> {
    return normalizeCardResponse(
      await requestFidelJson({
        apiKey: context.apiKey,
        path: `/cards/${encodeURIComponent(readRequiredActionString(input.cardId, "cardId"))}`,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
  },
  async list_transactions(input, context): Promise<unknown> {
    return normalizeTransactionListResponse(
      await requestFidelJson({
        apiKey: context.apiKey,
        path: `/programs/${encodeURIComponent(readRequiredActionString(input.programId, "programId"))}/transactions`,
        query: compactObject({
          limit: readOptionalPositiveInteger(input.limit, "limit"),
          start: optionalString(input.start),
          order: optionalString(input.order),
          from: optionalString(input.from),
          to: optionalString(input.to),
        }),
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
  },
  async get_transaction(input, context): Promise<unknown> {
    return normalizeTransactionResponse(
      await requestFidelJson({
        apiKey: context.apiKey,
        path: `/transactions/${encodeURIComponent(readRequiredActionString(input.transactionId, "transactionId"))}`,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fidelApiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const brandList = normalizeBrandListResponse(
      await requestFidelJson({
        apiKey: input.apiKey,
        path: "/brands",
        query: { limit: 1 },
        fetcher,
        signal,
        phase: "validate",
      }),
    );

    return {
      profile: {
        accountId: optionalString(brandList.brands[0]?.accountId) ?? "api_key",
        displayName: optionalString(brandList.brands[0]?.name) ?? "Fidel API Secret Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: fidelApiBaseUrl,
        validationEndpoint: "/brands",
        brandCount: brandList.count,
        firstBrandId: optionalString(brandList.brands[0]?.id),
      }),
    };
  },
};

async function requestFidelJson(input: {
  apiKey: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  fetcher: typeof fetch;
  phase: FidelApiRequestPhase;
  signal?: AbortSignal;
}): Promise<FidelApiResponse> {
  const requestSignal = createFidelRequestSignal(input.signal);
  try {
    const response = await input.fetcher(buildFidelUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "Fidel-Key": input.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: requestSignal.signal,
    });
    const payload = await readFidelPayload(response);

    if (!response.ok) {
      throw createFidelError(response.status, payload, input.phase);
    }

    return {
      payload,
      status: response.status,
      path: input.path,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "fidel_api request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `fidel_api request failed: ${error.message}` : "fidel_api request failed",
    );
  } finally {
    requestSignal.cleanup();
  }
}

function buildFidelUrl(path: string, query?: Record<string, string | number | undefined>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${fidelApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readFidelPayload(response: Response): Promise<unknown> {
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

function createFidelError(status: number, payload: unknown, phase: FidelApiRequestPhase): ProviderRequestError {
  const message = extractFidelErrorMessage(payload) ?? "Fidel API request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractFidelErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = tryParseJson(trimmed);
    return parsed === undefined ? trimmed : (extractFidelErrorMessage(parsed) ?? trimmed);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const body = optionalString(record.body);
  if (body) {
    const nestedMessage = extractFidelErrorMessage(tryParseJson(body));
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  const error = optionalRecord(record.error);
  return (
    optionalString(error?.message) ??
    optionalString(error?.detail) ??
    optionalString(error?.title) ??
    optionalString(record.message) ??
    optionalString(record.detail) ??
    optionalString(record.title)
  );
}

function normalizeBrandListResponse(response: FidelApiResponse): {
  count: number;
  brands: Array<Record<string, unknown>>;
  nextCursor: string | null;
  resource: string;
  status: number;
  executionMs: number | null;
} {
  const envelope = requireFidelEnvelope(response.payload);
  const items = readEnvelopeItems(envelope).map((item) => normalizeBrand(item));
  return {
    count: readEnvelopeCount(envelope, items.length),
    brands: items,
    nextCursor: normalizeNextCursor(envelope.last),
    resource: readEnvelopeResource(envelope, response.path),
    status: readEnvelopeStatus(envelope, response.status),
    executionMs: readEnvelopeExecutionMs(envelope),
  };
}

function normalizeBrandResponse(response: FidelApiResponse): Record<string, unknown> {
  const envelope = requireFidelEnvelope(response.payload);
  return {
    brand: normalizeSingleItem(envelope, "brand", normalizeBrand),
    resource: readEnvelopeResource(envelope, response.path),
    status: readEnvelopeStatus(envelope, response.status),
    executionMs: readEnvelopeExecutionMs(envelope),
  };
}

function normalizeCardListResponse(response: FidelApiResponse): Record<string, unknown> {
  const envelope = requireFidelEnvelope(response.payload);
  const items = readEnvelopeItems(envelope).map((item) => normalizeCard(item));
  return {
    count: readEnvelopeCount(envelope, items.length),
    cards: items,
    nextCursor: normalizeNextCursor(envelope.last),
    resource: readEnvelopeResource(envelope, response.path),
    status: readEnvelopeStatus(envelope, response.status),
    executionMs: readEnvelopeExecutionMs(envelope),
  };
}

function normalizeCardResponse(response: FidelApiResponse): Record<string, unknown> {
  const envelope = requireFidelEnvelope(response.payload);
  return {
    card: normalizeSingleItem(envelope, "card", normalizeCard),
    resource: readEnvelopeResource(envelope, response.path),
    status: readEnvelopeStatus(envelope, response.status),
    executionMs: readEnvelopeExecutionMs(envelope),
  };
}

function normalizeTransactionListResponse(response: FidelApiResponse): Record<string, unknown> {
  const envelope = requireFidelEnvelope(response.payload);
  const items = readEnvelopeItems(envelope).map((item) => normalizeTransaction(item));
  return {
    count: readEnvelopeCount(envelope, items.length),
    transactions: items,
    nextCursor: normalizeNextCursor(envelope.last),
    resource: readEnvelopeResource(envelope, response.path),
    status: readEnvelopeStatus(envelope, response.status),
    executionMs: readEnvelopeExecutionMs(envelope),
  };
}

function normalizeTransactionResponse(response: FidelApiResponse): Record<string, unknown> {
  const envelope = requireFidelEnvelope(response.payload);
  return {
    transaction: normalizeSingleItem(envelope, "transaction", normalizeTransaction),
    resource: readEnvelopeResource(envelope, response.path),
    status: readEnvelopeStatus(envelope, response.status),
    executionMs: readEnvelopeExecutionMs(envelope),
  };
}

function normalizeBrand(value: unknown): Record<string, unknown> {
  const record = requireObjectRecord(value, "brand");
  return {
    id: readRequiredResponseString(record.id, "brand.id"),
    accountId: readNullableTrimmedString(record.accountId),
    created: readNullableTrimmedString(record.created),
    updated: readNullableTrimmedString(record.updated),
    name: readNullableTrimmedString(record.name),
    metadata: normalizeLooseObject(record.metadata),
    logoUrl: readNullableTrimmedString(record.logoUrl ?? record.logoURL),
    live: readNullableBoolean(record.live),
    consent: readNullableBoolean(record.consent),
    websiteUrl: readNullableTrimmedString(record.websiteUrl ?? record.websiteURL),
  };
}

function normalizeCard(value: unknown): Record<string, unknown> {
  const record = requireObjectRecord(value, "card");
  return {
    id: readRequiredResponseString(record.id, "card.id"),
    accountId: readNullableTrimmedString(record.accountId),
    countryCode: readNullableTrimmedString(record.countryCode),
    created: readNullableTrimmedString(record.created),
    expYear: readNullableInteger(record.expYear),
    expDate: readNullableTrimmedString(record.expDate),
    live: readNullableBoolean(record.live),
    lastNumbers: readNullableTrimmedString(record.lastNumbers),
    expMonth: readNullableInteger(record.expMonth),
    updated: readNullableTrimmedString(record.updated),
    programId: readNullableTrimmedString(record.programId),
    firstNumbers: readNullableTrimmedString(record.firstNumbers),
    scheme: readNullableTrimmedString(record.scheme),
    type: readNullableTrimmedString(record.type),
  };
}

function normalizeTransaction(value: unknown): Record<string, unknown> {
  const record = requireObjectRecord(value, "transaction");
  return {
    id: readRequiredResponseString(record.id, "transaction.id"),
    programId: readNullableTrimmedString(record.programId),
    accountId: readNullableTrimmedString(record.accountId),
    created: readNullableTrimmedString(record.created),
    updated: readNullableTrimmedString(record.updated),
    amount: readNullableNumber(record.amount),
    currency: readNullableTrimmedString(record.currency),
    authorizationCode: readNullableTrimmedString(record.approvalCode ?? record.authCode),
    auth: readNullableBoolean(record.auth),
    cleared: readNullableBoolean(record.cleared),
    wallet: normalizeLooseObject(record.wallet),
    offer: normalizeLooseObject(record.offer),
    datetime: readNullableTrimmedString(record.datetime),
    card: normalizeTransactionCard(record.card),
    location: normalizeTransactionLocation(record.location),
    brand: normalizeTransactionBrand(record.brand),
    identifiers: normalizeTransactionIdentifiers(record.identifiers),
    cardPresent: readNullableBoolean(record.cardPresent),
  };
}

function normalizeTransactionCard(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  return {
    id: readNullableTrimmedString(record?.id),
    firstNumbers: readNullableTrimmedString(record?.firstNumbers),
    lastNumbers: readNullableTrimmedString(record?.lastNumbers),
    scheme: readNullableTrimmedString(record?.scheme),
  };
}

function normalizeTransactionLocation(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  const geolocation = optionalRecord(record?.geolocation);
  return {
    id: readNullableTrimmedString(record?.id),
    address: readNullableTrimmedString(record?.address),
    city: readNullableTrimmedString(record?.city),
    countryCode: readNullableTrimmedString(record?.countryCode),
    geolocation:
      geolocation == null
        ? null
        : {
            latitude: readNullableNumber(geolocation.latitude),
            longitude: readNullableNumber(geolocation.longitude),
          },
    postcode: readNullableTrimmedString(record?.postcode),
    state: readNullableTrimmedString(record?.state),
    timezone: readNullableTrimmedString(record?.timezone),
    metadata: normalizeLooseObject(record?.metadata),
  };
}

function normalizeTransactionBrand(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  return {
    id: readNullableTrimmedString(record?.id),
    name: readNullableTrimmedString(record?.name),
    logoUrl: readNullableTrimmedString(record?.logoUrl ?? record?.logoURL),
    metadata: normalizeLooseObject(record?.metadata),
  };
}

function normalizeTransactionIdentifiers(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  return {
    amexApprovalCode: readNullableTrimmedString(record?.amexApprovalCode),
    mastercardAuthCode: readNullableTrimmedString(record?.mastercardAuthCode),
    mastercardRefNumber: readNullableTrimmedString(record?.mastercardRefNumber),
    mastercardTransactionSequenceNumber: readNullableTrimmedString(record?.mastercardTransactionSequenceNumber),
    mid: readNullableTrimmedString(record?.mid ?? record?.MID),
    visaAuthCode: readNullableTrimmedString(record?.visaAuthCode),
  };
}

function normalizeSingleItem<T>(envelope: Record<string, unknown>, label: string, normalize: (value: unknown) => T): T {
  const items = readEnvelopeItems(envelope);
  if (items.length === 0) {
    throw new ProviderRequestError(502, `fidel_api returned no ${label} items`);
  }
  return normalize(items[0]);
}

function requireFidelEnvelope(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "fidel_api returned invalid JSON");
  }
  return record;
}

function readEnvelopeItems(envelope: Record<string, unknown>): unknown[] {
  if (!Array.isArray(envelope.items)) {
    throw new ProviderRequestError(502, "fidel_api response did not include items");
  }
  return envelope.items;
}

function readEnvelopeCount(envelope: Record<string, unknown>, fallback: number): number {
  const count = optionalNumber(envelope.count);
  return typeof count === "number" && Number.isInteger(count) ? count : fallback;
}

function readEnvelopeResource(envelope: Record<string, unknown>, path: string): string {
  return optionalString(envelope.resource) ?? toV1ResourcePath(path);
}

function readEnvelopeStatus(envelope: Record<string, unknown>, fallbackStatus: number): number {
  const status = optionalNumber(envelope.status);
  return typeof status === "number" && Number.isInteger(status) ? status : fallbackStatus;
}

function readEnvelopeExecutionMs(envelope: Record<string, unknown>): number | null {
  return readNullableNumber(envelope.execution);
}

function normalizeNextCursor(value: unknown): string | null {
  const cursorString = optionalString(value);
  if (cursorString) {
    return cursorString;
  }
  const cursorObject = optionalRecord(value);
  return cursorObject ? JSON.stringify(cursorObject) : null;
}

function toV1ResourcePath(path: string): string {
  return path.startsWith("/v1/") ? path : `/v1${path.startsWith("/") ? path : `/${path}`}`;
}

function requireObjectRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `fidel_api returned invalid ${label}`);
  }
  return record;
}

function readRequiredResponseString(value: unknown, fieldName: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(502, `fidel_api response missing ${fieldName}`);
  }
  return resolved;
}

function readRequiredActionString(value: unknown, fieldName: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return resolved;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value;
}

function normalizeLooseObject(value: unknown): Record<string, unknown> | null {
  return optionalRecord(value) ?? null;
}

function readNullableTrimmedString(value: unknown): string | null {
  return optionalString(value) ?? null;
}

function readNullableBoolean(value: unknown): boolean | null {
  return optionalBoolean(value) ?? null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function readNullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function createFidelRequestSignal(parent?: AbortSignal): FidelApiRequestSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fidelApiTimeoutMs);
  const abortFromParent = (): void => controller.abort(parent?.reason);
  if (parent?.aborted) {
    controller.abort(parent.reason);
  } else {
    parent?.addEventListener("abort", abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
