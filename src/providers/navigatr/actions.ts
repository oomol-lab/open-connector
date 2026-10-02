import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const badgeId = s.integer("Navigatr badge ID.");
const assertionId = s.integer("Navigatr badge assertion ID.");
const providerId = s.integer("Issuing provider ID; must be one of the badge's providers.");
const orderBy = s.stringEnum("Sort order.", ["Time_Created_Asc", "Time_Created_Desc", "Name_Asc", "Name_Desc"]);
const badgeOrderBy = s.stringEnum("Sort order.", [
  "Time_Created_Asc",
  "Time_Created_Desc",
  "Time_Updated_Asc",
  "Time_Updated_Desc",
  "Name_Asc",
  "Name_Desc",
]);
const pagination = {
  paginated: s.optional(s.boolean("Return a paginated response; defaults to true upstream.")),
  page: s.optional(s.integer("Page number, starting at 1.", { minimum: 1 })),
  size: s.optional(s.integer("Results per page, from 1 to 100.", { minimum: 1, maximum: 100 })),
};
const badge = s.looseObject("Badge details, including additional upstream fields.", {
  id: s.optional(badgeId),
  name: s.optional(s.nullable(s.string("Badge name."))),
  status: s.optional(s.string("Badge publication status.")),
  url: s.optional(s.string("Public badge URL.")),
  providers: s.optional(
    s.nullable(s.array("Providers that can issue this badge.", s.looseObject("Issuing provider details."))),
  ),
});
const assertion = s.looseObject("Badge assertion details; recipient fields depend on caller permissions.", {
  id: s.optional(assertionId),
  status: s.optional(s.string("Assertion status.")),
  badge_id: s.optional(s.nullable(badgeId)),
  recipient_id: s.optional(s.nullable(s.integer("Recipient user ID."))),
  url: s.optional(s.nullable(s.string("Public assertion URL."))),
});
const listOutput = (item: Record<string, unknown>) =>
  s.looseObject("Results with pagination metadata when requested.", {
    items: s.optional(s.array("Results in this response.", item)),
    total: s.optional(s.integer("Total matching results.")),
    page: s.optional(s.integer("Current page number.")),
    size: s.optional(s.integer("Requested page size.")),
    pages: s.optional(s.integer("Total pages.")),
  });
