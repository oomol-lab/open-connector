import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "strava";

const rawObjectSchema = s.looseObject("Raw Strava object.");
const rawArraySchema = s.array(rawObjectSchema, { description: "Raw Strava objects." });
const stravaIdSchema = (description: string): JsonSchema =>
  s.anyOf(description, [s.positiveInteger(description), s.nonEmptyString(description)]);
const pageFields = {
  page: s.positiveInteger("Pagination page number, starting from 1."),
  perPage: s.integer("The number of records returned per page.", { minimum: 1, maximum: 200 }),
};
const activityIdInput = s.object(
  { activityId: stravaIdSchema("Activity ID.") },
  { required: ["activityId"], description: "Strava activity ID input." },
);
const routeIdInput = s.object(
  { routeId: stravaIdSchema("Route ID.") },
  { required: ["routeId"], description: "Strava route ID input." },
);
const streamInputFields = {
  keys: s.stringArray("Stream keys to request.", { minItems: 1 }),
  keyByType: s.boolean("Whether Strava should key streams by stream type."),
};
const streamsOutput = s.object(
  { streams: s.unknown("Stream payload returned by Strava.") },
  { required: ["streams"], description: "Strava streams response." },
);
const zonesOutput = s.object({ zones: rawArraySchema }, { required: ["zones"], description: "Strava zones response." });

