import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { CloudflareWorkerActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface CloudflareWorkerContext {
  authType: "custom_credential" | "oauth2";
  accessToken: string;
  accountId?: string;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface CloudflareEnvelope {
  success?: unknown;
  result?: unknown;
  errors?: unknown;
  messages?: unknown;
  result_info?: unknown;
}

interface CloudflareRequestInput {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown> | FormData | Blob;
  headers?: Record<string, string>;
}

interface CloudflareAccount {
  id: string;
  name?: string;
  type?: string;
}

const cloudflareApiBaseUrl = "https://api.cloudflare.com/client/v4";
const defaultModuleName = "main.js";
const defaultModuleContentType = "application/javascript+module";

export const cloudflareWorkerActionHandlers: Record<
  CloudflareWorkerActionName,
  ProviderRuntimeHandler<CloudflareWorkerContext>
> = {
  list_accounts(input, context) {
    return listAccounts(input, context);
  },
  list_workers(input, context) {
    return listWorkers(input, context);
  },
  get_worker(input, context) {
    return getWorker(input, context);
  },
  create_worker(input, context) {
    return createWorker(input, context);
  },
  update_worker(input, context) {
    return updateWorker(input, context);
  },
  edit_worker(input, context) {
    return editWorker(input, context);
  },
  delete_worker(input, context) {
    return deleteWorker(input, context);
  },
  list_worker_scripts(input, context) {
    return listWorkerScripts(input, context);
  },
  search_worker_scripts(input, context) {
    return searchWorkerScripts(input, context);
  },
  upload_worker_script(input, context) {
    return uploadWorkerScript(input, context);
  },
  put_worker_script_content(input, context) {
    return putWorkerScriptContent(input, context);
  },
  get_worker_script_content(input, context) {
    return getWorkerScriptContent(input, context);
  },
  get_worker_script_settings(input, context) {
    return getWorkerScriptSettings(input, context);
  },
  patch_worker_script_settings(input, context) {
    return patchWorkerScriptSettings(input, context);
  },
  list_worker_script_secrets(input, context) {
    return listWorkerScriptSecrets(input, context);
  },
  get_worker_script_secret(input, context) {
    return getWorkerScriptSecret(input, context);
  },
  put_worker_script_secret(input, context) {
    return putWorkerScriptSecret(input, context);
  },
  delete_worker_script_secret(input, context) {
    return deleteWorkerScriptSecret(input, context);
  },
  delete_worker_script(input, context) {
    return deleteWorkerScript(input, context);
  },
};

export async function validateCloudflareWorkerCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiToken = requiredString(values.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const accountId = requiredString(values.accountId, "accountId", (message) => new ProviderRequestError(400, message));

  let verificationResult: CloudflareTokenVerificationResult;
  try {
    verificationResult = await verifyCloudflareWorkerToken(apiToken, "/user/tokens/verify", { fetcher, signal });
  } catch (error) {
    if (!shouldFallbackCloudflareUserTokenValidation(error)) {
      throw error;
    }
    verificationResult = await verifyCloudflareWorkerToken(
      apiToken,
      `/accounts/${encodeURIComponent(accountId)}/tokens/verify`,
      { fetcher, signal },
    );
  }

  const verification = verificationResult.verification;
  const tokenId = optionalString(verification.id);
  const tokenStatus = optionalString(verification.status);
  if (tokenStatus && tokenStatus !== "active") {
    throw new ProviderRequestError(400, `cloudflare token is not active: ${tokenStatus}`);
  }

  return {
    profile: {
      accountId,
      displayName: "Cloudflare Worker",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: verificationResult.validationEndpoint,
      tokenId,
      tokenStatus,
      expiresOn: optionalString(verification.expires_on),
      notBefore: optionalString(verification.not_before),
      accountId,
    }),
  };
}

interface CloudflareTokenVerificationResult {
  verification: Record<string, unknown>;
  validationEndpoint: string;
}

async function verifyCloudflareWorkerToken(
  apiToken: string,
  path: string,
  context: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CloudflareTokenVerificationResult> {
  const envelope = await cloudflareRequestEnvelope(apiToken, { path }, context, "validate");
  const verification = readObject(envelope.result, "cloudflare token verification");
  return {
    verification,
    validationEndpoint: path,
  };
}

function shouldFallbackCloudflareUserTokenValidation(error: unknown): boolean {
  return error instanceof ProviderRequestError && error.status === 400;
}

export async function requestCloudflareWorkerAccounts(
  apiToken: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  input: { page?: number; perPage?: number } = {},
): Promise<{ accounts: CloudflareAccount[]; resultInfo?: Record<string, unknown> }> {
  const envelope = await cloudflareRequestEnvelope(
    apiToken,
    {
      path: "/accounts",
      query: {
        page: input.page ?? 1,
        per_page: input.perPage ?? 50,
      },
    },
    { fetcher, signal },
    "execute",
  );
  if (!Array.isArray(envelope.result)) {
    throw new ProviderRequestError(502, "malformed cloudflare accounts response");
  }
  return {
    accounts: envelope.result.map((item) => normalizeAccount(item)),
    resultInfo: normalizeResultInfo(envelope.result_info),
  };
}

async function listAccounts(input: Record<string, unknown>, context: CloudflareWorkerContext): Promise<unknown> {
  return requestCloudflareWorkerAccounts(context.accessToken, context.fetcher, context.signal, {
    page: optionalInteger(input.page),
    perPage: optionalInteger(input.perPage),
  });
}

async function listWorkers(input: Record<string, unknown>, context: CloudflareWorkerContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/workers/workers`,
      query: {
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
        order: optionalString(input.order),
        order_by: optionalString(input.orderBy),
      },
    },
    "execute",
  );
  return {
    workers: normalizeWorkerList(envelope.result),
    resultInfo: normalizeResultInfo(envelope.result_info) ?? null,
  };
}

async function getWorker(input: Record<string, unknown>, context: CloudflareWorkerContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const workerId = String(input.workerId);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/workers/workers/${encodeURIComponent(workerId)}`,
    },
    "execute",
  );
  return {
    worker: normalizeWorker(envelope.result),
  };
}

