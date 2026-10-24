import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRawString } from "../../core/cast.ts";
import {
  createProviderFetch,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  runProviderRequest,
} from "../provider-runtime.ts";
import { encodeSegment, requestClay } from "./request.ts";
const maximumBatchBytes = 2 * 1024 * 1024 * 1024;
export async function runClayBatch(
  context: ApiKeyProviderContext,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const store = context.transitFiles;
  if (!store?.createFromStream || !store.response)
    throw providerInputError("Clay batch upload requires streaming transit storage");
  const fetcher = createProviderFetch({ fetch: context.fetcher });
  const routinePath = `/routines/${encodeSegment(input.routine_id)}/run-batch`;
  const stored = await runProviderRequest(
    { label: "Clay batch download", signal: context.signal, timeoutMs: 300_000 },
    async (signal) => {
      const response = await fetcher(String(input.fileUrl), { signal });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderRequestError(
          response.status,
          `Clay batch file download failed (HTTP ${response.status})`,
          undefined,
          "provider_error",
        );
      }
      if (!response.body) throw providerInputError("Clay batch file is empty");
      const limit = Math.min(maximumBatchBytes, store.maxBytes);
      if (Number(response.headers.get("content-length")) > limit) {
        await response.body.cancel();
        throw new ProviderRequestError(413, "Clay batch file exceeds the configured transfer limit");
      }
      let size = 0;
      const body = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            size += chunk.byteLength;
            if (size > limit)
              throw new ProviderRequestError(413, "Clay batch file exceeds the configured transfer limit");
            controller.enqueue(chunk);
          },
          flush() {
            if (size === 0) throw providerInputError("Clay batch file is empty");
          },
        }),
      );
      return store.createFromStream!({ body, name: "input.jsonl", mimeType: "application/x-ndjson", signal });
    },
  );
  const { fileId } = stored;
  try {
    const upload = await requestClay(context, `${routinePath}/upload-url`, undefined, "POST");
    const uploadUrl = optionalRawString(upload.upload_url);
    const upstreamFileId = optionalRawString(upload.file_id);
    if (!uploadUrl || !upstreamFileId)
      throw providerResponseError("Clay batch upload response is missing upload_url or file_id");
    if (new URL(uploadUrl).protocol !== "https:") throw providerResponseError("Clay upload_url must use HTTPS");
    await runProviderRequest(
      { label: "Clay batch upload", signal: context.signal, timeoutMs: 300_000 },
      async (signal) => {
        const staged = await store.response!(fileId);
        if (!staged.body) throw providerResponseError("Clay staged file has no body");
        const options: RequestInit & {
          duplex: "half";
        } = {
          method: "PUT",
          body: staged.body,
          duplex: "half",
          signal,
          redirect: "manual",
          headers: { "content-type": "application/x-ndjson", "content-length": String(stored.sizeBytes) },
        };
        try {
          const response = await fetcher(uploadUrl, options);
          await response.body?.cancel();
          if (!response.ok)
            throw new ProviderRequestError(
              response.status,
              `Clay batch file upload failed (HTTP ${response.status})`,
              undefined,
              "provider_error",
            );
        } finally {
          if (!staged.body.locked) await staged.body.cancel().catch(() => {});
        }
      },
    );
    return await requestClay(context, `${routinePath}/start`, {
      file_id: upstreamFileId,
      webhook_id: input.webhook_id,
    });
  } finally {
    await store.delete(fileId);
  }
}