export const stravaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_authenticated_athlete",
    operationType: "read",
    description: "Get currently authenticated Strava athlete profile.",
    requiredScopes: ["read"],
    inputSchema: s.object({}, { description: "No additional input is required." }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "update_athlete",
    operationType: "write",
    description: "Update current Strava athlete's weight.",
    requiredScopes: ["profile:write"],
    inputSchema: s.object(
      { weight: s.number("Latest weight in kilograms.", { exclusiveMinimum: 0 }) },
      { required: ["weight"], description: "Athlete update input." },
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_athlete_stats",
    operationType: "read",
    description: "Get a summary of statistics for a specified Strava athlete.",
    requiredScopes: ["read"],
    inputSchema: s.object(
      { athleteId: stravaIdSchema("Athlete ID.") },
      { required: ["athleteId"], description: "Athlete statistics query input." },
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_zones",
    operationType: "read",
    description: "Get the current Strava athlete's training zones.",
    requiredScopes: ["profile:read_all"],
    inputSchema: s.object({}, { description: "No additional input is required." }),
    outputSchema: zonesOutput,
  }),
  defineProviderAction(service, {
    name: "list_athlete_activities",
    operationType: "read",
    description: "Paginated list of current Strava athlete activities.",
    requiredScopes: ["activity:read"],
    inputSchema: s.object(
      {
        before: s.integer("Unix timestamp before which activities are returned."),
        after: s.integer("Unix timestamp after which activities are returned."),
        ...pageFields,
      },
      { description: "Activity list input." },
    ),
    outputSchema: listOutput("activities"),
  }),
  defineProviderAction(service, {
    name: "get_activity",
    operationType: "read",
    description: "Get activity details for current Strava athlete by ID.",
    requiredScopes: ["activity:read"],
    inputSchema: s.object(
      {
        activityId: stravaIdSchema("Activity ID."),
        includeAllEfforts: s.boolean("Whether to return all segment efforts."),
      },
      { required: ["activityId"], description: "Activity details input." },
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "update_activity",
    operationType: "write",
    description: "Update activity information for current Strava athlete.",
    requiredScopes: ["activity:write"],
    inputSchema: s.object(
      {
        activityId: stravaIdSchema("Activity ID."),
        activity: s.looseObject("Activity fields to update."),
      },
      { required: ["activityId", "activity"], description: "Activity update input." },
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_activity",
    operationType: "write",
    description: "Create a manually entered Strava activity.",
    requiredScopes: ["activity:write"],
    inputSchema: s.object(
      {
        name: s.nonEmptyString("Activity name."),
        type: s.string("Legacy activity type."),
        sportType: s.nonEmptyString("Activity sport type."),
        startDateLocal: s.nonEmptyString("Event start time."),
        elapsedTime: s.positiveInteger("Total time spent on the activity, in seconds."),
        description: s.string("Activity description."),
        distance: s.number("Activity distance in meters.", { exclusiveMinimum: 0 }),
        trainer: s.boolean("Whether to mark it as a trainer activity."),
        commute: s.boolean("Whether to mark it as commuting."),
      },
      {
        required: ["name", "sportType", "startDateLocal", "elapsedTime"],
        description: "Manual activity creation input.",
      },
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "upload_activity",
    operationType: "write",
    description: "Upload GPX, TCX or FIT files to Strava to generate activities.",
    requiredScopes: ["activity:write"],
    inputSchema: s.object(
      {
        file: s.transitFile("The GPX, TCX or FIT file uploaded through the local transit file API."),
        name: s.string("Generated activity name."),
        description: s.string("Generated activity description."),
        trainer: s.boolean("Whether to mark it as a trainer activity."),
        commute: s.boolean("Whether to mark it as commuting."),
        dataType: s.stringEnum("Upload file format.", ["fit", "fit.gz", "tcx", "tcx.gz", "gpx", "gpx.gz"]),
        externalId: s.string("Custom external ID."),
      },
      { required: ["file", "dataType"], description: "Activity file upload input." },
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_upload",
    operationType: "read",
    description: "Query the status of Strava activity upload tasks.",
    requiredScopes: ["activity:write"],
    inputSchema: s.object(
      { uploadId: stravaIdSchema("Upload task ID.") },
      { required: ["uploadId"], description: "Upload task query input." },
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_activity_streams",
    operationType: "read",
    description: "Get stream data for the specified Strava activity.",
    requiredScopes: ["activity:read"],
    inputSchema: s.object(
      { activityId: stravaIdSchema("Activity ID."), ...streamInputFields },
      { required: ["activityId", "keys"], description: "Activity streams input." },
    ),
    outputSchema: streamsOutput,
  }),
  defineProviderAction(service, {
    name: "get_activity_zones",
    operationType: "read",
    description: "Get the training zones for the specified Strava activity.",
    requiredScopes: ["activity:read"],
    inputSchema: activityIdInput,
    outputSchema: zonesOutput,
  }),
  defineProviderAction(service, {
    name: "list_activity_laps",
    operationType: "read",
    description: "List laps for a given Strava activity.",
    requiredScopes: ["activity:read"],
    inputSchema: activityIdInput,
    outputSchema: listOutput("laps"),
  }),
  defineProviderAction(service, {
    name: "list_activity_comments",
    operationType: "read",
    description: "List comments for the specified Strava activity.",
    requiredScopes: ["activity:read"],
    inputSchema: s.object(
      {
        activityId: stravaIdSchema("Activity ID."),
        ...pageFields,
        pageSize: s.integer("Recommended number of records per page.", { minimum: 1, maximum: 200 }),
        afterCursor: s.string("Cursor for the last record on the previous page."),
      },
      { required: ["activityId"], description: "Activity comment query input." },
    ),
    outputSchema: listOutput("comments"),
  }),
  defineProviderAction(service, {
    name: "list_activity_kudoers",
    operationType: "read",
    description: "List athletes who have liked the specified Strava activity.",
    requiredScopes: ["activity:read"],
    inputSchema: paginatedIdInput("activityId", "Activity ID."),
    outputSchema: listOutput("athletes"),
  }),
  defineProviderAction(service, {
    name: "list_athlete_clubs",
    operationType: "read",
    description: "List the clubs current Strava athlete belongs to.",
    requiredScopes: ["read"],
    inputSchema: s.object(pageFields, { description: "Club list query input." }),
    outputSchema: listOutput("clubs"),
  }),
  defineProviderAction(service, {
    name: "get_club",
    operationType: "read",
    description: "Get Strava club details by ID.",
    requiredScopes: ["read"],
    inputSchema: idInput("clubId", "Club ID."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_club_members",
    operationType: "read",
    description: "Paginated list of Strava club members.",
    requiredScopes: ["read"],
    inputSchema: paginatedIdInput("clubId", "Club ID."),
    outputSchema: listOutput("athletes"),
  }),
  defineProviderAction(service, {
    name: "list_club_administrators",
    operationType: "read",
    description: "Paginated list of Strava club admins.",
    requiredScopes: ["read"],
    inputSchema: paginatedIdInput("clubId", "Club ID."),
    outputSchema: listOutput("athletes"),
  }),
  defineProviderAction(service, {
    name: "list_club_activities",
    operationType: "read",
    description: "Paginated list of recent activity for a given Strava club.",
    requiredScopes: ["read"],
    inputSchema: paginatedIdInput("clubId", "Club ID."),
    outputSchema: listOutput("activities"),
  }),
  defineProviderAction(service, {
    name: "get_equipment",
    operationType: "read",
    description: "Get Strava gear details by ID.",
    requiredScopes: ["profile:read_all"],
    inputSchema: idInput("gearId", "Equipment ID."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_athlete_routes",
    operationType: "read",
    description: "Paginated list of routes for a given Strava athlete.",
    requiredScopes: ["read"],
    inputSchema: paginatedIdInput("athleteId", "Athlete ID."),
    outputSchema: listOutput("routes"),
  }),
  defineProviderAction(service, {
    name: "get_route",
    operationType: "read",
    description: "Get Strava route details by ID.",
    requiredScopes: ["read"],
    inputSchema: routeIdInput,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_route_streams",
    operationType: "read",
    description: "Get stream data for a specified Strava route.",
    requiredScopes: ["read"],
    inputSchema: routeIdInput,
    outputSchema: streamsOutput,
  }),
  defineProviderAction(service, {
    name: "export_route_gpx",
    operationType: "read",
    description: "Export the GPX content of a specified Strava route.",
    requiredScopes: ["read"],
    inputSchema: routeIdInput,
    outputSchema: exportOutput("GPX"),
  }),
  defineProviderAction(service, {
    name: "export_route_tcx",
    operationType: "read",
    description: "Export TCX content for a specified Strava route.",
    requiredScopes: ["read"],
    inputSchema: routeIdInput,
    outputSchema: exportOutput("TCX"),
  }),
  defineProviderAction(service, {
    name: "get_segment",
    operationType: "read",
    description: "Get Strava segment details by ID.",
    requiredScopes: ["read"],
    inputSchema: idInput("segmentId", "Road segment ID."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_starred_segments",
    operationType: "read",
    description: "Paginated list of current Strava athlete starred segments.",
    requiredScopes: ["read"],
    inputSchema: s.object(pageFields, { description: "Favorite segment query input." }),
    outputSchema: listOutput("segments"),
  }),
  defineProviderAction(service, {
    name: "star_segment",
    operationType: "write",
    description: "Favorite or unfavorite a specific Strava segment.",
    requiredScopes: ["profile:write"],
    inputSchema: s.object(
      {
        segmentId: stravaIdSchema("Road segment ID."),
        starred: s.boolean("Whether to bookmark this segment."),
      },
      { required: ["segmentId", "starred"], description: "Segment star update input." },
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "explore_segments",
    operationType: "read",
    description: "Explore eligible Strava segments within a given bounding box.",
    requiredScopes: ["read"],
    inputSchema: s.object(
      {
        bounds: s.array(s.number("Coordinate value."), {
          description: "Bounding box coordinates: south latitude, west longitude, north latitude, east longitude.",
          minItems: 4,
          maxItems: 4,
        }),
        activityType: s.stringEnum("Type of activities to explore.", ["running", "riding"]),
        minCat: s.integer("Minimum climb classification.", { minimum: 0, maximum: 5 }),
        maxCat: s.integer("Maximum climb classification.", { minimum: 0, maximum: 5 }),
      },
      { required: ["bounds"], description: "Segment exploration input." },
    ),
    outputSchema: listOutput("segments"),
  }),
  defineProviderAction(service, {
    name: "list_segment_efforts",
    operationType: "read",
    description: "List Strava segment efforts by segment ID.",
    requiredScopes: ["read"],
    inputSchema: s.object(
      {
        segmentId: stravaIdSchema("Road segment ID."),
        startDateLocal: s.nonEmptyString("Lower bound on local start time."),
        endDateLocal: s.nonEmptyString("Upper bound on local start time."),
        ...pageFields,
      },
      { required: ["segmentId"], description: "Segment effort list query input." },
    ),
    outputSchema: listOutput("efforts"),
  }),
  defineProviderAction(service, {
    name: "get_segment_effort",
    operationType: "read",
    description: "Get Strava segment effort details by ID.",
    requiredScopes: ["read"],
    inputSchema: idInput("segmentEffortId", "Road segment effort ID."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_segment_streams",
    operationType: "read",
    description: "Get stream data for a specified Strava segment.",
    requiredScopes: ["read"],
    inputSchema: s.object(
      { segmentId: stravaIdSchema("Road segment ID."), ...streamInputFields },
      { required: ["segmentId", "keys"], description: "Segment stream input." },
    ),
    outputSchema: streamsOutput,
  }),
  defineProviderAction(service, {
    name: "get_segment_effort_streams",
    operationType: "read",
    description: "Get stream data for a specified Strava segment effort.",
    requiredScopes: ["read"],
    inputSchema: s.object(
      { segmentEffortId: stravaIdSchema("Road segment effort ID."), ...streamInputFields },
      { required: ["segmentEffortId", "keys"], description: "Segment effort stream input." },
    ),
    outputSchema: streamsOutput,
  }),
];

function listOutput(key: string): JsonSchema {
  return s.object({ [key]: rawArraySchema }, { required: [key], description: `Strava ${key} list response.` });
}

function idInput(key: string, description: string): JsonSchema {
  return s.object({ [key]: stravaIdSchema(description) }, { required: [key], description: `Strava ${key} input.` });
}

function paginatedIdInput(key: string, description: string): JsonSchema {
  return s.object(
    { [key]: stravaIdSchema(description), ...pageFields },
    { required: [key], description: `Paginated Strava ${key} input.` },
  );
}

function exportOutput(format: string): JsonSchema {
  return s.object(
    {
      routeId: stravaIdSchema("Route ID."),
      contentType: s.string("Response content type."),
      content: s.string(`${format} text content.`),
    },
    { required: ["routeId", "contentType", "content"], description: `Strava ${format} export response.` },
  );
}