async function createWorker(input: Record<string, unknown>, context: CloudflareWorkerContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const envelope = await requestEnvelope(
    context,
    {
      method: "POST",
      path: `/accounts/${encodeURIComponent(accountId)}/workers/workers`,
      body: buildWorkerMutationBody(input),
    },
    "execute",
  );
  return {
    worker: normalizeWorker(envelope.result),
  };
}

async function updateWorker(input: Record<string, unknown>, context: CloudflareWorkerContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const workerId = String(input.workerId);
  const envelope = await requestEnvelope(
    context,
    {
      method: "PUT",
      path: `/accounts/${encodeURIComponent(accountId)}/workers/workers/${encodeURIComponent(workerId)}`,
      body: buildWorkerMutationBody(input),
    },
    "execute",
  );
  return {
    worker: normalizeWorker(envelope.result),
  };
}

async function editWorker(input: Record<string, unknown>, context: CloudflareWorkerContext): Promise<unknown> {
  if (
    !["name", "logpush", "observability", "subdomain", "tags", "tailConsumers"].some((key) => input[key] !== undefined)
  ) {
    throw new ProviderRequestError(400, "at least one Worker field must be provided");
  }
  const accountId = resolveAccountId(input, context);
  const workerId = String(input.workerId);
  const envelope = await requestEnvelope(
    context,
    {
      method: "PATCH",
      path: `/accounts/${encodeURIComponent(accountId)}/workers/workers/${encodeURIComponent(workerId)}`,
      body: buildWorkerMutationBody(input),
    },
    "execute",
  );
  return {
    worker: normalizeWorker(envelope.result),
  };
}

async function deleteWorker(input: Record<string, unknown>, context: CloudflareWorkerContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const workerId = String(input.workerId);
  await requestEnvelope(
    context,
    {
      method: "DELETE",
      path: `/accounts/${encodeURIComponent(accountId)}/workers/workers/${encodeURIComponent(workerId)}`,
    },
    "execute",
  );
  return {
    id: workerId,
    deleted: true,
  };
}

