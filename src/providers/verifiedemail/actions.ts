import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "verifiedemail";

const emptyInputSchema = s.actionInput({}, [], "This action does not require any input.");
const idSchema = s.nonEmptyString("The VerifiedEmail resource ID.");

const paginationInputSchema = s.object(
  "Optional pagination and sorting parameters.",
  {
    offset: s.nonNegativeInteger("Number of items to offset the result set by."),
    limit: s.integer("Number of items to return.", { minimum: 1, maximum: 10 }),
    sortField: s.nonEmptyString("Field name to sort the result set by."),
    sortOrder: s.stringEnum("Sort order for the result set.", ["asc", "desc"]),
  },
  {
    optional: ["offset", "limit", "sortField", "sortOrder"],
  },
);

const idInputSchema = s.object(
  "Input parameters for reading one VerifiedEmail resource.",
  {
    id: idSchema,
  },
  { required: ["id"] },
);

const verifyEmailsInputSchema = s.object(
  "Input parameters for verifying emails.",
  {
    emails: s.array("One to ten email addresses to verify.", s.email("An email address to verify."), {
      minItems: 1,
      maxItems: 10,
    }),
  },
  { required: ["emails"] },
);

const paginationMetadataSchema = s.object(
  "VerifiedEmail pagination metadata.",
  {
    count: s.integer("Total count of matching items."),
    limit: s.integer("Limit applied to this result set."),
    offset: s.integer("Offset applied to this result set."),
    sortField: s.string("Sort field applied to this result set."),
    sortOrder: s.string("Sort order applied to this result set."),
  },
  {
    optional: ["count", "limit", "offset", "sortField", "sortOrder"],
  },
);

const nullableStringSchema = (description: string) => s.nullable(s.string(description));
const nullableBooleanSchema = (description: string) => s.nullable(s.boolean(description));

const verificationMetadataSchema = s.nullable(
  s.object(
    "VerifiedEmail metadata for a synchronous verification response.",
    {
      listId: s.nullable(s.string("The related verification list ID, if any.")),
      count: s.integer("Number of verification objects returned."),
    },
    {
      optional: ["listId", "count"],
    },
  ),
);

const verificationResultSchema = s.looseObject("A VerifiedEmail verification object.", {
  email: s.string("The email address returned by VerifiedEmail."),
  score: s.integer("The email score returned by VerifiedEmail."),
  result: s.stringEnum("The verification result returned by VerifiedEmail.", [
    "pending",
    "malformed",
    "ghost",
    "unknown",
    "blocked",
    "nonexistent",
    "inactive",
    "failed",
    "full",
    "deliverable",
  ]),
  role: nullableStringSchema("The role value returned by VerifiedEmail, if any."),
  alias: nullableStringSchema("The email alias returned by VerifiedEmail, if any."),
  canonical: nullableStringSchema("The canonical email returned by VerifiedEmail, if any."),
  isGhost: nullableBooleanSchema("Whether VerifiedEmail marks the email as a ghost address."),
  isMX: nullableBooleanSchema("Whether VerifiedEmail found MX records for the email domain."),
  isSubdomain: nullableBooleanSchema("Whether the email belongs to a subdomain."),
  isCatchAll: nullableBooleanSchema("Whether the email domain is catch-all."),
  isFree: nullableBooleanSchema("Whether the email belongs to a free email provider."),
  isDisposable: nullableBooleanSchema("Whether the email is disposable."),
  isGovernment: nullableBooleanSchema("Whether the email belongs to a government domain."),
  isAcademic: nullableBooleanSchema("Whether the email belongs to an academic domain."),
  isMilitary: nullableBooleanSchema("Whether the email belongs to a military domain."),
  isGoogleWorkspace: nullableBooleanSchema("Whether the email domain uses Google Workspace."),
  isOutlook365: nullableBooleanSchema("Whether the email domain uses Outlook 365."),
  dateAdded: s.string("Creation time returned by VerifiedEmail."),
  dateLastVerified: nullableStringSchema("Last verification time returned by VerifiedEmail."),
  dateLastValid: nullableStringSchema("Last valid time returned by VerifiedEmail."),
});

const verifyEmailsOutputSchema = s.object(
  "VerifiedEmail synchronous verification response.",
  {
    verifications: s.array("Verification objects returned by VerifiedEmail.", verificationResultSchema),
    metadata: verificationMetadataSchema,
  },
  {
    optional: ["metadata"],
  },
);

const entitlementBucketSchema = s.object(
  "VerifiedEmail entitlement bucket.",
  {
    credits: s.integer("Credits available in this entitlement bucket."),
    needed: s.integer("Credits or email count needed in this entitlement bucket."),
  },
  {
    optional: ["credits", "needed"],
  },
);

const entitlementsOutputSchema = s.object("VerifiedEmail entitlements response.", {
  entitlements: s.object(
    "VerifiedEmail entitlement details.",
    {
      payAsYouGo: entitlementBucketSchema,
      autoVerify: entitlementBucketSchema,
    },
    {
      optional: ["payAsYouGo", "autoVerify"],
    },
  ),
});

