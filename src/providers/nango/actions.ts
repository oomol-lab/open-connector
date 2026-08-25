import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "nango";

const nonEmptyStringSchema = (description: string) => s.string({ description, minLength: 1 });

const providerProperties = {
  name: nonEmptyStringSchema("Nango provider name."),
  display_name: nonEmptyStringSchema("Human-readable provider display name."),
  auth_mode: nonEmptyStringSchema("Authentication mode used by this provider."),
  categories: s.array("Provider categories assigned by Nango.", nonEmptyStringSchema("Provider category slug.")),
  docs: s.url("Nango documentation URL for this provider."),
  proxy: s.looseObject("Nango proxy configuration for this provider."),
};

const providerSchema = s.looseObject("Nango provider configuration returned by the API.", providerProperties);

const integrationProperties = {
  unique_key: nonEmptyStringSchema("The integration ID created in Nango."),
  display_name: nonEmptyStringSchema("Provider display name for this integration."),
  provider: nonEmptyStringSchema("Nango provider configuration slug."),
  logo: s.url("Absolute URL to the integration logo."),
  created_at: s.dateTime("Timestamp when the integration was created."),
  updated_at: s.dateTime("Timestamp when the integration was last updated."),
  forward_webhooks: s.boolean("Whether provider webhooks are forwarded to your backend."),
};

const integrationSchema = s.object("Nango integration returned by the API.", integrationProperties, {
  optional: ["logo", "forward_webhooks"],
  additionalProperties: true,
});

const integrationFullSchema = s.object(
  "Detailed Nango integration returned by the API.",
  {
    ...integrationProperties,
    webhook_url: s.nullable(s.url("Webhook URL to configure in the upstream provider.")),
    credentials: s.nullable(s.looseObject("Sensitive integration credentials returned when requested and permitted.")),
  },
  {
    optional: ["logo", "forward_webhooks", "webhook_url", "credentials"],
    additionalProperties: true,
  },
);

const tagsSchema: JsonSchema = {
  ...s.record(
    "Connection tags keyed by tag name. Nango normalizes keys to lowercase.",
    s.string("Connection tag value.", { maxLength: 255 }),
  ),
  maxProperties: 10,
};

const connectionErrorSchema = s.object(
  "Nango connection error.",
  {
    type: nonEmptyStringSchema("Connection error type, such as auth or sync."),
    log_id: nonEmptyStringSchema("Nango log identifier for this connection error."),
  },
  { required: ["type", "log_id"] },
);

const connectionSummarySchema = s.object(
  "Nango connection summary returned by the list endpoint.",
  {
    id: s.integer("Internal Nango connection ID."),
    connection_id: nonEmptyStringSchema("Connection ID used when the connection was created."),
    provider: nonEmptyStringSchema("Nango provider configuration slug."),
    provider_config_key: nonEmptyStringSchema(
      "Integration ID used to create the connection, also called the unique key.",
    ),
    created: nonEmptyStringSchema("Connection creation timestamp returned by Nango."),
    metadata: s.nullable(s.looseObject("Custom metadata attached to the connection.")),
    tags: tagsSchema,
    errors: s.array("Connection errors returned by Nango.", connectionErrorSchema),
    end_user: s.nullable(s.looseObject("Deprecated end-user details returned by Nango.")),
  },
  { optional: ["end_user"], additionalProperties: true },
);

const connectionFullSchema = s.object(
  "Detailed Nango connection returned by the API.",
  {
    id: s.integer("Internal Nango connection ID."),
    connection_id: nonEmptyStringSchema("Connection ID used when the connection was created."),
    provider_config_key: nonEmptyStringSchema(
      "Integration ID used to create the connection, also called the unique key.",
    ),
    provider: nonEmptyStringSchema("Nango provider configuration slug."),
    errors: s.array("Connection errors returned by Nango.", connectionErrorSchema),
    metadata: s.looseObject("Custom metadata attached to the connection."),
    connection_config: s.looseObject("Provider-specific connection configuration."),
    tags: tagsSchema,
    created_at: nonEmptyStringSchema("Timestamp when the connection was created."),
    updated_at: nonEmptyStringSchema("Timestamp when the connection was last updated."),
    last_fetched_at: nonEmptyStringSchema("Timestamp when the connection credentials were last fetched."),
    credentials: s.looseObject("Connection credentials returned by Nango when the API key is permitted to read them."),
    end_user: s.nullable(s.looseObject("Deprecated end-user details returned by Nango.")),
  },
  { optional: ["credentials", "end_user"], additionalProperties: true },
);

const providerNameInputSchema = s.object(
  "Input parameters for retrieving a Nango provider.",
  {
    provider: nonEmptyStringSchema("Nango provider name to retrieve."),
  },
  { required: ["provider"] },
);

const listConnectionsInputSchema = s.object(
  "Input parameters for listing Nango connections.",
  {
    connectionId: nonEmptyStringSchema("Exact connection ID to match."),
    search: nonEmptyStringSchema("Search text to partially match connection IDs or end-user profiles."),
    tags: tagsSchema,
    limit: s.positiveInteger("Maximum number of connections to return."),
    page: s.positiveInteger("Page number to retrieve."),
  },
  { optional: ["connectionId", "search", "tags", "limit", "page"] },
);

const integrationInputSchema = s.object(
  "Input parameters for retrieving a Nango integration.",
  {
    uniqueKey: nonEmptyStringSchema("Integration ID, also called the unique_key, to retrieve."),
    include: s.array(
      "Additional sensitive data to include in the response.",
      s.stringEnum("Additional integration data to include.", ["webhook", "credentials"]),
      { minItems: 1 },
    ),
  },
  { required: ["uniqueKey"], optional: ["include"] },
);

