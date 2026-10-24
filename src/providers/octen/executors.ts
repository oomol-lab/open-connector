import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString, optionalNumber, looseArray } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { downloadUploadSource } from "../provider-files.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredResponseRecord,
  isAbortLikeError,
  runProviderRequest,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";
import { octenActions } from "./actions.ts";
import { octenRoutes } from "./actions.ts";
import { readResearch } from "./research.ts";
const baseUrl = "https://api.octen.ai";
async function request(
  apiKey: string,
  name: string,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const route = octenRoutes[name]!;
  let path = route.path;
  for (const field of ["id", "generation_id"]) {
    if (path.includes(`{${field}}`)) path = path.replace(`{${field}}`, encodeURIComponent(String(input[field])));
  }
  const timeoutMs = ["research", "chat", "messages", "answer", "generate_images", "broad_search"].includes(name)
    ? 150000
    : name === "extract"
      ? ((optionalNumber(input.timeout) ?? 30) + 15) * 1000
      : undefined;
  return runProviderRequest({ label: "Octen", timeoutMs, signal: parentSignal }, async (signal) => {
    const response = await fetcher(`${baseUrl}${path}`, {
      method: route.method,
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        accept: name === "research" ? "text/event-stream" : "application/json",
      },
      body: route.method === "POST" ? JSON.stringify(input) : undefined,
      signal,
    });
    if (response.ok && name === "research") return readResearch(response);
    const body: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    const object = optionalRecord(body);
    const code = optionalNumber(object?.code);
    if (!response.ok || (code !== undefined && code !== 0 && code >= 400)) {
      const nested = optionalRecord(object?.error);
      const message = optionalString(object?.msg) ?? optionalString(nested?.message) ?? `HTTP ${response.status}`;
      const invalidKey = (code === 401 && object?.msg === "Invalid API Key") || nested?.type === "authentication_error";
      throw new ProviderRequestError(
        response.ok ? (code ?? 502) : response.status,
        `Octen request failed: ${message}`,
        undefined,
        invalidKey ? "authorization_failed" : "provider_error",
      );
    }
    return requiredResponseRecord(body, "Octen response");
  });
}
async function imageData(url: string, fieldName: string, fetcher: typeof fetch, signal?: AbortSignal) {
  const file = await downloadUploadSource({ url, fieldName, fetcher, signal });
  const mime = file.contentType?.split(";")[0];
  if (!mime || !["image/png", "image/jpeg", "image/webp"].includes(mime)) {
    throw providerInputError(`${fieldName} must return a PNG, JPEG or WebP image`);
  }
  if (fieldName === "mask_url" && mime !== "image/png") {
    throw providerInputError("mask_url must return a PNG image");
  }
  return `data:${mime};base64,${Buffer.from(file.bytes).toString("base64")}`;
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const data = { ...values };
  const transitFiles = context.transitFiles;
  if (actionName === "generate_images") {
    if (!transitFiles)
      throw new ProviderRequestError(
        503,
        "Octen image generation requires configured file transit and execution identity",
        undefined,
        "provider_error",
      );
    const urls = looseArray(data.image_urls);
    if (urls.length) {
      const images = [];
      for (const url of urls) images.push(await imageData(String(url), "image_urls", fetcher, context.signal));
      data.image = images;
    }
    if (data.mask_url) data.mask = await imageData(String(data.mask_url), "mask_url", fetcher, context.signal);
    delete data.image_urls;
    delete data.mask_url;
    data.response_format = "b64_json";
  }
  if (["chat", "messages", "answer", "generate_images"].includes(actionName)) data.stream = false;
  const body = await request(apiKey, actionName, data, fetcher, context.signal);
  if (actionName === "generate_images") {
    const images = looseArray(body.data);
    if (!images.length && !optionalString(body.text))
      throw providerResponseError("Octen image response is missing images");
    const normalized = [];
    for (const [index, item] of images.entries()) {
      const image = requiredResponseRecord(item, "Octen generated image");
      const encoded = optionalString(image.b64_json);
      if (!encoded) throw providerResponseError("Octen image response is missing image bytes");
      const format = optionalString(body.output_format) ?? optionalString(data.output_format) ?? "png";
      const bytes = Buffer.from(encoded, "base64");
      if (!bytes.length) throw providerResponseError("Octen returned empty image bytes");
      const file = await transitFiles!.create(
        new File([bytes], `octen-${index + 1}.${format}`, { type: `image/${format}` }),
      );
      const { b64_json: _encoded, ...metadata } = image;
      normalized.push({ ...metadata, url: file.downloadUrl });
    }
    return { ...body, data: normalized };
  }
  if (["generate_video", "generate_grounded"].includes(actionName)) {
    const field = actionName === "generate_video" ? "id" : "generation_id";
    if (!optionalString(body[field])) throw providerResponseError(`Octen response is missing ${field}`);
  }
  if (actionName.startsWith("get_") && !optionalString(body.status))
    throw providerResponseError("Octen task response is missing status");
  return body;
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request(
      input.apiKey,
      "embed_text",
      { input: ["connection check"], model: "octen-embedding-0.6b", dimension: 1 },
      fetcher,
      signal,
    );
    return { profile: { displayName: "Octen API Key" }, grantedScopes: [], metadata: { apiBaseUrl: baseUrl } };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "octen",
  Object.fromEntries(
    octenActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "octen",
  baseUrl: baseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
