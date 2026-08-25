import { compactObject, optionalBoolean, optionalInteger, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const helpscoutRequestTimeoutMs = 30_000;

class HelpscoutError extends ProviderRequestError {
  constructor(_code: string, message: string, status: number, _cause?: unknown, details?: unknown) {
    super(status, message, details);
  }
}

interface HelpscoutActionContext {
  accessToken: string;
  fetcher: typeof fetch;
}

interface HelpscoutRequestOptions extends HelpscoutActionContext {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  apiVersion?: 2 | 3;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  phase?: "account" | "action";
}

type HelpscoutActionHandler = (input: Record<string, unknown>, context: HelpscoutActionContext) => Promise<unknown>;

export const helpscoutActionHandlers: Record<string, HelpscoutActionHandler> = {
  list_inboxes(input, context) {
    return executeCollectionRequest(
      "/mailboxes",
      "mailboxes",
      context,
      { page: optionalInteger(input.page) },
      2,
      "inboxes",
    );
  },

  list_inbox_folders(input, context) {
    const inboxId = requirePositiveInteger(input.inboxId, "inboxId");
    return executeCollectionRequest(`/mailboxes/${inboxId}/folders`, "folders", context, {});
  },

  list_inbox_custom_fields(input, context) {
    const inboxId = requirePositiveInteger(input.inboxId, "inboxId");
    return executeCollectionRequest(`/mailboxes/${inboxId}/fields`, "fields", context, {});
  },

  async list_saved_replies(input, context) {
    const inboxId = requirePositiveInteger(input.inboxId, "inboxId");
    const { payload } = await requestHelpscout({
      ...context,
      path: `/mailboxes/${inboxId}/saved-replies`,
      query: { includeChatReplies: optionalBoolean(input.includeChatReplies) },
    });
    const root = readProviderObject(payload);
    const embedded = root ? readProviderObject(root._embedded) : undefined;
    const savedReplies = Array.isArray(payload)
      ? payload
      : (embedded?.savedReplies ?? embedded?.["saved-replies"] ?? root?.savedReplies);
    if (!Array.isArray(savedReplies)) {
      throw new HelpscoutError("provider_error", "Help Scout saved replies response is not an array", 502);
    }
    return {
      savedReplies: savedReplies.map((item, index) => requireProviderObject(item, `Help Scout savedReplies[${index}]`)),
    };
  },

  async get_saved_reply(input, context) {
    const inboxId = requirePositiveInteger(input.inboxId, "inboxId");
    const savedReplyId = requirePositiveInteger(input.savedReplyId, "savedReplyId");
    const { payload } = await requestHelpscout({
      ...context,
      path: `/mailboxes/${inboxId}/saved-replies/${savedReplyId}`,
    });
    return { savedReply: requireProviderObject(payload, "Help Scout saved reply response") };
  },

  list_users(input, context) {
    return executeCollectionRequest("/users", "users", context, {
      email: readOptionalTrimmedString(input.email),
      mailbox: optionalInteger(input.inboxId),
      page: optionalInteger(input.page),
    });
  },

  list_tags(input, context) {
    return executeCollectionRequest("/tags", "tags", context, {
      page: optionalInteger(input.page),
    });
  },

  list_workflows(input, context) {
    return executeCollectionRequest("/workflows", "workflows", context, {
      mailboxId: optionalInteger(input.inboxId),
      type: readOptionalTrimmedString(input.type),
      page: optionalInteger(input.page),
    });
  },

  list_conversations(input, context) {
    return executeCollectionRequest("/conversations", "conversations", context, {
      page: optionalInteger(input.page),
      mailbox: joinNumberArray(input.inboxIds),
      folder: optionalInteger(input.folderId),
      status: readOptionalTrimmedString(input.status),
      tag: joinStringArray(input.tagNames),
      assigned_to: optionalInteger(input.assignedUserId),
      number: optionalInteger(input.conversationNumber),
      modifiedSince: readOptionalTrimmedString(input.modifiedSince),
      query: readOptionalTrimmedString(input.query),
      sortField: readOptionalTrimmedString(input.sortField),
      sortOrder: readOptionalTrimmedString(input.sortOrder),
      embed: optionalBoolean(input.embedThreads) ? "threads" : undefined,
    });
  },

  async get_conversation(input, context) {
    const conversationId = requirePositiveInteger(input.conversationId, "conversationId");
    const { payload } = await requestHelpscout({
      ...context,
      path: `/conversations/${conversationId}`,
      apiVersion: 3,
      query: {
        embed: optionalBoolean(input.embedThreads) ? "threads" : undefined,
      },
    });
    return {
      conversation: requireProviderObject(payload, "Help Scout conversation response"),
    };
  },

  list_threads(input, context) {
    const conversationId = requirePositiveInteger(input.conversationId, "conversationId");
    return executeCollectionRequest(
      `/conversations/${conversationId}/threads`,
      "threads",
      context,
      { page: optionalInteger(input.page) },
      3,
    );
  },

  list_customers(input, context) {
    const email = readOptionalTrimmedString(input.email);
    return executeCollectionRequest("/customers", "customers", context, {
      page: optionalInteger(input.page),
      mailbox: optionalInteger(input.inboxId),
      firstName: readOptionalTrimmedString(input.firstName),
      lastName: readOptionalTrimmedString(input.lastName),
      modifiedSince: readOptionalTrimmedString(input.modifiedSince),
      sortField: readOptionalTrimmedString(input.sortField),
      sortOrder: readOptionalTrimmedString(input.sortOrder),
      query: email ? `(email:${JSON.stringify(email)})` : undefined,
    });
  },

  async get_customer(input, context) {
    const customerId = requirePositiveInteger(input.customerId, "customerId");
    const { payload } = await requestHelpscout({
      ...context,
      path: `/customers/${customerId}`,
    });
    return {
      customer: requireProviderObject(payload, "Help Scout customer response"),
    };
  },

  async create_customer(input, context) {
    const { response } = await requestHelpscout({
      ...context,
      path: "/customers",
      method: "POST",
      body: compactObject({
        firstName: readOptionalTrimmedString(input.firstName),
        lastName: readOptionalTrimmedString(input.lastName),
        phone: readOptionalTrimmedString(input.phone),
        jobTitle: readOptionalTrimmedString(input.jobTitle),
        location: readOptionalTrimmedString(input.location),
        background: readOptionalTrimmedString(input.background),
        organizationId: optionalInteger(input.organizationId),
        emails: [
          {
            type: readOptionalTrimmedString(input.emailType) ?? "work",
            value: requireNonEmptyString(input.email, "email"),
          },
        ],
      }),
    });
    return {
      created: true,
      customerId: response.headers.get("resource-id"),
      location: response.headers.get("location"),
    };
  },

  async create_conversation(input, context) {
    const customer = buildCustomerIdentifier(input);
    const threadType = readOptionalTrimmedString(input.threadType) ?? "customer";
    const thread = compactObject({
      type: threadType,
      text: requireNonEmptyString(input.text, "text"),
      customer: threadType === "note" ? undefined : customer,
    });
    const { response } = await requestHelpscout({
      ...context,
      path: "/conversations",
      method: "POST",
      body: compactObject({
        subject: requireNonEmptyString(input.subject, "subject"),
        mailboxId: requirePositiveInteger(input.inboxId, "inboxId"),
        customer,
        type: readOptionalTrimmedString(input.type) ?? "email",
        status: readOptionalTrimmedString(input.status) ?? "active",
        threads: [thread],
        user: optionalInteger(input.userId),
        assignTo: optionalInteger(input.assignedUserId),
        autoReply: optionalBoolean(input.autoReply),
        tags: readOptionalStringArray(input.tagNames, "tagNames"),
        fields: readOptionalCustomFields(input.customFields),
      }),
    });
    return {
      created: true,
      conversationId: response.headers.get("resource-id"),
      location: response.headers.get("location"),
      webLocation: response.headers.get("web-location"),
    };
  },

  async create_reply(input, context) {
    const conversationId = requirePositiveInteger(input.conversationId, "conversationId");
    const { response } = await requestHelpscout({
      ...context,
      path: `/conversations/${conversationId}/reply`,
      method: "POST",
      body: compactObject({
        customer: { id: requirePositiveInteger(input.customerId, "customerId") },
        text: requireNonEmptyString(input.text, "text"),
        draft: optionalBoolean(input.draft),
        user: optionalInteger(input.userId),
        cc: readOptionalStringArray(input.cc, "cc"),
        bcc: readOptionalStringArray(input.bcc, "bcc"),
      }),
    });
    return {
      created: true,
      threadId: response.headers.get("resource-id"),
    };
  },

  async create_note(input, context) {
    const conversationId = requirePositiveInteger(input.conversationId, "conversationId");
    const { response } = await requestHelpscout({
      ...context,
      path: `/conversations/${conversationId}/notes`,
      method: "POST",
      body: compactObject({
        text: requireNonEmptyString(input.text, "text"),
        user: optionalInteger(input.userId),
      }),
    });
    return {
      created: true,
      threadId: response.headers.get("resource-id"),
    };
  },

  async run_manual_workflow(input, context) {
    const workflowId = requirePositiveInteger(input.workflowId, "workflowId");
    const conversationIds = requirePositiveIntegerArray(input.conversationIds, "conversationIds");
    await requestHelpscout({
      ...context,
      path: `/workflows/${workflowId}/run`,
      method: "POST",
      body: { conversationIds },
    });
    return { executed: true, workflowId, conversationIds };
  },

  async replace_conversation_custom_fields(input, context) {
    const conversationId = requirePositiveInteger(input.conversationId, "conversationId");
    const customFields = requireCustomFields(input.customFields, "customFields");
    await requestHelpscout({
      ...context,
      path: `/conversations/${conversationId}/fields`,
      method: "PUT",
      body: { fields: customFields },
    });
    return { updated: true, conversationId, customFields };
  },

  async snooze_conversation(input, context) {
    const conversationId = requirePositiveInteger(input.conversationId, "conversationId");
    const snoozedUntil = requireNonEmptyString(input.snoozedUntil, "snoozedUntil");
    const unsnoozeOnCustomerReply = requireBoolean(input.unsnoozeOnCustomerReply, "unsnoozeOnCustomerReply");
    await requestHelpscout({
      ...context,
      path: `/conversations/${conversationId}/snooze`,
      method: "PUT",
      body: { snoozedUntil, unsnoozeOnCustomerReply },
    });
    return { updated: true, conversationId, snoozedUntil, unsnoozeOnCustomerReply };
  },

  async unsnooze_conversation(input, context) {
    const conversationId = requirePositiveInteger(input.conversationId, "conversationId");
    await requestHelpscout({
      ...context,
      path: `/conversations/${conversationId}/snooze`,
      method: "DELETE",
    });
    return { updated: true, conversationId };
  },

  async set_conversation_status(input, context) {
    const conversationId = requirePositiveInteger(input.conversationId, "conversationId");
    const status = requireNonEmptyString(input.status, "status");
    await requestHelpscout({
      ...context,
      path: `/conversations/${conversationId}`,
      method: "PATCH",
      body: { op: "replace", path: "/status", value: status },
    });
    return { updated: true, conversationId, status };
  },

  async assign_conversation(input, context) {
    const conversationId = requirePositiveInteger(input.conversationId, "conversationId");
    const assignedUserId =
      input.assignedUserId === null ? null : requirePositiveInteger(input.assignedUserId, "assignedUserId");
    await requestHelpscout({
      ...context,
      path: `/conversations/${conversationId}`,
      method: "PATCH",
      body:
        assignedUserId === null
          ? { op: "remove", path: "/assignTo" }
          : { op: "replace", path: "/assignTo", value: assignedUserId },
    });
    return { updated: true, conversationId, assignedUserId };
  },

  async replace_conversation_tags(input, context) {
    const conversationId = requirePositiveInteger(input.conversationId, "conversationId");
    const tagNames = requireStringArray(input.tagNames, "tagNames");
    await requestHelpscout({
      ...context,
      path: `/conversations/${conversationId}/tags`,
      method: "PUT",
      body: { tags: tagNames },
    });
    return { updated: true, conversationId, tagNames };
  },
} satisfies Record<string, HelpscoutActionHandler>;

export async function fetchHelpscoutCurrentUser(
  accessToken: string,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const { payload } = await requestHelpscout({
    accessToken,
    fetcher,
    path: "/users/me",
    phase: "account",
  });
  return requireProviderObject(payload, "Help Scout current user response");
}

async function executeCollectionRequest(
  path: string,
  envelopeKey: string,
  context: HelpscoutActionContext,
  query: Record<string, string | number | boolean | undefined>,
  apiVersion: 2 | 3 = 2,
  outputKey = envelopeKey,
) {
  const { payload } = await requestHelpscout({ ...context, path, query, apiVersion });
  const root = requireProviderObject(payload, `Help Scout ${envelopeKey} response`);
  const embedded = readProviderObject(root._embedded);
  const collection = embedded?.[envelopeKey] ?? root[envelopeKey];
  if (!Array.isArray(collection)) {
    throw new HelpscoutError(
      "provider_error",
      `Help Scout ${envelopeKey} response is missing _embedded.${envelopeKey}`,
      502,
    );
  }
  return {
    [outputKey]: collection.map((item, index) => requireProviderObject(item, `Help Scout ${envelopeKey}[${index}]`)),
    page: readProviderObject(root.page) ?? null,
  };
}

async function requestHelpscout(options: HelpscoutRequestOptions) {
  const version = options.apiVersion ?? 2;
  const path = options.path.startsWith("/") ? options.path : `/${options.path}`;
  const url = new URL(`/v${version}${path}`, "https://api.helpscout.net");
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/hal+json, application/json",
    authorization: `Bearer ${options.accessToken}`,
    "user-agent": providerUserAgent,
  });
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const timeoutHandle = createProviderTimeout(undefined, helpscoutRequestTimeoutMs);
  try {
    const response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: timeoutHandle.signal,
    });

    const payload = await readHelpscoutPayload(response);
    if (!response.ok) {
      throw createHelpscoutError(response, payload, options.phase ?? "action");
    }
    return { response, payload };
  } catch (error) {
    if (error instanceof HelpscoutError) {
      throw error;
    }
    if (timeoutHandle.didTimeout()) {
      throw new HelpscoutError("provider_error", "Help Scout request timed out", 504);
    }
    throw new HelpscoutError(
      "provider_error",
      error instanceof Error ? `Help Scout request failed: ${error.message}` : "Help Scout request failed",
      502,
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

async function readHelpscoutPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createHelpscoutError(response: Response, payload: unknown, phase: "account" | "action") {
  const message =
    extractHelpscoutErrorMessage(payload) ||
    response.statusText ||
    `Help Scout request failed with status ${response.status}`;
  const errorCode =
    response.status === 401 || (phase === "account" && response.status === 403)
      ? "credential_expired"
      : response.status === 429
        ? "rate_limited"
        : response.status >= 400 && response.status < 500
          ? "invalid_input"
          : "provider_error";
  return new HelpscoutError(errorCode, message, errorCode === "provider_error" ? 502 : response.status);
}

function extractHelpscoutErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const root = readProviderObject(payload);
  if (!root) return undefined;
  const embedded = readProviderObject(root._embedded);
  const nestedMessage = extractHelpscoutValidationMessage(embedded?.errors);
  if (nestedMessage) return nestedMessage;
  const rootErrorMessage = extractHelpscoutValidationMessage(root.errors);
  if (rootErrorMessage) return rootErrorMessage;
  const direct = optionalString(root.message) ?? optionalString(root.error_description) ?? optionalString(root.error);
  if (direct?.trim()) return direct.trim();
  return undefined;
}

function extractHelpscoutValidationMessage(value: unknown) {
  const errors = Array.isArray(value) ? value : [];
  for (const item of errors) {
    if (typeof item === "string" && item.trim()) return item.trim();
    const object = readProviderObject(item);
    const message = object ? optionalString(object.message) : undefined;
    if (message?.trim()) {
      const path = optionalString(object?.path)?.trim();
      return path ? `${path}: ${message.trim()}` : message.trim();
    }
  }
  return undefined;
}

function buildCustomerIdentifier(input: Record<string, unknown>) {
  const customerId = optionalInteger(input.customerId);
  if (customerId !== undefined) {
    return { id: requirePositiveInteger(customerId, "customerId") };
  }
  return compactObject({
    email: requireNonEmptyString(input.customerEmail, "customerEmail"),
    firstName: readOptionalTrimmedString(input.customerFirstName),
    lastName: readOptionalTrimmedString(input.customerLastName),
  });
}

function readProviderObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function requireProviderObject(value: unknown, context: string) {
  const object = readProviderObject(value);
  if (!object) {
    throw new HelpscoutError("provider_error", `${context} is not an object`, 502);
  }
  return object;
}

function readOptionalTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function requireNonEmptyString(value: unknown, fieldName: string) {
  const stringValue = readOptionalTrimmedString(value);
  if (!stringValue) {
    throw new HelpscoutError("invalid_input", `${fieldName} is required`, 400);
  }
  return stringValue;
}

function requirePositiveInteger(value: unknown, fieldName: string) {
  const numberValue = optionalInteger(value);
  if (numberValue === undefined || numberValue <= 0) {
    throw new HelpscoutError("invalid_input", `${fieldName} must be a positive integer`, 400);
  }
  return numberValue;
}

function requireBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new HelpscoutError("invalid_input", `${fieldName} must be a boolean`, 400);
  }
  return value;
}

