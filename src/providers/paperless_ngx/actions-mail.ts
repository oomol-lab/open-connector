import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  additionalFiltersInputField,
  deletedOutputSchema,
  fullPermsInputField,
  idArrayField,
  idField,
  integerEnum,
  mailAccountSchema,
  mailRuleSchema,
  ownerInputField,
  pageInputFields,
  paginatedOutputSchema,
  resultOutputSchema,
  setPermissionsInputSchema,
} from "./schemas.ts";

const service = "paperless_ngx";

const imapSecurityValues = [1, 2, 3];
const imapSecurityDescription =
  "IMAP connection security: 1 no encryption, 2 SSL (implicit TLS, normally port 993), 3 STARTTLS (normally port 143). Defaults to 2.";

const accountTypeValues = [1, 2, 3];
const accountTypeDescription =
  "Account type: 1 IMAP with username and password, 2 Gmail OAuth, 3 Outlook OAuth. Defaults to 1. OAuth accounts are normally created through the Paperless-ngx web UI, which obtains the token; this API can only store token values obtained elsewhere.";

const mailActionValues = [1, 2, 3, 4, 5];
const mailActionDescription =
  "Action applied to a mail after its documents are consumed: 1 delete the mail, 2 move it to the folder named in action_parameter, 3 mark it as read (read mails are not processed), 4 flag it (flagged mails are not processed), 5 tag it with the tag or Gmail label named in action_parameter (tagged mails are not processed). Defaults to 3. Actions 2 and 5 require action_parameter in the same request.";

const titleSourceValues = [1, 2, 3];
const titleSourceDescription =
  "Where consumed documents get their title from: 1 the mail subject, 2 the attachment filename, 3 do not assign a title from the rule. Defaults to 1.";

const correspondentSourceValues = [1, 2, 3, 4];
const correspondentSourceDescription =
  "How the correspondent is chosen: 1 do not assign a correspondent, 2 the sender mail address, 3 the sender name (falls back to the address), 4 the correspondent given in assign_correspondent. Defaults to 1.";

const attachmentTypeValues = [1, 2];
const attachmentTypeDescription =
  "Which attachments are consumed: 1 only real attachments, 2 every file including inline attachments such as embedded images, best combined with a filename filter. Defaults to 1.";

const consumptionScopeValues = [1, 2, 3];
const consumptionScopeDescription =
  "What is consumed from a matching mail: 1 attachments only, 2 the full mail as a single .eml document with attachments embedded, 3 the full mail as .eml plus every attachment as a separate document. Defaults to 1.";

const pdfLayoutValues = [0, 1, 2, 3, 4];
const pdfLayoutDescription =
  "Layout used when a mail body is rendered to PDF: 0 system default, 1 text then HTML, 2 HTML then text, 3 HTML only, 4 text only. Defaults to 0.";

const mailAccountPasswordDescription =
  "IMAP password, or the OAuth access token when is_token is true. It is never returned; reads show a placeholder made of asterisks. On update, sending a value consisting only of asterisks (the placeholder returned by reads) leaves the stored password unchanged.";

const mailAccountInputFields = {
  name: s.nonEmptyString("Display name of the account, unique across the instance, at most 256 characters."),
  imap_server: s.nonEmptyString("IMAP server host name, for example imap.example.com."),
  imap_port: s.integer("IMAP server port. Usually 143 for unencrypted and STARTTLS connections and 993 for SSL.", {
    minimum: 1,
    maximum: 65535,
  }),
  imap_security: integerEnum(imapSecurityDescription, imapSecurityValues),
  username: s.string("IMAP login user name."),
  password: s.string(mailAccountPasswordDescription),
  character_set: s.nonEmptyString(
    "Character set used when talking to the mail server, such as UTF-8 or US-ASCII. Defaults to UTF-8.",
  ),
  is_token: s.boolean("Whether password holds an OAuth access token instead of a password. Defaults to false."),
  account_type: integerEnum(accountTypeDescription, accountTypeValues),
  expiration: s.nullableString(
    "ISO 8601 timestamp when the OAuth access token expires, or null. Only meaningful for OAuth accounts.",
  ),
  owner: ownerInputField,
  set_permissions: setPermissionsInputSchema,
};

const mailAccountOptionalFields = [
  "imap_security",
  "character_set",
  "is_token",
  "account_type",
  "expiration",
  "owner",
  "set_permissions",
];

const mailAccountOutputSchema = mailAccountSchema;

const mailAccountIdField = idField("Id of the mail account.");

const mailAccountPermissionNote =
  "Only accounts the connected user owns, that are unowned, or that were shared with the user are visible.";

