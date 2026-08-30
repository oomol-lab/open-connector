import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "celigo" as const;

function defineAction<TName extends string>(
  input: Omit<Parameters<typeof defineProviderAction<TName>>[1], "providerPermissions"> & {
    service: typeof service;
    providerPermissions?: string[];
  },
): ProviderActionDefinition<TName> {
  const { service: _service, ...action } = input;
  return defineProviderAction(service, action);
}

const noInputSchema = s.object("No input parameters are required for this action.", {});

const tokenInfoSchema = s.looseRequiredObject("Celigo token metadata.", {
  _userId: s.string("The Celigo user ID associated with the current API token."),
  scope: s.array(
    "Scopes returned by Celigo for the current API token.",
    s.string("One permission scope granted to the current API token."),
  ),
});

const exportIdField = s.string("The unique identifier of the Celigo export.", { minLength: 1 });
const importIdField = s.string("The unique identifier of the Celigo import.", { minLength: 1 });
const flowIdField = s.string("The unique identifier of the Celigo flow.", { minLength: 1 });
const connectionIdField = s.string("The unique identifier of the Celigo connection.", {
  minLength: 1,
});
const dateTimeField = s.dateTime("Timestamp in ISO 8601 format.");

const exportSchema = s.looseRequiredObject(
  "Celigo export.",
  {
    _id: s.string("The unique identifier of the export."),
    name: s.string("The display name of the export, when present."),
    type: s.string("The export type reported by Celigo, when present."),
    lastModified: dateTimeField,
  },
  { optional: ["name", "type", "lastModified"] },
);

const importSchema = s.looseRequiredObject(
  "Celigo import.",
  {
    _id: s.string("The unique identifier of the import."),
    name: s.string("The display name of the import, when present."),
    apiIdentifier: s.string("The API identifier configured for the import, when present."),
    lastModified: dateTimeField,
  },
  { optional: ["name", "apiIdentifier", "lastModified"] },
);

const flowSchema = s.looseRequiredObject(
  "Celigo flow.",
  {
    _id: s.string("The unique identifier of the flow."),
    name: s.string("The display name of the flow, when present."),
    _exportId: s.string("The export ID associated with the flow, when present."),
    _importId: s.string("The import ID associated with the flow, when present."),
    _integrationId: s.string("The integration ID associated with the flow, when present."),
    lastModified: dateTimeField,
  },
  { optional: ["name", "_exportId", "_importId", "_integrationId", "lastModified"] },
);

const connectionSchema = s.looseRequiredObject(
  "Celigo connection.",
  {
    _id: s.string("The unique identifier of the connection."),
    name: s.string("The display name of the connection, when present."),
    type: s.string("The connection type reported by Celigo, when present."),
    lastModified: dateTimeField,
  },
  { optional: ["name", "type", "lastModified"] },
);

export const celigoActions: ProviderActionDefinition[] = [
  defineAction({
    service,
    name: "get_token_info",
    description: "Get metadata for the current Celigo API token.",
    requiredScopes: [],
    inputSchema: noInputSchema,
    outputSchema: s.object("The normalized Celigo token-info response.", {
      tokenInfo: tokenInfoSchema,
    }),
  }),
  defineAction({
    service,
    name: "list_exports",
    description: "List exports available in the current Celigo account.",
    requiredScopes: [],
    inputSchema: noInputSchema,
    outputSchema: s.object("The normalized Celigo export-list response.", {
      exports: s.array("Exports returned by Celigo.", exportSchema),
    }),
  }),
  defineAction({
    service,
    name: "get_export",
    description: "Get one Celigo export by export ID.",
    requiredScopes: [],
    inputSchema: s.object("Input payload for retrieving one Celigo export.", {
      exportId: exportIdField,
    }),
    outputSchema: s.object("The normalized Celigo export-detail response.", {
      export: exportSchema,
    }),
  }),
  defineAction({
    service,
    name: "list_imports",
    description: "List imports available in the current Celigo account.",
    requiredScopes: [],
    inputSchema: noInputSchema,
    outputSchema: s.object("The normalized Celigo import-list response.", {
      imports: s.array("Imports returned by Celigo.", importSchema),
    }),
  }),
  defineAction({
    service,
    name: "get_import",
    description: "Get one Celigo import by import ID.",
    requiredScopes: [],
    inputSchema: s.object("Input payload for retrieving one Celigo import.", {
      importId: importIdField,
    }),
    outputSchema: s.object("The normalized Celigo import-detail response.", {
      import: importSchema,
    }),
  }),
  defineAction({
    service,
    name: "list_flows",
    description: "List flows available in the current Celigo account.",
    requiredScopes: [],
    inputSchema: noInputSchema,
    outputSchema: s.object("The normalized Celigo flow-list response.", {
      flows: s.array("Flows returned by Celigo.", flowSchema),
    }),
  }),
  defineAction({
    service,
    name: "get_flow",
    description: "Get one Celigo flow by flow ID.",
    requiredScopes: [],
    inputSchema: s.object("Input payload for retrieving one Celigo flow.", {
      flowId: flowIdField,
    }),
    outputSchema: s.object("The normalized Celigo flow-detail response.", {
      flow: flowSchema,
    }),
  }),
  defineAction({
    service,
    name: "get_connection",
    description: "Get one Celigo connection by connection ID.",
    requiredScopes: [],
    inputSchema: s.object("Input payload for retrieving one Celigo connection.", {
      connectionId: connectionIdField,
    }),
    outputSchema: s.object("The normalized Celigo connection-detail response.", {
      connection: connectionSchema,
    }),
  }),
];
