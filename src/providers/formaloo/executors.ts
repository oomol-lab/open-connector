import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import {
  createProviderTimeout,
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "formaloo";
const formalooApiBaseUrl = "https://api.formaloo.me/v3.0";
const formalooRequestTimeoutMs = 30_000;
interface FormalooCredentials {
  apiKey: string;
  apiSecret: string;
}
interface FormalooActionInput {
  apiKey?: string;
  values?: Record<string, string>;
  actionName: string;
  input: Record<string, unknown>;
}
interface FormalooRequestInput {
  path: string;
  credentials: FormalooCredentials;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  method?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}
interface Context extends FormalooCredentials {
  fetcher: typeof fetch;
}
function requireApiKey(input: { apiKey?: string }): string {
  if (!input.apiKey?.trim()) throw new ProviderRequestError(400, "apiKey is required");
  return input.apiKey.trim();
}

const actionNames = ["list_forms", "get_form", "list_rows", "get_row", "create_row", "update_row", "delete_row"];
const handlers = Object.fromEntries(
  actionNames.map((name) => [
    name,
    (input: Record<string, unknown>, context: Context) =>
      executeFormalooAction(
        { apiKey: context.apiKey, values: { apiSecret: context.apiSecret }, actionName: name, input },
        context.fetcher,
      ),
  ]),
);
export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<Context> {
    const credential = await requireApiKeyCredential(context, service);
    const apiSecret = String(credential.values.apiSecret ?? "").trim();
    if (!apiSecret) throw new ProviderRequestError(400, "apiSecret is required");
    return { apiKey: credential.apiKey, apiSecret, fetcher };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    const credentials = readFormalooCredentials({
      apiKey: input.apiKey,
      values: { apiSecret: String(input.values.apiSecret ?? "") },
    });
    const profile = readRecord(
      await requestFormaloo({ path: "/profiles/me/", credentials, fetcher: context.fetcher, phase: "validate" }),
    );
    const displayName =
      readString(profile.email) ?? readString(profile.username) ?? readString(profile.first_name) ?? "Formaloo API Key";
    return {
      profile: { accountId: displayName, displayName },
      grantedScopes: [],
      metadata: { apiBaseUrl: formalooApiBaseUrl },
    };
  },
};

export async function executeFormalooAction(
  input: FormalooActionInput & {
    actionName: string;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const credentials = readFormalooCredentials(input);
  const common = { credentials, fetcher, phase: "execute" as const };
  switch (input.actionName) {
    case "list_forms":
      return normalizePage(
        await requestFormaloo({ ...common, path: "/forms/", query: listFormsQuery(input.input) }),
        "forms",
      );
    case "get_form":
      return {
        form: await requestFormaloo({
          ...common,
          path: `/forms/${encodeURIComponent(readRequiredString(input.input.formSlug, "formSlug"))}/`,
        }),
      };
    case "list_rows":
      return normalizePage(
        await requestFormaloo({
          ...common,
          path: `/forms/${encodeURIComponent(readRequiredString(input.input.formSlug, "formSlug"))}/rows/`,
          query: listRowsQuery(input.input),
        }),
        "rows",
      );
    case "get_row":
      return {
        row: await requestFormaloo({
          ...common,
          path: `/rows/${encodeURIComponent(readRequiredString(input.input.rowSlug, "rowSlug"))}/`,
        }),
      };
    case "create_row":
      return {
        row: await requestFormaloo({
          ...common,
          method: "POST",
          path: `/forms/${encodeURIComponent(readRequiredString(input.input.formSlug, "formSlug"))}/rows/`,
          body: createRowBody(input.input),
        }),
      };
    case "update_row":
      return {
        row: await requestFormaloo({
          ...common,
          method: "PATCH",
          path: `/rows/${encodeURIComponent(readRequiredString(input.input.rowSlug, "rowSlug"))}/`,
          body: updateRowBody(input.input),
        }),
      };
    case "delete_row":
      return requestFormaloo({
        ...common,
        method: "DELETE",
        path: `/rows/${encodeURIComponent(readRequiredString(input.input.rowSlug, "rowSlug"))}/`,
      });
  }
}

async function requestFormaloo(input: FormalooRequestInput): Promise<unknown> {
  const token = await obtainAuthorizationToken(input.credentials, input.fetcher, input.phase);
  const url = new URL(`${formalooApiBaseUrl}${input.path}`);
  appendQuery(url, input.query);
  const timeout = createProviderTimeout(undefined, formalooRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `JWT ${token}`,
        "Content-Type": "application/json",
        "User-Agent": providerUserAgent,
        "x-api-key": input.credentials.apiKey,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const data = await readFormalooPayload(response);
    if (!response.ok) throw formalooError(response.status, data, input.phase, false);
    return data;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "formaloo request failed");
  } finally {
    timeout.cleanup();
  }
}

