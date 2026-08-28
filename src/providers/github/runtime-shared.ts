import { compactObject, optionalInteger, optionalString, optionalRawString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export { compactObject };

export const githubApiBaseUrl = "https://api.github.com";
export const githubApiVersion = "2022-11-28";
export const githubDefaultAcceptHeader = "application/vnd.github+json";
export const githubUserAgent = "oomol-connect";

export type GitHubActionContext = {
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
};

export type GitHubActionHandler = (input: Record<string, unknown>, context: GitHubActionContext) => Promise<unknown>;

interface GitHubJsonRequest {
  method?: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  accessToken: string;
  fetcher: typeof fetch;
}

interface GitHubNoContentRequest {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  accessToken: string;
  fetcher: typeof fetch;
}

interface GitHubTextTailRequest {
  path: string;
  accessToken: string;
  fetcher: typeof fetch;
  maxBytes: number;
  signal?: AbortSignal;
}

export interface GitHubTextTail {
  text: string;
  sizeBytes: number;
  returnedBytes: number;
  truncated: boolean;
}

export async function githubRequestJson<T>(input: GitHubJsonRequest): Promise<T> {
  const url = buildGitHubUrl(input.path, input.query);
  const response = await input.fetcher(url, {
    method: input.method ?? "GET",
    headers: githubHeaders(input.accessToken, input.body !== undefined),
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  const payload = (await readJsonResponse(response)) as T;

  if (!response.ok) {
    throw normalizeGitHubError(response, payload, "github api request failed");
  }

  return payload;
}

export async function githubRequestNoContent(input: GitHubNoContentRequest): Promise<void> {
  const url = buildGitHubUrl(input.path);
  const response = await input.fetcher(url, {
    method: input.method,
    headers: githubHeaders(input.accessToken, input.body !== undefined),
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });

  if (!response.ok) {
    const payload = await readJsonResponse(response);
    throw normalizeGitHubError(response, payload, "github api request failed");
  }
}

/** Download a GitHub text response while retaining only its trailing bytes. */
export async function githubRequestTextTail(input: GitHubTextTailRequest): Promise<GitHubTextTail> {
  const response = await input.fetcher(buildGitHubUrl(input.path), {
    headers: githubHeaders(input.accessToken, false),
    signal: input.signal,
  });
  if (!response.ok) {
    const payload = await readJsonResponse(response);
    throw normalizeGitHubError(response, payload, "github api request failed");
  }

  const tail = new Uint8Array(input.maxBytes);
  const reader = response.body?.getReader();
  let sizeBytes = 0;
  let writeOffset = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        sizeBytes += value.byteLength;
        writeOffset = writeTailBytes(tail, writeOffset, value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const truncated = sizeBytes > input.maxBytes;
  const retainedSize = Math.min(sizeBytes, input.maxBytes);
  const retained = readTailBytes(tail, writeOffset, retainedSize, truncated);
  const utf8Start = truncated ? skipUtf8ContinuationBytes(retained) : 0;
  const returnedBytes = retained.byteLength - utf8Start;
  return {
    text: new TextDecoder().decode(retained.subarray(utf8Start)),
    sizeBytes,
    returnedBytes,
    truncated,
  };
}

export function buildGitHubUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${githubApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function buildRepoContentsPath(owner: string, repo: string, path?: string): string {
  const normalizedPath = path?.replace(/^\/+/u, "").replace(/\/+$/u, "") ?? "";
  const encodedPath = normalizedPath
    ? normalizedPath
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join("/")
    : "";

  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${encodedPath ? `/${encodedPath}` : ""}`;
}

export function githubHeaders(accessToken: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: githubDefaultAcceptHeader,
    authorization: `Bearer ${accessToken}`,
    "x-github-api-version": githubApiVersion,
    "user-agent": githubUserAgent,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

export async function readJsonResponse(response: Response): Promise<unknown> {
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

export function normalizeGitHubError(
  response: Response,
  payload: unknown,
  fallbackMessage: string,
): ProviderRequestError {
  const message = readGitHubErrorMessage(payload) ?? `${fallbackMessage} with ${response.status}`;
  if (response.status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 403 && isRateLimited(response, payload)) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 404) {
    return new ProviderRequestError(404, message);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(500, message, response.status);
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

function writeTailBytes(tail: Uint8Array, writeOffset: number, value: Uint8Array): number {
  if (value.byteLength >= tail.byteLength) {
    tail.set(value.subarray(value.byteLength - tail.byteLength));
    return 0;
  }

  const firstLength = Math.min(value.byteLength, tail.byteLength - writeOffset);
  tail.set(value.subarray(0, firstLength), writeOffset);
  tail.set(value.subarray(firstLength), 0);
  return (writeOffset + value.byteLength) % tail.byteLength;
}

function readTailBytes(tail: Uint8Array, writeOffset: number, size: number, wrapped: boolean): Uint8Array {
  if (!wrapped) {
    return tail.slice(0, size);
  }

  const value = new Uint8Array(size);
  const firstLength = tail.byteLength - writeOffset;
  value.set(tail.subarray(writeOffset), 0);
  value.set(tail.subarray(0, writeOffset), firstLength);
  return value;
}

function skipUtf8ContinuationBytes(value: Uint8Array): number {
  let offset = 0;
  while (offset < value.byteLength && (value[offset]! & 0xc0) === 0x80) {
    offset++;
  }
  return offset;
}

export function decodeGitHubContent(contentBase64: string, encoding?: string): string | null {
  if (!contentBase64) {
    return "";
  }
  if (encoding && encoding !== "base64") {
    return null;
  }

  try {
    const bytes = Buffer.from(contentBase64, "base64");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function resolveGitHubWriteContent(input: Record<string, unknown>): string {
  const contentBase64 = optionalRawString(input.contentBase64);
  if (contentBase64) {
    return contentBase64.replace(/[\r\n]/g, "");
  }

  return Buffer.from(String(input.content ?? ""), "utf8").toString("base64");
}

export function mapReviewComment(comment: unknown): Record<string, unknown> {
  if (!comment || typeof comment !== "object" || Array.isArray(comment)) {
    return {};
  }

  const value = comment as Record<string, unknown>;
  return compactObject({
    path: String(value.path ?? ""),
    body: String(value.body ?? ""),
    line: optionalInteger(value.line),
    side: optionalString(value.side),
    start_line: optionalInteger(value.startLine),
    start_side: optionalString(value.startSide),
  });
}

export function normalizeRequestedReviewersResponse(payload: Record<string, unknown>): {
  pull_request: Record<string, unknown>;
  requested_reviewers: Record<string, unknown>[];
  requested_teams: Record<string, unknown>[];
} {
  return {
    pull_request: payload,
    requested_reviewers: Array.isArray(payload.requested_reviewers)
      ? (payload.requested_reviewers as Record<string, unknown>[])
      : [],
    requested_teams: Array.isArray(payload.requested_teams)
      ? (payload.requested_teams as Record<string, unknown>[])
      : [],
  };
}

export function buildIssueAndPullRequestSearchQuery(input: Record<string, unknown>): string {
  const explicitQuery = optionalString(input.query) || optionalString(input.q);
  const qualifiers: string[] = [];

  const owner = optionalString(input.owner);
  const repo = optionalString(input.repo);
  if (owner && repo) {
    qualifiers.push(`repo:${owner}/${repo}`);
  } else if (repo?.includes("/")) {
    qualifiers.push(`repo:${repo}`);
  } else if (owner) {
    qualifiers.push(`user:${owner}`);
  }

  const state = optionalString(input.state);
  if (state && state !== "all") {
    qualifiers.push(`state:${state}`);
  }
  if (input.type === "issue") {
    qualifiers.push("is:issue");
  } else if (input.type === "pr") {
    qualifiers.push("is:pr");
  }

  const label = optionalString(input.label);
  if (label) {
    qualifiers.push(`label:${quoteSearchValue(label)}`);
  }

  for (const [key, qualifier] of [
    ["author", "author"],
    ["assignee", "assignee"],
    ["mentions", "mentions"],
    ["language", "language"],
    ["baseBranch", "base"],
    ["headBranch", "head"],
  ] as const) {
    const value = optionalString(input[key]);
    if (value) {
      qualifiers.push(`${qualifier}:${quoteSearchValue(value)}`);
    }
  }

  if (typeof input.isMerged === "boolean") {
    qualifiers.push(input.isMerged ? "is:merged" : "is:unmerged");
  }

  return [...(explicitQuery ? [explicitQuery] : []), ...qualifiers].join(" ").trim();
}

function quoteSearchValue(value: string): string {
  return /\s/u.test(value) ? JSON.stringify(value) : value;
}
