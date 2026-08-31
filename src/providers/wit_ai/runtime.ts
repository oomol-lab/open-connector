import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  looseArray,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  pickOptionalInteger,
  pickOptionalString,
  recordOrEmpty,
  requiredRecord,
  stringArray,
} from "../../core/cast.ts";
import { providerInputError, ProviderRequestError } from "../provider-runtime.ts";

export const witAiApiBaseUrl = "https://api.wit.ai";
export const witAiApiVersion = "20230215";

type QueryPrimitive = string | number | boolean;
type QueryValue = QueryPrimitive | null | undefined | QueryPrimitive[];
type WitAiRequestPhase = "validate" | "execute";
type WitAiActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface WitAiRequestInput {
  method?: string;
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
}

interface NormalizedUtteranceIntent {
  id: string;
  name: string;
}

interface NormalizedUtteranceEntity {
  entity: string;
  start: number;
  end: number;
  body: string;
  entities: NormalizedUtteranceEntity[];
}

interface NormalizedUtteranceTrait {
  trait: string;
  value: string;
}

export const witAiActionHandlers: ProviderActionHandlers<"wit_ai", WitAiActionHandler> = {
  analyze_message(input, context) {
    return analyzeMessage(input, context);
  },
  detect_language(input, context) {
    return detectLanguage(input, context);
  },
  list_apps(input, context) {
    return listApps(input, context);
  },
  get_app(input, context) {
    return getApp(input, context);
  },
  list_intents(input, context) {
    return listIntents(input, context);
  },
  create_intent(input, context) {
    return createIntent(input, context);
  },
  get_intent(input, context) {
    return getIntent(input, context);
  },
  list_entities(_input, context) {
    return listEntities(context);
  },
  create_entity(input, context) {
    return createEntity(input, context);
  },
  get_entity(input, context) {
    return getEntity(input, context);
  },
  update_entity(input, context) {
    return updateEntity(input, context);
  },
  add_entity_keyword(input, context) {
    return addEntityKeyword(input, context);
  },
  add_keyword_synonym(input, context) {
    return addKeywordSynonym(input, context);
  },
  list_traits(_input, context) {
    return listTraits(context);
  },
  create_trait(input, context) {
    return createTrait(input, context);
  },
  get_trait(input, context) {
    return getTrait(input, context);
  },
  add_trait_value(input, context) {
    return addTraitValue(input, context);
  },
  list_utterances(input, context) {
    return listUtterances(input, context);
  },
  create_utterances(input, context) {
    return createUtterances(input, context);
  },
  delete_utterances(input, context) {
    return deleteUtterances(input, context);
  },
};

export async function validateWitAiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await witAiRequest<unknown[]>(
    { apiKey, fetcher, signal },
    {
      path: "/apps",
      query: { limit: 1 },
    },
    "validate",
  );
  const apps = Array.isArray(payload) ? payload.map(normalizeAppSummary) : [];
  const primary = apps[0];
  if (!primary) {
    return {
      profile: {
        accountId: "wit-ai-token",
        displayName: "Wit.ai API Token",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/apps",
        appCount: 0,
      },
    };
  }
  return {
    profile: {
      accountId: primary.id,
      displayName: primary.name,
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/apps",
      appId: primary.id,
      appName: primary.name,
      appCount: apps.length,
      isAppForToken: primary.isAppForToken,
    }),
  };
}

async function analyzeMessage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const text = requireStringInput(input, "text");
  const topN = requireOptionalTopN(input);
  const tag = optionalString(input.tag);
  const contextObject = optionalRecord(input.context);
  const dynamicEntities = optionalRecord(input.dynamicEntities);
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    path: "/message",
    query: compactObject({
      q: text,
      n: topN,
      tag,
      context: contextObject ? JSON.stringify(contextObject) : undefined,
      entities: dynamicEntities ? JSON.stringify(dynamicEntities) : undefined,
    }),
  });
  return normalizeMessageResult(payload);
}

async function detectLanguage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    path: "/language",
    query: compactObject({
      q: requireStringInput(input, "text"),
      n: requireOptionalTopN(input),
    }),
  });
  const record = recordOrEmpty(payload);
  return {
    detectedLocales: looseArray(record.detected_locales).map((item) => {
      const locale = recordOrEmpty(item);
      return {
        locale: requiredResponseString(locale.locale, "locale"),
        confidence: requiredResponseNumber(locale.confidence, "confidence"),
      };
    }),
  };
}

