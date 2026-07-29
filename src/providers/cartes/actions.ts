import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cartes";

const mapUuidSchema = s.uuid("The Cartes.io map UUID.");
const markerIdSchema = s.positiveInteger("The Cartes.io marker id.");
const categoryIdSchema = s.positiveInteger("The Cartes.io category id.");
const usernameSchema = s.nonEmptyString("The Cartes.io username.");
const mapTokenSchema = s.nonEmptyString("Optional map token for anonymous or token-protected map operations.");
const privacySchema = s.stringEnum("The Cartes.io map privacy value.", ["public", "unlisted", "private"]);
const markerCreationModeSchema = s.stringEnum("Who can create markers on the map.", ["yes", "only_logged_in", "no"]);
const mapTitleSchema = s.string("Map title.", { maxLength: 191 });
const mapSlugSchema = s.string("Optional unique map slug.", { maxLength: 255 });
const markerDescriptionSchema = s.string("Marker description.", { maxLength: 191 });
const markerCategoryNameSchema = s.string("Category name used when categoryId is not provided.", {
  minLength: 3,
  maxLength: 32,
});
const latitudeSchema = s.number("Latitude coordinate in decimal degrees.", {
  minimum: -90,
  maximum: 90,
});
const longitudeSchema = s.number("Longitude coordinate in decimal degrees.", {
  minimum: -180,
  maximum: 180,
});
const zoomSchema = s.number("Map zoom level.", {
  minimum: 0,
  maximum: 20,
});
const elevationSchema = s.number("Elevation in meters.", {
  minimum: -100000,
  maximum: 100000,
});
const speedSchema = s.number("Marker speed.", {
  minimum: 0,
  maximum: 100000,
});
const markerMetaSchema = s.array("Optional marker metadata values.", s.unknown("A marker metadata value."), {
  maxItems: 25,
});
const looseObjectSchema = s.looseObject("The raw Cartes.io JSON object.");
const paginatedObjectSchema = s.looseObject("The raw Cartes.io paginated response.");
const emptyInputSchema = s.actionInput({}, [], "This action does not require any input.");

const listMapsInputSchema = s.actionInput(
  {
    ids: s.array("Map UUIDs to include in the listing.", mapUuidSchema, {
      minItems: 1,
      maxItems: 100,
    }),
    categoryIds: s.array("Category ids used to filter public maps.", categoryIdSchema, {
      minItems: 1,
      maxItems: 10,
    }),
    withMine: s.boolean("Whether to include maps owned by the connected account."),
    orderBy: s.nonEmptyString("Cartes.io field used for descending ordering."),
    page: s.positiveInteger("Pagination page number."),
  },
  [],
  "Input parameters for listing Cartes.io maps.",
);

const searchMapsInputSchema = s.actionInput(
  {
    query: s.string("Search query. Cartes.io requires at least 3 characters.", {
      minLength: 3,
      maxLength: 255,
    }),
    page: s.positiveInteger("Pagination page number."),
  },
  ["query"],
  "Input parameters for searching public Cartes.io maps.",
);

const createMapInputSchema = s.actionInput(
  {
    title: mapTitleSchema,
    slug: mapSlugSchema,
    description: s.string("Optional map description."),
    privacy: privacySchema,
    usersCanCreateMarkers: markerCreationModeSchema,
  },
  [],
  "Input parameters for creating a Cartes.io map.",
);

const updateMapInputSchema = s.actionInput(
  {
    mapUuid: mapUuidSchema,
    mapToken: mapTokenSchema,
    title: mapTitleSchema,
    slug: mapSlugSchema,
    description: s.string("Updated map description."),
    privacy: privacySchema,
    usersCanCreateMarkers: markerCreationModeSchema,
  },
  ["mapUuid"],
  "Input parameters for updating a Cartes.io map.",
);

const mapIdInputSchema = s.actionInput(
  {
    mapUuid: mapUuidSchema,
    mapToken: mapTokenSchema,
  },
  ["mapUuid"],
  "Input parameters for selecting one Cartes.io map.",
);

const listMarkersInputSchema = s.actionInput(
  {
    mapUuid: mapUuidSchema,
    mapToken: mapTokenSchema,
    showExpired: s.boolean("Whether expired markers should be included."),
  },
  ["mapUuid"],
  "Input parameters for listing markers on a Cartes.io map.",
);

