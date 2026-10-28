import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const projectId = s.string("Public project ID returned by list_projects.", { minLength: 1 });
const locationId = s.string("Public location ID belonging to the project.", { minLength: 1 });
const includes = {
  includeHours: s.boolean("Include opening hours; absent schedules return null."),
  includeFilters: s.boolean("Include attached filters."),
  includeFields: s.boolean("Include custom fields."),
  includeCallsToAction: s.boolean("Include calls to action."),
};
const dayNames = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const weekdays = Object.fromEntries(
  dayNames.map((day) => [day, s.nullable(s.string("Time ranges, closed, or null for an unset day."))]),
);
const fullHours = s.object("All seven weekdays, or an empty object for no schedule.", weekdays, {
  required: [],
  anyOf: [{ maxProperties: 0 }, { required: dayNames }],
});
const patchHours = s.nullable(
  s.object("Selected weekdays; an empty object preserves hours and null removes the schedule.", weekdays, {
    required: [],
  }),
);
const textFields = {
  address_line_1: "Street address.",
  address_line_2: "Additional address information.",
  state: "State or region.",
  postcode: "Postal code.",
  country: "Country.",
  phone: "Phone number.",
  email: "Email address.",
  url: "Website URL.",
  slug: "Location slug.",
  address: "Full address; generated from components when needed.",
  display_address: "Address displayed to visitors.",
  timezone: "Location timezone.",
  facebook: "Facebook profile.",
  instagram: "Instagram profile.",
  twitter: "Twitter profile.",
  yelp: "Yelp profile.",
  youtube: "YouTube profile.",
  tiktok: "TikTok profile.",
  location_type: "Location type name belonging to the project.",
  cover: "Image URL or stored project image name; StoreRocket retrieves the image.",
};
const strings = Object.fromEntries(
  Object.entries(textFields).map(([key, description]) => [key, s.string(description)]),
);
const nullableStrings = Object.fromEntries(
  Object.entries(textFields).map(([key, description]) => [key, s.nullable(s.string(description))]),
);
const baseFields = {
  name: s.string("Location name.", { minLength: 1, maxLength: 255 }),
  city: s.string("City; a street address is optional.", { minLength: 1, maxLength: 255 }),
  visible: s.boolean("Whether the location is shown in the locator."),
};
const filters = s.anyOf("Filter names as an array or comma-separated string.", [
  s.array("Filter names.", s.string("Filter name.")),
  s.string("Comma-separated filter names."),
]);
const createFields = {
  ...baseFields,
  ...strings,
  lat: s.number("Latitude; POST may geocode when zero or omitted.", { minimum: -90, maximum: 90 }),
  lng: s.number("Longitude; POST may geocode when zero or omitted.", {
    minimum: -180,
    maximum: 180,
  }),
  marker_id: s.integer("Marker ID belonging to the project."),
  hours: fullHours,
  filters,
  fields: s.record("Custom field values keyed by name.", s.string("Custom field value.")),
  callsToAction: s.record("Call-to-action values keyed by name.", s.string("Call-to-action value.")),
};
const patchFields = {
  ...baseFields,
  ...nullableStrings,
  lat: s.nullable(s.number("Latitude; zero is preserved.", { minimum: -90, maximum: 90 })),
  lng: s.nullable(s.number("Longitude; zero is preserved.", { minimum: -180, maximum: 180 })),
  marker_id: s.nullable(s.integer("Marker ID; null restores the project default.")),
  hours: patchHours,
  filters: s.nullable(filters),
  fields: s.nullable(
    s.record(
      "Merge custom fields; null values remove entries and null clears all attachments.",
      s.nullable(s.string("Custom field value; null removes the attachment.")),
    ),
  ),
  callsToAction: s.nullable(
    s.record(
      "Merge calls to action; null values remove entries and null clears all attachments.",
      s.nullable(s.string("Call-to-action value; null removes the attachment.")),
    ),
  ),
};
const location = s.looseObject("Location resource with additional upstream fields preserved.", {
  id: s.string("Public location ID."),
  name: s.string("Location name."),
  city: s.string("City."),
  lat: s.nullable(s.number("Latitude, possibly null while geocoding.")),
  lng: s.nullable(s.number("Longitude, possibly null while geocoding.")),
  hours: s.nullable(s.looseObject("Opening hours, included when requested.")),
  filters: s.array("Attached filters, included when requested.", s.looseObject("Filter resource.")),
  fields: s.array("Custom fields, included when requested.", s.looseObject("Custom field resource.")),
  callsToAction: s.array("Calls to action, included when requested.", s.looseObject("Call-to-action resource.")),
});
const locationOutput = s.object(
  "Location response.",
  { data: location },
  {
    required: ["data"],
    additionalProperties: true,
  },
);
const filterOperators = { eq: s.string("Exact value."), like: s.string("Substring to match.") };
const queryFilters = s.object(
  "Combined location filters using the documented operators.",
  {
    name: s.object(
      "Name filter.",
      { ...filterOperators, ne: s.string("Value to exclude.") },
      { required: [], minProperties: 1 },
    ),
    ...Object.fromEntries(
      ["address", "city", "state", "country"].map((field) => [
        field,
        s.object("Exact or substring filter.", filterOperators, { required: [], minProperties: 1 }),
      ]),
    ),
    postalCode: s.requiredObject("Postal code filter; the API query uses postalCode.", {
      eq: filterOperators.eq,
    }),
  },
  { required: [] },
);
const storerocketActions: ActionDefinition[] = [
  defineProviderAction("storerocket", {
    name: "get_user",
    operationType: "read",
    description: "Read the profile associated with the API token.",
    requiredScopes: [],
    inputSchema: s.requiredObject("User lookup parameters.", {}),
    outputSchema: s.object(
      "User response.",
      {
        data: s.looseObject("Authenticated user profile.", {
          id: s.string("User ID."),
          name: s.string("User name."),
          email: s.string("User email."),
          company: s.nullable(s.string("Company name.")),
        }),
      },
      {
        required: ["data"],
        additionalProperties: true,
      },
    ),
  }),
  defineProviderAction("storerocket", {
    name: "list_projects",
    operationType: "read",
    description: "List projects available to the authenticated user.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Project lookup parameters.", {}),
    outputSchema: s.object(
      "Project list response.",
      {
        data: s.array(
          "Available projects.",
          s.looseObject("Project resource.", {
            id: s.string("Public project ID."),
            name: s.string("Project name."),
            locations: s.integer("Location count."),
            status: s.string("Project status."),
            plan: s.string("Project plan."),
          }),
        ),
      },
      {
        required: ["data"],
        additionalProperties: true,
      },
    ),
  }),
  defineProviderAction("storerocket", {
    name: "list_locations",
    operationType: "read",
    description:
      "List one page of locations with filters and optional relationships. Keep filters and include flags on subsequent pages.",
    requiredScopes: [],
    inputSchema: s.object(
      "Location list parameters.",
      {
        project_id: projectId,
        page: s.integer("Page number; defaults to 1.", { minimum: 1 }),
        limit: s.integer("Page size; defaults to 15.", { minimum: 1, maximum: 100 }),
        ...includes,
        filters: queryFilters,
      },
      { required: ["project_id"] },
    ),
    outputSchema: s.object(
      "Paginated location response.",
      {
        data: s.array("Locations on this page.", location),
        links: s.looseObject("Pagination links; next is null on the final page.", {
          next: s.nullable(s.string("Next page URL; use the page input to continue.")),
        }),
        meta: s.looseObject("Pagination metadata.", {
          current_page: s.integer("Current page."),
          last_page: s.integer("Last page."),
          per_page: s.integer("Page size."),
          total: s.integer("Total matching locations."),
        }),
      },
      {
        required: ["data", "links", "meta"],
        additionalProperties: true,
      },
    ),
  }),
  defineProviderAction("storerocket", {
    name: "get_location",
    operationType: "read",
    description: "Read one location and optionally include its attached information.",
    requiredScopes: [],
    inputSchema: s.object(
      "Location lookup parameters.",
      { project_id: projectId, location_id: locationId, ...includes },
      { required: ["project_id", "location_id"] },
    ),
    outputSchema: locationOutput,
  }),
  defineProviderAction("storerocket", {
    name: "create_location",
    operationType: "write",
    description:
      "Create a location. Requires name and city; omit hours or use an empty object for a location without a schedule.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Location creation parameters.", {
      project_id: projectId,
      location: s.object("Location fields to create.", createFields, {
        required: ["name", "city"],
      }),
    }),
    outputSchema: locationOutput,
  }),
  defineProviderAction("storerocket", {
    name: "update_location",
    operationType: "write",
    description:
      "Update selected location fields with PATCH. Omitted fields remain saved; address changes may queue geocoding and return before coordinates are ready.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Location update parameters.", {
      project_id: projectId,
      location_id: locationId,
      location: s.object("Selected fields to update; nullable fields support explicit clearing.", patchFields, {
        required: [],
        minProperties: 1,
      }),
    }),
    outputSchema: locationOutput,
  }),
  defineProviderAction("storerocket", {
    name: "delete_location",
    operationType: "destructive",
    description: "Delete a location from its project and locator results.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Location deletion parameters.", {
      project_id: projectId,
      location_id: locationId,
    }),
    outputSchema: s.object(
      "Location deletion result.",
      { success: s.boolean("Whether the location was deleted.") },
      {
        required: ["success"],
        additionalProperties: true,
      },
    ),
  }),
];
export default storerocketActions;
