import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "rebrandly";

const workspaceIdField = s.nonEmptyString("Workspace public ID used with the Rebrandly Workspace header.");
const linkIdField = s.nonEmptyString("Public ID of the Rebrandly branded link.");
const domainIdField = s.nonEmptyString("Public ID of the Rebrandly domain.");
const limitField = s.integer("Maximum number of results to return.", { minimum: 1, maximum: 25 });
const orderDirField = s.stringEnum("Sort direction for the collection.", ["asc", "desc"]);
const lastField = s.nonEmptyString("Cursor for pagination, usually the last item ID from the previous page.");

const rebrandlyAccountSchema = s.looseObject("Rebrandly account details.", {
  id: s.string("Account public ID."),
  email: s.email("Account email address."),
  fullName: s.string("Full name of the account owner."),
  avatarUrl: s.url("Avatar URL for the account owner."),
  createdAt: s.dateTime("Timestamp when the account was created."),
  subscription: s.looseObject("Subscription details returned by Rebrandly."),
});

const rebrandlyDomainSchema = s.looseObject("Rebrandly branded domain.", {
  id: s.string("Domain public ID."),
  fullName: s.string("Full domain name."),
  topLevelDomain: s.string("Top-level domain segment."),
  type: s.string("Domain type returned by Rebrandly."),
  status: s.looseObject("Domain status details returned by Rebrandly."),
  createdAt: s.dateTime("Timestamp when the domain was created."),
  updatedAt: s.dateTime("Timestamp when the domain was last updated."),
});

const rebrandlyLinkSchema = s.looseObject("Rebrandly branded short link.", {
  id: s.string("Link public ID."),
  title: s.string("Human-readable title for the link."),
  description: s.string("Optional description for the link."),
  slashtag: s.string("Custom path component for the link."),
  destination: s.url("Destination URL where the short link redirects."),
  shortUrl: s.string("Short URL returned by Rebrandly."),
  domainId: s.string("Public ID of the domain used by the link."),
  domainName: s.string("Domain name used by the short link."),
  clicks: s.nonNegativeInteger("Total clicks recorded for the link."),
  createdAt: s.dateTime("Timestamp when the link was created."),
  updatedAt: s.dateTime("Timestamp when the link was last updated."),
  status: s.string("Link status returned by Rebrandly."),
});

const deletedLinkSchema = s.looseObject("Rebrandly delete link response.", {
  id: s.string("Deleted link public ID."),
  status: s.string("Status returned after the link is deleted."),
});

const updateLinkInputSchema: JsonSchema = {
  ...s.object(
    "Input for updating a Rebrandly branded link.",
    {
      linkId: linkIdField,
      workspaceId: workspaceIdField,
      destination: s.url("Updated destination URL for the short link."),
      slashtag: s.string("Updated custom path component for the link.", {
        minLength: 1,
        pattern: "^[a-zA-Z0-9_-]+$",
      }),
      title: s.string("Updated human-readable title for the link.", { minLength: 1, maxLength: 255 }),
      description: s.nonEmptyString("Updated link description."),
    },
    { optional: ["workspaceId", "destination", "slashtag", "title", "description"] },
  ),
  anyOf: [
    { required: ["destination"] },
    { required: ["slashtag"] },
    { required: ["title"] },
    { required: ["description"] },
  ],
};

export const rebrandlyActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Get the authenticated Rebrandly account details.",
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("Authenticated Rebrandly account.", {
      account: rebrandlyAccountSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_domains",
    description: "List branded domains available to a Rebrandly workspace.",
    inputSchema: s.object(
      "Filters for listing Rebrandly branded domains.",
      {
        workspaceId: workspaceIdField,
        limit: limitField,
        orderBy: s.nonEmptyString("Field used to sort domains."),
        orderDir: orderDirField,
        last: lastField,
        active: s.boolean("Whether to return only active or inactive domains."),
        verified: s.boolean("Whether to return only verified or unverified domains."),
        type: s.stringEnum("Domain type filter.", ["user", "service"]),
      },
      { optional: ["workspaceId", "limit", "orderBy", "orderDir", "last", "active", "verified", "type"] },
    ),
    outputSchema: s.object("Rebrandly branded domain list.", {
      domains: s.array("Domains returned by Rebrandly.", rebrandlyDomainSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_links",
    description: "List branded short links in a Rebrandly workspace.",
    inputSchema: s.object(
      "Filters for listing Rebrandly links.",
      {
        workspaceId: workspaceIdField,
        limit: limitField,
        orderBy: s.nonEmptyString("Field used to sort links."),
        orderDir: orderDirField,
        last: lastField,
        domainId: domainIdField,
        favourite: s.boolean("Whether to filter links by favourite status."),
        status: s.nonEmptyString("Link status filter accepted by Rebrandly."),
      },
      {
        optional: ["workspaceId", "limit", "orderBy", "orderDir", "last", "domainId", "favourite", "status"],
      },
    ),
    outputSchema: s.object("Rebrandly branded link list.", {
      links: s.array("Links returned by Rebrandly.", rebrandlyLinkSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_link",
    description: "Get details for a Rebrandly branded short link.",
    inputSchema: s.object(
      "Rebrandly link lookup input.",
      {
        linkId: linkIdField,
        workspaceId: workspaceIdField,
      },
      { optional: ["workspaceId"] },
    ),
    outputSchema: s.object("Rebrandly branded link details.", {
      link: rebrandlyLinkSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_link",
    description: "Create a Rebrandly branded short link in a workspace.",
    inputSchema: s.object(
      "Input for creating a Rebrandly branded link.",
      {
        workspaceId: workspaceIdField,
        destination: s.url("Target URL where the short link redirects."),
        domainId: domainIdField,
        slashtag: s.string("Custom path component for the link.", { minLength: 1, pattern: "^[a-zA-Z0-9_-]+$" }),
        title: s.string("Human-readable title for the link.", { minLength: 1, maxLength: 255 }),
        description: s.nonEmptyString("Link description, when the workspace supports link notes."),
      },
      { optional: ["domainId", "slashtag", "title", "description"] },
    ),
    outputSchema: s.object("Created Rebrandly branded link.", {
      link: rebrandlyLinkSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_link",
    description: "Update editable fields on a Rebrandly branded short link.",
    inputSchema: updateLinkInputSchema,
    outputSchema: s.object("Updated Rebrandly branded link.", {
      link: rebrandlyLinkSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_link",
    description: "Soft delete a Rebrandly branded short link.",
    inputSchema: s.object(
      "Input for deleting a Rebrandly branded link.",
      {
        linkId: linkIdField,
        workspaceId: workspaceIdField,
      },
      { optional: ["workspaceId"] },
    ),
    outputSchema: s.object("Deleted Rebrandly branded link.", {
      deleted: deletedLinkSchema,
    }),
  }),
];
