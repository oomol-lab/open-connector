import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kandji";

const cursorSchema = s.nonEmptyString("The opaque pagination cursor returned by a previous Kandji response.");
const uuidSchema = s.uuid("A Kandji UUID value.");
const nullableStringSchema = s.nullable(s.string("A string value returned by Kandji when present."));
const nullableIntegerSchema = s.nullable(s.integer("An integer value returned by Kandji when present."));
const nullableBooleanSchema = s.nullable(s.boolean("A boolean value returned by Kandji when present."));

const paginationSchema = s.object("Pagination links returned by Kandji.", {
  next: s.nullable(s.string("The URL for the next page, or null when no next page exists.")),
  previous: s.nullable(s.string("The URL for the previous page, or null when no previous page exists.")),
});

const blueprintSchema = s.object("A normalized Kandji blueprint record.", {
  id: s.string("The blueprint ID."),
  name: s.string("The blueprint name."),
  type: nullableStringSchema,
  description: nullableStringSchema,
  computersCount: nullableIntegerSchema,
  raw: s.looseObject("The raw blueprint object returned by Kandji."),
});

const userSchema = s.object("A normalized Kandji directory user record.", {
  id: s.string("The user ID."),
  email: nullableStringSchema,
  name: nullableStringSchema,
  active: nullableBooleanSchema,
  archived: nullableBooleanSchema,
  deviceCount: nullableIntegerSchema,
  raw: s.looseObject("The raw user object returned by Kandji."),
});

export const kandjiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_blueprints",
    description: "List Kandji blueprints with optional ID, name, and pagination filters.",
    inputSchema: s.object(
      "The input payload for listing Kandji blueprints.",
      {
        id: uuidSchema,
        idIn: s.array("Blueprint IDs used to filter results.", uuidSchema, { minItems: 1 }),
        name: s.nonEmptyString("The blueprint name used to filter results."),
        limit: s.integer("The maximum number of blueprint records to return.", {
          minimum: 1,
          maximum: 300,
        }),
        offset: s.nonNegativeInteger("The zero-based offset used for Kandji blueprint pagination."),
      },
      { optional: ["id", "idIn", "name", "limit", "offset"] },
    ),
    outputSchema: s.object("The response returned when listing Kandji blueprints.", {
      count: nullableIntegerSchema,
      pagination: paginationSchema,
      blueprints: s.array("The blueprints returned by Kandji.", blueprintSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_blueprint",
    description: "Get a Kandji blueprint by ID.",
    inputSchema: s.object("The input payload for getting a Kandji blueprint.", {
      blueprintId: s.uuid("The unique identifier of the Kandji blueprint to retrieve."),
    }),
    outputSchema: s.object("The response returned when getting a Kandji blueprint.", {
      blueprint: blueprintSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Kandji directory users with optional filters and cursor pagination.",
    inputSchema: s.object(
      "The input payload for listing Kandji users.",
      {
        email: s.nonEmptyString("Return users with email addresses containing this value."),
        id: uuidSchema,
        integrationId: uuidSchema,
        archived: s.boolean("Whether to return archived or non-archived users."),
        cursor: cursorSchema,
        sizePerPage: s.integer("The number of user records to return per page.", {
          minimum: 1,
          maximum: 300,
        }),
      },
      { optional: ["email", "id", "integrationId", "archived", "cursor", "sizePerPage"] },
    ),
    outputSchema: s.object("The response returned when listing Kandji users.", {
      pagination: paginationSchema,
      users: s.array("The users returned by Kandji.", userSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get a Kandji directory user by ID.",
    inputSchema: s.object("The input payload for getting a Kandji user.", {
      userId: s.uuid("The unique identifier of the Kandji directory user to retrieve."),
    }),
    outputSchema: s.object("The response returned when getting a Kandji user.", {
      user: userSchema,
    }),
  }),
];
