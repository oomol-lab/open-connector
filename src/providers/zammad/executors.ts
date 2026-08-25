import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
interface Context {
  baseUrl: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
function baseUrl(value: string | undefined): string {
  if (!value) throw new ProviderRequestError(401, "Configure the Zammad base URL first.");
  const url = new URL(value);
  if (url.pathname !== "/" || (url.protocol !== "http:" && url.protocol !== "https:"))
    throw new ProviderRequestError(400, "baseUrl must be the Zammad instance root URL");
  return assertPublicHttpUrl(url.toString(), {
    fieldName: "baseUrl",
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
    createError: (message) => new ProviderRequestError(400, message),
  })
    .toString()
    .replace(/\/$/, "");
}
async function request(
  path: string,
  method: string,
  input: Record<string, unknown>,
  context: Context,
): Promise<unknown> {
  const url = new URL(path, `${context.baseUrl}/`);
  if (method === "GET")
    for (const [key, value] of Object.entries(input)) if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await context.fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Token token=${context.apiKey}`,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: method === "GET" ? undefined : JSON.stringify(input),
    signal: context.signal,
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : {};
  if (!response.ok)
    throw new ProviderRequestError(response.status, `Zammad request failed with status ${response.status}`, payload);
  return payload;
}
function id(input: Record<string, unknown>): string {
  return encodeURIComponent(String(input.ticketId));
}
const handlers: ProviderActionHandlers<"zammad", ProviderRuntimeHandler<Context>> = {
  async get_current_user(_input, context) {
    return { user: await request("/api/v1/users/me", "GET", {}, context) };
  },
  async list_tickets(input, context) {
    return {
      tickets: await request(
        "/api/v1/tickets",
        "GET",
        { page: input.page, per_page: input.perPage, expand: input.expand },
        context,
      ),
    };
  },
  async search_tickets(input, context) {
    return {
      tickets: await request(
        "/api/v1/tickets/search",
        "GET",
        {
          query: input.query,
          page: input.page,
          per_page: input.perPage,
          sort_by: input.sortBy,
          order_by: input.orderBy,
        },
        context,
      ),
    };
  },
  async get_ticket(input, context) {
    return { ticket: await request(`/api/v1/tickets/${id(input)}`, "GET", { expand: input.expand }, context) };
  },
  async create_ticket(input, context) {
    const { body, articleType, contentType, internal, subject, sender, ...ticket } = input;
    return {
      ticket: await request(
        "/api/v1/tickets",
        "POST",
        {
          ...ticket,
          article: {
            body,
            type: articleType ?? "note",
            content_type: contentType ?? "text/plain",
            internal: internal ?? false,
            subject,
            sender,
          },
        },
        context,
      ),
    };
  },
  async update_ticket(input, context) {
    const { ticketId: _ticketId, pendingTime, ...body } = input;
    if (Object.keys(body).length === 0 && pendingTime === undefined)
      throw new ProviderRequestError(400, "update_ticket requires a field to update");
    return {
      ticket: await request(`/api/v1/tickets/${id(input)}`, "PUT", { ...body, pending_time: pendingTime }, context),
    };
  },
  async list_ticket_articles(input, context) {
    return { articles: await request(`/api/v1/ticket_articles/by_ticket/${id(input)}`, "GET", {}, context) };
  },
  async create_ticket_article(input, context) {
    const { ticketId, articleType, contentType, ...article } = input;
    return {
      article: await request(
        "/api/v1/ticket_articles",
        "POST",
        { ...article, ticket_id: ticketId, type: articleType ?? "note", content_type: contentType ?? "text/plain" },
        context,
      ),
    };
  },
  async search_users(input, context) {
    return {
      users: await request(
        "/api/v1/users/search",
        "GET",
        { query: input.query, page: input.page, per_page: input.perPage },
        context,
      ),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service: "zammad",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "zammad");
    return { baseUrl: baseUrl(credential.values.baseUrl), apiKey: credential.apiKey, fetcher, signal: context.signal };
  },
  handlers,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const resolvedBaseUrl = baseUrl(input.values.baseUrl);
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    const user = await request(
      "/api/v1/users/me",
      "GET",
      {},
      {
        baseUrl: resolvedBaseUrl,
        apiKey: input.apiKey,
        fetcher: guardedFetcher,
        signal,
      },
    );
    const record = user && typeof user === "object" && !Array.isArray(user) ? (user as Record<string, unknown>) : {};
    const userId = typeof record.id === "number" && Number.isInteger(record.id) ? record.id : undefined;
    const name = [record.firstname, record.lastname].filter((value) => typeof value === "string" && value).join(" ");
    const displayName =
      name ||
      (typeof record.email === "string" ? record.email : undefined) ||
      (typeof record.login === "string" ? record.login : undefined) ||
      "Zammad API Token";
    return {
      profile: {
        accountId: userId === undefined ? `zammad:${new URL(resolvedBaseUrl).host}` : `zammad:user:${userId}`,
        displayName,
      },
      grantedScopes: [],
      metadata: {
        baseUrl: resolvedBaseUrl,
        apiBaseUrl: resolvedBaseUrl,
        validationEndpoint: "/api/v1/users/me",
        ...(userId === undefined ? {} : { userId }),
      },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "zammad",
  async baseUrl(context) {
    return baseUrl((await requireApiKeyCredential(context, "zammad")).values.baseUrl);
  },
  auth: { type: "api_key_authorization", prefix: "Token token=" },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});
