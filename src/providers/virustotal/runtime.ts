import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { VirustotalActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import {
  base64Bytes,
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const virustotalApiBaseUrl = "https://www.virustotal.com/api/v3";
export const virustotalLargeFileThresholdBytes: number = 32 * 1024 * 1024;

type VirustotalRequestPhase = "validate" | "execute";
type VirustotalActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface VirustotalRequestOptions {
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: BodyInit | Record<string, unknown>;
}

export const virustotalActionHandlers: Record<VirustotalActionName, VirustotalActionHandler> = {
  search(input, context) {
    return virustotalJsonRequest(
      "/search",
      {
        query: {
          query: requiredString(input.query, "query", badInput),
          limit: optionalPositiveInteger(input.limit, "limit"),
          cursor: optionalString(input.cursor),
        },
      },
      context,
      "execute",
    );
  },
  get_metadata(_input, context) {
    return virustotalJsonRequest("/metadata", {}, context, "execute");
  },
  get_analysis(input, context) {
    return virustotalJsonRequest(
      `/analyses/${encodeURIComponent(requiredString(input.analysisId, "analysisId", badInput))}`,
      {},
      context,
      "execute",
    );
  },
  get_file_report(input, context) {
    return virustotalJsonRequest(
      `/files/${encodeURIComponent(requiredString(input.fileId, "fileId", badInput))}`,
      {},
      context,
      "execute",
    );
  },
  async upload_file(input, context) {
    const bytes = base64Bytes(input.contentBase64, "contentBase64", badInput);
    const fileName = optionalString(input.fileName) ?? "sample.bin";
    const password = optionalString(input.password);
    const formData = new FormData();
    formData.set("file", new Blob([bytes]), fileName);
    if (password) {
      formData.set("password", password);
    }

    const uploadPath =
      bytes.byteLength > virustotalLargeFileThresholdBytes ? await getLargeFileUploadUrl(context) : "/files";

    return virustotalJsonRequest(uploadPath, { method: "POST", body: formData }, context, "execute");
  },
  rescan_file(input, context) {
    return virustotalJsonRequest(
      `/files/${encodeURIComponent(requiredString(input.fileId, "fileId", badInput))}/analyse`,
      { method: "POST" },
      context,
      "execute",
    );
  },
  scan_url(input, context) {
    const body = new URLSearchParams();
    body.set("url", requiredString(input.url, "url", badInput));
    return virustotalJsonRequest("/urls", { method: "POST", body }, context, "execute");
  },
  get_url_report(input, context) {
    return virustotalJsonRequest(`/urls/${encodeURIComponent(resolveUrlId(input))}`, {}, context, "execute");
  },
  get_domain_report(input, context) {
    return virustotalJsonRequest(
      `/domains/${encodeURIComponent(requiredString(input.domain, "domain", badInput))}`,
      {},
      context,
      "execute",
    );
  },
  get_domain_relationships(input, context) {
    return virustotalJsonRequest(
      buildRelationshipPath({
        collection: "domains",
        id: requiredString(input.domain, "domain", badInput),
        relationship: requiredString(input.relationship, "relationship", badInput),
        descriptorsOnly: optionalBoolean(input.descriptorsOnly) ?? false,
      }),
      {
        query: {
          limit: optionalPositiveInteger(input.limit, "limit"),
          cursor: optionalString(input.cursor),
        },
      },
      context,
      "execute",
    );
  },
  get_ip_address_report(input, context) {
    return virustotalJsonRequest(
      `/ip_addresses/${encodeURIComponent(requiredString(input.ipAddress, "ipAddress", badInput))}`,
      {},
      context,
      "execute",
    );
  },
  get_ip_address_relationships(input, context) {
    return virustotalJsonRequest(
      buildRelationshipPath({
        collection: "ip_addresses",
        id: requiredString(input.ipAddress, "ipAddress", badInput),
        relationship: requiredString(input.relationship, "relationship", badInput),
        descriptorsOnly: optionalBoolean(input.descriptorsOnly) ?? false,
      }),
      {
        query: {
          limit: optionalPositiveInteger(input.limit, "limit"),
          cursor: optionalString(input.cursor),
        },
      },
      context,
      "execute",
    );
  },
  get_comments(input, context) {
    return virustotalJsonRequest(
      `${resolveResourcePath(input)}/comments`,
      {
        query: {
          limit: optionalPositiveInteger(input.limit, "limit"),
          cursor: optionalString(input.cursor),
        },
      },
      context,
      "execute",
    );
  },
  add_comment(input, context) {
    return virustotalJsonRequest(
      `${resolveResourcePath(input)}/comments`,
      {
        method: "POST",
        body: {
          data: {
            type: "comment",
            attributes: {
              text: requiredString(input.text, "text", badInput),
            },
          },
        },
      },
      context,
      "execute",
    );
  },
  get_votes(input, context) {
    return virustotalJsonRequest(
      `${resolveResourcePath(input)}/votes`,
      {
        query: {
          limit: optionalPositiveInteger(input.limit, "limit"),
          cursor: optionalString(input.cursor),
        },
      },
      context,
      "execute",
    );
  },
  add_vote(input, context) {
    return virustotalJsonRequest(
      `${resolveResourcePath(input)}/votes`,
      {
        method: "POST",
        body: {
          data: {
            type: "vote",
            attributes: {
              verdict: requiredString(input.verdict, "verdict", badInput),
            },
          },
        },
      },
      context,
      "execute",
    );
  },
};

export async function validateVirustotalCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = { apiKey, fetcher, signal };
  const payload = await virustotalJsonRequest(`/users/${encodeURIComponent(apiKey)}`, {}, context, "validate");
  const user = requireObject(optionalRecord(payload)?.data, "data");
  const attributes = requireObject(user.attributes, "attributes");
  const privileges = extractGrantedPrivileges(attributes.privileges);

  return {
    profile: {
      accountId: optionalString(user.id) ?? "virustotal-api-key",
      displayName: buildUserLabel(user.id, attributes),
    },
    grantedScopes: privileges,
    metadata: compactObject({
      validationEndpoint: "/users/{id}",
      apiBaseUrl: virustotalApiBaseUrl,
      status: optionalString(attributes.status),
      reputation: optionalInteger(attributes.reputation),
      privileges,
      quotas: optionalRecord(attributes.quotas),
    }),
  };
}

async function getLargeFileUploadUrl(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<string> {
  const payload = await virustotalJsonRequest("/files/upload_url", {}, context, "execute");
  const uploadUrl = optionalString(optionalRecord(payload)?.data);
  if (!uploadUrl) {
    throw new ProviderRequestError(502, "VirusTotal did not return a large-file upload URL");
  }
  return uploadUrl;
}

async function virustotalJsonRequest(
  pathOrUrl: string,
  options: VirustotalRequestOptions,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: VirustotalRequestPhase,
): Promise<unknown> {
  const url = buildVirustotalUrl(pathOrUrl, options.query);
  const init = buildVirustotalRequestInit({
    method: options.method ?? "GET",
    body: options.body,
    apiKey: context.apiKey,
    signal: context.signal,
  });

  let response: Response;
  try {
    response = await context.fetcher(url, init);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `VirusTotal request failed: ${error.message}` : "VirusTotal request failed",
    );
  }

  const payload = await readVirustotalPayload(response);
  if (!response.ok) {
    throw buildVirustotalError(response.status, payload, phase);
  }

  return payload;
}

function buildVirustotalUrl(pathOrUrl: string, query?: Record<string, string | number | undefined>): URL {
  let url: URL;
  try {
    url = new URL(pathOrUrl);
  } catch {
    const relativePath = pathOrUrl.startsWith("/") ? pathOrUrl.slice(1) : pathOrUrl;
    url = new URL(relativePath, `${virustotalApiBaseUrl}/`);
  }

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildVirustotalRequestInit(input: {
  method: string;
  body?: BodyInit | Record<string, unknown>;
  apiKey: string;
  signal?: AbortSignal;
}): RequestInit {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-apikey": input.apiKey,
  });

  let body: BodyInit | undefined;
  if (input.body instanceof FormData || input.body instanceof URLSearchParams) {
    body = input.body;
  } else if (input.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.body);
  }

  return {
    method: input.method,
    headers,
    body,
    signal: input.signal,
  };
}