async function listApps(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<unknown[]>(context, {
    path: "/apps",
    query: compactObject({
      limit: requirePositiveInteger(input.limit, "limit"),
      offset: requireOptionalNonNegativeInteger(input.offset, "offset"),
    }),
  });
  return { apps: looseArray(payload).map((item) => normalizeAppSummary(item)) };
}

async function getApp(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    path: `/apps/${encodeURIComponent(requireStringInput(input, "appId"))}`,
  });
  return normalizeAppDetail(payload);
}

async function listIntents(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<unknown[]>(context, {
    path: "/intents",
    query: compactObject({
      limit: requireOptionalPositiveIntegerWithMax(input.limit, "limit", 200),
      offset: requireOptionalNonNegativeInteger(input.offset, "offset"),
    }),
  });
  return { intents: looseArray(payload).map((item) => normalizeIntentSummary(item)) };
}

async function createIntent(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    method: "POST",
    path: "/intents",
    body: { name: requireStringInput(input, "name") },
  });
  return normalizeIntentSummary(payload);
}

async function getIntent(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    path: `/intents/${encodeURIComponent(requireStringInput(input, "intentName"))}`,
  });
  const record = recordOrEmpty(payload);
  return {
    id: requiredResponseString(record.id, "id"),
    name: requiredResponseString(record.name, "name"),
    entities: looseArray(record.entities).map((item) => {
      const entity = recordOrEmpty(item);
      return {
        id: requiredResponseString(entity.id, "id"),
        name: requiredResponseString(entity.name, "name"),
      };
    }),
  };
}

async function listEntities(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<unknown[]>(context, { path: "/entities" });
  return { entities: looseArray(payload).map((item) => normalizeEntitySummary(item)) };
}

async function createEntity(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    method: "POST",
    path: "/entities",
    body: buildEntityMutationBody(input),
  });
  return normalizeEntityDetail(payload);
}

async function getEntity(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    path: `/entities/${encodeURIComponent(requireStringInput(input, "entityName"))}`,
  });
  return normalizeEntityDetail(payload);
}

async function updateEntity(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    method: "PUT",
    path: `/entities/${encodeURIComponent(requireStringInput(input, "entityName"))}`,
    body: buildEntityMutationBody(input),
  });
  return normalizeEntityDetail(payload);
}

async function addEntityKeyword(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    method: "POST",
    path: `/entities/${encodeURIComponent(requireStringInput(input, "entityName"))}/keywords`,
    body: compactObject({
      keyword: requireStringInput(input, "keyword"),
      synonyms: readOptionalStringArray(input.synonyms),
    }),
  });
  return normalizeEntityDetail(payload);
}

async function addKeywordSynonym(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    method: "POST",
    path: `/entities/${encodeURIComponent(requireStringInput(input, "entityName"))}/keywords/${encodeURIComponent(
      requireStringInput(input, "keyword"),
    )}/synonyms`,
    body: { synonym: requireStringInput(input, "synonym") },
  });
  return normalizeQueueMutation(payload);
}

async function listTraits(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<unknown[]>(context, { path: "/traits" });
  return { traits: looseArray(payload).map((item) => normalizeTraitSummary(item)) };
}

async function createTrait(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    method: "POST",
    path: "/traits",
    body: buildTraitMutationBody(input),
  });
  return normalizeTraitDetail(payload);
}

async function getTrait(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    path: `/traits/${encodeURIComponent(requireStringInput(input, "traitName"))}`,
  });
  return normalizeTraitDetail(payload);
}

async function addTraitValue(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    method: "POST",
    path: `/traits/${encodeURIComponent(requireStringInput(input, "traitName"))}/values`,
    body: { value: requireStringInput(input, "value") },
  });
  return normalizeTraitDetail(payload);
}

async function listUtterances(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<unknown[]>(context, {
    path: "/utterances",
    query: compactObject({
      limit: requirePositiveInteger(input.limit, "limit"),
      offset: requireOptionalNonNegativeInteger(input.offset, "offset"),
      intents: readOptionalStringArray(input.intents),
      traits: readOptionalStringArray(input.traits),
      entities: readOptionalStringArray(input.entities),
    }),
  });
  return { utterances: looseArray(payload).map((item) => normalizeUtterance(item)) };
}

