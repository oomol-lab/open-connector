import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const dailybotApiBaseUrl = "https://api.dailybot.com";

type DailybotPhase = "validate" | "execute";
type DailybotHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const dailybotActionHandlers: ProviderActionHandlers<"dailybot", DailybotHandler> = {
  async get_me(_input, context) {
    return { profile: asObject(await dailybotRequest({ path: "/v1/me/", method: "GET", context, phase: "execute" })) };
  },
  async get_organization(_input, context) {
    return {
      organization: asObject(
        await dailybotRequest({ path: "/v1/organization/", method: "GET", context, phase: "execute" }),
      ),
    };
  },
  async list_users(input, context) {
    const payload = await dailybotRequest({
      path: "/v1/users/",
      method: "GET",
      query: compactObject({
        is_active: optionalBoolean(input.is_active),
        role: optionalString(input.role),
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
      }),
      context,
      phase: "execute",
    });
    const { count, results } = readListPayload(payload);
    return { count, users: results };
  },
  async get_user(input, context) {
    const userUuid = requiredString(input.user_uuid, "user_uuid", badInput);
    return {
      user: asObject(
        await dailybotRequest({
          path: `/v1/users/${encodePathSegment(userUuid)}/`,
          method: "GET",
          context,
          phase: "execute",
        }),
      ),
    };
  },
  async list_teams(input, context) {
    const payload = await dailybotRequest({
      path: "/v1/teams/",
      method: "GET",
      query: compactObject({ limit: optionalInteger(input.limit), offset: optionalInteger(input.offset) }),
      context,
      phase: "execute",
    });
    const { count, results } = readListPayload(payload);
    return { count, teams: results };
  },
  async get_team(input, context) {
    const teamId = requiredString(input.team_id, "team_id", badInput);
    return {
      team: asObject(
        await dailybotRequest({
          path: `/v1/teams/${encodePathSegment(teamId)}/`,
          method: "GET",
          context,
          phase: "execute",
        }),
      ),
    };
  },
  async list_team_members(input, context) {
    const teamId = requiredString(input.team_id, "team_id", badInput);
    const payload = await dailybotRequest({
      path: `/v1/teams/${encodePathSegment(teamId)}/members/`,
      method: "GET",
      context,
      phase: "execute",
    });
    const { count, results } = readListPayload(payload);
    return { count, members: results };
  },
  async send_message(input, context) {
    return {
      delivery: asObject(
        await dailybotRequest({
          path: "/v1/messaging/send-message/",
          method: "POST",
          body: compactObject({
            target_type: requiredString(input.target_type, "target_type", badInput),
            target_uuid: requiredString(input.target_uuid, "target_uuid", badInput),
            message: requiredString(input.message, "message", badInput),
            platform: optionalString(input.platform),
          }),
          context,
          phase: "execute",
        }),
      ),
    };
  },
  async send_email(input, context) {
    return {
      delivery: asObject(
        await dailybotRequest({
          path: "/v1/messaging/send-email/",
          method: "POST",
          body: {
            user_uuid: requiredString(input.user_uuid, "user_uuid", badInput),
            subject: requiredString(input.subject, "subject", badInput),
            body: requiredString(input.body, "body", badInput),
          },
          context,
          phase: "execute",
        }),
      ),
    };
  },
  async open_conversation(input, context) {
    return {
      conversation: asObject(
        await dailybotRequest({
          path: "/v1/messaging/open-conversation/",
          method: "POST",
          body: compactObject({
            user_uuid: requiredString(input.user_uuid, "user_uuid", badInput),
            initial_message: optionalString(input.initial_message),
          }),
          context,
          phase: "execute",
        }),
      ),
    };
  },
};

export async function validateDailybotCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: ApiKeyProviderContext = { apiKey, fetcher, signal };
  const profile = asObject(await dailybotRequest({ path: "/v1/me/", method: "GET", context, phase: "validate" }));
  const organization = optionalRecord(profile.organization);
  const accountId = optionalString(profile.email) ?? optionalString(profile.id) ?? "dailybot:token";
  return {
    profile: {
      accountId,
      displayName: buildDisplayName(profile.first_name, profile.last_name) ?? accountId,
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/v1/me/",
      userId: optionalString(profile.id),
      role: optionalString(profile.role),
      timezone: optionalString(profile.timezone),
      organizationId: optionalString(organization?.id),
      organizationName: optionalString(organization?.name),
      organizationPlan: optionalString(organization?.plan),
    }),
  };
}

async function dailybotRequest(input: {
  path: string;
  method: "GET" | "POST";
  context: ApiKeyProviderContext;
  phase: DailybotPhase;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(input.path, dailybotApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers: {
        "X-API-KEY": input.context.apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Dailybot request failed: ${error.message}` : "Dailybot request failed",
    );
  }
  const payload = await readJsonPayload(response);
  if (!response.ok) throw createDailybotError(response.status, payload, input.phase);
  return payload;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Dailybot returned invalid JSON");
  }
}

function createDailybotError(status: number, payload: unknown, phase: DailybotPhase): ProviderRequestError {
  const message = extractDailybotMessage(payload) ?? `Dailybot request failed with ${status || 500}`;
  if (phase === "validate" && (status === 401 || status === 403)) return new ProviderRequestError(400, message);
  return new ProviderRequestError(status || 500, message);
}

function extractDailybotMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const direct = record ? (optionalString(record.detail) ?? optionalString(record.message)) : undefined;
  if (direct) return direct;
  const errors = Array.isArray(record?.errors) ? record.errors : undefined;
  const firstError = errors?.[0];
  return typeof firstError === "string" ? firstError : optionalString(optionalRecord(firstError)?.message);
}

function readListPayload(payload: unknown): { count: number; results: Array<Record<string, unknown>> } {
  const record = asObject(payload);
  return {
    count: optionalInteger(record.count) ?? 0,
    results: Array.isArray(record.results) ? record.results.map(asObject) : [],
  };
}

function buildDisplayName(firstName: unknown, lastName: unknown): string | undefined {
  const parts = [optionalString(firstName), optionalString(lastName)].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function asObject(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