async function listWorkerScripts(input: Record<string, unknown>, context: CloudflareWorkerContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/workers/scripts`,
      query: {
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
      },
    },
    "execute",
  );
  return {
    scripts: normalizeWorkerScriptList(envelope.result),
    resultInfo: normalizeResultInfo(envelope.result_info),
  };
}

async function searchWorkerScripts(input: Record<string, unknown>, context: CloudflareWorkerContext): Promise<unknown> {
  if (input.id === undefined && input.name === undefined) {
    throw new ProviderRequestError(400, "id or name is required");
  }
  const accountId = resolveAccountId(input, context);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/workers/scripts-search`,
      query: {
        id: optionalString(input.id),
        name: optionalString(input.name),
        order_by: optionalString(input.orderBy),
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
      },
    },
    "execute",
  );
  return {
    scripts: normalizeWorkerScriptList(envelope.result),
    resultInfo: normalizeResultInfo(envelope.result_info),
  };
}

async function uploadWorkerScript(input: Record<string, unknown>, context: CloudflareWorkerContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const scriptName = String(input.scriptName);
  const envelope = await requestEnvelope(
    context,
    {
      method: "PUT",
      path: `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}`,
      query: {
        bindings_inherit: optionalString(input.bindingsInherit),
      },
      body: buildWorkerScriptUploadFormData(input),
    },
    "execute",
  );
  return {
    script: normalizeWorkerScript(envelope.result),
  };
}

async function putWorkerScriptContent(
  input: Record<string, unknown>,
  context: CloudflareWorkerContext,
): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const scriptName = String(input.scriptName);
  const contentType = optionalString(input.contentType) ?? defaultModuleContentType;
  const envelope = await requestEnvelope(
    context,
    {
      method: "PUT",
      path: `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/content`,
      body: buildWorkerScriptContentFormData(input, contentType),
    },
    "execute",
  );
  return {
    script: normalizeWorkerScript(envelope.result),
  };
}

async function getWorkerScriptContent(
  input: Record<string, unknown>,
  context: CloudflareWorkerContext,
): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const scriptName = String(input.scriptName);
  return requestText(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/content/v2`,
    },
    "execute",
  );
}

async function getWorkerScriptSettings(
  input: Record<string, unknown>,
  context: CloudflareWorkerContext,
): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const scriptName = String(input.scriptName);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/settings`,
    },
    "execute",
  );
  return {
    settings: normalizeWorkerScriptSettings(envelope.result),
  };
}

async function patchWorkerScriptSettings(
  input: Record<string, unknown>,
  context: CloudflareWorkerContext,
): Promise<unknown> {
  const patchFields = [
    "bindings",
    "compatibilityDate",
    "compatibilityFlags",
    "logpush",
    "observability",
    "placementMode",
    "tags",
    "tailConsumers",
    "usageModel",
    "limits",
    "migrations",
  ];
  if (!patchFields.some((field) => input[field] !== undefined)) {
    throw new ProviderRequestError(400, "at least one Worker settings field must be provided");
  }
  const accountId = resolveAccountId(input, context);
  const scriptName = String(input.scriptName);
  const envelope = await requestEnvelope(
    context,
    {
      method: "PATCH",
      path: `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/settings`,
      body: buildWorkerScriptSettingsFormData(input),
    },
    "execute",
  );
  return {
    settings: normalizeWorkerScriptSettings(envelope.result),
  };
}

async function listWorkerScriptSecrets(
  input: Record<string, unknown>,
  context: CloudflareWorkerContext,
): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const scriptName = String(input.scriptName);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/secrets`,
    },
    "execute",
  );
  return {
    secrets: normalizeWorkerSecretList(envelope.result),
    resultInfo: normalizeResultInfo(envelope.result_info),
  };
}

async function getWorkerScriptSecret(
  input: Record<string, unknown>,
  context: CloudflareWorkerContext,
): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const scriptName = String(input.scriptName);
  const secretName = String(input.secretName);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/secrets/${encodeURIComponent(secretName)}`,
    },
    "execute",
  );
  return {
    secret: normalizeWorkerSecret(envelope.result),
  };
}

