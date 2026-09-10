import type { WeixinBotContext, WeixinRequestOptions } from "./runtime.ts";

import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { optionalString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import {
  ProviderRequestError,
  providerFetch,
  providerResponseError,
  readTransitFileInput,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

type WeixinRequest = (options: WeixinRequestOptions) => Promise<Record<string, unknown>>;
type MediaKind = "image" | "video" | "file";

const cdnBaseUrl = "https://novac2c.cdn.weixin.qq.com/c2c";

export async function sendWeixinMedia(
  input: Record<string, unknown>,
  context: WeixinBotContext,
  request: WeixinRequest,
): Promise<Record<string, unknown>> {
  const toUserId = requiredInputString(input.toUserId, "toUserId");
  const contextToken = requiredInputString(input.contextToken, "contextToken");
  const kind = readMediaKind(input.mediaType);
  const source = await readTransitFileInput(input.file, context);
  const plaintext = Buffer.from(await source.file.arrayBuffer());
  const key = randomBytes(16);
  const ciphertext = encrypt(plaintext, key);
  const filekey = randomBytes(16).toString("hex");
  const upload = await request({
    context,
    path: "/ilink/bot/getuploadurl",
    label: "Weixin get upload URL",
    body: {
      filekey,
      media_type: kind === "image" ? 1 : kind === "video" ? 2 : 3,
      to_user_id: toUserId,
      rawsize: plaintext.byteLength,
      rawfilemd5: createHash("md5").update(plaintext).digest("hex"),
      filesize: ciphertext.byteLength,
      no_need_thumb: true,
      aeskey: key.toString("hex"),
      base_info: { channel_version: "1.0.0", bot_agent: "OpenConnector/1.0.0" },
    },
  });
  const uploadUrl = resolveCdnUrl(upload.upload_full_url, upload.upload_param, "upload", filekey);
  const uploadResponse = await runProviderRequest({ signal: context.signal, label: "Weixin CDN upload" }, (signal) =>
    providerFetch(uploadUrl, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: Uint8Array.from(ciphertext),
      signal,
    }),
  );
  const encryptedParam = uploadResponse.headers.get("x-encrypted-param");
  if (uploadResponse.status !== 200 || !encryptedParam) {
    throw new ProviderRequestError(502, `Weixin CDN upload failed with HTTP ${uploadResponse.status}`);
  }

  const caption = optionalString(input.caption);
  if (caption) await sendItem(request, context, toUserId, contextToken, { type: 1, text_item: { text: caption } });
  const media = {
    encrypt_query_param: encryptedParam,
    aes_key: Buffer.from(key.toString("hex")).toString("base64"),
    encrypt_type: 1,
  };
  const item =
    kind === "image"
      ? { type: 2, image_item: { media, mid_size: ciphertext.byteLength } }
      : kind === "video"
        ? { type: 5, video_item: { media, video_size: ciphertext.byteLength } }
        : { type: 4, file_item: { media, file_name: source.name, len: String(plaintext.byteLength) } };
  const result = await sendItem(request, context, toUserId, contextToken, item);
  return { messageId: optionalString(result.message_id) ?? null };
}

export async function downloadWeixinMedia(
  input: Record<string, unknown>,
  context: WeixinBotContext,
): Promise<Record<string, unknown>> {
  const transitFiles = context.transitFiles;
  if (!transitFiles) throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  const item = requiredResponseRecord(input.item, "Weixin media item");
  const details = readMediaDetails(item);
  const url = resolveCdnUrl(details.fullUrl, details.encryptedParam, "download");
  const encrypted = await runProviderRequest(
    { signal: context.signal, label: "Weixin CDN download" },
    async (signal) => {
      const response = await providerFetch(url, { signal });
      if (!response.ok) throw new ProviderRequestError(502, `Weixin CDN download failed with HTTP ${response.status}`);
      return readBoundedResponseBytes(response, {
        maxBytes: transitFiles.maxBytes + 16,
        fieldName: "Weixin media",
        createError: (message) => new ProviderRequestError(413, message),
      });
    },
  );
  const bytes = details.key ? decrypt(Buffer.from(encrypted), details.key) : Buffer.from(encrypted);
  if (bytes.byteLength > transitFiles.maxBytes) throw new ProviderRequestError(413, "Weixin media is too large");
  const mimeType = detectImageMimeType(bytes) ?? details.mimeType;
  const name = optionalString(input.name) ?? mediaNameForMimeType(details.name, mimeType);
  const stored = await transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: mimeType }));
  return { file: { ...stored, name, mimeType } };
}

