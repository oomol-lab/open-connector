import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const referralRockApiBaseUrl = "https://api.referralrock.com";
const timeoutMs = 30_000;
interface Context {
  publicKey: string;
  privateKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
const paths: Record<string, string> = {
  list_programs: "/api/programs",
  list_members: "/api/members",
  list_referrals: "/api/referrals",
  get_member_stats: "/api/memberstats/getsingle",
};

function query(input: Record<string, unknown>) {
  const output: Record<string, string> = {};
  for (const key of ["programId", "query", "sort", "dateFrom", "dateTo", "memberId", "status", "timePeriod"]) {
    const value = optionalString(input[key]);
    if (value !== undefined) output[key] = value;
  }
  const showDisabled = optionalBoolean(input.showDisabled);
  if (showDisabled !== undefined) output.showDisabled = String(showDisabled);
  for (const key of ["offset", "count"]) {
    const value = optionalInteger(input[key]);
    if (value !== undefined) output[key] = String(value);
  }
  return output;
}

const handler =
  (name: string): ProviderRuntimeHandler<Context> =>
  (input, context) =>
    request(paths[name]!, query(input), context, "execute");
export const referralRockActionHandlers: ProviderActionHandlers<"referralrock", ProviderRuntimeHandler<Context>> = {
  list_programs: handler("list_programs"),
  list_members: handler("list_members"),
  list_referrals: handler("list_referrals"),
  get_member_stats: handler("get_member_stats"),
};

export function buildReferralRockAuthorization(publicKey: string, privateKey: string) {
  return `Basic ${Buffer.from(`${publicKey}:${privateKey}`).toString("base64")}`;
}

export async function validateReferralRockCredential(context: Context): Promise<CredentialValidationResult> {
  await request("/api/programs", { offset: "0", count: "0" }, context, "validate");
  return {
    profile: { displayName: "Referral Rock API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: referralRockApiBaseUrl },
  };
}

async function request(path: string, query: Record<string, string>, context: Context, phase: "validate" | "execute") {
  const url = new URL(path, referralRockApiBaseUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const timeout = createProviderTimeout(context.signal, timeoutMs);
  try {
    const response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: buildReferralRockAuthorization(context.publicKey, context.privateKey),
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new ProviderRequestError(502, "Referral Rock returned invalid JSON");
      }
    }
    if (!response.ok) throw mapError(response.status, payload, phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (isAbortSignalError(timeout.signal, error))
      throw new ProviderRequestError(504, "Referral Rock request timed out");
    throw new ProviderRequestError(
      502,
      `Referral Rock request failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  } finally {
    timeout.cleanup();
  }
}

function mapError(status: number, payload: unknown, phase: "validate" | "execute") {
  const body = optionalRecord(payload);
  const message =
    optionalString(body?.message) ??
    optionalString(body?.Message) ??
    `Referral Rock request failed with status ${status}`;
  if (status === 401 || status === 403) return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  if (status === 429) return new ProviderRequestError(429, message);
  if (status >= 400 && status < 500) return new ProviderRequestError(status, message);
  return new ProviderRequestError(status || 502, message);
}
