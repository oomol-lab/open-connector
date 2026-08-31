import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { randomUUID } from "node:crypto";
import { optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "zotero";
const baseUrl = "https://api.zotero.org";
interface Context extends ApiKeyProviderContext {
  userId?: number;
}
const handlers = {
  async list_groups(input: Record<string, unknown>, context: Context) {
    const userId = await connectedUserId(context);
    const result = await request(`/users/${userId}/groups`, { query: pagination(input) }, context);
    return page("groups", result);
  },
  async list_collections(input: Record<string, unknown>, context: Context) {
    const prefix = await libraryPrefix(input, context);
    const result = await request(
      `${prefix}/collections${input.topLevelOnly ? "/top" : ""}`,
      { query: pagination(input) },
      context,
    );
    return page("collections", result, true);
  },
  async get_collection(input: Record<string, unknown>, context: Context) {
    const value = record(
      (
        await request(
          `${await libraryPrefix(input, context)}/collections/${key(input.collectionKey, "collectionKey")}`,
          {},
          context,
        )
      ).payload,
      "collection",
    );
    return { collection: value, version: integer(value.version, "collection.version") };
  },
  async create_collection(input: Record<string, unknown>, context: Context) {
    const result = await request(
      `${await libraryPrefix(input, context)}/collections`,
      {
        method: "POST",
        body: [{ name: text(input.name, "name"), parentCollection: input.parentCollection }],
        writeToken: true,
      },
      context,
    );
    return {
      collection: successful(result.payload, "collection"),
      libraryVersion: headerInteger(result.response.headers, "last-modified-version"),
    };
  },
  async update_collection(input: Record<string, unknown>, context: Context) {
    const collectionKey = key(input.collectionKey, "collectionKey");
    const version = versionInput(input.version);
    const result = await request(
      `${await libraryPrefix(input, context)}/collections/${collectionKey}`,
      {
        method: "PUT",
        body: { key: collectionKey, version, name: text(input.name, "name"), parentCollection: input.parentCollection },
        version,
      },
      context,
    );
    return {
      collection: record(result.payload, "collection"),
      libraryVersion: headerInteger(result.response.headers, "last-modified-version"),
    };
  },
  async delete_collection(input: Record<string, unknown>, context: Context) {
    const collectionKey = key(input.collectionKey, "collectionKey");
    const result = await request(
      `${await libraryPrefix(input, context)}/collections/${collectionKey}`,
      { method: "DELETE", version: versionInput(input.version) },
      context,
    );
    return {
      collectionKey,
      deleted: true,
      libraryVersion: headerInteger(result.response.headers, "last-modified-version"),
    };
  },
  async list_items(input: Record<string, unknown>, context: Context) {
    const prefix = await libraryPrefix(input, context);
    const root = input.collectionKey
      ? `${prefix}/collections/${key(input.collectionKey, "collectionKey")}/items`
      : `${prefix}/items`;
    const result = await request(
      `${root}${input.topLevelOnly ? "/top" : ""}`,
      {
        query: {
          ...pagination(input),
          q: optionalRawString(input.q),
          qmode: optionalRawString(input.qmode),
          itemType: optionalRawString(input.itemType),
          tag: optionalRawString(input.tag),
          since: input.since as number | undefined,
          includeTrashed: typeof input.includeTrashed === "boolean" ? Number(input.includeTrashed) : undefined,
          sort: optionalRawString(input.sort),
          direction: optionalRawString(input.direction),
        },
      },
      context,
    );
    return page("items", result, true);
  },
  async get_item(input: Record<string, unknown>, context: Context) {
    const value = record(
      (await request(`${await libraryPrefix(input, context)}/items/${key(input.itemKey, "itemKey")}`, {}, context))
        .payload,
      "item",
    );
    return { item: value, version: integer(value.version, "item.version") };
  },
  async create_item(input: Record<string, unknown>, context: Context) {
    const result = await request(
      `${await libraryPrefix(input, context)}/items`,
      { method: "POST", body: [record(input.item, "item")], writeToken: true },
      context,
    );
    return {
      item: successful(result.payload, "item"),
      libraryVersion: headerInteger(result.response.headers, "last-modified-version"),
    };
  },
  async update_item(input: Record<string, unknown>, context: Context) {
    const itemKey = key(input.itemKey, "itemKey");
    const changes = record(input.changes, "changes");
    if (Object.keys(changes).length === 0)
      throw new ProviderRequestError(400, "At least one Zotero item field must be provided for an update.");
    const result = await request(
      `${await libraryPrefix(input, context)}/items/${itemKey}`,
      { method: "PATCH", body: changes, version: versionInput(input.version) },
      context,
    );
    return { itemKey, updated: true, libraryVersion: headerInteger(result.response.headers, "last-modified-version") };
  },
  async delete_item(input: Record<string, unknown>, context: Context) {
    const itemKey = key(input.itemKey, "itemKey");
    const result = await request(
      `${await libraryPrefix(input, context)}/items/${itemKey}`,
      { method: "DELETE", version: versionInput(input.version) },
      context,
    );
    return { itemKey, deleted: true, libraryVersion: headerInteger(result.response.headers, "last-modified-version") };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const result = await request("/keys/current", {}, { apiKey: input.apiKey, fetcher, signal });
    const identity = record(result.payload, "key identity");
    const userId = positiveInteger(identity.userID, "userID");
    const username = optionalRawString(identity.username);
    return {
      profile: { accountId: String(userId), displayName: username ?? `Zotero user ${userId}` },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, apiVersion: "3", userId, username, access: identity.access },
    };
  },
};
interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  version?: number;
  writeToken?: boolean;
}
async function request(
  path: string,
  options: RequestOptions,
  context: Pick<Context, "apiKey" | "fetcher" | "signal">,
): Promise<{ response: Response; payload: unknown }> {
  const url = new URL(path, baseUrl);
  for (const [name, value] of Object.entries(options.query ?? {}))
    if (value !== undefined && value !== "") url.searchParams.set(name, String(value));
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "zotero-api-key": context.apiKey,
    "zotero-api-version": "3",
  });
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.version !== undefined) headers.set("if-unmodified-since-version", String(options.version));
  if (options.writeToken) headers.set("zotero-write-token", randomUUID().replaceAll("-", ""));
  const response = await context.fetcher(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: context.signal,
  });
  const raw = await response.text();
  let payload: unknown = null;
  if (raw)
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  if (!response.ok) throw zoteroError(response.status, payload);
  return { response, payload };
}
async function connectedUserId(context: Context): Promise<number> {
  if (context.userId) return context.userId;
  const identity = record((await request("/keys/current", {}, context)).payload, "key identity");
  return positiveInteger(identity.userID, "userID");
}
async function libraryPrefix(input: Record<string, unknown>, context: Context): Promise<string> {
  if (input.libraryType === "group") {
    const id = positiveInteger(input.libraryId, "libraryId");
    return `/groups/${id}`;
  }
  return `/users/${input.libraryId === undefined ? await connectedUserId(context) : positiveInteger(input.libraryId, "libraryId")}`;
}
function page(
  name: string,
  result: { response: Response; payload: unknown },
  version = false,
): Record<string, unknown> {
  const values = array(result.payload, name);
  const output: Record<string, unknown> = {
    [name]: values,
    totalResults: headerInteger(result.response.headers, "total-results") ?? values.length,
    nextStart: nextStart(result.response.headers.get("link")),
  };
  if (version) output.libraryVersion = headerInteger(result.response.headers, "last-modified-version");
  return output;
}
function pagination(input: Record<string, unknown>): Record<string, number | undefined> {
  return {
    limit: typeof input.limit === "number" ? input.limit : undefined,
    start: typeof input.start === "number" ? input.start : undefined,
  };
}
function successful(payload: unknown, label: string): Record<string, unknown> {
  const response = record(payload, `${label} write response`);
  const failed = optionalRecord(response.failed);
  const failure = optionalRecord(failed?.["0"]);
  if (failure)
    throw new ProviderRequestError(400, optionalRawString(failure.message) ?? `Zotero failed to create ${label}`);
  return record(record(response.successful, "successful writes")["0"], `created ${label}`);
}
function zoteroError(status: number, payload: unknown): ProviderRequestError {
  const message =
    typeof payload === "string"
      ? payload
      : (optionalRawString(optionalRecord(payload)?.message) ?? `Zotero request failed with status ${status}`);
  return new ProviderRequestError(
    status === 429 ? 429 : status === 401 || status === 403 ? 401 : status < 500 ? 400 : 502,
    message,
    payload,
  );
}
function nextStart(link: string | null): number | null {
  if (!link) return null;
  for (const part of link.split(","))
    if (part.includes('rel="next"')) {
      const start = new URL(part.slice(part.indexOf("<") + 1, part.indexOf(">")), baseUrl).searchParams.get("start");
      const value = Number(start);
      return Number.isInteger(value) && value >= 0 ? value : null;
    }
  return null;
}
function headerInteger(headers: Headers, name: string): number | null {
  const value = Number(headers.get(name));
  return Number.isInteger(value) && value >= 0 ? value : null;
}
function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ProviderRequestError(400, `${name} is required`);
  return value.trim();
}
function key(value: unknown, name: string): string {
  const result = text(value, name);
  const allowed = new Set("23456789ABCDEFGHIJKLMNPQRSTUVWXYZ");
  if (result.length !== 8 || Array.from(result).some((character) => !allowed.has(character)))
    throw new ProviderRequestError(400, `${name} is not a valid Zotero key`);
  return result;
}
function versionInput(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0)
    throw new ProviderRequestError(400, "version must be a non-negative integer");
  return value as number;
}
function integer(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 0)
    throw new ProviderRequestError(502, `Zotero ${name} is invalid`);
  return value as number;
}
function positiveInteger(value: unknown, name: string): number {
  const result = integer(value, name);
  if (result === 0) throw new ProviderRequestError(400, `${name} must be positive`);
  return result;
}
function record(value: unknown, name: string): Record<string, unknown> {
  const result = optionalRecord(value);
  if (!result) throw new ProviderRequestError(502, `Zotero ${name} is not an object`);
  return result;
}
function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `Zotero ${name} is not an array`);
  return value;
}
