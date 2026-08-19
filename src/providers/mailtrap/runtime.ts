import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { compactJson } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const mailtrapApiBaseUrl = "https://mailtrap.io";
const mailtrapRequestTimeoutMs = 30_000;

type MailtrapPhase = "validate" | "execute";
type MailtrapRequestMethod = "GET" | "POST" | "PATCH" | "DELETE";
type MailtrapQueryValue = string | number | boolean | Array<string | number | boolean> | undefined;

interface MailtrapActionContext {
  apiKey: string;
  accountId?: number;
  accessibleAccountIds?: number[];
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type MailtrapActionHandler = (input: Record<string, unknown>, context: MailtrapActionContext) => Promise<unknown>;

export const mailtrapActionHandlers: ProviderActionHandlers<"mailtrap", MailtrapActionHandler> = {
  async list_accounts(_input, context) {
    return {
      accounts: await listMailtrapAccounts(context, "execute"),
    };
  },
  async list_projects(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    return {
      accountId,
      projects: await requestMailtrapResourceArray({
        ...context,
        path: buildMailtrapAccountPath(accountId, "projects"),
        phase: "execute",
      }),
    };
  },
  async get_project(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    return {
      accountId,
      project: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "projects", requirePositiveIntegerField(input, "projectId")),
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
    };
  },
  async update_project(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    const project = requiredRecord(input.project, "project");
    return {
      accountId,
      project: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "projects", requirePositiveIntegerField(input, "projectId")),
        phase: "execute",
        method: "PATCH",
        body: {
          project: {
            name: requiredString(project.name, "project.name"),
          },
        },
        notFoundAsInvalidInput: true,
      }),
    };
  },
  async delete_project(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    const projectId = requirePositiveIntegerField(input, "projectId");
    await requestMailtrapJson({
      ...context,
      path: buildMailtrapAccountPath(accountId, "projects", projectId),
      phase: "execute",
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return { accountId, projectId, deleted: true };
  },
  async list_inboxes(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    return {
      accountId,
      inboxes: await requestMailtrapResourceArray({
        ...context,
        path: buildMailtrapAccountPath(accountId, "inboxes"),
        phase: "execute",
      }),
    };
  },
  async get_inbox(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    return {
      accountId,
      inbox: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "inboxes", requirePositiveIntegerField(input, "inboxId")),
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
    };
  },
  async update_inbox(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    const inbox = requiredRecord(input.inbox, "inbox");
    return {
      accountId,
      inbox: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "inboxes", requirePositiveIntegerField(input, "inboxId")),
        phase: "execute",
        method: "PATCH",
        body: {
          inbox: compactObject({
            name: optionalString(inbox.name),
            email_username: optionalString(inbox.emailUsername),
          }),
        },
        notFoundAsInvalidInput: true,
      }),
    };
  },
  async clean_inbox(input, context) {
    return patchInboxAction(input, context, "clean");
  },
  async mark_inbox_as_read(input, context) {
    return patchInboxAction(input, context, "all_read");
  },
  async reset_inbox_credentials(input, context) {
    return patchInboxAction(input, context, "reset_credentials");
  },
  async list_messages(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    const inboxId = requirePositiveIntegerField(input, "inboxId");
    return {
      accountId,
      inboxId,
      messages: await requestMailtrapResourceArray({
        ...context,
        path: buildMailtrapAccountPath(accountId, "inboxes", inboxId, "messages"),
        phase: "execute",
        query: buildMailtrapMessageListQuery(input),
      }),
    };
  },
  async get_message(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    const inboxId = requirePositiveIntegerField(input, "inboxId");
    return {
      accountId,
      inboxId,
      message: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(
          accountId,
          "inboxes",
          inboxId,
          "messages",
          requirePositiveIntegerField(input, "messageId"),
        ),
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
    };
  },
  async get_message_html_source(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    const inboxId = requirePositiveIntegerField(input, "inboxId");
    const messageId = requirePositiveIntegerField(input, "messageId");
    return {
      accountId,
      inboxId,
      messageId,
      htmlSource: await requestMailtrapText({
        ...context,
        path: buildMailtrapAccountPath(accountId, "inboxes", inboxId, "messages", messageId, "body.htmlsource"),
        phase: "execute",
        accept: "text/html",
        notFoundAsInvalidInput: true,
      }),
    };
  },
  async create_contact(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    const contact = requiredRecord(input.contact, "contact");
    return {
      accountId,
      contact: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "contacts"),
        phase: "execute",
        method: "POST",
        body: {
          contact: compactJson({
            email: requiredString(contact.email, "contact.email"),
            fields: optionalRecord(contact.fields),
            list_ids: readPositiveIntegerArray(contact.listIds, "contact.listIds"),
          }),
        },
        extract: extractMailtrapDataObject,
      }),
    };
  },
  async get_contact(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    return {
      accountId,
      contact: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(
          accountId,
          "contacts",
          requiredString(input.contactIdentifier, "contactIdentifier"),
        ),
        phase: "execute",
        notFoundAsInvalidInput: true,
        extract: extractMailtrapDataObject,
      }),
    };
  },
  async update_contact(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    const contact = requiredRecord(input.contact, "contact");
    const response = await requestMailtrapResourceObject({
      ...context,
      path: buildMailtrapAccountPath(
        accountId,
        "contacts",
        requiredString(input.contactIdentifier, "contactIdentifier"),
      ),
      phase: "execute",
      method: "PATCH",
      body: {
        contact: compactJson({
          email: optionalString(contact.email),
          fields: optionalRecord(contact.fields),
          list_ids_included: readPositiveIntegerArray(contact.listIdsIncluded, "contact.listIdsIncluded"),
          list_ids_excluded: readPositiveIntegerArray(contact.listIdsExcluded, "contact.listIdsExcluded"),
          unsubscribed: optionalBoolean(contact.unsubscribed),
        }),
      },
      notFoundAsInvalidInput: true,
    });
    const action = optionalString(response.action);
    const updatedContact = optionalRecord(response.data);
    if (!action || !updatedContact) {
      throw new ProviderRequestError(502, "Mailtrap contact update response is missing action or data", response);
    }
    return { accountId, action, contact: updatedContact };
  },
  async delete_contact(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    const contactIdentifier = requiredString(input.contactIdentifier, "contactIdentifier");
    await requestMailtrapJson({
      ...context,
      path: buildMailtrapAccountPath(accountId, "contacts", contactIdentifier),
      phase: "execute",
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return { accountId, contactIdentifier, deleted: true };
  },
  async list_contact_lists(input, context) {
    return listAccountResource(input, context, "contactLists", "contacts", "lists");
  },
  async get_contact_list(input, context) {
    return getAccountResource(input, context, "contactList", [
      "contacts",
      "lists",
      requirePositiveIntegerField(input, "listId"),
    ]);
  },
  async create_contact_list(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    return {
      accountId,
      contactList: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "contacts", "lists"),
        phase: "execute",
        method: "POST",
        body: { name: requiredString(input.name, "name") },
      }),
    };
  },
  async update_contact_list(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    return {
      accountId,
      contactList: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "contacts", "lists", requirePositiveIntegerField(input, "listId")),
        phase: "execute",
        method: "PATCH",
        body: { name: requiredString(input.name, "name") },
        notFoundAsInvalidInput: true,
      }),
    };
  },
  async delete_contact_list(input, context) {
    return deleteAccountResource(input, context, "listId", [
      "contacts",
      "lists",
      requirePositiveIntegerField(input, "listId"),
    ]);
  },
  async list_contact_fields(input, context) {
    return listAccountResource(input, context, "contactFields", "contacts", "fields");
  },
  async get_contact_field(input, context) {
    return getAccountResource(input, context, "contactField", [
      "contacts",
      "fields",
      requirePositiveIntegerField(input, "fieldId"),
    ]);
  },
  async create_contact_field(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    return {
      accountId,
      contactField: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "contacts", "fields"),
        phase: "execute",
        method: "POST",
        body: {
          name: requiredString(input.name, "name"),
          data_type: requiredString(input.dataType, "dataType"),
          merge_tag: requiredString(input.mergeTag, "mergeTag"),
        },
      }),
    };
  },
  async update_contact_field(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    return {
      accountId,
      contactField: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "contacts", "fields", requirePositiveIntegerField(input, "fieldId")),
        phase: "execute",
        method: "PATCH",
        body: compactObject({
          name: optionalString(input.name),
          merge_tag: optionalString(input.mergeTag),
        }),
        notFoundAsInvalidInput: true,
      }),
    };
  },
  async delete_contact_field(input, context) {
    return deleteAccountResource(input, context, "fieldId", [
      "contacts",
      "fields",
      requirePositiveIntegerField(input, "fieldId"),
    ]);
  },
  async import_contacts(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    const contacts = objectArray(input.contacts, "contacts").map((contact) =>
      compactJson({
        email: requiredString(contact.email, "contacts[].email"),
        fields: optionalRecord(contact.fields),
        list_ids_included: readPositiveIntegerArray(contact.listIdsIncluded, "contacts[].listIdsIncluded"),
        list_ids_excluded: readPositiveIntegerArray(contact.listIdsExcluded, "contacts[].listIdsExcluded"),
      }),
    );
    return {
      accountId,
      contactImport: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "contacts", "imports"),
        phase: "execute",
        method: "POST",
        body: { contacts },
      }),
    };
  },
  async get_contact_import(input, context) {
    return getAccountResource(input, context, "contactImport", [
      "contacts",
      "imports",
      requirePositiveIntegerField(input, "importId"),
    ]);
  },
  async create_contact_export(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    return {
      accountId,
      contactExport: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "contacts", "exports"),
        phase: "execute",
        method: "POST",
        body: compactObject({
          filters: input.filters === undefined ? undefined : objectArray(input.filters, "filters"),
        }),
      }),
    };
  },
  async get_contact_export(input, context) {
    return getAccountResource(input, context, "contactExport", [
      "contacts",
      "exports",
      requirePositiveIntegerField(input, "exportId"),
    ]);
  },
  async create_contact_event(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    const contactIdentifier = requiredString(input.contactIdentifier, "contactIdentifier");
    return {
      accountId,
      contactIdentifier,
      contactEvent: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "contacts", contactIdentifier, "events"),
        phase: "execute",
        method: "POST",
        body: compactObject({
          name: requiredString(input.name, "name"),
          params: optionalRecord(input.params),
        }),
        notFoundAsInvalidInput: true,
      }),
    };
  },
  async list_email_templates(input, context) {
    return listAccountResource(input, context, "emailTemplates", "email_templates");
  },
  async get_email_template(input, context) {
    return getAccountResource(input, context, "emailTemplate", [
      "email_templates",
      requirePositiveIntegerField(input, "emailTemplateId"),
    ]);
  },
  async create_email_template(input, context) {
    return writeEmailTemplate(input, context, "POST");
  },
  async update_email_template(input, context) {
    return writeEmailTemplate(input, context, "PATCH");
  },
  async delete_email_template(input, context) {
    return deleteAccountResource(input, context, "emailTemplateId", [
      "email_templates",
      requirePositiveIntegerField(input, "emailTemplateId"),
    ]);
  },
  async list_sending_domains(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    return {
      accountId,
      sendingDomains: await requestMailtrapResourceArray({
        ...context,
        path: buildMailtrapAccountPath(accountId, "sending_domains"),
        phase: "execute",
        extract: extractMailtrapDataArray,
      }),
    };
  },
  async get_sending_domain(input, context) {
    return getAccountResource(input, context, "sendingDomain", [
      "sending_domains",
      requirePositiveIntegerField(input, "sendingDomainId"),
    ]);
  },
  async create_sending_domain(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    const sendingDomain = requiredRecord(input.sendingDomain, "sendingDomain");
    return {
      accountId,
      sendingDomain: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "sending_domains"),
        phase: "execute",
        method: "POST",
        body: {
          sending_domain: {
            domain_name: requiredString(sendingDomain.domainName, "sendingDomain.domainName"),
          },
        },
      }),
    };
  },
  async delete_sending_domain(input, context) {
    return deleteAccountResource(input, context, "sendingDomainId", [
      "sending_domains",
      requirePositiveIntegerField(input, "sendingDomainId"),
    ]);
  },
  async list_suppressions(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    return {
      accountId,
      suppressions: await requestMailtrapResourceArray({
        ...context,
        path: buildMailtrapAccountPath(accountId, "suppressions"),
        phase: "execute",
        query: compactObject({
          email: optionalString(input.email),
          start_time: optionalString(input.startTime),
          end_time: optionalString(input.endTime),
        }),
      }),
    };
  },
  async get_sending_stats(input, context) {
    const accountId = requireMailtrapAccountId(input, context);
    return {
      accountId,
      stats: await requestMailtrapResourceObject({
        ...context,
        path: buildMailtrapAccountPath(accountId, "stats"),
        phase: "execute",
        query: buildMailtrapStatsQuery(input),
      }),
    };
  },
  async get_sending_stats_by_date(input, context) {
    return getStatsArray(input, context, "statsByDate", "date");
  },
  async get_sending_stats_by_domains(input, context) {
    return getStatsArray(input, context, "statsByDomains", "domains");
  },
  async get_sending_stats_by_categories(input, context) {
    return getStatsArray(input, context, "statsByCategories", "categories");
  },
  async get_sending_stats_by_esp(input, context) {
    return getStatsArray(input, context, "statsByEmailServiceProviders", "email_service_providers");
  },
  async get_permission_resources(input, context) {
    return listAccountResource(input, context, "resources", "permissions", "resources");
  },
  async get_billing_usage(input, context) {
    return getAccountResource(input, context, "billingUsage", ["billing", "usage"], false);
  },
};

