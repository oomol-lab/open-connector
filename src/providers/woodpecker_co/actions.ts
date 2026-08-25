import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "woodpecker_co";

const pageZeroBasedSchema = s.nonNegativeInteger("The zero-based results page to request.");
const pageOneBasedSchema = s.positiveInteger("The one-based results page to request.");
const sortUsersSchema = s.stringEnum("The user sort order supported by Woodpecker.", ["+id", "-id"]);
const sortProspectsSchema = s.string("The prospects sort expression, such as +company.", { minLength: 1 });
const campaignStatusSchema = s.stringEnum("The campaign status to filter by.", [
  "RUNNING",
  "DRAFT",
  "STOPPED",
  "PAUSED",
  "EDITED",
  "COMPLETED",
]);
const prospectStatusSchema = s.stringEnum("The global prospect status to filter by.", [
  "ACTIVE",
  "BOUNCED",
  "REPLIED",
  "BLACKLIST",
  "INVALID",
]);
const prospectInterestSchema = s.stringEnum("The campaign interest level to filter prospects by.", [
  "INTERESTED",
  "MAYBE-LATER",
  "NOT-INTERESTED",
  "NOT-MARKED",
]);
const prospectActivitySchema = s.stringEnum("The prospect activity filter.", [
  "OPENED",
  "NOT-OPENED",
  "CLICKED",
  "NOT-CLICKED",
]);
const prospectDiffSchema = s.string(
  "The Woodpecker diff expression, such as activity>2026-01-15 08:00:00; URL encoding is handled by the connector.",
  { minLength: 1 },
);

const rawObjectSchema = s.looseObject("The raw object returned by Woodpecker.");
const rawObjectArraySchema = s.array("The raw objects returned by Woodpecker.", rawObjectSchema);
const rawV1ListPayloadSchema = s.anyOf("The raw list payload returned by a Woodpecker v1 endpoint.", [
  rawObjectArraySchema,
  rawObjectSchema,
]);

const paginationSchema = s.object("Woodpecker pagination metadata.", {
  total_elements: s.nullableInteger("The total number of matching elements."),
  total_pages: s.nullableInteger("The total number of result pages."),
  current_page_number: s.nullableInteger("The current page number returned by Woodpecker."),
  page_size: s.nullableInteger("The maximum number of items in the page."),
});

const userSchema = s.object("A normalized Woodpecker user.", {
  id: s.nullableInteger("The Woodpecker user ID."),
  name: s.nullableString("The user's full name."),
  email: s.nullableString("The user's email address."),
  role: s.nullableString("The user's role in the account."),
  raw: rawObjectSchema,
});

const campaignSchema = s.object("A normalized Woodpecker campaign.", {
  id: s.nullableInteger("The Woodpecker campaign ID."),
  name: s.nullableString("The campaign name."),
  status: s.nullableString("The campaign status."),
  raw: rawObjectSchema,
});

const prospectSchema = s.object("A normalized Woodpecker prospect.", {
  id: s.nullableInteger("The Woodpecker prospect ID."),
  email: s.nullableString("The prospect email address."),
  status: s.nullableString("The prospect global status."),
  first_name: s.nullableString("The prospect first name when returned."),
  last_name: s.nullableString("The prospect last name when returned."),
  raw: rawObjectSchema,
});

const mailboxSchema = s.object("A normalized Woodpecker mailbox.", {
  id: s.nullableInteger("The Woodpecker mailbox configuration ID."),
  type: s.nullableString("The mailbox configuration type, such as SMTP or IMAP."),
  email: s.nullableString("The mailbox email address."),
  provider: s.nullableString("The email provider name returned by Woodpecker."),
  login: s.nullableString("The mailbox login returned by Woodpecker."),
  details: s.looseObject("The raw Woodpecker mailbox details object."),
  raw: rawObjectSchema,
});

export const woodpeckerCoActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    description: "List active Woodpecker users in the authenticated account.",
    inputSchema: s.object(
      "The input payload for listing Woodpecker users.",
      {
        page: pageZeroBasedSchema,
        sort: sortUsersSchema,
      },
      { optional: ["page", "sort"] },
    ),
    outputSchema: s.object("The response returned when listing Woodpecker users.", {
      users: s.array("The users returned by Woodpecker.", userSchema),
      pagination: paginationSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "List Woodpecker campaigns, optionally filtered by campaign status.",
    inputSchema: s.object(
      "The input payload for listing Woodpecker campaigns.",
      {
        status: campaignStatusSchema,
      },
      { optional: ["status"] },
    ),
    outputSchema: s.object("The response returned when listing Woodpecker campaigns.", {
      campaigns: s.array("The campaigns returned by Woodpecker.", campaignSchema),
      raw: rawV1ListPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    description: "Get Woodpecker campaign settings and content by campaign ID.",
    inputSchema: s.object(
      "The input payload for getting one Woodpecker campaign.",
      {
        campaign_id: s.positiveInteger("The Woodpecker campaign ID."),
      },
      { required: ["campaign_id"] },
    ),
    outputSchema: s.object("The response returned when getting one Woodpecker campaign.", {
      campaign: campaignSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_campaign_statistics",
    description: "Get Woodpecker statistics for one campaign by campaign ID.",
    inputSchema: s.object(
      "The input payload for getting Woodpecker campaign statistics.",
      {
        campaign_id: s.positiveInteger("The Woodpecker campaign ID."),
      },
      { required: ["campaign_id"] },
    ),
    outputSchema: s.object("The response returned when getting Woodpecker campaign statistics.", {
      statistics: s.looseObject("The campaign statistics object returned by Woodpecker."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_prospects",
    description: "List prospects from the Woodpecker prospect database with optional filters.",
    inputSchema: s.object(
      "The input payload for listing Woodpecker prospects.",
      {
        page: pageOneBasedSchema,
        per_page: s.positiveInteger("The number of prospects per page, up to 1000.", {
          maximum: 1000,
        }),
        sort: sortProspectsSchema,
        ids: s.array(
          "The Woodpecker prospect IDs to request; the connector serializes them for the official id filter.",
          s.positiveInteger("One Woodpecker prospect ID."),
          { minItems: 1 },
        ),
        status: prospectStatusSchema,
        contacted: s.boolean("Whether to return prospects that have ever been contacted."),
        interested: prospectInterestSchema,
        activity: prospectActivitySchema,
        diff: prospectDiffSchema,
      },
      {
        optional: ["page", "per_page", "sort", "ids", "status", "contacted", "interested", "activity", "diff"],
      },
    ),
    outputSchema: s.object("The response returned when listing Woodpecker prospects.", {
      prospects: s.array("The prospects returned by Woodpecker.", prospectSchema),
      raw: rawV1ListPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_mailboxes",
    description: "List Woodpecker mailboxes connected to the authenticated account.",
    inputSchema: s.object("The input payload for listing Woodpecker mailboxes.", {}),
    outputSchema: s.object("The response returned when listing Woodpecker mailboxes.", {
      mailboxes: s.array("The mailboxes returned by Woodpecker.", mailboxSchema),
      raw: s.array("The raw mailbox objects returned by Woodpecker.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_mailbox",
    description: "Get one Woodpecker mailbox by mailbox configuration ID.",
    inputSchema: s.object(
      "The input payload for getting one Woodpecker mailbox.",
      {
        mailbox_id: s.positiveInteger("The Woodpecker mailbox configuration ID."),
      },
      { required: ["mailbox_id"] },
    ),
    outputSchema: s.object("The response returned when getting one Woodpecker mailbox.", {
      mailbox: mailboxSchema,
    }),
  }),
];
