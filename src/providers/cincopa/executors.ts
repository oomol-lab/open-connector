import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "cincopa";
const apiBaseUrl = "https://api.cincopa.com/v2";
const validationPath = "/ping.json";
const requestTimeoutMs = 30_000;

type CincopaMode = "validate" | "execute";
interface CincopaContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const cincopaActionHandlers: ProviderActionHandlers<
  "cincopa",
  (input: Record<string, unknown>, context: CincopaContext) => Promise<unknown>
> = {
  async list_galleries(input, context) {
    const body = await requestBody(
      {
        context,
        path: "/gallery.list.json",
        mode: "execute",
        query: compactQuery({
          search: optionalString(input.search),
          page: optionalPositiveInteger(input.page, "page"),
          items_per_page: optionalPositiveInteger(input.itemsPerPage, "itemsPerPage"),
          filter_tags: joinStringArray(input.filterTags),
        }),
      },
      "Cincopa gallery list response",
    );
    return {
      workspace: requireProviderStringValue(body.workspace, "workspace"),
      galleries: arrayRecords(body.galleries, "galleries", "gallery row"),
      tagCloud: readTagCloud(body.tag_cloud),
      pagination: readPagination(body.items_data, "page_count"),
    };
  },
  async list_gallery_items(input, context) {
    const fid = requiredString(input.fid, "fid");
    const body = await requestBody(
      {
        context,
        path: "/gallery.get_items.json",
        mode: "execute",
        query: compactQuery({
          fid,
          details: joinStringArray(input.details),
          page: optionalPositiveInteger(input.page, "page"),
          items_per_page: optionalPositiveInteger(input.itemsPerPage, "itemsPerPage"),
        }),
      },
      "Cincopa gallery items response",
    );
    const folder = requiredRecord(body.folder, "folder", providerError);
    return {
      fid: requireProviderString(body.fid, "fid"),
      uploadUrl: requireProviderString(body.upload_url, "upload_url"),
      claimed: requireProviderString(body.claimed, "claimed"),
      spfid: requireProviderString(body.spfid, "spfid"),
      items: arrayRecords(folder.items, "folder.items", "gallery item row"),
      pagination: readPagination(folder.items_data, "pages_count"),
    };
  },
  async list_assets(input, context) {
    const body = await requestBody(
      {
        context,
        path: "/asset.list.json",
        mode: "execute",
        query: compactQuery({
          search: optionalString(input.search),
          type: joinStringArray(input.types),
          rid: optionalString(input.rid),
          reference_id: optionalString(input.referenceId),
          tag: optionalString(input.tag),
          details: joinStringArray(input.details),
          page: optionalPositiveInteger(input.page, "page"),
          items_per_page: optionalPositiveInteger(input.itemsPerPage, "itemsPerPage"),
        }),
      },
      "Cincopa asset list response",
    );
    return {
      items: arrayRecords(body.items, "items", "asset row"),
      pagination: readPagination(body.items_data, "pages_count"),
    };
  },
  async list_asset_tags(_input, context) {
    const body = await requestBody(
      { context, path: "/asset.get_tags.json", mode: "execute" },
      "Cincopa asset tags response",
    );
    return { tagCloud: readTagCloud(body.tag_cloud) };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cincopaActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const body = await requestBody(
      { context: { apiKey: input.apiKey, fetcher, signal }, path: validationPath, mode: "validate" },
      "Cincopa ping response",
    );
    const accountId = requireProviderString(body.accid, "accid");
    return {
      profile: {
        accountId,
        displayName: optionalString(body.useremail) ?? optionalString(body.accemail) ?? "Cincopa API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        validationEndpoint: validationPath,
        accountEmail: optionalString(body.accemail),
        accountId,
        userEmail: optionalString(body.useremail),
        userId: optionalString(body.userid),
        permissions: optionalString(body.permissions),
      }),
    };
  },
};

async function requestBody(
  input: {
    context: CincopaContext;
    path: string;
    mode: CincopaMode;
    query?: Record<string, string | undefined>;
  },
  label: string,
): Promise<Record<string, unknown>> {
  return requiredRecord(await requestJson(input), label, providerError);
}

async function requestJson(input: {
  context: CincopaContext;
  path: string;
  mode: CincopaMode;
  query?: Record<string, string | undefined>;
}): Promise<unknown> {
  const signal = input.context.signal
    ? AbortSignal.any([input.context.signal, AbortSignal.timeout(requestTimeoutMs)])
    : AbortSignal.timeout(requestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildUrl(input.path, input.query ?? {}, input.context.apiKey), {
      method: "GET",
      headers: { accept: "application/json", "user-agent": providerUserAgent },
      signal,
    });
    payload = await readJson(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (isAbortLikeError(error)) throw new ProviderRequestError(504, "Cincopa request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Cincopa request failed: ${error.message}` : "Cincopa request failed",
    );
  }
  if (!response.ok) throw createError(response.status, payload, input.mode);
  return payload;
}

function buildUrl(path: string, query: Record<string, string | undefined>, apiKey: string): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${apiBaseUrl}/`);
  url.searchParams.set("api_token", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Cincopa returned invalid JSON");
  }
}

function createError(status: number, payload: unknown, mode: CincopaMode): ProviderRequestError {
  const body = optionalRecord(payload);
  const message =
    optionalString(body?.message) ?? optionalString(body?.error) ?? `Cincopa request failed with status ${status}`;
  if (status === 403) return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(502, message, payload);
}

function compactQuery(input: Record<string, string | number | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
  );
}

function readPagination(value: unknown, pageCountField: "page_count" | "pages_count"): Record<string, number> {
  const record = requiredRecord(value, "pagination", providerError);
  return {
    page: requireInteger(record.page, "page"),
    itemsPerPage: requireInteger(record.items_per_page, "items_per_page"),
    itemsCount: requireInteger(record.items_count, "items_count"),
    pageCount: requireInteger(record[pageCountField], pageCountField),
  };
}

function readTagCloud(value: unknown): Record<string, number> {
  const record = requiredRecord(value, "tag_cloud", providerError);
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [key, requireInteger(child, `tag_cloud.${key}`)]),
  );
}

function arrayRecords(value: unknown, fieldName: string, itemName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `Cincopa returned invalid ${fieldName}`);
  return value.map((item) => requiredRecord(item, itemName, providerError));
}

function requireProviderString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) throw new ProviderRequestError(502, `Cincopa returned invalid ${fieldName}`);
  return text;
}

function requireProviderStringValue(value: unknown, fieldName: string): string {
  if (typeof value !== "string") throw new ProviderRequestError(502, `Cincopa returned invalid ${fieldName}`);
  return value;
}

function requireInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) throw new ProviderRequestError(502, `Cincopa returned invalid ${fieldName}`);
  return parsed;
}

function optionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0)
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  return parsed;
}

function joinStringArray(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) throw new ProviderRequestError(400, "array input is required");
  return value.map((item) => requiredString(item, "array value")).join(",");
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Cincopa returned invalid ${message}`);
}
