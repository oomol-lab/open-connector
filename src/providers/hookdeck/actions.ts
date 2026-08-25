import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hookdeck";

const idSchema = s.nonEmptyString("The Hookdeck resource identifier.");
const nameSchema = s.nonEmptyString("The Hookdeck resource name.");
const descriptionSchema = s.nonEmptyString("The Hookdeck resource description.");
const timestampSchema = s.nullableString("The timestamp returned by Hookdeck.", { format: "date-time" });
const rawObjectSchema = s.looseObject("The raw Hookdeck object.");

const paginationSchema = s.looseObject("Hookdeck cursor pagination metadata.", {
  order_by: s.string("The field Hookdeck used for ordering this page."),
  dir: s.string("The ordering direction returned by Hookdeck."),
  limit: s.integer("The page size returned by Hookdeck."),
  next: s.string("The cursor for the next page when present."),
  prev: s.string("The cursor for the previous page when present."),
});

const listInputSchema = s.object(
  "The input payload for listing Hookdeck resources.",
  {
    id: idSchema,
    name: s.nonEmptyString("Filter resources by name or name expression."),
    disabled: s.boolean("Whether to include disabled resources."),
    limit: s.integer("The maximum number of resources to return. Hookdeck allows up to 250.", {
      minimum: 1,
      maximum: 250,
    }),
    next: s.nonEmptyString("The Hookdeck cursor for the next page."),
    prev: s.nonEmptyString("The Hookdeck cursor for the previous page."),
    orderBy: s.nonEmptyString("The Hookdeck order_by value."),
    dir: s.stringEnum("The Hookdeck sort direction.", ["asc", "desc"]),
  },
  { optional: ["id", "name", "disabled", "limit", "next", "prev", "orderBy", "dir"] },
);

const connectionListInputSchema = s.object(
  "The input payload for listing Hookdeck connections.",
  {
    id: idSchema,
    name: s.nonEmptyString("Filter connections by name or name expression."),
    sourceId: idSchema,
    destinationId: idSchema,
    fullName: s.nonEmptyString("Fuzzy match the Hookdeck full_name value."),
    disabled: s.boolean("Whether to include disabled connections."),
    limit: s.integer("The maximum number of connections to return. Hookdeck allows up to 250.", {
      minimum: 1,
      maximum: 250,
    }),
    next: s.nonEmptyString("The Hookdeck cursor for the next page."),
    prev: s.nonEmptyString("The Hookdeck cursor for the previous page."),
    orderBy: s.nonEmptyString("The Hookdeck order_by value."),
    dir: s.stringEnum("The Hookdeck sort direction.", ["asc", "desc"]),
  },
  {
    optional: [
      "id",
      "name",
      "sourceId",
      "destinationId",
      "fullName",
      "disabled",
      "limit",
      "next",
      "prev",
      "orderBy",
      "dir",
    ],
  },
);

const sourceInputSchema = s.looseObject("The Hookdeck source input object.", {
  name: nameSchema,
  description: descriptionSchema,
  type: s.string("The Hookdeck source type."),
  config: s.looseObject("The Hookdeck source config object."),
});

const destinationInputSchema = s.looseObject("The Hookdeck destination input object.", {
  name: nameSchema,
  description: descriptionSchema,
  type: s.string("The Hookdeck destination type."),
  config: s.looseObject("The Hookdeck destination config object."),
});

const ruleInputSchema = s.looseObject("A Hookdeck rule input object.");

const connectionCreateInputSchema = s.object(
  "The input payload for creating a Hookdeck connection.",
  {
    name: nameSchema,
    description: descriptionSchema,
    sourceId: idSchema,
    destinationId: idSchema,
    source: sourceInputSchema,
    destination: destinationInputSchema,
    rules: s.array("Rules to attach to the Hookdeck connection.", ruleInputSchema),
  },
  { optional: ["description", "sourceId", "destinationId", "source", "destination", "rules"] },
);