const mailRuleInputFields = {
  name: s.nonEmptyString("Rule name, unique per owner, at most 256 characters."),
  account: idField(
    "Id of the mail account the rule scans. The connected user needs change permission on that account.",
  ),
  folder: s.nonEmptyString(
    "IMAP folder to scan. Subfolders are separated by the server's delimiter, often a dot or a slash. Defaults to INBOX.",
  ),
  filter_from: s.nullableString("Only process mails whose sender contains this text, or null for no filter."),
  filter_to: s.nullableString("Only process mails whose recipient contains this text, or null for no filter."),
  filter_subject: s.nullableString("Only process mails whose subject contains this text, or null for no filter."),
  filter_body: s.nullableString("Only process mails whose body contains this text, or null for no filter."),
  filter_attachment_filename_include: s.nullableString(
    "Only consume attachments whose filename entirely matches this pattern. Wildcards such as *.pdf or *invoice* are allowed and matching is case insensitive. Null for no filter.",
  ),
  filter_attachment_filename_exclude: s.nullableString(
    "Skip attachments whose filename entirely matches this pattern. Wildcards such as *.pdf or *invoice* are allowed and matching is case insensitive. Null for no filter.",
  ),
  maximum_age: s.integer(
    "Only process mails received within this many days; 0 disables the age limit. Defaults to 30, at most 36500.",
    { minimum: 0, maximum: 36500 },
  ),
  action: integerEnum(mailActionDescription, mailActionValues),
  action_parameter: s.nullableString(
    "Parameter for action: the target folder for action 2 (subfolders separated by dots) or the tag or Gmail label for action 5. Ignored by the other actions; null or empty when unused.",
  ),
  assign_title_from: integerEnum(titleSourceDescription, titleSourceValues),
  assign_tags: idArrayField("Ids of the tags assigned to every consumed document.", "A tag id."),
  assign_correspondent_from: integerEnum(correspondentSourceDescription, correspondentSourceValues),
  assign_correspondent: s.nullable(
    idField("Id of the correspondent used when assign_correspondent_from is 4, or null."),
  ),
  assign_document_type: s.nullable(idField("Id of the document type assigned to consumed documents, or null.")),
  assign_owner_from_rule: s.boolean("Whether consumed documents are owned by the rule owner. Defaults to true."),
  order: s.integer("Evaluation order among rules; lower values run first. Defaults to 0."),
  attachment_type: integerEnum(attachmentTypeDescription, attachmentTypeValues),
  consumption_scope: integerEnum(consumptionScopeDescription, consumptionScopeValues),
  pdf_layout: integerEnum(pdfLayoutDescription, pdfLayoutValues),
  enabled: s.boolean("Whether the rule is active. Defaults to true."),
  stop_processing: s.boolean(
    "When true, no further rules are evaluated for a mail once this rule queues a document. Defaults to false.",
  ),
  owner: ownerInputField,
  set_permissions: setPermissionsInputSchema,
};

const mailRuleOptionalFields = [
  "folder",
  "filter_from",
  "filter_to",
  "filter_subject",
  "filter_body",
  "filter_attachment_filename_include",
  "filter_attachment_filename_exclude",
  "maximum_age",
  "action",
  "action_parameter",
  "assign_title_from",
  "assign_tags",
  "assign_correspondent_from",
  "assign_correspondent",
  "assign_document_type",
  "assign_owner_from_rule",
  "order",
  "attachment_type",
  "consumption_scope",
  "pdf_layout",
  "enabled",
  "stop_processing",
  "owner",
  "set_permissions",
];

const mailRuleOutputSchema = mailRuleSchema;

const mailRuleIdField = idField("Id of the mail rule.");

const mailRulePermissionNote =
  "Only rules the connected user owns, that are unowned, or that were shared with the user are visible.";

const processedMailSchema: JsonSchema = s.looseObject("A mail that a mail rule has processed.", {
  id: s.integer("The processed mail record id."),
  owner: s.nullableInteger("Id of the owning user, or null when unowned."),
  rule: s.integer("Id of the mail rule that processed the mail."),
  folder: s.string("IMAP folder the mail was found in."),
  uid: s.string("IMAP UID of the mail within its folder."),
  subject: s.string("Mail subject."),
  received: s.string("ISO 8601 timestamp when the mail was received."),
  processed: s.string("ISO 8601 timestamp when Paperless-ngx processed the mail."),
  status: s.string("Processing outcome: SUCCESS or FAILED."),
  error: s.nullableString("Error message when processing failed, or null."),
});

