import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";

const accountId = s.string("The account ID. Defaults to the connection account, or the only accessible account.");

const namespaceId = s.nonEmptyString("The KV namespace ID.");

const record = s.looseObject("The Cloudflare resource, including additional upstream fields.");

const page = s.integer("The result page number.", { minimum: 1 });

const perPage = s.integer("The number of results per page.", { minimum: 1 });

const key = s.nonEmptyString("The KV key name.");

const queryFields = { page, perPage };

const listOutput = {
  items: s.array("The returned resources.", record),
  resultInfo: s.looseObject("Upstream pagination metadata, including cursors."),
};

const resultOutput = { result: record };

export const actions: ActionDefinition[] = [
  defineProviderAction("cloudflare", {
    name: "list_kv_namespaces",
    description: "List Workers KV namespaces in an account.",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["Workers KV Storage Read"],
    inputSchema: s.object(
      "The action parameters.",
      { accountId, ...queryFields },
      { optional: ["accountId", "page", "perPage"] },
    ),
    outputSchema: s.requiredObject("The action result.", listOutput),
  }),
  defineProviderAction("cloudflare", {
    name: "create_kv_namespace",
    description: "Create a Workers KV namespace for application data.",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["Workers KV Storage Write"],
    inputSchema: s.object(
      "The action parameters.",
      {
        accountId,
        title: s.nonEmptyString("The namespace title."),
        jurisdiction: s.stringEnum(["eu", "fedramp", "us"], { description: "The namespace data jurisdiction." }),
        mode: s.stringEnum(["instant"], {
          description: "The namespace mode. Instant requires Cloudflare access to the feature.",
        }),
      },
      { optional: ["accountId", "jurisdiction", "mode"] },
    ),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction("cloudflare", {
    name: "rename_kv_namespace",
    description: "Rename a Workers KV namespace.",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["Workers KV Storage Write"],
    inputSchema: s.object(
      "The action parameters.",
      { accountId, namespaceId, title: s.nonEmptyString("The new namespace title.") },
      { optional: ["accountId"] },
    ),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction("cloudflare", {
    name: "delete_kv_namespace",
    description: "Delete a Workers KV namespace and all its keys.",
    operationType: "destructive",
    requiredScopes: [],
    providerPermissions: ["Workers KV Storage Write"],
    inputSchema: s.object("The action parameters.", { accountId, namespaceId }, { optional: ["accountId"] }),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction("cloudflare", {
    name: "list_kv_keys",
    description: "List keys and metadata in a Workers KV namespace.",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["Workers KV Storage Read"],
    inputSchema: s.object(
      "The action parameters.",
      {
        accountId,
        namespaceId,
        prefix: s.string("Filter by key prefix."),
        cursor: s.string("The cursor returned by a previous request."),
        limit: s.integer("Maximum keys to return.", { minimum: 1, maximum: 1000 }),
      },
      { optional: ["accountId", "prefix", "cursor", "limit"] },
    ),
    outputSchema: s.requiredObject("The action result.", listOutput),
  }),
  defineProviderAction("cloudflare", {
    name: "get_kv_value",
    description: "Read a Workers KV value as text or base64 for binary data.",
    operationType: "read",
    requiredScopes: [],
    providerPermissions: ["Workers KV Storage Read"],
    inputSchema: s.object(
      "The action parameters.",
      {
        accountId,
        namespaceId,
        key,
        encoding: s.stringEnum(["text", "base64"], { description: "The output encoding. Defaults to text." }),
      },
      { optional: ["accountId", "encoding"] },
    ),
    outputSchema: s.requiredObject("The action result.", { value: s.string("The stored value encoded as requested.") }),
  }),
  defineProviderAction("cloudflare", {
    name: "put_kv_value",
    description: "Write a Workers KV value with optional expiration and metadata.",
    operationType: "write",
    requiredScopes: [],
    providerPermissions: ["Workers KV Storage Write"],
    inputSchema: s.object(
      "The action parameters.",
      {
        accountId,
        namespaceId,
        key,
        value: s.string("The value to store."),
        encoding: s.stringEnum(["text", "base64"], { description: "The input value encoding. Defaults to text." }),
        expiration: s.integer("Absolute expiration as Unix seconds."),
        expirationTtl: s.integer("Expiration in seconds from now, at least 60.", { minimum: 60 }),
        metadata: s.looseObject("JSON metadata associated with the key."),
      },
      { optional: ["accountId", "encoding", "expiration", "expirationTtl", "metadata"] },
    ),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction("cloudflare", {
    name: "delete_kv_value",
    description: "Delete one key from a Workers KV namespace.",
    operationType: "destructive",
    requiredScopes: [],
    providerPermissions: ["Workers KV Storage Write"],
    inputSchema: s.object("The action parameters.", { accountId, namespaceId, key }, { optional: ["accountId"] }),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
];
