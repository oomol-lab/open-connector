import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, looseArray, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requireCustomCredential,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "bitwarden";
type Region = "us" | "eu";
interface Credential {
  clientId: string;
  clientSecret: string;
  region: Region;
}
interface Context extends Credential {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
type Handler = (input: Record<string, unknown>, context: Context) => Promise<unknown>;
const regions = {
  us: { api: "https://api.bitwarden.com", identity: "https://identity.bitwarden.com" },
  eu: { api: "https://api.bitwarden.eu", identity: "https://identity.bitwarden.eu" },
} as const;

const handlers: ProviderActionHandlers<"bitwarden", Handler> = {
  list_collections: list("/public/collections", "collections"),
  get_collection: get("/public/collections", "collection"),
  async list_events(input, context) {
    const payload = requiredResponseRecord(
      await request(
        "/public/events",
        "list events",
        context,
        compactObject({
          start: optionalString(input.start),
          end: optionalString(input.end),
          actingUserId: optionalString(input.actingUserId),
          itemId: optionalString(input.itemId),
          secretId: optionalString(input.secretId),
          projectId: optionalString(input.projectId),
          continuationToken: optionalString(input.continuationToken),
        }),
      ),
      "Bitwarden event list",
    );
    return { events: looseArray(payload.data), continuationToken: optionalString(payload.continuationToken) ?? null };
  },
  list_groups: list("/public/groups", "groups"),
  get_group: get("/public/groups", "group"),
  get_group_member_ids: ids("/public/groups", "member-ids", "memberIds"),
  list_members: list("/public/members", "members"),
  get_member: get("/public/members", "member"),
  get_member_group_ids: ids("/public/members", "group-ids", "groupIds"),
  list_policies: list("/public/policies", "policies"),
  async get_policy(input, context) {
    if (!Number.isInteger(input.type)) throw providerInputError("type is required");
    return {
      policy: requiredResponseRecord(
        await request(`/public/policies/${input.type}`, "get policy", context),
        "Bitwarden policy",
      ),
    };
  },
  async get_subscription(_input, context) {
    return requiredResponseRecord(
      await request("/public/organization/subscription", "get subscription", context),
      "Bitwarden subscription",
    );
  },
};
export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher) {
    const stored = await requireCustomCredential(context, service);
    return { ...credential(stored.values), fetcher, signal: context.signal };
  },
});
export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const value = credential(input.values);
    await token(value, fetcher, signal, true);
    return {
      profile: { accountId: value.clientId, displayName: `Bitwarden Organization (${value.region.toUpperCase()})` },
      grantedScopes: ["api.organization"],
      metadata: { region: value.region, apiBaseUrl: regions[value.region].api },
    };
  },
};
function credential(values: Record<string, string>): Credential {
  const region = requiredInputString(values.region, "region").toLowerCase();
  if (region !== "us" && region !== "eu") throw providerInputError("region must be us or eu");
  return {
    clientId: requiredInputString(values.clientId, "clientId"),
    clientSecret: requiredInputString(values.clientSecret, "clientSecret"),
    region,
  };
}
function list(path: string, field: string): Handler {
  return async (input, context) => {
    const payload = requiredResponseRecord(
      await request(
        path,
        `list ${field}`,
        context,
        compactObject({ continuationToken: optionalString(input.continuationToken) }),
      ),
      `Bitwarden ${field}`,
    );
    return { [field]: looseArray(payload.data), continuationToken: optionalString(payload.continuationToken) ?? null };
  };
}
function get(path: string, field: string): Handler {
  return async (input, context) => ({
    [field]: requiredResponseRecord(
      await request(`${path}/${encodeURIComponent(requiredInputString(input.id, "id"))}`, `get ${field}`, context),
      `Bitwarden ${field}`,
    ),
  });
}
function ids(path: string, suffix: string, field: string): Handler {
  return async (input, context) => ({
    [field]: looseArray(
      await request(
        `${path}/${encodeURIComponent(requiredInputString(input.id, "id"))}/${suffix}`,
        `get ${field}`,
        context,
      ),
    ),
  });
}
async function token(
  value: Credential,
  fetcher: typeof fetch,
  parentSignal: AbortSignal | undefined,
  validating: boolean,
) {
  const response = await runProviderRequest({ signal: parentSignal, label: "Bitwarden token exchange" }, (signal) =>
    fetcher(`${regions[value.region].identity}/connect/token`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "api.organization",
        client_id: value.clientId,
        client_secret: value.clientSecret,
      }).toString(),
      signal,
    }),
  );
  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Bitwarden token exchange returned invalid JSON",
  });
  if (!response.ok) throw error(response.status, payload, validating);
  const accessToken = optionalString(optionalRecord(payload)?.access_token)?.trim();
  if (!accessToken) throw providerResponseError("Bitwarden access token is missing");
  return accessToken;
}
async function request(path: string, operation: string, context: Context, query: Record<string, unknown> = {}) {
  const accessToken = await token(context, context.fetcher, context.signal, false);
  const url = new URL(path, `${regions[context.region].api}/`);
  for (const [key, value] of Object.entries(query)) if (value != null) url.searchParams.set(key, String(value));
  const response = await runProviderRequest({ signal: context.signal, label: `Bitwarden ${operation}` }, (signal) =>
    context.fetcher(url, {
      headers: { accept: "application/json", authorization: `Bearer ${accessToken}`, "user-agent": providerUserAgent },
      signal,
    }),
  );
  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: `Bitwarden ${operation} returned invalid JSON`,
  });
  if (!response.ok) throw error(response.status, payload, false);
  if (payload == null) throw providerResponseError(`Bitwarden ${operation} returned an empty response`);
  return payload;
}
function error(status: number, payload: unknown, validating: boolean) {
  const body = optionalRecord(payload);
  const code = optionalString(body?.error);
  const message =
    optionalString(body?.error_description) ??
    optionalString(body?.message) ??
    `Bitwarden request failed with ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (code === "invalid_client")
    return validating ? providerInputError(message) : new ProviderRequestError(409, message, payload);
  if (status === 400) return providerInputError(message);
  return new ProviderRequestError(status, message, payload);
}