export async function validateMailtrapCredential(
  input: { apiKey: string; accountId?: string },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const requestedAccountId = parseOptionalMailtrapAccountId(input.accountId);
  const accounts = await listMailtrapAccounts(
    {
      apiKey: input.apiKey,
      fetcher,
      signal,
    },
    "validate",
  );
  const accessibleAccountIds = accounts
    .map((account) => optionalInteger(account.id))
    .filter((value): value is number => value !== undefined);

  if (requestedAccountId !== undefined && !accessibleAccountIds.includes(requestedAccountId)) {
    throw new ProviderRequestError(400, "Mailtrap accountId is not accessible with the provided API token");
  }

  const selectedAccount =
    requestedAccountId !== undefined
      ? accounts.find((account) => optionalInteger(account.id) === requestedAccountId)
      : accounts.length === 1
        ? accounts[0]
        : undefined;
  const selectedAccountId = selectedAccount ? optionalInteger(selectedAccount.id) : undefined;
  const selectedAccountName = selectedAccount ? optionalString(selectedAccount.name) : undefined;

  return {
    profile: {
      accountId: selectedAccountId === undefined ? "mailtrap" : String(selectedAccountId),
      displayName: selectedAccountName ?? "Mailtrap API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: mailtrapApiBaseUrl,
      validationEndpoint: "/api/accounts",
      accountId: selectedAccountId,
      accountName: selectedAccountName,
      accountCount: accounts.length,
      accessibleAccountIds: accessibleAccountIds.length > 0 ? accessibleAccountIds : undefined,
    }),
  };
}

