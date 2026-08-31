import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  runProviderRequest,
} from "../provider-runtime.ts";

export const stackOverflowForTeamsApiBaseUrl = "https://api.stackoverflowteams.com/v3/";

export interface StackOverflowForTeamsContext {
  apiKey: string;
  team: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface RequestInput extends StackOverflowForTeamsContext {
  path: string;
  phase: "validate" | "execute";
  query?: URLSearchParams;
}

type StackOverflowForTeamsHandler = (
  input: Record<string, unknown>,
  context: StackOverflowForTeamsContext,
) => Promise<unknown>;

export const stackOverflowForTeamsActionHandlers: ProviderActionHandlers<
  "stack_overflow_for_teams",
  StackOverflowForTeamsHandler
> = {
  search(input, context) {
    return requestPaginated(input, context, "search");
  },
  list_questions(input, context) {
    return requestPaginated(input, context, "questions");
  },
  async get_question(input, context) {
    const questionId = requirePositiveInteger(input.questionId, "questionId");
    return { question: await requestJson({ ...context, path: `questions/${questionId}`, phase: "execute" }) };
  },
  list_answers(input, context) {
    const questionId = requirePositiveInteger(input.questionId, "questionId");
    return requestPaginated(input, context, `questions/${questionId}/answers`, ["questionId"]);
  },
  list_tags(input, context) {
    return requestPaginated(input, context, "tags");
  },
  async get_current_user(_input, context) {
    return { user: await requestJson({ ...context, path: "users/me", phase: "execute" }) };
  },
};

export function createStackOverflowForTeamsContext(
  apiKey: string,
  values: Record<string, string>,
  metadata: Record<string, unknown>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): StackOverflowForTeamsContext {
  return {
    apiKey: requiredString(apiKey, "apiKey", providerInputError),
    team: requireTeam(values.team ?? optionalString(metadata.team)),
    fetcher,
    signal,
  };
}

export async function validateStackOverflowForTeamsCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createStackOverflowForTeamsContext(apiKey, values, {}, fetcher, signal);
  const user = optionalRecord(await requestJson({ ...context, path: "users/me", phase: "validate" }));
  if (!user) throw new ProviderRequestError(502, "Stack Internal returned an invalid current-user response");
  const displayName = optionalString(user.displayName) ?? optionalString(user.name);
  return {
    profile: {
      accountId: typeof user.id === "number" ? String(user.id) : `stack-internal:${context.team}`,
      displayName: displayName ? `${displayName} (${context.team})` : `Stack Internal ${context.team}`,
    },
    grantedScopes: [],
    metadata: {
      team: context.team,
      apiBaseUrl: stackOverflowForTeamsApiBaseUrl,
      validationEndpoint: `teams/${context.team}/users/me`,
    },
  };
}

async function requestPaginated(
  input: Record<string, unknown>,
  context: StackOverflowForTeamsContext,
  path: string,
  excludedFields: string[] = [],
): Promise<unknown> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (!excludedFields.includes(key) && value !== null && value !== undefined) query.set(key, String(value));
  }
  return requestJson({ ...context, path, query, phase: "execute" });
}

async function requestJson(input: RequestInput): Promise<unknown> {
  const url = new URL(`teams/${encodeURIComponent(input.team)}/${input.path}`, stackOverflowForTeamsApiBaseUrl);
  if (input.query) url.search = input.query.toString();
  return runProviderRequest({ signal: input.signal, label: "Stack Internal" }, async (signal) => {
    const response = await input.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Stack Internal returned invalid JSON",
    });
    if (!response.ok) throw mapError(response, payload, input.phase);
    return payload;
  });
}

function mapError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `Stack Internal request failed with HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function requireTeam(value: unknown): string {
  return requiredString(value, "team", () => new ProviderRequestError(400, "stack_overflow_for_teams requires team"));
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value;
}
