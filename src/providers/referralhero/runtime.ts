import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
export const referralheroApiBaseUrl = "https://app.referralhero.com/api/v2";
interface Spec {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}
const keys: Record<string, string> = {
  page: "page",
  name: "name",
  website: "website",
  email: "email",
  phoneNumber: "phone_number",
  cryptoWalletAddress: "crypto_wallet_address",
  otherIdentifierValue: "other_identifier_value",
  extraField: "extra_field",
  extraField2: "extra_field_2",
  extraField3: "extra_field_3",
  extraField4: "extra_field_4",
  points: "points",
  stripeCustomerId: "stripe_customer_id",
  tags: "tags",
  address: "address",
  city: "city",
  country: "country",
  status: "status",
  transactionId: "transaction_id",
  conversionCategory: "conversion_category",
  conversionValue: "conversion_value",
  device: "device",
  source: "source",
  doubleOptin: "double_optin",
  referrer: "referrer",
  domain: "domain",
  advocateName: "advocate_name",
  sortBy: "sort_by",
  optionField: "option_field",
  productId: "product_id",
};
function mapped(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(keys).flatMap(([from, to]) => (input[from] === undefined ? [] : [[to, input[from]]])),
  );
}
const segment = (value: unknown) => encodeURIComponent(String(value));
function spec(name: string, input: Record<string, unknown>): Spec {
  const id = segment(input.campaignId);
  const subscriber = segment(input.subscriberId);
  switch (name) {
    case "create_list":
      return { method: "POST", path: "/lists", body: mapped(input) };
    case "list_lists":
      return { method: "GET", path: "/lists", query: mapped(input) };
    case "get_leaderboard":
      return { method: "GET", path: `/lists/${id}/leaderboard`, query: { count: input.count } };
    case "list_rewards":
      return { method: "GET", path: `/lists/${id}/bonuses` };
    case "add_subscriber":
      return { method: "POST", path: `/lists/${id}/subscribers`, body: mapped(input) };
    case "list_subscribers":
      return { method: "GET", path: `/lists/${id}/subscribers`, query: mapped(input) };
    case "get_subscriber":
      return { method: "GET", path: `/lists/${id}/subscribers/${subscriber}` };
    case "update_subscriber":
      return { method: "POST", path: `/lists/${id}/subscribers/${subscriber}`, body: mapped(input) };
    case "delete_subscriber":
      return { method: "DELETE", path: `/lists/${id}/subscribers/${subscriber}` };
    case "track_conversion":
      return { method: "POST", path: `/lists/${id}/subscribers/track_referral_conversion_event`, body: mapped(input) };
    default:
      return { method: "POST", path: `/lists/${id}/subscribers/${subscriber}/confirm` };
  }
}
async function execute(name: string, input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return normalize(name, await request(spec(name, input), context, "execute"));
}
const handler =
  (name: string): ProviderRuntimeHandler<ApiKeyProviderContext> =>
  (input, context) =>
    execute(name, input, context);
export const referralheroActionHandlers: ProviderActionHandlers<
  "referralhero",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  create_list: handler("create_list"),
  list_lists: handler("list_lists"),
  get_leaderboard: handler("get_leaderboard"),
  list_rewards: handler("list_rewards"),
  add_subscriber: handler("add_subscriber"),
  list_subscribers: handler("list_subscribers"),
  get_subscriber: handler("get_subscriber"),
  update_subscriber: handler("update_subscriber"),
  delete_subscriber: handler("delete_subscriber"),
  track_conversion: handler("track_conversion"),
  confirm_referral: handler("confirm_referral"),
};
export async function validateReferralheroCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await request({ method: "GET", path: "/lists", query: { page: 1 } }, { apiKey, fetcher, signal }, "validate");
  return {
    profile: { displayName: "ReferralHero API Token" },
    grantedScopes: [],
    metadata: { apiBaseUrl: referralheroApiBaseUrl },
  };
}
async function request(spec: Spec, context: ApiKeyProviderContext, phase: "validate" | "execute") {
  const url = new URL(`${referralheroApiBaseUrl}${spec.path}`);
  for (const [key, value] of Object.entries(spec.query ?? {}))
    if (value !== undefined) url.searchParams.set(key, String(value));
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      method: spec.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        ...(spec.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      ...(spec.body ? { body: JSON.stringify(spec.body) } : {}),
      signal: timeout.signal,
    });
    const text = await response.text();
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(text) as unknown;
      const record = optionalRecord(parsed);
      if (!record) throw new Error();
      payload = record;
    } catch {
      if (response.ok) throw new ProviderRequestError(502, "ReferralHero returned invalid JSON");
      payload = text.trim() ? { message: text.trim() } : {};
    }
    if (!response.ok || payload.status === "error") throw mapError(response.status, payload, phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "ReferralHero request timed out");
    throw new ProviderRequestError(
      502,
      `ReferralHero request failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  } finally {
    timeout.cleanup();
  }
}
function normalize(name: string, payload: Record<string, unknown>) {
  const data = payload.data;
  const metadata = {
    callsLeft: typeof payload.calls_left === "number" ? payload.calls_left : null,
    timestamp: typeof payload.timestamp === "number" ? payload.timestamp : null,
  };
  if (name === "list_rewards") return { rewards: array(data, "rewards"), ...metadata };
  const object = requiredObject(data, "data");
  if (name === "list_lists")
    return {
      lists: array(object.lists, "data.lists"),
      pagination: requiredObject(object.pagination, "data.pagination"),
      ...metadata,
    };
  if (name === "get_leaderboard") return { ranking: array(object.ranking, "data.ranking"), ...metadata };
  if (name === "list_subscribers")
    return {
      subscribers: array(object.subscribers, "data.subscribers"),
      pagination: requiredObject(object.pagination, "data.pagination"),
      ...metadata,
    };
  return { data: object, ...metadata };
}
function mapError(status: number, payload: Record<string, unknown>, phase: "validate" | "execute") {
  const code = optionalString(payload.code);
  const message = optionalString(payload.message) ?? "ReferralHero request failed";
  if (status === 429 || code === "too_many_calls") return new ProviderRequestError(429, message);
  if (["no_token", "invalid_token", "inactive_account"].includes(code ?? "") || status === 401 || status === 403)
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  if (status < 500 || payload.status === "error") return new ProviderRequestError(400, message);
  return new ProviderRequestError(502, message);
}
function requiredObject(value: unknown, name: string) {
  const result = optionalRecord(value);
  if (!result) throw new ProviderRequestError(502, `ReferralHero response did not include a valid ${name} object`);
  return result;
}
function array(value: unknown, name: string) {
  if (!Array.isArray(value))
    throw new ProviderRequestError(502, `ReferralHero response did not include a valid ${name} array`);
  return value;
}
