import type { GuardedFetchOptions } from "./guarded-fetch.ts";

import { isAbortLikeError } from "../providers/provider-runtime.ts";
import { optionalRecord } from "./cast.ts";
import { createGuardedFetch } from "./guarded-fetch.ts";
import { assertPublicHttpUrl, readBoundedResponseBytes } from "./request.ts";

export type RemoteHttpFailure = "invalid_url" | "dns" | "redirect" | "network" | "invalid_json" | "too_large";

export class RemoteHttpError extends Error {
  readonly kind: RemoteHttpFailure;

  constructor(kind: RemoteHttpFailure, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface RemoteHttpOptions {
  url: string | URL;
  label: string;
  init?: RequestInit;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  requireHttps?: boolean;
  allowTrustedHosts?: boolean;
}

export interface RemoteJsonOptions {
  label: string;
  maxBytes: number;
  signal?: AbortSignal;
}

/** Keep the request budget active through response consumption; never follow redirects with a service key. */
export async function requestRemote<T>(
  options: RemoteHttpOptions,
  consume: (response: Response, signal: AbortSignal | undefined) => Promise<T>,
): Promise<T> {
  const url = assertPublicHttpUrl(String(options.url), {
    fieldName: `${options.label} URL`,
    createError: (message) => new RemoteHttpError("invalid_url", message),
  });
  if (options.requireHttps !== false && url.protocol !== "https:") {
    throw new RemoteHttpError("invalid_url", `${options.label} requires HTTPS.`);
  }
  if (url.username || url.password || url.hash) {
    throw new RemoteHttpError("invalid_url", `${options.label} does not allow URL credentials or fragments.`);
  }
  const signals = [
    options.init?.signal,
    options.timeoutMs === undefined ? undefined : AbortSignal.timeout(options.timeoutMs),
  ].filter((signal): signal is AbortSignal => signal != null);
  const signal = signals.length ? AbortSignal.any(signals) : undefined;
  signal?.throwIfAborted();
  const guardOptions: GuardedFetchOptions = {
    fetch: options.fetcher,
    allowTrustedHosts: options.allowTrustedHosts ?? false,
    createError: (message) => new RemoteHttpError("invalid_url", message),
    createResolutionError: (message) => new RemoteHttpError("dns", message),
  };
  const run = async (): Promise<T> => {
    let response: Response;
    try {
      response = await createGuardedFetch(guardOptions)(url, { ...options.init, redirect: "manual", signal });
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof RemoteHttpError || isAbortLikeError(error)) throw error;
      throw new RemoteHttpError("network", `${options.label} request failed.`);
    }
    try {
      signal?.throwIfAborted();
      if (response.status >= 300 && response.status < 400) {
        throw new RemoteHttpError("redirect", `${options.label} redirects are not allowed.`);
      }
      return await consume(response, signal);
    } finally {
      if (!response.bodyUsed) void response.body?.cancel().catch(() => undefined);
    }
  };
  if (!signal) return run();
  let abort: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([run(), aborted]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

/** Limits decoded transport bytes, including chunked and error responses, without exposing raw JSON errors. */
export async function readRemoteJson(response: Response, options: RemoteJsonOptions): Promise<unknown> {
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedResponseBytes(response, {
      maxBytes: options.maxBytes,
      fieldName: options.label,
      signal: options.signal,
      createError: (message) => new RemoteHttpError("too_large", message),
    });
  } catch (error) {
    options.signal?.throwIfAborted();
    if (error instanceof RemoteHttpError || isAbortLikeError(error)) throw error;
    throw new RemoteHttpError("network", `${options.label} could not be read.`);
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new RemoteHttpError("invalid_json", `${options.label} is not valid JSON.`);
  }
}

export function isSuccessEnvelope(value: unknown): value is { success: true; data: unknown } {
  const record = optionalRecord(value);
  return record?.success === true && "data" in record;
}

export function isFailureEnvelope(
  value: unknown,
): value is { success: false; message: string; errorCode: string; data: unknown } {
  const record = optionalRecord(value);
  return record?.success === false && typeof record.message === "string" && typeof record.errorCode === "string";
}
