import type { CredentialValidators, ProviderExecutors, TransitFileWriter } from "../../core/types.ts";
import type {
  ApiKeyProviderContext,
  ProviderActionHandlers,
  ProviderActionName,
  ProviderActionSources,
} from "../provider-runtime.ts";

import { base64Bytes, compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, compactJson, readBoundedResponseBytes } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  mapProviderActionSources,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readTransitFileInput,
} from "../provider-runtime.ts";

const service = "mistral_ai";
const mistralApiBaseUrl = "https://api.mistral.ai";
const maxRemoteUploadBytes = 100 * 1024 * 1024;

type MistralRequestPhase = "validate" | "execute";
type MistralActionKind = "json" | "multipart" | "download";
type MistralActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface MistralActionSpec {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  kind?: MistralActionKind;
  pathKeys?: string[];
  queryKeys?: string[];
  bodyOnDelete?: boolean;
}

interface UploadSource {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

const mistralActionSpecs: ProviderActionSources<"mistral_ai", MistralActionSpec> = {
  list_models: { method: "GET", path: "/v1/models" },
  get_model: { method: "GET", path: "/v1/models/{model_id}", pathKeys: ["model_id"] },
  list_conversations: { method: "GET", path: "/v1/conversations" },
  start_conversation: { method: "POST", path: "/v1/conversations" },
  get_conversation: { method: "GET", path: "/v1/conversations/{conversation_id}", pathKeys: ["conversation_id"] },
  delete_conversation: {
    method: "DELETE",
    path: "/v1/conversations/{conversation_id}",
    pathKeys: ["conversation_id"],
  },
  append_to_conversation: {
    method: "POST",
    path: "/v1/conversations/{conversation_id}",
    pathKeys: ["conversation_id"],
  },
  get_conversation_history: {
    method: "GET",
    path: "/v1/conversations/{conversation_id}/history",
    pathKeys: ["conversation_id"],
  },
  get_conversation_messages: {
    method: "GET",
    path: "/v1/conversations/{conversation_id}/messages",
    pathKeys: ["conversation_id"],
  },
  restart_conversation: {
    method: "POST",
    path: "/v1/conversations/{conversation_id}/restart",
    pathKeys: ["conversation_id"],
  },
  list_agents: { method: "GET", path: "/v1/agents" },
  create_agent: { method: "POST", path: "/v1/agents" },
  get_agent: { method: "GET", path: "/v1/agents/{agent_id}", pathKeys: ["agent_id"] },
  update_agent: { method: "PATCH", path: "/v1/agents/{agent_id}", pathKeys: ["agent_id"] },
  delete_agent: { method: "DELETE", path: "/v1/agents/{agent_id}", pathKeys: ["agent_id"] },
  update_agent_version: {
    method: "PATCH",
    path: "/v1/agents/{agent_id}/version",
    pathKeys: ["agent_id"],
    queryKeys: ["version"],
  },
  list_agent_versions: { method: "GET", path: "/v1/agents/{agent_id}/versions", pathKeys: ["agent_id"] },
  get_agent_version: {
    method: "GET",
    path: "/v1/agents/{agent_id}/versions/{version}",
    pathKeys: ["agent_id", "version"],
  },
  create_or_update_agent_alias: {
    method: "PUT",
    path: "/v1/agents/{agent_id}/aliases",
    pathKeys: ["agent_id"],
    queryKeys: ["alias", "version"],
  },
  list_agent_aliases: { method: "GET", path: "/v1/agents/{agent_id}/aliases", pathKeys: ["agent_id"] },
  create_chat_completion: { method: "POST", path: "/v1/chat/completions" },
  create_fim_completion: { method: "POST", path: "/v1/fim/completions" },
  create_agents_completion: { method: "POST", path: "/v1/agents/completions" },
  create_embeddings: { method: "POST", path: "/v1/embeddings" },
  create_moderation: { method: "POST", path: "/v1/moderations" },
  create_chat_moderation: { method: "POST", path: "/v1/chat/moderations" },
  create_ocr: { method: "POST", path: "/v1/ocr" },
  create_audio_transcription: { method: "POST", path: "/v1/audio/transcriptions", kind: "multipart" },
  list_files: { method: "GET", path: "/v1/files" },
  upload_file: { method: "POST", path: "/v1/files", kind: "multipart" },
  retrieve_file: { method: "GET", path: "/v1/files/{file_id}", pathKeys: ["file_id"] },
  delete_file: { method: "DELETE", path: "/v1/files/{file_id}", pathKeys: ["file_id"] },
  download_file: { method: "GET", path: "/v1/files/{file_id}/content", pathKeys: ["file_id"], kind: "download" },
  get_file_signed_url: { method: "GET", path: "/v1/files/{file_id}/url", pathKeys: ["file_id"] },
  get_fine_tuning_jobs: { method: "GET", path: "/v1/fine_tuning/jobs" },
  list_batch_jobs: { method: "GET", path: "/v1/batch/jobs" },
  list_libraries: { method: "GET", path: "/v1/libraries" },
  create_library: { method: "POST", path: "/v1/libraries" },
  get_library: { method: "GET", path: "/v1/libraries/{library_id}", pathKeys: ["library_id"] },
  update_library: { method: "PUT", path: "/v1/libraries/{library_id}", pathKeys: ["library_id"] },
  delete_library: { method: "DELETE", path: "/v1/libraries/{library_id}", pathKeys: ["library_id"] },
  list_library_documents: {
    method: "GET",
    path: "/v1/libraries/{library_id}/documents",
    pathKeys: ["library_id"],
  },
  upload_library_document: {
    method: "POST",
    path: "/v1/libraries/{library_id}/documents",
    pathKeys: ["library_id"],
    kind: "multipart",
  },
  get_library_document: {
    method: "GET",
    path: "/v1/libraries/{library_id}/documents/{document_id}",
    pathKeys: ["library_id", "document_id"],
  },
  update_library_document: {
    method: "PUT",
    path: "/v1/libraries/{library_id}/documents/{document_id}",
    pathKeys: ["library_id", "document_id"],
  },
  delete_library_document: {
    method: "DELETE",
    path: "/v1/libraries/{library_id}/documents/{document_id}",
    pathKeys: ["library_id", "document_id"],
  },
  get_document_text_content: {
    method: "GET",
    path: "/v1/libraries/{library_id}/documents/{document_id}/text_content",
    pathKeys: ["library_id", "document_id"],
  },
  get_document_status: {
    method: "GET",
    path: "/v1/libraries/{library_id}/documents/{document_id}/status",
    pathKeys: ["library_id", "document_id"],
  },
  get_document_signed_url: {
    method: "GET",
    path: "/v1/libraries/{library_id}/documents/{document_id}/signed-url",
    pathKeys: ["library_id", "document_id"],
  },
  get_document_extracted_text_url: {
    method: "GET",
    path: "/v1/libraries/{library_id}/documents/{document_id}/extracted-text-signed-url",
    pathKeys: ["library_id", "document_id"],
  },
  reprocess_document: {
    method: "POST",
    path: "/v1/libraries/{library_id}/documents/{document_id}/reprocess",
    pathKeys: ["library_id", "document_id"],
  },
  list_library_shares: { method: "GET", path: "/v1/libraries/{library_id}/share", pathKeys: ["library_id"] },
  create_library_share: { method: "PUT", path: "/v1/libraries/{library_id}/share", pathKeys: ["library_id"] },
  delete_library_share: {
    method: "DELETE",
    path: "/v1/libraries/{library_id}/share",
    pathKeys: ["library_id"],
    bodyOnDelete: true,
  },
};

export const mistralAiActionHandlers: ProviderActionHandlers<"mistral_ai", MistralActionHandler> =
  mapProviderActionSources(
    service,
    mistralActionSpecs,
    (name): MistralActionHandler =>
      (input, context) =>
        executeMistralAction(name, input, context),
  );

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mistralAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const response = await fetcher(`${mistralApiBaseUrl}/v1/models`, {
      headers: mistralHeaders(input.apiKey),
      signal,
    });
    await assertMistralResponse(response, "validate");
    const payload = (await response.json().catch(() => ({}))) as { data?: Array<{ id?: unknown }> };