async function putWorkerScriptSecret(
  input: Record<string, unknown>,
  context: CloudflareWorkerContext,
): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const scriptName = String(input.scriptName);
  const envelope = await requestEnvelope(
    context,
    {
      method: "PUT",
      path: `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/secrets`,
      body: compactObject({
        name: optionalString(input.name),
        text: typeof input.text === "string" ? input.text : undefined,
        type: optionalString(input.type) ?? "secret_text",
      }),
    },
    "execute",
  );
  return {
    secret: normalizeWorkerSecret(envelope.result),
  };
}

async function deleteWorkerScriptSecret(
  input: Record<string, unknown>,
  context: CloudflareWorkerContext,
): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const scriptName = String(input.scriptName);
  const secretName = String(input.secretName);
  await requestEnvelope(
    context,
    {
      method: "DELETE",
      path: `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/secrets/${encodeURIComponent(secretName)}`,
    },
    "execute",
  );
  return {
    name: secretName,
    deleted: true,
  };
}

async function deleteWorkerScript(input: Record<string, unknown>, context: CloudflareWorkerContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const scriptName = String(input.scriptName);
  await requestText(
    context,
    {
      method: "DELETE",
      path: `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}`,
      query: {
        force: optionalBoolean(input.force),
      },
    },
    "execute",
  );
  return {
    scriptName,
    deleted: true,
  };
}

function resolveAccountId(input: Record<string, unknown>, context: CloudflareWorkerContext): string {
  const inputAccountId = optionalString(input.accountId);
  const accountId = context.accountId ?? optionalString(context.metadata.accountId) ?? inputAccountId;
  if (!accountId) {
    throw new ProviderRequestError(
      400,
      context.metadata.requiresAccountSelection === true || Array.isArray(context.metadata.availableAccounts)
        ? "accountId is required for this Cloudflare Worker action because the OAuth credential can access multiple accounts"
        : "accountId is required in the connected credential",
    );
  }
  if (context.authType === "custom_credential" && inputAccountId && inputAccountId !== accountId) {
    throw new ProviderRequestError(400, "accountId must match the connected credential");
  }
  return accountId;
}

function buildWorkerMutationBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    logpush: optionalBoolean(input.logpush),
    observability: optionalRecord(input.observability),
    subdomain: optionalRecord(input.subdomain),
    tags: normalizeOptionalStringArray(input.tags),
    tail_consumers: normalizeOptionalObjectArray(input.tailConsumers),
  });
}

function buildWorkerScriptUploadFormData(input: Record<string, unknown>): FormData {
  const formData = new FormData();
  const mainModuleName = optionalString(input.mainModuleName) ?? defaultModuleName;
  const mainModuleContentType = optionalString(input.mainModuleContentType) ?? defaultModuleContentType;
  formData.set(
    mainModuleName,
    new File([String(input.mainModuleContent)], mainModuleName, {
      type: mainModuleContentType,
    }),
  );
  for (const module of normalizeOptionalObjectArray(input.modules) ?? []) {
    const moduleName = readRequiredString(module, "name");
    const moduleContentType = optionalString(module.contentType) ?? defaultModuleContentType;
    formData.append(moduleName, new File([String(module.content)], moduleName, { type: moduleContentType }));
  }
  formData.set(
    "metadata",
    new File([JSON.stringify(buildWorkerScriptUploadMetadata(input, mainModuleName))], "metadata.json", {
      type: "application/json",
    }),
  );
  return formData;
}

function buildWorkerScriptUploadMetadata(
  input: Record<string, unknown>,
  mainModuleName: string,
): Record<string, unknown> {
  return compactObject({
    main_module: mainModuleName,
    bindings: normalizeOptionalObjectArray(input.bindings),
    compatibility_date: optionalString(input.compatibilityDate),
    compatibility_flags: normalizeOptionalStringArray(input.compatibilityFlags),
    logpush: optionalBoolean(input.logpush),
    placement: optionalRecord(input.placement),
    tags: normalizeOptionalStringArray(input.tags),
    tail_consumers: normalizeOptionalObjectArray(input.tailConsumers),
    migrations: normalizeOptionalObjectArray(input.migrations),
    annotations: optionalRecord(input.annotations),
    assets: optionalRecord(input.assets),
    keep_assets: optionalBoolean(input.keepAssets),
  });
}

