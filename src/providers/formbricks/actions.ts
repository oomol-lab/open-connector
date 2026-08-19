import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "formbricks";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });
const nullableString = (description: string) => s.nullable(nonEmptyString(description));

const workspaceSummarySchema = s.object("One Formbricks workspace summary returned by /me.", {
  workspaceId: nonEmptyString("The Formbricks workspace identifier."),
  environmentId: s.nullable(s.string("The deprecated environment identifier alias when returned by Formbricks.")),
  environmentType: s.stringEnum("The Formbricks environment type for the workspace.", ["production", "development"]),
  permission: s.stringEnum("The permission level granted to this API key for the workspace.", [
    "read",
    "write",
    "manage",
  ]),
  projectId: nonEmptyString("The Formbricks project identifier that owns the workspace."),
  projectName: nonEmptyString("The Formbricks project name that owns the workspace."),
});

const meOutputSchema = s.object("The Formbricks /me payload normalized by the connector.", {
  organizationId: nonEmptyString("The Formbricks organization identifier."),
  organizationAccess: s.object("The organization-level access control returned by Formbricks.", {
    accessControl: s.object("The read and write access flags for the API key.", {
      read: s.boolean("Whether the API key can read organization-level data."),
      write: s.boolean("Whether the API key can write organization-level data."),
    }),
  }),
  workspaces: s.array("The workspaces accessible to the API key.", workspaceSummarySchema),
  environments: s.array(
    "The deprecated environments alias returned by Formbricks when present.",
    workspaceSummarySchema,
  ),
});

const contactAttributeKeySchema = s.object("A normalized Formbricks contact attribute key.", {
  id: nonEmptyString("The Formbricks contact attribute key identifier."),
  createdAt: nonEmptyString("The ISO timestamp when the attribute key was created."),
  updatedAt: nonEmptyString("The ISO timestamp when the attribute key was last updated."),
  isUnique: s.boolean("Whether the attribute key is marked as unique across contacts in the workspace."),
  key: nonEmptyString("The machine-readable attribute key used in Formbricks."),
  name: nullableString("The display name configured for the attribute key."),
  description: nullableString("The description configured for the attribute key."),
  type: s.stringEnum("Whether Formbricks marks this key as default or custom.", ["default", "custom"]),
  workspaceId: nonEmptyString("The workspace identifier that owns the attribute key."),
  environmentId: s.nullable(s.string("The deprecated environment identifier alias returned by Formbricks.")),
  raw: s.looseObject("The raw Formbricks contact attribute key payload."),
});

const workspaceScopeInputProperties = {
  workspaceId: nonEmptyString("The Formbricks workspace identifier used by this action."),
  environmentId: nonEmptyString(
    "The deprecated environment identifier alias accepted by Formbricks for compatibility.",
  ),
};

const contactAttributeKeyId = nonEmptyString(
  "The Formbricks contact attribute key identifier to fetch, update, or delete.",
);

const contactAttributeKeyIdInputSchema = s.requiredObject("The identifier for one Formbricks contact attribute key.", {
  contactAttributeKeyId,
});

const listContactAttributeKeysInputSchema = s.object(
  "Optional filters for listing Formbricks contact attribute keys.",
  {
    ...workspaceScopeInputProperties,
    limit: s.positiveInteger("The maximum number of attribute keys to return.", { maximum: 250 }),
    skip: s.nonNegativeInteger("The number of attribute keys to skip before returning results."),
    sortBy: s.stringEnum("The Formbricks field used to sort the returned attribute keys.", ["createdAt", "updatedAt"]),
    order: s.stringEnum("The sort order for the returned Formbricks attribute keys.", ["asc", "desc"]),
    startDate: s.string("An optional start-date filter passed through to Formbricks exactly as provided."),
    endDate: s.string("An optional end-date filter passed through to Formbricks exactly as provided."),
    filterDateField: s.stringEnum("The Formbricks date field used for start/end filtering.", [
      "createdAt",
      "updatedAt",
    ]),
  },
  {
    optional: [
      "workspaceId",
      "environmentId",
      "limit",
      "skip",
      "sortBy",
      "order",
      "startDate",
      "endDate",
      "filterDateField",
    ],
  },
);

const contactAttributeKeyCreateInputSchema = s.object(
  "The payload for creating one Formbricks contact attribute key.",
  {
    ...workspaceScopeInputProperties,
    key: nonEmptyString("The machine-readable attribute key to create in Formbricks."),
    name: nullableString("The display name for the new Formbricks attribute key."),
    description: nullableString("The description for the new Formbricks attribute key."),
  },
  { optional: ["environmentId"] },
);

