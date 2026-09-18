import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "referralrock";
const pagination = {
  offset: s.nonNegativeInteger("The zero-based index at which to start returning records."),
  count: s.positiveInteger("The maximum number of records to return."),
};
const listOutput = (name: string, item: JsonSchema) =>
  s.object(
    `A paginated set of Referral Rock ${name}.`,
    {
      [name]: s.array(`The ${name} returned by Referral Rock.`, item),
      offset: s.integer("The zero-based offset returned by Referral Rock."),
      total: s.integer("The total number of matching records."),
      message: s.string("Additional information returned by Referral Rock."),
    },
    { optional: ["message"] },
  );
const programs = s.looseObject("A Referral Rock referral program.");
const members = s.looseObject("A Referral Rock program member.");
const referrals = s.looseObject("A Referral Rock referral.");
const memberSort = [
  "Member_Views_Desc",
  "Member_Views_Asc",
  "Page_Views_Desc",
  "Page_Views_Asc",
  "Lead_Count_Desc",
  "Lead_Count_Asc",
  "Reward_Issued_Total_Desc",
  "Reward_Issued_Total_Asc",
  "Member_Full_Name_Desc",
  "Member_Full_Name_Asc",
  "Create_Dt_Desc",
  "Create_Dt_Asc",
];
const referralSort = [
  "Create_Dt_Desc",
  "Create_Dt_Asc",
  "Amount_Desc",
  "Amount_Asc",
  "Qualified_Dt_Desc",
  "Qualified_Dt_Asc",
  "Closed_Dt_Desc",
  "Closed_Dt_Asc",
];

export const referralRockActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_programs",
    operationType: "read",
    description: "List referral programs in the connected Referral Rock account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing Referral Rock programs.",
      {
        programId: s.string("The ID of a specific referral program to return."),
        ...pagination,
      },
      { optional: ["programId", "offset", "count"] },
    ),
    outputSchema: listOutput("programs", programs),
  }),
  defineProviderAction(service, {
    name: "list_members",
    operationType: "read",
    description: "List and search members across Referral Rock referral programs.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters, sorting, and pagination for listing Referral Rock members.",
      {
        programId: s.string("The program ID, name, or title by which to filter members."),
        query: s.string("A member email address, internal ID, external ID, or referral code to search for."),
        showDisabled: s.boolean("Whether to return disabled members instead of active members."),
        sort: s.stringEnum("The documented member sort order.", memberSort),
        dateFrom: s.date("Return members created on or after this date."),
        dateTo: s.date("Return members created on or before this date."),
        ...pagination,
      },
      { optional: ["programId", "query", "showDisabled", "sort", "dateFrom", "dateTo", "offset", "count"] },
    ),
    outputSchema: listOutput("members", members),
  }),
  defineProviderAction(service, {
    name: "list_referrals",
    operationType: "read",
    description: "List and search referrals in the connected Referral Rock account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters, sorting, and pagination for listing Referral Rock referrals.",
      {
        programId: s.string("The program ID, name, or title by which to filter referrals."),
        query: s.string("A referral email address, internal ID, external ID, or referral code to search for."),
        memberId: s.string("The referring member ID by which to filter referrals."),
        sort: s.stringEnum("The documented referral sort order.", referralSort),
        dateFrom: s.date("Return referrals created on or after this date."),
        dateTo: s.date("Return referrals created on or before this date."),
        status: s.stringEnum("The referral status by which to filter results.", [
          "pending",
          "qualified",
          "approved",
          "denied",
        ]),
        ...pagination,
      },
      { optional: ["programId", "query", "memberId", "sort", "dateFrom", "dateTo", "status", "offset", "count"] },
    ),
    outputSchema: listOutput("referrals", referrals),
  }),
  defineProviderAction(service, {
    name: "get_member_stats",
    operationType: "read",
    description: "Get sharing, referral, and reward statistics for one Referral Rock member.",
    requiredScopes: [],
    inputSchema: s.object("A member identifier and time period for retrieving Referral Rock member statistics.", {
      query: s.nonEmptyString("The member email address, internal ID, external ID, or referral code to look up."),
      timePeriod: s.stringEnum("The duration over which to calculate member statistics.", [
        "All",
        "MonthToDate",
        "LastMonth",
        "Last7Days",
        "Last30Days",
      ]),
    }),
    outputSchema: s.looseObject("Statistics about a Referral Rock member's activity.", {
      memberViews: s.optional(s.integer("The member's total views.")),
      memberShares: s.optional(s.integer("The number of times the member shared a link.")),
      referralsCount: s.optional(s.integer("The number of referrals attributed to the member.")),
      referralsApproved: s.optional(s.integer("The number of approved referrals.")),
      referralsQualified: s.optional(s.integer("The number of qualified referrals.")),
      referralsPending: s.optional(s.integer("The number of pending referrals.")),
      referralsViews: s.optional(s.integer("The total referral views.")),
      rewardsCount: s.optional(s.integer("The number of rewards generated by the member.")),
    }),
  }),
];
