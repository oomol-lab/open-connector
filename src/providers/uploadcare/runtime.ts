import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { UploadcareActionName } from "./actions.ts";

import { createHash, createHmac } from "node:crypto";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  setSearchParams,
} from "../provider-runtime.ts";

export const uploadcareApiBaseUrl = "https://api.uploadcare.com";

export const uploadcareRestAcceptHeader: string = "application/vnd.uploadcare-v0.7+json";
export const uploadcareJsonContentType: string = "application/json";
const uploadcareDefaultRequestTimeoutMs = 30_000;

type UploadcareRequestPhase = "validate" | "execute";

export interface UploadcareContext {
  publicKey: string;
  secretKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type UploadcareActionHandler = ProviderRuntimeHandler<UploadcareContext>;

export const uploadcareActionHandlers: Record<UploadcareActionName, UploadcareActionHandler> = {
  async get_project_info(_input, context) {
    const project = await requestUploadcareJson(context, {
      method: "GET",
      path: "/project/",
      phase: "execute",
    });
    return { project: readObjectPayload(project, "Uploadcare project") };
  },
  list_files(input, context) {
    return requestUploadcareJson(context, {
      method: "GET",
      path: "/files/",
      query: buildListFilesQuery(input),
      phase: "execute",
    });
  },
  async get_file_info(input, context) {
    const uuid = requiredString(input.uuid, "uuid", (message) => new ProviderRequestError(400, message));
    const file = await requestUploadcareJson(context, {
      method: "GET",
      path: `/files/${encodeURIComponent(uuid)}/`,
      query: queryParams({
        include: optionalString(input.include),
      }),
      phase: "execute",
    });
    return { file: readObjectPayload(file, "Uploadcare file") };
  },
  async store_file(input, context) {
    const uuid = requiredString(input.uuid, "uuid", (message) => new ProviderRequestError(400, message));
    const file = await requestUploadcareJson(context, {
      method: "PUT",
      path: `/files/${encodeURIComponent(uuid)}/storage/`,
      phase: "execute",
    });
    return { file: readObjectPayload(file, "Uploadcare file") };
  },
  async delete_file(input, context) {
    const uuid = requiredString(input.uuid, "uuid", (message) => new ProviderRequestError(400, message));
    const file = await requestUploadcareJson(context, {
      method: "DELETE",
      path: `/files/${encodeURIComponent(uuid)}/storage/`,
      phase: "execute",
    });
    return { file: readObjectPayload(file, "Uploadcare file") };
  },
  list_groups(input, context) {
    return requestUploadcareJson(context, {
      method: "GET",
      path: "/groups/",
      query: buildListGroupsQuery(input),
      phase: "execute",
    });
  },
  async get_group_info(input, context) {
    const uuid = requiredString(input.uuid, "uuid", (message) => new ProviderRequestError(400, message));
    const group = await requestUploadcareJson(context, {
      method: "GET",
      path: `/groups/${encodeURIComponent(uuid)}/`,
      phase: "execute",
    });
    return { group: readObjectPayload(group, "Uploadcare group") };
  },
};

export async function validateUploadcareCredential(input: {
  apiKey: string;
  publicKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}): Promise<CredentialValidationResult> {
  const project = readObjectPayload(
    await requestUploadcareJson(
      {
        publicKey: input.publicKey,
        secretKey: input.apiKey,
        fetcher: input.fetcher,
        signal: input.signal,
      },
      {
        method: "GET",
        path: "/project/",
        phase: "validate",
      },
    ),
    "Uploadcare project",
  );
  const projectName = optionalString(project.name);
  const projectPublicKey = optionalString(project.pub_key);

  return {
    profile: {
      accountId: projectPublicKey ?? input.publicKey,
      displayName: projectName || `Uploadcare ${projectPublicKey ?? input.publicKey}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: uploadcareApiBaseUrl,
      projectName,
      publicKey: projectPublicKey ?? input.publicKey,
      autostoreEnabled: optionalBoolean(project.autostore_enabled),
      validationEndpoint: "/project/",
    }),
  };
}

function buildListFilesQuery(input: Record<string, unknown>): Record<string, string> {
  return queryParams({
    removed: optionalBoolean(input.removed),
    stored: optionalBoolean(input.stored),
    limit: optionalInteger(input.limit),
    ordering: optionalString(input.ordering),
    from: optionalString(input.from),
    include: optionalString(input.include),
  });
}

function buildListGroupsQuery(input: Record<string, unknown>): Record<string, string> {
  return queryParams({
    limit: optionalInteger(input.limit),
    from: optionalString(input.from),
    ordering: optionalString(input.ordering),
  });
}

async function requestUploadcareJson(
  context: UploadcareContext,
  request: {
    method: string;
    path: string;
    query?: Record<string, string | undefined>;
    phase: UploadcareRequestPhase;
  },
): Promise<unknown> {
  const url = new URL(request.path, uploadcareApiBaseUrl);
  setSearchParams(url, request.query ?? {});

  const headers = new Headers({
    accept: uploadcareRestAcceptHeader,
    "content-type": uploadcareJsonContentType,
    "user-agent": providerUserAgent,
  });
  signUploadcareRequest({
    method: request.method,
    url,
    headers,
    body: undefined,
    publicKey: context.publicKey,
    secretKey: context.secretKey,
  });

  const timeout = createProviderTimeout(context.signal, uploadcareDefaultRequestTimeoutMs);
  try {
    const response = await context.fetcher(url.toString(), {
      method: request.method,
      headers,
      signal: timeout.signal,
    });
    const payload = await readUploadcarePayload(response);
    if (!response.ok) {
      throw createUploadcareError(response, payload, request.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Uploadcare request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Uploadcare request failed: ${error.message}` : "Uploadcare request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

export function signUploadcareRequest(input: {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
  publicKey: string;
  secretKey: string;
}): void {
  const body = stringifyUploadcareBody(input.body);
  const contentType = input.headers.get("content-type") ?? "";
  const date = new Date().toUTCString();
  input.headers.set("date", date);
  const signature = createUploadcareSignature({
    method: input.method,
    body,
    contentType,
    date,
    uri: `${input.url.pathname}${input.url.search}`,
    secretKey: input.secretKey,
  });
  input.headers.set("authorization", `Uploadcare ${input.publicKey}:${signature}`);
}

function createUploadcareSignature(input: {
  method: string;
  body: string;
  contentType: string;
  date: string;
  uri: string;
  secretKey: string;
}): string {
  const contentMd5 = createHash("md5").update(input.body).digest("hex");
  const signString = [input.method.toUpperCase(), contentMd5, input.contentType, input.date, input.uri].join("\n");
  return createHmac("sha1", input.secretKey).update(signString).digest("hex");
}

function stringifyUploadcareBody(body: unknown): string {
  if (body === undefined || body === null) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  return JSON.stringify(body);
}

async function readUploadcarePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Uploadcare returned non-JSON response");
  }
}

function createUploadcareError(
  response: Response,
  payload: unknown,
  phase: UploadcareRequestPhase,
): ProviderRequestError {
  const message = readUploadcareErrorMessage(payload) ?? `Uploadcare request failed with ${response.status}`;
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 406) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function readUploadcareErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.detail);
}

function readObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} response must be an object`);
  }
  return record;
}

export function readRequiredUploadcareCredentialField(input: Record<string, string>, field: string): string {
  return requiredString(input[field], field, (message) => new ProviderRequestError(400, message));
}