async function createUtterances(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    method: "POST",
    path: "/utterances",
    body: objectArray(input.utterances, "utterances", providerInputError),
  });
  return normalizeQueueMutation(payload);
}

async function deleteUtterances(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await witAiRequest<Record<string, unknown>>(context, {
    method: "DELETE",
    path: "/utterances",
    body: objectArray(input.utterances, "utterances", providerInputError),
  });
  return normalizeQueueMutation(payload);
}

async function witAiRequest<T>(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  input: WitAiRequestInput,
  phase: WitAiRequestPhase = "execute",
): Promise<T> {
  const url = new URL(input.path, witAiApiBaseUrl);
  url.searchParams.set("v", witAiApiVersion);
  appendQueryParams(url, input.query);

  let response: Response;
  let payload: unknown;
  try {
    const headers = new Headers({ authorization: `Bearer ${context.apiKey}` });
    if (input.body !== undefined) headers.set("content-type", "application/json");
    response = await context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: context.signal,
    });
    payload = await readWitAiPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Wit.ai request failed: ${error.message}` : "Wit.ai request failed",
    );
  }
  if (!response.ok) throw createWitAiError(response, payload, phase);
  return payload as T;
}

function appendQueryParams(url: URL, query: Record<string, QueryValue> | undefined): void {
  if (!query) return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

async function readWitAiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createWitAiError(response: Response, payload: unknown, phase: WitAiRequestPhase): ProviderRequestError {
  const message = extractWitAiErrorMessage(payload) ?? response.statusText ?? "Wit.ai request failed";
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (response.status === 400 || response.status === 404) return new ProviderRequestError(400, message, payload);
  if (phase === "validate" && response.status === 401) return new ProviderRequestError(400, message, payload);
  if (phase === "execute" && response.status === 401) return new ProviderRequestError(409, message, payload);
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractWitAiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.code);
}

function buildEntityMutationBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: requireStringInput(input, "name"),
    roles: readRequiredStringArray(input.roles, "roles"),
    lookups: readOptionalStringArray(input.lookups),
    keywords: readOptionalEntityKeywords(input.keywords),
  });
}

function buildTraitMutationBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: requireStringInput(input, "name"),
    values: readRequiredTraitValues(input.values),
    lookups: readOptionalStringArray(input.lookups),
    mutually_exclusive: optionalBoolean(input.mutuallyExclusive),
  });
}

function normalizeMessageResult(payload: unknown): Record<string, unknown> {
  const record = recordOrEmpty(payload);
  return {
    text: requiredResponseString(record.text, "text"),
    messageId: optionalString(record.msg_id) ?? null,
    intents: looseArray(record.intents).map((item) => {
      const intent = recordOrEmpty(item);
      return compactObject({
        id: requiredResponseString(intent.id, "id"),
        name: requiredResponseString(intent.name, "name"),
        confidence: optionalNumber(intent.confidence),
      });
    }),
    entities: normalizeNamedArrayMap(record.entities, normalizeMessageEntity),
    traits: normalizeNamedArrayMap(record.traits, normalizeTraitMatch),
  };
}

function normalizeMessageEntity(value: unknown): Record<string, unknown> {
  const record = recordOrEmpty(value);
  return compactObject({
    id: requiredResponseString(record.id, "id"),
    name: optionalString(record.name),
    role: optionalString(record.role),
    body: optionalString(record.body),
    start: optionalInteger(record.start),
    end: optionalInteger(record.end),
    confidence: optionalNumber(record.confidence),
    value: record.value,
    type: optionalString(record.type),
    entities: optionalRecord(record.entities),
  });
}

function normalizeTraitMatch(value: unknown): Record<string, unknown> {
  const record = recordOrEmpty(value);
  return compactObject({
    id: requiredResponseString(record.id, "id"),
    value: requiredResponseString(record.value, "value"),
    confidence: optionalNumber(record.confidence),
  });
}

function normalizeAppSummary(
  value: unknown,
): Record<string, unknown> & { id: string; name: string; isAppForToken?: boolean } {
  const record = recordOrEmpty(value);
  return compactObject({
    id: requiredResponseString(record.id, "id"),
    name: requiredResponseString(record.name, "name"),
    lang: requiredResponseString(record.lang, "lang"),
    private: requiredResponseBoolean(record.private, "private"),
    createdAt: requiredResponseString(record.created_at, "created_at"),
    isAppForToken: optionalBoolean(record.is_app_for_token),
  }) as Record<string, unknown> & { id: string; name: string; isAppForToken?: boolean };
}

function normalizeAppDetail(value: unknown): Record<string, unknown> {
  const record = recordOrEmpty(value);
  return compactObject({
    ...normalizeAppSummary(record),
    willTrainAt: optionalString(record.will_train_at),
    lastTrainedAt: optionalString(record.last_trained_at),
    lastTrainingDurationSecs: optionalInteger(record.last_training_duration_secs),
    trainingStatus: optionalString(record.training_status),
  });
}

function normalizeIntentSummary(value: unknown): Record<string, unknown> {
  const record = recordOrEmpty(value);
  return {
    id: requiredResponseString(record.id, "id"),
    name: requiredResponseString(record.name, "name"),
  };
}

function normalizeEntitySummary(value: unknown): Record<string, unknown> {
  const record = recordOrEmpty(value);
  return {
    id: requiredResponseString(record.id, "id"),
    name: requiredResponseString(record.name, "name"),
  };
}

function normalizeEntityDetail(value: unknown): Record<string, unknown> {
  const record = recordOrEmpty(value);
  return compactObject({
    id: requiredResponseString(record.id, "id"),
    name: requiredResponseString(record.name, "name"),
    lookups: readResponseStringArray(record.lookups),
    roles: normalizeEntityRoles(record.roles),
    keywords: normalizeEntityKeywords(record.keywords),
    lang: optionalString(record.lang),
    builtin: optionalBoolean(record.builtin),
  });
}

function normalizeTraitSummary(value: unknown): Record<string, unknown> {
  const record = recordOrEmpty(value);
  return {
    id: requiredResponseString(record.id, "id"),
    name: requiredResponseString(record.name, "name"),
  };
}

function normalizeTraitDetail(value: unknown): Record<string, unknown> {
  const record = recordOrEmpty(value);
  return compactObject({
    id: requiredResponseString(record.id, "id"),
    name: requiredResponseString(record.name, "name"),
    values: looseArray(record.values).map((item) => normalizeTraitValue(item)),
    lang: optionalString(record.lang),
    lookups: readResponseStringArray(record.lookups),
    createdAt: optionalString(record.created_at),
    updatedAt: optionalString(record.updated_at),
    mutuallyExclusive: optionalBoolean(record.mutually_exclusive),
  });
}

function normalizeTraitValue(value: unknown): Record<string, unknown> {
  const record = recordOrEmpty(value);
  return compactObject({
    id: optionalString(record.id),
    value: requiredResponseString(record.value, "value"),
    metadata: optionalString(record.metadata),
    synonyms: readResponseStringArray(record.synonyms),
    expressions: readResponseStringArray(record.expressions),
  });
}

function normalizeUtterance(value: unknown): Record<string, unknown> {
  const record = recordOrEmpty(value);
  return {
    text: requiredResponseString(record.text, "text"),
    intent: normalizeOptionalUtteranceIntent(record.intent),
    entities: looseArray(record.entities).map((item) => normalizeUtteranceEntity(item)),
    traits: looseArray(record.traits).map((item) => normalizeUtteranceTrait(item)),
  };
}

function normalizeOptionalUtteranceIntent(value: unknown): NormalizedUtteranceIntent | undefined {
  if (!value) return undefined;
  const record = recordOrEmpty(value);
  return {
    id: requiredResponseString(record.id, "id"),
    name: requiredResponseString(record.name, "name"),
  };
}

function normalizeUtteranceEntity(value: unknown): NormalizedUtteranceEntity {
  const record = recordOrEmpty(value);
  return {
    entity: requiredResponseString(record.entity ?? record.name, "entity"),
    start: requiredResponseNumber(record.start, "start"),
    end: requiredResponseNumber(record.end, "end"),
    body: requiredResponseString(record.body, "body"),
    entities: looseArray(record.entities).map((item) => normalizeUtteranceEntity(item)),
  };
}

function normalizeUtteranceTrait(value: unknown): NormalizedUtteranceTrait {
  const record = recordOrEmpty(value);
  return {
    trait: requiredResponseString(record.trait ?? record.name, "trait"),
    value: requiredResponseString(record.value, "value"),
  };
}

function normalizeQueueMutation(value: unknown): Record<string, unknown> {
  const record = recordOrEmpty(value);
  return {
    sent: requiredResponseBoolean(record.sent, "sent"),
    count: requiredResponseNumber(record.n, "n"),
  };
}

function normalizeNamedArrayMap<T>(value: unknown, mapItem: (item: unknown) => T): Record<string, T[]> {
  const record = recordOrEmpty(value);
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, looseArray(child).map(mapItem)]));
}

function normalizeEntityRoles(value: unknown): string[] {
  return looseArray(value)
    .map((item) => {
      if (typeof item === "string") return item;
      const record = recordOrEmpty(item);
      return optionalString(record.name) ?? optionalString(record.id) ?? null;
    })
    .filter((item): item is string => item !== null);
}

function normalizeEntityKeywords(value: unknown): Array<Record<string, unknown>> {
  return looseArray(value).map((item) => {
    const record = recordOrEmpty(item);
    return {
      keyword: requiredResponseString(record.keyword, "keyword"),
      synonyms: readResponseStringArray(record.synonyms),
    };
  });
}

function readOptionalEntityKeywords(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => {
    const record = requiredRecord(item, "keywords", providerInputError);
    return compactObject({
      keyword: requireStringField(record, "keyword"),
      synonyms: readOptionalStringArray(record.synonyms),
    });
  });
}

function readRequiredTraitValues(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "values must be a non-empty array");
  }
  return value.map((item) => {
    if (typeof item === "string") return { value: item };
    const record = requiredRecord(item, "values", providerInputError);
    return compactObject({
      value: requireStringField(record, "value"),
      metadata: optionalString(record.metadata),
      expressions: readOptionalStringArray(record.expressions),
    });
  });
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return stringArray(value, "value", providerInputError);
}

function readRequiredStringArray(value: unknown, fieldName: string): string[] {
  const parsed = readOptionalStringArray(value);
  if (!parsed || parsed.length === 0) throw new ProviderRequestError(400, `${fieldName} must be a non-empty array`);
  return parsed;
}

function readResponseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function requireStringInput(input: Record<string, unknown>, ...keys: string[]): string {
  const value = pickOptionalString(input, ...keys);
  if (!value) throw new ProviderRequestError(400, `${keys[0]} is required`);
  return value;
}

function requireStringField(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) throw new ProviderRequestError(400, `${key} is required`);
  return value;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0)
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  return parsed;
}

function requireOptionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  const parsed = optionalInteger(value);
  if (parsed === undefined) return undefined;
  if (parsed < 0) throw new ProviderRequestError(400, `${fieldName} must be zero or greater`);
  return parsed;
}

function requireOptionalPositiveIntegerWithMax(value: unknown, fieldName: string, max: number): number | undefined {
  const parsed = optionalInteger(value);
  if (parsed === undefined) return undefined;
  if (parsed <= 0 || parsed > max) throw new ProviderRequestError(400, `${fieldName} must be between 1 and ${max}`);
  return parsed;
}

function requireOptionalTopN(input: Record<string, unknown>): number | undefined {
  const value = pickOptionalInteger(input, "topN");
  if (value === undefined) return undefined;
  if (value < 1 || value > 8) throw new ProviderRequestError(400, "topN must be between 1 and 8");
  return value;
}

function requiredResponseString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new ProviderRequestError(502, `Wit.ai response missing string field: ${fieldName}`);
  return parsed;
}

function requiredResponseNumber(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined) throw new ProviderRequestError(502, `Wit.ai response missing numeric field: ${fieldName}`);
  return parsed;
}

function requiredResponseBoolean(value: unknown, fieldName: string): boolean {
  const parsed = optionalBoolean(value);
  if (parsed === undefined) throw new ProviderRequestError(502, `Wit.ai response missing boolean field: ${fieldName}`);
  return parsed;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