const recordsSchema = s.looseObject("VerifiedEmail list statistics.", {
  total: s.integer("Total records in the list."),
  duplicate: s.integer("Duplicate records in the list."),
  malformed: s.integer("Malformed records in the list."),
  billable: s.integer("Billable records in the list."),
  pending: s.integer("Pending records in the list."),
  unknown: s.integer("Unknown records in the list."),
  nonexistent: s.integer("Nonexistent records in the list."),
  inactive: s.integer("Inactive records in the list."),
  full: s.integer("Full mailbox records in the list."),
  ghosts: s.integer("Ghost records in the list."),
  failed: s.integer("Failed records in the list."),
  undeliverable: s.integer("Undeliverable records in the list."),
  deliverable: s.integer("Deliverable records in the list."),
  free: s.integer("Free-provider records in the list."),
  government: s.integer("Government-domain records in the list."),
  academic: s.integer("Academic-domain records in the list."),
  military: s.integer("Military-domain records in the list."),
  disposable: s.integer("Disposable records in the list."),
  catchall: s.integer("Catch-all records in the list."),
  role: s.integer("Role-address records in the list."),
  googleworkspace: s.integer("Google Workspace records in the list."),
  outlook365: s.integer("Outlook 365 records in the list."),
});

const listSchema = s.looseObject("A VerifiedEmail verification list.", {
  id: s.string("The verification list ID."),
  title: s.string("The verification list title."),
  status: s.stringEnum("The verification list status.", ["new", "ready", "progress", "failed", "partial", "verified"]),
  isAutoRefill: s.boolean("Whether auto-refill is enabled for this list."),
  score: s.integer("The list score."),
  type: s.stringEnum("The verification list type.", ["user", "system", "widget", "zapier", "integration"]),
  error: s.string("The last list error returned by VerifiedEmail."),
  autoVerify: s.stringEnum("The auto verification mode.", ["off", "weekly"]),
  integration: s.nullable(s.looseObject("The related integration object, if any.")),
  records: recordsSchema,
  dateAdded: s.string("Creation time returned by VerifiedEmail."),
  dateLastVerified: s.nullable(s.string("Last verification time returned by VerifiedEmail.")),
});

const listListsOutputSchema = s.object(
  "VerifiedEmail verification list collection response.",
  {
    lists: s.array("Verification lists returned by VerifiedEmail.", listSchema),
    metadata: paginationMetadataSchema,
  },
  {
    optional: ["metadata"],
  },
);

const getListOutputSchema = s.object("VerifiedEmail single list response.", {
  list: listSchema,
});

const downloadStatusSchema = s.stringEnum("The download request status.", [
  "new",
  "progress",
  "completed",
  "failed",
  "deleted",
]);

const downloadIncludeItemSchema = s.stringEnum("An email status included in the download.", [
  "pending",
  "malformed",
  "ghost",
  "unknown",
  "nonexistent",
  "failed",
  "full",
  "deliverable",
]);

const downloadSchema = s.looseObject("A VerifiedEmail download request object.", {
  id: s.string("The download request ID."),
  listId: s.string("The related verification list ID."),
  include: s.array("Email statuses included in the download.", downloadIncludeItemSchema),
  url: s.string("The direct download URL returned by VerifiedEmail."),
  status: downloadStatusSchema,
  dateAdded: s.string("Creation time returned by VerifiedEmail."),
  dateReady: s.string("File ready time returned by VerifiedEmail."),
});

const listDownloadsOutputSchema = s.object(
  "VerifiedEmail download request collection response.",
  {
    downloads: s.array("Download requests returned by VerifiedEmail.", downloadSchema),
    metadata: paginationMetadataSchema,
  },
  {
    optional: ["metadata"],
  },
);

const getDownloadOutputSchema = s.object("VerifiedEmail single download response.", {
  download: downloadSchema,
});

export const verifiedemailActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_entitlements",
    description: "Get VerifiedEmail verification credit entitlements for the account.",
    inputSchema: emptyInputSchema,
    outputSchema: entitlementsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_emails",
    description: "Verify one to ten email addresses synchronously with VerifiedEmail.",
    inputSchema: verifyEmailsInputSchema,
    outputSchema: verifyEmailsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_lists",
    description: "List VerifiedEmail verification lists with optional pagination and sorting.",
    inputSchema: paginationInputSchema,
    outputSchema: listListsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_list",
    description: "Get one VerifiedEmail verification list by ID.",
    inputSchema: idInputSchema,
    outputSchema: getListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_downloads",
    description: "List VerifiedEmail download requests with optional pagination and sorting.",
    inputSchema: paginationInputSchema,
    outputSchema: listDownloadsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_download",
    description: "Get one VerifiedEmail download request by ID.",
    inputSchema: idInputSchema,
    outputSchema: getDownloadOutputSchema,
  }),
];
