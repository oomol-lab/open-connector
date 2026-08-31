import type { TheOfficialBoardActionName } from "./actions.ts";

import { requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface TheOfficialBoardCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

const apiBaseUrl = "https://rest.theofficialboard.com/rest/";

const actionRequestByName = {
  search_companies: {
    path: "company/search",
    query: { companyName: "companyName", amount: "amount" },
  },
  get_company_org_chart: { path: "company/orgchart", query: { id: "id" } },
  search_executives: { path: "executive/search", query: { name: "name", amount: "amount" } },
  find_executive: {
    path: "executive/exact-search",
    query: { email: "email", linkedin: "linkedin" },
  },
  get_executive_biography: { path: "executive/biography", query: { bioId: "bioID" } },
  list_direct_colleagues: { path: "executive/direct-colleagues", query: { bioId: "bioID" } },
  list_recent_org_chart_news: { path: "orgchart/recent-news", query: { id: "id" } },
  list_watchlist_changes: { path: "orgchart/watch", query: { amount: "amount", page: "page" } },
} satisfies Record<TheOfficialBoardActionName, { path: string; query: Record<string, string> }>;

export function executeTheOfficialBoardAction(
  actionName: TheOfficialBoardActionName,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  validateActionInput(actionName, input);
  return executeRequest(actionRequestByName[actionName], input, apiKey, fetcher);
}

export async function validateTheOfficialBoardCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<TheOfficialBoardCredentialCheck> {
  const payload = await requestJson("test/token", requiredString(input.apiKey, "apiKey"), fetcher, "validation");
  const user = readFirstResult(payload);
  return {
    accountLabel: readString(user, "email") ?? readString(user, "name") ?? "The Official Board Account",
    providerScopes: [],
    providerMetadata: { apiBaseUrl, validationEndpoint: "test/token" },
  };
}

async function executeRequest(
  definition: { path: string; query: Record<string, string> },
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
) {
  const url = new URL(definition.path, apiBaseUrl);
  for (const [inputName, queryName] of Object.entries(definition.query)) {
    const value = input[inputName];
    if (value !== undefined) {
      url.searchParams.set(queryName, typeof value === "string" ? value.trim() : String(value));
    }
  }
  return requestJson(url, apiKey, fetcher);
}

async function requestJson(
  pathOrUrl: string | URL,
  apiKey: string,
  fetcher: typeof fetch,
  phase: "validation" | "execution" = "execution",
) {
  const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, apiBaseUrl);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        token: apiKey,
        "user-agent": providerUserAgent,
      },
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `the_official_board request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw mapError(response.status, readErrorMessage(payload), phase);
  }
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "the_official_board returned malformed JSON");
    }
    return text;
  }
}

function mapError(status: number, message: string, phase: "validation" | "execution") {
  if (status === 401 || status === 403) {
    return phase === "validation" ? new ProviderRequestError(400, message) : new ProviderRequestError(401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    for (const key of ["message", "error", "description"]) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
  }
  return "the_official_board request failed";
}

function validateActionInput(actionName: TheOfficialBoardActionName, input: Record<string, unknown>) {
  if (actionName === "find_executive" && input.email === undefined && input.linkedin === undefined) {
    throw new ProviderRequestError(400, "find_executive requires email or linkedin");
  }
}

function readFirstResult(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const result = (payload as Record<string, unknown>).result;
  return Array.isArray(result) && result[0] && typeof result[0] === "object"
    ? (result[0] as Record<string, unknown>)
    : undefined;
}

function readString(value: Record<string, unknown> | undefined, key: string) {
  const field = value?.[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}
