import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  setSearchParams,
} from "../provider-runtime.ts";

const webOfScienceApiBaseUrl = "https://api.clarivate.com/apis/wos-starter/v1";
const webOfScienceRequestTimeoutMs = 30_000;

type WebOfSciencePhase = "validate" | "execute";
type WebOfScienceContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type WebOfScienceActionHandler = (input: Record<string, unknown>, context: WebOfScienceContext) => Promise<unknown>;

export const webOfScienceActionHandlers: Record<string, WebOfScienceActionHandler> = {
  async search_documents(input, context) {
    validateDocumentSearchInput(input);
    const payload = await requestWebOfScienceJson(
      {
        path: "/documents",
        query: {
          q: readRequiredInput(input.query, "query"),
          db: optionalString(input.database),
          limit: readOptionalIntegerString(input.limit),
          page: readOptionalIntegerString(input.page),
          sortField: optionalString(input.sortField),
          modifiedTimeSpan: optionalString(input.modifiedTimeSpan),
          publishTimeSpan: optionalString(input.publishTimeSpan),
          tcModifiedTimeSpan: optionalString(input.timesCitedModifiedTimeSpan),
          detail: mapDetail(input.detail),
          edition: optionalString(input.edition),
        },
        phase: "execute",
      },
      context,
    );

    return normalizeDocumentList(payload);
  },

  async get_document(input, context) {
    const uid = readRequiredInput(input.uid, "uid");
    const payload = await requestWebOfScienceJson(
      {
        path: `/documents/${encodeURIComponent(uid)}`,
        query: { detail: mapDetail(input.detail) },
        phase: "execute",
      },
      context,
    );

    return { document: normalizeDocument(payload) };
  },

  async search_journals(input, context) {
    const payload = await requestWebOfScienceJson(
      {
        path: "/journals",
        query: { issn: optionalString(input.issn) },
        phase: "execute",
      },
      context,
    );

    return normalizeJournalList(payload);
  },

  async get_journal(input, context) {
    const id = readRequiredInput(input.id, "id");
    const payload = await requestWebOfScienceJson(
      {
        path: `/journals/${encodeURIComponent(id)}`,
        query: {},
        phase: "execute",
      },
      context,
    );

    return { journal: normalizeJournal(payload) };
  },
};

export async function validateWebOfScienceCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestWebOfScienceJson(
    {
      path: "/journals",
      query: { issn: "1355-008X" },
      phase: "validate",
    },
    { apiKey, fetcher, signal },
  );
  const firstJournal = normalizeJournalList(payload).journals[0];

  return {
    profile: {
      accountId: "web_of_science:api_key",
      displayName: "Web of Science API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/journals",
      apiVersion: "v1",
      firstJournalId: firstJournal?.id ?? undefined,
      firstJournalName: firstJournal?.name ?? undefined,
    }),
  };
}

interface WebOfScienceRequest {
  path: string;
  query: Record<string, string | undefined>;
  phase: WebOfSciencePhase;
}

async function requestWebOfScienceJson(
  input: WebOfScienceRequest,
  context: WebOfScienceContext,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal, webOfScienceRequestTimeoutMs);
  try {
    const response = await context.fetcher(buildWebOfScienceUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-ApiKey": context.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Web of Science returned invalid JSON",
    });

    if (!response.ok) {
      throw createWebOfScienceError(response.status, payload, input.phase);
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Web of Science returned an invalid payload");
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Web of Science request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Web of Science request failed: ${error.message}` : "Web of Science request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildWebOfScienceUrl(path: string, query: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${webOfScienceApiBaseUrl}/`);
  setSearchParams(url, query);
  return url;
}

function createWebOfScienceError(status: number, payload: unknown, phase: WebOfSciencePhase): ProviderRequestError {
  const message = extractWebOfScienceErrorMessage(payload) ?? `Web of Science request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(502, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function extractWebOfScienceErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return (
    optionalString(error?.details) ??
    optionalString(error?.title) ??
    optionalString(record?.error_description) ??
    optionalString(record?.message) ??
    optionalString(record?.error)
  );
}

function normalizeDocumentList(payload: Record<string, unknown>) {
  return {
    metadata: normalizeMetadata(payload.metadata),
    documents: readRecordArray(payload.hits).map(normalizeDocument),
    raw: payload,
  };
}

function normalizeJournalList(payload: Record<string, unknown>) {
  return {
    metadata: normalizeMetadata(payload.metadata),
    journals: readRecordArray(payload.hits).map(normalizeJournal),
    raw: payload,
  };
}

function normalizeMetadata(value: unknown) {
  const metadata = optionalRecord(value);
  return {
    total: readNullableInteger(metadata?.total),
    page: readNullableInteger(metadata?.page),
    limit: readNullableInteger(metadata?.limit),
  };
}

function normalizeDocument(value: unknown) {
  const document = requireResponseRecord(value, "Web of Science returned an invalid document");
  const uid = optionalString(document.uid);
  if (!uid) {
    throw new ProviderRequestError(502, "Web of Science document response is missing uid");
  }

  return {
    uid,
    title: readNullableString(document.title),
    types: readStringArray(document.types),
    sourceTypes: readStringArray(document.sourceTypes),
    source: optionalRecord(document.source) ?? null,
    names: optionalRecord(document.names) ?? null,
    links: optionalRecord(document.links) ?? null,
    citations: readRecordArray(document.citations),
    identifiers: optionalRecord(document.identifiers) ?? null,
    keywords: optionalRecord(document.keywords) ?? null,
    raw: document,
  };
}

function normalizeJournal(value: unknown) {
  const journal = requireResponseRecord(value, "Web of Science returned an invalid journal");
  return {
    id: readNullableString(journal.id),
    name: readNullableString(journal.name),
    jcrTitle: readNullableString(journal.jcrTitle),
    isoTitle: readNullableString(journal.isoTitle),
    issn: readNullableString(journal.issn),
    eIssn: readNullableString(journal.eIssn),
    previousIssn: readStringArray(journal.previousIssn),
    links: readRecordArray(journal.links),
    raw: journal,
  };
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function requireResponseRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readRequiredInput(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalIntegerString(value: unknown): string | undefined {
  const integer = optionalInteger(value);
  return integer === undefined ? undefined : String(integer);
}

function readNullableInteger(value: unknown): number | null {
  return optionalInteger(value) ?? null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapDetail(value: unknown): string | undefined {
  return value === "short" ? "short" : undefined;
}

function validateDocumentSearchInput(input: Record<string, unknown>): void {
  const modifiedTimeSpan = optionalString(input.modifiedTimeSpan);
  const publishTimeSpan = optionalString(input.publishTimeSpan);
  if (modifiedTimeSpan && publishTimeSpan) {
    throw new ProviderRequestError(400, "publishTimeSpan cannot be combined with modifiedTimeSpan");
  }
  if (input.database === "WOK" && (modifiedTimeSpan || optionalString(input.timesCitedModifiedTimeSpan))) {
    throw new ProviderRequestError(
      400,
      "database WOK cannot be combined with modifiedTimeSpan or timesCitedModifiedTimeSpan",
    );
  }
}