function readOptionalCustomFields(value: unknown) {
  return value === undefined ? undefined : requireCustomFields(value, "customFields");
}

function requireCustomFields(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new HelpscoutError("invalid_input", `${fieldName} must be an array`, 400);
  }
  return value.map((item, index) => {
    const object = readProviderObject(item);
    if (!object) {
      throw new HelpscoutError("invalid_input", `${fieldName}[${index}] must be an object`, 400);
    }
    return {
      id: requirePositiveInteger(object.id, `${fieldName}[${index}].id`),
      value: typeof object.value === "string" ? object.value : String(object.value ?? ""),
    };
  });
}

function requirePositiveIntegerArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new HelpscoutError("invalid_input", `${fieldName} must be an integer array`, 400);
  }
  return value.map((item, index) => requirePositiveInteger(item, `${fieldName}[${index}]`));
}

function readOptionalStringArray(value: unknown, fieldName: string) {
  return value === undefined ? undefined : requireStringArray(value, fieldName);
}

function requireStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new HelpscoutError("invalid_input", `${fieldName} must be a string array`, 400);
  }
  return value.map((item) => item.trim());
}

function joinStringArray(value: unknown) {
  const items = readOptionalStringArray(value, "tagNames");
  return items?.join(",");
}

function joinNumberArray(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new HelpscoutError("invalid_input", "inboxIds must be an integer array", 400);
  }
  return value.map((item) => requirePositiveInteger(item, "inboxIds")).join(",");
}
