import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jiminny";

const activityIdSchema = s.uuid("The Jiminny activity UUID to retrieve reporting data for.");
const dateTimeString = (description: string) => s.nonEmptyString(description);
const pageSchema = s.positiveInteger("Page number to retrieve. Jiminny pages start at 1.");
const activityStatusSchema = s.stringEnum("Filter activities by Jiminny processing status.", [
  "received",
  "sent",
  "delivered",
  "in-progress",
  "completed",
]);
const generatedAvailabilityStatusSchema = (artifactName: string) =>
  s.stringEnum(`Whether Jiminny returned ${artifactName}, has no ${artifactName}, or is still generating it.`, [
    "available",
    "not_available",
    "generating",
  ]);

const emptyInputSchema = (description: string) => s.object(description, {});
const activityIdInputSchema = (description: string) =>
  s.object(description, {
    activityId: activityIdSchema,
  });

const upstreamObjectSchema = (description: string) => s.looseObject(description);
const upstreamArrayItemSchema = (description: string) => s.looseObject(description);
const metadataSchema = s.looseObject(
  "Pagination metadata returned by Jiminny, including page, pageSize, maxPage, and nextPage when available.",
);
const failedRecordsSchema = s.array(
  "Upstream record IDs that Jiminny could not build for the current page.",
  s.string("The upstream record ID that failed while building the response."),
);

const dateRangeInputProperties = {
  fromDate: dateTimeString("Start of the UTC date-time range accepted by Jiminny."),
  toDate: dateTimeString("End of the UTC date-time range accepted by Jiminny."),
};

const optionalUserDateRangeInputSchema = s.object(
  "Optional user and date filters for a Jiminny reporting endpoint.",
  {
    userId: s.uuid("Filter results by Jiminny user UUID."),
    ...dateRangeInputProperties,
  },
  { optional: ["userId", "fromDate", "toDate"] },
);

const listActivitiesInputSchema = {
  ...s.object(
    "Filters for listing completed and processed Jiminny activities. Provide either fromDate and toDate, or updatedFrom with optional updatedTo.",
    {
      fromDate: dateTimeString("Filter activities that happened on or after this UTC date-time. Use with toDate."),
      toDate: dateTimeString("Filter activities that happened on or before this UTC date-time. Use with fromDate."),
      updatedFrom: dateTimeString(
        "Filter activities updated on or after this UTC date-time. Use with updatedTo when available.",
      ),
      updatedTo: dateTimeString(
        "Filter activities updated on or before this UTC date-time. Jiminny defaults it when omitted.",
      ),
      status: activityStatusSchema,
      page: pageSchema,
      accountId: s.nonEmptyString(
        "Filter activities by the external CRM account ID scoped to the Jiminny organization.",
      ),
      opportunityId: s.nonEmptyString(
        "Filter activities by the external CRM opportunity or deal ID scoped to the Jiminny organization.",
      ),
    },
    {
      optional: ["fromDate", "toDate", "updatedFrom", "updatedTo", "status", "page", "accountId", "opportunityId"],
    },
  ),
  anyOf: [{ required: ["fromDate", "toDate"] }, { required: ["updatedFrom"] }],
};

const listAiScorecardsInputSchema = s.object(
  "Date range and page filters for listing Jiminny AI scorecard results.",
  {
    ...dateRangeInputProperties,
    page: pageSchema,
  },
  { optional: ["page"] },
);

const listListensInputSchema = s.object(
  "Date range and optional user filter for listing Jiminny listened activity data.",
  {
    ...dateRangeInputProperties,
    userId: s.uuid("Filter listened activity data by Jiminny user UUID."),
  },
  { optional: ["userId"] },
);

const listCoachingFeedbackInputSchema = s.object(
  "Date range and optional coach filters for listing Jiminny coaching feedback.",
  {
    ...dateRangeInputProperties,
    coachId: s.uuid("Filter coaching feedback by Jiminny coach user UUID."),
    coacheeId: s.uuid("Filter coaching feedback by Jiminny coachee user UUID."),
  },
  { optional: ["coachId", "coacheeId"] },
);

