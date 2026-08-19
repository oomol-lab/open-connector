import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "adafruit_io";

const usernameSchema = s.string("The Adafruit IO username. Defaults to the connected account username.", {
  minLength: 1,
  pattern: "\\S",
});

const feedKeySchema = s.string("The Adafruit IO feed key.", {
  minLength: 1,
  pattern: "\\S",
});

const includeFieldSchema = s.stringEnum("One feed data field to include in the Adafruit IO response.", [
  "value",
  "lat",
  "lon",
  "ele",
  "id",
  "created_at",
]);

const emptyInputSchema = s.object("This action does not require any input.", {});

const usernameInputSchema = s.object(
  "The input payload for selecting an Adafruit IO account username.",
  {
    username: usernameSchema,
  },
  { optional: ["username"] },
);

const feedInputSchema = s.object(
  "The input payload for selecting an Adafruit IO feed.",
  {
    username: usernameSchema,
    feedKey: feedKeySchema,
  },
  { optional: ["username"] },
);

const listFeedDataInputSchema = s.object(
  "The input payload for listing Adafruit IO feed data points.",
  {
    username: usernameSchema,
    feedKey: feedKeySchema,
    startTime: s.dateTime("Return records created after this timestamp."),
    endTime: s.dateTime("Return records created before this timestamp."),
    limit: s.positiveInteger("The maximum number of data records to return."),
    include: s.array("The data fields to include in each returned record.", includeFieldSchema, {
      minItems: 1,
    }),
  },
  { optional: ["username", "startTime", "endTime", "limit", "include"] },
);

const createFeedDataInputSchema = s.object(
  "The input payload for creating an Adafruit IO feed data point.",
  {
    username: usernameSchema,
    feedKey: feedKeySchema,
    value: s.anyOf("The data value to send to the feed.", [
      s.string("A string feed value."),
      s.number("A numeric feed value."),
      s.boolean("A boolean feed value."),
    ]),
    createdAt: s.dateTime("The creation timestamp to attach to the data point."),
    lat: s.number("The latitude value to attach to the data point."),
    lon: s.number("The longitude value to attach to the data point."),
    ele: s.number("The elevation value to attach to the data point."),
    epoch: s.number("The epoch timestamp to attach to the data point."),
  },
  { optional: ["username", "createdAt", "lat", "lon", "ele", "epoch"] },
);

const userSchema = s.object("A normalized Adafruit IO user.", {
  id: s.nullableNumber("The Adafruit IO user id."),
  username: s.string("The Adafruit IO username."),
  name: s.nullableString("The display name for the Adafruit IO user."),
  color: s.nullableString("The Adafruit IO profile color."),
  timeZone: s.nullableString("The user's configured time zone."),
  createdAt: s.nullableString("The user creation timestamp."),
  updatedAt: s.nullableString("The user update timestamp."),
  raw: s.looseObject("The raw user object returned by Adafruit IO."),
});

const feedSchema = s.object("A normalized Adafruit IO feed.", {
  id: s.nullableNumber("The Adafruit IO feed id."),
  key: s.string("The Adafruit IO feed key."),
  name: s.nullableString("The feed name."),
  description: s.nullableString("The feed description."),
  unitType: s.nullableString("The feed unit type."),
  unitSymbol: s.nullableString("The feed unit symbol."),
  visibility: s.nullableString("The feed visibility value."),
  lastValue: s.nullableString("The latest feed value when returned."),
  status: s.nullableString("The feed status when returned."),
  history: s.nullableBoolean("Whether feed history is enabled."),
  enabled: s.nullableBoolean("Whether the feed is enabled."),
  createdAt: s.nullableString("The feed creation timestamp."),
  updatedAt: s.nullableString("The feed update timestamp."),
  raw: s.looseObject("The raw feed object returned by Adafruit IO."),
});

const dataPointSchema = s.object("A normalized Adafruit IO feed data point.", {
  id: s.nullableString("The Adafruit IO data point id."),
  value: s.nullableString("The feed data value."),
  feedId: s.nullableNumber("The feed id associated with this data point."),
  groupId: s.nullableNumber("The group id associated with this data point."),
  expiration: s.nullableString("The data point expiration value when returned."),
  lat: s.nullableNumber("The latitude value when returned."),
  lon: s.nullableNumber("The longitude value when returned."),
  ele: s.nullableNumber("The elevation value when returned."),
  completedAt: s.nullableString("The completion timestamp when returned."),
  createdAt: s.nullableString("The creation timestamp when returned."),
  updatedAt: s.nullableString("The update timestamp when returned."),
  createdEpoch: s.nullableNumber("The creation timestamp as an epoch value."),
  raw: s.looseObject("The raw data point object returned by Adafruit IO."),
});

export const adafruitIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current Adafruit IO user for the connected API key.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The current Adafruit IO user response.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_feeds",
    description: "List Adafruit IO feeds for a username.",
    inputSchema: usernameInputSchema,
    outputSchema: s.object("The Adafruit IO feeds response.", {
      feeds: s.array("The feeds returned by Adafruit IO.", feedSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_feed",
    description: "Get one Adafruit IO feed by feed key.",
    inputSchema: feedInputSchema,
    outputSchema: s.object("The Adafruit IO feed response.", {
      feed: feedSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_feed_data",
    description: "List data points for an Adafruit IO feed.",
    inputSchema: listFeedDataInputSchema,
    outputSchema: s.object("The Adafruit IO feed data list response.", {
      data: s.array("The data points returned by Adafruit IO.", dataPointSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_feed_data",
    description: "Create a new data point on an Adafruit IO feed.",
    inputSchema: createFeedDataInputSchema,
    outputSchema: s.object("The Adafruit IO created data point response.", {
      data: dataPointSchema,
    }),
  }),
];
