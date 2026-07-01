import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "faraday";

const emptyInputSchema = s.object("Input payload for this Faraday action.", {});
const resourceIdSchema = (description: string) => s.nonEmptyString(description);
const resourceSchema = (description: string) =>
  s.looseObject(
    {
      id: s.string("The Faraday resource ID when returned."),
      name: s.string("The Faraday resource name when returned."),
      resource_type: s.string("The Faraday resource type when returned."),
      status: s.string("The Faraday resource status when returned."),
      created_at: s.string("The timestamp when the Faraday resource was created."),
      updated_at: s.string("The timestamp when the Faraday resource was last updated."),
    },
    { description },
  );
const usageSchema = s.looseObject(
  {
    name: s.string("The usage metric name."),
    description: s.string("The usage metric description."),
    usage: s.number("The current usage value."),
    limit: s.number("The usage limit value when Faraday returns one."),
  },
  { description: "One Faraday usage metric returned by the API." },
);

const accountSchema = resourceSchema("A Faraday account resource.");
const scopeSchema = resourceSchema("A Faraday scope resource.");
const datasetSchema = resourceSchema("A Faraday dataset resource.");
const traitSchema = resourceSchema("A Faraday trait resource.");
const targetSchema = resourceSchema("A Faraday target resource.");

const faradayActionSources = [
  {
    name: "get_current_account",
    description: "Retrieve the Faraday account identified by the API key.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object(
      "The Faraday current account response.",
      {
        account: accountSchema,
        raw: accountSchema,
      },
      { required: ["account", "raw"] },
    ),
  },
  {
    name: "list_accounts",
    description: "List Faraday accounts controlled by the API key.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object(
      "The Faraday account list response.",
      {
        accounts: s.array("The Faraday account resources returned by the API.", accountSchema),
        raw: s.array("The raw Faraday account array returned by the API.", accountSchema),
      },
      { required: ["accounts", "raw"] },
    ),
  },
  {
    name: "get_account",
    description: "Retrieve a Faraday account by ID.",
    inputSchema: s.object(
      "Input payload for retrieving a Faraday account.",
      {
        account_id: resourceIdSchema("The Faraday account ID to retrieve."),
      },
      { required: ["account_id"] },
    ),
    outputSchema: s.object(
      "The Faraday account response.",
      {
        account: accountSchema,
        raw: accountSchema,
      },
      { required: ["account", "raw"] },
    ),
  },
  {
    name: "list_scopes",
    description: "List Faraday scopes defined on the account.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object(
      "The Faraday scope list response.",
      {
        scopes: s.array("The Faraday scope resources returned by the API.", scopeSchema),
        raw: s.array("The raw Faraday scope array returned by the API.", scopeSchema),
      },
      { required: ["scopes", "raw"] },
    ),
  },
  {
    name: "get_scope",
    description: "Retrieve a Faraday scope by ID.",
    inputSchema: s.object(
      "Input payload for retrieving a Faraday scope.",
      {
        scope_id: resourceIdSchema("The Faraday scope ID to retrieve."),
      },
      { required: ["scope_id"] },
    ),
    outputSchema: s.object(
      "The Faraday scope response.",
      {
        scope: scopeSchema,
        raw: scopeSchema,
      },
      { required: ["scope", "raw"] },
    ),
  },
  {
    name: "list_datasets",
    description: "List Faraday datasets available in the account.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object(
      "The Faraday dataset list response.",
      {
        datasets: s.array("The Faraday dataset resources returned by the API.", datasetSchema),
        raw: s.array("The raw Faraday dataset array returned by the API.", datasetSchema),
      },
      { required: ["datasets", "raw"] },
    ),
  },
  {
    name: "get_dataset",
    description: "Retrieve a Faraday dataset by ID.",
    inputSchema: s.object(
      "Input payload for retrieving a Faraday dataset.",
      {
        dataset_id: resourceIdSchema("The Faraday dataset ID to retrieve."),
      },
      { required: ["dataset_id"] },
    ),
    outputSchema: s.object(
      "The Faraday dataset response.",
      {
        dataset: datasetSchema,
        raw: datasetSchema,
      },
      { required: ["dataset", "raw"] },
    ),
  },
  {
    name: "list_traits",
    description: "List user-defined and Faraday-provided traits.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object(
      "The Faraday trait list response.",
      {
        traits: s.array("The Faraday trait resources returned by the API.", traitSchema),
        raw: s.array("The raw Faraday trait array returned by the API.", traitSchema),
      },
      { required: ["traits", "raw"] },
    ),
  },
  {
    name: "get_trait",
    description: "Retrieve a Faraday trait by ID.",
    inputSchema: s.object(
      "Input payload for retrieving a Faraday trait.",
      {
        trait_id: resourceIdSchema("The Faraday trait ID to retrieve."),
      },
      { required: ["trait_id"] },
    ),
    outputSchema: s.object(
      "The Faraday trait response.",
      {
        trait: traitSchema,
        raw: traitSchema,
      },
      { required: ["trait", "raw"] },
    ),
  },
  {
    name: "list_targets",
    description: "List Faraday targets defined on the account.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object(
      "The Faraday target list response.",
      {
        targets: s.array("The Faraday target resources returned by the API.", targetSchema),
        raw: s.array("The raw Faraday target array returned by the API.", targetSchema),
      },
      { required: ["targets", "raw"] },
    ),
  },
  {
    name: "get_target",
    description: "Retrieve a Faraday target by ID.",
    inputSchema: s.object(
      "Input payload for retrieving a Faraday target.",
      {
        target_id: resourceIdSchema("The Faraday target ID to retrieve."),
      },
      { required: ["target_id"] },
    ),
    outputSchema: s.object(
      "The Faraday target response.",
      {
        target: targetSchema,
        raw: targetSchema,
      },
      { required: ["target", "raw"] },
    ),
  },
  {
    name: "list_usages",
    description: "List Faraday usage statistics for the account.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object(
      "The Faraday usage list response.",
      {
        usages: s.array("The Faraday usage metrics returned by the API.", usageSchema),
        raw: s.array("The raw Faraday usage array returned by the API.", usageSchema),
      },
      { required: ["usages", "raw"] },
    ),
  },
];

export const faradayActions: ActionDefinition[] = faradayActionSources.map((action) =>
  defineProviderAction(service, action),
);

export type FaradayActionName =
  | "get_current_account"
  | "list_accounts"
  | "get_account"
  | "list_scopes"
  | "get_scope"
  | "list_datasets"
  | "get_dataset"
  | "list_traits"
  | "get_trait"
  | "list_targets"
  | "get_target"
  | "list_usages";
