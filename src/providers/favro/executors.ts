import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

interface Context {
  authorization: string;
  organizationId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
async function request(
  path: string,
  input: Record<string, unknown>,
  context: Context,
  method = "GET",
): Promise<{ payload: unknown; backendIdentifier: string | null }> {
  const url = new URL(path, "https://favro.com/api/v1/");
  const body = { ...input };
  const backendIdentifier = typeof body.backendIdentifier === "string" ? body.backendIdentifier : undefined;
  delete body.backendIdentifier;
  if (method === "GET")
    for (const [key, value] of Object.entries(body)) if (value !== undefined) url.searchParams.set(key, String(value));
  const headers = new Headers({
    accept: "application/json",
    authorization: context.authorization,
    organizationId: context.organizationId,
    "user-agent": providerUserAgent,
  });
  if (backendIdentifier) headers.set("x-favro-backend-identifier", backendIdentifier);
  if (method !== "GET") headers.set("content-type", "application/json");
  const response = await context.fetcher(url, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(body),
    signal: context.signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new ProviderRequestError(response.status, `Favro request failed with status ${response.status}`, payload);
  return { payload, backendIdentifier: response.headers.get("x-favro-backend-identifier") };
}
function entity(output: { payload: unknown }, key: string): Record<string, unknown> {
  return { [key]: output.payload };
}
function page(output: { payload: unknown; backendIdentifier: string | null }, key: string): Record<string, unknown> {
  const payload = output.payload as Record<string, unknown>;
  return {
    [key]: payload.entities ?? payload[key] ?? [],
    requestId: payload.requestId,
    page: payload.page,
    pages: payload.pages,
    limit: payload.limit,
    backendIdentifier: output.backendIdentifier,
  };
}
const handlers: ProviderActionHandlers<"favro", ProviderRuntimeHandler<Context>> = {
  async list_organizations(input, context) {
    return page(await request("organizations", input, context), "organizations");
  },
  async get_organization(_input, context) {
    return entity(
      await request(`organizations/${encodeURIComponent(context.organizationId)}`, {}, context),
      "organization",
    );
  },
  async list_collections(input, context) {
    return page(await request("collections", input, context), "collections");
  },
  async list_widgets(input, context) {
    return page(await request("widgets", input, context), "widgets");
  },
  async get_widget(input, context) {
    return entity(await request(`widgets/${encodeURIComponent(String(input.widgetCommonId))}`, {}, context), "widget");
  },
  async list_cards(input, context) {
    if (
      !["todoList", "cardCommonId", "cardSequentialId", "widgetCommonId", "columnId", "collectionId"].some(
        (key) => input[key] !== undefined,
      )
    )
      throw new ProviderRequestError(400, "At least one Favro card filter is required");
    return page(await request("cards", input, context), "cards");
  },
  async get_card(input, context) {
    const { cardId, ...query } = input;
    return entity(await request(`cards/${encodeURIComponent(String(cardId))}`, query, context), "card");
  },
  async create_card(input, context) {
    return entity(await request("cards", input, context, "POST"), "card");
  },
  async update_card(input, context) {
    const { cardId, ...body } = input;
    if (Object.keys(body).length === 0) throw new ProviderRequestError(400, "update_card requires a field to update");
    return entity(await request(`cards/${encodeURIComponent(String(cardId))}`, body, context, "PUT"), "card");
  },
};

export const executors: import("../../core/types.ts").ProviderExecutors = defineProviderExecutors<Context>({
  service: "favro",
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "favro");
    const email = credential.values.email;
    const organizationId = credential.values.organizationId;
    if (!email || !organizationId)
      throw new ProviderRequestError(401, "Configure the Favro email and organization ID first.");
    return {
      authorization: `Basic ${Buffer.from(`${email}:${credential.apiKey}`).toString("base64")}`,
      organizationId,
      fetcher,
      signal: context.signal,
    };
  },
  handlers,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "favro",
  baseUrl: "https://favro.com/api/v1",
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, "favro");
    const email = credential.values.email;
    const organizationId = credential.values.organizationId;
    if (!email || !organizationId)
      throw new ProviderRequestError(401, "Configure the Favro email and organization ID first.");
    headers.set("authorization", `Basic ${Buffer.from(`${email}:${credential.apiKey}`).toString("base64")}`);
    headers.set("organizationId", organizationId);
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const email = input.values.email;
    const organizationId = input.values.organizationId;
    if (!email || !organizationId) throw new ProviderRequestError(400, "Favro email and organizationId are required");
    const context = {
      authorization: `Basic ${Buffer.from(`${email}:${input.apiKey}`).toString("base64")}`,
      organizationId,
      fetcher,
      signal,
    };
    const result = await request(`organizations/${encodeURIComponent(organizationId)}`, {}, context);
    const organization = result.payload as Record<string, unknown>;
    return {
      profile: {
        accountId: organizationId,
        displayName: typeof organization.name === "string" ? organization.name : `Favro ${organizationId}`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: "https://favro.com/api/v1",
        organizationId,
        validationEndpoint: `/organizations/${organizationId}`,
      },
    };
  },
};