function buildWorkerScriptContentFormData(input: Record<string, unknown>, contentType: string): FormData {
  const formData = new FormData();
  const mainModuleName = optionalString(input.mainModuleName) ?? defaultModuleName;
  formData.set(
    mainModuleName,
    new File([String(input.content)], mainModuleName, {
      type: contentType,
    }),
  );
  formData.set(
    "metadata",
    new File([JSON.stringify({ main_module: mainModuleName })], "metadata.json", {
      type: "application/json",
    }),
  );
  return formData;
}

function buildWorkerScriptSettingsFormData(input: Record<string, unknown>): FormData {
  const formData = new FormData();
  formData.set(
    "settings",
    new File([JSON.stringify(buildWorkerScriptSettingsBody(input))], "settings.json", {
      type: "application/json",
    }),
  );
  return formData;
}

function buildWorkerScriptSettingsBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    bindings: normalizeOptionalObjectArray(input.bindings),
    compatibility_date: optionalString(input.compatibilityDate),
    compatibility_flags: normalizeOptionalStringArray(input.compatibilityFlags),
    logpush: optionalBoolean(input.logpush),
    observability: optionalRecord(input.observability),
    placement_mode: optionalString(input.placementMode),
    tags: normalizeOptionalStringArray(input.tags),
    tail_consumers: normalizeOptionalObjectArray(input.tailConsumers),
    usage_model: optionalString(input.usageModel),
    limits: optionalRecord(input.limits),
    migrations: optionalRecord(input.migrations),
  });
}

async function requestEnvelope(
  context: CloudflareWorkerContext,
  request: CloudflareRequestInput,
  phase: "validate" | "execute",
): Promise<CloudflareEnvelope> {
  return cloudflareRequestEnvelope(context.accessToken, request, context, phase);
}

async function cloudflareRequestEnvelope(
  accessToken: string,
  request: CloudflareRequestInput,
  context: { fetcher: typeof fetch; signal?: AbortSignal },
  phase: "validate" | "execute",
): Promise<CloudflareEnvelope> {
  const response = await context.fetcher(buildCloudflareUrl(request.path, request.query), {
    method: request.method ?? "GET",
    headers: cloudflareHeaders(accessToken, {
      hasBody: request.body !== undefined,
      useJsonContentType: !(request.body instanceof FormData || request.body instanceof Blob),
      extraHeaders: request.headers,
    }),
    body: buildRequestBody(request.body),
    signal: context.signal,
  });
  const envelope = await readCloudflareEnvelope(response);
  if (!response.ok || envelope.success === false) {
    throw normalizeCloudflareError(response, envelope, phase);
  }
  return envelope;
}

function buildRequestBody(body: Record<string, unknown> | FormData | Blob | undefined): BodyInit | undefined {
  if (body === undefined) {
    return undefined;
  }
  if (body instanceof FormData || body instanceof Blob) {
    return body;
  }
  return JSON.stringify(body);
}

async function requestText(
  context: CloudflareWorkerContext,
  request: Omit<CloudflareRequestInput, "body">,
  phase: "validate" | "execute",
): Promise<{ content: string; contentType: string | null }> {
  const response = await context.fetcher(buildCloudflareUrl(request.path, request.query), {
    method: request.method ?? "GET",
    headers: cloudflareHeaders(context.accessToken, { hasBody: false, extraHeaders: request.headers }),
    signal: context.signal,
  });
  if (!response.ok) {
    const envelope = await readCloudflareEnvelope(response);
    throw normalizeCloudflareError(response, envelope, phase);
  }
  return readCloudflareTextResponse(response);
}

function buildCloudflareUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${cloudflareApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(queryParams(query ?? {}))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function cloudflareHeaders(
  accessToken: string,
  input: { hasBody: boolean; useJsonContentType?: boolean; extraHeaders?: Record<string, string> },
): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
    "user-agent": providerUserAgent,
  };
  if (input.hasBody && input.useJsonContentType !== false) {
    headers["content-type"] = "application/json";
  }
  return {
    ...headers,
    ...input.extraHeaders,
  };
}

