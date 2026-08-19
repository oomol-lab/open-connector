import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
export const myOtpAppApiBaseUrl = "https://api.myotp.app";
const validationMessageId = "00000000-0000-0000-0000-000000000000";

function action(path: string) {
  return (input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> =>
    request(path, input, context, "execute");
}
export const myOtpAppActionHandlers: ProviderActionHandlers<
  "myotp_app",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  generate_otp: action("/generate_otp"),
  verify_otp(input, context) {
    const count = Number(typeof input.message_id === "string") + Number(typeof input.phone_number === "string");
    if (count !== 1) throw new ProviderRequestError(400, "Provide exactly one of message_id or phone_number");
    return request("/verify_otp", input, context, "execute");
  },
  extend_otp: action("/extend_otp"),
  check_otp_status: action("/check_otp_status"),
  get_transactions_report: action("/report"),
};
export async function validateMyOtpApp(context: ApiKeyProviderContext): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await request("/check_otp_status", { message_id: validationMessageId }, context, "validate");
  return {
    profile: { accountId: "api_key", displayName: "MyOTP.App API Key" },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: myOtpAppApiBaseUrl,
      validationEndpoint: "/check_otp_status",
      validationMessageFound: typeof optionalRecord(payload)?.is_valid === "boolean",
    }),
  };
}
async function request(
  path: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const response = await context.fetcher(new URL(path, myOtpAppApiBaseUrl), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
      "X-API-Key": context.apiKey,
    },
    body: JSON.stringify(body),
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }
  const expectedNotFound =
    phase === "validate" &&
    response.status === 404 &&
    optionalString(optionalRecord(payload)?.message)?.toLowerCase() === "otp message_id not found";
  if (!response.ok && !expectedNotFound) {
    const record = optionalRecord(payload);
    const message =
      optionalString(record?.message) ??
      optionalString(record?.reason) ??
      optionalString(record?.error) ??
      `MyOTP.App request failed with status ${response.status}`;
    if (response.status === 429) throw new ProviderRequestError(429, message);
    if (response.status === 401 || response.status === 403)
      throw new ProviderRequestError(phase === "validate" ? 400 : 401, message);
    throw new ProviderRequestError(response.status < 500 ? 400 : response.status, message);
  }
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, "MyOTP.App returned an invalid JSON object");
  return record;
}
