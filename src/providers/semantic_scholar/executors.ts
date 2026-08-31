import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, looseArray, optionalRawString, optionalRecord } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  mapProviderActionSources,
  providerProxyEndpointPrefixes,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "semantic_scholar";

const graphApiBaseUrl = "https://api.semanticscholar.org/graph/v1";
const recommendationsApiBaseUrl = "https://api.semanticscholar.org/recommendations/v1";

type SemanticScholarPhase = "validate" | "execute";
type SemanticScholarApiFamily = "graph" | "recommendations";
type SemanticScholarActionHandler = (
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  apiKey: string,
) => Promise<unknown>;

interface SemanticScholarActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const semanticScholarActionHandlers: ProviderActionHandlers<"semantic_scholar", SemanticScholarActionHandler> = {
  async get_paper(input, fetcher, apiKey) {
    const paper = await requestSemanticScholarJson({
      family: "graph",
      path: `/paper/${encodePathSegment(readRequiredString(input.paperId, "paperId"))}`,
      method: "GET",
      apiKey,
      params: pickParams(input, ["fields"]),
      fetcher,
      phase: "execute",
    });

    return {
      paper,
    };
  },
  async get_papers(input, fetcher, apiKey) {
    const papers = await requestSemanticScholarJson({
      family: "graph",
      path: "/paper/batch",
      method: "POST",
      apiKey,
      params: pickParams(input, ["fields"]),
      body: {
        ids: readStringList(input.paperIds),
      },
      fetcher,
      phase: "execute",
    });

    return {
      papers: Array.isArray(papers) ? papers : [],
    };
  },
  async search_papers(input, fetcher, apiKey) {
    const payload = await requestSemanticScholarJson({
      family: "graph",
      path: "/paper/search",
      method: "GET",
      apiKey,
      params: buildPaperSearchParams(input, ["offset"]),
      fetcher,
      phase: "execute",
    });

    return normalizePaperList(payload);
  },
  async bulk_search_papers(input, fetcher, apiKey) {
    const payload = await requestSemanticScholarJson({
      family: "graph",
      path: "/paper/search/bulk",
      method: "GET",
      apiKey,
      params: buildPaperSearchParams(input, ["token"]),
      fetcher,
      phase: "execute",
    });

    return normalizePaperList(payload);
  },
  async match_paper_title(input, fetcher, apiKey) {
    const payload = await requestSemanticScholarJson({
      family: "graph",
      path: "/paper/search/match",
      method: "GET",
      apiKey,
      params: pickParams(input, ["query", "fields"]),
      fetcher,
      phase: "execute",
    });

    return {
      paper: optionalRecord(payload),
      raw: normalizeRawObject(payload),
    };
  },
  async autocomplete_papers(input, fetcher, apiKey) {
    const payload = await requestSemanticScholarJson({
      family: "graph",
      path: "/paper/autocomplete",
      method: "GET",
      apiKey,
      params: pickParams(input, ["query", "limit"]),
      fetcher,
      phase: "execute",
    });

    const payloadRecord = optionalRecord(payload);
    return {
      completions: looseArray(payloadRecord?.matches ?? payloadRecord?.data),
      raw: normalizeRawObject(payload),
    };
  },
  async get_paper_authors(input, fetcher, apiKey) {
    const payload = await requestSemanticScholarJson({
      family: "graph",
      path: `/paper/${encodePathSegment(readRequiredString(input.paperId, "paperId"))}/authors`,
      method: "GET",
      apiKey,
      params: pickParams(input, ["fields", "limit", "offset"]),
      fetcher,
      phase: "execute",
    });

    return normalizeAuthorList(payload);
  },
  async get_paper_citations(input, fetcher, apiKey) {
    const payload = await requestSemanticScholarJson({
      family: "graph",
      path: `/paper/${encodePathSegment(readRequiredString(input.paperId, "paperId"))}/citations`,
      method: "GET",
      apiKey,
      params: pickParams(input, ["fields", "limit", "offset"]),
      fetcher,
      phase: "execute",
    });

    return normalizeEdgeList(payload);
  },
  async get_paper_references(input, fetcher, apiKey) {
    const payload = await requestSemanticScholarJson({
      family: "graph",
      path: `/paper/${encodePathSegment(readRequiredString(input.paperId, "paperId"))}/references`,
      method: "GET",
      apiKey,
      params: pickParams(input, ["fields", "limit", "offset"]),
      fetcher,
      phase: "execute",
    });

    return normalizeEdgeList(payload);
  },
  async search_authors(input, fetcher, apiKey) {
    const payload = await requestSemanticScholarJson({
      family: "graph",
      path: "/author/search",
      method: "GET",
      apiKey,
      params: pickParams(input, ["query", "fields", "limit", "offset"]),
      fetcher,
      phase: "execute",
    });

    return normalizeAuthorList(payload);
  },
  async get_author(input, fetcher, apiKey) {
    const author = await requestSemanticScholarJson({
      family: "graph",
      path: `/author/${encodePathSegment(readRequiredString(input.authorId, "authorId"))}`,
      method: "GET",
      apiKey,
      params: pickParams(input, ["fields"]),
      fetcher,
      phase: "execute",
    });

    return {
      author,
    };
  },
  async get_authors(input, fetcher, apiKey) {
    const authors = await requestSemanticScholarJson({
      family: "graph",
      path: "/author/batch",
      method: "POST",
      apiKey,
      params: pickParams(input, ["fields"]),
      body: {
        ids: readStringList(input.authorIds),
      },
      fetcher,
      phase: "execute",
    });

    return {
      authors: Array.isArray(authors) ? authors : [],
    };
  },
  async get_author_papers(input, fetcher, apiKey) {
    const payload = await requestSemanticScholarJson({
      family: "graph",
      path: `/author/${encodePathSegment(readRequiredString(input.authorId, "authorId"))}/papers`,
      method: "GET",
      apiKey,
      params: pickParams(input, ["fields", "limit", "offset"]),
      fetcher,
      phase: "execute",
    });

    return normalizePaperList(payload);
  },
  async search_snippets(input, fetcher, apiKey) {
    const payload = await requestSemanticScholarJson({
      family: "graph",
      path: "/snippet/search",
      method: "GET",
      apiKey,
      params: pickParams(input, ["query", "limit"]),
      fetcher,
      phase: "execute",
    });

    const payloadRecord = optionalRecord(payload);
    return {
      total: readNullableInteger(payloadRecord?.total),
      offset: readNullableInteger(payloadRecord?.offset),
      next: readNullableInteger(payloadRecord?.next),
      snippets: looseArray(payloadRecord?.data),
      raw: normalizeRawObject(payload),
    };
  },
  async recommend_for_paper(input, fetcher, apiKey) {
    const payload = await requestSemanticScholarJson({
      family: "recommendations",
      path: `/papers/forpaper/${encodePathSegment(readRequiredString(input.paperId, "paperId"))}`,
      method: "GET",
      apiKey,
      params: pickParams(input, ["fields", "limit"]),
      fetcher,
      phase: "execute",
    });

    return normalizePaperList(payload);
  },
  async recommend_papers(input, fetcher, apiKey) {
    const payload = await requestSemanticScholarJson({
      family: "recommendations",
      path: "/papers/",
      method: "POST",
      apiKey,
      params: pickParams(input, ["fields", "limit"]),
      body: compactObject({
        positivePaperIds: readStringList(input.positivePaperIds),
        negativePaperIds: input.negativePaperIds ? readStringList(input.negativePaperIds) : undefined,
      }),
      fetcher,
      phase: "execute",
    });

    return normalizePaperList(payload);
  },
};

