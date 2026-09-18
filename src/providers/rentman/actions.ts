import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "rentman";
const idInputSchema = s.object("Path parameters for retrieving a Rentman item.", {
  id: s.positiveInteger("The numeric Rentman item ID to retrieve."),
});
const listInputSchema = s.object(
  "Query parameters for listing Rentman items.",
  {
    fields: s.string("Comma-separated Rentman field names to include in each item."),
    sort: s.string("Comma-separated Rentman sort fields, such as +id or -displayname."),
    limit: s.integer("Maximum number of items to return. Rentman allows 1 to 1500.", { minimum: 1, maximum: 1500 }),
    offset: s.nonNegativeInteger("Number of items to skip when using offset-based pagination."),
    cursor: s.string("Opaque Rentman cursor token from a previous page URL."),
    expand: s.string("Comma-separated linked fields to expand, using Rentman's expand syntax."),
    filters: s.record(
      "Additional Rentman filter query parameters. Keys may include operators such as distance[lte].",
      s.string("The Rentman filter value to send for this query parameter."),
    ),
  },
  { optional: ["fields", "sort", "limit", "offset", "cursor", "expand", "filters"] },
);
const rentmanItemSchema = s.looseObject("A Rentman item record.");
const listOutputSchema = s.object("Paginated Rentman collection response.", {
  items: s.array("Rentman items returned by the collection endpoint.", rentmanItemSchema),
  itemCount: s.nonNegativeInteger("The number of items in this response."),
  limit: s.nonNegativeInteger("The maximum number of items requested or returned."),
  offset: s.nonNegativeInteger("The number of items skipped in this response."),
  nextPageUrl: s.nullableString("The full Rentman next page URL, or null when no next page is available."),
  raw: s.looseObject("Raw Rentman response payload."),
});
const itemOutputSchema = s.object("Rentman item response.", {
  item: rentmanItemSchema,
  raw: s.looseObject("Raw Rentman response payload."),
});

export type RentmanActionName =
  | "list_contacts"
  | "get_contact"
  | "list_contact_persons"
  | "get_contact_person"
  | "list_projects"
  | "get_project"
  | "list_equipment"
  | "get_equipment";

function listAction(name: RentmanActionName, description: string): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType: "read",
    description,
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema,
  });
}

function getAction(name: RentmanActionName, description: string): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType: "read",
    description,
    inputSchema: idInputSchema,
    outputSchema: itemOutputSchema,
  });
}

export const rentmanActions: ActionDefinition[] = [
  listAction(
    "list_contacts",
    "List Rentman contacts with optional fields, sorting, pagination, expansion, and filters.",
  ),
  getAction("get_contact", "Get a Rentman contact by numeric ID."),
  listAction(
    "list_contact_persons",
    "List Rentman contact persons with optional fields, sorting, pagination, expansion, and filters.",
  ),
  getAction("get_contact_person", "Get a Rentman contact person by numeric ID."),
  listAction(
    "list_projects",
    "List Rentman projects with optional fields, sorting, pagination, expansion, and filters.",
  ),
  getAction("get_project", "Get a Rentman project by numeric ID."),
  listAction(
    "list_equipment",
    "List Rentman equipment with optional fields, sorting, pagination, expansion, and filters.",
  ),
  getAction("get_equipment", "Get a Rentman equipment item by numeric ID."),
];
