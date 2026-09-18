import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "missive";

const noInputSchema = s.object({}, { description: "No input parameters are required for this action." });
const missiveObjectSchema = (description: string): JsonSchema => s.looseObject(description);
const pagination200InputSchema = s.object(
  "Input payload for Missive list endpoints with offset pagination.",
  {
    limit: s.integer("The maximum number of records to return.", { minimum: 1, maximum: 200 }),
    offset: s.nonNegativeInteger("The zero-based offset used to paginate records."),
  },
  { optional: ["limit", "offset"] },
);
const idInputSchema = (resourceName: string): JsonSchema =>
  s.object(`Input payload for fetching one Missive ${resourceName}.`, {
    id: s.nonEmptyString(`The Missive ${resourceName} ID.`),
  });

const userSchema = s.looseObject("One Missive user.", {
  id: s.string("The Missive user ID."),
  email: s.string("The user's email address."),
  display_name: s.string("The user's display name."),
  first_name: s.string("The user's first name."),
  last_name: s.string("The user's last name."),
  avatar_url: s.string("The URL of the user's avatar image."),
  me: s.boolean("Whether this user is the authenticated token owner."),
});

const organizationSchema = s.looseObject("One Missive organization.", {
  id: s.string("The Missive organization ID."),
  name: s.string("The organization name."),
});

const teamSchema = s.looseObject("One Missive team.", {
  id: s.string("The Missive team ID."),
  name: s.string("The team name."),
  organization: s.string("The organization ID that owns the team."),
  active_members: s.array("The active member user IDs on the team.", s.string("A user ID.")),
  observers: s.array("The observer user IDs on the team.", s.string("A user ID.")),
});

const contactBookSchema = s.looseObject("One Missive contact book.", {
  id: s.string("The Missive contact book ID."),
  name: s.string("The contact book name."),
  user: s.string("The owning user ID."),
  organization: s.nullable(s.string("The organization ID for a shared contact book.")),
  share_with_organization: s.boolean("Whether the contact book is shared with the full organization."),
  share_with_team: s.nullable(s.string("The team ID when shared with a specific team.")),
  share_with_users: s.array("The user IDs the contact book is explicitly shared with.", s.string("A user ID.")),
  description: s.nullable(s.string("The contact book description.")),
  importing: s.boolean("Whether an import is currently in progress."),
  import_error_text: s.nullable(s.string("The latest contact import error message.")),
  import_rows_count: s.nonNegativeInteger("The total rows in the current or latest import."),
  import_processed_rows_count: s.nonNegativeInteger("The rows processed so far in the current or latest import."),
});

const contactSchema = s.looseObject("One Missive contact.", {
  id: s.string("The Missive contact ID."),
  deleted: s.boolean("Whether this contact is deleted."),
  modified_at: s.nonNegativeInteger("The Unix timestamp when the contact was last modified."),
  contact_book: s.string("The contact book ID that contains this contact."),
  first_name: s.string("The contact's first name."),
  last_name: s.string("The contact's last name."),
  middle_name: s.string("The contact's middle name."),
  file_as: s.string("The display filing name for this contact."),
  notes: s.string("Notes stored on this contact."),
  starred: s.boolean("Whether the contact is starred."),
  infos: s.array("The contact info entries returned by Missive.", missiveObjectSchema("One contact info entry.")),
  memberships: s.array(
    "The contact membership entries returned by Missive.",
    missiveObjectSchema("One contact membership entry."),
  ),
});

const conversationSchema = s.looseObject("One Missive conversation.", {
  id: s.string("The Missive conversation ID."),
  created_at: s.nonNegativeInteger("The Unix timestamp when the conversation was created."),
  subject: s.nullable(s.string("The conversation subject.")),
  latest_message_subject: s.nullable(s.string("The latest message subject.")),
  organization: s.nullable(organizationSchema),
  color: s.nullable(s.string("The conversation color value.")),
  authors: s.array("The message authors returned by Missive.", missiveObjectSchema("One author entry.")),
  external_authors: s.array(
    "The external authors returned by Missive.",
    missiveObjectSchema("One external author entry."),
  ),
  users: s.array("The users with access to the conversation.", missiveObjectSchema("One user access entry.")),
  assignees: s.array("The users assigned to the conversation.", missiveObjectSchema("One assignee entry.")),
  assignee_names: s.string("The comma-separated assignee display names."),
  assignee_emails: s.string("The comma-separated assignee email addresses."),
  shared_labels: s.array("The shared labels on the conversation.", missiveObjectSchema("One shared label entry.")),
  shared_label_names: s.string("The comma-separated shared label names."),
  team: s.nullable(teamSchema),
  messages_count: s.nonNegativeInteger("The number of messages in the conversation."),
  drafts_count: s.nonNegativeInteger("The number of drafts in the conversation."),
  send_later_messages_count: s.nonNegativeInteger("The number of scheduled messages in the conversation."),
  attachments_count: s.nonNegativeInteger("The number of attachments in the conversation."),
  tasks_count: s.nonNegativeInteger("The number of tasks in the conversation."),
  completed_tasks_count: s.nonNegativeInteger("The number of completed tasks in the conversation."),
  last_activity_at: s.nonNegativeInteger("The Unix timestamp of the conversation's most recent activity."),
  closed_at: s.nonNegativeInteger("The Unix timestamp when the conversation was closed."),
  web_url: s.url("The URL that opens the conversation in the Missive web app."),
  app_url: s.string("The deep link that opens the conversation in the Missive app."),
});