export function readMailtrapAccountId(source: Record<string, unknown> | undefined): number | undefined {
  const value = source?.accountId;
  if (value === undefined) {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, "accountId must be a positive integer");
  }
  return parsed;
}

export function readAccessibleMailtrapAccountIds(source: Record<string, unknown> | undefined): number[] | undefined {
  if (!Array.isArray(source?.accessibleAccountIds)) {
    return undefined;
  }
  const ids = source.accessibleAccountIds
    .map((value) => optionalInteger(value))
    .filter((value): value is number => value !== undefined);
  return ids.length > 0 ? ids : undefined;
}

async function patchInboxAction(input: Record<string, unknown>, context: MailtrapActionContext, action: string) {
  const accountId = requireMailtrapAccountId(input, context);
  return {
    accountId,
    inbox: await requestMailtrapResourceObject({
      ...context,
      path: buildMailtrapAccountPath(accountId, "inboxes", requirePositiveIntegerField(input, "inboxId"), action),
      phase: "execute",
      method: "PATCH",
      notFoundAsInvalidInput: true,
    }),
  };
}

async function listAccountResource(
  input: Record<string, unknown>,
  context: MailtrapActionContext,
  outputKey: string,
  ...segments: Array<string | number>
) {
  const accountId = requireMailtrapAccountId(input, context);
  return {
    accountId,
    [outputKey]: await requestMailtrapResourceArray({
      ...context,
      path: buildMailtrapAccountPath(accountId, ...segments),
      phase: "execute",
    }),
  };
}