async function obtainAuthorizationToken(
  credentials: FormalooCredentials,
  fetcher: typeof fetch,
  phase: "validate" | "execute",
) {
  const timeout = createProviderTimeout(undefined, formalooRequestTimeoutMs);
  try {
    const response = await fetcher(`${formalooApiBaseUrl}/oauth2/authorization-token/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${credentials.apiSecret}`,
        "Content-Type": "application/json",
        "User-Agent": providerUserAgent,
        "x-api-key": credentials.apiKey,
      },
      body: JSON.stringify({ grant_type: "client_credentials" }),
      signal: timeout.signal,
    });
    const data = await readFormalooPayload(response);
    if (!response.ok) throw formalooError(response.status, data, phase, true);
    const token = readString(readRecord(data).authorization_token);
    if (!token) {
      throw new ProviderRequestError(502, "formaloo returned no authorization token");
    }
    return token;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "formaloo token request failed");
  } finally {
    timeout.cleanup();
  }
}

async function readFormalooPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return { message: text };
    throw new ProviderRequestError(502, "formaloo returned a non-JSON response");
  }
}

function formalooError(status: number, data: unknown, phase: "validate" | "execute", isTokenExchange: boolean) {
  const record = readRecord(data);
  const message =
    readString(record.message) ??
    readString(record.detail) ??
    readString(record.error) ??
    `formaloo request failed (${status})`;
  if (status === 401 || (isTokenExchange && status === 403)) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function readFormalooCredentials(input: {
  apiKey?: string;
  apiSecret?: string;
  values?: Record<string, string>;
}): FormalooCredentials {
  const apiSecret = input.apiSecret ?? input.values?.apiSecret;
  if (!apiSecret?.trim()) {
    throw new ProviderRequestError(400, "apiSecret is required");
  }
  return { apiKey: requireApiKey(input), apiSecret: apiSecret.trim() };
}

function listFormsQuery(input: Record<string, unknown>) {
  return {
    page: input.page,
    page_size: input.pageSize,
    search: input.search,
    category: input.category,
    tag: input.tag,
    sort_by: input.sortBy,
  };
}

function listRowsQuery(input: Record<string, unknown>) {
  return {
    page: input.page,
    page_size: input.pageSize,
    search: input.search,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
    submit_number: input.submitNumber,
    tags: input.tags,
    tracking_code: input.trackingCode,
    sort_by: input.sortBy,
  };
}

function createRowBody(input: Record<string, unknown>) {
  return {
    ...readRecord(input.values),
    row_tags: input.rowTags,
    submit_by_alias: input.submitByAlias,
    language: input.language,
  };
}

function updateRowBody(input: Record<string, unknown>) {
  return {
    ...readRecord(input.values),
    row_tags: input.rowTags,
    status: input.status,
  };
}

function normalizePage(data: unknown, itemsKey: "forms" | "rows") {
  const record = readRecord(data);
  return {
    count: record.count,
    next: record.next ?? null,
    previous: record.previous ?? null,
    pageSize: record.page_size,
    pageCount: record.page_count,
    currentPage: record.current_page,
    [itemsKey]: record[itemsKey],
  };
}

function appendQuery(url: URL, query?: Record<string, unknown>) {
  if (!query) return;
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
}

function readRequiredString(value: unknown, fieldName: string) {
  const parsed = readString(value);
  if (!parsed) throw new ProviderRequestError(400, `${fieldName} is required`);
  return parsed;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
