import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export type MailtrapActionName =
  | "list_accounts"
  | "list_projects"
  | "get_project"
  | "update_project"
  | "delete_project"
  | "list_inboxes"
  | "get_inbox"
  | "update_inbox"
  | "clean_inbox"
  | "mark_inbox_as_read"
  | "reset_inbox_credentials"
  | "list_messages"
  | "get_message"
  | "get_message_html_source"
  | "create_contact"
  | "get_contact"
  | "update_contact"
  | "delete_contact"
  | "list_contact_lists"
  | "get_contact_list"
  | "create_contact_list"
  | "update_contact_list"
  | "delete_contact_list"
  | "list_contact_fields"
  | "get_contact_field"
  | "create_contact_field"
  | "update_contact_field"
  | "delete_contact_field"
  | "import_contacts"
  | "get_contact_import"
  | "create_contact_export"
  | "get_contact_export"
  | "create_contact_event"
  | "list_email_templates"
  | "get_email_template"
  | "create_email_template"
  | "update_email_template"
  | "delete_email_template"
  | "list_sending_domains"
  | "get_sending_domain"
  | "create_sending_domain"
  | "delete_sending_domain"
  | "list_suppressions"
  | "get_sending_stats"
  | "get_sending_stats_by_date"
  | "get_sending_stats_by_domains"
  | "get_sending_stats_by_categories"
  | "get_sending_stats_by_esp"
  | "get_permission_resources"
  | "get_billing_usage";

const service = "mailtrap";

const accountIdSchema = s.positiveInteger("Mailtrap account ID. Omit when the connection has a default account scope.");
const projectIdSchema = s.positiveInteger("Mailtrap project ID.");
const inboxIdSchema = s.positiveInteger("Mailtrap inbox ID.");
const messageIdSchema = s.positiveInteger("Mailtrap message ID.");
const listIdSchema = s.positiveInteger("Mailtrap contact list ID.");
const fieldIdSchema = s.positiveInteger("Mailtrap contact field ID.");
const importIdSchema = s.positiveInteger("Mailtrap contact import ID.");
const exportIdSchema = s.positiveInteger("Mailtrap contact export ID.");
const emailTemplateIdSchema = s.positiveInteger("Mailtrap email template ID.");
const sendingDomainIdSchema = s.positiveInteger("Mailtrap sending domain ID.");
const contactIdentifierSchema = s.nonEmptyString(
  "Mailtrap contact UUID or email address. Email values are URL-encoded by the runtime.",
);

const accountScopedProperties = {
  accountId: accountIdSchema,
};

const optionalAccount = ["accountId"];

const resourceObject = (description: string): JsonSchema => s.unknownObject(description);
const resourceArray = (description: string, itemDescription: string): JsonSchema =>
  s.array(description, resourceObject(itemDescription));

const accountOutput = {
  accountId: s.positiveInteger("Mailtrap account ID used for the request."),
};

const accountScopedInput = (
  description: string,
  properties: Record<string, JsonSchema> = {},
  optional: string[] = [],
): JsonSchema =>
  s.object(description, { ...accountScopedProperties, ...properties }, { optional: [...optionalAccount, ...optional] });

const idInput = (description: string, idName: string, idSchema: JsonSchema): JsonSchema =>
  accountScopedInput(description, { [idName]: idSchema });

const deletedOutput = (idName: string, idSchema: JsonSchema): JsonSchema =>
  s.object("Mailtrap delete result.", {
    ...accountOutput,
    [idName]: idSchema,
    deleted: s.boolean("Whether Mailtrap accepted the delete request."),
  });

const projectUpdateSchema = s.object("Mailtrap project fields to update.", {
  name: s.string("New Mailtrap project name.", { minLength: 2, maxLength: 100 }),
});

const inboxUpdateSchema = s.object(
  "Mailtrap inbox fields to update.",
  {
    name: s.nonEmptyString("New Mailtrap inbox name."),
    emailUsername: s.nonEmptyString("New Mailtrap inbox email username."),
  },
  { optional: ["name", "emailUsername"] },
);

const contactListIdsSchema = s.array("Mailtrap contact list IDs.", s.positiveInteger("One Mailtrap contact list ID."), {
  minItems: 1,
});

