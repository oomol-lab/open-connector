import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "crunchbase";
const crunchbaseApiBaseUrl = "https://api.crunchbase.com/v4";

type CrunchbasePhase = "validate" | "execute";
type CrunchbaseActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const crunchbaseActionHandlers: ProviderActionHandlers<"crunchbase", CrunchbaseActionHandler> = {
  async autocomplete_entities(input, context) {
    const payload = await requestCrunchbaseJson({
      context,
      path: "/data/autocompletes",
      phase: "execute",
      query: compactObject({
        query: input.query,
        collection_ids: joinStringArray(input.collectionIds),
        limit: typeof input.limit === "number" ? input.limit : undefined,
      }),
    });
    const record = requireRecord(payload, "Crunchbase returned invalid autocomplete payload");
    return {
      entities: requireArray(record.entities, "Crunchbase returned invalid autocomplete entities"),
      raw: record,
    };
  },
  async get_organization(input, context) {
    const entityId = requiredString(input.entityId, "entityId", providerInputError);
    const payload = await requestCrunchbaseJson({
      context,
      path: `/data/entities/organizations/${encodeURIComponent(entityId)}`,
      phase: "execute",
      query: compactObject({
        field_ids: joinStringArray(input.fieldIds),
        card_ids: joinStringArray(input.cardIds),
      }),
    });
    const record = requireRecord(payload, "Crunchbase returned invalid organization payload");
    return { organization: record, raw: record };
  },
  async search_organizations(input, context) {
    const payload = await requestCrunchbaseJson({
      context,
      method: "POST",
      path: "/data/searches/organizations",
      phase: "execute",
      body: compactObject({
        field_ids: Array.isArray(input.fieldIds) ? input.fieldIds : undefined,
        query: Array.isArray(input.query) ? input.query : undefined,
        order: Array.isArray(input.order) ? input.order : undefined,
        limit: typeof input.limit === "number" ? input.limit : undefined,
        after_id: optionalString(input.afterId),
      }),
    });
    const record = requireRecord(payload, "Crunchbase returned invalid organization search payload");
    return {
      count: requireInteger(record.count, "Crunchbase returned invalid organization search count"),
      entities: requireArray(record.entities, "Crunchbase returned invalid organization search entities"),
      raw: record,
    };
  },
  async search_acquisitions(input, context) {
    assertSingleCursor(input);
    const payload = await requestCrunchbaseJson({
      context,
      method: "POST",
      path: "/data/searches/acquisitions",
      phase: "execute",
      body: compactObject({
        field_ids: input.fieldIds,
        query: input.query,
        order: input.order,
        limit: input.limit,
        after_id: input.afterId,
        before_id: input.beforeId,
      }),
    });
    const record = requireRecord(payload, "Crunchbase returned invalid acquisition search payload");
    return {
      count: requireInteger(record.count, "Crunchbase returned invalid acquisition search count"),
      entities: requireArray(record.entities, "Crunchbase returned invalid acquisition search entities"),
      raw: record,
    };
  },
  async get_acquisition(input, context) {
    const entityId = requiredString(input.entityId, "entityId", providerInputError);
    const payload = await requestCrunchbaseJson({
      context,
      path: `/data/entities/acquisitions/${encodeURIComponent(entityId)}`,
      phase: "execute",
      query: compactObject({ field_ids: joinStringArray(input.fieldIds), card_ids: joinStringArray(input.cardIds) }),
    });
    const record = requireRecord(payload, "Crunchbase returned invalid acquisition payload");
    return { acquisition: record, raw: record };
  },
  async get_organization_acquisitions(input, context) {
    const relationship = requiredString(input.relationship, "relationship", providerInputError);
    const cardId = relationship === "acquiree" ? "acquiree_acquisitions" : "acquirer_acquisitions";
    const record = await requestOrganizationCard(input, context, cardId);
    return { acquisitions: requireOrganizationCardItems(record, cardId), raw: record };
  },
  async get_organization_ipos(input, context) {
    const cardId = "ipos";
    const record = await requestOrganizationCard(input, context, cardId);
    return { ipos: requireOrganizationCardItems(record, cardId), raw: record };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, crunchbaseActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestCrunchbaseJson({
      context: { apiKey: input.apiKey, fetcher, signal },
      path: "/data/autocompletes",
      phase: "validate",
      query: { query: "crunchbase", collection_ids: "organizations", limit: 1 },
    });
    return {
      profile: {
        accountId: "crunchbase",
        displayName: "Crunchbase API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: crunchbaseApiBaseUrl,
        validationEndpoint: "/data/autocompletes",
      },
    };
  },
};

