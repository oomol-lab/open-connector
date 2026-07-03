import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bitly";

export type BitlyActionName =
  | "get_user"
  | "list_groups"
  | "get_group"
  | "shorten_link"
  | "get_bitlink"
  | "update_bitlink";

const guidSchema = s.nonEmptyString("A Bitly GUID value.");
const bitlinkSchema = s.nonEmptyString("A Bitlink made of the domain and hash, such as bit.ly/12a4b6c.");
const longUrlSchema = s.url("The destination URL for the Bitlink.");
const domainSchema = s.nonEmptyString("The domain used when creating the Bitlink.");
const tagListSchema = s.array("Tags assigned to the Bitlink.", s.nonEmptyString("One Bitly tag."));

const emailSchema = s.looseObject("A Bitly user email record.", {
  email: s.email("The email address."),
  is_primary: s.boolean("Whether this is the primary email address."),
  is_verified: s.boolean("Whether this email address has been verified."),
});

const userSchema = s.looseObject("Authenticated Bitly user details.", {
  login: s.string("The Bitly login name."),
  name: s.string("The user's display name."),
  is_active: s.boolean("Whether the user is active."),
  created: s.string("Timestamp when the user was created."),
  modified: s.string("Timestamp when the user was last modified."),
  is_sso_user: s.boolean("Whether the user authenticates through SSO."),
  is_2fa_enabled: s.boolean("Whether two-factor authentication is enabled."),
  default_group_guid: s.string("The default Bitly group GUID."),
  emails: s.array("Email addresses associated with the user.", emailSchema),
});

const groupSchema = s.looseObject("A Bitly group.", {
  guid: s.string("The group GUID."),
  organization_guid: s.string("The organization GUID that owns the group."),
  name: s.string("The group name."),
  created: s.string("Timestamp when the group was created."),
  modified: s.string("Timestamp when the group was last modified."),
  is_active: s.boolean("Whether the group is active."),
  role: s.string("The authenticated user's role in the group."),
  bsds: s.array("Branded short domains associated with the group.", s.string("A branded domain.")),
  references: s.record("Reference URLs returned by Bitly.", s.string("A reference URL.")),
});

const bitlyBitlinkSchema = s.looseObject("A Bitly Bitlink.", {
  id: s.string("The Bitlink ID, usually domain/hash."),
  link: s.url("The short URL."),
  long_url: s.url("The destination URL."),
  title: s.string("The Bitlink title."),
  archived: s.boolean("Whether the Bitlink is archived."),
  created_at: s.string("Timestamp when the Bitlink was created."),
  created_by: s.string("The login that created the Bitlink."),
  client_id: s.string("The client ID that created the Bitlink."),
  custom_bitlinks: s.array("Custom Bitlinks associated with this Bitlink.", s.string("A custom Bitlink.")),
  tags: tagListSchema,
  launchpad_ids: s.array("Launchpad IDs associated with this Bitlink.", s.string("A Launchpad ID.")),
  qr_code_ids: s.array("QR code IDs associated with this Bitlink.", s.string("A QR code ID.")),
  is_deleted: s.boolean("Whether the Bitlink has been deleted."),
  campaign_ids: s.array("Campaign IDs associated with this Bitlink.", s.string("A campaign ID.")),
  expiration_at: s.string("Optional expiration timestamp for the Bitlink."),
  references: s.record("Reference URLs returned by Bitly.", s.string("A reference URL.")),
});

const updateBitlinkInputSchema: JsonSchema = s.object(
  "Input for updating a Bitly Bitlink.",
  {
    bitlink: bitlinkSchema,
    title: s.nonEmptyString("Updated Bitlink title."),
    archived: s.boolean("Whether the Bitlink should be archived."),
    tags: tagListSchema,
    longUrl: longUrlSchema,
    expirationAt: s.nonEmptyString("Updated Bitlink expiration timestamp."),
  },
  { optional: ["title", "archived", "tags", "longUrl", "expirationAt"] },
);
updateBitlinkInputSchema.anyOf = ["title", "archived", "tags", "longUrl", "expirationAt"].map((field) => ({
  required: [field],
}));

export const bitlyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user",
    description: "Get the authenticated Bitly user details.",
    requiredScopes: [],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.actionOutput(
      {
        user: userSchema,
      },
      "Authenticated Bitly user details.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List Bitly groups available to the authenticated user.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing Bitly groups.",
      {
        organizationGuid: guidSchema,
      },
      { optional: ["organizationGuid"] },
    ),
    outputSchema: s.actionOutput(
      {
        groups: s.array("Groups returned by Bitly.", groupSchema),
      },
      "Bitly group list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Get details for a Bitly group.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        groupGuid: guidSchema,
      },
      ["groupGuid"],
      "Bitly group lookup input.",
    ),
    outputSchema: s.actionOutput(
      {
        group: groupSchema,
      },
      "Bitly group details.",
    ),
  }),
  defineProviderAction(service, {
    name: "shorten_link",
    description: "Create a short Bitly link for a destination URL.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a Bitly short link.",
      {
        longUrl: longUrlSchema,
        domain: domainSchema,
        groupGuid: guidSchema,
        forceNewLink: s.boolean("Whether Bitly should create a new short link every time."),
      },
      { optional: ["domain", "groupGuid", "forceNewLink"] },
    ),
    outputSchema: s.actionOutput(
      {
        bitlink: bitlyBitlinkSchema,
      },
      "Created Bitly short link.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_bitlink",
    description: "Get details for an existing Bitly Bitlink.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        bitlink: bitlinkSchema,
      },
      ["bitlink"],
      "Bitly Bitlink lookup input.",
    ),
    outputSchema: s.actionOutput(
      {
        bitlink: bitlyBitlinkSchema,
      },
      "Bitly Bitlink details.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_bitlink",
    description: "Update editable fields on an existing Bitly Bitlink.",
    requiredScopes: [],
    inputSchema: updateBitlinkInputSchema,
    outputSchema: s.actionOutput(
      {
        bitlink: bitlyBitlinkSchema,
      },
      "Updated Bitly Bitlink details.",
    ),
  }),
];
