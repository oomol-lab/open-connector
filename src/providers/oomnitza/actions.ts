import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "oomnitza";

export type OomnitzaActionName = "identify" | "list_assets" | "get_asset" | "list_users" | "get_user";

interface OomnitzaActionSpec {
  name: OomnitzaActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const limitField = s.integer("Maximum number of records to return.", { minimum: 1 });
const skipField = s.integer("Number of records to skip before returning results.", { minimum: 0 });
const filterField = s.string("Oomnitza API filter expression.", { minLength: 1 });
const sortByField = s.string("Oomnitza sort expression.", { minLength: 1 });
const fieldsField = s.array(
  "Oomnitza field names to include in the response.",
  s.string("Oomnitza field name.", { minLength: 1 }),
);
const includeDeletedField = s.boolean("Whether deleted records should be included.");
const assetIdField = s.string("Oomnitza asset identifier.", { minLength: 1 });
const usernameField = s.string("Oomnitza username to retrieve.", { minLength: 1 });

const listInputSchema = s.object(
  "Optional filters and pagination for Oomnitza list endpoints.",
  {
    limit: limitField,
    skip: skipField,
    filter: filterField,
    sortBy: sortByField,
    fields: fieldsField,
    includeDeleted: includeDeletedField,
  },
  { optional: ["limit", "skip", "filter", "sortBy", "fields", "includeDeleted"] },
);

const assetInputSchema = s.object(
  "Oomnitza asset lookup input.",
  {
    id: assetIdField,
    includeDeleted: includeDeletedField,
  },
  { optional: ["includeDeleted"] },
);

const userInputSchema = s.object(
  "Oomnitza user lookup input.",
  {
    username: usernameField,
    includeDeleted: includeDeletedField,
  },
  { optional: ["includeDeleted"] },
);

const oomnitzaRecordSchema = s.looseObject("Oomnitza record with tenant-defined fields.");

const actionSpecs: OomnitzaActionSpec[] = [
  {
    name: "identify",
    operationType: "read",
    description: "Validate the Oomnitza connection and return the configured instance metadata.",
    inputSchema: s.object("This action does not require any input fields.", {}, { required: [] }),
    outputSchema: s.actionOutput(
      {
        baseUrl: s.string("Normalized Oomnitza instance base URL."),
        host: s.string("Oomnitza instance host."),
        validationEndpoint: s.string("Endpoint used to validate the API token."),
      },
      "Oomnitza connection metadata.",
    ),
  },
  {
    name: "list_assets",
    operationType: "read",
    description: "List Oomnitza assets using the v3 assets endpoint.",
    inputSchema: listInputSchema,
    outputSchema: s.actionOutput(
      {
        assets: s.array("Oomnitza asset records.", oomnitzaRecordSchema),
        raw: s.unknown("Raw Oomnitza response payload."),
      },
      "Oomnitza assets list result.",
    ),
  },
  {
    name: "get_asset",
    operationType: "read",
    description: "Retrieve one Oomnitza asset by ID.",
    inputSchema: assetInputSchema,
    outputSchema: s.actionOutput(
      {
        asset: oomnitzaRecordSchema,
        raw: s.unknown("Raw Oomnitza response payload."),
      },
      "Oomnitza asset lookup result.",
    ),
  },
  {
    name: "list_users",
    operationType: "read",
    description: "List Oomnitza users using the v3 users endpoint.",
    inputSchema: listInputSchema,
    outputSchema: s.actionOutput(
      {
        users: s.array("Oomnitza user records.", oomnitzaRecordSchema),
        raw: s.unknown("Raw Oomnitza response payload."),
      },
      "Oomnitza users list result.",
    ),
  },
  {
    name: "get_user",
    operationType: "read",
    description: "Retrieve one Oomnitza user by username.",
    inputSchema: userInputSchema,
    outputSchema: s.actionOutput(
      {
        user: oomnitzaRecordSchema,
        raw: s.unknown("Raw Oomnitza response payload."),
      },
      "Oomnitza user lookup result.",
    ),
  },
];

export const oomnitzaActions: ActionDefinition[] = actionSpecs.map((action) => defineProviderAction(service, action));