    return {
      profile: {
        displayName: "Mistral AI API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v1/models",
        availableModels: (payload.data ?? [])
          .map((model) => model.id)
          .filter((model): model is string => typeof model === "string"),
      },
    };
  },
};

async function executeMistralAction(
  actionName: ProviderActionName<"mistral_ai">,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const spec = mistralActionSpecs[actionName];
  assertStreamingDisabled(actionName, input);

  if (spec.kind === "download") {
    return downloadMistralFile(input, context);
  }

  if (actionName === "create_audio_transcription") {
    return executeAudioTranscriptionAction(input, spec, context);
  }

  if (spec.kind === "multipart") {
    return executeMultipartMistralAction(input, spec, context);
  }

  return executeJsonMistralAction(input, spec, context);
}

async function executeJsonMistralAction(
  input: Record<string, unknown>,
  spec: MistralActionSpec,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const { url, remainingInput } = buildMistralUrl(spec, input);
  const requestInit: RequestInit = {
    method: spec.method,
    headers: mistralHeaders(context.apiKey),
    signal: context.signal,
  };

  if (spec.method === "POST" || spec.method === "PUT" || spec.method === "PATCH") {
    requestInit.body = JSON.stringify(compactJson(remainingInput));
  } else if (spec.method === "DELETE" && spec.bodyOnDelete) {
    requestInit.body = JSON.stringify(compactJson(remainingInput));
  }

  const response = await context.fetcher(url, requestInit);
  await assertMistralResponse(response, "execute");

  if (response.status === 204) {
    return { deleted: true };
  }

  return readMistralResponse(response);
}

