import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const gistApiBaseUrl = "https://api.github.com";
export const gistApiVersion = "2026-03-10";
export const gistDefaultAcceptHeader = "application/vnd.github+json";

type QueryValue = string | number | boolean | undefined;

export type GistMediaType = "json" | "raw" | "base64";

export interface GistActionContext {
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export type GistActionHandler = (input: Record<string, unknown>, context: GistActionContext) => Promise<unknown>;

export { compactObject, optionalInteger, optionalString } from "../../core/cast.ts";

export interface GistRequestInput {
  method?: string;
  path: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mediaType?: GistMediaType;
  mode?: "validate" | "execute";
}

export async function gistRequest(input: GistRequestInput): Promise<{ response: Response; payload: unknown }> {
  const url = buildGistUrl(input.path, input.query);
  const response = await input.fetcher(url, {
    method: input.method ?? "GET",
    headers: gistHeaders(input.accessToken, input.body !== undefined, input.mediaType),
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.signal,
  });

  return {
    response,
    payload: await readJsonResponse(response),
  };
}

export async function gistRequestJson<T>(input: GistRequestInput): Promise<T> {
  const { response, payload } = await gistRequest(input);
  if (!response.ok) {
    throw normalizeGistError(response, payload, "github gist request failed", input.mode);
  }
  return payload as T;
}

export async function gistRequestNoContent(input: GistRequestInput & { method: string }): Promise<void> {
  const { response, payload } = await gistRequest(input);
  if (!response.ok) {
    throw normalizeGistError(response, payload, "github gist request failed", input.mode);
  }
}

export function buildGistUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${gistApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export function gistHeaders(
  accessToken: string,
  hasJsonBody: boolean,
  mediaType: GistMediaType = "json",
): Record<string, string> {
  const headers: Record<string, string> = {
    "accept": gistAcceptHeader(mediaType),
    "authorization": `Bearer ${accessToken}`,
    "x-github-api-version": gistApiVersion,
    "user-agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

export function normalizeGistError(
  response: Response,
  payload: unknown,
  fallbackMessage: string,
  mode: "validate" | "execute" = "execute",
): ProviderRequestError {
  const message = readGitHubErrorMessage(payload) ?? `${fallbackMessage} with ${response.status}`;

  if (response.status === 429 || (response.status === 403 && isRateLimited(response, payload))) {
    return new ProviderRequestError(429, message, payload);
  }

  if (mode === "validate") {
    if (response.status === 401) {
      return new ProviderRequestError(400, message, payload);
    }
    return new ProviderRequestError(response.status || 502, message, payload);
  }

  if (response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 404) {
    return new ProviderRequestError(404, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function gistAcceptHeader(mediaType: GistMediaType): string {
  switch (mediaType) {
    case "raw":
      return "application/vnd.github.raw+json";
    case "base64":
      return "application/vnd.github.base64+json";
    case "json":
    default:
      return gistDefaultAcceptHeader;
  }
}

function readGitHubErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const message = (payload as Record<string, unknown>).message;
  return typeof message === "string" && message ? message : null;
}

function isRateLimited(response: Response, payload: unknown): boolean {
  if (response.headers.get("x-ratelimit-remaining") === "0") {
    return true;
  }

  const message = readGitHubErrorMessage(payload)?.toLowerCase() ?? "";
  return message.includes("rate limit");
}
