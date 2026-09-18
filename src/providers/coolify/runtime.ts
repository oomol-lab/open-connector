import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { arrayPayload, objectPayload, requestJson } from "../http-json-runtime.ts";
import { providerInputError, requiredInputString } from "../provider-runtime.ts";

export interface CoolifyContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type CoolifyActionHandler = (input: Record<string, unknown>, context: CoolifyContext) => Promise<unknown>;

export const coolifyActionHandlers: ProviderActionHandlers<"coolify", CoolifyActionHandler> = {
  async list_applications(input, context) {
    const payload = await coolifyRequest("/applications", context, { tag: optionalString(input.tag) });
    return { applications: arrayPayload(payload, "Coolify applications") };
  },
  async get_application(input, context) {
    const payload = await coolifyRequest(`/applications/${resourceUuid(input)}`, context);
    return { application: objectPayload(payload, "Coolify application") };
  },
  async get_application_logs(input, context) {
    return objectPayload(
      await coolifyRequest(`/applications/${resourceUuid(input)}/logs`, context, {
        lines: optionalInteger(input.lines),
        show_timestamps: optionalBoolean(input.showTimestamps),
      }),
      "Coolify application logs",
    );
  },
  start_application(input, context) {
    return coolifyRequest(
      `/applications/${resourceUuid(input)}/start`,
      context,
      { force: optionalBoolean(input.force), instant_deploy: optionalBoolean(input.instantDeploy) },
      "POST",
    );
  },
  stop_application(input, context) {
    return coolifyRequest(
      `/applications/${resourceUuid(input)}/stop`,
      context,
      { docker_cleanup: optionalBoolean(input.dockerCleanup) },
      "POST",
    );
  },
  restart_application(input, context) {
    return coolifyRequest(`/applications/${resourceUuid(input)}/restart`, context, {}, "POST");
  },
  async list_deployments(_input, context) {
    const payload = await coolifyRequest("/deployments", context);
    return { deployments: arrayPayload(payload, "Coolify deployments") };
  },
  async get_deployment(input, context) {
    const payload = await coolifyRequest(`/deployments/${resourceUuid(input)}`, context);
    return { deployment: objectPayload(payload, "Coolify deployment") };
  },
  deploy_resource(input, context) {
    return coolifyRequest(
      "/deploy",
      context,
      { uuid: requiredInputString(input.uuid, "uuid"), force: optionalBoolean(input.force) },
      "POST",
    );
  },
};

export function createCoolifyContext(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): CoolifyContext {
  return { apiKey, apiBaseUrl: normalizeCoolifyApiBaseUrl(values.baseUrl), fetcher, signal };
}

export async function validateCoolifyCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createCoolifyContext(values, apiKey, fetcher, signal);
  const team = objectPayload(await coolifyRequest("/team", context, {}, "GET", "validate"), "Coolify team");
  const id = optionalInteger(team.id);
  const name = optionalString(team.name);
  const host = new URL(context.apiBaseUrl).host;
  return {
    profile: { accountId: id == null ? `coolify:${host}` : `coolify:${id}`, displayName: name ?? `Coolify ${host}` },
    grantedScopes: [],
    metadata: { apiBaseUrl: context.apiBaseUrl, teamId: id, teamName: name },
  };
}

export function normalizeCoolifyApiBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const instanceUrl = requiredInputString(value, "baseUrl");
  const url = assertPublicHttpUrl(instanceUrl, {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork,
  });
  if (url.username || url.password) throw providerInputError("baseUrl must not include credentials");
  url.hash = "";
  url.search = "";
  const path = url.pathname.replace(/\/+$/u, "");
  url.pathname = path.endsWith("/api/v1") ? path : `${path}/api/v1`;
  return url.toString().replace(/\/$/u, "");
}

async function coolifyRequest(
  path: string,
  context: CoolifyContext,
  query: Record<string, string | number | boolean | undefined> = {},
  method = "GET",
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  return requestJson({
    providerName: "Coolify",
    baseUrl: context.apiBaseUrl,
    path,
    method,
    query,
    headers: { authorization: `Bearer ${context.apiKey}` },
    fetcher: context.fetcher,
    signal: context.signal,
    phase,
  });
}

function resourceUuid(input: Record<string, unknown>): string {
  return encodeURIComponent(requiredInputString(input.uuid, "uuid"));
}