async function requestCrunchbaseJson(input: {
  context: ApiKeyProviderContext;
  path: string;
  phase: CrunchbasePhase;
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(input.path.replace(/^\/+/, ""), `${crunchbaseApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url, key, value);
  }

  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: {
        "X-cb-user-key": input.context.apiKey,
        accept: "application/json",
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      signal: timeout.signal,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    const payload = await readCrunchbasePayload(response, response.ok);
    if (!response.ok) {
      throw createCrunchbaseError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "crunchbase request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `crunchbase request failed: ${error.message}` : "crunchbase request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readCrunchbasePayload(response: Response, requireJson: boolean): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    if (requireJson) throw new ProviderRequestError(502, "Crunchbase returned empty response");
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (requireJson) throw new ProviderRequestError(502, "Crunchbase returned invalid JSON");
    return { message: text };
  }
}

function createCrunchbaseError(status: number, payload: unknown, phase: CrunchbasePhase): ProviderRequestError {
  const message = readCrunchbaseErrorMessage(payload) ?? `Crunchbase request failed with ${status}`;
  if (phase === "validate" && (status === 401 || status === 403))
    return new ProviderRequestError(400, message, payload);
  if (status === 400 || status === 404) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(
    status === 401 || status === 403 ? 401 : status === 429 ? 429 : 502,
    message,
    payload,
  );
}

function readCrunchbaseErrorMessage(payload: unknown): string | undefined {
  if (Array.isArray(payload)) {
    return optionalString(requiredRecord(payload[0], "error", () => new ProviderRequestError(502, "ignored")).message);
  }
  const record =
    typeof payload === "object" && payload != null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : undefined;
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.value);
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  url.searchParams.set(key, Array.isArray(value) ? value.map((item) => String(item)).join(",") : String(value));
}

function joinStringArray(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map((item) => String(item)).join(",") : undefined;
}

async function requestOrganizationCard(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  cardId: string,
): Promise<Record<string, unknown>> {
  assertSingleCursor(input);
  const organizationId = requiredString(input.organizationId, "organizationId", providerInputError);
  const payload = await requestCrunchbaseJson({
    context,
    path: `/data/entities/organizations/${encodeURIComponent(organizationId)}/cards/${cardId}`,
    phase: "execute",
    query: compactObject({
      card_field_ids: joinStringArray(input.cardFieldIds),
      after_id: optionalString(input.afterId),
      before_id: optionalString(input.beforeId),
      order: optionalString(input.order),
      limit: input.limit,
    }),
  });
  return requireRecord(payload, "Crunchbase returned invalid organization card payload");
}

function requireOrganizationCardItems(record: Record<string, unknown>, cardId: string): unknown[] {
  const cards = requireRecord(record.cards, "Crunchbase returned invalid organization cards");
  return requireArray(cards[cardId], `Crunchbase returned invalid ${cardId} card`);
}

function assertSingleCursor(input: Record<string, unknown>): void {
  if (input.afterId !== undefined && input.beforeId !== undefined)
    throw new ProviderRequestError(400, "afterId and beforeId cannot be used together");
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  return requiredRecord(value, "payload", () => new ProviderRequestError(502, message));
}

function requireArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, message);
  return value;
}

function requireInteger(value: unknown, message: string): number {
  if (!Number.isInteger(value)) throw new ProviderRequestError(502, message);
  return value as number;
}