async function readCloudflareEnvelope(response: Response): Promise<CloudflareEnvelope> {
  try {
    return (await response.json()) as CloudflareEnvelope;
  } catch {
    const text = (await response.text().catch(() => "")) || `cloudflare request failed with ${response.status}`;
    return {
      success: false,
      errors: [{ message: text }],
    };
  }
}

async function readCloudflareTextResponse(
  response: Response,
): Promise<{ content: string; contentType: string | null }> {
  const contentType = response.headers.get("content-type");
  if (!isMultipartFormData(contentType)) {
    return {
      content: await response.text(),
      contentType,
    };
  }
  const multipartContent = await readCloudflareMultipartTextResponse(response, contentType);
  if (multipartContent) {
    return multipartContent;
  }
  return {
    content: await response.text(),
    contentType,
  };
}

async function readCloudflareMultipartTextResponse(
  response: Response,
  fallbackContentType: string | null,
): Promise<{ content: string; contentType: string | null } | undefined> {
  let formData: FormData;
  try {
    formData = await response.clone().formData();
  } catch {
    return undefined;
  }
  const metadata = await readFormDataJsonObject(formData.get("metadata"));
  const partName = optionalString(metadata?.main_module) ?? optionalString(metadata?.body_part);
  const contentPart = (partName ? formData.get(partName) : undefined) ?? firstContentPart(formData);
  if (contentPart == null) {
    return undefined;
  }
  if (typeof contentPart === "string") {
    return {
      content: contentPart,
      contentType: "text/plain",
    };
  }
  return {
    content: await contentPart.text(),
    contentType: contentPart.type || fallbackContentType,
  };
}

async function readFormDataJsonObject(value: FormDataEntryValue | null): Promise<Record<string, unknown> | undefined> {
  if (value == null) {
    return undefined;
  }
  const text = typeof value === "string" ? value : await value.text();
  try {
    return optionalRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function firstContentPart(formData: FormData): FormDataEntryValue | undefined {
  for (const [name, value] of formData.entries()) {
    if (name !== "metadata" && name !== "settings") {
      return value;
    }
  }
  return undefined;
}

function isMultipartFormData(contentType: string | null): boolean {
  return contentType?.toLowerCase().split(";")[0]?.trim() === "multipart/form-data";
}

function normalizeCloudflareError(
  response: Response,
  envelope: CloudflareEnvelope,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = readCloudflareErrorMessage(envelope, response.status);
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && [400, 401, 403, 404].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (response.status === 400 || response.status === 404)) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function readCloudflareErrorMessage(envelope: CloudflareEnvelope, status: number): string {
  for (const error of Array.isArray(envelope.errors) ? envelope.errors : []) {
    const record = optionalRecord(error);
    const message = optionalString(record?.message);
    if (message) {
      return message;
    }
  }
  for (const messageEntry of Array.isArray(envelope.messages) ? envelope.messages : []) {
    const record = optionalRecord(messageEntry);
    const message = optionalString(record?.message);
    if (message) {
      return message;
    }
  }
  return `cloudflare request failed with ${status}`;
}

function normalizeAccount(value: unknown): CloudflareAccount {
  const account = readObject(value, "cloudflare account");
  return compactObject({
    id: readRequiredString(account, "id"),
    name: optionalString(account.name),
    type: optionalString(account.type),
  }) as CloudflareAccount;
}

function normalizeWorkerList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "malformed cloudflare worker list response");
  }
  return value.map((item) => normalizeWorker(item));
}

function normalizeWorker(value: unknown): Record<string, unknown> {
  const worker = readObject(value, "cloudflare worker");
  const id = readRequiredString(worker, "id");
  return compactObject({
    id,
    name: optionalString(worker.name) ?? id,
    createdOn: optionalString(worker.created_on),
    updatedOn: optionalString(worker.updated_on),
    deployedOn: worker.deployed_on === null ? null : optionalString(worker.deployed_on),
    logpush: optionalBoolean(worker.logpush),
    observability: optionalRecord(worker.observability),
    references: optionalRecord(worker.references),
    subdomain: optionalRecord(worker.subdomain),
    tags: readOptionalStringArray(worker.tags),
    tailConsumers: normalizeOptionalObjectArray(worker.tail_consumers),
  });
}

