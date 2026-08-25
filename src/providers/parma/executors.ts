import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";
type Context = Parameters<Parameters<typeof defineApiKeyProviderExecutors>[1][string]>[1];
const routes: Record<string, { method: string; path: string; query?: string[]; body?: string[]; deleted?: boolean }> = {
  list_deals: { method: "GET", path: "/api/v1/deals", query: ["page"] },
  get_deal: { method: "GET", path: "/api/v1/deals/{id}" },
  list_groups: { method: "GET", path: "/api/v1/groups", query: ["query"] },
  list_notes: { method: "GET", path: "/api/v1/notes", query: ["page"] },
  create_note: { method: "POST", path: "/api/v1/notes", body: ["datetime", "relationship_ids", "body"] },
  update_note: { method: "PATCH", path: "/api/v1/notes/{id}", body: ["datetime", "relationship_ids", "body"] },
  list_pipelines: { method: "GET", path: "/api/v1/pipelines" },
  get_pipeline: { method: "GET", path: "/api/v1/pipelines/{id}" },
  list_relationship_groups: { method: "GET", path: "/api/v1/relationships/{relationship_id}/groups" },
  add_relationship_to_group: {
    method: "POST",
    path: "/api/v1/relationships/{relationship_id}/groups",
    body: ["group_id"],
  },
  remove_relationship_from_group: {
    method: "DELETE",
    path: "/api/v1/relationships/{relationship_id}/groups/{relationship_group_id}",
    deleted: true,
  },
  list_relationship_notes: { method: "GET", path: "/api/v1/relationships/{relationship_id}/notes", query: ["page"] },
  list_relationships: {
    method: "GET",
    path: "/api/v1/relationships",
    query: [
      "name",
      "type",
      "page",
      "schedulinglink",
      "linkedin",
      "instagram",
      "twitter",
      "telegram",
      "sms",
      "phone",
      "whatsapp",
      "email",
    ],
  },
  create_relationship: {
    method: "POST",
    path: "/api/v1/relationships",
    body: ["name", "type", "company_id", "group_ids", "about"],
  },
  get_relationship: { method: "GET", path: "/api/v1/relationships/{id}" },
  update_relationship: {
    method: "PATCH",
    path: "/api/v1/relationships/{id}",
    body: ["name", "type", "company_id", "group_ids", "about", "properties"],
  },
  delete_relationship: { method: "DELETE", path: "/api/v1/relationships/{id}", deleted: true },
  list_stages: { method: "GET", path: "/api/v1/stages" },
  get_stage: { method: "GET", path: "/api/v1/stages/{id}" },
  list_users: { method: "GET", path: "/api/v1/users" },
  get_user: { method: "GET", path: "/api/v1/users/{id}" },
  get_current_user: { method: "GET", path: "/api/v1/users/me" },
};
async function execute(name: string, input: Record<string, unknown>, context: Context): Promise<unknown> {
  const route = routes[name]!;
  let path = route.path;
  for (const key of ["id", "relationship_id", "relationship_group_id"])
    path = path.replace(`{${key}}`, encodeURIComponent(String(input[key])));
  const url = new URL(path, "https://app.parma.ai");
  for (const key of route.query ?? []) if (input[key] !== undefined) url.searchParams.set(key, String(input[key]));
  const body = route.body
    ? Object.fromEntries(route.body.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]))
    : undefined;
  const response = await context.fetcher(url, {
    method: route.method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: context.signal,
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok)
    throw new ProviderRequestError(response.status, `Parma request failed with status ${response.status}`, payload);
  return route.deleted ? { deleted: true } : payload;
}
const handlers: ProviderActionHandlers<"parma", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  list_deals: (input, context) => execute("list_deals", input, context),
  get_deal: (input, context) => execute("get_deal", input, context),
  list_groups: (input, context) => execute("list_groups", input, context),
  list_notes: (input, context) => execute("list_notes", input, context),
  create_note: (input, context) => execute("create_note", input, context),
  update_note: (input, context) => execute("update_note", input, context),
  list_pipelines: (input, context) => execute("list_pipelines", input, context),
  get_pipeline: (input, context) => execute("get_pipeline", input, context),
  list_relationship_groups: (input, context) => execute("list_relationship_groups", input, context),
  add_relationship_to_group: (input, context) => execute("add_relationship_to_group", input, context),
  remove_relationship_from_group: (input, context) => execute("remove_relationship_from_group", input, context),
  list_relationship_notes: (input, context) => execute("list_relationship_notes", input, context),
  list_relationships: (input, context) => execute("list_relationships", input, context),
  create_relationship: (input, context) => execute("create_relationship", input, context),
  get_relationship: (input, context) => execute("get_relationship", input, context),
  update_relationship: (input, context) => execute("update_relationship", input, context),
  delete_relationship: (input, context) => execute("delete_relationship", input, context),
  list_stages: (input, context) => execute("list_stages", input, context),
  get_stage: (input, context) => execute("get_stage", input, context),
  list_users: (input, context) => execute("list_users", input, context),
  get_user: (input, context) => execute("get_user", input, context),
  get_current_user: (input, context) => execute("get_current_user", input, context),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("parma", handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "parma",
  baseUrl: "https://app.parma.ai",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = (await execute("get_current_user", {}, { apiKey: input.apiKey, fetcher, signal })) as Record<
      string,
      unknown
    >;
    const data = payload.data as Record<string, unknown> | undefined;
    const user = data?.user as Record<string, unknown> | undefined;
    const account = data?.account as Record<string, unknown> | undefined;
    const accountId = String(account?.id ?? user?.id ?? "api_key");
    const displayName = [account?.name, user?.name, user?.email].find((value) => typeof value === "string") as
      | string
      | undefined;
    return {
      profile: { accountId, displayName: displayName ?? "Parma API Token" },
      grantedScopes: [],
      metadata: { accountId: account?.id, validationEndpoint: "/api/v1/users/me" },
    };
  },
};
