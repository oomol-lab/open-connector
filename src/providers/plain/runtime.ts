import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const plainApiUrl = "https://core-api.uk.plain.com/graphql/v1";

const customerSelection = `
  id
  externalId
  fullName
  shortName
  email {
    email
    isVerified
  }
  avatarUrl
  createdAt {
    iso8601
  }
  updatedAt {
    iso8601
  }
`;

const pageInfoSelection = `
  hasNextPage
  hasPreviousPage
  startCursor
  endCursor
`;

const validateOperation = `
  query ValidatePlainCredential {
    myMachineUser {
      id
      fullName
      publicName
    }
  }
`;

const getCustomerByEmailOperation = `
  query GetCustomerByEmail($email: String!) {
    customerByEmail(email: $email) {
      ${customerSelection}
    }
  }
`;

const getCustomerByExternalIdOperation = `
  query GetCustomerByExternalId($externalId: ID!) {
    customerByExternalId(externalId: $externalId) {
      ${customerSelection}
    }
  }
`;

const searchCustomersOperation = `
  query SearchCustomers($searchQuery: CustomersSearchQuery!, $first: Int, $after: String) {
    searchCustomers(searchQuery: $searchQuery, first: $first, after: $after) {
      edges {
        node {
          ${customerSelection}
        }
      }
      pageInfo {
        ${pageInfoSelection}
      }
    }
  }
`;

const upsertCustomerOperation = `
  mutation UpsertCustomer($input: UpsertCustomerInput!) {
    upsertCustomer(input: $input) {
      result
      customer {
        ${customerSelection}
      }
      error {
        message
        type
        code
      }
    }
  }
`;

interface PlainGraphqlPayload {
  data?: Record<string, unknown>;
  errors?: unknown[];
}

type PlainHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const plainActionHandlers: ProviderActionHandlers<"plain", PlainHandler> = {
  get_customer_by_email(input, context) {
    return getCustomerByEmail(input, context);
  },
  get_customer_by_external_id(input, context) {
    return getCustomerByExternalId(input, context);
  },
  search_customers(input, context) {
    return searchCustomers(input, context);
  },
  upsert_customer(input, context) {
    return upsertCustomer(input, context);
  },
};

export async function validatePlainCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await executePlainOperation(
    {
      operationName: "ValidatePlainCredential",
      query: validateOperation,
      variables: {},
      apiKey,
      phase: "validate",
      signal,
    },
    fetcher,
  );
  const machineUser = readObject(payload.data?.myMachineUser, "plain validation response");
  const machineUserId = readString(machineUser.id, "plain machine user id");
  const fullName = readString(machineUser.fullName, "plain machine user fullName");
  return {
    profile: { accountId: machineUserId, displayName: fullName },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: plainApiUrl,
      validationEndpoint: "myMachineUser",
      machineUserId,
      publicName: optionalString(machineUser.publicName),
    }),
  };
}

async function getCustomerByEmail(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await executePlainOperation(
    {
      operationName: "GetCustomerByEmail",
      query: getCustomerByEmailOperation,
      variables: { email: requiredString(input.email, "email") },
      apiKey: context.apiKey,
      phase: "execute",
      signal: context.signal,
    },
    context.fetcher,
  );
  return { customer: normalizeCustomer(payload.data?.customerByEmail, "customerByEmail") };
}

async function getCustomerByExternalId(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await executePlainOperation(
    {
      operationName: "GetCustomerByExternalId",
      query: getCustomerByExternalIdOperation,
      variables: { externalId: requiredString(input.externalId, "externalId") },
      apiKey: context.apiKey,
      phase: "execute",
      signal: context.signal,
    },
    context.fetcher,
  );
  return { customer: normalizeCustomer(payload.data?.customerByExternalId, "customerByExternalId") };
}

async function searchCustomers(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const term = requiredString(input.term, "term");
  const payload = await executePlainOperation(
    {
      operationName: "SearchCustomers",
      query: searchCustomersOperation,
      variables: compactObject({
        searchQuery: {
          or: [
            { fullName: { caseInsensitiveContains: term } },
            { shortName: { caseInsensitiveContains: term } },
            { email: { caseInsensitiveContains: term } },
            { externalId: { caseInsensitiveContains: term } },
          ],
        },
        first: typeof input.first === "number" ? input.first : undefined,
        after: optionalString(input.after),
      }),
      apiKey: context.apiKey,
      phase: "execute",
      signal: context.signal,
    },
    context.fetcher,
  );
  const connection = readObject(payload.data?.searchCustomers, "searchCustomers response");
  const edges = readArray(connection.edges, "searchCustomers edges");
  return {
    customers: edges.map((edge) =>
      normalizeCustomer(readObject(edge, "searchCustomers edge").node, "searchCustomers.node"),
    ),
    pageInfo: normalizePageInfo(connection.pageInfo),
  };
}

async function upsertCustomer(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await executePlainOperation(
    {
      operationName: "UpsertCustomer",
      query: upsertCustomerOperation,
      variables: { input: buildUpsertCustomerInput(input) },
      apiKey: context.apiKey,
      phase: "execute",
      signal: context.signal,
    },
    context.fetcher,
  );
  const result = readObject(payload.data?.upsertCustomer, "upsertCustomer response");
  const mutationError = optionalRecord(result.error);
  if (mutationError) {
    throw mapPlainMutationError(mutationError);
  }
  return {
    result: readString(result.result, "upsertCustomer result"),
    customer: normalizeCustomer(result.customer, "upsertCustomer.customer"),
  };
}

