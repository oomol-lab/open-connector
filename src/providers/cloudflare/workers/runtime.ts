import type { ProviderRuntimeHandler } from "../../provider-executors.ts";
import type { CloudflareEnvelope } from "../shared/client.ts";
import type { CloudflareContext } from "../shared/context.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../../core/cast.ts";
import { queryParams } from "../../../core/request.ts";
import { ProviderRequestError, providerUserAgent, providerInputError } from "../../provider-runtime.ts";
import { withCloudflareClient } from "../shared/action-client.ts";
import { cloudflareApiBaseUrl } from "../shared/client.ts";
import { withAccount, resolveAccountId } from "../shared/context.ts";
import { cloudflareResponseError, parseCloudflareResponseText } from "../shared/errors.ts";

interface CloudflareRequestInput {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown> | FormData | Blob;
  headers?: Record<string, string>;
}

const defaultModuleName = "main.js";
const defaultModuleContentType = "application/javascript+module";

export const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = {
  list_workers: withAccount(listWorkers),
  get_worker: withAccount(getWorker),
  create_worker: withAccount(createWorker),
  update_worker: withAccount(updateWorker),
  edit_worker: withAccount(editWorker),
  delete_worker: withAccount(deleteWorker),
  list_worker_scripts: withAccount(listWorkerScripts),
  search_worker_scripts: withAccount(searchWorkerScripts),
  list_build_triggers: withAccount(listBuildTriggers),
  create_manual_build: withAccount(createManualBuild),
  list_builds: withAccount(listBuilds),
  get_build: withAccount(getBuild),
  get_build_logs: withAccount(getBuildLogs),
  cancel_build: withAccount(cancelBuild),
  upload_worker_script: withAccount(uploadWorkerScript),
  put_worker_script_content: withAccount(putWorkerScriptContent),
  get_worker_script_content: withAccount(getWorkerScriptContent),
  get_worker_script_settings: withAccount(getWorkerScriptSettings),
  patch_worker_script_settings: withAccount(patchWorkerScriptSettings),
  list_worker_script_secrets: withAccount(listWorkerScriptSecrets),
  get_worker_script_secret: withAccount(getWorkerScriptSecret),
  put_worker_script_secret: withAccount(putWorkerScriptSecret),
  delete_worker_script_secret: withAccount(deleteWorkerScriptSecret),
  delete_worker_script: withAccount(deleteWorkerScript),
  list_worker_routes: withCloudflareClient((client) => client.list({ path: `${client.zonePath()}/workers/routes` })),
  create_worker_route: withCloudflareClient((client) =>
    client.resource({
      path: `${client.zonePath()}/workers/routes`,
      method: "POST",
      body: { pattern: client.input.pattern, script: client.input.scriptName },
    }),
  ),
  update_worker_route: withCloudflareClient((client) =>
    client.resource({
      path: `${client.zonePath()}/workers/routes/${client.id("routeId")}`,
      method: "PUT",
      body: { pattern: client.input.pattern, script: client.input.scriptName },
    }),
  ),
  delete_worker_route: withCloudflareClient((client) =>
    client.resource({
      path: `${client.zonePath()}/workers/routes/${client.id("routeId")}`,
      method: "DELETE",
    }),
  ),
  list_worker_domains: withAccount(
    withCloudflareClient((client) =>
      client.list({
        path: `${client.accountPath()}/workers/domains`,
        query: {
          zone_id: optionalString(client.input.zoneId),
          hostname: optionalString(client.input.hostname),
          service: optionalString(client.input.service),
        },
      }),
    ),
  ),
  attach_worker_domain: withAccount(
    withCloudflareClient((client) =>
      client.resource({
        path: `${client.accountPath()}/workers/domains`,
        method: "PUT",
        body: {
          zone_id: client.input.zoneId,
          hostname: client.input.hostname,
          service: client.input.service,
          environment: client.input.environment ?? "production",
        },
      }),
    ),
  ),
  delete_worker_domain: withAccount(
    withCloudflareClient((client) =>
      client.resource({
        path: `${client.accountPath()}/workers/domains/${client.id("domainId")}`,
        method: "DELETE",
      }),
    ),
  ),
};

