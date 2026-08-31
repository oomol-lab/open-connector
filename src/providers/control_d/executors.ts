import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "control_d";
const apiBaseUrl = "https://api.controld.com";

type ControlDRequestPhase = "validate" | "execute";

interface ControlDContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ControlDActionHandler = (input: Record<string, unknown>, context: ControlDContext) => Promise<unknown>;

const actionHandlers: ProviderActionHandlers<"control_d", ControlDActionHandler> = {
  get_current_ip(_input, context) {
    return getCurrentIp(context);
  },
  list_profiles(input, context) {
    return listProfiles(input, context);
  },
  get_profile(input, context) {
    return getProfile(input, context);
  },
  list_service_categories(_input, context) {
    return listServiceCategories(context);
  },
  list_services_by_category(input, context) {
    return listServicesByCategory(input, context);
  },
  list_profile_rules(input, context) {
    return listProfileRules(input, context);
  },
  upsert_profile_rule(input, context) {
    return upsertProfileRule(input, context);
  },
  delete_profile_rule(input, context) {
    return deleteProfileRule(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, actionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = { apiKey: input.apiKey, fetcher, signal };
    const profiles = await listProfilesInternal({}, context, "validate");
    const currentIp = await getCurrentIpInternal(context, "validate");
    const firstProfile = profiles[0];

    return {
      profile: {
        accountId: buildProviderAccountId(input.apiKey),
        displayName: "Control D API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        validationEndpoint: "/profiles",
        profileCount: profiles.length,
        firstProfileId: optionalString(firstProfile?.PK),
        firstProfileName: optionalString(firstProfile?.name),
        currentIp: currentIp.ip,
        currentIpType: currentIp.type,
        currentIpOrg: currentIp.org,
        currentIpCountry: currentIp.country,
        currentHandler: currentIp.handler,
      }),
    };
  },
};

async function getCurrentIp(context: ControlDContext): Promise<unknown> {
  return getCurrentIpInternal(context, "execute");
}

async function listProfiles(input: Record<string, unknown>, context: ControlDContext): Promise<unknown> {
  return { profiles: await listProfilesInternal(input, context, "execute") };
}

async function getProfile(input: Record<string, unknown>, context: ControlDContext): Promise<unknown> {
  const payload = await requestControlD({
    context,
    phase: "execute",
    path: `/profiles/${encodeURIComponent(readRequiredInputString(input.profileId, "profileId"))}`,
    forceOrgId: optionalString(input.forceOrgId),
  });
  return { profile: readResponseBodyObject(payload, "control_d get_profile") };
}

async function listServiceCategories(context: ControlDContext): Promise<unknown> {
  const payload = await requestControlD({ context, phase: "execute", path: "/services/categories" });
  const body = readResponseBodyObject(payload, "control_d list_service_categories");
  return { categories: readArrayField(body.categories, "control_d list_service_categories body.categories") };
}

async function listServicesByCategory(input: Record<string, unknown>, context: ControlDContext): Promise<unknown> {
  const payload = await requestControlD({
    context,
    phase: "execute",
    path: `/services/categories/${encodeURIComponent(readRequiredInputString(input.category, "category"))}`,
  });
  const body = readResponseBodyObject(payload, "control_d list_services_by_category");
  return { services: readArrayField(body.services, "control_d list_services_by_category body.services") };
}

async function listProfileRules(input: Record<string, unknown>, context: ControlDContext): Promise<unknown> {
  return { rules: await listProfileRulesInternal(input, context, "execute") };
}

async function upsertProfileRule(input: Record<string, unknown>, context: ControlDContext): Promise<unknown> {
  const actionCode = optionalInteger(input.do);
  const via = optionalString(input.via);
  if ((actionCode === 2 || actionCode === 3) && !via) {
    throw new ProviderRequestError(400, "via is required when do is 2 or 3");
  }

  await requestControlD({
    context,
    phase: "execute",
    path: `/profiles/${encodeURIComponent(readRequiredInputString(input.profileId, "profileId"))}/rules`,
    method: "PUT",
    forceOrgId: optionalString(input.forceOrgId),
    body: compactObject({
      do: input.do,
      status: input.status ?? 1,
      hostnames: input.hostnames,
      via,
      via_v6: optionalString(input.viaV6),
    }),
  });

  const rules = await listProfileRulesInternal(input, context, "execute");
  const rawHostnames = input.hostnames;
  if (!Array.isArray(rawHostnames)) {
    throw new ProviderRequestError(502, "control_d upsert_profile_rule input.hostnames was not an array");
  }
  const requestedHostnames = new Set(rawHostnames.map((value) => String(value)));
  const matchedRules = rules.filter((rule) => requestedHostnames.has(String(rule.PK)));
  const matchedHostnames = new Set(matchedRules.map((rule) => String(rule.PK)));
  const missingHostnames = [...requestedHostnames].filter((hostname) => !matchedHostnames.has(hostname));
  if (missingHostnames.length > 0) {
    throw new ProviderRequestError(
      502,
      `control_d upsert_profile_rule could not confirm rules for: ${missingHostnames.join(", ")}`,
    );
  }

  return { rules: matchedRules };
}

