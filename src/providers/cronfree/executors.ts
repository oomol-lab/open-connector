import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { looseArray, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "cronfree";
const cronfreeApiBaseUrl = "https://login.cronfree.com/zapier";

type CronfreePhase = "validate" | "execute";
type CronfreeActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"cronfree", CronfreeActionHandler> = {
  async create_schedule(input, context) {
    const result = await requestCronfree({
      path: "/schedule",
      body: {
        hookUrl: requiredInputString(input.hookUrl, "hookUrl"),
        wdays: readStringArray(input.weekdays),
        months: readStringArray(input.months),
        mdays: readStringArray(input.monthDays),
        hours: readStringArray(input.hours),
        minutes: readStringArray(input.minutes),
        timezone: requiredInputString(input.timezone, "timezone"),
      },
      context,
      phase: "execute",
    });
    return { result };
  },
  async delete_schedule(input, context) {
    const result = await requestCronfree({
      path: "/unschedule",
      body: { hookUrl: requiredInputString(input.hookUrl, "hookUrl") },
      context,
      phase: "execute",
    });
    return { result };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: cronfreeApiBaseUrl,
  auth: { type: "api_key_json_body", name: "license_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestCronfree({
      path: "/unschedule",
      body: { hookUrl: `https://connector.oomol.com/cronfree-validation/${crypto.randomUUID()}` },
      context: { apiKey: input.apiKey, fetcher, signal },
      phase: "validate",
    });
    return {
      profile: { accountId: "cronfree-license-key", displayName: "Cronfree License Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: cronfreeApiBaseUrl, validationEndpoint: "/unschedule" },
    };
  },
};

function readStringArray(value: unknown): string[] {
  return looseArray(value)
    .map((item) => optionalString(item))
    .filter((item): item is string => item != null);
}

async function requestCronfree(input: {
  path: string;
  body: Record<string, unknown>;
  context: ApiKeyProviderContext;
  phase: CronfreePhase;
}): Promise<unknown> {
  return runProviderRequest({ signal: input.context.signal, label: "Cronfree" }, async (signal) => {
    const response = await input.context.fetcher(`${cronfreeApiBaseUrl}${input.path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({ ...input.body, license_key: input.context.apiKey }),
      signal,
    });
    if (!response.ok) {
      if (response.status === 401 && input.phase === "validate") {
        throw providerInputError("Cronfree rejected the license key");
      }
      throw new ProviderRequestError(response.status, `Cronfree request failed with HTTP ${response.status}`);
    }
    return readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Cronfree returned invalid JSON",
    });
  });
}
