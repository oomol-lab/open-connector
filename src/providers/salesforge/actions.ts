import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const workspaceID = s.string("Workspace ID.", { minLength: 1 });
const contactID = s.string("Contact ID.", { minLength: 1 });
const limit = s.integer("Maximum number of results to return.", { minimum: 1 });
const offset = s.integer("Number of results to skip.", { minimum: 0 });
const filters = {
  "tag_ids[]": s.array("Filter by existing tag IDs.", s.string("Tag ID.")),
  "validation_statuses[]": s.array(
    "Filter by email validation statuses.",
    s.stringEnum("Validation status.", [
      "safe",
      "valid",
      "invalid",
      "disabled",
      "disposable",
      "inbox_full",
      "catch_all",
      "role_account",
      "spamtrap",
      "unknown",
      "unvalidated",
    ]),
  ),
  "not_in_sequence_id": s.string("Exclude contacts enrolled in this sequence."),
};
const contact = s.looseObject("Contact information, including tags and sequence enrollments.", {
  id: s.string("Contact ID."),
  firstName: s.string("First name."),
  lastName: s.string("Last name."),
  email: s.string("Email address."),
  linkedinUrl: s.string("LinkedIn profile URL."),
  company: s.string("Company name."),
  position: s.string("Job position."),
  location: s.string("Free-text location."),
  timezone: s.string("Derived IANA timezone; empty when unknown."),
  tags: s.array("Contact tags.", s.string("Tag.")),
  customVars: s.record("Custom variable values.", s.string("Variable value.")),
  sequences: s.array("Sequence enrollments.", s.looseObject("Sequence enrollment details.", {})),
});
const workspace = s.looseObject("Workspace information.", {
  id: s.string("Workspace ID."),
  accountId: s.string("Account ID."),
  name: s.string("Workspace name."),
  slug: s.string("Workspace slug."),
});
const pagination = {
  limit: s.integer("Page size."),
  offset: s.integer("Page offset."),
  total: s.integer("Total matching records."),
};
const workspaceList = s.looseObject("Workspace page.", {
  data: s.array("Workspaces.", workspace),
  ...pagination,
});
const contactList = s.looseObject("Contact page with offset or cursor pagination metadata.", {
  data: s.array("Contacts.", contact),
  ...pagination,
  hasMore: s.boolean("Whether another cursor page exists."),
  nextCursor: s.string("Opaque cursor for the next page; omitted on the last page."),
});
const deleted = s.object(
  "Successful deletion result.",
  {
    success: s.boolean("Whether deletion succeeded."),
  },
  { optional: [] },
);
const dncs = s.array(
  "Email addresses, domains, or LinkedIn URLs to add to or remove from the do-not-contact list.",
  s.string("Email address, domain, or LinkedIn URL.", { minLength: 1 }),
  { minItems: 1, maxItems: 1000 },
);