async function getAccountResource(
  input: Record<string, unknown>,
  context: MailtrapActionContext,
  outputKey: string,
  segments: Array<string | number>,
  notFoundAsInvalidInput = true,
) {
  const accountId = requireMailtrapAccountId(input, context);
  return {
    accountId,
    [outputKey]: await requestMailtrapResourceObject({
      ...context,
      path: buildMailtrapAccountPath(accountId, ...segments),
      phase: "execute",
      notFoundAsInvalidInput,
    }),
  };
}

async function deleteAccountResource(
  input: Record<string, unknown>,
  context: MailtrapActionContext,
  idKey: string,
  segments: Array<string | number>,
) {
  const accountId = requireMailtrapAccountId(input, context);
  await requestMailtrapJson({
    ...context,
    path: buildMailtrapAccountPath(accountId, ...segments),
    phase: "execute",
    method: "DELETE",
    notFoundAsInvalidInput: true,
  });
  return { accountId, [idKey]: input[idKey], deleted: true };
}

async function writeEmailTemplate(
  input: Record<string, unknown>,
  context: MailtrapActionContext,
  method: "POST" | "PATCH",
) {
  const accountId = requireMailtrapAccountId(input, context);
  const emailTemplate = requiredRecord(input.emailTemplate, "emailTemplate");
  const path =
    method === "POST"
      ? buildMailtrapAccountPath(accountId, "email_templates")
      : buildMailtrapAccountPath(accountId, "email_templates", requirePositiveIntegerField(input, "emailTemplateId"));
  return {
    accountId,
    emailTemplate: await requestMailtrapResourceObject({
      ...context,
      path,
      phase: "execute",
      method,
      body: {
        email_template: compactObject({
          name: optionalString(emailTemplate.name),
          subject: optionalString(emailTemplate.subject),
          category: optionalString(emailTemplate.category),
          body_html: optionalString(emailTemplate.bodyHtml),
          body_text: optionalString(emailTemplate.bodyText),
        }),
      },
      notFoundAsInvalidInput: method === "PATCH",
    }),
  };
}