const semanticScholarExecutorHandlers = mapProviderActionSources(
  service,
  semanticScholarActionHandlers,
  (_name, handler) => (input: Record<string, unknown>, context: SemanticScholarActionContext) =>
    handler(input, context.fetcher, context.apiKey),
);

export const executors: ProviderExecutors = defineProviderExecutors<SemanticScholarActionContext>({
  service,
  handlers: semanticScholarExecutorHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<SemanticScholarActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const payload = await requestSemanticScholarJson({
      family: "graph",
      path: "/paper/search",
      method: "GET",
      apiKey: input.apiKey,
      params: {
        query: "semantic scholar",
        limit: "1",
        fields: "title",
      },
      fetcher,
      phase: "validate",
    });

    const result = normalizePaperList(payload);
    const firstPaper = result.papers[0];
    const firstPaperRecord = optionalRecord(firstPaper);

    return {
      profile: {
        accountId: "api_key",
        displayName: "Semantic Scholar API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/paper/search",
        firstPaperId: optionalRawString(firstPaperRecord?.paperId),
        firstPaperTitle: optionalRawString(firstPaperRecord?.title),
      }),
    };
  },
};

async function requestSemanticScholarJson(input: {
  family: SemanticScholarApiFamily;
  path: string;
  method: "GET" | "POST";
  apiKey: string;
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  phase: SemanticScholarPhase;
}) {
  return runProviderRequest({ label: "Semantic Scholar" }, async (signal) => {
    const response = await input.fetcher(buildSemanticScholarUrl(input), {
      method: input.method,
      headers: buildSemanticScholarHeaders(input),
      body: input.method === "POST" ? JSON.stringify(input.body ?? {}) : undefined,
      signal,
    });
    const payload = await readSemanticScholarPayload(response);

    if (!response.ok) {
      throw createSemanticScholarError(response.status, payload, input.phase);
    }

    return payload;
  });
}

