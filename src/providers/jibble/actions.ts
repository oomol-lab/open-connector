import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jibble";

const odataInputFields = {
  select: s.string("The comma-separated Jibble fields to return through the OData $select option."),
  filter: s.string("The OData $filter expression used to limit returned Jibble records."),
  expand: s.string("The OData $expand expression used to include related Jibble records."),
  orderBy: s.string("The OData $orderby expression used to sort returned Jibble records."),
  skip: s.integer("The number of matching Jibble records to skip.", { minimum: 0 }),
  top: s.integer("The maximum number of Jibble records to return.", { minimum: 1 }),
  count: s.boolean("Whether Jibble should include the total matching record count."),
};

const odataOptionalKeys = ["select", "filter", "expand", "orderBy", "skip", "top", "count"];

const collectionOutputSchema = (entityDescription: string) =>
  s.object(
    "A normalized Jibble OData collection response.",
    {
      items: s.array(`The returned ${entityDescription}.`, s.looseObject(`One ${entityDescription}.`)),
      count: s.nullable(s.integer("The total matching record count when Jibble returned it.")),
      nextLink: s.nullable(s.string("The URL for the next OData page when Jibble returned one.")),
    },
    { optional: ["count", "nextLink"] },
  );

const coordinatesSchema = s.object("The geographic coordinates of a Jibble location.", {
  latitude: s.number("The latitude in decimal degrees.", { minimum: -90, maximum: 90 }),
  longitude: s.number("The longitude in decimal degrees.", { minimum: -180, maximum: 180 }),
});

const geoFenceSchema = s.object("The geofence surrounding a Jibble location.", {
  radius: s.number("The geofence radius.", { minimum: 0 }),
  units: s.nonEmptyString("The Jibble distance unit used for the geofence radius."),
});

const locationFields = {
  name: s.nonEmptyString("The display name of the Jibble location."),
  address: s.string("The postal address of the Jibble location."),
  status: s.stringEnum("The lifecycle status of the Jibble location.", ["Active", "Archived"]),
  geoFence: geoFenceSchema,
  coordinates: coordinatesSchema,
};

const locationOutputSchema = s.object("A Jibble location response.", {
  location: s.looseObject("The Jibble location returned by the API."),
});

const successOutputSchema = s.object("A successful Jibble operation response.", {
  ok: s.boolean("Whether Jibble accepted the operation."),
});

export const jibbleActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_organizations",
    description: "List the Jibble organizations accessible to the personal access token.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Jibble organizations.", {}),
    outputSchema: collectionOutputSchema("Jibble organizations"),
  }),
  defineProviderAction(service, {
    name: "list_members",
    description: "List people in the Jibble organization with optional OData filtering and pagination.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Jibble organization members.", odataInputFields, {
      optional: odataOptionalKeys,
    }),
    outputSchema: collectionOutputSchema("Jibble members"),
  }),
  defineProviderAction(service, {
    name: "list_locations",
    description: "List Jibble work locations with optional OData filtering and pagination.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Jibble locations.", odataInputFields, {
      optional: odataOptionalKeys,
    }),
    outputSchema: collectionOutputSchema("Jibble locations"),
  }),
  defineProviderAction(service, {
    name: "create_location",
    description: "Create a work location in Jibble.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for creating a Jibble location.", locationFields, {
      optional: ["address", "status", "geoFence", "coordinates"],
    }),
    outputSchema: locationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_location",
    description: "Update or archive an existing Jibble work location.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for updating a Jibble location.",
      {
        locationId: s.uuid("The Jibble location identifier."),
        ...locationFields,
      },
      { optional: ["name", "address", "status", "geoFence", "coordinates"] },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_location",
    description: "Permanently delete a Jibble work location.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for deleting a Jibble location.", {
      locationId: s.uuid("The Jibble location identifier to delete."),
    }),
    outputSchema: successOutputSchema,
  }),
];