const connectionUpdateInputSchema = s.object(
  "The input payload for updating a Hookdeck connection.",
  {
    connectionId: idSchema,
    name: nameSchema,
    description: descriptionSchema,
    sourceId: idSchema,
    destinationId: idSchema,
    source: sourceInputSchema,
    destination: destinationInputSchema,
    rules: s.array("Rules to attach to the Hookdeck connection.", ruleInputSchema),
  },
  {
    optional: ["name", "description", "sourceId", "destinationId", "source", "destination", "rules"],
  },
);

const sourceCreateInputSchema = s.object(
  "The input payload for creating a Hookdeck source.",
  {
    name: nameSchema,
    description: descriptionSchema,
    type: s.string("The Hookdeck source type."),
    config: s.looseObject("The Hookdeck source config object."),
  },
  { optional: ["description", "type", "config"] },
);

const sourceUpdateInputSchema = s.object(
  "The input payload for updating a Hookdeck source.",
  {
    sourceId: idSchema,
    name: nameSchema,
    description: descriptionSchema,
    type: s.string("The Hookdeck source type."),
    config: s.looseObject("The Hookdeck source config object."),
  },
  { optional: ["name", "description", "type", "config"] },
);

const destinationCreateInputSchema = s.object(
  "The input payload for creating a Hookdeck destination.",
  {
    name: nameSchema,
    description: descriptionSchema,
    type: s.string("The Hookdeck destination type."),
    config: s.looseObject("The Hookdeck destination config object.", {
      url: s.url("The HTTP endpoint URL for an HTTP destination."),
    }),
  },
  { optional: ["description", "type"] },
);

const destinationUpdateInputSchema = s.object(
  "The input payload for updating a Hookdeck destination.",
  {
    destinationId: idSchema,
    name: nameSchema,
    description: descriptionSchema,
    type: s.string("The Hookdeck destination type."),
    config: s.looseObject("The Hookdeck destination config object.", {
      url: s.url("The HTTP endpoint URL for an HTTP destination."),
    }),
  },
  { optional: ["name", "description", "type", "config"] },
);

const connectionIdInputSchema = s.actionInput(
  {
    connectionId: idSchema,
  },
  ["connectionId"],
  "The input payload for selecting a Hookdeck connection.",
);

const sourceIdInputSchema = s.actionInput(
  {
    sourceId: idSchema,
  },
  ["sourceId"],
  "The input payload for selecting a Hookdeck source.",
);

const destinationIdInputSchema = s.actionInput(
  {
    destinationId: idSchema,
  },
  ["destinationId"],
  "The input payload for selecting a Hookdeck destination.",
);

const sourceSchema = s.looseObject("A normalized Hookdeck source.", {
  id: s.string("The Hookdeck source ID."),
  name: s.string("The Hookdeck source name."),
  type: s.nullableString("The Hookdeck source type."),
  url: s.nullableString("The Hookdeck source ingestion URL.", { format: "uri" }),
  authenticated: s.nullableBoolean("Whether the Hookdeck source is authenticated."),
  disabledAt: timestampSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  raw: rawObjectSchema,
});

const destinationSchema = s.looseObject("A normalized Hookdeck destination.", {
  id: s.string("The Hookdeck destination ID."),
  name: s.string("The Hookdeck destination name."),
  type: s.nullableString("The Hookdeck destination type."),
  config: s.looseObject("The Hookdeck destination config object."),
  disabledAt: timestampSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  raw: rawObjectSchema,
});

const connectionSchema = s.looseObject("A normalized Hookdeck connection.", {
  id: s.string("The Hookdeck connection ID."),
  name: s.string("The Hookdeck connection name."),
  fullName: s.nullableString("The Hookdeck full_name value."),
  description: s.nullableString("The Hookdeck connection description."),
  source: sourceSchema,
  destination: destinationSchema,
  disabledAt: timestampSchema,
  pausedAt: timestampSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  raw: rawObjectSchema,
});

const deleteOutputSchema = s.actionOutput(
  {
    deleted: s.boolean("Whether the delete request completed successfully."),
    raw: rawObjectSchema,
  },
  "The response returned after deleting a Hookdeck resource.",
);