function buildSemanticScholarHeaders(input: { method: "GET" | "POST"; apiKey: string }) {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": input.apiKey,
  };

  if (input.method === "POST") {
    headers["content-type"] = "application/json";
  }

  return headers;
}

function buildSemanticScholarUrl(input: {
  family: SemanticScholarApiFamily;
  path: string;
  params?: Record<string, string | undefined>;
}) {
  const baseUrl = input.family === "graph" ? graphApiBaseUrl : recommendationsApiBaseUrl;
  const normalizedPath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(normalizedPath, `${baseUrl}/`);
  for (const [key, value] of Object.entries(input.params ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, value);
  }
  return url;
}

async function readSemanticScholarPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Semantic Scholar returned invalid JSON");
  }
}

function createSemanticScholarError(status: number, payload: unknown, phase: SemanticScholarPhase) {
  const message =
    extractSemanticScholarErrorMessage(payload) ?? `Semantic Scholar request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status || 500, message);
}

function extractSemanticScholarErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalRawString(record.message)?.trim();
  if (directMessage) {
    return directMessage;
  }

  const directError = optionalRawString(record.error)?.trim();
  if (directError) {
    return directError;
  }

  return optionalRawString(record.detail)?.trim();
}

function buildPaperSearchParams(input: Record<string, unknown>, pagingKeys: string[]) {
  return {
    ...pickParams(input, [
      "query",
      "fields",
      "limit",
      "year",
      "venue",
      "fieldsOfStudy",
      "publicationTypes",
      "publicationDateOrYear",
      "minCitationCount",
      "openAccessPdf",
    ]),
    ...pickParams(input, pagingKeys),
  };
}

function pickParams(input: Record<string, unknown>, keys: string[]) {
  const params: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = input[key];
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "boolean") {
      if (key === "openAccessPdf") {
        params[key] = value ? "" : undefined;
      } else {
        params[key] = String(value);
      }
      continue;
    }

    params[key] = String(value);
  }
  return params;
}

function normalizePaperList(payload: unknown) {
  const payloadRecord = optionalRecord(payload);
  return {
    total: readNullableInteger(payloadRecord?.total),
    offset: readNullableInteger(payloadRecord?.offset),
    next: readNullableInteger(payloadRecord?.next),
    token: readNullableString(payloadRecord?.token),
    papers: looseArray(payloadRecord?.data ?? payloadRecord?.recommendedPapers),
    raw: normalizeRawObject(payload),
  };
}

function normalizeAuthorList(payload: unknown) {
  const payloadRecord = optionalRecord(payload);
  return {
    total: readNullableInteger(payloadRecord?.total),
    offset: readNullableInteger(payloadRecord?.offset),
    next: readNullableInteger(payloadRecord?.next),
    authors: looseArray(payloadRecord?.data),
    raw: normalizeRawObject(payload),
  };
}

function normalizeEdgeList(payload: unknown) {
  const payloadRecord = optionalRecord(payload);
  return {
    total: readNullableInteger(payloadRecord?.total),
    offset: readNullableInteger(payloadRecord?.offset),
    next: readNullableInteger(payloadRecord?.next),
    data: looseArray(payloadRecord?.data),
    raw: normalizeRawObject(payload),
  };
}

function normalizeRawObject(value: unknown) {
  return optionalRecord(value) ?? {};
}

function readNullableInteger(value: unknown) {
  return Number.isInteger(value) ? (value as number) : null;
}

function readNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "string array input is required");
  }

  return value.map((item) => readRequiredString(item, "id"));
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.semanticscholar.org",
  auth: { type: "api_key_header", name: "x-api-key" },
  allowedEndpoint: providerProxyEndpointPrefixes("/graph/v1", "/recommendations/v1", "/datasets/v1"),
});
