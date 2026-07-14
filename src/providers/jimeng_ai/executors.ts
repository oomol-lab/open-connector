import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { JimengAiActionName } from "./actions.ts";

import { createHash, createHmac } from "node:crypto";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  normalizeProviderProxyQuery,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "jimeng_ai";
const jimengAiFetch = createProviderFetch({ skipDnsValidation: true });
const jimengApiHost = "visual.volcengineapi.com";
const jimengApiOrigin = `https://${jimengApiHost}`;
const jimengRegion = "cn-north-1";
const jimengServiceName = "cv";
const jimengApiVersion = "2022-08-31";
const submitTaskAction = "CVSync2AsyncSubmitTask";
const getResultAction = "CVSync2AsyncGetResult";
const successCode = 10000;

const reqKeys = {
  imageGeneration40: "jimeng_t2i_v40",
  imageGeneration46: "jimeng_seedream46_cvtob",
  smartUpscale: "jimeng_i2i_seed3_tilesr_cvtob",
  textToImage31: "jimeng_t2i_v31",
  textToImage30: "jimeng_t2i_v30",
  videoGeneration30Pro: "jimeng_ti2v_v30_pro",
  videoGeneration30720p: "jimeng_t2v_v30",
  videoGeneration301080p: "jimeng_t2v_v30_1080p",
  imageToVideoFirstFrame30720p: "jimeng_i2v_first_v30",
  imageToVideoFirstTailFrame30720p: "jimeng_i2v_first_tail_v30",
  imageToVideoFirstFrame301080p: "jimeng_i2v_first_v30_1080",
  imageToVideoFirstTailFrame301080p: "jimeng_i2v_first_tail_v30_1080",
  smartVideoAgent10: "pippit_iv2v_cvtob",
  smartVideoAgent20WithReference: "pippit_iv2v_v20_cvtob_with_vinput",
  smartVideoAgent20WithoutReference: "pippit_iv2v_v20_cvtob",
  marketingVideoAgent: "pippit_iv2v_cvtob_master",
};

interface JimengCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