async function executeMultipartMistralAction(
  input: Record<string, unknown>,
  spec: MistralActionSpec,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { url, remainingInput } = buildMistralUrl(spec, input);
  const uploadSource = await resolveUploadSource(remainingInput, context);
  const formData = new FormData();
  formData.set(
    "file",
    new File([Uint8Array.from(uploadSource.bytes)], uploadSource.fileName, { type: uploadSource.mimeType }),
  );

  for (const [key, value] of Object.entries(remainingInput)) {
    if (key !== "file") {
      appendMultipartField(formData, key, value);
    }
  }

  const response = await context.fetcher(url, {
    method: spec.method,
    headers: mistralMultipartHeaders(context.apiKey),
    body: formData,
    signal: context.signal,
  });

  await assertMistralResponse(response, "execute");
  return readMistralResponse(response);
}

async function executeAudioTranscriptionAction(
  input: Record<string, unknown>,
  spec: MistralActionSpec,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { url, remainingInput } = buildMistralUrl(spec, input);
  const source = resolveAudioTranscriptionSource(remainingInput);
  const formData = new FormData();

  if (source.fileId) {
    formData.set("file_id", source.fileId);
  } else if (source.fileUrl) {
    formData.set("file_url", readPublicFileUrl(source.fileUrl, "file.url").toString());
  } else {
    const uploadSource = await resolveUploadSource(remainingInput, context);
    formData.set(
      "file",
      new File([Uint8Array.from(uploadSource.bytes)], uploadSource.fileName, { type: uploadSource.mimeType }),
    );
  }

  for (const [key, value] of Object.entries(remainingInput)) {
    if (key !== "file" && key !== "file_id") {
      appendMultipartField(formData, key, value);
    }
  }

  const response = await context.fetcher(url, {
    method: spec.method,
    headers: mistralMultipartHeaders(context.apiKey),
    body: formData,
    signal: context.signal,
  });

  await assertMistralResponse(response, "execute");
  return readMistralResponse(response);
}

async function downloadMistralFile(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "download_file requires local transit file storage.");
  }

  const fileId = requiredString(input.file_id, "file_id", providerInputError);
  const metadata = optionalRecord(
    await executeJsonMistralAction(
      { file_id: fileId },
      { method: "GET", path: "/v1/files/{file_id}", pathKeys: ["file_id"] },
      context,
    ),
  );

  const response = await context.fetcher(`${mistralApiBaseUrl}/v1/files/${encodeURIComponent(fileId)}/content`, {
    headers: mistralHeaders(context.apiKey, false),
    signal: context.signal,
  });
  await assertMistralResponse(response, "execute");

  const fileName = optionalString(metadata?.filename) ?? `${fileId}.bin`;
  const mimeType =
    optionalString(metadata?.mimetype) ?? response.headers.get("content-type") ?? "application/octet-stream";
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: fileName,
    createError: (message) => new ProviderRequestError(413, message),
  });
  const stored = await context.transitFiles.create(new File([Uint8Array.from(bytes)], fileName, { type: mimeType }));

  return {
    content: {
      fileId: stored.fileId,
      downloadUrl: stored.downloadUrl,
      sizeBytes: stored.sizeBytes,
      name: stored.name,
      mimeType: stored.mimeType,
    },
  };
}

function buildMistralUrl(
  spec: MistralActionSpec,
  input: Record<string, unknown>,
): {
  url: string;
  remainingInput: Record<string, unknown>;
} {
  const remainingInput = { ...input };
  let path = spec.path;
  for (const key of spec.pathKeys ?? []) {
    const value = requiredString(remainingInput[key], key, providerInputError);
    path = path.replace(`{${key}}`, encodeURIComponent(value));
    delete remainingInput[key];
  }

  const url = new URL(path, mistralApiBaseUrl);
  const queryEntries =
    spec.method === "GET" || (spec.method === "DELETE" && !spec.bodyOnDelete)
      ? remainingInput
      : pullQueryEntries(remainingInput, spec.queryKeys ?? []);

  for (const [key, value] of Object.entries(queryEntries)) {
    appendQueryValue(url, key, value);
  }

  return {
    url: url.toString(),
    remainingInput,
  };
}

function resolveAudioTranscriptionSource(input: Record<string, unknown>): { fileId?: string; fileUrl?: string } {
  const file = optionalRecord(input.file);
  const fileId = optionalString(input.file_id);
  const fileUrl = optionalString(file?.url);
  const hasInlineFile = file ? optionalString(file.content_base64) || optionalString(file.fileId) : undefined;
  const sourceCount = Number(Boolean(fileId)) + Number(Boolean(fileUrl)) + Number(Boolean(hasInlineFile));

  if (sourceCount > 1) {
    throw new ProviderRequestError(400, "provide only one of file_id, file.url, file.fileId, or file.content_base64");
  }

  return { fileId, fileUrl };
}

