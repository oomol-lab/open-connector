import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "feedier";
const reportId = s.positiveInteger("The Feedier report ID.");
const reportType = s.stringEnum("The Feedier report visibility type.", ["master", "private", "public"]);
const fql = s.anyOf("The Feedier FQL value applied to report components.", [
  s.string("A serialized Feedier FQL expression."),
  s.array("Feedier FQL rules represented as JSON objects.", s.unknownObject("One Feedier FQL rule.")),
]);
const report = s.looseRequiredObject("A Feedier analytical report.", {
  id: s.integer("The report ID."),
  user_id: s.nullableInteger("The user ID associated with the report, or null."),
  team_id: s.nullableInteger("The team ID that owns the report, or null."),
  name: s.string("The report name."),
  type: s.string("The report visibility type."),
  status: s.string("The report publication status."),
  fql: s.nullableString("The serialized global FQL expression, or null."),
  color: s.nullableString("The report color palette, or null."),
  created_at: s.string("The report creation timestamp."),
  updated_at: s.string("The report update timestamp."),
});
const reportMutationFields: Record<string, JsonSchema> = {
  user_id: s.positiveInteger("The user ID to associate with the report."),
  name: s.nonEmptyString("The report name."),
  fql,
  type: reportType,
};

export const feedierActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_reports",
    description: "List Feedier reports with pagination, filters, and sorting.",
    inputSchema: s.actionInput(
      {
        page: s.positiveInteger("The page number to retrieve."),
        name: s.string("Filter reports by name."),
        user_id: s.positiveInteger("Filter reports by user ID."),
        team_id: s.positiveInteger("Filter reports by team ID."),
        sort: s.stringEnum("The report field to sort by; prefix with a minus for descending order.", [
          "name",
          "-name",
          "created_at",
          "-created_at",
        ]),
      },
      [],
      "Filters and pagination for listing Feedier reports.",
    ),
    outputSchema: s.actionOutput({
      reports: s.array("Reports returned by Feedier.", report),
      links: s.looseRequiredObject("Feedier pagination links.", {
        first: s.nullable(s.url("The first page URL, or null.")),
        last: s.nullable(s.url("The last page URL, or null.")),
        prev: s.nullable(s.url("The previous page URL, or null.")),
        next: s.nullable(s.url("The next page URL, or null.")),
      }),
      meta: s.looseRequiredObject("Feedier pagination metadata.", {
        current_page: s.integer("The current page number."),
        last_page: s.integer("The last available page number."),
        per_page: s.integer("The number of reports per page."),
        total: s.integer("The total number of reports."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_report",
    description: "Get a Feedier report by ID.",
    inputSchema: s.actionInput({ report_id: reportId }, ["report_id"]),
    outputSchema: s.actionOutput({ report }),
  }),
  defineProviderAction(service, {
    name: "create_report",
    description: "Create a Feedier analytical report.",
    inputSchema: s.actionInput(
      {
        ...reportMutationFields,
        team_id: s.positiveInteger("The team ID that should own the report."),
        master_id: s.positiveInteger("The master report ID to clone as a template."),
        format: s.stringEnum("The initial Feedier report format.", ["blank", "prefilled"]),
      },
      [],
      "Fields for creating a Feedier report.",
    ),
    outputSchema: s.actionOutput({ report }),
  }),
  defineProviderAction(service, {
    name: "update_report",
    description: "Update editable fields on a Feedier report.",
    inputSchema: s.actionInput({ report_id: reportId, ...reportMutationFields }, ["report_id"]),
    outputSchema: s.actionOutput({ report }),
  }),
  defineProviderAction(service, {
    name: "delete_report",
    description: "Delete a Feedier report by ID.",
    inputSchema: s.actionInput({ report_id: reportId }, ["report_id"]),
    outputSchema: s.actionOutput({ deleted: s.boolean("Whether the report deletion succeeded.") }),
  }),
  defineProviderAction(service, {
    name: "create_report_share_link",
    description: "Generate a new expiring share link for a Feedier report.",
    inputSchema: s.actionInput(
      {
        report_id: reportId,
        expiration: s.stringEnum("The lifetime of the generated share link.", [
          "seven_days",
          "thirty_days",
          "ninety_days",
          "four_months",
        ]),
      },
      ["report_id"],
      "Fields for generating a Feedier report share link.",
    ),
    outputSchema: s.actionOutput({
      share_link: s.looseRequiredObject("The generated Feedier share-link record.", {
        id: s.integer("The share-link record ID."),
        token: s.string("The generated share token."),
        public_link: s.url("The public report URL."),
        expires_at: s.string("The share-link expiration timestamp."),
        created_at: s.string("The share-link creation timestamp."),
        updated_at: s.string("The share-link update timestamp."),
      }),
    }),
  }),
];
