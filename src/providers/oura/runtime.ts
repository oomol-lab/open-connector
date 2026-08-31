import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidationResult } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { OuraDocumentCollection } from "./collections.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment, queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
} from "../provider-runtime.ts";
import {
  ouraApiBaseUrl,
  ouraDocumentCollections,
  ouraGrantedScopePrefix,
  ouraUserCollectionPath,
} from "./collections.ts";

const ouraPersonalInfoPath = `${ouraUserCollectionPath}/personal_info`;
const ouraRequestTimeoutMs = 30_000;

type OuraRequestPhase = "validate" | "execute";
type OuraActionHandler = ProviderRuntimeHandler<OAuthProviderContext>;

interface OuraRequestInput {
  accessToken: string;
  path: string;
  fetcher: ProviderFetch;
  phase: OuraRequestPhase;
  query?: Record<string, string>;
  /** Report a provider 404 as invalid input; used for document-ID lookups. */
  notFoundAsInvalidInput?: boolean;
  signal?: AbortSignal;
}

/**
 * Action handlers for every Oura collection action, keyed by provider-local
 * action name and derived from the same collection table the catalog uses.
 */
export const ouraActionHandlers: Record<string, OuraActionHandler> = buildOuraActionHandlers();

/**
 * Resolve the Oura account behind an access token, used to build the
 * `oauth2` credential validator's profile.
 */
export async function fetchOuraAccountProfile(
  accessToken: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const personalInfo = await requestOuraObject({
    accessToken,
    path: ouraPersonalInfoPath,
    fetcher,
    phase: "validate",
    signal,
  });
  const userId = requiredString(personalInfo.id, "id", providerResponseError);
  const email = optionalString(personalInfo.email);

  return {
    profile: {
      accountId: userId,
      displayName: email ?? `Oura user ${userId}`,
    },
    metadata: compactObject({
      apiBaseUrl: ouraApiBaseUrl,
      email,
      age: personalInfo.age,
      biologicalSex: optionalString(personalInfo.biological_sex),
    }),
  };
}

/** Space-separated OAuth scope string returned by the Oura token endpoint. */
export function parseOuraGrantedScopes(value: unknown): string[] {
  const scope = optionalString(value);
  if (!scope) {
    return [];
  }
  return scope
    .split(/\s+/)
    .filter(Boolean)
    .map((granted) =>
      granted.startsWith(ouraGrantedScopePrefix) ? granted.slice(ouraGrantedScopePrefix.length) : granted,
    );
}

function buildOuraActionHandlers(): Record<string, OuraActionHandler> {
  const handlers: Record<string, OuraActionHandler> = {
    async get_personal_info(_input, context) {
      return {
        personalInfo: await requestOuraObject({
          accessToken: context.accessToken,
          path: ouraPersonalInfoPath,
          fetcher: context.fetcher,
          phase: "execute",
          signal: context.signal,
        }),
      };
    },
  };

  for (const collection of ouraDocumentCollections) {
    handlers[`list_${collection.name}`] = (input, context) => listOuraDocuments(collection, input, context);
    if (collection.hasDocumentEndpoint) {
      handlers[`get_${collection.name}`] = (input, context) => getOuraDocument(collection, input, context);
    }
  }

  return handlers;
}

async function listOuraDocuments(
  collection: OuraDocumentCollection,
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await requestOuraObject({
    accessToken: context.accessToken,
    path: `${ouraUserCollectionPath}/${collection.path}`,
    fetcher: context.fetcher,
    phase: "execute",
    query: listQuery(collection, input),
    signal: context.signal,
  });

  return {
    documents: objectArray(payload.data, "data", providerResponseError),
    nextToken: optionalString(payload.next_token) ?? null,
  };
}

async function getOuraDocument(
  collection: OuraDocumentCollection,
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const documentId = requiredString(input.documentId, "documentId", providerInputError);

  return {
    document: await requestOuraObject({
      accessToken: context.accessToken,
      path: `${ouraUserCollectionPath}/${collection.path}/${encodePathSegment(documentId)}`,
      fetcher: context.fetcher,
      phase: "execute",
      notFoundAsInvalidInput: true,
      signal: context.signal,
    }),
  };
}

function listQuery(collection: OuraDocumentCollection, input: Record<string, unknown>): Record<string, string> {
  const query: Record<string, QueryValue> = {
    next_token: optionalString(input.nextToken),
    fields: joinCommaSeparated(optionalStringArray(input.fields)),
  };

  if (collection.window === "date") {
    query.start_date = optionalString(input.startDate);
    query.end_date = optionalString(input.endDate);
  }
  if (collection.window === "datetime") {
    query.start_datetime = optionalString(input.startDatetime);
    query.end_datetime = optionalString(input.endDatetime);
  }
  if (collection.supportsLatest) {
    query.latest = optionalBoolean(input.latest);
  }

  return queryParams(query);
}

async function requestOuraObject(input: OuraRequestInput): Promise<Record<string, unknown>> {
  const url = new URL(input.path, ouraApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const timeout = createProviderTimeout(input.signal, ouraRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.accessToken}`,
        "User-Agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = parseJson(await response.text());

    if (!response.ok) {
      throw mapOuraError({
        status: response.status,
        phase: input.phase,
        payload,
        notFoundAsInvalidInput: input.notFoundAsInvalidInput,
      });
    }

    const object = optionalRecord(payload);
    if (!object) {
      throw new ProviderRequestError(502, `oura ${input.path} returned an unexpected response body`);
    }
    return object;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "oura request timed out");
    }
    const message = error instanceof Error && error.message ? error.message : "unknown Oura error";
    throw new ProviderRequestError(502, `oura request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

function parseJson(text: string): unknown {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

interface OuraErrorInput {
  status: number;
  phase: OuraRequestPhase;
  payload: unknown;
  notFoundAsInvalidInput?: boolean;
}

function mapOuraError(input: OuraErrorInput): ProviderRequestError {
  const message = extractOuraErrorMessage(input.payload) ?? `oura request failed with status ${input.status}`;

  if (input.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (input.status === 401 || input.status === 403) {
    // A 403 means the Oura subscription lapsed or the scope was not granted;
    // both are credential problems the user has to fix before retrying.
    return new ProviderRequestError(input.phase === "validate" ? 400 : 401, message);
  }
  if (input.status === 400 || input.status === 422 || (input.status === 404 && input.notFoundAsInvalidInput)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(input.status, message);
}

/**
 * Oura errors carry a FastAPI `detail`, either a plain message or a list of
 * validation errors.
 */
function extractOuraErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const detail = object.detail;
  const message = optionalString(detail) ?? optionalString(object.message) ?? optionalString(object.title);
  if (message) {
    return message;
  }
  if (!Array.isArray(detail)) {
    return undefined;
  }

  const messages = detail
    .map((item) => optionalString(optionalRecord(item)?.msg))
    .filter((item): item is string => !!item);
  return messages.length > 0 ? messages.join("; ") : undefined;
}

function joinCommaSeparated(value: string[] | undefined): string | undefined {
  return value && value.length > 0 ? value.join(",") : undefined;
}