interface JimengActionContext extends JimengCredentials {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type JimengActionHandler = (input: Record<string, unknown>, context: JimengActionContext) => Promise<unknown>;
type JimengRequestPhase = "validate" | "execute";
type JimengRequestInput = {
  action: typeof submitTaskAction | typeof getResultAction;
  body: Record<string, unknown>;
  credentials: JimengCredentials;
  fetcher: typeof fetch;
  phase: JimengRequestPhase;
  signal?: AbortSignal;
};

export const jimengAiActionHandlers: Record<JimengAiActionName, JimengActionHandler> = {
  submit_image_generation_4_0(input, context) {
    return submitImageTask(input, context, reqKeys.imageGeneration40);
  },
  get_image_generation_4_0_result(input, context) {
    return getImageTaskResult(input, context, reqKeys.imageGeneration40);
  },
  submit_image_generation_4_6(input, context) {
    return submitImageTask(input, context, reqKeys.imageGeneration46);
  },
  get_image_generation_4_6_result(input, context) {
    return getImageTaskResult(input, context, reqKeys.imageGeneration46);
  },
  submit_smart_upscale(input, context) {
    return submitSmartUpscaleTask(input, context);
  },
  get_smart_upscale_result(input, context) {
    return getImageTaskResult(input, context, reqKeys.smartUpscale);
  },
  submit_text_to_image_3_1(input, context) {
    return submitTextToImageTask(input, context, reqKeys.textToImage31);
  },
  get_text_to_image_3_1_result(input, context) {
    return getImageTaskResult(input, context, reqKeys.textToImage31);
  },
  submit_text_to_image_3_0(input, context) {
    return submitTextToImageTask(input, context, reqKeys.textToImage30);
  },
  get_text_to_image_3_0_result(input, context) {
    return getImageTaskResult(input, context, reqKeys.textToImage30);
  },
  submit_video_generation_3_0_pro(input, context) {
    return submitVideoGeneration30ProTask(input, context);
  },
  get_video_generation_3_0_pro_result(input, context) {
    return getVideoTaskResult(input, context, reqKeys.videoGeneration30Pro);
  },
  submit_video_generation_3_0_720p(input, context) {
    return submitVideoTextTask(input, context, reqKeys.videoGeneration30720p);
  },
  get_video_generation_3_0_720p_result(input, context) {
    return getVideoTaskResult(input, context, reqKeys.videoGeneration30720p);
  },
  submit_video_generation_3_0_1080p(input, context) {
    return submitVideoTextTask(input, context, reqKeys.videoGeneration301080p);
  },
  get_video_generation_3_0_1080p_result(input, context) {
    return getVideoTaskResult(input, context, reqKeys.videoGeneration301080p);
  },
  submit_image_to_video_first_frame_3_0_720p(input, context) {
    return submitImageToVideoTask(input, context, reqKeys.imageToVideoFirstFrame30720p);
  },
  submit_image_to_video_first_tail_frame_3_0_720p(input, context) {
    return submitImageToVideoTask(input, context, reqKeys.imageToVideoFirstTailFrame30720p);
  },
  submit_image_to_video_first_frame_3_0_1080p(input, context) {
    return submitImageToVideoTask(input, context, reqKeys.imageToVideoFirstFrame301080p);
  },
  submit_image_to_video_first_tail_frame_3_0_1080p(input, context) {
    return submitImageToVideoTask(input, context, reqKeys.imageToVideoFirstTailFrame301080p);
  },
  submit_smart_video_agent_1_0(input, context) {
    return submitSmartVideoAgentTask(input, context, reqKeys.smartVideoAgent10);
  },
  get_smart_video_agent_1_0_result(input, context) {
    return getVideoTaskResult(input, context, reqKeys.smartVideoAgent10);
  },
  submit_smart_video_agent_2_0_with_reference(input, context) {
    return submitSmartVideoAgentTask(input, context, reqKeys.smartVideoAgent20WithReference);
  },
  get_smart_video_agent_2_0_with_reference_result(input, context) {
    return getVideoTaskResult(input, context, reqKeys.smartVideoAgent20WithReference);
  },
  submit_smart_video_agent_2_0_without_reference(input, context) {
    return submitSmartVideoAgentTask(input, context, reqKeys.smartVideoAgent20WithoutReference);
  },
  get_smart_video_agent_2_0_without_reference_result(input, context) {
    return getVideoTaskResult(input, context, reqKeys.smartVideoAgent20WithoutReference);
  },
  submit_marketing_video_agent(input, context) {
    return submitMarketingVideoAgentTask(input, context);
  },
  get_marketing_video_agent_result(input, context) {
    return getVideoTaskResult(input, context, reqKeys.marketingVideoAgent);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<JimengActionContext>({
  service,
  handlers: jimengAiActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<JimengActionContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure jimeng_ai custom credentials first.");
    }
    return {
      ...resolveJimengCredentials(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const credentials = resolveJimengCredentials(credential.values);
    const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
    const query = normalizeProviderProxyQuery(input.query);
    const body =
      input.body === undefined ? "" : typeof input.body === "string" ? input.body : JSON.stringify(input.body);
    const signed = signVolcRequest({
      method: input.method,
      path: endpoint,
      query,
      body,
      credentials,
    });
    const url = createProviderProxyUrl(jimengApiOrigin, endpoint, query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    for (const [name, value] of Object.entries(signed.headers)) {
      headers.set(name, value);
    }

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = body;
    }

    const response = await jimengAiFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Jimeng AI request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Jimeng AI request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input): Promise<CredentialValidationResult> {
    const credentials = resolveJimengCredentials(input.values);
    return {
      profile: {
        accountId: `jimeng_ai:${hashCredentialId(credentials.accessKeyId)}`,
        displayName: `Jimeng AI - ${credentials.accessKeyId}`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: jimengApiOrigin,
        validationAction: getResultAction,
        region: jimengRegion,
        serviceName: jimengServiceName,
        credentialKind: credentials.sessionToken ? "sts" : "aksk",
      },
    };
  },
};

function submitImageTask(
  input: Record<string, unknown>,
  context: JimengActionContext,
  reqKey: string,
): Promise<unknown> {
  return submitTask(
    compactObject({
      req_key: reqKey,
      image_urls: input.image_urls,
      prompt: input.prompt,
      size: input.size,
      width: input.width,
      height: input.height,
      scale: input.scale,
      force_single: input.force_single,
      min_ratio: input.min_ratio,
      max_ratio: input.max_ratio,
      callback_url: input.callback_url,
      return_url: input.return_url,
      logo_info: stringifyOptionalJson(input.logo_info),
      aigc_meta: stringifyOptionalJson(input.aigc_meta),
    }),
    context,
  );
}

function submitTextToImageTask(
  input: Record<string, unknown>,
  context: JimengActionContext,
  reqKey: string,
): Promise<unknown> {
  return submitTask(
    compactObject({
      req_key: reqKey,
      prompt: input.prompt,
      use_pre_llm: input.use_pre_llm,
      seed: input.seed,
      width: input.width,
      height: input.height,
    }),
    context,
  );
}

function submitVideoTextTask(
  input: Record<string, unknown>,
  context: JimengActionContext,
  reqKey: string,
): Promise<unknown> {
  return submitTask(
    compactObject({
      req_key: reqKey,
      prompt: input.prompt,
      seed: input.seed,
      frames: input.frames,
      aspect_ratio: input.aspect_ratio,
    }),
    context,
  );
}

function submitVideoGeneration30ProTask(
  input: Record<string, unknown>,
  context: JimengActionContext,
): Promise<unknown> {
  if (!optionalString(input.prompt) && !Array.isArray(input.image_urls)) {
    throw new ProviderRequestError(400, "prompt is required when no reference image is provided");
  }
  return submitTask(
    compactObject({
      req_key: reqKeys.videoGeneration30Pro,
      prompt: input.prompt,
      image_urls: input.image_urls,
      seed: input.seed,
      frames: input.frames,
      aspect_ratio: input.aspect_ratio,
    }),
    context,
  );
}

function submitImageToVideoTask(
  input: Record<string, unknown>,
  context: JimengActionContext,
  reqKey: string,
): Promise<unknown> {
  return submitTask(
    compactObject({
      req_key: reqKey,
      prompt: input.prompt,
      image_urls: input.image_urls,
      seed: input.seed,
      frames: input.frames,
      aspect_ratio: input.aspect_ratio,
    }),
    context,
  );
}

function submitSmartUpscaleTask(input: Record<string, unknown>, context: JimengActionContext): Promise<unknown> {
  const imageUrl = optionalString(input.image_url);
  if (!imageUrl) {
    throw new ProviderRequestError(400, "image_url is required");
  }
  return submitTask(
    compactObject({
      req_key: reqKeys.smartUpscale,
      image_urls: [imageUrl],
      resolution: input.resolution,
      scale: input.scale,
    }),
    context,
  );
}

function submitSmartVideoAgentTask(
  input: Record<string, unknown>,
  context: JimengActionContext,
  reqKey: string,
): Promise<unknown> {
  return submitTask(
    compactObject({
      req_key: reqKey,
      prompt: input.prompt,
      img_url_list: input.img_url_list,
      video_url_list: input.video_url_list,
      duration: input.duration,
      ratio: input.ratio,
      language: input.language,
    }),
    context,
  );
}

function submitMarketingVideoAgentTask(input: Record<string, unknown>, context: JimengActionContext): Promise<unknown> {
  return submitTask(
    compactObject({
      req_key: reqKeys.marketingVideoAgent,
      product_name: input.product_name,
      product_img_url_list: input.product_img_url_list,
      model_img_url_list: input.model_img_url_list,
    }),
    context,
  );
}

async function submitTask(body: Record<string, unknown>, context: JimengActionContext): Promise<unknown> {
  const payload = await requestJimengJson({
    action: submitTaskAction,
    body,
    credentials: context,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
  return normalizeSubmitTaskPayload(payload);
}

async function getImageTaskResult(
  input: Record<string, unknown>,
  context: JimengActionContext,
  reqKey: string,
): Promise<unknown> {
  const taskId = requireStringField(input.task_id, "task_id");
  const reqJson = compactObject({
    return_url: true,
    logo_info: input.logo_info,
    aigc_meta: input.aigc_meta,
  });
  const body = compactObject({
    req_key: reqKey,
    task_id: taskId,
    req_json: Object.keys(reqJson).length > 0 ? JSON.stringify(reqJson) : undefined,
  });
  const payload = await requestJimengJson({
    action: getResultAction,
    body,
    credentials: context,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
  return normalizeTaskResultPayload(payload, taskId);
}

async function getVideoTaskResult(
  input: Record<string, unknown>,
  context: JimengActionContext,
  reqKey: string,
): Promise<unknown> {
  const taskId = requireStringField(input.task_id, "task_id");
  const payload = await requestJimengJson({
    action: getResultAction,
    body: {
      req_key: reqKey,
      task_id: taskId,
    },
    credentials: context,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
  return normalizeVideoTaskResultPayload(payload, taskId);
}

async function requestJimengJson(input: JimengRequestInput): Promise<unknown> {
  const query = {
    Action: input.action,
    Version: jimengApiVersion,
  };
  const body = JSON.stringify(input.body);
  const signed = signVolcRequest({
    method: "POST",
    path: "/",
    query,
    body,
    credentials: input.credentials,
  });
  const url = new URL("/", jimengApiOrigin);
  url.search = canonicalQueryString(query);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: "POST",
      headers: signed.headers,
      body,
      signal: input.signal,
    });
    payload = await readJimengPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Jimeng AI request failed";
    throw new ProviderRequestError(502, `Jimeng AI request failed: ${message}`, error);
  }

  if (!response.ok) {
    throw createJimengHttpError(response, payload, input.phase);
  }
  if (isCredentialErrorPayload(payload)) {
    throw credentialError(payload, input.phase);
  }
  if (isJimengBusinessError(payload)) {
    throw createJimengBusinessError(payload);
  }
  return payload;
}

function signVolcRequest(input: {
  method: string;
  path: string;
  query: Record<string, string>;
  body: string;
  credentials: JimengCredentials;
}): { headers: Record<string, string> } {
  const xDate = formatVolcDate(new Date());
  const dateStamp = xDate.slice(0, 8);
  const payloadHash = sha256Hex(input.body);
  const headers = compactObject({
    "content-type": "application/json",
    host: jimengApiHost,
    "x-content-sha256": payloadHash,
    "x-date": xDate,
    "x-security-token": input.credentials.sessionToken,
  }) as Record<string, string>;
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalRequest = [
    input.method,
    input.path,
    canonicalQueryString(input.query),
    `${signedHeaderNames.map((name) => `${name}:${headers[name] ?? ""}`).join("\n")}\n`,
    signedHeaderNames.join(";"),
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${jimengRegion}/${jimengServiceName}/request`;
  const stringToSign = ["HMAC-SHA256", xDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmacHex(getVolcSigningKey(input.credentials.secretAccessKey, dateStamp), stringToSign);
  const authorization = [
    `HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaderNames.join(";")}`,
    `Signature=${signature}`,
  ].join(", ");

  return {
    headers: {
      accept: "application/json",
      "user-agent": providerUserAgent,
      ...headers,
      authorization,
    },
  };
}

function canonicalQueryString(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((key) => `${uriEscape(key)}=${uriEscape(query[key] ?? "")}`)
    .join("&");
}

function uriEscape(value: string): string {
  return encodeURIComponent(value)
    .split("!")
    .join("%21")
    .split("'")
    .join("%27")
    .split("(")
    .join("%28")
    .split(")")
    .join("%29")
    .split("*")
    .join("%2A");
}

function normalizeSubmitTaskPayload(payload: unknown): Record<string, unknown> {
  const record = readObjectPayload(payload, "invalid Jimeng submit response");
  const data = optionalRecord(record.data);
  const taskId = optionalString(record.task_id) ?? optionalString(data?.task_id);
  if (!taskId) {
    throw new ProviderRequestError(502, "Jimeng submit response did not include task_id", payload);
  }

  return compactObject({
    task_id: taskId,
    request_id: optionalString(record.request_id),
    message: optionalString(record.message),
    time_elapsed: optionalString(record.time_elapsed),
    raw: removeBase64Payload(record),
  });
}

function normalizeTaskResultPayload(payload: unknown, taskId: string): Record<string, unknown> {
  const record = readObjectPayload(payload, "invalid Jimeng result response");
  const data = optionalRecord(record.data);
  const status = optionalString(data?.status) ?? "unknown";

  return compactObject({
    task_id: taskId,
    status,
    is_done: status === "done",
    image_urls: readStringArray(data?.image_urls),
    request_id: optionalString(record.request_id),
    message: optionalString(record.message),
    time_elapsed: optionalString(record.time_elapsed),
    raw: removeBase64Payload(record),
  });
}

function normalizeVideoTaskResultPayload(payload: unknown, taskId: string): Record<string, unknown> {
  const record = readObjectPayload(payload, "invalid Jimeng video result response");
  const data = optionalRecord(record.data);
  const status = optionalString(data?.status) ?? "unknown";

  return compactObject({
    task_id: taskId,
    status,
    is_done: status === "done",
    video_url: readVideoUrl(data),
    request_id: optionalString(record.request_id),
    message: optionalString(record.message),
    time_elapsed: optionalString(record.time_elapsed),
    raw: removeBase64Payload(record),
  });
}

function removeBase64Payload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => removeBase64Payload(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "binary_data_base64" && key !== "image_base64")
      .map(([key, nestedValue]) => [key, removeBase64Payload(nestedValue)]),
  );
}

async function readJimengPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createJimengHttpError(response: Response, payload: unknown, phase: JimengRequestPhase): ProviderRequestError {
  if (response.status === 401 || response.status === 403) {
    return credentialError(payload, phase, response.status);
  }
  const message = extractJimengErrorMessage(payload, `Jimeng AI request failed with ${response.status}`);
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function createJimengBusinessError(payload: unknown): ProviderRequestError {
  const code = readBusinessCode(optionalRecord(payload));
  const message = extractJimengErrorMessage(payload, "Jimeng AI request failed");
  if (code === "50429" || code === "50430") {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function credentialError(payload: unknown, phase: JimengRequestPhase, status = 401): ProviderRequestError {
  const message = extractJimengErrorMessage(payload, "Jimeng AI credential is invalid");
  return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
}

function isCredentialErrorPayload(payload: unknown): boolean {
  const record = optionalRecord(payload);
  const responseMetadata = optionalRecord(record?.ResponseMetadata);
  const metadataError = optionalRecord(responseMetadata?.Error);
  const candidates = [
    optionalString(record?.code),
    optionalString(record?.Code),
    optionalString(record?.error_code),
    optionalString(record?.message),
    optionalString(record?.Message),
    optionalString(record?.error),
    optionalString(metadataError?.Code),
    optionalString(metadataError?.Message),
  ].filter((value): value is string => Boolean(value));
  const authFragments = [
    "AuthFailure",
    "AccessDenied",
    "InvalidAccessKey",
    "InvalidAccessKeyId",
    "SignatureDoesNotMatch",
    "Unauthorized",
    "Forbidden",
  ];
  return candidates.some((candidate) => authFragments.some((fragment) => candidate.includes(fragment)));
}

function isJimengBusinessError(payload: unknown): boolean {
  const code = readBusinessCode(optionalRecord(payload));
  return code !== undefined && code !== String(successCode);
}

function readBusinessCode(record: Record<string, unknown> | undefined): string | undefined {
  const value = record?.code;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return optionalString(value);
}

function extractJimengErrorMessage(payload: unknown, fallback: string): string {
  const record = optionalRecord(payload);
  const responseMetadata = optionalRecord(record?.ResponseMetadata);
  const metadataError = optionalRecord(responseMetadata?.Error);
  const code =
    readBusinessCode(record) ??
    optionalString(record?.Code) ??
    optionalString(record?.error_code) ??
    optionalString(metadataError?.Code);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.Message) ??
    optionalString(record?.error) ??
    optionalString(metadataError?.Message) ??
    fallback;
  return code ? `${message} (${code})` : message;
}

function stringifyOptionalJson(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value);
}

function resolveJimengCredentials(input: Record<string, string>): JimengCredentials {
  return {
    accessKeyId: requireStringField(input.accessKeyId, "accessKeyId"),
    secretAccessKey: requireStringField(input.secretAccessKey, "secretAccessKey"),
    sessionToken: optionalString(input.sessionToken),
  };
}

function requireStringField(value: unknown, fieldName: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return resolved;
}

function readObjectPayload(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message, value);
  }
  return record;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readVideoUrl(value: unknown): string | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  return optionalString(record.video_url) ?? optionalString(record.VideoUrl) ?? optionalString(record.videoUrl);
}

function hashCredentialId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function formatVolcDate(value: Date): string {
  const year = String(value.getUTCFullYear()).padStart(4, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getVolcSigningKey(secretAccessKey: string, dateStamp: string): Buffer {
  const kDate = hmac(secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, jimengRegion);
  const kService = hmac(kRegion, jimengServiceName);
  return hmac(kService, "request");
}
