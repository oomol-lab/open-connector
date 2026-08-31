import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";
import { netlifyConnectorScopes } from "./actions.ts";

export const netlifyApiBaseUrl = "https://api.netlify.com/api/v1";
const netlifyValidationPath = "/user";
const sourceFetchTimeoutMs = 30_000;
const maxSourceBytes = 100 * 1024 * 1024;

type NetlifyRequestPhase = "validate" | "execute";
export interface NetlifyActionContext {
  accessToken: string;
  fetcher: typeof fetch;
}

type NetlifyActionHandler = (input: Record<string, unknown>, context: NetlifyActionContext) => Promise<unknown>;

export const netlifyActionHandlers: ProviderActionHandlers<"netlify", NetlifyActionHandler> = {
  async get_current_user(_input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    return {
      user: objectPayload(
        await netlifyRequestJson({
          accessToken: context.accessToken,
          path: "/user",
          fetcher: context.fetcher,
          phase: "execute",
        }),
      ),
    };
  },

  async list_accounts(_input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    const accounts = arrayPayload(
      await netlifyRequestJson({
        accessToken: context.accessToken,
        path: "/accounts",
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
    return { accounts, count: accounts.length };
  },

  async get_account(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    return {
      account: objectPayload(
        await netlifyRequestJson({
          accessToken: context.accessToken,
          path: `/accounts/${encodeURIComponent(readRequiredString(input.accountId, "accountId"))}`,
          fetcher: context.fetcher,
          phase: "execute",
        }),
      ),
    };
  },

  async list_sites(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    const sites = arrayPayload(
      await netlifyRequestJson({
        accessToken: context.accessToken,
        path: "/sites",
        query: compactObject({
          name: readOptionalNonEmptyString(input.name),
          filter: readOptionalNonEmptyString(input.filter),
          page: readOptionalIntegerString(input.page, "page"),
          per_page: readOptionalIntegerString(input.perPage, "perPage"),
        }),
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
    return { sites, count: sites.length };
  },

  async get_site(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    return {
      site: objectPayload(
        await netlifyRequestJson({
          accessToken: context.accessToken,
          path: `/sites/${encodeURIComponent(readRequiredString(input.siteId, "siteId"))}`,
          fetcher: context.fetcher,
          phase: "execute",
        }),
      ),
    };
  },

  async list_site_deploys(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    const deploys = arrayPayload(
      await netlifyRequestJson({
        accessToken: context.accessToken,
        path: `/sites/${encodeURIComponent(readRequiredString(input.siteId, "siteId"))}/deploys`,
        query: compactObject({
          page: readOptionalIntegerString(input.page, "page"),
          per_page: readOptionalIntegerString(input.perPage, "perPage"),
        }),
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
    return { deploys, count: deploys.length };
  },

  async get_deploy(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    return {
      deploy: objectPayload(
        await netlifyRequestJson({
          accessToken: context.accessToken,
          path: `/deploys/${encodeURIComponent(readRequiredString(input.deployId, "deployId"))}`,
          fetcher: context.fetcher,
          phase: "execute",
        }),
      ),
    };
  },

  async cancel_deploy(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    return postDeployAction(input, context, "cancel");
  },

  async lock_deploy(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    return postDeployAction(input, context, "lock");
  },

  async unlock_deploy(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    return postDeployAction(input, context, "unlock");
  },

  async create_site_build(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    return {
      build: objectPayload(
        await netlifyRequestJson({
          accessToken: context.accessToken,
          method: "POST",
          path: `/sites/${encodeURIComponent(readRequiredString(input.siteId, "siteId"))}/builds`,
          query: compactObject({
            branch: readOptionalNonEmptyString(input.branch),
            clear_cache: readOptionalBooleanString(input.clearCache),
            image: readOptionalNonEmptyString(input.image),
            template_id: readOptionalNonEmptyString(input.templateId),
            title: readOptionalNonEmptyString(input.title),
          }),
          fetcher: context.fetcher,
          phase: "execute",
        }),
      ),
    };
  },

  async create_site_deploy_from_zip_url(
    input: Record<string, unknown>,
    context: NetlifyActionContext,
  ): Promise<unknown> {
    const sourceFile = await downloadSourceFile(readRequiredString(input.zipUrl, "zipUrl"), "zipUrl", context.fetcher);
    return {
      deploy: objectPayload(
        await netlifyRequestJson({
          accessToken: context.accessToken,
          method: "POST",
          path: `/sites/${encodeURIComponent(readRequiredString(input.siteId, "siteId"))}/deploys`,
          query: compactObject({
            title: readOptionalNonEmptyString(input.title),
          }),
          body: toBodyArrayBuffer(sourceFile.bytes),
          contentType: "application/zip",
          fetcher: context.fetcher,
          phase: "execute",
        }),
      ),
    };
  },

  async upload_deploy_file_from_url(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    const sourceFile = await downloadSourceFile(
      readRequiredString(input.fileUrl, "fileUrl"),
      "fileUrl",
      context.fetcher,
    );
    return {
      file: objectPayload(
        await netlifyRequestJson({
          accessToken: context.accessToken,
          method: "PUT",
          path: `/deploys/${encodeURIComponent(readRequiredString(input.deployId, "deployId"))}/files/${encodeURIComponent(readDeployFilePath(input.path))}`,
          query: {
            size: String(sourceFile.bytes.byteLength),
          },
          body: toBodyArrayBuffer(sourceFile.bytes),
          contentType: sourceFile.contentType ?? "application/octet-stream",
          fetcher: context.fetcher,
          phase: "execute",
        }),
      ),
    };
  },

  async upload_deploy_function_from_zip_url(
    input: Record<string, unknown>,
    context: NetlifyActionContext,
  ): Promise<unknown> {
    const sourceFile = await downloadSourceFile(readRequiredString(input.zipUrl, "zipUrl"), "zipUrl", context.fetcher);
    return {
      function: objectPayload(
        await netlifyRequestJson({
          accessToken: context.accessToken,
          method: "PUT",
          path: `/deploys/${encodeURIComponent(readRequiredString(input.deployId, "deployId"))}/functions/${encodeURIComponent(readRequiredString(input.name, "name"))}`,
          query: compactObject({
            runtime: readOptionalNonEmptyString(input.runtime),
            invocation_mode: readOptionalNonEmptyString(input.invocationMode),
            timeout: readOptionalIntegerString(input.timeout, "timeout"),
            size: String(sourceFile.bytes.byteLength),
          }),
          headers: compactObject({
            "x-nf-retry-count": readOptionalNonNegativeIntegerString(input.retryCount, "retryCount"),
          }),
          body: toBodyArrayBuffer(sourceFile.bytes),
          contentType: sourceFile.contentType ?? "application/zip",
          fetcher: context.fetcher,
          phase: "execute",
        }),
      ),
    };
  },

  async get_build(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    return {
      build: objectPayload(
        await netlifyRequestJson({
          accessToken: context.accessToken,
          path: `/builds/${encodeURIComponent(readRequiredString(input.buildId, "buildId"))}`,
          fetcher: context.fetcher,
          phase: "execute",
        }),
      ),
    };
  },

  async notify_build_start(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    await netlifyRequestJson({
      accessToken: context.accessToken,
      method: "POST",
      path: `/builds/${encodeURIComponent(readRequiredString(input.buildId, "buildId"))}/start`,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return { success: true };
  },

  async list_site_forms(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    const forms = arrayPayload(
      await netlifyRequestJson({
        accessToken: context.accessToken,
        path: `/sites/${encodeURIComponent(readRequiredString(input.siteId, "siteId"))}/forms`,
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
    return { forms, count: forms.length };
  },

  async list_submissions(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    const path = resolveSubmissionsPath(input);
    const submissions = arrayPayload(
      await netlifyRequestJson({
        accessToken: context.accessToken,
        path,
        query: compactObject({
          page: readOptionalIntegerString(input.page, "page"),
          per_page: readOptionalIntegerString(input.perPage, "perPage"),
        }),
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
    return { submissions, count: submissions.length };
  },

  async delete_submission(input: Record<string, unknown>, context: NetlifyActionContext): Promise<unknown> {
    await netlifyRequestJson({
      accessToken: context.accessToken,
      method: "DELETE",
      path: `/submissions/${encodeURIComponent(readRequiredString(input.submissionId, "submissionId"))}`,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return { success: true };
  },
};

export async function validateNetlifyCredential(
  accessToken: string,
  fetcher: typeof fetch,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
  };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const user = objectPayload(
    await netlifyRequestJson({
      accessToken,
      path: netlifyValidationPath,
      fetcher,
      phase: "validate",
    }),
  );

  const userId = optionalString(user.id) ?? optionalString(user.uid);
  const email = optionalString(user.email);
  const fullName = optionalString(user.full_name);

  return {
    profile: {
      accountId: userId ?? "netlify-user",
      displayName: fullName ?? email ?? userId ?? "Netlify User",
    },
    grantedScopes: [...netlifyConnectorScopes],
    metadata: compactObject({
      apiBaseUrl: netlifyApiBaseUrl,
      validationEndpoint: netlifyValidationPath,
      userId,
      email,
      fullName,
      siteCount: user.site_count,
    }),
  };
}

async function postDeployAction(
  input: Record<string, unknown>,
  context: NetlifyActionContext,
  action: "cancel" | "lock" | "unlock",
) {
  return {
    deploy: objectPayload(
      await netlifyRequestJson({
        accessToken: context.accessToken,
        method: "POST",
        path: `/deploys/${encodeURIComponent(readRequiredString(input.deployId, "deployId"))}/${action}`,
        fetcher: context.fetcher,
        phase: "execute",
      }),
    ),
  };
}

async function netlifyRequestJson(input: {
  accessToken: string;
  path: string;
  fetcher: typeof fetch;
  phase: NetlifyRequestPhase;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  body?: BodyInit;
  contentType?: string;
}) {
  const url = new URL(`${netlifyApiBaseUrl}${normalizePath(input.path)}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: netlifyHeaders(input.accessToken, input.contentType, input.headers),
      body: input.body,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `netlify request failed: ${error.message}` : "netlify request failed",
    );
  }

  const payload = await readNetlifyPayload(response);
  if (!response.ok) {
    throw createNetlifyError(response, payload, input.phase);
  }

  return payload;
}

function netlifyHeaders(
  accessToken: string,
  contentType?: string,
  extraHeaders?: Record<string, string | undefined>,
): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
    "user-agent": providerUserAgent,
  };
  if (contentType) {
    headers["content-type"] = contentType;
  }
  for (const [key, value] of Object.entries(extraHeaders ?? {})) {
    if (value !== undefined) {
      headers[key] = value;
    }
  }
  return headers;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

async function readNetlifyPayload(response: Response): Promise<unknown> {
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

function createNetlifyError(response: Response, payload: unknown, phase: NetlifyRequestPhase): ProviderRequestError {
  const message = extractNetlifyErrorMessage(payload) ?? response.statusText ?? "netlify request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function extractNetlifyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.error_description) ??
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.title)
  );
}

function resolveSubmissionsPath(input: Record<string, unknown>): string {
  const siteId = readOptionalNonEmptyString(input.siteId);
  const formId = readOptionalNonEmptyString(input.formId);
  if (siteId && formId) {
    throw new ProviderRequestError(400, "provide either siteId or formId, not both");
  }
  if (siteId) {
    return `/sites/${encodeURIComponent(siteId)}/submissions`;
  }
  if (formId) {
    return `/forms/${encodeURIComponent(formId)}/submissions`;
  }
  throw new ProviderRequestError(400, "siteId or formId is required");
}

function objectPayload(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, "netlify response did not contain an object");
  }
  return object;
}

function arrayPayload(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "netlify response did not contain an array");
  }
  return payload.map((item) => objectPayload(item));
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function readOptionalNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalIntegerString(value: unknown, fieldName: string): string | undefined {
  if (value == null) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return String(parsed);
}

function readOptionalNonNegativeIntegerString(value: unknown, fieldName: string): string | undefined {
  if (value == null) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-negative integer`);
  }
  return String(parsed);
}

function readOptionalBooleanString(value: unknown): string | undefined {
  const parsed = optionalBoolean(value);
  return parsed === undefined ? undefined : String(parsed);
}

function readDeployFilePath(value: unknown): string {
  let path = readRequiredString(value, "path");
  while (path.startsWith("/")) {
    path = path.slice(1);
  }
  if (!path) {
    throw new ProviderRequestError(400, "path is required");
  }
  return path;
}

async function downloadSourceFile(
  sourceUrl: string,
  fieldName: "fileUrl" | "zipUrl",
  fetcher: typeof fetch,
): Promise<{
  bytes: Uint8Array;
  contentType?: string;
}> {
  const url = validateSourceUrl(sourceUrl, fieldName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sourceFetchTimeoutMs);

  try {
    const response = await fetcher(url, {
      signal: controller.signal,
    });
    const contentLength = parseHeaderInteger(response.headers.get("content-length") ?? undefined);
    if (contentLength != null && contentLength > maxSourceBytes) {
      throw new ProviderRequestError(400, `${fieldName} payload is too large`);
    }
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status >= 500 ? 502 : response.status,
        `failed to download ${fieldName}: ${response.status} ${response.statusText}`.trim(),
      );
    }

    const bytes = await readResponseBytesWithLimit(response, maxSourceBytes, fieldName);

    return {
      bytes,
      contentType: response.headers.get("content-type") ?? undefined,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ProviderRequestError(504, `${fieldName} download timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function validateSourceUrl(sourceUrl: string, fieldName: "fileUrl" | "zipUrl"): string {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new ProviderRequestError(400, `${fieldName} must be a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ProviderRequestError(400, `${fieldName} must use http or https`);
  }
  return url.toString();
}

function toBodyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}

function parseHeaderInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

async function readResponseBytesWithLimit(
  response: Response,
  maxBytes: number,
  fieldName: "fileUrl" | "zipUrl",
): Promise<Uint8Array> {
  if (!response.body) {
    throw new ProviderRequestError(502, `${fieldName} response body is unavailable`);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel(`${fieldName} payload is too large`);
        throw new ProviderRequestError(400, `${fieldName} payload is too large`);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}
