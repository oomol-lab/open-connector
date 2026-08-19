import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const jiminnyUsApiBaseUrl = "https://app.jiminny.com/customer/api/v1";
const jiminnyEuApiBaseUrl = "https://app.jiminny.eu/customer/api/v1";
const jiminnyValidationPath = "/me";
const jiminnyPendingGeneration = Symbol("jiminnyPendingGeneration");

type JiminnyRequestPhase = "validate" | "execute";
type JiminnyActionHandler = (input: Record<string, unknown>, context: JiminnyActionContext) => Promise<unknown>;

export interface JiminnyActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const jiminnyActionHandlers: ProviderActionHandlers<"jiminny", JiminnyActionHandler> = {
  get_current_organization(_input, context) {
    return getCurrentOrganization(context);
  },
  list_users(_input, context) {
    return listJiminnyUsers(context);
  },
  list_activities(input, context) {
    return listJiminnyPage("/getActivities", input, context, "activities");
  },
  get_activity(input, context) {
    return getJiminnyObject("/getActivity", input, context, "activity");
  },
  get_transcription(input, context) {
    return getJiminnyArray("/getTranscription", input, context, "segments");
  },
  get_summary(input, context) {
    return getJiminnyGeneratedObject("/getSummary", input, context, "summary", "summaryStatus");
  },
  get_action_items(input, context) {
    return getJiminnyGeneratedObject("/getActionItems", input, context, "actionItems", "actionItemsStatus");
  },
  list_topic_triggers(_input, context) {
    return listJiminnyTopLevelArray("/getTriggers", context, "topicTriggers");
  },
  list_matched_topic_triggers(input, context) {
    return getJiminnyArray("/getMatchedTriggers", input, context, "matchedTopicTriggers");
  },
  list_questions(input, context) {
    return getJiminnyArray("/getQuestions", input, context, "questions");
  },
  get_ai_scorecard(input, context) {
    return getJiminnyObject("/getAiScorecard", input, context, "aiScorecard", { allowNoContent: true });
  },
  list_ai_scorecards(input, context) {
    return listJiminnyPage("/getAiScorecards", input, context, "scorecardResults");
  },
  list_listens(input, context) {
    return listJiminnyPage("/listens", input, context, "listens");
  },
  list_automated_call_scoring(input, context) {
    return listJiminnyPage("/automated-call-scoring", input, context, "scoringResults");
  },
  list_comments(input, context) {
    return listJiminnyPage("/comments", input, context, "comments");
  },
  list_coaching_feedback(input, context) {
    return listJiminnyPage("/coaching-feedback", input, context, "coachingFeedback");
  },
};

export async function validateJiminnyCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiBaseUrl = resolveJiminnyApiBaseUrl(input.values);
  const organization = readObjectPayload(
    await requestJiminnyJson({
      path: jiminnyValidationPath,
      apiBaseUrl,
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    }),
    "Jiminny returned an invalid organization payload",
  );
  const organizationId = optionalString(organization.id);
  const organizationName = optionalString(organization.name);
  const domain = optionalString(organization.domain);
  const region = apiBaseUrl === jiminnyEuApiBaseUrl ? "eu" : "us";

  return {
    profile: {
      accountId: organizationId ?? domain ?? "jiminny",
      displayName: organizationName ?? domain ?? "Jiminny Organization",
    },
    grantedScopes: [],
    metadata: compactObject({
      organizationId,
      organizationName,
      domain,
      region,
      apiBaseUrl,
      validationEndpoint: jiminnyValidationPath,
    }),
  };
}

export function resolveJiminnyApiBaseUrl(input: Record<string, unknown> | undefined): string {
  const region = optionalString(input?.region)?.toLowerCase();
  if (region === "us" || region === "com" || region === undefined) {
    const storedBaseUrl = optionalString(input?.apiBaseUrl);
    if (storedBaseUrl === undefined || storedBaseUrl === jiminnyUsApiBaseUrl) {
      return jiminnyUsApiBaseUrl;
    }
    if (storedBaseUrl === jiminnyEuApiBaseUrl) {
      return jiminnyEuApiBaseUrl;
    }
    throw new ProviderRequestError(400, "Jiminny apiBaseUrl must be an official US or EU API URL");
  }
  if (region === "eu") {
    return jiminnyEuApiBaseUrl;
  }
  throw new ProviderRequestError(400, "Jiminny region must be us or eu");
}

