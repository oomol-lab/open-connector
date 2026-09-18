import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "timebuzzer";
const positiveId = (description: string) => s.positiveInteger(description);
const utcOffset = (description: string) => s.string({ description, pattern: "^[+-][0-9]{2}:[0-9]{2}$" });
const activitySchema = s.object(
  "A timeBuzzer time activity.",
  {
    id: positiveId("The activity ID."),
    tiles: s.array("The tile IDs assigned in layer order.", positiveId("A tile ID."), { maxItems: 3 }),
    startDate: s.dateTime("The activity start time in UTC."),
    endDate: s.dateTime("The activity end time in UTC."),
    startUtcOffset: utcOffset("The UTC offset at the activity start."),
    endUtcOffset: utcOffset("The UTC offset at the activity end."),
    note: s.string("The activity note."),
    userId: positiveId("The ID of the user who owns the activity."),
    billed: s.boolean("Whether the activity is billed."),
    customData: s.nullableString("Provider-defined custom data attached to the activity."),
  },
  {
    required: ["id", "tiles", "startDate", "endDate", "startUtcOffset", "endUtcOffset", "note", "userId"],
    additionalProperties: true,
  },
);
const activityWriteFields = {
  tiles: s.array("The tile IDs to assign in layer order, with at most one tile per layer.", positiveId("A tile ID."), {
    minItems: 1,
    maxItems: 3,
  }),
  startDate: s.dateTime("The activity start time in UTC."),
  endDate: s.dateTime("The activity end time in UTC."),
  startUtcOffset: utcOffset("The UTC offset at the activity start, such as +02:00."),
  endUtcOffset: utcOffset("The UTC offset at the activity end, such as +02:00."),
  note: s.string("The activity note."),
  userId: positiveId("The ID of the user who owns the activity."),
  billed: s.boolean("Whether the activity is billed."),
  customData: s.nullableString("Optional provider-defined custom data for the activity."),
};
const requiredWriteFields = ["tiles", "startDate", "endDate", "startUtcOffset", "endUtcOffset", "note", "userId"];
const mutationOutput = s.requiredObject("The result of a timeBuzzer mutation.", {
  success: s.boolean("Whether timeBuzzer accepted the mutation."),
});

export const timebuzzerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get the timeBuzzer user associated with the connected API key.",
    inputSchema: s.object("No input is required to get the current user.", {}),
    outputSchema: s.object(
      "The current timeBuzzer user profile.",
      {
        id: positiveId("The current user ID."),
        email: s.email("The current user's email address."),
        firstName: s.string("The current user's first name."),
        lastName: s.string("The current user's last name."),
        accountId: positiveId("The timeBuzzer account ID."),
        permissions: s.stringArray("The permissions granted to the current user.", {
          itemDescription: "A permission name.",
        }),
        state: s.string("The current user state."),
      },
      { required: ["id", "accountId"], additionalProperties: true },
    ),
  }),
  defineProviderAction(service, {
    name: "list_layers",
    operationType: "read",
    description: "List the timeBuzzer layers that organize tiles in hierarchy order.",
    inputSchema: s.object("No input is required to list layers.", {}),
    outputSchema: s.requiredObject("The timeBuzzer layers visible to the connected user.", {
      layers: s.array(
        "The returned layers.",
        s.object(
          "A timeBuzzer layer.",
          {
            id: positiveId("The layer ID."),
            name: s.string("The layer name."),
            visible: s.boolean("Whether the layer is visible."),
            index: s.nullableInteger("The layer's hierarchy index."),
            parent: s.nullable(positiveId("The parent layer ID.")),
            child: s.nullable(positiveId("The child layer ID.")),
          },
          { required: ["name", "visible"], additionalProperties: true },
        ),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_tiles",
    operationType: "read",
    description: "List timeBuzzer tiles available to the connected user.",
    inputSchema: s.object("Filters for listing timeBuzzer tiles.", {
      archived: s.stringEnum("Which archived state to include.", ["true", "false", "all"]),
    }),
    outputSchema: s.requiredObject("The timeBuzzer tiles visible to the connected user.", {
      tiles: s.array(
        "The returned tiles.",
        s.object(
          "A timeBuzzer tile.",
          {
            id: positiveId("The tile ID."),
            name: s.string("The tile name."),
            layer: positiveId("The layer ID containing the tile."),
            archived: s.boolean("Whether the tile is archived."),
            parents: s.nullable(s.array("The parent tile IDs.", positiveId("A parent tile ID."))),
            children: s.nullable(s.array("The child tile IDs.", positiveId("A child tile ID."))),
          },
          { required: ["name", "layer"], additionalProperties: true },
        ),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_activities",
    operationType: "read",
    description: "List timeBuzzer activities with offset-based pagination.",
    inputSchema: s.object(
      "Pagination and embedding options for listing activities.",
      {
        count: s.positiveInteger("The maximum number of activities to return."),
        offset: s.nonNegativeInteger("The number of activities to skip."),
        embedTiles: s.boolean("Whether each activity should include embedded tile details."),
      },
      { required: ["count"] },
    ),
    outputSchema: s.requiredObject("A page of timeBuzzer activities and aggregate values.", {
      activities: s.array("The returned activities.", activitySchema),
      totalCount: s.nonNegativeInteger("The total number of matching activities."),
      totalDuration: s.number("The total duration of matching activities in milliseconds.", { minimum: 0 }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_activity",
    operationType: "read",
    description: "Get one timeBuzzer activity by ID.",
    inputSchema: s.requiredObject("The activity to retrieve.", {
      activityId: positiveId("The activity ID to retrieve."),
    }),
    outputSchema: activitySchema,
  }),
  defineProviderAction(service, {
    name: "create_activity",
    operationType: "write",
    description: "Create a timeBuzzer activity for a user and an ordered set of tiles.",
    inputSchema: s.object("The timeBuzzer activity to create.", activityWriteFields, { required: requiredWriteFields }),
    outputSchema: activitySchema,
  }),
  defineProviderAction(service, {
    name: "update_activity",
    operationType: "destructive",
    description: "Replace the editable fields of an existing timeBuzzer activity.",
    inputSchema: s.object(
      "The activity ID and replacement activity fields.",
      { activityId: positiveId("The activity ID to update."), ...activityWriteFields },
      { required: ["activityId", ...requiredWriteFields] },
    ),
    outputSchema: mutationOutput,
  }),
  defineProviderAction(service, {
    name: "delete_activity",
    operationType: "destructive",
    description: "Delete a timeBuzzer activity by ID.",
    inputSchema: s.requiredObject("The activity to delete.", { activityId: positiveId("The activity ID to delete.") }),
    outputSchema: mutationOutput,
  }),
];
