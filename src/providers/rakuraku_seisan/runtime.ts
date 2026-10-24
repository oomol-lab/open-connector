import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString, looseArray } from "../../core/cast.ts";
import { assertPublicHttpUrl, readBoundedResponseBytes, storeResponseInTransit } from "../../core/request.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  providerFetch,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export interface RakurakuContext extends ApiKeyProviderContext {
  baseUrl: string;
}
export function normalizeBaseUrl(value: unknown): string {
  const raw = requiredInputString(value, "baseUrl");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw providerInputError("baseUrl must be a valid HTTPS company URL");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    segments.length !== 1 ||
    segments[0]?.includes("%")
  )
    throw providerInputError(
      "baseUrl must be an HTTPS company URL with one account path and no credentials, query, or fragment",
    );
  assertPublicHttpUrl(url.toString(), { fieldName: "baseUrl", createError: providerInputError });
  return `${url.origin}/${segments[0]}`;
}
function parsePayload(bytes: Uint8Array): Record<string, unknown> {
  try {
    return requiredResponseRecord(JSON.parse(new TextDecoder().decode(bytes)), "Rakuraku Seisan response");
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw providerResponseError("Rakuraku Seisan returned invalid JSON");
  }
}
function checkResponse(response: Response, bytes: Uint8Array): void {
  const prefix = new TextDecoder().decode(bytes.subarray(0, 1024)).trimStart();
  if (prefix.split("\n", 1)[0]?.includes("Status: 503 Maintenance mode"))
    throw new ProviderRequestError(503, "Rakuraku Seisan is under maintenance", undefined, "provider_error");
  const isJson = response.headers.get("content-type")?.includes("json") || prefix.startsWith("{");
  if (!response.ok || isJson) {
    const payload = isJson ? parsePayload(bytes) : undefined;
    if (!response.ok || payload?.status === "error") {
      const errors = optionalRecord(payload?.errors);
      const code = optionalString(errors?.code);
      const details = looseArray(errors?.description)
        .map((value) => {
          const detail = optionalRecord(value);
          return [optionalString(detail?.name), optionalString(detail?.msg)].filter(Boolean).join(": ");
        })
        .filter(Boolean)
        .join("; ");
      const message = `Rakuraku Seisan: ${optionalString(errors?.msg) ?? `HTTP ${response.status}`}${code ? ` (code ${code})` : ""}${details ? `: ${details}` : ""}`;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        message,
        undefined,
        response.status === 401 && code === "1"
          ? "authorization_failed"
          : response.status === 429
            ? "rate_limited"
            : "provider_error",
      );
    }
  }
  if (prefix.startsWith("<")) throw providerResponseError("Rakuraku Seisan returned HTML instead of API data");
}

async function readApiResponse(response: Response, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: 1024 * 1024,
    fieldName: "Rakuraku Seisan response",
    createError: providerResponseError,
    signal,
  });
  checkResponse(response, bytes);
  return parsePayload(bytes);
}

/** Inspect a small prefix without buffering the journal export. */
async function journalResponse(response: Response, signal: AbortSignal): Promise<Response> {
  if (!response.ok || response.headers.get("content-type")?.includes("json")) {
    await readApiResponse(response, signal);
    throw providerResponseError("Rakuraku Seisan returned JSON instead of a journal file");
  }
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let done = false;
  let isJson = false;
  try {
    while (size < 1024) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) {
        done = true;
        break;
      }
      chunks.push(next.value);
      size += next.value.byteLength;
    }
    const prefix = new Uint8Array(Math.min(size, 1024));
    let offset = 0;
    for (const chunk of chunks) {
      const part = chunk.subarray(0, prefix.length - offset);
      prefix.set(part, offset);
      offset += part.length;
    }
    const text = new TextDecoder().decode(prefix).trimStart();
    isJson = text.startsWith("{");
    if (!isJson) checkResponse(response, prefix);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    throw error;
  }
  const replay = new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          signal.throwIfAborted();
          const buffered = chunks.shift();
          if (buffered) {
            controller.enqueue(buffered);
            return;
          }
          if (done) {
            reader.releaseLock();
            controller.close();
            return;
          }
          const next = await reader.read();
          if (next.done) {
            reader.releaseLock();
            controller.close();
          } else controller.enqueue(next.value);
        } catch (error) {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
          controller.error(error);
        }
      },
      async cancel(reason) {
        await reader.cancel(reason);
        reader.releaseLock();
      },
    }),
    { headers: response.headers, status: response.status },
  );
  if (isJson) {
    await readApiResponse(replay, signal);
    throw providerResponseError("Rakuraku Seisan returned JSON instead of a journal file");
  }
  return replay;
}