async function readVirustotalPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: { code: "InvalidJSON", message: text } };
  }
}

function buildVirustotalError(status: number, payload: unknown, phase: VirustotalRequestPhase): ProviderRequestError {
  const message = extractVirustotalErrorMessage(payload) ?? `VirusTotal request failed with ${status}`;
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractVirustotalErrorMessage(payload: unknown): string | undefined {
  return optionalString(optionalRecord(optionalRecord(payload)?.error)?.message);
}

function resolveResourcePath(input: Record<string, unknown>): string {
  const fileId = optionalString(input.fileId);
  if (fileId) {
    return `/files/${encodeURIComponent(fileId)}`;
  }
  const url = optionalString(input.url);
  if (url) {
    return `/urls/${encodeURIComponent(toVirustotalUrlId(url))}`;
  }
  const urlId = optionalString(input.urlId);
  if (urlId) {
    return `/urls/${encodeURIComponent(urlId)}`;
  }
  const domain = optionalString(input.domain);
  if (domain) {
    return `/domains/${encodeURIComponent(domain)}`;
  }
  const ipAddress = optionalString(input.ipAddress);
  if (ipAddress) {
    return `/ip_addresses/${encodeURIComponent(ipAddress)}`;
  }
  throw new ProviderRequestError(400, "exactly one of fileId, url, urlId, domain, or ipAddress is required");
}

function buildRelationshipPath(input: {
  collection: "domains" | "ip_addresses";
  id: string;
  relationship: string;
  descriptorsOnly: boolean;
}): string {
  const objectId = encodeURIComponent(input.id);
  const relationship = encodeURIComponent(input.relationship);
  if (input.descriptorsOnly) {
    return `/${input.collection}/${objectId}/relationships/${relationship}`;
  }
  return `/${input.collection}/${objectId}/${relationship}`;
}

function resolveUrlId(input: Record<string, unknown>): string {
  const url = optionalString(input.url);
  if (url) {
    return toVirustotalUrlId(url);
  }
  const urlId = optionalString(input.urlId);
  if (urlId) {
    return urlId;
  }
  throw new ProviderRequestError(400, "exactly one of url or urlId is required");
}

function toVirustotalUrlId(url: string): string {
  return Buffer.from(url).toString("base64url");
}

function buildUserLabel(userId: unknown, attributes: Record<string, unknown>): string {
  const firstName = optionalString(attributes.first_name);
  const lastName = optionalString(attributes.last_name);
  const email = optionalString(attributes.email);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || email || optionalString(userId) || "VirusTotal API Key";
}

function extractGrantedPrivileges(value: unknown): string[] {
  const record = optionalRecord(value);
  if (!record) {
    return [];
  }

  const privileges: string[] = [];
  for (const [name, child] of Object.entries(record)) {
    if (optionalRecord(child)?.granted === true) {
      privileges.push(name);
    }
  }
  return privileges.sort();
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `VirusTotal response did not include ${fieldName}`);
  }
  return record;
}

function optionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value;
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