const markerBaseInputProperties: Record<string, JsonSchema> = {
  mapToken: mapTokenSchema,
  description: markerDescriptionSchema,
  categoryId: categoryIdSchema,
  categoryName: markerCategoryNameSchema,
  lat: latitudeSchema,
  lng: longitudeSchema,
  link: s.url("Optional marker link URL."),
  zoom: zoomSchema,
  elevation: elevationSchema,
  expiresAt: s.dateTime("Marker expiration timestamp."),
  meta: markerMetaSchema,
  heading: s.number("Heading in degrees.", { minimum: 0, maximum: 360 }),
  pitch: s.number("Pitch in degrees.", { minimum: -90, maximum: 90 }),
  roll: s.number("Roll in degrees.", { minimum: -180, maximum: 180 }),
  speed: speedSchema,
};

const createMarkerInputSchema: JsonSchema = {
  ...s.actionInput(
    {
      ...markerBaseInputProperties,
      mapUuid: mapUuidSchema,
    },
    ["mapUuid", "lat", "lng"],
    "Input parameters for creating a marker on a Cartes.io map.",
  ),
  oneOf: [
    {
      required: ["categoryId"],
      not: { required: ["categoryName"] },
    },
    {
      required: ["categoryName"],
      not: { required: ["categoryId"] },
    },
  ],
};

const updateMarkerInputSchema = s.actionInput(
  {
    mapUuid: mapUuidSchema,
    markerId: markerIdSchema,
    mapToken: mapTokenSchema,
    description: markerDescriptionSchema,
    isSpam: s.boolean("Whether the marker should be marked as spam."),
  },
  ["mapUuid", "markerId"],
  "Input parameters for updating a Cartes.io marker description or spam state.",
);

const markerIdInputSchema = s.actionInput(
  {
    mapUuid: mapUuidSchema,
    markerId: markerIdSchema,
    mapToken: mapTokenSchema,
  },
  ["mapUuid", "markerId"],
  "Input parameters for selecting one marker on a Cartes.io map.",
);

const createMarkerLocationInputSchema = s.actionInput(
  {
    mapUuid: mapUuidSchema,
    markerId: markerIdSchema,
    mapToken: mapTokenSchema,
    lat: latitudeSchema,
    lng: longitudeSchema,
    zoom: zoomSchema,
    elevation: elevationSchema,
    heading: s.number("Heading in degrees.", { minimum: 0, maximum: 360 }),
    pitch: s.number("Pitch in degrees.", { minimum: -90, maximum: 90 }),
    roll: s.number("Roll in degrees.", { minimum: -180, maximum: 180 }),
    speed: speedSchema,
  },
  ["mapUuid", "markerId", "lat", "lng"],
  "Input parameters for appending a location to a Cartes.io marker.",
);

const listPublicMarkersInputSchema = s.actionInput(
  {
    categoryId: categoryIdSchema,
    showExpired: s.boolean("Whether expired markers should be included."),
    page: s.positiveInteger("Pagination page number."),
  },
  [],
  "Input parameters for listing public Cartes.io markers.",
);

const listRelatedMapsInputSchema = s.actionInput(
  {
    mapUuid: mapUuidSchema,
  },
  ["mapUuid"],
  "Input parameters for listing maps related to a Cartes.io map.",
);

const userIncludeSchema = s.array(
  "Related resources to include with Cartes.io users.",
  s.stringEnum("A supported Cartes.io user include value.", ["maps", "maps.markers"]),
  { minItems: 1 },
);

const listUsersInputSchema = s.actionInput(
  {
    with: userIncludeSchema,
    page: s.positiveInteger("Pagination page number."),
  },
  [],
  "Input parameters for listing public Cartes.io users.",
);

const getUserInputSchema = s.actionInput(
  {
    username: usernameSchema,
    with: userIncludeSchema,
  },
  ["username"],
  "Input parameters for getting a public Cartes.io user.",
);