const contactAttributeKeyUpdateInputSchema: JsonSchema = {
  ...s.object(
    "The partial update payload for one Formbricks contact attribute key.",
    {
      contactAttributeKeyId,
      key: nonEmptyString("An updated machine-readable attribute key."),
      name: nullableString("An updated display name for the attribute key."),
      description: nullableString("An updated description for the attribute key."),
    },
    { optional: ["key", "name", "description"] },
  ),
  anyOf: [{ required: ["key"] }, { required: ["name"] }, { required: ["description"] }],
};

const contactAttributeKeyMetaSchema = s.object(
  "Pagination metadata returned for Formbricks contact attribute key lists.",
  {
    total: s.nonNegativeInteger("The total number of matching Formbricks attribute keys."),
    limit: s.nonNegativeInteger("The number of attribute keys Formbricks returned per page."),
    offset: s.nonNegativeInteger("The offset Formbricks applied to this result page."),
  },
);

const contactSchema = s.object("A normalized Formbricks contact returned by the connector.", {
  id: nonEmptyString("The Formbricks contact identifier."),
  createdAt: nonEmptyString("The ISO timestamp when the contact was created."),
  workspaceId: nonEmptyString("The workspace identifier that owns the contact."),
  environmentId: s.nullable(s.string("The deprecated environment identifier alias returned by Formbricks.")),
  attributes: s.record(
    "The string-valued contact attributes stored in Formbricks.",
    s.string("One contact attribute value."),
  ),
  raw: s.looseObject("The raw Formbricks contact payload."),
});

const createContactInputSchema = s.object(
  "The payload for creating one Formbricks contact.",
  {
    ...workspaceScopeInputProperties,
    attributes: s.object(
      "The Formbricks contact attributes object. It must include a valid email address.",
      {
        email: s.email("The contact email address used by Formbricks as the unique identifier."),
      },
      {
        additionalProperties: s.string(
          "One additional string-valued contact attribute stored on the Formbricks contact.",
        ),
      },
    ),
  },
  { optional: ["environmentId"] },
);

export const formbricksActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_me",
    description: "Get the Formbricks organization and workspace context associated with the current API key.",
    requiredScopes: [],
    inputSchema: s.object("No input is required for retrieving the current Formbricks API key context.", {}),
    outputSchema: meOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contact_attribute_keys",
    description:
      "List Formbricks contact attribute keys with optional pagination, sorting, date filters, and workspace scoping.",
    requiredScopes: [],
    inputSchema: listContactAttributeKeysInputSchema,
    outputSchema: s.object("The normalized Formbricks contact attribute key list response.", {
      contactAttributeKeys: s.array("The contact attribute keys returned by Formbricks.", contactAttributeKeySchema),
      meta: contactAttributeKeyMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact_attribute_key",
    description: "Get one Formbricks contact attribute key by its identifier.",
    requiredScopes: [],
    inputSchema: contactAttributeKeyIdInputSchema,
    outputSchema: s.object("The normalized Formbricks contact attribute key detail response.", {
      contactAttributeKey: contactAttributeKeySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact_attribute_key",
    description: "Create one Formbricks contact attribute key inside a workspace.",
    requiredScopes: [],
    inputSchema: contactAttributeKeyCreateInputSchema,
    outputSchema: s.object("The normalized Formbricks contact attribute key creation response.", {
      contactAttributeKey: contactAttributeKeySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_contact_attribute_key",
    description: "Update one existing Formbricks contact attribute key.",
    requiredScopes: [],
    inputSchema: contactAttributeKeyUpdateInputSchema,
    outputSchema: s.object("The normalized Formbricks contact attribute key update response.", {
      contactAttributeKey: contactAttributeKeySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_contact_attribute_key",
    description: "Delete one Formbricks contact attribute key by its identifier.",
    requiredScopes: [],
    inputSchema: contactAttributeKeyIdInputSchema,
    outputSchema: s.object("The normalized Formbricks contact attribute key deletion response.", {
      contactAttributeKey: contactAttributeKeySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create one Formbricks contact with a workspace-scoped attributes object.",
    requiredScopes: [],
    inputSchema: createContactInputSchema,
    outputSchema: s.object("The normalized Formbricks contact creation response.", {
      contact: contactSchema,
    }),
  }),
];
