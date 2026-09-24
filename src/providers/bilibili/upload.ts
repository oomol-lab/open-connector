import type { BilibiliActionContext } from "./runtime.ts";

import { optionalNumber, requiredString } from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
} from "../provider-runtime.ts";
import { bilibiliApiRequest, bilibiliFormRequest, bilibiliUposBaseUrl, readBilibiliApiResponse } from "./runtime.ts";

const smallVideoUploadMaxBytes = 100 * 1024 * 1024;
const videoUploadPartBytes = 10 * 1024 * 1024;
const videoUploadMaxBytes = 4 * 1024 * 1024 * 1024;
const imageUploadMaxBytes = 5 * 1024 * 1024;

/**
 * Upload one video through Bilibili's upload-token flow: initialize, then a
 * single openupos upload (files up to 100MB) or equal-sized 10MB parts plus
 * the merge call. Returns the upload token used by archive submission.
 */
export async function uploadBilibiliVideo(context: BilibiliActionContext, file: File): Promise<string> {
  if (file.size === 0) {
    throw providerInputError("The video file is empty.");
  }
  if (file.size > videoUploadMaxBytes) {
    throw providerInputError("The video file exceeds the Bilibili 4GB upload limit.");
  }

  const initData = requiredResponseRecord(
    await bilibiliApiRequest(context, {
      method: "POST",
      path: "/archive/video/init",
      body: {
        name: normalizeUploadFileName(file.name),
        utype: file.size <= smallVideoUploadMaxBytes ? "1" : "0",
      },
      label: "Bilibili video upload init",
    }),
    "Bilibili video upload init",
  );
  const uploadToken = requiredString(initData.upload_token, "upload_token", providerResponseError);

  if (file.size <= smallVideoUploadMaxBytes) {
    await postBilibiliUposBytes(
      context,
      "/video/v2/upload",
      { upload_token: uploadToken },
      file,
      "Bilibili video upload",
    );
    return uploadToken;
  }

  let offset = 0;
  let partNumber = 1;
  while (offset < file.size) {
    const part = file.slice(offset, offset + videoUploadPartBytes);
    await postBilibiliUposBytes(
      context,
      "/video/v2/part/upload",
      { upload_token: uploadToken, part_number: String(partNumber) },
      part,
      `Bilibili video part ${partNumber} upload`,
    );
    offset += videoUploadPartBytes;
    partNumber += 1;
  }
  await bilibiliApiRequest(context, {
    method: "POST",
    path: "/archive/video/complete",
    query: { upload_token: uploadToken },
    label: "Bilibili video upload complete",
  });
  return uploadToken;
}

/** Upload one cover image (jpeg/png, up to 5MB) and return its Bilibili-hosted URL. */
export async function uploadBilibiliCover(context: BilibiliActionContext, file: File): Promise<string> {
  if (file.size === 0) {
    throw providerInputError("The cover image is empty.");
  }
  if (file.size > imageUploadMaxBytes) {
    throw providerInputError("The cover image exceeds the Bilibili 5MB limit.");
  }
  const data = requiredResponseRecord(
    await bilibiliFormRequest(context, {
      path: "/archive/cover/upload",
      file,
      label: "Bilibili cover upload",
    }),
    "Bilibili cover upload",
  );
  return requiredString(data.url, "url", providerResponseError);
}

/** Upload one article image (jpg/png, up to 5MB) and return its Bilibili-hosted URL. */
export async function uploadBilibiliArticleImage(
  context: BilibiliActionContext,
  file: File,
  watermark?: boolean,
): Promise<{ url: string; size?: number }> {
  if (file.size === 0) {
    throw providerInputError("The article image is empty.");
  }
  if (file.size > imageUploadMaxBytes) {
    throw providerInputError("The article image exceeds the Bilibili 5MB limit.");
  }
  const data = requiredResponseRecord(
    await bilibiliFormRequest(context, {
      path: "/article/upload/image",
      fields: { watermark: watermark === undefined ? undefined : String(watermark) },
      file,
      label: "Bilibili article image upload",
    }),
    "Bilibili article image upload",
  );
  const url = requiredString(data.url, "url", providerResponseError);
  const size = optionalNumber(data.size);
  return size === undefined ? { url } : { url, size };
}

/**
 * Post raw file bytes to the openupos upload host. These endpoints
 * authenticate through the upload_token query parameter and must not carry
 * multipart packaging around the bare binary body.
 */
async function postBilibiliUposBytes(
  context: BilibiliActionContext,
  path: string,
  query: Record<string, string>,
  body: Blob,
  label: string,
): Promise<void> {
  const url = new URL(`${bilibiliUposBaseUrl}${path}`);
  setSearchParams(url, query);
  await runProviderRequest({ signal: context.signal, label }, async (signal) => {
    const response = await context.fetcher(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body,
      signal,
    });
    await readBilibiliApiResponse(response, label);
  });
}

function normalizeUploadFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "video.mp4";
  }
  return trimmed.includes(".") ? trimmed : `${trimmed}.mp4`;
}
