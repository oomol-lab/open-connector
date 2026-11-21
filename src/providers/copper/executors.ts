import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, providerInputError, runProviderRequest } from "../provider-runtime.ts";
import { copperCrmEvent } from "./trigger-on-crm-event.ts";

const service = "copper";
const baseUrl = "https://api.copper.com/developer_api/v1";

interface CopperContext {
  apiKey: string;
  userEmail: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

function copperHeaders(apiKey: string, userEmail: string, hasBody: boolean): Record<string, string> {
  return {
    "x-pw-accesstoken": apiKey,
    "x-pw-application": "developer_api",
    "x-pw-useremail": userEmail,
    "accept": "application/json",
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

async function copperRequest(
  context: CopperContext,
  path: string,
  options: { method?: string; body?: Record<string, unknown> } = {},
): Promise<unknown> {
  return runProviderRequest({ label: "Copper", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: copperHeaders(context.apiKey, context.userEmail, Boolean(options.body)),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal,
    });
    if (!response.ok) {
      let errorPayload: unknown = {};
      try {
        errorPayload = (await response.json()) as unknown;
      } catch (error) {
        if (signal.aborted) throw error;
      }
      throw new ProviderRequestError(
        response.status >= 500 ? 502 : response.status,
        `Copper request failed (${response.status})`,
        errorPayload,
      );
    }
    return (await response.json()) as unknown;
  });
}

const handlers: ProviderActionHandlers<
  typeof service,
  (input: Record<string, unknown>, context: CopperContext) => Promise<unknown>
> = {
  async search_people(input, context) {
    const body: Record<string, unknown> = {};
    const name = optionalString(input.name);
    const pageNumber = optionalInteger(input.pageNumber);
    const pageSize = optionalInteger(input.pageSize);
    if (name) body.name = name;
    if (pageNumber != null) body.page_number = pageNumber;
    if (pageSize != null) body.page_size = pageSize;
    const data = await copperRequest(context, "/people/search", { method: "POST", body });
    return { people: Array.isArray(data) ? data : [] };
  },
  async get_person(input, context) {
    const personId = optionalInteger(input.personId);
    if (personId == null || personId < 1) throw providerInputError("personId must be a positive integer");
    const data = await copperRequest(context, `/people/${personId}`);
    return { person: optionalRecord(data) ?? {} };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<CopperContext>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CopperContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure Copper credentials first.");
    }
    const apiKey = optionalString(credential.values.apiKey);
    const userEmail = optionalString(credential.values.userEmail);
    if (!apiKey || !userEmail) {
      throw new ProviderRequestError(401, "Copper apiKey and userEmail are required.");
    }
    return { apiKey, userEmail, fetcher, signal: context.signal };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  skipDnsValidation: true,
  defaultHeaders: { "x-pw-application": "developer_api" },
  auth: {
    type: "credential_headers",
    headers: [
      { name: "x-pw-accesstoken", source: { type: "credential_value", name: "apiKey" } },
      { name: "x-pw-useremail", source: { type: "credential_value", name: "userEmail" } },
    ],
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const apiKey = optionalString(input.values.apiKey);
    const userEmail = optionalString(input.values.userEmail);
    if (!apiKey || !userEmail) throw providerInputError("apiKey and userEmail are required");
    const data = optionalRecord(await copperRequest({ apiKey, userEmail, fetcher, signal }, "/account"));
    return {
      profile: {
        accountId: String(data?.id ?? userEmail),
        displayName: optionalString(data?.name) ?? userEmail,
      },
    };
  },
};

export const triggers: readonly IntegrationDefinition[] = [copperCrmEvent];