const processedMailOrderingDescription =
  "Field to order by, prefixed with - for descending order: id, rule, folder, uid, subject, received, processed, status, error or owner. Defaults to -processed.";

const processedMailStatusFilterDescription =
  "Only return records with exactly this status, normally SUCCESS or FAILED.";

const ownedListInputFields = {
  page: pageInputFields.page,
  page_size: pageInputFields.page_size,
  full_perms: fullPermsInputField,
  additional_filters: additionalFiltersInputField,
};

const ownedListOptionalFields = ["page", "page_size", "full_perms", "additional_filters"];

export const paperlessNgxMailActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_mail_accounts",
    operationType: "read",
    description: `List the mail accounts Paperless-ngx fetches documents from, ordered by id. ${mailAccountPermissionNote} Passwords are returned as an asterisk placeholder. The endpoint supports no ordering or field filters beyond paging.`,
    requiredScopes: [],
    inputSchema: s.object("Paging and permission options.", ownedListInputFields, {
      optional: ownedListOptionalFields,
    }),
    outputSchema: paginatedOutputSchema("A page of mail accounts.", mailAccountSchema),
  }),
  defineProviderAction(service, {
    name: "get_mail_account",
    operationType: "read",
    description: `Get one mail account by id. ${mailAccountPermissionNote} The password is returned as an asterisk placeholder.`,
    requiredScopes: [],
    inputSchema: s.object(
      "The mail account to read.",
      { id: mailAccountIdField, full_perms: fullPermsInputField },
      { optional: ["full_perms"] },
    ),
    outputSchema: mailAccountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_mail_account",
    operationType: "write",
    description:
      "Create an IMAP mail account that Paperless-ngx can fetch documents from. Requires the add_mailaccount permission. The account only becomes useful once a mail rule references it; use test_mail_account to verify the credentials first.",
    requiredScopes: [],
    inputSchema: s.object("The mail account to create.", mailAccountInputFields, {
      optional: mailAccountOptionalFields,
    }),
    outputSchema: mailAccountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_mail_account",
    operationType: "write",
    description:
      "Partially update a mail account. Only the provided fields are sent; pass null to clear nullable fields. A password consisting only of asterisks (the placeholder returned by reads) is ignored and leaves the stored password unchanged. Requires change permission on the account.",
    requiredScopes: [],
    inputSchema: s.object(
      "The mail account fields to update.",
      { id: mailAccountIdField, ...mailAccountInputFields },
      { optional: Object.keys(mailAccountInputFields) },
    ),
    outputSchema: mailAccountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_mail_account",
    operationType: "destructive",
    description:
      "Delete a mail account together with every mail rule and processed mail record that belongs to it. Requires delete permission on the account.",
    requiredScopes: [],
    inputSchema: s.object("The mail account to delete.", { id: mailAccountIdField }),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted mail account."),
  }),
  defineProviderAction(service, {
    name: "test_mail_account",
    operationType: "read",
    description:
      "Test whether Paperless-ngx can log in to a mailbox with the given IMAP settings without saving anything. Pass id of an existing account together with the asterisk password placeholder to test the stored credentials (including OAuth tokens, which are refreshed when expired); this requires change permission on that account, while testing new settings requires the add_mailaccount permission. A failed login is reported as an error with status 400 and the message Unable to connect to server.",
    requiredScopes: [],
    inputSchema: s.object(
      "The IMAP settings to test.",
      {
        id: idField(
          "Id of an existing mail account. When given and password is only asterisks, the stored password, account type, refresh token and expiration of that account are used instead.",
        ),
        imap_server: mailAccountInputFields.imap_server,
        imap_port: mailAccountInputFields.imap_port,
        imap_security: mailAccountInputFields.imap_security,
        username: mailAccountInputFields.username,
        password: s.string(
          "IMAP password or OAuth access token to test. With id, a value consisting only of asterisks means use the stored password.",
        ),
        character_set: mailAccountInputFields.character_set,
        is_token: mailAccountInputFields.is_token,
        account_type: mailAccountInputFields.account_type,
        expiration: mailAccountInputFields.expiration,
      },
      {
        optional: ["id", "imap_security", "character_set", "is_token", "account_type", "expiration"],
      },
    ),
    outputSchema: s.requiredObject("The connectivity test result.", {
      success: s.boolean("True when Paperless-ngx could log in to the mailbox."),
    }),
  }),
  defineProviderAction(service, {
    name: "process_mail_account",
    operationType: "write",
    description:
      "Queue an immediate fetch of one mail account instead of waiting for the scheduled mail check. Paperless-ngx starts a mail_fetch background task and answers OK without a task id; inspect the tasks list (task_type mail_fetch) or list_processed_mail to see the outcome. Requires view permission on the account.",
    requiredScopes: [],
    inputSchema: s.object("The mail account to process.", { id: mailAccountIdField }),
    outputSchema: resultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_mail_rules",
    operationType: "read",
    description: `List mail rules ordered by their order field. ${mailRulePermissionNote} The endpoint supports no ordering or field filters beyond paging.`,
    requiredScopes: [],
    inputSchema: s.object("Paging and permission options.", ownedListInputFields, {
      optional: ownedListOptionalFields,
    }),
    outputSchema: paginatedOutputSchema("A page of mail rules.", mailRuleSchema),
  }),
  defineProviderAction(service, {
    name: "get_mail_rule",
    operationType: "read",
    description: `Get one mail rule by id. ${mailRulePermissionNote}`,
    requiredScopes: [],
    inputSchema: s.object(
      "The mail rule to read.",
      { id: mailRuleIdField, full_perms: fullPermsInputField },
      { optional: ["full_perms"] },
    ),
    outputSchema: mailRuleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_mail_rule",
    operationType: "write",
    description:
      "Create a mail rule that tells Paperless-ngx which mails of an account to consume and how to file the resulting documents. Requires the add_mailrule permission and change permission on the referenced account. Actions 2 (move) and 5 (tag) need action_parameter.",
    requiredScopes: [],
    inputSchema: s.object("The mail rule to create.", mailRuleInputFields, {
      optional: mailRuleOptionalFields,
    }),
    outputSchema: mailRuleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_mail_rule",
    operationType: "write",
    description:
      "Partially update a mail rule. Only the provided fields are sent; pass null to clear nullable fields. When changing action to 2 (move) or 5 (tag), send action_parameter in the same request because Paperless-ngx validates the pair together. Requires change permission on the rule.",
    requiredScopes: [],
    inputSchema: s.object(
      "The mail rule fields to update.",
      { id: mailRuleIdField, ...mailRuleInputFields },
      { optional: Object.keys(mailRuleInputFields) },
    ),
    outputSchema: mailRuleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_mail_rule",
    operationType: "destructive",
    description: "Delete a mail rule together with its processed mail records. Requires delete permission on the rule.",
    requiredScopes: [],
    inputSchema: s.object("The mail rule to delete.", { id: mailRuleIdField }),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted mail rule."),
  }),
  defineProviderAction(service, {
    name: "list_processed_mail",
    operationType: "read",
    description:
      "List the mails that mail rules have already processed, newest processed first by default, optionally filtered by rule or status. Only records the connected user owns, that are unowned, or that were shared with the user are returned.",
    requiredScopes: [],
    inputSchema: s.object(
      "Paging, ordering and filter options.",
      {
        page: pageInputFields.page,
        page_size: pageInputFields.page_size,
        ordering: s.nonEmptyString(processedMailOrderingDescription),
        rule: idField("Only return mails processed by this mail rule id."),
        status: s.nonEmptyString(processedMailStatusFilterDescription),
        additional_filters: additionalFiltersInputField,
      },
      { optional: ["page", "page_size", "ordering", "rule", "status", "additional_filters"] },
    ),
    outputSchema: paginatedOutputSchema("A page of processed mail records.", processedMailSchema),
  }),
  defineProviderAction(service, {
    name: "get_processed_mail",
    operationType: "read",
    description:
      "Get one processed mail record by id. Only records the connected user owns, that are unowned, or that were shared with the user are visible.",
    requiredScopes: [],
    inputSchema: s.object("The processed mail record to read.", {
      id: idField("Id of the processed mail record."),
    }),
    outputSchema: processedMailSchema,
  }),
  defineProviderAction(service, {
    name: "bulk_delete_processed_mail",
    operationType: "destructive",
    description:
      "Delete several processed mail records at once so the corresponding mails can be fetched again on the next run. Paperless-ngx checks delete permission on every record first and rejects the whole request with status 403 if any is not permitted; ids that do not exist are silently skipped.",
    requiredScopes: [],
    inputSchema: s.object("The processed mail records to delete.", {
      mail_ids: s.array(
        "Ids of the processed mail records to delete, at least one.",
        s.positiveInteger("A processed mail record id."),
        { minItems: 1 },
      ),
    }),
    outputSchema: s.looseRequiredObject("The bulk deletion result.", {
      result: s.string('The upstream result marker, normally "OK".'),
      deleted_mail_ids: s.array(
        "The ids that were submitted for deletion, echoed back by Paperless-ngx.",
        s.integer("A processed mail record id."),
      ),
    }),
  }),
];