const contactCreateSchema = s.object(
  "Mailtrap contact fields for creation.",
  {
    email: s.email("Contact email address."),
    fields: s.unknownObject("Mailtrap contact custom fields keyed by merge tag."),
    listIds: contactListIdsSchema,
  },
  { optional: ["fields", "listIds"] },
);

const contactUpdateSchema = s.object(
  "Mailtrap contact fields to update.",
  {
    email: s.email("New contact email address."),
    fields: s.unknownObject("Mailtrap contact custom fields keyed by merge tag."),
    listIdsIncluded: contactListIdsSchema,
    listIdsExcluded: contactListIdsSchema,
    unsubscribed: s.boolean("Whether to unsubscribe the contact."),
  },
  { optional: ["email", "fields", "listIdsIncluded", "listIdsExcluded", "unsubscribed"] },
);

const contactImportItemSchema = s.object(
  "One contact record to import into Mailtrap.",
  {
    email: s.email("Contact email address."),
    fields: s.unknownObject("Mailtrap contact custom fields keyed by merge tag."),
    listIdsIncluded: contactListIdsSchema,
    listIdsExcluded: contactListIdsSchema,
  },
  { optional: ["fields", "listIdsIncluded", "listIdsExcluded"] },
);

const contactExportFilterSchema = s.unknownObject("One Mailtrap contact export filter object.");

const emailTemplateSchema = s.object(
  "Mailtrap email template fields.",
  {
    name: s.string("Template name.", { minLength: 1, maxLength: 255 }),
    subject: s.string("Template subject line.", { minLength: 1 }),
    category: s.string("Template category.", { minLength: 1 }),
    bodyHtml: s.string("HTML body content.", { minLength: 1 }),
    bodyText: s.string("Plain-text body content.", { minLength: 1 }),
  },
  { optional: ["name", "subject", "category", "bodyHtml", "bodyText"] },
);

const sendingDomainSchema = s.object("Mailtrap sending domain fields.", {
  domainName: s.nonEmptyString("Domain name to register in Mailtrap."),
});

const statsQueryProperties = {
  startDate: s.date("Stats start date in YYYY-MM-DD format."),
  endDate: s.date("Stats end date in YYYY-MM-DD format."),
  sendingDomainIds: s.array("Sending domain IDs to include.", s.positiveInteger("One Mailtrap sending domain ID."), {
    minItems: 1,
  }),
  sendingStreams: s.array(
    "Mailtrap sending streams to include.",
    s.stringEnum("One Mailtrap sending stream.", ["transactional", "bulk"]),
    { minItems: 1 },
  ),
  categories: s.stringArray("Mailtrap sending categories to include.", { minItems: 1 }),
  emailServiceProviders: s.stringArray("Email service provider names to include.", { minItems: 1 }),
};

const statsQueryOptionalKeys = [
  "accountId",
  "sendingDomainIds",
  "sendingStreams",
  "categories",
  "emailServiceProviders",
];

const statsInput = (description: string): JsonSchema =>
  s.object(description, { ...accountScopedProperties, ...statsQueryProperties }, { optional: statsQueryOptionalKeys });

