import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aircall";

const idSchema = s.positiveInteger("The Aircall numeric resource ID.");
const resourceObjectSchema = s.looseObject("The raw Aircall resource object returned by the API.");
const orderSchema = s.stringEnum(["asc", "desc"], {
  description: "The order to return Aircall resources in.",
});
const unixTimestampSchema = s.nonEmptyString("A UNIX timestamp accepted by Aircall.");

const paginationInputSchema = {
  page: s.positiveInteger("The 1-based page number to request from Aircall."),
  perPage: s.integer("The number of resources to request per page.", {
    minimum: 1,
    maximum: 100,
  }),
};

const paginationOutputSchema = s.object(
  "Pagination metadata returned by Aircall.",
  {
    count: s.integer("The number of resources returned on this page."),
    total: s.integer("The total number of resources matching the request."),
    currentPage: s.integer("The current page number."),
    perPage: s.integer("The number of resources requested per page."),
    nextPageLink: s.nullable(s.string("The next page URL returned by Aircall.")),
    previousPageLink: s.nullable(s.string("The previous page URL returned by Aircall.")),
    raw: s.looseObject("The raw Aircall meta object."),
  },
  {
    required: ["count", "total", "currentPage", "perPage", "nextPageLink", "previousPageLink", "raw"],
  },
);

const listUsersInputSchema = s.object("Input for listing Aircall users with the V2 API.", paginationInputSchema, {
  optional: ["page", "perPage"],
});

const listCallsInputSchema = s.object(
  "Input for listing Aircall calls.",
  {
    ...paginationInputSchema,
    from: unixTimestampSchema,
    to: unixTimestampSchema,
    order: orderSchema,
    fetchContact: s.boolean("Whether Aircall should include contact details in each call."),
    fetchShortUrls: s.boolean("Whether Aircall should include shortened recording URLs."),
    fetchCallTimeline: s.boolean("Whether Aircall should include call timeline details."),
  },
  {
    optional: ["page", "perPage", "from", "to", "order", "fetchContact", "fetchShortUrls", "fetchCallTimeline"],
  },
);

const getCallInputSchema = s.object(
  "Input for retrieving one Aircall call.",
  {
    id: idSchema,
    fetchContact: s.boolean("Whether Aircall should include contact details for the call."),
    fetchShortUrls: s.boolean("Whether Aircall should include shortened recording URLs."),
    fetchCallTimeline: s.boolean("Whether Aircall should include call timeline details."),
  },
  { required: ["id"] },
);

const getResourceInputSchema = s.object(
  "Input for retrieving one Aircall resource.",
  {
    id: idSchema,
  },
  { required: ["id"] },
);

function listInputSchema(resourceName: string) {
  return s.object(
    `Input for listing Aircall ${resourceName}.`,
    {
      ...paginationInputSchema,
    },
    { optional: ["page", "perPage"] },
  );
}

function listOutputSchema(resourceName: string) {
  return s.actionOutput(
    {
      [resourceName]: s.array(`The ${resourceName} returned by Aircall.`, resourceObjectSchema),
      pagination: paginationOutputSchema,
      raw: s.looseObject("The raw Aircall response payload."),
    },
    `Aircall ${resourceName} returned by the API.`,
  );
}

function resourceOutputSchema(resourceName: string) {
  return s.actionOutput(
    {
      [resourceName.slice(0, -1)]: s.nullable(resourceObjectSchema),
      raw: s.looseObject("The raw Aircall response payload."),
    },
    `One Aircall ${resourceName} response.`,
  );
}

export const aircallActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    description: "List Aircall users with the current V2 Users API.",
    requiredScopes: [],
    inputSchema: listUsersInputSchema,
    outputSchema: listOutputSchema("users"),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Retrieve one Aircall user with the current V2 Users API.",
    requiredScopes: [],
    inputSchema: getResourceInputSchema,
    outputSchema: resourceOutputSchema("users"),
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List Aircall teams.",
    requiredScopes: [],
    inputSchema: listInputSchema("teams"),
    outputSchema: listOutputSchema("teams"),
  }),
  defineProviderAction(service, {
    name: "get_team",
    description: "Retrieve one Aircall team.",
    requiredScopes: [],
    inputSchema: getResourceInputSchema,
    outputSchema: resourceOutputSchema("teams"),
  }),
  defineProviderAction(service, {
    name: "list_numbers",
    description: "List Aircall phone numbers.",
    requiredScopes: [],
    inputSchema: listInputSchema("phone numbers"),
    outputSchema: listOutputSchema("numbers"),
  }),
  defineProviderAction(service, {
    name: "get_number",
    description: "Retrieve one Aircall phone number.",
    requiredScopes: [],
    inputSchema: getResourceInputSchema,
    outputSchema: resourceOutputSchema("numbers"),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Aircall contacts.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Aircall contacts.",
      {
        ...paginationInputSchema,
        order: orderSchema,
      },
      { optional: ["page", "perPage", "order"] },
    ),
    outputSchema: listOutputSchema("contacts"),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Retrieve one Aircall contact.",
    requiredScopes: [],
    inputSchema: getResourceInputSchema,
    outputSchema: resourceOutputSchema("contacts"),
  }),
  defineProviderAction(service, {
    name: "list_calls",
    description: "List Aircall calls with optional date and payload expansion filters.",
    requiredScopes: [],
    inputSchema: listCallsInputSchema,
    outputSchema: listOutputSchema("calls"),
  }),
  defineProviderAction(service, {
    name: "get_call",
    description: "Retrieve one Aircall call by ID.",
    requiredScopes: [],
    inputSchema: getCallInputSchema,
    outputSchema: resourceOutputSchema("calls"),
  }),
];