const mapOutputSchema = s.actionOutput(
  {
    map: looseObjectSchema,
  },
  "A Cartes.io map response.",
);
const markerOutputSchema = s.actionOutput(
  {
    marker: looseObjectSchema,
  },
  "A Cartes.io marker response.",
);
const markersOutputSchema = s.actionOutput(
  {
    markers: s.array("Markers returned by Cartes.io.", looseObjectSchema),
  },
  "A Cartes.io markers response.",
);
const paginatedMapsOutputSchema = s.actionOutput(
  {
    maps: s.array("Maps returned by Cartes.io.", looseObjectSchema),
    page: paginatedObjectSchema,
  },
  "A paginated Cartes.io maps response.",
);
const categoriesOutputSchema = s.actionOutput(
  {
    categories: s.array("Categories returned by Cartes.io.", looseObjectSchema),
  },
  "A Cartes.io categories response.",
);
const userOutputSchema = s.actionOutput(
  {
    user: looseObjectSchema,
  },
  "A Cartes.io user response.",
);
const paginatedUsersOutputSchema = s.actionOutput(
  {
    users: s.array("Users returned by Cartes.io.", looseObjectSchema),
    page: paginatedObjectSchema,
  },
  "A paginated Cartes.io users response.",
);
const successOutputSchema = s.object(
  "A Cartes.io deletion response.",
  {
    success: s.boolean("Whether Cartes.io confirmed the deletion."),
    raw: looseObjectSchema,
  },
  { optional: ["raw"] },
);

export type CartesActionName =
  | "get_current_user"
  | "list_maps"
  | "search_maps"
  | "create_map"
  | "get_map"
  | "update_map"
  | "delete_map"
  | "list_markers"
  | "list_public_markers"
  | "create_marker"
  | "get_marker"
  | "update_marker"
  | "delete_marker"
  | "create_marker_location"
  | "list_categories"
  | "list_related_maps"
  | "list_users"
  | "get_user";

export const cartesActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current Cartes.io user for the connected API token.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_maps",
    description: "List public Cartes.io maps, optionally including maps owned by the account.",
    requiredScopes: [],
    inputSchema: listMapsInputSchema,
    outputSchema: paginatedMapsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_maps",
    description: "Search public Cartes.io maps.",
    requiredScopes: [],
    inputSchema: searchMapsInputSchema,
    outputSchema: paginatedMapsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_map",
    description: "Create a Cartes.io map.",
    requiredScopes: [],
    inputSchema: createMapInputSchema,
    outputSchema: mapOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_map",
    description: "Get one Cartes.io map.",
    requiredScopes: [],
    inputSchema: mapIdInputSchema,
    outputSchema: mapOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_map",
    description: "Update one Cartes.io map.",
    requiredScopes: [],
    inputSchema: updateMapInputSchema,
    outputSchema: mapOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_map",
    description: "Delete one Cartes.io map.",
    requiredScopes: [],
    inputSchema: mapIdInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_markers",
    description: "List markers on one Cartes.io map.",
    requiredScopes: [],
    inputSchema: listMarkersInputSchema,
    outputSchema: markersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_public_markers",
    description: "List public Cartes.io markers across public maps.",
    requiredScopes: [],
    inputSchema: listPublicMarkersInputSchema,
    outputSchema: s.actionOutput(
      {
        markers: s.array("Markers returned by Cartes.io.", looseObjectSchema),
        page: paginatedObjectSchema,
      },
      "A paginated Cartes.io markers response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_marker",
    description: "Create a marker on one Cartes.io map.",
    requiredScopes: [],
    inputSchema: createMarkerInputSchema,
    outputSchema: markerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_marker",
    description: "Get one marker from a Cartes.io map.",
    requiredScopes: [],
    inputSchema: markerIdInputSchema,
    outputSchema: markerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_marker",
    description: "Update one marker on a Cartes.io map.",
    requiredScopes: [],
    inputSchema: updateMarkerInputSchema,
    outputSchema: markerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_marker",
    description: "Delete one marker from a Cartes.io map.",
    requiredScopes: [],
    inputSchema: markerIdInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_marker_location",
    description: "Append a new location point to one Cartes.io marker.",
    requiredScopes: [],
    inputSchema: createMarkerLocationInputSchema,
    outputSchema: markerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "List Cartes.io marker categories.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: categoriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_related_maps",
    description: "List Cartes.io maps related to one map.",
    requiredScopes: [],
    inputSchema: listRelatedMapsInputSchema,
    outputSchema: s.actionOutput(
      {
        maps: s.array("Related maps returned by Cartes.io.", looseObjectSchema),
      },
      "A Cartes.io related maps response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List public Cartes.io users.",
    requiredScopes: [],
    inputSchema: listUsersInputSchema,
    outputSchema: paginatedUsersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get one public Cartes.io user.",
    requiredScopes: [],
    inputSchema: getUserInputSchema,
    outputSchema: userOutputSchema,
  }),
];