export const navigatrActions: ActionDefinition[] = [
  defineProviderAction("navigatr", {
    name: "list_badges",
    operationType: "read",
    requiredScopes: [],
    description:
      "List badges for a provider, community, QA community, or issuer. Public API access is limited to the connected user's own provider or community.",
    inputSchema: {
      ...s.object(
        "Badge filters; supply at least one provider, community, QA community, or issuer ID.",
        {
          provider_id: s.optional(providerId),
          community_id: s.optional(s.integer("Community ID.")),
          qa_community_id: s.optional(s.integer("Quality assurance community ID.")),
          issuer_id: s.optional(s.integer("Badge issuer ID.")),
          featured: s.optional(s.boolean("Filter by featured status.")),
          qa_required: s.optional(s.boolean("Filter by whether quality assurance is required.")),
          type: s.optional(
            s.stringEnum("Badge type.", [
              "Experience",
              "Learning",
              "Validation",
              "Certification",
              "Attendance",
              "Work_Experience",
              "Volunteering",
              "Job",
              "Apprenticeship",
              "Course",
              "Internship",
              "Workshop",
              "Campaigning",
              "Activism",
              "Other",
              "Informal_Learning",
              "Training",
              "Certified",
              "Qualification",
              "Membership",
            ]),
          ),
          recipient_type: s.optional(s.stringEnum("Recipient type.", ["User", "Organisation"])),
          source: s.optional(s.string("Badge source, such as Internal or Credly.")),
          order_by: s.optional(badgeOrderBy),
          keyword: s.optional(s.string("Search badge names.")),
          status: s.optional(s.string("Comma-separated badge statuses.")),
          ...pagination,
        },
        { optional: [] },
      ),
      anyOf: [
        { required: ["provider_id"] },
        { required: ["community_id"] },
        { required: ["qa_community_id"] },
        { required: ["issuer_id"] },
      ],
    },
    outputSchema: listOutput(badge),
  }),
  defineProviderAction("navigatr", {
    name: "get_badge",
    operationType: "read",
    requiredScopes: [],
    description: "Retrieve a badge and its issuing providers, criteria, and other available details.",
    inputSchema: s.object("Badge lookup.", { badge_id: badgeId }, { optional: [] }),
    outputSchema: badge,
  }),
  defineProviderAction("navigatr", {
    name: "issue_badge",
    operationType: "write",
    requiredScopes: [],
    description:
      "Issue a configured badge to a user or organisation. Identify the recipient by user ID, QR code, Spydus barcode, or email with first and last name; include recipient_organisation for organisation badges.",
    inputSchema: {
      ...s.object(
        "Badge issuance details.",
        {
          badge_id: badgeId,
          provider_id: providerId,
          recipient_id: s.optional(s.integer("Existing Navigatr recipient user ID.")),
          qr_id: s.optional(s.nonEmptyString("Recipient QR code ID.")),
          spydus_barcode_id: s.optional(s.nonEmptyString("Recipient Spydus library card barcode ID.")),
          recipient_email: s.optional(s.string("Recipient email address.", { format: "email" })),
          recipient_firstname: s.optional(
            s.nonEmptyString("Recipient first name; required when identifying by email."),
          ),
          recipient_lastname: s.optional(s.nonEmptyString("Recipient last name; required when identifying by email.")),
          recipient_organisation: s.optional(s.string("Organisation name shown on organisation assertions.")),
          issue_date: s.optional(s.string("Date and time when the assertion becomes valid.", { format: "date-time" })),
          end_date: s.optional(s.string("Date and time when the assertion expires.", { format: "date-time" })),
          evidence_text: s.optional(s.string("Plain text evidence of the recipient's achievement.")),
          evidence_url: s.optional(s.string("Evidence URL passed to Navigatr.", { format: "uri" })),
          score: s.optional(s.integer("Recipient score; omit to issue regardless of score.")),
          min_score: s.optional(s.integer("Minimum score required for issuance.")),
        },
        { optional: [] },
      ),
      anyOf: [
        { required: ["recipient_id"] },
        { required: ["qr_id"] },
        { required: ["spydus_barcode_id"] },
        { required: ["recipient_email", "recipient_firstname", "recipient_lastname"] },
      ],
    },
    outputSchema: assertion,
  }),
  defineProviderAction("navigatr", {
    name: "list_badge_assertions",
    operationType: "read",
    requiredScopes: [],
    description: "List issuance records for a badge with optional provider, status, keyword, and pagination filters.",
    inputSchema: s.object(
      "Badge assertion filters.",
      {
        badge_id: badgeId,
        provider_id: s.optional(providerId),
        order_by: s.optional(orderBy),
        keyword: s.optional(s.string("Search assertion records.")),
        status: s.optional(s.string("Assertion status filter.")),
        ...pagination,
      },
      { optional: [] },
    ),
    outputSchema: listOutput(assertion),
  }),
  defineProviderAction("navigatr", {
    name: "get_badge_assertion",
    operationType: "read",
    requiredScopes: [],
    description:
      "Retrieve a badge assertion. Navigatr redacts recipient information when the connected account lacks permission to view it.",
    inputSchema: s.object("Assertion lookup.", { badge_assertion_id: assertionId }, { optional: [] }),
    outputSchema: assertion,
  }),
  defineProviderAction("navigatr", {
    name: "verify_badge_assertion",
    operationType: "destructive",
    requiredScopes: [],
    description:
      "Verify a badge assertion and retrieve the result and reasons. This updates or clears the persisted time_verified field and the public verification indicator.",
    inputSchema: s.object("Assertion verification request.", { badge_assertion_id: assertionId }, { optional: [] }),
    outputSchema: s.looseObject("Assertion verification result with additional upstream details.", {
      verified: s.optional(s.boolean("Whether the assertion is verified.")),
      reasons: s.optional(s.record("Verification reasons keyed by check.", s.string("Verification reason."))),
      status: s.optional(s.string("Assertion status.")),
    }),
  }),
  defineProviderAction("navigatr", {
    name: "revoke_badge_assertion",
    operationType: "destructive",
    requiredScopes: [],
    description: "Revoke a badge assertion, optionally recording a reason.",
    inputSchema: s.object(
      "Assertion revocation request.",
      {
        badge_assertion_id: assertionId,
        revocation_reason: s.optional(s.string("Reason for revoking the assertion.")),
      },
      { optional: [] },
    ),
    outputSchema: assertion,
  }),
];