async function getStatsArray(
  input: Record<string, unknown>,
  context: MailtrapActionContext,
  outputKey: string,
  path: string,
) {
  const accountId = requireMailtrapAccountId(input, context);
  return {
    accountId,
    [outputKey]: await requestMailtrapResourceArray({
      ...context,
      path: buildMailtrapAccountPath(accountId, "stats", path),
      phase: "execute",
      query: buildMailtrapStatsQuery(input),
    }),
  };
}

async function listMailtrapAccounts(
  context: Pick<MailtrapActionContext, "apiKey" | "fetcher" | "signal">,
  phase: MailtrapPhase,
) {
  return requestMailtrapResourceArray({
    ...context,
    path: "/api/accounts",
    phase,
  });
}

async function requestMailtrapResourceArray(
  input: MailtrapRequestOptions & { extract?: (payload: unknown) => unknown },
) {
  const payload = input.extract ? input.extract(await requestMailtrapJson(input)) : await requestMailtrapJson(input);
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Mailtrap response must be an array", payload);
  }
  return payload.map((entry) => requiredRecord(entry, "Mailtrap response item"));
}

async function requestMailtrapResourceObject(
  input: MailtrapRequestOptions & { extract?: (payload: unknown) => unknown },
) {
  const payload = input.extract ? input.extract(await requestMailtrapJson(input)) : await requestMailtrapJson(input);
  return requiredRecord(payload, "Mailtrap response");
}

