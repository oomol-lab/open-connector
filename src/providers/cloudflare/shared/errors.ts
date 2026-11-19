import { optionalRecord, optionalString } from "../../../core/cast.ts";
import { ProviderRequestError, providerInputError } from "../../provider-runtime.ts";

export function readCloudflareErrorMessage(payload: unknown, status: number): string {
  const record = optionalRecord(payload);
  const details: string[] = [];
  function append(value: unknown): void {
    const entry = optionalRecord(value);
    const message = optionalString(value) ?? optionalString(entry?.message);
    if (message) {
      const code = entry?.code;
      details.push(typeof code === "number" || typeof code === "string" ? `${code}: ${message}` : message);
    }
    if (Array.isArray(entry?.error_chain)) entry.error_chain.forEach(append);
  }
  if (Array.isArray(record?.errors)) record.errors.forEach(append);
  if (Array.isArray(record?.messages)) record.messages.forEach(append);
  append(record?.error);
  append(record?.error_description);
  append(record?.message);
  if (!record) append(payload);
  return [...new Set(details)].join("; ") || `cloudflare request failed with ${status}`;
}

export function parseCloudflareResponseText(text: string): Record<string, unknown> {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return (
    optionalRecord(payload) ?? {
      success: false,
      errors: [{ message: optionalString(payload) ?? text }],
    }
  );
}

export function cloudflareResponseError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = readCloudflareErrorMessage(payload, response.status);
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && [400, 401, 403, 404].includes(response.status)) return providerInputError(message);
  if (response.status === 400 || response.status === 404) return new ProviderRequestError(response.status, message);
  return new ProviderRequestError(response.ok ? 502 : response.status, message, undefined, "provider_error");
}
