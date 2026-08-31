import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";
import { missiveMailboxFilterNames } from "./actions.ts";

const service = "missive";
const missiveApiBaseUrl = "https://public.missiveapp.com";
const missiveValidationPath = "/v1/users";

type MissiveRequestPhase = "validate" | "execute";
type MissiveActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface MissiveRequestOptions {
  path: string;
  query?: Record<string, unknown>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase?: MissiveRequestPhase;
  notFoundAsInvalidInput?: boolean;
}

export const missiveActionHandlers: ProviderActionHandlers<"missive", MissiveActionHandler> = {
  list_users(_input, context) {
    return requestMissiveJson({
      path: missiveValidationPath,
      context,
    });
  },
  list_organizations(input, context) {
    return requestMissiveJson({
      path: "/v1/organizations",
      query: paginationQuery(input),
      context,
    });
  },
  list_teams(_input, context) {
    return requestMissiveJson({
      path: "/v1/teams",
      context,
    });
  },
  list_contact_books(input, context) {
    return requestMissiveJson({
      path: "/v1/contact_books",
      query: paginationQuery(input),
      context,
    });
  },
  list_contacts(input, context) {
    return requestMissiveJson({
      path: "/v1/contacts",
      query: compactObject({
        contact_book: input.contact_book,
        order: input.order,
        limit: input.limit,
        offset: input.offset,
        modified_since: input.modified_since,
        include_deleted: input.include_deleted,
        search: input.search,
      }),
      context,
    });
  },
  async get_contact(input, context) {
    const payload = await requestMissiveJson({
      path: `/v1/contacts/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
      context,
      notFoundAsInvalidInput: true,
    });

    return { contact: readSingleResource(payload, "contacts") };
  },
  list_conversations(input, context) {
    assertListConversationsFilters(input);
    return requestMissiveJson({
      path: "/v1/conversations",
      query: compactObject({
        limit: input.limit,
        until: input.until,
        inbox: input.inbox,
        all: input.all,
        assigned: input.assigned,
        closed: input.closed,
        snoozed: input.snoozed,
        flagged: input.flagged,
        trashed: input.trashed,
        junked: input.junked,
        drafts: input.drafts,
        shared_label: input.shared_label,
        team_inbox: input.team_inbox,
        team_closed: input.team_closed,
        team_all: input.team_all,
        organization: input.organization,
        email: input.email,
        domain: input.domain,
        contact_organization: input.contact_organization,
      }),
      context,
    });
  },
  async get_conversation(input, context) {
    const payload = await requestMissiveJson({
      path: `/v1/conversations/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
      context,
      notFoundAsInvalidInput: true,
    });

    return { conversation: readSingleResource(payload, "conversations") };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, missiveActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestMissiveJson({
      path: missiveValidationPath,
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const record = optionalRecord(payload);
    const users = Array.isArray(record?.users)
      ? record.users.map((user) => optionalRecord(user)).filter((user) => !!user)
      : [];
    const currentUser = users.find((user) => user.me === true);
    const userId = optionalString(currentUser?.id);
    const userEmail = optionalString(currentUser?.email);

    return {
      profile: {
        accountId: userId ? `missive:user:${userId}` : "missive:token",
        displayName: optionalString(currentUser?.display_name) ?? userEmail ?? "Missive API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: missiveApiBaseUrl,
        validationEndpoint: missiveValidationPath,
        userId,
        userEmail,
      }),
    };
  },
};

function paginationQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    limit: input.limit,
    offset: input.offset,
  });
}

function assertListConversationsFilters(input: Record<string, unknown>): void {
  const hasMailboxFilter = missiveMailboxFilterNames.some((key) => optionalBoolean(input[key]) === true);
  const hasScopedMailboxFilter =
    typeof input.shared_label === "string" ||
    typeof input.team_inbox === "string" ||
    typeof input.team_closed === "string" ||
    typeof input.team_all === "string";
  if (!hasMailboxFilter && !hasScopedMailboxFilter) {
    throw new ProviderRequestError(
      400,
      "missive list_conversations requires at least one mailbox, shared_label, or team filter",
    );
  }

  const contactFilters = ["email", "domain", "contact_organization"].filter((key) => typeof input[key] === "string");
  if (contactFilters.length > 1) {
    throw new ProviderRequestError(
      400,
      "missive list_conversations accepts only one of email, domain, or contact_organization",
    );
  }
}

async function requestMissiveJson<T = unknown>(input: MissiveRequestOptions): Promise<T> {
  const url = new URL(input.path, missiveApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url.toString(), {
      method: "GET",
      headers: missiveHeaders(input.context.apiKey),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `missive request failed: ${error.message}` : "missive request failed",
    );
  }

  const payload = await readMissivePayload(response);
  if (!response.ok) {
    throw createMissiveError(response, payload, input.phase ?? "execute", input.notFoundAsInvalidInput === true);
  }

  return payload as T;
}

function missiveHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readMissivePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return {};
  }

  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "missive returned malformed JSON");
  }
}

function readSingleResource(payload: unknown, key: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `invalid missive ${key} response`);
  }

  const value = record[key];
  if (Array.isArray(value)) {
    const first = optionalRecord(value[0]);
    if (first) {
      return first;
    }
  }

  const nested = optionalRecord(value);
  if (nested) {
    return nested;
  }

  throw new ProviderRequestError(502, `missing missive ${key} resource`);
}

function createMissiveError(
  response: Response,
  payload: unknown,
  phase: MissiveRequestPhase,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractMissiveMessage(payload) ?? response.statusText ?? "missive request failed";
  if (response.status === 401 || response.status === 403) {
    return phase === "validate"
      ? new ProviderRequestError(400, message)
      : new ProviderRequestError(response.status, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function extractMissiveMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "error", "errors"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}