export async function executeRakurakuSeisanAction(
  action: string,
  input: Record<string, unknown>,
  context: RakurakuContext,
): Promise<unknown> {
  return runProviderRequest(
    {
      label: "Rakuraku Seisan",
      signal: context.signal,
      timeoutMs: action === "download_journal_file" ? 300_000 : undefined,
    },
    async (signal) => {
      const request = (path: string, body?: FormData) =>
        context.fetcher(`${context.baseUrl}/api/v1/${path}`, {
          method: body ? "POST" : "GET",
          headers: { "X-RS-apitoken": context.apiKey },
          body,
          signal,
          redirect: "manual",
        });
      if (action === "download_journal_file") {
        if (!context.transitFiles)
          throw new ProviderRequestError(
            503,
            "Journal downloads require configured transit storage",
            undefined,
            "provider_error",
          );
        const response = await journalResponse(await request(`fileGenerate/${input.fileGenerateId}/result`), signal);
        const filename = (response.headers.get("content-disposition") ?? "")
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith("filename="))
          ?.slice(9)
          .split('"')
          .join("");
        const name = filename?.split("/").pop()?.split("\\").pop() || `journal-${input.fileGenerateId}.dat`;
        const mimeType = response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream";
        return {
          file: await storeResponseInTransit(response, context.transitFiles, {
            name,
            mimeType,
            maxBytes: 64 * 1024 * 1024,
            fieldName: "Rakuraku Seisan file",
            createError: providerResponseError,
            signal,
          }),
        };
      }
      if (action === "import_master_csv") {
        if (input.masterId === 18 && input.duplicateKey === 0)
          throw providerInputError("Approver imports require duplicateKey 1");
        const source = await providerFetch(requiredInputString(input.fileUrl, "fileUrl"), { signal });
        if (!source.ok) {
          await source.body?.cancel();
          throw new ProviderRequestError(
            source.status,
            `CSV download failed with HTTP ${source.status}`,
            undefined,
            "provider_error",
          );
        }
        const bytes = await readBoundedResponseBytes(source, {
          maxBytes: 5 * 1024 * 1024,
          fieldName: "Rakuraku Seisan CSV",
          createError: providerResponseError,
          signal,
        });
        if (!bytes.byteLength) throw providerInputError("CSV file must not be empty");
        const body = new FormData();
        body.set(
          "json",
          JSON.stringify({
            masterId: input.masterId,
            duplicateKey: input.duplicateKey ?? (input.masterId === 18 ? 1 : 0),
            sendPasswordEmail: input.sendPasswordEmail ? 1 : 0,
            createCategory: input.createCategory ? 1 : 0,
          }),
        );
        body.set("uploadFile", new Blob([Uint8Array.from(bytes)], { type: "application/octet-stream" }), "import.csv");
        const payload = await readApiResponse(await request("csvimport", body), signal);
        const processId = optionalString(payload.processId);
        if (!processId) throw providerResponseError("Rakuraku Seisan response is missing processId");
        return { processId };
      }
      const payload = await readApiResponse(
        await request(`csvimportprocess/${encodeURIComponent(requiredInputString(input.processId, "processId"))}`),
        signal,
      );
      const processStatus = optionalString(payload.processStatus);
      if (!processStatus) throw providerResponseError("Rakuraku Seisan response is missing processStatus");
      const items = optionalRecord(payload.items);
      return {
        processStatus,
        successCount: readCount(items?.successCount),
        failureCount: readCount(items?.failureCount),
        raw: payload,
      };
    },
  );
}
function readCount(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const number = typeof value === "number" ? value : Number(optionalString(value));
  if (!Number.isInteger(number) || number < 0 || value === "")
    throw providerResponseError("Rakuraku Seisan returned an invalid import count");
  return number;
}

export async function readRakurakuError(response: Response): Promise<ProviderRequestError> {
  try {
    await readApiResponse(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) return error;
    throw error;
  }
  return new ProviderRequestError(response.status, "Rakuraku Seisan request failed", undefined, "provider_error");
}