interface MailtrapRequestOptions {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  phase: MailtrapPhase;
  method?: MailtrapRequestMethod;
  query?: Record<string, MailtrapQueryValue>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
  signal?: AbortSignal;
}

async function requestMailtrapJson(input: MailtrapRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, mailtrapRequestTimeoutMs);
  try {
    const response = await input.fetcher(buildMailtrapUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildMailtrapHeaders(input.apiKey, "application/json", input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readMailtrapPayload(response);
    if (!response.ok) {
      throw createMailtrapError(response, payload, input.phase, input.notFoundAsInvalidInput === true);
    }
    return payload;
  } catch (error) {
    throw normalizeMailtrapTransportError(error, timeout.didTimeout());
  } finally {
    timeout.cleanup();
  }
}

async function requestMailtrapText(input: Omit<MailtrapRequestOptions, "method" | "body"> & { accept: string }) {
  const timeout = createProviderTimeout(input.signal, mailtrapRequestTimeoutMs);
  try {
    const response = await input.fetcher(buildMailtrapUrl(input.path, input.query), {
      method: "GET",
      headers: buildMailtrapHeaders(input.apiKey, input.accept, false),
      signal: timeout.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw createMailtrapError(response, text, input.phase, input.notFoundAsInvalidInput === true);
    }
    return text;
  } catch (error) {
    throw normalizeMailtrapTransportError(error, timeout.didTimeout());
  } finally {
    timeout.cleanup();
  }
}

function buildMailtrapHeaders(apiKey: string, accept: string, hasBody: boolean): Headers {
  const headers = new Headers({
    authorization: `Bearer ${apiKey}`,
    accept,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readMailtrapPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Mailtrap returned invalid JSON");
    }
    return text;
  }
}

function buildMailtrapUrl(path: string, query?: Record<string, MailtrapQueryValue>): string {
  const url = new URL(path, mailtrapApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        url.searchParams.append(key, String(entry));
      }
      continue;
    }
    url.searchParams.append(key, String(value));
  }
  return url.toString();
}

function buildMailtrapAccountPath(accountId: number, ...segments: Array<string | number>): string {
  return `/${["api", "accounts", accountId, ...segments].map((segment) => encodeURIComponent(String(segment))).join("/")}`;
}

function buildMailtrapMessageListQuery(input: Record<string, unknown>): Record<string, MailtrapQueryValue> {
  const lastId = optionalInteger(input.lastId);
  return compactObject({
    search: optionalString(input.search),
    last_id: lastId,
    page: lastId === undefined ? optionalInteger(input.page) : undefined,
  });
}

