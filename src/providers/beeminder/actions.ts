import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "beeminder";

const usernameSchema = s.nonEmptyString("The Beeminder username, or me for the authenticated user.");
const goalSlugSchema = s.nonEmptyString("The Beeminder goal slug.");
const datapointIdSchema = s.nonEmptyString("The Beeminder datapoint ID.");
const unixTimestampSchema = s.integer("A Unix timestamp in seconds.", {
  minimum: 0,
});
const rawObjectSchema = s.looseObject("The raw object returned by Beeminder.");

const userSchema = s.object(
  "A normalized Beeminder user.",
  {
    username: s.string("The Beeminder username."),
    timezone: s.nullableString("The user's timezone when returned."),
    updated_at: s.nullableInteger("The user's last update timestamp when returned."),
    goals: s.array(
      "The user's goals, either as slugs or expanded goal objects depending on request options.",
      s.anyOf("A goal slug or expanded goal object.", [s.string("A Beeminder goal slug."), rawObjectSchema]),
    ),
    deadbeat: s.nullableBoolean("Whether Beeminder reports failed or out-of-date payment information."),
    urgency_load: s.nullableNumber("The user's Beeminder urgency load score."),
    deleted_goals: s.nullable(s.array("Deleted goals returned when diff_since is used.", rawObjectSchema)),
    raw: rawObjectSchema,
  },
  { required: ["username", "timezone", "updated_at", "goals", "deadbeat", "urgency_load", "deleted_goals", "raw"] },
);

const goalSchema = s.object(
  "A normalized Beeminder goal.",
  {
    id: s.nullableString("The immutable Beeminder goal ID when returned."),
    slug: s.string("The Beeminder goal slug."),
    title: s.nullableString("The goal title when returned."),
    goal_type: s.nullableString("The Beeminder goal type when returned."),
    graph_url: s.nullableString("The goal graph URL when returned."),
    svg_url: s.nullableString("The goal SVG URL when returned."),
    thumb_url: s.nullableString("The goal thumbnail URL when returned."),
    updated_at: s.nullableInteger("The goal update timestamp when returned."),
    losedate: s.nullableInteger("The derailment timestamp when returned."),
    goaldate: s.nullableInteger("The target date timestamp when returned."),
    datapoints: s.nullable(s.array("Datapoints included with the goal when requested.", rawObjectSchema)),
    raw: rawObjectSchema,
  },
  {
    required: [
      "id",
      "slug",
      "title",
      "goal_type",
      "graph_url",
      "svg_url",
      "thumb_url",
      "updated_at",
      "losedate",
      "goaldate",
      "datapoints",
      "raw",
    ],
  },
);

const datapointSchema = s.object(
  "A normalized Beeminder datapoint.",
  {
    id: s.nullableString("The Beeminder datapoint ID when returned."),
    timestamp: s.nullableInteger("The datapoint timestamp when returned."),
    daystamp: s.nullableString("The Beeminder daystamp when returned."),
    value: s.nullableNumber("The datapoint value when returned."),
    comment: s.nullableString("The datapoint comment when returned."),
    requestid: s.nullableString("The idempotency key associated with the datapoint when returned."),
    updated_at: s.nullableInteger("The datapoint update timestamp when returned."),
    raw: rawObjectSchema,
  },
  { required: ["id", "timestamp", "daystamp", "value", "comment", "requestid", "updated_at", "raw"] },
);

