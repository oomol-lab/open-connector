import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kaleido";

const emptyInputSchema = s.object("This action does not require any input.", {});

const idField = (description: string) => s.string(description, { minLength: 1 });

const consortiaIdProperty = {
  consortia_id: idField("The Kaleido consortium identifier."),
};

const environmentPathProperties = {
  ...consortiaIdProperty,
  environment_id: idField("The Kaleido environment identifier."),
};

const resourceSchema = s.looseObject("A Kaleido platform resource payload.");
const resourceListSchema = s.array("The Kaleido platform resources returned by the API.", resourceSchema);

export const kaleidoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_memberships",
    description: "List memberships available to the current Kaleido API key.",
    inputSchema: emptyInputSchema,
    outputSchema: resourceListSchema,
  }),
  defineProviderAction(service, {
    name: "list_consortia",
    description: "List Kaleido consortia available to the current membership.",
    inputSchema: emptyInputSchema,
    outputSchema: resourceListSchema,
  }),
  defineProviderAction(service, {
    name: "get_consortium",
    description: "Get details for a specific Kaleido consortium.",
    inputSchema: s.object("The input payload for reading a Kaleido consortium.", {
      ...consortiaIdProperty,
    }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "list_environments",
    description: "List environments in a specific Kaleido consortium.",
    inputSchema: s.object("The input payload for listing Kaleido environments.", {
      ...consortiaIdProperty,
    }),
    outputSchema: resourceListSchema,
  }),
  defineProviderAction(service, {
    name: "get_environment",
    description: "Get details for a specific Kaleido environment.",
    inputSchema: s.object("The input payload for reading a Kaleido environment.", {
      ...environmentPathProperties,
    }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "get_environment_status",
    description: "Get runtime status for a specific Kaleido environment.",
    inputSchema: s.object("The input payload for reading Kaleido environment status.", {
      ...environmentPathProperties,
    }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "list_nodes",
    description: "List nodes in a specific Kaleido environment.",
    inputSchema: s.object("The input payload for listing Kaleido nodes.", {
      ...environmentPathProperties,
    }),
    outputSchema: resourceListSchema,
  }),
  defineProviderAction(service, {
    name: "get_node",
    description: "Get details for a specific Kaleido node.",
    inputSchema: s.object("The input payload for reading a Kaleido node.", {
      ...environmentPathProperties,
      node_id: idField("The Kaleido node identifier."),
    }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "get_node_status",
    description: "Get runtime status for a specific Kaleido node.",
    inputSchema: s.object("The input payload for reading Kaleido node status.", {
      ...environmentPathProperties,
      node_id: idField("The Kaleido node identifier."),
    }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "list_services",
    description: "List services in a specific Kaleido environment.",
    inputSchema: s.object("The input payload for listing Kaleido services.", {
      ...environmentPathProperties,
    }),
    outputSchema: resourceListSchema,
  }),
  defineProviderAction(service, {
    name: "get_service",
    description: "Get details for a specific Kaleido service.",
    inputSchema: s.object("The input payload for reading a Kaleido service.", {
      ...environmentPathProperties,
      service_id: idField("The Kaleido service identifier."),
    }),
    outputSchema: resourceSchema,
  }),
  defineProviderAction(service, {
    name: "get_service_status",
    description: "Get runtime status for a specific Kaleido service.",
    inputSchema: s.object("The input payload for reading Kaleido service status.", {
      ...environmentPathProperties,
      service_id: idField("The Kaleido service identifier."),
    }),
    outputSchema: resourceSchema,
  }),
];
