import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cursor";

const rawObjectSchema = s.looseObject("A JSON object returned by Cursor.");
const nonEmptyString = (description: string) => s.nonEmptyString(description);
const positiveInteger = (description: string, maximum?: number) =>
  s.positiveInteger(description, maximum === undefined ? {} : { maximum });

const pageSchema = positiveInteger("The 1-indexed page number to request.");
const pageSizeSchema = positiveInteger("The number of records to return per page.", 500);

const teamMemberSchema = s.object(
  {
    id: s.integer("The unique Cursor team member ID."),
    email: s.email("The team member email address."),
    name: s.string("The team member display name."),
    role: s.string("The team role such as member or owner."),
    isRemoved: s.boolean("Whether this member has been removed from the team."),
  },
  { required: ["id", "email"], optional: ["name", "role", "isRemoved"], description: "A Cursor team member." },
);

const paginationSchema = s.looseObject("Cursor pagination metadata.", {
  page: s.integer("The current 1-indexed page number."),
  pageSize: s.integer("The number of records requested per page."),
  totalCount: s.integer("The total number of matching records."),
  totalUsers: s.integer("The total number of matching users."),
  totalPages: s.integer("The total number of result pages."),
  hasNextPage: s.boolean("Whether another result page is available."),
  hasPreviousPage: s.boolean("Whether a previous result page is available."),
});

const auditEventSchema = s.looseObject("A Cursor audit log event.", {
  event_id: s.string("The Cursor audit event ID."),
  timestamp: s.dateTime("The event timestamp."),
  ip_address: s.string("The IP address associated with the event."),
  user_email: s.email("The user email address associated with the event."),
  event_type: s.string("The Cursor audit event type."),
  event_data: rawObjectSchema,
});

const dailyUsageRowSchema = s.looseObject("A Cursor daily usage row.", {
  userId: s.integer("The Cursor user ID."),
  day: s.date("The day covered by this usage row."),
  date: s.integer("The day timestamp in epoch milliseconds."),
  email: s.email("The user email address."),
  isActive: s.boolean("Whether the user had activity on this day."),
  totalLinesAdded: s.integer("The total lines added."),
  totalLinesDeleted: s.integer("The total lines deleted."),
  acceptedLinesAdded: s.integer("The AI-suggested added lines that were accepted."),
  acceptedLinesDeleted: s.integer("The AI-suggested deleted lines that were accepted."),
  totalApplies: s.integer("The total AI code apply actions."),
  totalAccepts: s.integer("The total accepted AI suggestions."),
  totalRejects: s.integer("The total rejected AI suggestions."),
  totalTabsShown: s.integer("The total Tab completions shown."),
  totalTabsAccepted: s.integer("The total Tab completions accepted."),
  composerRequests: s.integer("The number of Composer requests."),
  chatRequests: s.integer("The number of chat requests."),
  agentRequests: s.integer("The number of Agent mode requests."),
  cmdkUsages: s.integer("The number of Cmd+K inline edit uses."),
  subscriptionIncludedReqs: s.integer("The subscription-included request count."),
  apiKeyReqs: s.integer("The API key request count."),
  usageBasedReqs: s.integer("The usage-based request count."),
  bugbotUsages: s.integer("The Bugbot usage count."),
  mostUsedModel: s.nullableString("The most frequently used model for the day."),
  applyMostUsedExtension: s.nullableString("The most common file extension for apply actions."),
  tabMostUsedExtension: s.nullableString("The most common file extension for Tab completions."),
  clientVersion: s.nullableString("The Cursor client version used."),
});

const spendRowSchema = s.looseObject("A Cursor team member spending row.", {
  userId: s.integer("The Cursor user ID."),
  name: s.string("The user display name."),
  email: s.email("The user email address."),
  role: s.string("The team role such as member or owner."),
  spendCents: s.number("The on-demand spend in cents for the current billing cycle."),
  overallSpendCents: s.number("The total spend in cents for the current billing cycle, including included usage."),
  fastPremiumRequests: s.integer("The number of usage-based premium requests."),
  hardLimitOverrideDollars: s.number("The custom hard spending limit override in dollars."),
  monthlyLimitDollars: s.nullableNumber("The monthly spending limit in dollars, or null when none is set."),
});