function normalizeWorkerScriptList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "malformed cloudflare worker script list response");
  }
  return value.map((item) => normalizeWorkerScript(item));
}

function normalizeWorkerScript(value: unknown): Record<string, unknown> {
  const script = optionalRecord(value);
  if (!script) {
    return value === undefined ? {} : { raw: value };
  }
  const id = optionalString(script.id);
  const name = optionalString(script.script_name) ?? optionalString(script.name) ?? id;
  return compactObject({
    name,
    scriptTag: optionalString(script.script_tag) ?? (id && id !== name ? id : undefined),
    createdOn: optionalString(script.created_on),
    modifiedOn: optionalString(script.modified_on),
    compatibilityDate: optionalString(script.compatibility_date),
    compatibilityFlags: readOptionalStringArray(script.compatibility_flags),
    entrypoint: optionalString(script.entrypoint),
    handlers: readOptionalStringArray(script.handlers),
    usageModel: optionalString(script.usage_model),
    placementMode: optionalString(script.placement_mode),
    logpush: optionalBoolean(script.logpush),
    environmentName: optionalString(script.environment_name),
    environmentIsDefault: optionalBoolean(script.environment_is_default),
    serviceName: optionalString(script.service_name),
    tags: readOptionalStringArray(script.tags),
    observability: optionalRecord(script.observability),
  });
}

function normalizeWorkerScriptSettings(value: unknown): Record<string, unknown> {
  const settings = optionalRecord(value);
  if (!settings) {
    return value === undefined ? {} : { raw: value };
  }
  return compactObject({
    bindings: normalizeOptionalObjectArray(settings.bindings),
    compatibilityDate: optionalString(settings.compatibility_date),
    compatibilityFlags: readOptionalStringArray(settings.compatibility_flags),
    logpush: optionalBoolean(settings.logpush),
    observability: optionalRecord(settings.observability),
    placementMode: optionalString(settings.placement_mode),
    tags: readOptionalStringArray(settings.tags),
    tailConsumers: normalizeOptionalObjectArray(settings.tail_consumers),
    usageModel: optionalString(settings.usage_model),
    limits: optionalRecord(settings.limits),
    migrations: optionalRecord(settings.migrations),
  });
}

function normalizeWorkerSecretList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "malformed cloudflare worker secret list response");
  }
  return value.map((item) => normalizeWorkerSecret(item));
}

function normalizeWorkerSecret(value: unknown): Record<string, unknown> {
  const secret = readObject(value, "cloudflare worker secret");
  return compactObject({
    name: readRequiredString(secret, "name"),
    type: optionalString(secret.type),
    text: secret.text === null ? null : optionalString(secret.text),
    algorithm: optionalString(secret.algorithm),
    format: optionalString(secret.format),
    publicKey: optionalString(secret.public_key),
    iv: optionalString(secret.iv),
  });
}

function normalizeResultInfo(value: unknown): Record<string, unknown> | undefined {
  const resultInfo = optionalRecord(value);
  if (!resultInfo) {
    return undefined;
  }
  return compactObject({
    page: optionalInteger(resultInfo.page),
    perPage: optionalInteger(resultInfo.per_page),
    count: optionalInteger(resultInfo.count),
    totalCount: optionalInteger(resultInfo.total_count),
    totalPages: optionalInteger(resultInfo.total_pages),
  });
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `malformed ${label} response`);
  }
  return record;
}

function readRequiredString(record: Record<string, unknown>, field: string): string {
  const value = optionalString(record[field]);
  if (!value) {
    throw new ProviderRequestError(502, `malformed cloudflare response: missing ${field}`);
  }
  return value;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => typeof item === "string");
}

function normalizeOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => String(item));
}

function normalizeOptionalObjectArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => optionalRecord(item)).filter((item): item is Record<string, unknown> => item != null);
}