export const hookdeckActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_connections",
    description: "List Hookdeck connections with optional filters and cursor pagination.",
    inputSchema: connectionListInputSchema,
    outputSchema: s.actionOutput(
      {
        connections: s.array("The Hookdeck connections returned by the API.", connectionSchema),
        count: s.integer("The number of connections returned by Hookdeck."),
        pagination: paginationSchema,
        raw: s.looseObject("The raw Hookdeck list response."),
      },
      "The Hookdeck connections list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_connection",
    description: "Get one Hookdeck connection by ID.",
    inputSchema: connectionIdInputSchema,
    outputSchema: s.actionOutput(
      {
        connection: connectionSchema,
        raw: rawObjectSchema,
      },
      "The Hookdeck connection response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_connection",
    description: "Create a Hookdeck connection and optionally create or bind its source and destination.",
    inputSchema: connectionCreateInputSchema,
    outputSchema: s.actionOutput(
      {
        connection: connectionSchema,
        raw: rawObjectSchema,
      },
      "The Hookdeck create connection response.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_connection",
    description: "Update a Hookdeck connection by ID.",
    inputSchema: connectionUpdateInputSchema,
    outputSchema: s.actionOutput(
      {
        connection: connectionSchema,
        raw: rawObjectSchema,
      },
      "The Hookdeck update connection response.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_connection",
    description: "Delete a Hookdeck connection by ID.",
    inputSchema: connectionIdInputSchema,
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_sources",
    description: "List Hookdeck sources with optional filters and cursor pagination.",
    inputSchema: listInputSchema,
    outputSchema: s.actionOutput(
      {
        sources: s.array("The Hookdeck sources returned by the API.", sourceSchema),
        count: s.integer("The number of sources returned by Hookdeck."),
        pagination: paginationSchema,
        raw: s.looseObject("The raw Hookdeck list response."),
      },
      "The Hookdeck sources list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_source",
    description: "Get one Hookdeck source by ID.",
    inputSchema: sourceIdInputSchema,
    outputSchema: s.actionOutput(
      {
        source: sourceSchema,
        raw: rawObjectSchema,
      },
      "The Hookdeck source response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_source",
    description: "Create a Hookdeck source.",
    inputSchema: sourceCreateInputSchema,
    outputSchema: s.actionOutput(
      {
        source: sourceSchema,
        raw: rawObjectSchema,
      },
      "The Hookdeck create source response.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_source",
    description: "Update a Hookdeck source by ID.",
    inputSchema: sourceUpdateInputSchema,
    outputSchema: s.actionOutput(
      {
        source: sourceSchema,
        raw: rawObjectSchema,
      },
      "The Hookdeck update source response.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_source",
    description: "Delete a Hookdeck source by ID.",
    inputSchema: sourceIdInputSchema,
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_destinations",
    description: "List Hookdeck destinations with optional filters and cursor pagination.",
    inputSchema: listInputSchema,
    outputSchema: s.actionOutput(
      {
        destinations: s.array("The Hookdeck destinations returned by the API.", destinationSchema),
        count: s.integer("The number of destinations returned by Hookdeck."),
        pagination: paginationSchema,
        raw: s.looseObject("The raw Hookdeck list response."),
      },
      "The Hookdeck destinations list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_destination",
    description: "Get one Hookdeck destination by ID.",
    inputSchema: destinationIdInputSchema,
    outputSchema: s.actionOutput(
      {
        destination: destinationSchema,
        raw: rawObjectSchema,
      },
      "The Hookdeck destination response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_destination",
    description: "Create a Hookdeck destination.",
    inputSchema: destinationCreateInputSchema,
    outputSchema: s.actionOutput(
      {
        destination: destinationSchema,
        raw: rawObjectSchema,
      },
      "The Hookdeck create destination response.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_destination",
    description: "Update a Hookdeck destination by ID.",
    inputSchema: destinationUpdateInputSchema,
    outputSchema: s.actionOutput(
      {
        destination: destinationSchema,
        raw: rawObjectSchema,
      },
      "The Hookdeck update destination response.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_destination",
    description: "Delete a Hookdeck destination by ID.",
    inputSchema: destinationIdInputSchema,
    outputSchema: deleteOutputSchema,
  }),
];