const organizationOutputSchema = s.object("The current Jiminny organization.", {
  organization: upstreamObjectSchema("The organization payload returned by Jiminny."),
});
const usersOutputSchema = s.object(
  "The Jiminny users response.",
  {
    users: s.array("Users returned by Jiminny.", upstreamArrayItemSchema("One Jiminny user record.")),
    links: upstreamObjectSchema("Navigation links returned by Jiminny for the users response."),
  },
  { optional: ["links"] },
);
const activityOutputSchema = s.object("The Jiminny activity response.", {
  activity: upstreamObjectSchema("The activity payload returned by Jiminny."),
});
const activityPageOutputSchema = s.object(
  "The Jiminny activities page.",
  {
    activities: s.array("Activities returned by Jiminny.", upstreamArrayItemSchema("One Jiminny activity record.")),
    metadata: metadataSchema,
    failed: failedRecordsSchema,
  },
  { optional: ["metadata", "failed"] },
);
const transcriptionOutputSchema = s.object("The Jiminny transcription response.", {
  segments: s.array(
    "Transcription segments returned by Jiminny.",
    upstreamArrayItemSchema("One Jiminny transcription segment."),
  ),
});
const summaryOutputSchema = s.object("The Jiminny summary response.", {
  summary: s.nullable(
    s.looseObject("The summary payload returned by Jiminny, including content when available.", {
      content: s.string("The generated summary content."),
    }),
  ),
  summaryStatus: generatedAvailabilityStatusSchema("a summary"),
});
const actionItemsOutputSchema = s.object("The Jiminny action items response.", {
  actionItems: s.nullable(
    s.looseObject("The action items payload returned by Jiminny.", {
      content: s.array("Action item text entries returned by Jiminny.", s.string("One action item.")),
    }),
  ),
  actionItemsStatus: generatedAvailabilityStatusSchema("action items"),
});
const topicTriggersOutputSchema = s.object("The Jiminny topic triggers response.", {
  topicTriggers: s.array(
    "Topic trigger definitions returned by Jiminny.",
    upstreamArrayItemSchema("One Jiminny topic trigger definition."),
  ),
});
const matchedTopicTriggersOutputSchema = s.object("The matched Jiminny topic triggers response.", {
  matchedTopicTriggers: s.array(
    "Topic trigger matches returned by Jiminny for the activity.",
    upstreamArrayItemSchema("One matched Jiminny topic trigger record."),
  ),
});
const questionsOutputSchema = s.object("The Jiminny playback questions response.", {
  questions: s.array(
    "Playback questions returned by Jiminny.",
    upstreamArrayItemSchema("One Jiminny playback question."),
  ),
});
const aiScorecardOutputSchema = s.object("The Jiminny AI scorecard response.", {
  aiScorecard: s.nullable(upstreamObjectSchema("The AI scorecard result returned by Jiminny.")),
});
const aiScorecardPageOutputSchema = s.object(
  "The Jiminny AI scorecards page.",
  {
    scorecardResults: s.array(
      "AI scorecard results returned by Jiminny.",
      upstreamArrayItemSchema("One Jiminny AI scorecard result."),
    ),
    metadata: metadataSchema,
  },
  { optional: ["metadata"] },
);
const listensOutputSchema = s.object(
  "The Jiminny listened activity data page.",
  {
    listens: s.array(
      "Listened activity records returned by Jiminny.",
      upstreamArrayItemSchema("One Jiminny listened activity record."),
    ),
    metadata: metadataSchema,
    failed: failedRecordsSchema,
  },
  { optional: ["metadata", "failed"] },
);
const scoringOutputSchema = s.object(
  "The Jiminny automated call scoring page.",
  {
    scoringResults: s.array(
      "Automated call scoring records returned by Jiminny.",
      upstreamArrayItemSchema("One Jiminny automated call scoring record."),
    ),
    metadata: metadataSchema,
    failed: failedRecordsSchema,
  },
  { optional: ["metadata", "failed"] },
);
const commentsOutputSchema = s.object(
  "The Jiminny comments page.",
  {
    comments: s.array(
      "Comment records returned by Jiminny.",
      upstreamArrayItemSchema("One Jiminny activity comment record."),
    ),
    metadata: metadataSchema,
    failed: failedRecordsSchema,
  },
  { optional: ["metadata", "failed"] },
);
const coachingFeedbackOutputSchema = s.object(
  "The Jiminny coaching feedback page.",
  {
    coachingFeedback: s.array(
      "Coaching feedback records returned by Jiminny.",
      upstreamArrayItemSchema("One Jiminny coaching feedback record."),
    ),
    metadata: metadataSchema,
    failed: failedRecordsSchema,
  },
  { optional: ["metadata", "failed"] },
);