const connectionInputSchema = s.object(
  "Input parameters for retrieving a Nango connection.",
  {
    connection_id: nonEmptyStringSchema("Connection ID used when the connection was created."),
    provider_config_key: nonEmptyStringSchema(
      "Integration ID used to create the connection, also called the unique key.",
    ),
    force_refresh: s.boolean("Whether Nango should refresh the access token even if not expired."),
    refresh_token: s.boolean("Whether to include the refresh token in the response."),
    refresh_github_app_jwt_token: s.boolean("Whether to refresh the JWT token for GitHub App connections."),
  },
  {
    required: ["connection_id", "provider_config_key"],
    optional: ["force_refresh", "refresh_token", "refresh_github_app_jwt_token"],
  },
);

const connectionIdOrIdsSchema = s.anyOf("One or more Nango connection IDs.", [
  nonEmptyStringSchema("Single connection ID."),
  s.array("Multiple connection IDs.", nonEmptyStringSchema("Connection ID."), { minItems: 1 }),
]);

const setConnectionMetadataInputSchema = s.object(
  "Input parameters for setting Nango connection metadata.",
  {
    connection_id: connectionIdOrIdsSchema,
    provider_config_key: nonEmptyStringSchema(
      "Integration ID used to create the connection, also called the unique key.",
    ),
    metadata: s.looseObject("Metadata object that replaces the current connection metadata."),
  },
  { required: ["connection_id", "provider_config_key", "metadata"] },
);

const patchConnectionTagsInputSchema = s.object(
  "Input parameters for editing Nango connection tags.",
  {
    connection_id: nonEmptyStringSchema("Connection ID used when the connection was created."),
    provider_config_key: nonEmptyStringSchema(
      "Integration ID used to create the connection, also called the unique key.",
    ),
    tags: tagsSchema,
  },
  { required: ["connection_id", "provider_config_key", "tags"] },
);

const deleteConnectionInputSchema = s.object(
  "Input parameters for deleting a Nango connection.",
  {
    connection_id: nonEmptyStringSchema("Connection ID used when the connection was created."),
    provider_config_key: nonEmptyStringSchema(
      "Integration ID used to create the connection, also called the unique key.",
    ),
  },
  { required: ["connection_id", "provider_config_key"] },
);

const providersOutputSchema = s.object(
  "Nango providers returned by the API.",
  {
    data: s.array("Available Nango providers.", providerSchema),
  },
  { required: ["data"] },
);

const providerOutputSchema = s.object(
  "Nango provider returned by the API.",
  {
    data: providerSchema,
  },
  { required: ["data"] },
);

const integrationsOutputSchema = s.object(
  "Nango integrations returned by the API.",
  {
    data: s.array("Nango integrations.", integrationSchema),
  },
  { required: ["data"] },
);

const integrationOutputSchema = s.object(
  "Nango integration returned by the API.",
  {
    data: integrationFullSchema,
  },
  { required: ["data"] },
);

const connectionsOutputSchema = s.object(
  "Nango connections returned by the API.",
  {
    connections: s.array("Nango connection summaries.", connectionSummarySchema),
  },
  { required: ["connections"] },
);

const setConnectionMetadataOutputSchema = s.object(
  "Result returned after setting Nango connection metadata.",
  {
    connection_id: connectionIdOrIdsSchema,
    provider_config_key: nonEmptyStringSchema(
      "Integration ID used to create the connection, also called the unique key.",
    ),
    metadata: s.looseObject("Metadata now attached to the connection."),
  },
  { required: ["connection_id", "provider_config_key", "metadata"], additionalProperties: true },
);

const successOutputSchema = s.object(
  "Operation result returned by Nango.",
  {
    success: s.boolean("Whether the operation succeeded."),
  },
  { optional: ["success"], additionalProperties: true },
);

export const nangoActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_providers",
    description: "List provider configurations available in Nango.",
    inputSchema: s.object("Input parameters for listing Nango providers.", {}),
    outputSchema: providersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_provider",
    description: "Retrieve a provider configuration from Nango.",
    inputSchema: providerNameInputSchema,
    outputSchema: providerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_integrations",
    description: "List integrations configured in the Nango environment.",
    requiredScopes: ["environment:integrations:list"],
    inputSchema: s.object("Input parameters for listing Nango integrations.", {}),
    outputSchema: integrationsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_integration",
    description: "Retrieve a Nango integration by unique key.",
    requiredScopes: ["environment:integrations:read"],
    inputSchema: integrationInputSchema,
    outputSchema: integrationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_connections",
    description: "List Nango connections without credentials.",
    requiredScopes: ["environment:connections:list"],
    inputSchema: listConnectionsInputSchema,
    outputSchema: connectionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_connection",
    description: "Retrieve a Nango connection and its credentials when permitted.",
    requiredScopes: ["environment:connections:read"],
    inputSchema: connectionInputSchema,
    outputSchema: connectionFullSchema,
  }),
  defineProviderAction(service, {
    name: "set_connection_metadata",
    description: "Replace metadata for one or more Nango connections.",
    requiredScopes: ["environment:connections:update"],
    inputSchema: setConnectionMetadataInputSchema,
    outputSchema: setConnectionMetadataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "patch_connection_tags",
    description: "Edit tags for a Nango connection.",
    requiredScopes: ["environment:connections:update"],
    inputSchema: patchConnectionTagsInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_connection",
    description: "Delete a Nango connection.",
    requiredScopes: ["environment:connections:delete"],
    inputSchema: deleteConnectionInputSchema,
    outputSchema: successOutputSchema,
  }),
];
