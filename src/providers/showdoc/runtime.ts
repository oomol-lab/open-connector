import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRawString, optionalRecord, optionalString } from "../../core/cast.ts";
import { storeResponseInTransit } from "../../core/request.ts";
import {
  providerFetch,
  providerInputError,
  providerResponseError,
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export interface ShowdocContext extends ApiKeyProviderContext {
  apiToken: string;
}

export const showdocApiBaseUrl = "https://www.showdoc.cc/server/api/open";

export async function requestShowdoc(
  endpoint: string,
  body: Record<string, unknown>,
  context: ShowdocContext,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "ShowDoc", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(`${showdocApiBaseUrl}/${endpoint}`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json", "accept": "application/json", "user-agent": providerUserAgent },
      body: JSON.stringify({ ...body, api_key: context.apiKey, api_token: context.apiToken }),
      signal,
    });
    return readResponse(response);
  });
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  const payload = optionalRecord(
    await response.json().catch((error: unknown) => {
      if (error instanceof SyntaxError) return null;
      throw error;
    }),
  );
  const code = payload?.error_code;
  if (!response.ok || code !== 0) {
    const message = `ShowDoc${code === undefined ? "" : ` (${String(code)})`}: ${optionalString(payload?.error_message) ?? `HTTP ${response.status}`}`;
    if (code === 10306) throw new ProviderRequestError(401, message, undefined, "authorization_failed");
    if (code === 10305 || response.status === 429)
      throw new ProviderRequestError(429, message, undefined, "rate_limited");
    throw new ProviderRequestError(response.ok ? 502 : response.status, message, undefined, "provider_error");
  }
  return requiredResponseRecord(payload?.data, "ShowDoc response data");
}

export async function pageRequest(
  endpoint: string,
  input: Record<string, unknown>,
  context: ShowdocContext,
): Promise<Record<string, unknown>> {
  const result = await requestShowdoc(endpoint, input, context);
  const content = optionalRawString(result.page_content);
  // Decode one layer of PHP htmlspecialchars without interpreting original HTML.
  if (content !== undefined)
    return {
      ...result,
      page_content: content
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&#039;", "'")
        .replaceAll("&#39;", "'")
        .replaceAll("&amp;", "&"),
    };
  return result;
}

export async function uploadAttachment(
  input: Record<string, unknown>,
  context: ShowdocContext,
): Promise<Record<string, unknown>> {
  const store = context.transitFiles;
  if (!store?.response) throw providerInputError("ShowDoc uploads require a transit backend with reads.");
  const readTransitFile = store.response.bind(store);
  const fileUrl = String(input.fileUrl);
  const name = optionalString(input.fileName) || new URL(fileUrl).pathname.split("/").pop() || "attachment.bin";
  // Match multipart filename escaping without allowing a new header or part.
  const filename = name.replaceAll("\r", "%0D").replaceAll("\n", "%0A").replaceAll('"', "%22");
  return runProviderRequest({ label: "ShowDoc attachment upload", signal: context.signal }, async (signal) => {
    const response = await providerFetch(fileUrl, { signal });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `ShowDoc attachment download failed: HTTP ${response.status}`,
      );
    }
    const file = await storeResponseInTransit(response, store, {
      name,
      mimeType: response.headers.get("content-type") ?? "application/octet-stream",
      fieldName: "fileUrl",
      createError: providerInputError,
      maxBytes: store.maxBytes,
      signal,
    });
    try {
      const source = await readTransitFile(file.fileId);
      if (!source.ok || !source.body) {
        await source.body?.cancel();
        throw providerResponseError("ShowDoc transit source could not be read");
      }
      const reader = source.body.getReader();
      try {
        const boundary = `showdoc-${Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
        const fields: Record<string, string> = { api_key: context.apiKey, api_token: context.apiToken };
        if (input.page_id !== undefined) fields.page_id = String(input.page_id);
        const encoder = new TextEncoder();
        const prefix = encoder.encode(
          Object.entries(fields)
            .map(([key, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`)
            .join("") +
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${file.mimeType || "application/octet-stream"}\r\n\r\n`,
        );
        const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(prefix);
          },
          async pull(controller) {
            const chunk = await reader.read();
            if (chunk.done) {
              controller.enqueue(suffix);
              controller.close();
            } else controller.enqueue(chunk.value);
          },
          async cancel(reason) {
            await reader.cancel(reason);
          },
        });
        const uploadRequest: RequestInit & { duplex: "half" } = {
          method: "POST",
          redirect: "manual",
          headers: {
            "content-type": `multipart/form-data; boundary=${boundary}`,
            "content-length": String(prefix.byteLength + file.sizeBytes + suffix.byteLength),
            "accept": "application/json",
          },
          body,
          signal,
          duplex: "half",
        };
        return await readResponse(await context.fetcher(`${showdocApiBaseUrl}/uploadAttachment`, uploadRequest));
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    } finally {
      await store.delete(file.fileId);
    }
  });
}