export const jiminnyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_organization",
    description: "Return the current authenticated Jiminny organization.",
    inputSchema: emptyInputSchema("No input is required to retrieve the current organization."),
    outputSchema: organizationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Jiminny users for the authenticated organization.",
    inputSchema: emptyInputSchema("No input is required to list Jiminny users."),
    outputSchema: usersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_activities",
    description: "List completed and processed Jiminny activities with date and CRM filters.",
    inputSchema: listActivitiesInputSchema,
    outputSchema: activityPageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_activity",
    description: "Retrieve one Jiminny activity by activity UUID.",
    inputSchema: activityIdInputSchema("Activity lookup parameters."),
    outputSchema: activityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_transcription",
    description: "Retrieve transcription segments for a Jiminny activity.",
    inputSchema: activityIdInputSchema("Activity transcription lookup parameters."),
    outputSchema: transcriptionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_summary",
    description: "Retrieve the generated summary for a Jiminny activity.",
    inputSchema: activityIdInputSchema("Activity summary lookup parameters."),
    outputSchema: summaryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_action_items",
    description: "Retrieve generated action items for a Jiminny activity.",
    inputSchema: activityIdInputSchema("Activity action item lookup parameters."),
    outputSchema: actionItemsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_topic_triggers",
    description: "List Jiminny topic trigger definitions for the authenticated organization.",
    inputSchema: emptyInputSchema("No input is required to list Jiminny topic triggers."),
    outputSchema: topicTriggersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_matched_topic_triggers",
    description: "List topic trigger matches for a Jiminny activity.",
    inputSchema: activityIdInputSchema("Activity matched topic trigger lookup parameters."),
    outputSchema: matchedTopicTriggersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_questions",
    description: "List playback questions detected in a Jiminny activity.",
    inputSchema: activityIdInputSchema("Activity playback question lookup parameters."),
    outputSchema: questionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_ai_scorecard",
    description: "Retrieve AI scorecard results for a Jiminny activity.",
    inputSchema: activityIdInputSchema("Activity AI scorecard lookup parameters."),
    outputSchema: aiScorecardOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_ai_scorecards",
    description: "List Jiminny AI scorecard results completed within a date range.",
    inputSchema: listAiScorecardsInputSchema,
    outputSchema: aiScorecardPageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_listens",
    description: "List listened activity data for a Jiminny date range.",
    inputSchema: listListensInputSchema,
    outputSchema: listensOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_automated_call_scoring",
    description: "List Jiminny automated call scoring records with optional filters.",
    inputSchema: optionalUserDateRangeInputSchema,
    outputSchema: scoringOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_comments",
    description: "List Jiminny activity comments with optional user and date filters.",
    inputSchema: optionalUserDateRangeInputSchema,
    outputSchema: commentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_coaching_feedback",
    description: "List Jiminny coaching feedback records for a required date range.",
    inputSchema: listCoachingFeedbackInputSchema,
    outputSchema: coachingFeedbackOutputSchema,
  }),
];
