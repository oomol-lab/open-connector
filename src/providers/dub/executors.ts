import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  nullableString,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "dub";
export const dubApiBaseUrl = "https://api.dub.co";
const dubLinksPath = "/links";
const dubLinksInfoPath = "/links/info";
const dubLinksCountPath = "/links/count";
const dubTagsPath = "/tags";
const dubFoldersPath = "/folders";
const dubAnalyticsPath = "/analytics";

type DubRequestPhase = "validate" | "execute";
type DubActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const dubActionHandlers: ProviderActionHandlers<"dub", DubActionHandler> = {
  create_link(input, context) {
    return executeCreateLink(input, context);
  },
  list_links(input, context) {
    return executeListLinks(input, context);
  },
  retrieve_link(input, context) {
    return executeRetrieveLink(input, context);
  },
  update_link(input, context) {
    return executeUpdateLink(input, context);
  },
  delete_link(input, context) {
    const linkId = readRequiredString(input.linkId, "linkId");
    return executeDeleteResource(`${dubLinksPath}/${encodeURIComponent(linkId)}`, context);
  },
  count_links(input, context) {
    return executeCountLinks(input, context);
  },
  list_tags(input, context) {
    return executeListTags(input, context);
  },
  create_tag(input, context) {
    return executeCreateTag(input, context);
  },
  update_tag(input, context) {
    return executeUpdateTag(input, context);
  },
  delete_tag(input, context) {
    const tagId = readRequiredString(input.id, "id");
    return executeDeleteResource(`${dubTagsPath}/${encodeURIComponent(tagId)}`, context);
  },
  list_folders(input, context) {
    return executeListFolders(input, context);
  },
  create_folder(input, context) {
    return executeCreateFolder(input, context);
  },
  update_folder(input, context) {
    return executeUpdateFolder(input, context);
  },
  delete_folder(input, context) {
    const folderId = readRequiredString(input.id, "id");
    return executeDeleteResource(`${dubFoldersPath}/${encodeURIComponent(folderId)}`, context);
  },
  retrieve_analytics(input, context) {
    return executeRetrieveAnalytics(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, dubActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await dubGetJson(dubLinksCountPath, {}, input.apiKey, fetcher, "validate", signal);
    return {
      profile: { accountId: "dub:api_key", displayName: "Dub API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: dubApiBaseUrl, validationEndpoint: dubLinksCountPath },
    };
  },
};

async function executeCreateLink(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await dubRequestJson(
    "POST",
    dubLinksPath,
    {},
    compactObject(input),
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return { link: normalizeLink(payload) };
}

async function executeListLinks(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await dubGetJson(
    dubLinksPath,
    compactObject(input),
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return {
    links: asArray(payload, "links").map((item) => normalizeLink(item)),
  };
}

async function executeRetrieveLink(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const query = compactObject({
    linkId: optionalString(input.linkId),
    domain: optionalString(input.domain),
    key: optionalString(input.key),
    externalId: optionalString(input.externalId),
  });
  if (Object.keys(query).length === 0) {
    throw new ProviderRequestError(400, "retrieve_link requires linkId, externalId, or both domain and key");
  }
  if (!query.linkId && !query.externalId && !(query.domain && query.key)) {
    throw new ProviderRequestError(400, "retrieve_link domain lookup requires both domain and key");
  }

  const payload = await dubGetJson(dubLinksInfoPath, query, context.apiKey, context.fetcher, "execute", context.signal);
  return { link: normalizeLink(payload) };
}

async function executeUpdateLink(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const { linkId, ...body } = input;
  const patch = compactObject(body);
  assertNonEmptyPatch(patch, "update_link");
  const payload = await dubRequestJson(
    "PATCH",
    `${dubLinksPath}/${encodeURIComponent(readRequiredString(linkId, "linkId"))}`,
    {},
    patch,
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return { link: normalizeLink(payload) };
}

async function executeCountLinks(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await dubGetJson(
    dubLinksCountPath,
    compactObject(input),
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return {
    count: extractCount(payload),
    raw: payload,
  };
}

async function executeListTags(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await dubGetJson(
    dubTagsPath,
    compactObject(input),
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return {
    tags: asArray(payload, "tags").map((item) => normalizeTag(item)),
  };
}

async function executeCreateTag(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await dubRequestJson(
    "POST",
    dubTagsPath,
    {},
    compactObject(input),
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return { tag: normalizeTag(payload) };
}

async function executeUpdateTag(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const { id, ...body } = input;
  const patch = compactObject(body);
  assertNonEmptyPatch(patch, "update_tag");
  const payload = await dubRequestJson(
    "PATCH",
    `${dubTagsPath}/${encodeURIComponent(readRequiredString(id, "id"))}`,
    {},
    patch,
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return { tag: normalizeTag(payload) };
}

async function executeListFolders(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await dubGetJson(
    dubFoldersPath,
    compactObject(input),
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return {
    folders: asArray(payload, "folders").map((item) => normalizeFolder(item)),
  };
}

async function executeCreateFolder(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await dubRequestJson(
    "POST",
    dubFoldersPath,
    {},
    compactObject(input),
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return { folder: normalizeFolder(payload) };
}

async function executeUpdateFolder(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const { id, ...body } = input;
  const patch = compactObject(body);
  assertNonEmptyPatch(patch, "update_folder");
  const payload = await dubRequestJson(
    "PATCH",
    `${dubFoldersPath}/${encodeURIComponent(readRequiredString(id, "id"))}`,
    {},
    patch,
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return { folder: normalizeFolder(payload) };
}

async function executeRetrieveAnalytics(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await dubGetJson(
    dubAnalyticsPath,
    compactObject(input),
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return { data: payload };
}

async function executeDeleteResource(path: string, context: ApiKeyProviderContext) {
  const payload = await dubRequestJson(
    "DELETE",
    path,
    {},
    undefined,
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return {
    deleted: true,
    raw: payload,
  };
}

async function dubGetJson(
  path: string,
  query: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: DubRequestPhase,
  signal?: AbortSignal,
) {
  return dubRequestJson("GET", path, query, undefined, apiKey, fetcher, phase, signal);
}

async function dubRequestJson(
  method: string,
  path: string,
  query: Record<string, unknown>,
  body: Record<string, unknown> | undefined,
  apiKey: string,
  fetcher: typeof fetch,
  phase: DubRequestPhase,
  signal?: AbortSignal,
) {
  const url = new URL(path, dubApiBaseUrl);
  appendQuery(url, query);

  let response: Response;
  let payload: unknown;
  try {
    response = await fetcher(url, {
      method,
      headers: dubHeaders(apiKey, body === undefined ? {} : { "content-type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    payload = await readDubPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `dub request failed: ${error.message}` : "dub request failed",
    );
  }

  if (!response.ok) {
    throw createDubError(response, payload, phase);
  }

  return payload;
}

function appendQuery(url: URL, query: Record<string, unknown>) {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      url.searchParams.set(key, value.map((item) => String(item)).join(","));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

function dubHeaders(apiKey: string, extraHeaders: Record<string, string>) {
  return {
    accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readDubPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createDubError(response: Response, payload: unknown, phase: DubRequestPhase) {
  const message = extractDubErrorMessage(payload) ?? response.statusText ?? "dub request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(409, message);
  }

  if (phase === "execute" && [400, 404, 409, 410, 422].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function extractDubErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  const object = asLooseObject(payload);
  if (!object) {
    return undefined;
  }

  const nestedError = asLooseObject(object.error);
  return optionalString(nestedError?.message) ?? optionalString(object.message) ?? optionalString(object.error);
}

function normalizeLink(payload: unknown) {
  const object = requiredRecord(payload, "link", (message) => new ProviderRequestError(502, message));
  return {
    id: readRequiredString(object.id, "link.id"),
    domain: readRequiredString(object.domain, "link.domain"),
    key: readRequiredString(object.key, "link.key"),
    url: readRequiredString(object.url, "link.url"),
    shortLink: nullableString(object.shortLink),
    qrCode: nullableString(object.qrCode),
    title: nullableString(object.title),
    archived: nullableBoolean(object.archived),
    clicks: optionalNumber(object.clicks) ?? null,
    leads: optionalNumber(object.leads) ?? null,
    sales: optionalNumber(object.sales) ?? null,
    saleAmount: optionalNumber(object.saleAmount) ?? null,
    createdAt: nullableString(object.createdAt),
    updatedAt: nullableString(object.updatedAt),
    raw: object,
  };
}

function normalizeTag(payload: unknown) {
  const object = requiredRecord(payload, "tag", (message) => new ProviderRequestError(502, message));
  return {
    id: readRequiredString(object.id, "tag.id"),
    name: readRequiredString(object.name, "tag.name"),
    color: nullableString(object.color),
    raw: object,
  };
}

function normalizeFolder(payload: unknown) {
  const object = requiredRecord(payload, "folder", (message) => new ProviderRequestError(502, message));
  return {
    id: readRequiredString(object.id, "folder.id"),
    name: readRequiredString(object.name, "folder.name"),
    accessLevel: nullableString(object.accessLevel),
    raw: object,
  };
}

function extractCount(payload: unknown) {
  if (typeof payload === "number") {
    return payload;
  }

  const object = asLooseObject(payload);
  const count = optionalNumber(object?.count) ?? optionalNumber(object?.links);
  if (count !== undefined) {
    return count;
  }

  throw new ProviderRequestError(502, "dub count response did not include count");
}

function asArray(payload: unknown, fieldName: string) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `dub ${fieldName} response was not an array`);
  }
  return payload;
}

function asLooseObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function nullableBoolean(value: unknown) {
  if (value === null) {
    return null;
  }
  return optionalBoolean(value) ?? null;
}

function assertNonEmptyPatch(patch: Record<string, unknown>, actionName: string) {
  if (Object.keys(patch).length > 0) {
    return;
  }

  throw new ProviderRequestError(400, `${actionName} requires at least one field to update`);
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value === "string" && value) {
    return value;
  }
  throw new ProviderRequestError(502, `dub response missing ${fieldName}`);
}
