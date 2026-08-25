import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "klipfolio";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const positiveInteger = (description: string) => s.positiveInteger(description);

const listInputSchema = s.object(
  "Optional pagination parameters for listing Klipfolio assets.",
  {
    offset: s.nonNegativeInteger("The zero-based item offset to start listing from."),
    limit: positiveInteger("The maximum number of assets to return."),
  },
  { optional: ["offset", "limit"] },
);

const getByIdInputSchema = (assetName: string) =>
  s.object(`Input parameters for getting a Klipfolio ${assetName}.`, {
    id: nonEmptyString(`The Klipfolio ${assetName} ID.`),
  });

const assetSchema = (assetName: string) =>
  s.looseObject(`A Klipfolio ${assetName} object.`, {
    id: s.string(`The Klipfolio ${assetName} ID.`),
    name: s.string(`The Klipfolio ${assetName} name.`),
    description: s.string(`The Klipfolio ${assetName} description when returned.`),
  });

const rawPayloadSchema = s.looseObject("The raw Klipfolio response payload.");

const listOutputSchema = (assetName: string, outputKey: string) =>
  s.object(`A list of Klipfolio ${assetName} objects.`, {
    [outputKey]: s.array(`The Klipfolio ${assetName} objects returned.`, assetSchema(assetName)),
    raw: rawPayloadSchema,
  });

const getOutputSchema = (assetName: string, outputKey: string) =>
  s.object(`A Klipfolio ${assetName} response.`, {
    [outputKey]: assetSchema(assetName),
    raw: rawPayloadSchema,
  });

export const klipfolioActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_clients",
    description: "List Klipfolio client assets visible to the current API key.",
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema("client", "clients"),
  }),
  defineProviderAction(service, {
    name: "get_client",
    description: "Get a Klipfolio client asset by ID.",
    inputSchema: getByIdInputSchema("client"),
    outputSchema: getOutputSchema("client", "client"),
  }),
  defineProviderAction(service, {
    name: "list_dashboards",
    description: "List Klipfolio dashboard assets visible to the current API key.",
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema("dashboard", "dashboards"),
  }),
  defineProviderAction(service, {
    name: "get_dashboard",
    description: "Get a Klipfolio dashboard asset by ID.",
    inputSchema: getByIdInputSchema("dashboard"),
    outputSchema: getOutputSchema("dashboard", "dashboard"),
  }),
  defineProviderAction(service, {
    name: "list_klips",
    description: "List Klipfolio Klip assets visible to the current API key.",
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema("Klip", "klips"),
  }),
  defineProviderAction(service, {
    name: "get_klip",
    description: "Get a Klipfolio Klip asset by ID.",
    inputSchema: getByIdInputSchema("Klip"),
    outputSchema: getOutputSchema("Klip", "klip"),
  }),
  defineProviderAction(service, {
    name: "list_data_sources",
    description: "List Klipfolio data source assets visible to the current API key.",
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema("data source", "data_sources"),
  }),
  defineProviderAction(service, {
    name: "get_data_source",
    description: "Get a Klipfolio data source asset by ID.",
    inputSchema: getByIdInputSchema("data source"),
    outputSchema: getOutputSchema("data source", "data_source"),
  }),
];