export const cursorActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_team_members",
    description: "List Cursor team members visible to the team API key.",
    inputSchema: s.object({}, { description: "The input for listing Cursor team members." }),
    outputSchema: s.object(
      {
        teamMembers: s.array(teamMemberSchema, { description: "The Cursor team members." }),
        raw: rawObjectSchema,
      },
      { required: ["teamMembers", "raw"], description: "The Cursor team members response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_audit_logs",
    description: "List Cursor team audit log events with optional time, event type, user, search, and page filters.",
    inputSchema: s.object(
      {
        startTime: nonEmptyString("The start time as a Cursor date shortcut, ISO timestamp, date, or Unix timestamp."),
        endTime: nonEmptyString("The end time as a Cursor date shortcut, ISO timestamp, date, or Unix timestamp."),
        eventTypes: s.stringArray("Cursor audit event types to include.", { minItems: 1 }),
        search: nonEmptyString("A search term used to filter audit events."),
        page: pageSchema,
        pageSize: pageSizeSchema,
        users: s.stringArray("User emails or encoded Cursor user IDs to filter by.", { minItems: 1 }),
      },
      {
        optional: ["startTime", "endTime", "eventTypes", "search", "page", "pageSize", "users"],
        description: "The input for listing Cursor audit logs.",
      },
    ),
    outputSchema: s.object(
      {
        events: s.array(auditEventSchema, { description: "The Cursor audit log events." }),
        pagination: paginationSchema,
        params: rawObjectSchema,
        raw: rawObjectSchema,
      },
      {
        required: ["events", "pagination", "raw"],
        optional: ["params"],
        description: "The Cursor audit logs response.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_daily_usage_data",
    description: "Retrieve Cursor daily usage metrics for a team over a date range of up to 30 days.",
    inputSchema: s.object(
      {
        startDate: s.integer("The inclusive start date in epoch milliseconds."),
        endDate: s.integer("The inclusive end date in epoch milliseconds."),
        page: pageSchema,
        pageSize: positiveInteger("The number of users to return per page.", 1000),
      },
      {
        required: ["startDate", "endDate"],
        optional: ["page", "pageSize"],
        description: "The input for retrieving Cursor daily usage data.",
      },
    ),
    outputSchema: s.object(
      {
        data: s.array(dailyUsageRowSchema, { description: "The Cursor daily usage rows." }),
        period: rawObjectSchema,
        pagination: paginationSchema,
        raw: rawObjectSchema,
      },
      {
        required: ["data", "period", "raw"],
        optional: ["pagination"],
        description: "The Cursor daily usage data response.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_team_spend",
    description:
      "Retrieve Cursor team spending for the current billing cycle with optional search, sort, and pagination.",
    inputSchema: s.object(
      {
        searchTerm: nonEmptyString("Search text matched against user names and emails."),
        sortBy: s.stringEnum("The field used to sort spending rows.", ["amount", "date", "user"]),
        sortDirection: s.stringEnum("The sort direction for spending rows.", ["asc", "desc"]),
        page: pageSchema,
        pageSize: positiveInteger("The number of spending rows to return per page."),
      },
      {
        optional: ["searchTerm", "sortBy", "sortDirection", "page", "pageSize"],
        description: "The input for retrieving Cursor team spending.",
      },
    ),
    outputSchema: s.object(
      {
        teamMemberSpend: s.array(spendRowSchema, { description: "The Cursor team member spending rows." }),
        subscriptionCycleStart: s.integer("The current subscription cycle start timestamp in epoch milliseconds."),
        totalMembers: s.integer("The total number of matching team members."),
        totalPages: s.integer("The total number of spending pages."),
        raw: rawObjectSchema,
      },
      {
        required: ["teamMemberSpend", "subscriptionCycleStart", "totalMembers", "totalPages", "raw"],
        description: "The Cursor team spending response.",
      },
    ),
  }),
];
