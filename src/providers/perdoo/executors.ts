import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { PerdooActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  positiveInteger,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "perdoo";
const perdooGraphqlUrl = "https://eu.perdoo.com/graphql/";

type PerdooContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type PerdooActionHandler = (input: Record<string, unknown>, context: PerdooContext) => Promise<unknown>;
type PerdooRequestPhase = "validate" | "execute";

interface PerdooGraphqlRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

interface PerdooGraphqlPayload {
  data?: unknown;
  errors?: unknown;
  extensions?: unknown;
}

const goalFields = `
  id
  type
  name
  description
  private
  currentValue
  status
  stage
  progress
  archived
  metricUnit
  startDate
  endDate
  createdDate
  lastEditedDate
  company { id name }
  parent { id name type }
  lead { id email firstName lastName }
  timeframe { id name startDate endDate }
`;

const commitFields = `
  id
  description
  commitType
  createdDate
  commitDate
  value
  delta
  valueBefore
  status
  statusBefore
  keyResult { id name currentValue }
  kpi { id name currentValue }
  goal { id name type currentValue }
  user { id email firstName lastName }
`;

const validateCredentialQuery = `
  query ValidatePerdooCredential {
    me {
      id
      email
      firstName
      lastName
      company { id name }
    }
    currentCompany { id name }
  }
`;

const listGoalsQuery = `
  query ListPerdooGoals(
    $first: Int
    $after: String
    $type: PerdooApiGoalTypeChoices
    $status: CommitStatus
    $stage: ObjectiveStage
    $archived: Boolean
    $includeArchived: Boolean
    $orderBy: String
  ) {
    goals(
      first: $first
      after: $after
      type: $type
      status: $status
      stage: $stage
      archived: $archived
      includeArchived: $includeArchived
      orderBy: $orderBy
    ) {
      edges {
        cursor
        node { ${goalFields} }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
      edgeCount
    }
  }
`;

const getGoalQuery = `
  query GetPerdooGoal($id: UUID!) {
    goal(id: $id) { ${goalFields} }
  }
`;

const upsertCommitMutation = `
  mutation UpsertPerdooCommit($input: UpsertCommitMutationInput!) {
    upsertCommit(input: $input) {
      commit { ${commitFields} }
      errors {
        field
        messages
      }
    }
  }
`;

export const perdooActionHandlers: Record<PerdooActionName, PerdooActionHandler> = {
  async list_goals(input, context) {
    const data = await requestPerdooData(
      {
        operationName: "ListPerdooGoals",
        query: listGoalsQuery,
        variables: compactObject({
          first: optionalPositiveInteger(input.first, "first"),
          after: optionalRawString(input.after),
          type: optionalRawString(input.type),
          status: optionalRawString(input.status),
          stage: optionalRawString(input.stage),
          archived: optionalBoolean(input.archived),
          includeArchived: optionalBoolean(input.includeArchived),
          orderBy: optionalRawString(input.orderBy),
        }),
      },
      context,
      "execute",
    );
    const connection = readObjectField(data, "goals", "Perdoo goals");
    const edges = readArrayField(connection, "edges", "Perdoo goal edges");
    return {
      goals: edges.map((edge) => normalizeGoalEdge(readObject(edge, "Perdoo goal edge"))),
      pageInfo: readObjectField(connection, "pageInfo", "Perdoo pageInfo"),
      totalCount: readNumberField(connection, "totalCount", "Perdoo totalCount"),
      edgeCount: readNumberField(connection, "edgeCount", "Perdoo edgeCount"),
    };
  },

  async get_goal(input, context) {
    const data = await requestPerdooData(
      {
        operationName: "GetPerdooGoal",
        query: getGoalQuery,
        variables: {
          id: readRequiredString(input.id, "id"),
        },
      },
      context,
      "execute",
    );
    return {
      goal: normalizeNullableGoal(data.goal, "Perdoo goal"),
    };
  },

  async upsert_commit(input, context) {
    assertExactlyOneCommitTarget(input);
    const data = await requestPerdooData(
      {
        operationName: "UpsertPerdooCommit",
        query: upsertCommitMutation,
        variables: {
          input: compactObject({
            goal: optionalRawString(input.goalId),
            keyResult: optionalRawString(input.keyResultId),
            kpi: optionalRawString(input.kpiId),
            id: optionalRawString(input.commitId),
            commitDate: optionalRawString(input.commitDate),
            commitType: optionalRawString(input.commitType),
            value: optionalNumber(input.value),
            status: optionalRawString(input.status),
            description: optionalRawString(input.description),
            user: optionalRawString(input.userId),
          }),
        },
      },
      context,
      "execute",
    );
    const payload = readObjectField(data, "upsertCommit", "Perdoo upsertCommit payload");
    return {
      commit: readNullableObject(payload.commit, "Perdoo commit"),
      errors: readArrayField(payload, "errors", "Perdoo mutation errors"),
    };
  },

  async execute_graphql(input, context) {
    const payload = await requestPerdooGraphql(
      {
        query: readRequiredString(input.query, "query"),
        variables: optionalRecord(input.variables),
        operationName: optionalRawString(input.operationName),
      },
      context,
      "execute",
    );
    const extensions = optionalRecord(payload.extensions);
    return {
      data: payload.data ?? null,
      ...(extensions ? { extensions } : {}),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, perdooActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: perdooGraphqlUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const data = await requestPerdooData(
      {
        operationName: "ValidatePerdooCredential",
        query: validateCredentialQuery,
      },
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    const me = readObjectField(data, "me", "Perdoo me");
    const currentCompany = readObjectField(data, "currentCompany", "Perdoo currentCompany");
    const userId = readRequiredString(me.id, "me.id");
    const email = readRequiredString(me.email, "me.email");
    const firstName = optionalRawString(me.firstName);
    const lastName = optionalRawString(me.lastName);
    const companyId = readRequiredString(currentCompany.id, "currentCompany.id");
    const companyName = readRequiredString(currentCompany.name, "currentCompany.name");
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    return {
      profile: {
        accountId: `perdoo:${userId}`,
        displayName: fullName || email || companyName,
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: perdooGraphqlUrl,
        validationEndpoint: "me",
        userId,
        userEmail: email,
        companyId,
        companyName,
      }),
    };
  },
};

async function requestPerdooData(
  request: PerdooGraphqlRequest,
  context: PerdooContext,
  phase: PerdooRequestPhase,
): Promise<Record<string, unknown>> {
  const payload = await requestPerdooGraphql(request, context, phase);
  if (payload.data === undefined || payload.data === null) {
    throw new ProviderRequestError(502, "perdoo response did not include data", payload);
  }
  return readObject(payload.data, "Perdoo data");
}

async function requestPerdooGraphql(
  request: PerdooGraphqlRequest,
  context: PerdooContext,
  phase: PerdooRequestPhase,
): Promise<PerdooGraphqlPayload> {
  let response: Response;
  let payload: PerdooGraphqlPayload;
  try {
    response = await context.fetcher(perdooGraphqlUrl, {
      method: "POST",
      headers: perdooHeaders(context.apiKey),
      body: JSON.stringify(
        compactObject({
          query: request.query,
          variables: request.variables,
          operationName: request.operationName,
        }),
      ),
      signal: context.signal,
    });
    payload = await readPerdooPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `perdoo request failed: ${error.message}` : "perdoo request failed",
    );
  }

  if (!response.ok) {
    throw createPerdooHttpError(response.status, payload, phase);
  }

  const errors = readGraphqlErrors(payload.errors);
  if (errors.length > 0) {
    throw createPerdooGraphqlError(errors, phase);
  }

  return payload;
}

function perdooHeaders(apiKey: string): HeadersInit {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readPerdooPayload(response: Response): Promise<PerdooGraphqlPayload> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as PerdooGraphqlPayload;
  } catch {
    throw new ProviderRequestError(502, "perdoo returned malformed JSON");
  }
}