interface MailtrapActionSpec {
  name: MailtrapActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const specs: MailtrapActionSpec[] = [
  {
    name: "list_accounts",
    operationType: "read",
    description: "List Mailtrap accounts accessible to the API token.",
    inputSchema: s.object("No input is required to list Mailtrap accounts.", {}),
    outputSchema: s.object("Mailtrap accounts response.", {
      accounts: resourceArray("Accessible Mailtrap accounts.", "One Mailtrap account."),
    }),
  },
  {
    name: "list_projects",
    operationType: "read",
    description: "List Mailtrap projects in an account.",
    inputSchema: accountScopedInput("Mailtrap account scope for listing projects."),
    outputSchema: s.object("Mailtrap projects response.", {
      ...accountOutput,
      projects: resourceArray("Mailtrap projects returned by the API.", "One Mailtrap project."),
    }),
  },
  {
    name: "get_project",
    operationType: "read",
    description: "Retrieve one Mailtrap project.",
    inputSchema: idInput("Mailtrap project lookup input.", "projectId", projectIdSchema),
    outputSchema: s.object("Mailtrap project response.", {
      ...accountOutput,
      project: resourceObject("Mailtrap project returned by the API."),
    }),
  },
  {
    name: "update_project",
    operationType: "write",
    description: "Update one Mailtrap project name.",
    inputSchema: accountScopedInput("Mailtrap project update input.", {
      projectId: projectIdSchema,
      project: projectUpdateSchema,
    }),
    outputSchema: s.object("Mailtrap project update response.", {
      ...accountOutput,
      project: resourceObject("Updated Mailtrap project."),
    }),
  },
  {
    name: "delete_project",
    operationType: "destructive",
    description: "Delete one Mailtrap project.",
    inputSchema: idInput("Mailtrap project delete input.", "projectId", projectIdSchema),
    outputSchema: deletedOutput("projectId", projectIdSchema),
  },
  {
    name: "list_inboxes",
    operationType: "read",
    description: "List Mailtrap sandboxes or inboxes in an account.",
    inputSchema: accountScopedInput("Mailtrap account scope for listing inboxes."),
    outputSchema: s.object("Mailtrap inboxes response.", {
      ...accountOutput,
      inboxes: resourceArray("Mailtrap inboxes returned by the API.", "One Mailtrap inbox."),
    }),
  },
  {
    name: "get_inbox",
    operationType: "read",
    description: "Retrieve one Mailtrap inbox.",
    inputSchema: idInput("Mailtrap inbox lookup input.", "inboxId", inboxIdSchema),
    outputSchema: s.object("Mailtrap inbox response.", {
      ...accountOutput,
      inbox: resourceObject("Mailtrap inbox returned by the API."),
    }),
  },
  {
    name: "update_inbox",
    operationType: "write",
    description: "Update a Mailtrap inbox name or email username.",
    inputSchema: accountScopedInput("Mailtrap inbox update input.", {
      inboxId: inboxIdSchema,
      inbox: inboxUpdateSchema,
    }),
    outputSchema: s.object("Mailtrap inbox update response.", {
      ...accountOutput,
      inbox: resourceObject("Updated Mailtrap inbox."),
    }),
  },
  {
    name: "clean_inbox",
    operationType: "destructive",
    description: "Clean all messages from a Mailtrap inbox.",
    inputSchema: idInput("Mailtrap inbox clean input.", "inboxId", inboxIdSchema),
    outputSchema: s.object("Mailtrap inbox clean response.", {
      ...accountOutput,
      inbox: resourceObject("Cleaned Mailtrap inbox."),
    }),
  },
  {
    name: "mark_inbox_as_read",
    operationType: "write",
    description: "Mark all messages in a Mailtrap inbox as read.",
    inputSchema: idInput("Mailtrap mark-inbox-as-read input.", "inboxId", inboxIdSchema),
    outputSchema: s.object("Mailtrap mark-inbox-as-read response.", {
      ...accountOutput,
      inbox: resourceObject("Updated Mailtrap inbox."),
    }),
  },
  {
    name: "reset_inbox_credentials",
    operationType: "destructive",
    description: "Reset SMTP credentials for a Mailtrap inbox.",
    inputSchema: idInput("Mailtrap inbox credential reset input.", "inboxId", inboxIdSchema),
    outputSchema: s.object("Mailtrap inbox credential reset response.", {
      ...accountOutput,
      inbox: resourceObject("Updated Mailtrap inbox."),
    }),
  },
  {
    name: "list_messages",
    operationType: "read",
    description: "List messages in a Mailtrap inbox.",
    inputSchema: accountScopedInput(
      "Mailtrap message list input.",
      {
        inboxId: inboxIdSchema,
        search: s.nonEmptyString("Search query for filtering messages."),
        lastId: s.positiveInteger("Last message ID cursor."),
        page: s.positiveInteger("Page number when lastId is not used."),
      },
      ["search", "lastId", "page"],
    ),
    outputSchema: s.object("Mailtrap messages response.", {
      ...accountOutput,
      inboxId: inboxIdSchema,
      messages: resourceArray("Mailtrap messages returned by the API.", "One Mailtrap message."),
    }),
  },
  {
    name: "get_message",
    operationType: "read",
    description: "Retrieve one message from a Mailtrap inbox.",
    inputSchema: accountScopedInput("Mailtrap message lookup input.", {
      inboxId: inboxIdSchema,
      messageId: messageIdSchema,
    }),
    outputSchema: s.object("Mailtrap message response.", {
      ...accountOutput,
      inboxId: inboxIdSchema,
      message: resourceObject("Mailtrap message returned by the API."),
    }),
  },
  {
    name: "get_message_html_source",
    operationType: "read",
    description: "Retrieve the HTML source body for one Mailtrap message.",
    inputSchema: accountScopedInput("Mailtrap message HTML-source input.", {
      inboxId: inboxIdSchema,
      messageId: messageIdSchema,
    }),
    outputSchema: s.object("Mailtrap message HTML-source response.", {
      ...accountOutput,
      inboxId: inboxIdSchema,
      messageId: messageIdSchema,
      htmlSource: s.string("Raw HTML source returned by Mailtrap."),
    }),
  },
  {
    name: "create_contact",
    operationType: "write",
    description: "Create a Mailtrap contact.",
    inputSchema: accountScopedInput("Mailtrap contact create input.", {
      contact: contactCreateSchema,
    }),
    outputSchema: s.object("Mailtrap contact create response.", {
      ...accountOutput,
      contact: resourceObject("Created Mailtrap contact."),
    }),
  },
  {
    name: "get_contact",
    operationType: "read",
    description: "Retrieve a Mailtrap contact by UUID or email address.",
    inputSchema: accountScopedInput("Mailtrap contact lookup input.", {
      contactIdentifier: contactIdentifierSchema,
    }),
    outputSchema: s.object("Mailtrap contact response.", {
      ...accountOutput,
      contact: resourceObject("Mailtrap contact returned by the API."),
    }),
  },
  {
    name: "update_contact",
    operationType: "write",
    description: "Update a Mailtrap contact.",
    inputSchema: accountScopedInput("Mailtrap contact update input.", {
      contactIdentifier: contactIdentifierSchema,
      contact: contactUpdateSchema,
    }),
    outputSchema: s.object("Mailtrap contact update response.", {
      ...accountOutput,
      action: s.nonEmptyString("Mailtrap contact update action."),
      contact: resourceObject("Updated Mailtrap contact."),
    }),
  },
  {
    name: "delete_contact",
    operationType: "destructive",
    description: "Delete a Mailtrap contact.",
    inputSchema: accountScopedInput("Mailtrap contact delete input.", {
      contactIdentifier: contactIdentifierSchema,
    }),
    outputSchema: s.object("Mailtrap contact delete response.", {
      ...accountOutput,
      contactIdentifier: contactIdentifierSchema,
      deleted: s.boolean("Whether Mailtrap accepted the delete request."),
    }),
  },
  {
    name: "list_contact_lists",
    operationType: "read",
    description: "List Mailtrap contact lists.",
    inputSchema: accountScopedInput("Mailtrap contact-list list input."),
    outputSchema: s.object("Mailtrap contact lists response.", {
      ...accountOutput,
      contactLists: resourceArray("Mailtrap contact lists returned by the API.", "One Mailtrap contact list."),
    }),
  },
  {
    name: "get_contact_list",
    operationType: "read",
    description: "Retrieve one Mailtrap contact list.",
    inputSchema: idInput("Mailtrap contact-list lookup input.", "listId", listIdSchema),
    outputSchema: s.object("Mailtrap contact-list response.", {
      ...accountOutput,
      contactList: resourceObject("Mailtrap contact list returned by the API."),
    }),
  },
  {
    name: "create_contact_list",
    operationType: "write",
    description: "Create a Mailtrap contact list.",
    inputSchema: accountScopedInput("Mailtrap contact-list create input.", {
      name: s.string("Mailtrap contact-list name.", { minLength: 1, maxLength: 255 }),
    }),
    outputSchema: s.object("Mailtrap contact-list create response.", {
      ...accountOutput,
      contactList: resourceObject("Created Mailtrap contact list."),
    }),
  },
  {
    name: "update_contact_list",
    operationType: "write",
    description: "Update a Mailtrap contact list name.",
    inputSchema: accountScopedInput("Mailtrap contact-list update input.", {
      listId: listIdSchema,
      name: s.string("Mailtrap contact-list name.", { minLength: 1, maxLength: 255 }),
    }),
    outputSchema: s.object("Mailtrap contact-list update response.", {
      ...accountOutput,
      contactList: resourceObject("Updated Mailtrap contact list."),
    }),
  },
  {
    name: "delete_contact_list",
    operationType: "destructive",
    description: "Delete one Mailtrap contact list.",
    inputSchema: idInput("Mailtrap contact-list delete input.", "listId", listIdSchema),
    outputSchema: deletedOutput("listId", listIdSchema),
  },
  {
    name: "list_contact_fields",
    operationType: "read",
    description: "List Mailtrap contact fields.",
    inputSchema: accountScopedInput("Mailtrap contact-field list input."),
    outputSchema: s.object("Mailtrap contact fields response.", {
      ...accountOutput,
      contactFields: resourceArray("Mailtrap contact fields returned by the API.", "One Mailtrap contact field."),
    }),
  },
  {
    name: "get_contact_field",
    operationType: "read",
    description: "Retrieve one Mailtrap contact field.",
    inputSchema: idInput("Mailtrap contact-field lookup input.", "fieldId", fieldIdSchema),
    outputSchema: s.object("Mailtrap contact-field response.", {
      ...accountOutput,
      contactField: resourceObject("Mailtrap contact field returned by the API."),
    }),
  },
  {
    name: "create_contact_field",
    operationType: "write",
    description: "Create a Mailtrap contact field.",
    inputSchema: accountScopedInput("Mailtrap contact-field create input.", {
      name: s.string("Contact field name.", { minLength: 1, maxLength: 80 }),
      dataType: s.stringEnum("Mailtrap contact field data type.", ["string", "integer", "float", "boolean", "date"]),
      mergeTag: s.string("Contact field merge tag.", { minLength: 1, maxLength: 80 }),
    }),
    outputSchema: s.object("Mailtrap contact-field create response.", {
      ...accountOutput,
      contactField: resourceObject("Created Mailtrap contact field."),
    }),
  },
  {
    name: "update_contact_field",
    operationType: "write",
    description: "Update a Mailtrap contact field.",
    inputSchema: accountScopedInput(
      "Mailtrap contact-field update input.",
      {
        fieldId: fieldIdSchema,
        name: s.string("New contact field name.", { minLength: 1, maxLength: 80 }),
        mergeTag: s.string("New contact field merge tag.", { minLength: 1, maxLength: 80 }),
      },
      ["name", "mergeTag"],
    ),
    outputSchema: s.object("Mailtrap contact-field update response.", {
      ...accountOutput,
      contactField: resourceObject("Updated Mailtrap contact field."),
    }),
  },
  {
    name: "delete_contact_field",
    operationType: "destructive",
    description: "Delete one Mailtrap contact field.",
    inputSchema: idInput("Mailtrap contact-field delete input.", "fieldId", fieldIdSchema),
    outputSchema: deletedOutput("fieldId", fieldIdSchema),
  },
  {
    name: "import_contacts",
    operationType: "write",
    description: "Import contacts into Mailtrap.",
    inputSchema: accountScopedInput("Mailtrap contact import input.", {
      contacts: s.array("Contacts to import.", contactImportItemSchema, { minItems: 1 }),
    }),
    outputSchema: s.object("Mailtrap contact import response.", {
      ...accountOutput,
      contactImport: resourceObject("Mailtrap contact import job."),
    }),
  },
  {
    name: "get_contact_import",
    operationType: "read",
    description: "Retrieve one Mailtrap contact import job.",
    inputSchema: idInput("Mailtrap contact import lookup input.", "importId", importIdSchema),
    outputSchema: s.object("Mailtrap contact import response.", {
      ...accountOutput,
      contactImport: resourceObject("Mailtrap contact import job."),
    }),
  },
  {
    name: "create_contact_export",
    operationType: "write",
    description: "Create a Mailtrap contact export job.",
    inputSchema: accountScopedInput(
      "Mailtrap contact export create input.",
      {
        filters: s.array("Mailtrap export filters.", contactExportFilterSchema, { minItems: 1 }),
      },
      ["filters"],
    ),
    outputSchema: s.object("Mailtrap contact export create response.", {
      ...accountOutput,
      contactExport: resourceObject("Mailtrap contact export job."),
    }),
  },
  {
    name: "get_contact_export",
    operationType: "read",
    description: "Retrieve one Mailtrap contact export job.",
    inputSchema: idInput("Mailtrap contact export lookup input.", "exportId", exportIdSchema),
    outputSchema: s.object("Mailtrap contact export response.", {
      ...accountOutput,
      contactExport: resourceObject("Mailtrap contact export job."),
    }),
  },
  {
    name: "create_contact_event",
    operationType: "write",
    description: "Create a custom event for a Mailtrap contact.",
    inputSchema: accountScopedInput(
      "Mailtrap contact event create input.",
      {
        contactIdentifier: contactIdentifierSchema,
        name: s.string("Mailtrap custom event name.", { minLength: 1, maxLength: 255 }),
        params: s.unknownObject("Scalar custom event parameters."),
      },
      ["params"],
    ),
    outputSchema: s.object("Mailtrap contact event create response.", {
      ...accountOutput,
      contactIdentifier: contactIdentifierSchema,
      contactEvent: resourceObject("Created Mailtrap contact event."),
    }),
  },
  {
    name: "list_email_templates",
    operationType: "read",
    description: "List Mailtrap email templates.",
    inputSchema: accountScopedInput("Mailtrap email-template list input."),
    outputSchema: s.object("Mailtrap email templates response.", {
      ...accountOutput,
      emailTemplates: resourceArray("Mailtrap email templates returned by the API.", "One Mailtrap email template."),
    }),
  },
  {
    name: "get_email_template",
    operationType: "read",
    description: "Retrieve one Mailtrap email template.",
    inputSchema: idInput("Mailtrap email-template lookup input.", "emailTemplateId", emailTemplateIdSchema),
    outputSchema: s.object("Mailtrap email-template response.", {
      ...accountOutput,
      emailTemplate: resourceObject("Mailtrap email template returned by the API."),
    }),
  },
  {
    name: "create_email_template",
    operationType: "write",
    description: "Create a Mailtrap email template.",
    inputSchema: accountScopedInput("Mailtrap email-template create input.", {
      emailTemplate: emailTemplateSchema,
    }),
    outputSchema: s.object("Mailtrap email-template create response.", {
      ...accountOutput,
      emailTemplate: resourceObject("Created Mailtrap email template."),
    }),
  },
  {
    name: "update_email_template",
    operationType: "write",
    description: "Update a Mailtrap email template.",
    inputSchema: accountScopedInput("Mailtrap email-template update input.", {
      emailTemplateId: emailTemplateIdSchema,
      emailTemplate: emailTemplateSchema,
    }),
    outputSchema: s.object("Mailtrap email-template update response.", {
      ...accountOutput,
      emailTemplate: resourceObject("Updated Mailtrap email template."),
    }),
  },
  {
    name: "delete_email_template",
    operationType: "destructive",
    description: "Delete one Mailtrap email template.",
    inputSchema: idInput("Mailtrap email-template delete input.", "emailTemplateId", emailTemplateIdSchema),
    outputSchema: deletedOutput("emailTemplateId", emailTemplateIdSchema),
  },
  {
    name: "list_sending_domains",
    operationType: "read",
    description: "List Mailtrap sending domains.",
    inputSchema: accountScopedInput("Mailtrap sending-domain list input."),
    outputSchema: s.object("Mailtrap sending domains response.", {
      ...accountOutput,
      sendingDomains: resourceArray("Mailtrap sending domains returned by the API.", "One Mailtrap sending domain."),
    }),
  },
  {
    name: "get_sending_domain",
    operationType: "read",
    description: "Retrieve one Mailtrap sending domain.",
    inputSchema: idInput("Mailtrap sending-domain lookup input.", "sendingDomainId", sendingDomainIdSchema),
    outputSchema: s.object("Mailtrap sending-domain response.", {
      ...accountOutput,
      sendingDomain: resourceObject("Mailtrap sending domain returned by the API."),
    }),
  },
  {
    name: "create_sending_domain",
    operationType: "write",
    description: "Create a Mailtrap sending domain.",
    inputSchema: accountScopedInput("Mailtrap sending-domain create input.", {
      sendingDomain: sendingDomainSchema,
    }),
    outputSchema: s.object("Mailtrap sending-domain create response.", {
      ...accountOutput,
      sendingDomain: resourceObject("Created Mailtrap sending domain."),
    }),
  },
  {
    name: "delete_sending_domain",
    operationType: "destructive",
    description: "Delete one Mailtrap sending domain.",
    inputSchema: idInput("Mailtrap sending-domain delete input.", "sendingDomainId", sendingDomainIdSchema),
    outputSchema: deletedOutput("sendingDomainId", sendingDomainIdSchema),
  },
  {
    name: "list_suppressions",
    operationType: "read",
    description: "List Mailtrap suppressions with optional filters.",
    inputSchema: accountScopedInput(
      "Mailtrap suppressions list input.",
      {
        email: s.email("Suppressed email address to filter by."),
        startTime: s.dateTime("Filter suppressions created after this timestamp."),
        endTime: s.dateTime("Filter suppressions created before this timestamp."),
      },
      ["email", "startTime", "endTime"],
    ),
    outputSchema: s.object("Mailtrap suppressions response.", {
      ...accountOutput,
      suppressions: resourceArray("Mailtrap suppressions returned by the API.", "One Mailtrap suppression."),
    }),
  },
  {
    name: "get_sending_stats",
    operationType: "read",
    description: "Get aggregate Mailtrap sending statistics.",
    inputSchema: statsInput("Mailtrap sending stats input."),
    outputSchema: s.object("Mailtrap sending stats response.", {
      ...accountOutput,
      stats: resourceObject("Mailtrap aggregate sending stats."),
    }),
  },
  {
    name: "get_sending_stats_by_date",
    operationType: "read",
    description: "Get Mailtrap sending statistics grouped by date.",
    inputSchema: statsInput("Mailtrap sending stats-by-date input."),
    outputSchema: s.object("Mailtrap sending stats-by-date response.", {
      ...accountOutput,
      statsByDate: resourceArray("Mailtrap stats grouped by date.", "One stats-by-date entry."),
    }),
  },
  {
    name: "get_sending_stats_by_domains",
    operationType: "read",
    description: "Get Mailtrap sending statistics grouped by sending domain.",
    inputSchema: statsInput("Mailtrap sending stats-by-domain input."),
    outputSchema: s.object("Mailtrap sending stats-by-domain response.", {
      ...accountOutput,
      statsByDomains: resourceArray("Mailtrap stats grouped by sending domain.", "One stats-by-domain entry."),
    }),
  },
  {
    name: "get_sending_stats_by_categories",
    operationType: "read",
    description: "Get Mailtrap sending statistics grouped by category.",
    inputSchema: statsInput("Mailtrap sending stats-by-category input."),
    outputSchema: s.object("Mailtrap sending stats-by-category response.", {
      ...accountOutput,
      statsByCategories: resourceArray("Mailtrap stats grouped by category.", "One stats-by-category entry."),
    }),
  },
  {
    name: "get_sending_stats_by_esp",
    operationType: "read",
    description: "Get Mailtrap sending statistics grouped by email service provider.",
    inputSchema: statsInput("Mailtrap sending stats-by-email-service-provider input."),
    outputSchema: s.object("Mailtrap sending stats-by-email-service-provider response.", {
      ...accountOutput,
      statsByEmailServiceProviders: resourceArray(
        "Mailtrap stats grouped by email service provider.",
        "One stats-by-email-service-provider entry.",
      ),
    }),
  },
  {
    name: "get_permission_resources",
    operationType: "read",
    description: "List Mailtrap permission resources for an account.",
    inputSchema: accountScopedInput("Mailtrap permission resources input."),
    outputSchema: s.object("Mailtrap permission resources response.", {
      ...accountOutput,
      resources: resourceArray("Mailtrap permission resources.", "One Mailtrap permission resource."),
    }),
  },
  {
    name: "get_billing_usage",
    operationType: "read",
    description: "Retrieve Mailtrap billing usage for an account.",
    inputSchema: accountScopedInput("Mailtrap billing usage input."),
    outputSchema: s.object("Mailtrap billing usage response.", {
      ...accountOutput,
      billingUsage: resourceObject("Mailtrap billing usage payload."),
    }),
  },
];

export const mailtrapActions: ActionDefinition[] = specs.map((action) => defineProviderAction(service, action));