const listContactsInputSchema = s.object(
  "Input payload for listing Missive contacts.",
  {
    contact_book: s.nonEmptyString("The contact book ID to list contacts from."),
    order: s.stringEnum("The ordering mode for returned contacts.", ["last_name", "last_modified"]),
    limit: s.integer("The maximum number of contacts to return.", { minimum: 1, maximum: 200 }),
    offset: s.nonNegativeInteger("The zero-based offset used to paginate contacts."),
    modified_since: s.nonNegativeInteger("Only return contacts modified or created since this Unix timestamp."),
    include_deleted: s.boolean("Whether to include deleted contacts in modified_since results."),
    search: s.nonEmptyString("The search text used to filter contacts."),
  },
  {
    required: ["contact_book"],
  },
);

export type MissiveMailboxFilterName =
  | "inbox"
  | "all"
  | "assigned"
  | "closed"
  | "snoozed"
  | "flagged"
  | "trashed"
  | "junked"
  | "drafts";

export const missiveMailboxFilterNames: readonly MissiveMailboxFilterName[] = [
  "inbox",
  "all",
  "assigned",
  "closed",
  "snoozed",
  "flagged",
  "trashed",
  "junked",
  "drafts",
];

const listConversationsInputSchema = s.object(
  "Input payload for listing Missive conversations. At least one mailbox, shared_label, or team filter is required.",
  {
    limit: s.integer("The maximum number of conversations to return.", { minimum: 1, maximum: 50 }),
    until: s.nonNegativeInteger("The last_activity_at Unix timestamp used to paginate conversations."),
    inbox: s.boolean("Whether to list conversations in the Inbox mailbox."),
    all: s.boolean("Whether to list conversations in the All mailbox."),
    assigned: s.boolean("Whether to list conversations assigned to the user."),
    closed: s.boolean("Whether to list conversations in Closed."),
    snoozed: s.boolean("Whether to list conversations in Snoozed."),
    flagged: s.boolean("Whether to list conversations in Starred."),
    trashed: s.boolean("Whether to list conversations in Trash."),
    junked: s.boolean("Whether to list conversations in Spam."),
    drafts: s.boolean("Whether to list conversations in Drafts."),
    shared_label: s.nonEmptyString("The shared label ID to list conversations from."),
    team_inbox: s.nonEmptyString("The team ID to list conversations in the team's Inbox."),
    team_closed: s.nonEmptyString("The team ID to list conversations in the team's Closed mailbox."),
    team_all: s.nonEmptyString("The team ID to list conversations in the team's All mailbox."),
    organization: s.nonEmptyString("The organization ID used to filter conversations shared with that organization."),
    email: s.nonEmptyString("Filter conversations by a specific contact email address."),
    domain: s.nonEmptyString("Filter conversations by a specific contact email domain."),
    contact_organization: s.nonEmptyString("Filter conversations by a contact organization or group ID."),
  },
);

export const missiveActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List users visible to the authenticated Missive API token.",
    requiredScopes: [],
    inputSchema: noInputSchema,
    outputSchema: s.object("The normalized Missive user-list response.", {
      users: s.array("The users returned by Missive.", userSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_organizations",
    operationType: "read",
    description: "List organizations the authenticated Missive API token owner belongs to.",
    requiredScopes: [],
    inputSchema: pagination200InputSchema,
    outputSchema: s.object("The normalized Missive organization-list response.", {
      organizations: s.array("The organizations returned by Missive.", organizationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_teams",
    operationType: "read",
    description: "List teams visible to the authenticated Missive API token.",
    requiredScopes: [],
    inputSchema: noInputSchema,
    outputSchema: s.object("The normalized Missive team-list response.", {
      teams: s.array("The teams returned by Missive.", teamSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_contact_books",
    operationType: "read",
    description: "List Missive contact books the authenticated user can access.",
    requiredScopes: [],
    inputSchema: pagination200InputSchema,
    outputSchema: s.object("The normalized Missive contact-book-list response.", {
      contact_books: s.array("The contact books returned by Missive.", contactBookSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List contacts from one Missive contact book with documented filters.",
    requiredScopes: [],
    inputSchema: listContactsInputSchema,
    outputSchema: s.object("The normalized Missive contact-list response.", {
      contacts: s.array("The contacts returned by Missive.", contactSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Get one Missive contact by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("contact"),
    outputSchema: s.object("The normalized Missive contact response.", {
      contact: contactSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_conversations",
    operationType: "read",
    description: "List Missive conversations using a required mailbox, team, or shared-label filter.",
    requiredScopes: [],
    inputSchema: listConversationsInputSchema,
    outputSchema: s.object("The normalized Missive conversation-list response.", {
      conversations: s.array("The conversations returned by Missive.", conversationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_conversation",
    operationType: "read",
    description: "Get one Missive conversation by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("conversation"),
    outputSchema: s.object("The normalized Missive conversation response.", {
      conversation: conversationSchema,
    }),
  }),
];
