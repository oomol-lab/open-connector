import type { ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";

const service = "biorxiv_medrxiv";
const biorxivMedrxivApiBaseUrl = "https://api.biorxiv.org";

interface ApiResponse {
  messages?: unknown;
  collection?: unknown;
  [key: string]: unknown;
}

interface PageMetadata {
  cursor: number;
  count: number;
  total: number | null;
}

interface ActionContext {
  fetcher: typeof fetch;
}
type ActionHandler = (input: Record<string, unknown>, context: ActionContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"biorxiv_medrxiv", ActionHandler> = {
  list_preprints: (input, context) => executeBiorxivMedrxivAction("list_preprints", input, context.fetcher),
  get_preprint: (input, context) => executeBiorxivMedrxivAction("get_preprint", input, context.fetcher),
  list_published_articles: (input, context) =>
    executeBiorxivMedrxivAction("list_published_articles", input, context.fetcher),
  list_publisher_articles: (input, context) =>
    executeBiorxivMedrxivAction("list_publisher_articles", input, context.fetcher),
  get_content_statistics: (input, context) =>
    executeBiorxivMedrxivAction("get_content_statistics", input, context.fetcher),
  get_usage_statistics: (input, context) => executeBiorxivMedrxivAction("get_usage_statistics", input, context.fetcher),
};

export const executors: ProviderExecutors = defineProviderExecutors<ActionContext>({
  service,
  handlers,
  createContext: (_context, fetcher) => ({ fetcher }),
  skipDnsValidation: true,
});

async function executeBiorxivMedrxivAction(actionName: string, input: Record<string, unknown>, fetcher: typeof fetch) {
  if (actionName === "get_preprint") {
    const payload = await requestApi(
      `details/${readServer(input)}/${encodeDoi(readString(input, "doi"))}/na/json`,
      fetcher,
    );
    const preprints = readCollection(payload);
    return { found: preprints.length > 0, preprints };
  }

  if (actionName === "list_preprints") {
    const query = new URLSearchParams();
    if (typeof input.category === "string") {
      query.set("category", input.category);
    }
    const payload = await requestApi(
      `details/${readServer(input)}/${readDateRange(input)}/${readCursor(input)}/json${query.size > 0 ? `?${query}` : ""}`,
      fetcher,
    );
    const preprints = readCollection(payload);
    return { ...readPageMetadata(payload, preprints.length), preprints };
  }

  if (actionName === "list_published_articles") {
    const payload = await requestApi(`pub/${readDateRange(input)}/${readCursor(input)}/json`, fetcher);
    const publications = readCollection(payload);
    return { ...readPageMetadata(payload, publications.length), publications };
  }

  if (actionName === "list_publisher_articles") {
    const publisherPrefix = encodePathSegment(readString(input, "publisherPrefix"));
    const payload = await requestApi(
      `publisher/${publisherPrefix}/${readDateRange(input)}/${readCursor(input)}`,
      fetcher,
    );
    const publications = readCollection(payload);
    return { ...readPageMetadata(payload, publications.length), publications };
  }

  const interval = readString(input, "interval") === "monthly" ? "m" : "y";
  const path =
    actionName === "get_content_statistics" ? `sum/${interval}/json` : `usage/${interval}/${readServer(input)}/json`;
  const payload = await requestApi(path, fetcher);
  return { statistics: readStatistics(payload) };
}

async function requestApi(path: string, fetcher: typeof fetch): Promise<ApiResponse> {
  let response: Response;
  try {
    response = await fetcher(`${biorxivMedrxivApiBaseUrl}/${path}`, {
      headers: { accept: "application/json" },
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `bioRxiv API request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : 502,
      `bioRxiv API request failed with status ${response.status}`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderRequestError(502, "bioRxiv API returned invalid JSON");
  }
  if (!isObject(payload)) {
    throw new ProviderRequestError(502, "bioRxiv API returned an invalid response");
  }

  const status = readMessage(payload.messages)?.status;
  if (typeof status === "string" && status !== "ok" && status !== "no posts found" && status !== "no articles found") {
    throw new ProviderRequestError(400, status);
  }
  return payload;
}

function readCollection(payload: ApiResponse): unknown[] {
  return Array.isArray(payload.collection) ? payload.collection : [];
}

function readStatistics(payload: ApiResponse): unknown[] {
  const statistics = Object.entries(payload).find(([key, value]) => key !== "messages" && Array.isArray(value))?.[1];
  if (!Array.isArray(statistics)) {
    throw new ProviderRequestError(502, "bioRxiv API statistics are missing");
  }
  return statistics;
}

function readPageMetadata(payload: ApiResponse, fallbackCount: number): PageMetadata {
  const message = readMessage(payload.messages);
  return {
    cursor: readNumber(message?.cursor) ?? 0,
    count: readNumber(message?.count) ?? fallbackCount,
    total: readNumber(message?.total) ?? null,
  };
}

function readMessage(messages: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(messages)) {
    return isObject(messages[0]) ? messages[0] : undefined;
  }
  return isObject(messages) ? messages : undefined;
}

function readDateRange(input: Record<string, unknown>): string {
  return `${encodePathSegment(readString(input, "startDate"))}/${encodePathSegment(readString(input, "endDate"))}`;
}

function readCursor(input: Record<string, unknown>): number {
  return typeof input.cursor === "number" ? input.cursor : 0;
}

function readServer(input: Record<string, unknown>): string {
  return readString(input, "server");
}

function readString(input: Record<string, unknown>, fieldName: string): string {
  const value = input[fieldName];
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function encodeDoi(doi: string): string {
  const segments = doi.split("/");
  if (segments.length < 2 || segments.some((segment) => segment.length === 0)) {
    throw new ProviderRequestError(400, "doi must include a prefix and suffix");
  }
  return segments.map(encodePathSegment).join("/");
}

function encodePathSegment(value: string): string {
  if (value === "." || value === "..") {
    throw new ProviderRequestError(400, "path segments cannot be . or ..");
  }
  return encodeURIComponent(value);
}

function readNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
