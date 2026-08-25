import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "classmarker";

const assignedTestSchema = s.object("A ClassMarker test assigned to a group or link.", {
  testId: s.integer("The ClassMarker test identifier."),
  testName: s.nonEmptyString("The ClassMarker test name."),
  raw: s.looseObject("The raw ClassMarker assigned test payload."),
});
const groupSchema = s.object("A ClassMarker group with its assigned tests.", {
  groupId: s.integer("The ClassMarker group identifier."),
  groupName: s.nonEmptyString("The ClassMarker group name."),
  assignedTests: s.array("The tests assigned to this group.", assignedTestSchema),
  raw: s.looseObject("The raw ClassMarker group payload."),
});
const linkSchema = s.object("A ClassMarker link with its assigned tests.", {
  linkId: s.integer("The ClassMarker link identifier."),
  linkName: s.nullableString("The ClassMarker link name when present."),
  linkUrlId: s.nullableString("The unique link URL identifier when available."),
  quizId: s.nullableString("The quiz URL identifier used to launch the link when available."),
  accessListId: s.nullableInteger("The ClassMarker access list identifier when available."),
  assignedTests: s.array("The tests assigned to this link.", assignedTestSchema),
  raw: s.looseObject("The raw ClassMarker link payload."),
});
const recentGroupSchema = s.object("A recent-results group reference.", {
  groupId: s.integer("The ClassMarker group identifier."),
  groupName: s.nonEmptyString("The ClassMarker group name."),
  raw: s.looseObject("The raw ClassMarker group payload."),
});
const monitorEventSchema = s.object("One ClassMarker monitor event.", {
  timestamp: s.integer("The monitor event timestamp."),
  event: s.nonEmptyString("The event name returned by ClassMarker."),
  secondsAway: s.integer("The seconds away value returned by ClassMarker."),
});
const monitorEventsSchema = s.object("ClassMarker monitor event details.", {
  browserMonitoring: s.nullableString("Whether browser monitoring is enabled or disabled."),
  cameraMonitoring: s.nullableString("Whether camera monitoring is enabled or disabled."),
  totalEventCount: s.nullableInteger("The total number of monitor events."),
  totalSecondsAway: s.nullableInteger("The total number of seconds away from the test."),
  events: s.array("The individual monitor events.", monitorEventSchema),
  raw: s.looseObject("The raw ClassMarker monitor event payload."),
});
const testSummarySchema = s.object("A ClassMarker test summary returned with recent results.", {
  testId: s.integer("The ClassMarker test identifier."),
  testName: s.nonEmptyString("The ClassMarker test name."),
  raw: s.looseObject("The raw ClassMarker test payload."),
});
const recentResultSchema = s.object("A normalized ClassMarker recent result.", {
  userId: s.nullableInteger("The ClassMarker group user identifier when present."),
  firstName: s.nullableString("The learner first name when present."),
  lastName: s.nullableString("The learner last name when present."),
  email: s.nullableString("The learner email when present."),
  testId: s.integer("The ClassMarker test identifier."),
  groupId: s.nullableInteger("The group identifier when the result came from a group."),
  linkId: s.nullableInteger("The link identifier when the result came from a link."),
  percentage: s.nullableNumber("The percentage score."),
  pointsScored: s.nullableNumber("The points scored."),
  pointsAvailable: s.nullableNumber("The total available points."),
  timeStarted: s.nullableInteger("The UNIX timestamp when the attempt started."),
  timeFinished: s.nullableInteger("The UNIX timestamp when the attempt finished."),
  status: s.nullableString("The ClassMarker attempt status code."),
  duration: s.nullableString("The formatted attempt duration."),
  percentagePassmark: s.nullableNumber("The required passmark percentage."),
  passed: s.nullableBoolean("Whether the learner passed."),
  requiresGrading: s.nullableString("Whether the result still requires manual grading according to ClassMarker."),
  giveCertificateOnlyWhenPassed: s.nullableBoolean("Whether certificates are only issued when the learner passes."),
  certificateUrl: s.nullableString("The certificate URL when available."),
  certificateSerial: s.nullableString("The certificate serial when available."),
  viewResultsUrl: s.nullableString("The URL for viewing the result when available."),
  testType: s.nullableString("The ClassMarker test type label."),
  accessCode: s.nullableString("The access code used for link results when available."),
  cmUserId: s.nullableString("The external ClassMarker user identifier when available."),
  ipAddress: s.nullableString("The learner IP address when available."),
  extraInfo: s.nullableString("The first extra info field when available."),
  extraInfo2: s.nullableString("The second extra info field when available."),
  extraInfo3: s.nullableString("The third extra info field when available."),
  extraInfo4: s.nullableString("The fourth extra info field when available."),
  extraInfo5: s.nullableString("The fifth extra info field when available."),
  monitorEvents: s.nullable(monitorEventsSchema),
  raw: s.looseObject("The raw ClassMarker result payload."),
});
const recentResultsInputSchema = s.actionInput(
  {
    finishedAfterTimestamp: s.integer("The UNIX timestamp in seconds used to fetch only newer ClassMarker results."),
    limit: s.positiveInteger("The maximum number of recent results to request."),
  },
  ["finishedAfterTimestamp", "limit"],
  "The shared input for recent ClassMarker results.",
);
const recentResultsOutputSchema = s.object("Recent ClassMarker results.", {
  requestPath: s.nonEmptyString("The ClassMarker request path."),
  serverTimestamp: s.integer("The ClassMarker server timestamp."),
  finishedAfterTimestampUsed: s.nullableInteger("The finishedAfterTimestamp value that ClassMarker actually used."),
  groups: s.array("The groups referenced by the recent results.", recentGroupSchema),
  tests: s.array("The tests referenced by the recent results.", testSummarySchema),
  results: s.array("The recent ClassMarker results.", recentResultSchema),
  numResultsAvailable: s.nullableInteger("The total number of results available to download."),
  numResultsReturned: s.nullableInteger("The number of results returned in this response."),
  moreResultsExist: s.nullableBoolean("Whether more results exist for the next finishedAfterTimestamp request."),
  nextFinishedAfterTimestamp: s.nullableInteger(
    "The timestamp to use for the next incremental recent-results request.",
  ),
});