function buildMailtrapStatsQuery(input: Record<string, unknown>): Record<string, MailtrapQueryValue> {
  return compactObject({
    start_date: requiredString(input.startDate, "startDate"),
    end_date: requiredString(input.endDate, "endDate"),
    "sending_domain_ids[]": readPositiveIntegerArray(input.sendingDomainIds, "sendingDomainIds"),
    "sending_streams[]": readStringArray(input.sendingStreams, "sendingStreams"),
    "categories[]": readStringArray(input.categories, "categories"),
    "email_service_providers[]": readStringArray(input.emailServiceProviders, "emailServiceProviders"),
  });
}

function requireMailtrapAccountId(input: Record<string, unknown>, context: MailtrapActionContext): number {
  const inlineAccountId = optionalInteger(input.accountId);
  const resolvedAccountId = inlineAccountId ?? context.accountId;
  if (resolvedAccountId === undefined) {
    throw new ProviderRequestError(
      400,
      "accountId is required when the Mailtrap connection does not have a default account scope",
    );
  }
  if (context.accessibleAccountIds && !context.accessibleAccountIds.includes(resolvedAccountId)) {
    throw new ProviderRequestError(400, "Mailtrap accountId is not accessible with the provided API token");
  }
  return resolvedAccountId;
}

function requirePositiveIntegerField(input: Record<string, unknown>, fieldName: string): number {
  const value = optionalInteger(input[fieldName]);
  if (value === undefined || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value;
}

function readPositiveIntegerArray(value: unknown, fieldName: string): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((entry, index) => {
    const parsed = optionalInteger(entry);
    if (parsed === undefined || parsed <= 0) {
      throw new ProviderRequestError(400, `${fieldName}[${index}] must be a positive integer`);
    }
    return parsed;
  });
}

function readStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((entry, index) => {
    const normalized = optionalString(entry);
    if (!normalized) {
      throw new ProviderRequestError(400, `${fieldName}[${index}] must be a non-empty string`);
    }
    return normalized;
  });
}

function parseOptionalMailtrapAccountId(value: string | undefined): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, "accountId must be a positive integer");
  }
  return parsed;
}

function extractMailtrapDataObject(payload: unknown): unknown {
  return requiredRecord(requiredRecord(payload, "Mailtrap response").data, "Mailtrap response data");
}

function extractMailtrapDataArray(payload: unknown): unknown {
  const data = requiredRecord(payload, "Mailtrap response").data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, "Mailtrap response data must be an array", payload);
  }
  return data;
}

function createMailtrapError(
  response: Response,
  payload: unknown,
  phase: MailtrapPhase,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = readMailtrapErrorMessage(payload, response.status);
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (
    response.status === 400 ||
    response.status === 409 ||
    response.status === 422 ||
    (response.status === 404 && notFoundAsInvalidInput)
  ) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 500, message, payload);
}

function readMailtrapErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return (
    optionalString(record?.message) ??
    normalizeMailtrapErrors(record?.errors) ??
    optionalString(optionalRecord(record?.error)?.message) ??
    `Mailtrap request failed with status ${status}`
  );
}

function normalizeMailtrapErrors(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const messages = value.map(normalizeMailtrapErrors).filter((entry): entry is string => Boolean(entry));
    return messages.length > 0 ? messages.join("; ") : undefined;
  }
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  const messages = Object.entries(record)
    .map(([key, child]) => {
      const childMessage = normalizeMailtrapErrors(child);
      return childMessage ? `${key}: ${childMessage}` : undefined;
    })
    .filter((entry): entry is string => Boolean(entry));
  return messages.length > 0 ? messages.join("; ") : undefined;
}

function normalizeMailtrapTransportError(error: unknown, didTimeout: boolean): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }
  if (didTimeout || isAbortLikeError(error)) {
    return new ProviderRequestError(
      504,
      `Mailtrap request timed out after ${Math.ceil(mailtrapRequestTimeoutMs / 1000)} seconds`,
    );
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `Mailtrap request failed: ${error.message}` : "Mailtrap request failed",
  );
}