export const salesforgeActions: ActionDefinition[] = [
  defineProviderAction("salesforge", {
    name: "get_current_user",
    operationType: "read",
    description: "Validate the API key and retrieve its account ID, name, and read-only flag.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters.", {}, { optional: [] }),
    outputSchema: s.looseObject("API key account information.", {
      accountId: s.string("Account ID."),
      apiKeyName: s.string("API key name."),
      readOnly: s.boolean("Whether the key permits only GET requests."),
    }),
  }),
  defineProviderAction("salesforge", {
    name: "list_workspaces",
    operationType: "read",
    description: "List account workspaces with offset pagination.",
    requiredScopes: [],
    inputSchema: s.object("Workspace list parameters.", { limit, offset }, { required: [] }),
    outputSchema: workspaceList,
  }),
  defineProviderAction("salesforge", {
    name: "get_workspace",
    operationType: "read",
    description: "Get a workspace by ID.",
    requiredScopes: [],
    inputSchema: s.object("Workspace lookup parameters.", { workspaceID }, { optional: [] }),
    outputSchema: workspace,
  }),
  defineProviderAction("salesforge", {
    name: "list_contacts",
    operationType: "read",
    description:
      "List workspace contacts with filters and offset or cursor pagination. Use pagination=cursor for the first cursor page and nextCursor as cursor for subsequent pages with the same filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Contact list parameters.",
      {
        workspaceID,
        limit,
        offset,
        ...filters,
        pagination: s.stringEnum("Pagination mode; defaults to offset.", ["offset", "cursor"]),
        cursor: s.string("Opaque cursor from the preceding page; implies cursor pagination.", {
          minLength: 1,
        }),
      },
      { required: ["workspaceID"] },
    ),
    outputSchema: contactList,
  }),
  defineProviderAction("salesforge", {
    name: "count_contacts",
    operationType: "read",
    description: "Count matching active workspace contacts. Request exact counts only when needed.",
    requiredScopes: [],
    inputSchema: s.object(
      "Contact count parameters.",
      {
        workspaceID,
        ...filters,
        "has_valid_linkedin": s.boolean("Filter by valid LinkedIn profile URL."),
        "not_in_esps[]": s.array(
          "Exclude contacts whose email domains belong to these ESPs.",
          s.string("Email service provider."),
        ),
      },
      { required: ["workspaceID"] },
    ),
    outputSchema: s.looseObject("Exact contact count.", {
      total: s.integer("Total matching contacts."),
    }),
  }),
  defineProviderAction("salesforge", {
    name: "get_contact",
    operationType: "read",
    description: "Get a contact, including tags and sequence enrollments.",
    requiredScopes: [],
    inputSchema: s.object("Contact lookup parameters.", { workspaceID, contactID }, { optional: [] }),
    outputSchema: contact,
  }),
  defineProviderAction("salesforge", {
    name: "create_contact",
    operationType: "write",
    description:
      "Create a workspace contact with an email address or LinkedIn URL. If no tags are supplied, Salesforge applies a date-based tag.",
    requiredScopes: [],
    inputSchema: s.object(
      "Contact creation parameters.",
      {
        workspaceID,
        firstName: s.string("First name."),
        lastName: s.string("Last name."),
        email: s.string("Email address; email or linkedinUrl must be nonempty."),
        linkedinUrl: s.string("LinkedIn profile URL; email or linkedinUrl must be nonempty."),
        company: s.string("Company name.", { minLength: 1 }),
        position: s.string("Job position."),
        location: s.string("Free-text location used to derive the contact timezone."),
        customVars: s.record("Custom variable values.", s.string("Variable value.")),
        tags: s.array("Tag names to apply.", s.string("Tag name.")),
        tagIds: s.array("Existing tag IDs to apply.", s.string("Tag ID.")),
      },
      {
        required: ["workspaceID", "firstName"],
        anyOf: [
          { required: ["email"], properties: { email: { minLength: 1 } } },
          { required: ["linkedinUrl"], properties: { linkedinUrl: { minLength: 1 } } },
        ],
      },
    ),
    outputSchema: contact,
  }),
  defineProviderAction("salesforge", {
    name: "delete_contact",
    operationType: "destructive",
    description: "Delete a contact from a workspace.",
    requiredScopes: [],
    inputSchema: s.object("Contact deletion parameters.", { workspaceID, contactID }, { optional: [] }),
    outputSchema: deleted,
  }),
  defineProviderAction("salesforge", {
    name: "list_tags",
    operationType: "read",
    description: "List non-hidden workspace tags ordered by name, optionally filtered by name.",
    requiredScopes: [],
    inputSchema: s.object(
      "Tag list parameters.",
      {
        workspaceID,
        limit: s.integer("Page size, at most 100.", { minimum: 1, maximum: 100 }),
        offset,
        search: s.string("Filter tags whose name contains this value."),
        caseSensitive: s.boolean("Match search case exactly; defaults to false."),
      },
      { required: ["workspaceID"] },
    ),
    outputSchema: s.looseObject("Tag page.", {
      data: s.array(
        "Tags.",
        s.looseObject("Tag information.", { id: s.string("Tag ID."), name: s.string("Tag name.") }),
      ),
      ...pagination,
    }),
  }),
  defineProviderAction("salesforge", {
    name: "list_dncs",
    operationType: "read",
    description: "List workspace do-not-contact entries with offset pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Do-not-contact list parameters.",
      {
        workspaceID,
        limit: s.integer("Page size, at most 1000; defaults to 100.", {
          minimum: 1,
          maximum: 1000,
        }),
        offset,
      },
      { required: ["workspaceID"] },
    ),
    outputSchema: s.looseObject("Do-not-contact page.", {
      data: s.array(
        "Do-not-contact entries.",
        s.looseObject("Do-not-contact entry.", {
          value: s.string("Blocked email address, domain, or LinkedIn URL."),
          type: s.string("Entry type."),
          createdAt: s.string("Creation timestamp."),
        }),
      ),
      ...pagination,
    }),
  }),
  defineProviderAction("salesforge", {
    name: "create_dncs",
    operationType: "write",
    description: "Add up to 1000 email addresses, domains, or LinkedIn URLs to the workspace do-not-contact list.",
    requiredScopes: [],
    inputSchema: s.object("Do-not-contact creation parameters.", { workspaceID, dncs }, { optional: [] }),
    outputSchema: s.looseObject("Do-not-contact creation result.", {
      created: s.integer("Number of entries created."),
    }),
  }),
  defineProviderAction("salesforge", {
    name: "remove_dncs",
    operationType: "destructive",
    description:
      "Remove up to 1000 values from the workspace do-not-contact list, allowing them to be contacted again.",
    requiredScopes: [],
    inputSchema: s.object("Do-not-contact removal parameters.", { workspaceID, dncs }, { optional: [] }),
    outputSchema: deleted,
  }),
];