export const classmarkerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_groups_links_and_tests",
    description: "List the ClassMarker groups, links, and assigned tests that the current API key can access.",
    inputSchema: s.actionInput({}, [], "No input is required for listing ClassMarker groups and links."),
    outputSchema: s.object("The groups, links, and assigned tests available to the API key.", {
      requestPath: s.nonEmptyString("The ClassMarker request path."),
      serverTimestamp: s.integer("The ClassMarker server timestamp."),
      groups: s.array("The groups accessible to the API key.", groupSchema),
      links: s.array("The links accessible to the API key.", linkSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_recent_group_results",
    description: "List recent ClassMarker results across all groups the current API key can access.",
    inputSchema: recentResultsInputSchema,
    outputSchema: recentResultsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_recent_link_results",
    description: "List recent ClassMarker results across all links the current API key can access.",
    inputSchema: recentResultsInputSchema,
    outputSchema: recentResultsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_recent_results_for_group_test",
    description: "List recent ClassMarker results for one specific group and assigned test pair.",
    inputSchema: s.actionInput(
      {
        groupId: s.positiveInteger("The ClassMarker group identifier."),
        testId: s.positiveInteger("The ClassMarker test identifier."),
        finishedAfterTimestamp: s.integer(
          "The UNIX timestamp in seconds used to fetch only newer ClassMarker results.",
        ),
        limit: s.positiveInteger("The maximum number of recent results to request."),
      },
      ["groupId", "testId", "finishedAfterTimestamp", "limit"],
      "The identifiers for one ClassMarker group test pair.",
    ),
    outputSchema: recentResultsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_recent_results_for_link_test",
    description: "List recent ClassMarker results for one specific link and assigned test pair.",
    inputSchema: s.actionInput(
      {
        linkId: s.positiveInteger("The ClassMarker link identifier."),
        testId: s.positiveInteger("The ClassMarker test identifier."),
        finishedAfterTimestamp: s.integer(
          "The UNIX timestamp in seconds used to fetch only newer ClassMarker results.",
        ),
        limit: s.positiveInteger("The maximum number of recent results to request."),
      },
      ["linkId", "testId", "finishedAfterTimestamp", "limit"],
      "The identifiers for one ClassMarker link test pair.",
    ),
    outputSchema: recentResultsOutputSchema,
  }),
];
