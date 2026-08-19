import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { arrayPayload, firstString, objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";

const service = "runscope";
const apiBaseUrl = "https://api.runscope.com";
const validationPath = "/account";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const runscopeActionHandlers: ProviderActionHandlers<"runscope", Handler> = {
  async get_account(_input, context) {
    return singleOutput("account", await runscopeRequest(validationPath, context, { include_owner: true }));
  },
  async list_buckets(input, context) {
    return listOutput("buckets", await runscopeRequest("/buckets", context, pageQuery(input)));
  },
  async get_bucket(input, context) {
    return singleOutput(
      "bucket",
      await runscopeRequest(`/buckets/${pathValue(input.bucketKey, "bucketKey")}`, context),
    );
  },
  async list_tests(input, context) {
    return listOutput(
      "tests",
      await runscopeRequest(`/buckets/${pathValue(input.bucketKey, "bucketKey")}/tests`, context, pageQuery(input)),
    );
  },
  async get_test(input, context) {
    return singleOutput(
      "test",
      await runscopeRequest(
        `/buckets/${pathValue(input.bucketKey, "bucketKey")}/tests/${pathValue(input.testId, "testId")}`,
        context,
      ),
    );
  },
  async list_environments(input, context) {
    return listOutput(
      "environments",
      await runscopeRequest(`/buckets/${pathValue(input.bucketKey, "bucketKey")}/environments`, context),
    );
  },
  async list_test_results(input, context) {
    return listOutput(
      "results",
      await runscopeRequest(
        `/buckets/${pathValue(input.bucketKey, "bucketKey")}/tests/${pathValue(input.testId, "testId")}/results`,
        context,
        {
          count: optionalInteger(input.count),
          before: optionalString(input.before),
          since: optionalString(input.since),
        },
      ),
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, runscopeActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const output = singleOutput(
      "account",
      await runscopeRequest(
        validationPath,
        { apiKey: input.apiKey, fetcher, signal },
        { include_owner: true },
        "validate",
      ),
    );
    const account = objectPayload(output.account, "account");
    return {
      profile: {
        accountId: optionalString(account.id) ?? optionalString(account.uuid),
        displayName: firstString(account, ["name", "email"]) ?? "Runscope Account",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: validationPath,
        email: optionalString(account.email),
      },
    };
  },
};

function runscopeRequest(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  query: Record<string, string | number | boolean | undefined> = {},
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  return requestJson({
    providerName: "Runscope",
    baseUrl: apiBaseUrl,
    path,
    fetcher: context.fetcher,
    signal: context.signal,
    query,
    phase,
    headers: {
      authorization: `Bearer ${context.apiKey}`,
    },
  });
}

function singleOutput(key: string, raw: unknown): Record<string, unknown> {
  const object = objectPayload(raw, key);
  return { [key]: objectPayload(object.data ?? raw, key), raw: object };
}

function listOutput(key: string, raw: unknown): Record<string, unknown> {
  const object = objectPayload(raw, key);
  return { [key]: arrayPayload(object.data ?? object[key], key), raw: object };
}

function pageQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  return {
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
  };
}

function pathValue(value: unknown, fieldName: string): string {
  return encodePathSegment(requiredString(value, fieldName));
}