async function deleteProfileRule(input: Record<string, unknown>, context: ControlDContext): Promise<unknown> {
  const profileId = readRequiredInputString(input.profileId, "profileId");
  const ruleId = readRequiredInputString(input.ruleId, "ruleId");
  const payload = await requestControlD({
    context,
    phase: "execute",
    path: `/profiles/${encodeURIComponent(profileId)}/rules/${encodeURIComponent(ruleId)}`,
    method: "DELETE",
    forceOrgId: optionalString(input.forceOrgId),
  });
  return compactObject({
    deleted: true,
    profileId,
    ruleId,
    message: optionalString(payload.message),
  });
}

async function getCurrentIpInternal(
  context: ControlDContext,
  phase: ControlDRequestPhase,
): Promise<Record<string, string>> {
  const payload = await requestControlD({ context, phase, path: "/ip" });
  const body = readResponseBodyObject(payload, "control_d get_current_ip");
  return {
    ip: readRequiredString(body.ip, "control_d current ip"),
    type: readRequiredString(body.type, "control_d current ip type"),
    org: readRequiredString(body.org, "control_d current ip organization"),
    country: readRequiredString(body.country, "control_d current ip country"),
    handler: readRequiredString(body.handler, "control_d current ip handler"),
  };
}

async function listProfilesInternal(
  input: Record<string, unknown>,
  context: ControlDContext,
  phase: ControlDRequestPhase,
): Promise<Array<Record<string, unknown>>> {
  const payload = await requestControlD({
    context,
    phase,
    path: "/profiles",
    forceOrgId: optionalString(input.forceOrgId),
  });
  const body = readResponseBodyObject(payload, "control_d list_profiles");
  return readArrayField(body.profiles, "control_d list_profiles body.profiles");
}

async function listProfileRulesInternal(
  input: Record<string, unknown>,
  context: ControlDContext,
  phase: ControlDRequestPhase,
): Promise<Array<Record<string, unknown>>> {
  const payload = await requestControlD({
    context,
    phase,
    path: `/profiles/${encodeURIComponent(readRequiredInputString(input.profileId, "profileId"))}/rules`,
    forceOrgId: optionalString(input.forceOrgId),
  });
  const body = readResponseBodyObject(payload, "control_d list_profile_rules");
  return readArrayField(body.rules, "control_d list_profile_rules body.rules");
}

async function requestControlD(input: {
  context: ControlDContext;
  phase: ControlDRequestPhase;
  path: string;
  method?: "GET" | "PUT" | "DELETE";
  forceOrgId?: string;
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const headers = new Headers({
    authorization: `Bearer ${input.context.apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (input.forceOrgId) {
    headers.set("X-Force-Org-Id", input.forceOrgId);
  }
  if (input.body) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  let payload: unknown;
  const timeout = createProviderTimeout(input.context.signal);
  try {
    response = await input.context.fetcher(new URL(input.path, apiBaseUrl), {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `control_d ${input.path} request timed out after 30 seconds`);
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `control_d request failed: ${error.message}` : "control_d request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const record = optionalRecord(payload);
  const effectiveStatus = extractErrorCode(record) ?? response.status;
  if (!response.ok || record?.success === false) {
    throw createError(effectiveStatus, payload, input.phase);
  }
  if (!record) {
    throw new ProviderRequestError(502, "control_d response was not a JSON object", payload);
  }
  return record;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createError(status: number, payload: unknown, phase: ControlDRequestPhase): ProviderRequestError {
  const message = extractErrorMessage(optionalRecord(payload)) ?? `control_d request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function extractErrorCode(record: Record<string, unknown> | undefined): number | undefined {
  const error = optionalRecord(record?.error);
  return optionalInteger(error?.code) ?? optionalInteger(record?.code);
}

function extractErrorMessage(record: Record<string, unknown> | undefined): string | undefined {
  const error = optionalRecord(record?.error);
  return optionalString(error?.message) ?? optionalString(record?.message) ?? optionalString(record?.error);
}

function readResponseBodyObject(record: Record<string, unknown>, context: string): Record<string, unknown> {
  const body = optionalRecord(record.body);
  if (!body) {
    throw new ProviderRequestError(502, `${context} response missing object body`, record);
  }
  return body;
}

function readArrayField(value: unknown, context: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${context} was not an array`, value);
  }
  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, `${context} contained a non-object item`, item);
    }
    return record;
  });
}

function readRequiredString(value: unknown, context: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `${context} was missing`);
  }
  return stringValue;
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function buildProviderAccountId(apiKey: string): string {
  const digest = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
  return `control_d:token:${digest}`;
}