async function listWorkers(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function getWorker(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function createWorker(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function updateWorker(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function editWorker(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function deleteWorker(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function listWorkerScripts(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function searchWorkerScripts(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function listBuildTriggers(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const scriptTag = requiredString(input.scriptTag, "scriptTag", providerInputError);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/builds/workers/${encodeURIComponent(scriptTag)}/triggers`,
    },
    "execute",
  );
  return { triggers: normalizeBuildTriggerList(envelope.result) };
}

async function createManualBuild(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const triggerUuid = requiredString(input.triggerUuid, "triggerUuid", providerInputError);
  const branch = optionalString(input.branch);
  const commitHash = optionalString(input.commitHash);
  if (!branch && !commitHash) {
    throw new ProviderRequestError(400, "branch or commitHash is required");
  }
  const envelope = await requestEnvelope(
    context,
    {
      method: "POST",
      path: `/accounts/${encodeURIComponent(accountId)}/builds/triggers/${encodeURIComponent(triggerUuid)}/builds`,
      body: compactObject({ branch, commit_hash: commitHash }),
    },
    "execute",
  );
  const build = readObject(envelope.result, "cloudflare worker build creation");
  return compactObject({
    buildUuid: readRequiredString(build, "build_uuid"),
    createdOn: optionalString(build.created_on),
  });
}

async function listBuilds(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const scriptTag = requiredString(input.scriptTag, "scriptTag", providerInputError);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/builds/workers/${encodeURIComponent(scriptTag)}/builds`,
      query: {
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
      },
    },
    "execute",
  );
  return compactObject({
    builds: normalizeBuildList(envelope.result),
    resultInfo: normalizeResultInfo(envelope.result_info),
  });
}

async function getBuild(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const buildUuid = requiredString(input.buildUuid, "buildUuid", providerInputError);
  const envelope = await requestEnvelope(
    context,
    { path: `/accounts/${encodeURIComponent(accountId)}/builds/builds/${encodeURIComponent(buildUuid)}` },
    "execute",
  );
  return { build: normalizeBuild(envelope.result) };
}

async function getBuildLogs(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const buildUuid = requiredString(input.buildUuid, "buildUuid", providerInputError);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/builds/builds/${encodeURIComponent(buildUuid)}/logs`,
      query: { cursor: optionalString(input.cursor) },
    },
    "execute",
  );
  const logs = readObject(envelope.result, "cloudflare worker build logs");
  return compactObject({
    lines: normalizeBuildLogLines(logs.lines),
    cursor: optionalString(logs.cursor),
    truncated: optionalBoolean(logs.truncated),
  });
}

async function cancelBuild(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const buildUuid = requiredString(input.buildUuid, "buildUuid", providerInputError);
  const envelope = await requestEnvelope(
    context,
    {
      method: "PUT",
      path: `/accounts/${encodeURIComponent(accountId)}/builds/builds/${encodeURIComponent(buildUuid)}/cancel`,
    },
    "execute",
  );
  const build = readObject(envelope.result, "cloudflare cancelled worker build");
  return compactObject({
    buildUuid: optionalString(build.build_uuid) ?? buildUuid,
    buildOutcome: optionalString(build.build_outcome),
    stoppedOn: build.stopped_on === null ? null : optionalString(build.stopped_on),
  });
}

async function uploadWorkerScript(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function putWorkerScriptContent(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function getWorkerScriptContent(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function getWorkerScriptSettings(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function patchWorkerScriptSettings(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function listWorkerScriptSecrets(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function getWorkerScriptSecret(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function putWorkerScriptSecret(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function deleteWorkerScriptSecret(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function deleteWorkerScript(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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
  context: CloudflareContext,
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
    throw cloudflareResponseError(response, envelope, phase);
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
  context: CloudflareContext,
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
    throw cloudflareResponseError(response, envelope, phase);
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
  return parseCloudflareResponseText(await response.text());
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
    scriptTag: optionalString(script.tag) ?? optionalString(script.script_tag) ?? (id && id !== name ? id : undefined),
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

function normalizeBuildTriggerList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "malformed cloudflare build trigger list response");
  }
  return value.map((item) => normalizeBuildTrigger(item));
}

function normalizeBuildTrigger(value: unknown): Record<string, unknown> {
  const trigger = readObject(value, "cloudflare worker build trigger");
  return compactObject({
    triggerUuid: readRequiredString(trigger, "trigger_uuid"),
    triggerName: optionalString(trigger.trigger_name),
    externalScriptId: optionalString(trigger.external_script_id),
    buildCommand: optionalString(trigger.build_command),
    deployCommand: optionalString(trigger.deploy_command),
    rootDirectory: optionalString(trigger.root_directory),
    branchIncludes: readOptionalStringArray(trigger.branch_includes),
    branchExcludes: readOptionalStringArray(trigger.branch_excludes),
    pathIncludes: readOptionalStringArray(trigger.path_includes),
    pathExcludes: readOptionalStringArray(trigger.path_excludes),
    buildCachingEnabled: optionalBoolean(trigger.build_caching_enabled),
    buildTokenUuid: optionalString(trigger.build_token_uuid),
    buildTokenName: optionalString(trigger.build_token_name),
    createdOn: optionalString(trigger.created_on),
    modifiedOn: optionalString(trigger.modified_on),
    deletedOn: trigger.deleted_on === null ? null : optionalString(trigger.deleted_on),
    repoConnection: normalizeBuildRepoConnection(trigger.repo_connection),
  });
}

function normalizeBuildRepoConnection(value: unknown): Record<string, unknown> | undefined {
  const connection = optionalRecord(value);
  if (!connection) {
    return undefined;
  }
  return compactObject({
    providerAccountId: optionalString(connection.provider_account_id),
    providerAccountName: optionalString(connection.provider_account_name),
    providerType: optionalString(connection.provider_type),
    repoConnectionUuid: optionalString(connection.repo_connection_uuid),
    repoId: optionalString(connection.repo_id),
    repoName: optionalString(connection.repo_name),
    createdOn: optionalString(connection.created_on),
    modifiedOn: optionalString(connection.modified_on),
    deletedOn: connection.deleted_on === null ? null : optionalString(connection.deleted_on),
  });
}

function normalizeBuildList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "malformed cloudflare worker build list response");
  }
  return value.map((item) => normalizeBuild(item));
}

function normalizeBuild(value: unknown): Record<string, unknown> {
  const build = readObject(value, "cloudflare worker build");
  const status = optionalString(build.status);
  const buildOutcome = optionalString(build.build_outcome);
  return compactObject({
    buildUuid: readRequiredString(build, "build_uuid"),
    state: normalizeBuildState(status, buildOutcome),
    status,
    buildOutcome,
    createdOn: optionalString(build.created_on),
    initializingOn: build.initializing_on === null ? null : optionalString(build.initializing_on),
    runningOn: build.running_on === null ? null : optionalString(build.running_on),
    stoppedOn: build.stopped_on === null ? null : optionalString(build.stopped_on),
    modifiedOn: optionalString(build.modified_on),
    triggerMetadata: normalizeBuildTriggerMetadata(build.build_trigger_metadata),
    trigger: build.trigger == null ? undefined : normalizeBuildTrigger(build.trigger),
    pullRequest: normalizeBuildPullRequest(build.pull_request),
  });
}

function normalizeBuildState(status: string | undefined, buildOutcome: string | undefined): string {
  if (status === "queued" || status === "initializing" || status === "running") {
    return status;
  } else if (status === "stopped" && (buildOutcome === "success" || buildOutcome === "skipped")) {
    return "succeeded";
  } else if (
    status === "stopped" &&
    (buildOutcome === "fail" || buildOutcome === "cancelled" || buildOutcome === "terminated")
  ) {
    return "failed";
  } else {
    return "stopped";
  }
}

function normalizeBuildTriggerMetadata(value: unknown): Record<string, unknown> | undefined {
  const metadata = optionalRecord(value);
  if (!metadata) {
    return undefined;
  }
  return compactObject({
    author: optionalString(metadata.author),
    branch: optionalString(metadata.branch),
    buildCommand: optionalString(metadata.build_command),
    deployCommand: optionalString(metadata.deploy_command),
    buildTokenName: optionalString(metadata.build_token_name),
    buildTokenUuid: optionalString(metadata.build_token_uuid),
    buildTriggerSource: optionalString(metadata.build_trigger_source),
    commitHash: optionalString(metadata.commit_hash),
    commitMessage: optionalString(metadata.commit_message),
    environmentVariables: optionalRecord(metadata.environment_variables),
    providerAccountName: optionalString(metadata.provider_account_name),
    providerType: optionalString(metadata.provider_type),
    repoName: optionalString(metadata.repo_name),
    rootDirectory: optionalString(metadata.root_directory),
  });
}

function normalizeBuildPullRequest(value: unknown): Record<string, unknown> | undefined {
  const pullRequest = optionalRecord(value);
  if (!pullRequest) {
    return undefined;
  }
  return compactObject({
    createdOn: optionalString(pullRequest.created_on),
    pullRequestUrl: optionalString(pullRequest.pull_request_url),
  });
}

function normalizeBuildLogLines(value: unknown): Array<{ timestamp: number; message: string }> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "malformed cloudflare worker build logs response");
  }
  return value.map((line) => {
    if (!Array.isArray(line) || typeof line[0] !== "number" || typeof line[1] !== "string") {
      throw new ProviderRequestError(502, "malformed cloudflare worker build log line");
    }
    return { timestamp: line[0], message: line[1] };
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
