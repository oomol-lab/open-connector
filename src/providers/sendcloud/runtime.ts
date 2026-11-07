import type { ApiKeyActionRequest } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import {
  ProviderRequestError,
  createProviderFetch,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
export const sendcloudBaseUrl = "https://api.sendcloud.net/apiv2";
export const endpoints: Record<string, string> = {
  send_email: "mail/send",
  send_template_email: "mail/sendtemplate",
  get_account: "userinfo/get",
  list_templates: "template/list",
  get_template: "template/get",
  create_template: "template/add",
  update_template: "template/update",
  delete_templates: "template/delete",
};

function validateSending(input: Record<string, unknown>) {
  const to = input.to as string[] | undefined;
  const xsmtpapi = optionalRecord(input.xsmtpapi);
  if (input.useAddressList === true) {
    if (!to?.length || to.length > 5)
      throw new ProviderRequestError(
        400,
        "Mailing-list delivery requires one to five list addresses in to",
        undefined,
        "invalid_input",
      );
  } else if (!to?.length && !(Array.isArray(xsmtpapi?.to) && xsmtpapi.to.length)) {
    throw new ProviderRequestError(400, "Provide recipients in to or xsmtpapi.to", undefined, "invalid_input");
  }
  if (xsmtpapi && new TextEncoder().encode(JSON.stringify(xsmtpapi)).byteLength > 1024 * 1024) {
    throw new ProviderRequestError(400, "xsmtpapi exceeds 1 MiB", undefined, "invalid_input");
  }
  for (const item of (input.attachments ?? []) as Array<{ filename: string }>) {
    const name = item.filename;
    if (
      ["%", "$", "#", "*", "/", "\\", "\r", "\n", "\0"].some((char) => name.includes(char)) ||
      [".js", ".com", ".exe", ".sh", ".cs"].some((extension) => name.toLowerCase().endsWith(extension))
    ) {
      throw new ProviderRequestError(400, "Unsupported attachment filename", undefined, "invalid_input");
    }
  }
}

async function buildBody(
  input: Record<string, unknown>,
  apiUser: string,
  apiKey: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
) {
  const fields = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (key === "attachments" || value === undefined) continue;
    fields.set(
      key,
      Array.isArray(value) ? value.join(";") : typeof value === "object" ? JSON.stringify(value) : String(value),
    );
  }
  fields.set("apiUser", apiUser);
  fields.set("apiKey", apiKey);
  const attachments = input.attachments as Array<{ fileUrl: string; filename: string }> | undefined;
  if (!attachments?.length) return fields;
  const body = new FormData();
  for (const [key, value] of fields) body.set(key, value);
  const download = createProviderFetch({ fetch: fetcher });
  // Bound downloaded attachments to the documented maximum account allowance.
  let remainingBytes = 50 * 1024 * 1024;
  for (const attachment of attachments) {
    const response = await download(attachment.fileUrl, { signal });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new ProviderRequestError(
        response.status,
        `Attachment download failed (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    const bytes = await readBoundedResponseBytes(response, {
      maxBytes: remainingBytes,
      fieldName: "attachments",
      createError: (message) => new ProviderRequestError(400, message, undefined, "invalid_input"),
      signal,
    });
    remainingBytes -= bytes.byteLength;
    body.append(
      "attachments",
      new Blob([bytes], {
        type: response.headers.get("content-type") ?? "application/octet-stream",
      }),
      attachment.filename,
    );
  }
  return body;
}

export async function requestSendcloud(
  endpoint: string,
  input: Record<string, unknown>,
  credentials: { apiKey: string; apiUser: string },
  fetcher: typeof fetch,
  phase: "validate" | "execute" = "execute",
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "SendCloud" }, async (signal) => {
    const body = await buildBody(input, credentials.apiUser, credentials.apiKey, fetcher, signal);
    const response = await fetcher(`${sendcloudBaseUrl}/${endpoint}`, {
      method: "POST",
      headers: { accept: "application/json", "user-agent": providerUserAgent },
      body,
      signal,
    });
    const text = await response.text();
    let payload: Record<string, unknown> | undefined;
    try {
      payload = optionalRecord(JSON.parse(text));
    } catch {
      /* Preserve the HTTP status of non-JSON error pages. */
    }
    if (!response.ok || payload?.result !== true) {
      const code = payload?.statusCode;
      const upstreamMessage = optionalString(payload?.message) ?? `HTTP ${response.status}`;
      // Upstream errors may echo parameters; redact credentials before returning them.
      const message = upstreamMessage.split(credentials.apiKey).join("[REDACTED]");
      const authenticationFailed = code === 40005;
      throw new ProviderRequestError(
        authenticationFailed ? (phase === "validate" ? 400 : 401) : response.ok ? 502 : response.status,
        `SendCloud ${code ?? response.status}: ${message}`,
        undefined,
        authenticationFailed ? (phase === "validate" ? "invalid_input" : "authorization_failed") : "provider_error",
      );
    }
    requiredResponseRecord(payload.info, "SendCloud info");
    return payload;
  });
}

export async function executeSendcloudAction(
  input: ApiKeyActionRequest,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const endpoint = endpoints[input.actionName];
  if (!endpoint) throw new ProviderRequestError(400, "Unknown SendCloud action", undefined, "invalid_input");
  if (input.actionName === "send_email" || input.actionName === "send_template_email") validateSending(input.input);
  if (
    input.actionName === "delete_templates" &&
    !input.input.invokeName &&
    String(input.input.startDate) > String(input.input.endDate)
  ) {
    throw new ProviderRequestError(400, "startDate must not be after endDate", undefined, "invalid_input");
  }
  return requestSendcloud(
    endpoint,
    input.input,
    { apiKey: input.apiKey, apiUser: requiredInputString(input.values?.apiUser, "apiUser") },
    fetcher,
  );
}