async function executePlainOperation(
  input: {
    operationName: string;
    query: string;
    variables: Record<string, unknown>;
    apiKey: string;
    phase: "validate" | "execute";
    signal?: AbortSignal;
  },
  fetcher: typeof fetch,
): Promise<PlainGraphqlPayload> {
  let response: Response;
  try {
    response = await fetcher(plainApiUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({
        operationName: input.operationName,
        query: input.query,
        variables: input.variables,
      }),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `plain request failed: ${error.message}` : "plain request failed",
    );
  }

  const payload = await readPlainPayload(response);
  if (!response.ok) {
    throw createPlainHttpError(response.status, payload, input.phase);
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw createPlainGraphqlError(payload.errors, input.phase);
  }
  return payload;
}

async function readPlainPayload(response: Response): Promise<PlainGraphqlPayload> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as PlainGraphqlPayload;
  } catch {
    throw new ProviderRequestError(502, "plain returned malformed JSON");
  }
}

function createPlainHttpError(
  status: number,
  payload: PlainGraphqlPayload,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = firstPlainErrorMessage(payload.errors) ?? "plain request failed";
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function createPlainGraphqlError(errors: unknown[], phase: "validate" | "execute"): ProviderRequestError {
  const firstError = readObject(errors[0], "plain graphql error");
  const message = readString(firstError.message, "plain graphql error message");
  const code = optionalString(optionalRecord(firstError.extensions)?.code);
  if (code === "UNAUTHENTICATED") {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (
    code === "FORBIDDEN" ||
    code === "BAD_USER_INPUT" ||
    code === "GRAPHQL_VALIDATION_FAILED" ||
    code === "GRAPHQL_PARSE_FAILED"
  ) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function mapPlainMutationError(error: Record<string, unknown>): ProviderRequestError {
  const message = readString(error.message, "plain mutation error message");
  const type = optionalString(error.type);
  const code = optionalString(error.code);
  if (type === "FORBIDDEN" || code === "forbidden") {
    return new ProviderRequestError(401, message);
  }
  if (type === "INTERNAL" || code === "internal") {
    return new ProviderRequestError(502, message);
  }
  return new ProviderRequestError(400, message);
}

function buildUpsertCustomerInput(input: Record<string, unknown>): Record<string, unknown> {
  const identifier = requiredRecord(input.identifier, "identifier");
  const onCreate = requiredRecord(input.onCreate, "onCreate");
  const onUpdate = requiredRecord(input.onUpdate, "onUpdate");
  return compactObject({
    identifier: compactObject({
      emailAddress: optionalString(identifier.emailAddress),
      externalId: optionalString(identifier.externalId),
      customerId: optionalString(identifier.customerId),
    }),
    onCreate: compactObject({
      fullName: requiredString(onCreate.fullName, "onCreate.fullName"),
      email: {
        email: requiredString(onCreate.email, "onCreate.email"),
        isVerified: typeof onCreate.emailVerified === "boolean" ? onCreate.emailVerified : false,
      },
      externalId: optionalString(onCreate.externalId),
      shortName: optionalString(onCreate.shortName),
    }),
    onUpdate: compactObject({
      fullName: typeof onUpdate.fullName === "string" ? { value: onUpdate.fullName } : undefined,
      shortName: typeof onUpdate.shortName === "string" ? { value: onUpdate.shortName } : undefined,
      externalId: typeof onUpdate.externalId === "string" ? { value: onUpdate.externalId } : undefined,
      email:
        typeof onUpdate.email === "string"
          ? {
              email: onUpdate.email,
              isVerified: typeof onUpdate.emailVerified === "boolean" ? onUpdate.emailVerified : false,
            }
          : undefined,
    }),
  });
}

function normalizeCustomer(value: unknown, fieldName: string): Record<string, unknown> {
  const customer = readObject(value, fieldName);
  const email = readObject(customer.email, `${fieldName}.email`);
  return {
    id: readString(customer.id, `${fieldName}.id`),
    externalId: readNullableString(customer.externalId),
    fullName: readString(customer.fullName, `${fieldName}.fullName`),
    shortName: readNullableString(customer.shortName),
    email: readString(email.email, `${fieldName}.email.email`),
    emailVerified: readBoolean(email.isVerified, `${fieldName}.email.isVerified`),
    avatarUrl: readNullableString(customer.avatarUrl),
    createdAt: readDateTime(customer.createdAt, `${fieldName}.createdAt`),
    updatedAt: readDateTime(customer.updatedAt, `${fieldName}.updatedAt`),
  };
}

function normalizePageInfo(value: unknown): Record<string, unknown> {
  const pageInfo = readObject(value, "pageInfo");
  return {
    hasNextPage: readBoolean(pageInfo.hasNextPage, "pageInfo.hasNextPage"),
    hasPreviousPage: readBoolean(pageInfo.hasPreviousPage, "pageInfo.hasPreviousPage"),
    startCursor: readNullableString(pageInfo.startCursor),
    endCursor: readNullableString(pageInfo.endCursor),
  };
}

function readDateTime(value: unknown, fieldName: string): string {
  return readString(readObject(value, fieldName).iso8601, `${fieldName}.iso8601`);
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return record;
}

function readArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return value;
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return value;
}

function readNullableString(value: unknown): string | null {
  return value == null ? null : readString(value, "string");
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return value;
}

function firstPlainErrorMessage(errors: unknown[] | undefined): string | undefined {
  if (!Array.isArray(errors) || errors.length === 0) {
    return undefined;
  }
  return optionalString(optionalRecord(errors[0])?.message);
}
