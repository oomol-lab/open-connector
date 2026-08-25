import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  defineOAuthProviderExecutors,
  mapProviderActionHandlers,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";
import { mendeleyActions } from "./actions.ts";

const service = "mendeley";
const mendeleyApiBaseUrl = "https://api.mendeley.com";
const mendeleyRequestTimeoutMs = 30_000;
const documentMediaType = "application/vnd.mendeley-document.1+json";
const profileMediaType = "application/vnd.mendeley-profiles.1+json";

interface MendeleyTokenPayload {
  error?: unknown;
  error_description?: unknown;
}

interface MendeleyTokenInput {
  grantType: "authorization_code" | "refresh_token";
}

const handlers: ProviderActionHandlers<
  "mendeley",
  ProviderRuntimeHandler<OAuthProviderContext>
> = mapProviderActionHandlers(
  service,
  mendeleyActions,
  (_action, name) => (input, context) => executeMendeleyAction(name, input, context.accessToken, context.fetcher),
);
export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, handlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const response = await requestMendeley(
      `${mendeleyApiBaseUrl}/profiles/me`,
      input.accessToken,
      fetcher,
      "validate credential",
      { accept: profileMediaType },
    );
    const profile = (await readJson(response, "profile")) as Record<string, unknown>;
    const accountId = requireString(profile.id, "Mendeley profile response is missing id");
    const composedName = [optionalString(profile.first_name), optionalString(profile.last_name)]
      .filter(Boolean)
      .join(" ");
    const displayName = optionalString(profile.display_name) ?? (composedName || accountId);
    return { profile: { accountId, displayName }, metadata: { profileId: accountId } };
  },
};

async function executeMendeleyAction(
  actionName: string,
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  if (actionName === "list_documents" || actionName === "search_catalog") {
    const path = actionName === "list_documents" ? "/documents" : "/search/catalog";
    const url = new URL(`${mendeleyApiBaseUrl}${path}`);
    setOptionalQuery(url, "view", input.view);
    setOptionalQuery(url, "group_id", input.groupId);
    setOptionalQuery(url, "modified_since", input.modifiedSince);
    setOptionalQuery(url, "deleted_since", input.deletedSince);
    setOptionalQuery(url, "limit", input.limit);
    setOptionalQuery(url, "sort", input.sort);
    setOptionalQuery(url, "order", input.order);
    setOptionalQuery(url, "marker", input.marker);
    if (actionName === "search_catalog") {
      setOptionalQuery(url, "query", input.query);
    }
    const response = await requestMendeley(url.toString(), accessToken, fetcher, actionName, {
      accept: documentMediaType,
    });
    const payload = await readJson(response, actionName);
    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Mendeley collection response is not an array");
    }
    return {
      documents: payload,
      ...parsePaginationMarkers(response.headers.get("link")),
    };
  }

  if (actionName === "create_document") {
    const response = await requestMendeley(`${mendeleyApiBaseUrl}/documents`, accessToken, fetcher, actionName, {
      method: "POST",
      accept: documentMediaType,
      contentType: documentMediaType,
      body: JSON.stringify(mapDocumentMetadata(input)),
    });
    return { document: await readJson(response, actionName) };
  }

  const documentId = requireString(input.documentId, "documentId is required");
  const isCatalog = actionName === "get_catalog_document";
  const path = isCatalog
    ? `/catalog/${encodeURIComponent(documentId)}`
    : `/documents/${encodeURIComponent(documentId)}`;
  const url = new URL(`${mendeleyApiBaseUrl}${path}`);
  setOptionalQuery(url, "view", input.view);

  if (actionName === "get_document" || isCatalog) {
    const response = await requestMendeley(url.toString(), accessToken, fetcher, actionName, {
      accept: documentMediaType,
    });
    return { document: await readJson(response, actionName) };
  }

  if (actionName === "delete_document") {
    await requestMendeley(url.toString(), accessToken, fetcher, actionName, {
      method: "DELETE",
      accept: documentMediaType,
    });
    return { deleted: true, documentId };
  }

  const response = await requestMendeley(url.toString(), accessToken, fetcher, actionName, {
    method: "PATCH",
    accept: documentMediaType,
    contentType: documentMediaType,
    body: JSON.stringify(mapDocumentMetadata(input)),
  });
  return { document: await readJson(response, actionName) };
}

interface MendeleyRequestOptions {
  method?: string;
  accept: string;
  contentType?: string;
  body?: string;
}

async function requestMendeley(
  url: string,
  accessToken: string,
  fetcher: typeof fetch,
  phase: string,
  options: MendeleyRequestOptions,
) {
  const headers = new Headers({
    accept: options.accept,
    authorization: `Bearer ${accessToken}`,
    "user-agent": providerUserAgent,
  });
  if (options.contentType) headers.set("content-type", options.contentType);
  const response = await fetcher(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
    signal: AbortSignal.timeout(mendeleyRequestTimeoutMs),
  });
  if (!response.ok) {
    const payload = await readOptionalJson(response);
    throw createMendeleyError(response.status, payload, phase);
  }
  return response;
}

function mapDocumentMetadata(input: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  const keyMap: Record<string, string> = {
    title: "title",
    type: "type",
    source: "source",
    year: "year",
    abstract: "abstract",
    identifiers: "identifiers",
    tags: "tags",
  };
  for (const [inputKey, outputKey] of Object.entries(keyMap)) {
    if (input[inputKey] !== undefined) output[outputKey] = input[inputKey];
  }
  if (Array.isArray(input.authors)) {
    output.authors = input.authors.map((author) => {
      const value = author as Record<string, unknown>;
      return { first_name: value.firstName, last_name: value.lastName };
    });
  }
  return output;
}

function parsePaginationMarkers(linkHeader: string | null) {
  const markers: Record<string, string | null> = {
    nextMarker: null,
    previousMarker: null,
    firstMarker: null,
    lastMarker: null,
  };
  if (!linkHeader) return markers;
  for (const part of linkHeader.split(",")) {
    const start = part.indexOf("<");
    const end = part.indexOf(">");
    const relationStart = part.indexOf('rel="');
    if (start < 0 || end <= start || relationStart < 0) continue;
    const relationValueStart = relationStart + 'rel="'.length;
    const relationValueEnd = part.indexOf('"', relationValueStart);
    if (relationValueEnd <= relationValueStart) continue;
    const relation = part.slice(relationValueStart, relationValueEnd);
    const marker = new URL(part.slice(start + 1, end)).searchParams.get("marker");
    const outputKey = `${relation === "prev" ? "previous" : relation}Marker`;
    if (outputKey in markers) markers[outputKey] = marker;
  }
  return markers;
}

function setOptionalQuery(url: URL, name: string, value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    url.searchParams.set(name, String(value));
  }
}

async function readJson(response: Response, phase: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, `Mendeley ${phase} response is not valid JSON`);
  }
}

async function readOptionalJson(response: Response) {
  try {
    return (await response.json()) as MendeleyTokenPayload;
  } catch {
    return {};
  }
}

function createMendeleyError(
  status: number,
  payload: MendeleyTokenPayload,
  phase: string,
  grantType?: MendeleyTokenInput["grantType"],
) {
  const error = optionalString(payload.error);
  const message =
    optionalString(payload.error_description) ?? error ?? `Mendeley ${phase} request failed with status ${status}`;
  if (status === 401 || status === 403 || (grantType === "refresh_token" && error === "invalid_grant")) {
    return new ProviderRequestError(401, message);
  }
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function requireString(value: unknown, message: string) {
  const normalized = optionalString(value);
  if (!normalized) throw new ProviderRequestError(502, message);
  return normalized;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