function pullQueryEntries(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const queryEntries: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in input) {
      queryEntries[key] = input[key];
      delete input[key];
    }
  }
  return queryEntries;
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(url, key, item);
    }
    return;
  }
  if (typeof value === "object") {
    url.searchParams.append(key, JSON.stringify(value));
    return;
  }
  url.searchParams.append(key, String(value));
}

async function resolveUploadSource(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<UploadSource> {
  const file = optionalRecord(input.file);
  if (!file) {
    throw new ProviderRequestError(400, "file is required.");
  }

  if (optionalString(file.fileId)) {
    return readTransitUploadSource(file, context.transitFiles);
  }

  const fileName = requiredString(file.name, "file.name", providerInputError);
  const mimeType = optionalString(file.mimeType) ?? optionalString(file.mimetype);
  const fileUrl = optionalString(file.url);
  const contentBase64 = optionalString(file.content_base64);

  if (fileUrl && contentBase64) {
    throw new ProviderRequestError(400, "provide only one of file.url or file.content_base64");
  }
  if (fileUrl) {
    return readRemoteUploadSource(fileUrl, fileName, mimeType, context);
  }
  if (contentBase64) {
    return {
      bytes: base64Bytes(contentBase64, "file.content_base64", providerInputError),
      fileName,
      mimeType: mimeType ?? "application/octet-stream",
    };
  }

  throw new ProviderRequestError(400, "file must include fileId, url, or content_base64");
}

async function readTransitUploadSource(
  file: Record<string, unknown>,
  transitFiles: TransitFileWriter | undefined,
): Promise<UploadSource> {
  const stored = await readTransitFileInput(file, { transitFiles });
  return {
    bytes: new Uint8Array(await stored.file.arrayBuffer()),
    fileName: stored.name,
    mimeType: stored.mimeType,
  };
}

async function readRemoteUploadSource(
  fileUrl: string,
  fileName: string,
  mimeType: string | undefined,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
): Promise<UploadSource> {
  const url = readPublicFileUrl(fileUrl, "file.url");
  const response = await context.fetcher(url, {
    headers: {
      accept: "*/*",
      "user-agent": providerUserAgent,
    },
    signal: context.signal,
  });
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status >= 500 ? 502 : response.status,
      `failed to fetch file.url: ${response.status}`,
    );
  }

  return {
    bytes: await readBoundedResponseBytes(response, {
      maxBytes: maxRemoteUploadBytes,
      fieldName: "file.url",
      createError: (message) => new ProviderRequestError(413, message),
    }),
    fileName,
    mimeType: mimeType ?? response.headers.get("content-type") ?? "application/octet-stream",
  };
}

function readPublicFileUrl(fileUrl: string, fieldName: string): URL {
  return assertPublicHttpUrl(fileUrl, {
    fieldName,
    createError: providerInputError,
  });
}

function appendMultipartField(formData: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendMultipartField(formData, key, item);
    }
    return;
  }
  formData.append(key, serializeMultipartValue(value));
}

function serializeMultipartValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function mistralHeaders(apiKey: string, includeJsonContentType = true): Record<string, string> {
  return compactObject({
    authorization: `Bearer ${apiKey}`,
    "content-type": includeJsonContentType ? "application/json" : undefined,
    "user-agent": providerUserAgent,
  }) as Record<string, string>;
}

function mistralMultipartHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

function assertStreamingDisabled(actionName: string, input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw new ProviderRequestError(400, `${actionName} does not support stream=true in connector actions`);
  }
}

async function readMistralResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      throw new ProviderRequestError(502, "mistral_ai returned malformed JSON");
    }
  }
  return response.text();
}

async function assertMistralResponse(response: Response, phase: MistralRequestPhase): Promise<void> {
  if (response.ok) {
    return;
  }

  const error = await readMistralError(response);
  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(response.status, error.message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(400, error.message);
  }

  throw new ProviderRequestError(response.status || 502, error.message);
}

async function readMistralError(response: Response): Promise<{ type: string; message: string }> {
  try {
    const payload = optionalRecord(await response.json());
    const message =
      optionalString(payload?.detail) ??
      optionalString(payload?.message) ??
      optionalString(payload?.error) ??
      `mistral_ai request failed with ${response.status}`;
    return {
      type: optionalString(payload?.type) ?? "provider_error",
      message,
    };
  } catch {
    return {
      type: "provider_error",
      message: (await response.text().catch(() => "")) || `mistral_ai request failed with ${response.status}`,
    };
  }
}