export const beeminderActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user",
    description: "Get Beeminder user information, including goals and optional diff-based goal details.",
    inputSchema: s.object(
      "The input payload for reading a Beeminder user.",
      {
        username: usernameSchema,
        associations: s.boolean("Whether to include full goal and datapoint objects instead of only goal slugs."),
        diff_since: unixTimestampSchema,
        skinny: s.boolean(
          "Whether to return slimmer goal attributes and only each goal's latest datapoint with diff_since.",
        ),
        datapoints_count: s.integer("Number of the most recently added datapoints to include for each goal.", {
          minimum: 1,
        }),
      },
      { optional: ["username", "associations", "diff_since", "skinny", "datapoints_count"] },
    ),
    outputSchema: s.object(
      "The response returned when reading a Beeminder user.",
      {
        user: userSchema,
      },
      { required: ["user"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_goals",
    description: "List active Beeminder goals for a user.",
    inputSchema: s.object(
      "The input payload for listing active Beeminder goals.",
      {
        username: usernameSchema,
      },
      { required: ["username"] },
    ),
    outputSchema: s.object(
      "The response returned when listing Beeminder goals.",
      {
        goals: s.array("The active goals returned by Beeminder.", goalSchema),
      },
      { required: ["goals"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_archived_goals",
    description: "List archived Beeminder goals for a user.",
    inputSchema: s.object(
      "The input payload for listing archived Beeminder goals.",
      {
        username: usernameSchema,
      },
      { required: ["username"] },
    ),
    outputSchema: s.object(
      "The response returned when listing archived Beeminder goals.",
      {
        goals: s.array("The archived goals returned by Beeminder.", goalSchema),
      },
      { required: ["goals"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_goal",
    description: "Read one Beeminder goal, optionally including its datapoints.",
    inputSchema: s.object(
      "The input payload for reading a Beeminder goal.",
      {
        username: usernameSchema,
        goal_slug: goalSlugSchema,
        datapoints: s.boolean("Whether Beeminder should include datapoints in the goal response."),
      },
      { optional: ["datapoints"] },
    ),
    outputSchema: s.object(
      "The response returned when reading a Beeminder goal.",
      {
        goal: goalSchema,
      },
      { required: ["goal"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_datapoints",
    description: "List datapoints for one Beeminder goal with optional count or page parameters.",
    inputSchema: s.object(
      "The input payload for listing Beeminder datapoints.",
      {
        username: usernameSchema,
        goal_slug: goalSlugSchema,
        count: s.integer("Maximum number of datapoints to return. Ignored when page is set.", {
          minimum: 0,
        }),
        page: s.integer("Page number for paginated datapoint results.", {
          minimum: 1,
        }),
        per: s.integer("Number of datapoints per page when page is set.", {
          minimum: 1,
        }),
      },
      { optional: ["count", "page", "per"] },
    ),
    outputSchema: s.object(
      "The response returned when listing Beeminder datapoints.",
      {
        datapoints: s.array("The datapoints returned by Beeminder.", datapointSchema),
      },
      { required: ["datapoints"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_datapoint",
    description: "Create one datapoint on a Beeminder goal.",
    inputSchema: s.object(
      "The input payload for creating a Beeminder datapoint.",
      {
        username: usernameSchema,
        goal_slug: goalSlugSchema,
        value: s.number("The datapoint value."),
        timestamp: unixTimestampSchema,
        daystamp: s.nonEmptyString("The datapoint daystamp in YYYYMMDD format."),
        comment: s.nonEmptyString("The datapoint comment."),
        requestid: s.nonEmptyString(
          "A caller-supplied idempotency key scoped to the goal. Reusing it avoids duplicate datapoints.",
        ),
      },
      { optional: ["timestamp", "daystamp", "comment", "requestid"] },
    ),
    outputSchema: s.object(
      "The response returned when creating a Beeminder datapoint.",
      {
        datapoint: datapointSchema,
      },
      { required: ["datapoint"] },
    ),
  }),
  defineProviderAction(service, {
    name: "update_datapoint",
    description: "Update one Beeminder datapoint by ID.",
    inputSchema: s.object(
      "The input payload for updating a Beeminder datapoint.",
      {
        username: usernameSchema,
        goal_slug: goalSlugSchema,
        datapoint_id: datapointIdSchema,
        value: s.number("The updated datapoint value."),
        timestamp: unixTimestampSchema,
        daystamp: s.nonEmptyString("The updated datapoint daystamp in YYYYMMDD format."),
        comment: s.nonEmptyString("The datapoint comment."),
      },
      { optional: ["value", "timestamp", "daystamp", "comment"] },
    ),
    outputSchema: s.object(
      "The response returned when updating a Beeminder datapoint.",
      {
        datapoint: datapointSchema,
      },
      { required: ["datapoint"] },
    ),
  }),
  defineProviderAction(service, {
    name: "delete_datapoint",
    description: "Delete one Beeminder datapoint by ID.",
    inputSchema: s.object(
      "The input payload for deleting a Beeminder datapoint.",
      {
        username: usernameSchema,
        goal_slug: goalSlugSchema,
        datapoint_id: datapointIdSchema,
      },
      { required: ["username", "goal_slug", "datapoint_id"] },
    ),
    outputSchema: s.object(
      "The response returned when deleting a Beeminder datapoint.",
      {
        datapoint: datapointSchema,
      },
      { required: ["datapoint"] },
    ),
  }),
];

export type BeeminderActionName = (typeof beeminderActions)[number]["name"];