async function getCurrentOrganization(context: JiminnyActionContext): Promise<unknown> {
  const payload = await requestJiminnyJson({
    path: jiminnyValidationPath,
    apiBaseUrl: context.apiBaseUrl,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    organization: readObjectPayload(payload, "Jiminny returned an invalid organization payload"),
  };
}

async function listJiminnyUsers(context: JiminnyActionContext): Promise<unknown> {
  const payload = readObjectPayload(
    await requestJiminnyJson({
      path: "/getUsers",
      apiBaseUrl: context.apiBaseUrl,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
    "Jiminny returned an invalid users payload",
  );
  return compactObject({
    users: readOptionalArray(payload.data, "Jiminny users data") ?? [],
    links: readOptionalObject(payload.links),
  });
}

async function listJiminnyTopLevelArray(
  path: string,
  context: JiminnyActionContext,
  outputKey: string,
): Promise<unknown> {
  const payload = await requestJiminnyJson({
    path,
    apiBaseUrl: context.apiBaseUrl,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    [outputKey]: readArrayPayload(payload, `Jiminny ${path} response`),
  };
}

async function getJiminnyArray(
  path: string,
  input: Record<string, unknown>,
  context: JiminnyActionContext,
  outputKey: string,
): Promise<unknown> {
  const payload = await requestJiminnyJson({
    path,
    query: pickQuery(input, ["activityId"]),
    apiBaseUrl: context.apiBaseUrl,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    [outputKey]: readArrayPayload(payload, `Jiminny ${path} response`),
  };
}

async function getJiminnyObject(
  path: string,
  input: Record<string, unknown>,
  context: JiminnyActionContext,
  outputKey: string,
  options: { allowNoContent?: boolean } = {},
): Promise<unknown> {
  const payload = await requestJiminnyJson({
    path,
    query: pickQuery(input, ["activityId"]),
    apiBaseUrl: context.apiBaseUrl,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  if (payload === null && options.allowNoContent) {
    return { [outputKey]: null };
  }
  return {
    [outputKey]: readObjectPayload(payload, `Jiminny ${path} response`),
  };
}

async function getJiminnyGeneratedObject(
  path: string,
  input: Record<string, unknown>,
  context: JiminnyActionContext,
  outputKey: string,
  statusKey: string,
): Promise<unknown> {
  const payload = await requestJiminnyJson({
    path,
    query: pickQuery(input, ["activityId"]),
    apiBaseUrl: context.apiBaseUrl,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    pendingGenerationOnNotFound: true,
  });
  if (payload === jiminnyPendingGeneration) {
    return { [outputKey]: null, [statusKey]: "generating" };
  }
  if (payload === null) {
    return { [outputKey]: null, [statusKey]: "not_available" };
  }

  const object = readObjectPayload(payload, `Jiminny ${path} response`);
  const generatedObject = readOptionalObject(object[outputKey]);
  return {
    [outputKey]: generatedObject ?? null,
    [statusKey]: generatedObject ? "available" : "not_available",
  };
}

async function listJiminnyPage(
  path: string,
  input: Record<string, unknown>,
  context: JiminnyActionContext,
  outputKey: string,
): Promise<unknown> {
  const payload = readObjectPayload(
    await requestJiminnyJson({
      path,
      query: pickQuery(input, [
        "fromDate",
        "toDate",
        "updatedFrom",
        "updatedTo",
        "status",
        "page",
        "accountId",
        "opportunityId",
        "activityId",
        "userId",
        "coachId",
        "coacheeId",
      ]),
      apiBaseUrl: context.apiBaseUrl,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
    `Jiminny ${path} response`,
  );
  return compactObject({
    [outputKey]: readOptionalArray(payload.results, `Jiminny ${path} results`) ?? [],
    metadata: readOptionalObject(payload.metadata),
    failed: readOptionalStringArray(payload.failed, `Jiminny ${path} failed records`),
  });
}

async function requestJiminnyJson(input: {
  path: string;
  query?: Record<string, string>;
  apiBaseUrl: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: JiminnyRequestPhase;
  pendingGenerationOnNotFound?: boolean;
}): Promise<unknown> {
  const url = new URL(stripLeadingSlash(input.path), withTrailingSlash(input.apiBaseUrl));
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Jiminny request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  if (response.status === 204) {
    return null;
  }

  const payload = await readJiminnyPayload(response);
  if (!response.ok) {
    const message = readJiminnyMessage(payload);
    if (input.pendingGenerationOnNotFound === true && response.status === 404 && isJiminnyGeneratingMessage(message)) {
      return jiminnyPendingGeneration;
    }
    throw mapJiminnyError(response.status, message, input.phase);
  }

  return payload;
}

async function readJiminnyPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Jiminny returned malformed JSON");
    }
    return { message: text };
  }
}

function mapJiminnyError(status: number, message: string, phase: JiminnyRequestPhase): ProviderRequestError {
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function isJiminnyGeneratingMessage(message: string): boolean {
  return message.toLowerCase().includes("being generated");
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function stripLeadingSlash(value: string): string {
  return value.startsWith("/") ? value.slice(1) : value;
}

function readJiminnyMessage(payload: unknown): string {
  const object = readOptionalObject(payload);
  if (!object) {
    return "Jiminny request failed";
  }
  const directMessage = optionalString(object.message);
  if (directMessage) {
    return directMessage;
  }
  const directError = optionalString(object.error);
  if (directError) {
    return directError;
  }
  const errorObject = readOptionalObject(object.error);
  const nestedMessage = optionalString(errorObject?.message);
  if (nestedMessage) {
    return nestedMessage;
  }
  return "Jiminny request failed";
}

function pickQuery(input: Record<string, unknown>, keys: string[]): Record<string, string> {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = input[key];
      if (value === undefined || value === null || value === "") {
        return [];
      }
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return [[key, String(value)]];
      }
      return [];
    }),
  );
}

function readObjectPayload(payload: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readArrayPayload(payload: unknown, message: string): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${message} must be an array`);
  }
  return payload;
}

function readOptionalObject(payload: unknown): Record<string, unknown> | undefined {
  return optionalRecord(payload);
}

function readOptionalArray(payload: unknown, message: string): unknown[] | undefined {
  if (payload === undefined || payload === null) {
    return undefined;
  }
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${message} must be an array`);
  }
  return payload;
}

function readOptionalStringArray(payload: unknown, message: string): unknown[] | undefined {
  if (payload === undefined || payload === null) {
    return undefined;
  }
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${message} must be an array`);
  }
  return payload;
}