async function sendItem(
  request: WeixinRequest,
  context: WeixinBotContext,
  toUserId: string,
  contextToken: string,
  item: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return request({
    context,
    path: "/ilink/bot/sendmessage",
    label: "Weixin send media",
    body: {
      msg: {
        from_user_id: "",
        to_user_id: toUserId,
        client_id: randomUUID(),
        message_type: 2,
        message_state: 2,
        context_token: contextToken,
        item_list: [item],
      },
      base_info: { channel_version: "1.0.0", bot_agent: "OpenConnector/1.0.0" },
    },
  });
}

function readMediaKind(value: unknown): MediaKind {
  const kind = requiredInputString(value, "mediaType");
  if (kind === "image" || kind === "video" || kind === "file") return kind;
  throw new ProviderRequestError(400, "mediaType must be image, video, or file");
}

function resolveCdnUrl(
  fullUrl: unknown,
  encryptedParam: unknown,
  operation: "upload" | "download",
  filekey?: string,
): string {
  const direct = optionalString(fullUrl);
  if (direct) return direct;
  const param = optionalString(encryptedParam);
  if (!param) throw providerResponseError(`Weixin CDN ${operation} parameters are missing`);
  const url = new URL(`${cdnBaseUrl}/${operation}`);
  url.searchParams.set("encrypted_query_param", param);
  if (filekey) url.searchParams.set("filekey", filekey);
  return url.toString();
}

function readMediaDetails(item: Record<string, unknown>): {
  encryptedParam: string;
  fullUrl?: string;
  key?: Buffer;
  name: string;
  mimeType: string;
} {
  const type = item.type;
  const field =
    type === 2
      ? "image_item"
      : type === 3
        ? "voice_item"
        : type === 4
          ? "file_item"
          : type === 5
            ? "video_item"
            : undefined;
  if (!field) throw new ProviderRequestError(400, "item must contain image, voice, file, or video media");
  const content = requiredResponseRecord(item[field], field);
  const media = requiredResponseRecord(content.media, `${field}.media`);
  const fileName = optionalString(content.file_name) ?? "weixin-file.bin";
  const keyText = type === 2 ? optionalString(content.aeskey) : undefined;
  const key = keyText ? Buffer.from(keyText, "hex") : parseKey(optionalString(media.aes_key));
  if (type !== 2 && !key) throw providerResponseError(`Weixin ${field} AES key is missing`);
  return {
    encryptedParam: optionalString(media.encrypt_query_param) ?? "",
    fullUrl: optionalString(media.full_url),
    key,
    name:
      type === 4 ? fileName : type === 2 ? "weixin-image.jpg" : type === 3 ? "weixin-voice.silk" : "weixin-video.mp4",
    mimeType: type === 2 ? "image/jpeg" : type === 3 ? "audio/silk" : type === 5 ? "video/mp4" : fileMimeType(fileName),
  };
}

function parseKey(value: string | undefined): Buffer | undefined {
  if (!value) return undefined;
  const decoded = Buffer.from(value, "base64");
  return decoded.length === 32 ? Buffer.from(decoded.toString("ascii"), "hex") : decoded;
}

function encrypt(value: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(value), cipher.final()]);
}

function decrypt(value: Buffer, key: Buffer): Buffer {
  if (key.length !== 16) throw new ProviderRequestError(502, "Weixin media AES key is invalid");
  const decipher = createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(value), decipher.final()]);
}

function detectImageMimeType(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const prefix = bytes.subarray(0, 12).toString("ascii");
  if (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a")) return "image/gif";
  if (prefix.startsWith("RIFF") && prefix.endsWith("WEBP")) return "image/webp";
  return undefined;
}

function mediaNameForMimeType(name: string, mimeType: string): string {
  const extension =
    mimeType === "image/png"
      ? ".png"
      : mimeType === "image/gif"
        ? ".gif"
        : mimeType === "image/webp"
          ? ".webp"
          : undefined;
  return extension ? name.replace(/\.[^.]+$/, extension) : name;
}

function fileMimeType(name: string): string {
  const extension = name.toLowerCase().match(/\.[^.]+$/)?.[0];
  const types: Record<string, string> = {
    ".csv": "text/csv",
    ".json": "application/json",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".zip": "application/zip",
  };
  return (extension && types[extension]) ?? "application/octet-stream";
}