function createPerdooHttpError(
  status: number,
  payload: PerdooGraphqlPayload,
  phase: PerdooRequestPhase,
): ProviderRequestError {
  const message = readGraphqlErrors(payload.errors)[0] ?? `perdoo request failed with HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 500) {
    return new ProviderRequestError(502, message, payload);
  }
  return new ProviderRequestError(status, message, payload);
}

function createPerdooGraphqlError(errors: string[], phase: PerdooRequestPhase): ProviderRequestError {
  const message = errors[0] ?? "perdoo GraphQL request failed";
  if (message.toLowerCase().includes("unauthorized")) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, errors);
  }
  return new ProviderRequestError(400, message, errors);
}

function readGraphqlErrors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    if (item && typeof item === "object" && "message" in item && typeof item.message === "string") {
      return item.message;
    }
    return "unknown GraphQL error";
  });
}

function normalizeGoalEdge(edge: Record<string, unknown>): Record<string, unknown> {
  return normalizeGoal(readObjectField(edge, "node", "Perdoo goal node"), optionalRawString(edge.cursor));
}

function normalizeNullableGoal(value: unknown, fieldName: string): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }
  return normalizeGoal(readObject(value, fieldName));
}

function normalizeGoal(goal: Record<string, unknown>, cursor?: string): Record<string, unknown> {
  return compactObject({
    ...goal,
    ...(cursor ? { cursor } : {}),
    raw: goal,
  });
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readNullableObject(value: unknown, fieldName: string): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }
  return readObject(value, fieldName);
}

function readObjectField(input: Record<string, unknown>, key: string, fieldName: string): Record<string, unknown> {
  return readObject(input[key], fieldName);
}

function readArrayField(input: Record<string, unknown>, key: string, fieldName: string): unknown[] {
  const value = input[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value;
}

function readNumberField(input: Record<string, unknown>, key: string, fieldName: string): number {
  const value = input[key];
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `${fieldName} must be a number`);
  }
  return value;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `${fieldName} must be a non-empty string`);
  }
  return value;
}

function optionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return positiveInteger(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function assertExactlyOneCommitTarget(input: Record<string, unknown>): void {
  const targetCount = ["goalId", "keyResultId", "kpiId"].filter((key) => {
    const value = input[key];
    return typeof value === "string" && value !== "";
  }).length;
  if (targetCount !== 1) {
    throw new ProviderRequestError(400, "Exactly one of goalId, keyResultId, or kpiId is required.");
  }
}
