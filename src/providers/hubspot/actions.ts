import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hubspot";

export const hubspotConnectorScopes = {
  crmRead: "hubspot.crm.read",
  crmWrite: "hubspot.crm.write",
  contactsRead: "hubspot.contacts.read",
  contactsWrite: "hubspot.contacts.write",
  companiesRead: "hubspot.companies.read",
  companiesWrite: "hubspot.companies.write",
  dealsRead: "hubspot.deals.read",
  dealsWrite: "hubspot.deals.write",
  ticketsRead: "hubspot.tickets.read",
  ticketsWrite: "hubspot.tickets.write",
  lineItemsRead: "hubspot.line_items.read",
  lineItemsWrite: "hubspot.line_items.write",
  productsRead: "hubspot.products.read",
  productsWrite: "hubspot.products.write",
  callsRead: "hubspot.calls.read",
  callsWrite: "hubspot.calls.write",
  emailsRead: "hubspot.emails.read",
  emailsWrite: "hubspot.emails.write",
  meetingsRead: "hubspot.meetings.read",
  meetingsWrite: "hubspot.meetings.write",
  notesRead: "hubspot.notes.read",
  notesWrite: "hubspot.notes.write",
  tasksRead: "hubspot.tasks.read",
  tasksWrite: "hubspot.tasks.write",
  campaignsRead: "hubspot.campaigns.read",
  campaignsWrite: "hubspot.campaigns.write",
  ownersRead: "hubspot.owners.read",
  schemasRead: "hubspot.schemas.read",
};

const genericHubspotObjectTypeField = s.nonEmptyString(
  "HubSpot CRM object type accepted by the MCP server, such as contacts, companies, deals, tickets, line_items, products, calls, emails, meetings, notes, tasks, campaigns, or a custom object type.",
);
const hubspotObjectIdField = s.anyOf("HubSpot object ID.", [
  s.integer("Numeric HubSpot object ID."),
  s.nonEmptyString("HubSpot object ID string."),
]);
const requestedPropertiesField = s.array(
  "Property names to include in the returned record payload.",
  s.nonEmptyString("HubSpot property name."),
);
const requestedPropertiesWithHistoryField = s.array(
  "Property names to include with their value history.",
  s.nonEmptyString("HubSpot property name."),
);
const requestedAssociationsField = s.array(
  "Associated object types to include in the response.",
  s.nonEmptyString("HubSpot associated object type."),
);
const propertiesInputSchema = s.record(
  "HubSpot properties keyed by property name.",
  s.unknown("HubSpot property value."),
);
const looseObjectSchema = s.looseObject("HubSpot object payload.");
const hubspotRecordSchema = s.looseObject("HubSpot CRM record returned by the MCP server.", {
  id: s.string("HubSpot record identifier."),
  archived: s.boolean("Whether the record is archived."),
  createdAt: s.string("Timestamp when the record was created."),
  updatedAt: s.string("Timestamp when the record was last updated."),
  properties: s.record("HubSpot properties keyed by property name.", s.unknown("Property value.")),
  propertiesWithHistory: s.record(
    "HubSpot property histories keyed by property name.",
    s.unknown("Property history payload."),
  ),
  associations: s.looseObject("Associations returned by HubSpot when requested."),
});
const hubspotPropertySchema = s.looseObject("HubSpot property definition returned by the MCP server.", {
  name: s.string("Internal HubSpot property name."),
  label: s.string("Display label for the property."),
  type: s.string("HubSpot property type."),
  fieldType: s.string("HubSpot field presentation type."),
  description: s.nullable(s.string("Description configured for the property.")),
  groupName: s.nullable(s.string("HubSpot property group name.")),
  options: s.array("Enumerated options for the property.", looseObjectSchema),
});
const pagingSchema = s.looseObject("Paging information returned by HubSpot.", {
  nextAfter: s.string("Cursor for the next search request when another page is available."),
});

const searchInputSchema = s.object(
  "The input payload for this action.",
  {
    query: s.string("Full-text query applied to the HubSpot CRM search."),
    filterGroups: s.array(
      "HubSpot filter groups used to narrow the search.",
      s.looseObject("HubSpot CRM search filter group."),
      { maxItems: 5 },
    ),
    sorts: s.array("HubSpot sort expressions.", s.nonEmptyString("HubSpot sort expression.")),
    properties: requestedPropertiesField,
    propertiesWithHistory: requestedPropertiesWithHistoryField,
    associations: requestedAssociationsField,
    limit: s.integer("Maximum number of records to return.", { minimum: 1, maximum: 200 }),
    after: s.nonEmptyString("Paging cursor returned by a previous search request."),
  },
  {
    optional: [
      "query",
      "filterGroups",
      "sorts",
      "properties",
      "propertiesWithHistory",
      "associations",
      "limit",
      "after",
    ],
  },
);

const getRecordInputSchema = s.object(
  "The input payload for this action.",
  {
    recordId: s.nonEmptyString("HubSpot record identifier."),
    idProperty: s.nonEmptyString("Alternate unique property name that should resolve recordId."),
    properties: requestedPropertiesField,
    propertiesWithHistory: requestedPropertiesWithHistoryField,
    associations: requestedAssociationsField,
  },
  {
    optional: ["idProperty", "properties", "propertiesWithHistory", "associations"],
  },
);

const createRecordInputSchema = s.object(
  "The input payload for this action.",
  {
    properties: propertiesInputSchema,
    associations: s.array("Association definitions to create alongside the record.", looseObjectSchema),
  },
  {
    optional: ["associations"],
  },
);

const updateRecordInputSchema = s.object(
  "The input payload for this action.",
  {
    recordId: s.nonEmptyString("HubSpot record identifier."),
    idProperty: s.nonEmptyString("Alternate unique property name that should resolve recordId."),
    properties: propertiesInputSchema,
  },
  {
    optional: ["idProperty"],
  },
);

const listPropertiesInputSchema = s.object(
  "The input payload for this action.",
  {
    objectType: genericHubspotObjectTypeField,
    keywords: s.array(
      "Keywords used to search matching property definitions.",
      s.nonEmptyString("Property search keyword."),
      { maxItems: 5 },
    ),
    propertyNames: s.array(
      "Specific property names to fetch when a full definition is needed.",
      s.nonEmptyString("HubSpot property name."),
    ),
  },
  {
    optional: ["keywords", "propertyNames"],
  },
);

const getPropertyInputSchema = s.object("The input payload for this action.", {
  objectType: genericHubspotObjectTypeField,
  propertyName: s.nonEmptyString("HubSpot property name."),
});

const searchCrmObjectsInputSchema = s.looseRequiredObject(
  "The input payload for this action. Unknown fields are passed through to the HubSpot MCP tool.",
  {
    objectType: genericHubspotObjectTypeField,
    query: s.string("Full-text query applied to the HubSpot CRM search."),
    filterGroups: s.array(
      "HubSpot filter groups used to narrow the search.",
      s.looseObject("HubSpot CRM search filter group."),
      { maxItems: 5 },
    ),
    sorts: s.array("HubSpot sort expressions.", s.nonEmptyString("HubSpot sort expression.")),
    properties: requestedPropertiesField,
    propertiesWithHistory: requestedPropertiesWithHistoryField,
    associations: requestedAssociationsField,
    limit: s.integer("Maximum number of records to return.", { minimum: 1, maximum: 200 }),
    after: s.nonEmptyString("Paging cursor returned by a previous search request."),
  },
  {
    optional: [
      "query",
      "filterGroups",
      "sorts",
      "properties",
      "propertiesWithHistory",
      "associations",
      "limit",
      "after",
    ],
  },
);

const getCrmObjectsInputSchema = s.looseRequiredObject(
  "The input payload for this action. Unknown fields are passed through to the HubSpot MCP tool.",
  {
    objectType: genericHubspotObjectTypeField,
    objectIds: s.array("HubSpot object IDs to fetch.", hubspotObjectIdField, {
      minItems: 1,
      maxItems: 100,
    }),
    idProperty: s.nonEmptyString("Alternate unique property name that should resolve objectIds."),
    properties: requestedPropertiesField,
    propertiesWithHistory: requestedPropertiesWithHistoryField,
    associations: requestedAssociationsField,
  },
  {
    optional: ["idProperty", "properties", "propertiesWithHistory", "associations"],
  },
);

const manageCrmObjectsInputSchema = s.anyOf(
  "The input payload for this action. Unknown fields are passed through to the HubSpot MCP tool.",
  [
    s.looseRequiredObject("HubSpot MCP createRequest payload.", {
      createRequest: s.looseObject("HubSpot MCP createRequest payload."),
    }),
    s.looseRequiredObject("HubSpot MCP updateRequest payload.", {
      updateRequest: s.looseObject("HubSpot MCP updateRequest payload."),
    }),
    s.looseRequiredObject(
      "Convenience payload for creating one HubSpot CRM object.",
      {
        objectType: genericHubspotObjectTypeField,
        operation: s.literal("create", { description: "CRM mutation operation." }),
        properties: propertiesInputSchema,
        associations: s.array("Association definitions to create alongside the record.", looseObjectSchema),
      },
      {
        optional: ["associations"],
      },
    ),
    s.looseRequiredObject(
      "Convenience payload for updating one HubSpot CRM object by recordId.",
      {
        objectType: genericHubspotObjectTypeField,
        operation: s.literal("update", { description: "CRM mutation operation." }),
        recordId: s.nonEmptyString("HubSpot record identifier for update operations."),
        idProperty: s.nonEmptyString("Alternate unique property name that should resolve the record ID."),
        properties: propertiesInputSchema,
      },
      {
        optional: ["idProperty"],
      },
    ),
    s.looseRequiredObject(
      "Convenience payload for updating one HubSpot CRM object by id.",
      {
        objectType: genericHubspotObjectTypeField,
        operation: s.literal("update", { description: "CRM mutation operation." }),
        id: s.nonEmptyString("HubSpot record identifier for update operations."),
        idProperty: s.nonEmptyString("Alternate unique property name that should resolve the record ID."),
        properties: propertiesInputSchema,
      },
      {
        optional: ["idProperty"],
      },
    ),
  ],
);

const searchPropertiesInputSchema = s.looseRequiredObject(
  "The input payload for this action. Unknown fields are passed through to the HubSpot MCP tool.",
  {
    objectType: genericHubspotObjectTypeField,
    keywords: s.array(
      "Keywords used to search matching property definitions.",
      s.nonEmptyString("Property search keyword."),
      { minItems: 1, maxItems: 5 },
    ),
  },
);

const getPropertiesInputSchema = s.looseRequiredObject(
  "The input payload for this action. Unknown fields are passed through to the HubSpot MCP tool.",
  {
    objectType: genericHubspotObjectTypeField,
    propertyNames: s.array(
      "Specific property names to fetch when a full definition is needed.",
      s.nonEmptyString("HubSpot property name."),
    ),
  },
  {
    optional: ["propertyNames"],
  },
);

const searchOwnersInputSchema = s.looseObject(
  "The input payload for this action. Unknown fields are passed through to the HubSpot MCP tool.",
  {
    query: s.string("Owner name or email query."),
    ownerIds: s.array("HubSpot owner IDs to look up.", hubspotObjectIdField, { maxItems: 100 }),
    limit: s.integer("Maximum number of owners to return.", { minimum: 1, maximum: 100 }),
    after: s.nonEmptyString("Paging cursor returned by a previous owner search request."),
  },
);

const campaignIdField = hubspotObjectIdField;
const campaignIdsField = s.array("HubSpot campaign IDs.", campaignIdField, {
  minItems: 1,
});

const getCampaignContactsByTypeInputSchema = s.looseRequiredObject(
  "The input payload for this action. Unknown fields are passed through to the HubSpot MCP tool.",
  {
    campaignId: campaignIdField,
    attributionType: s.nonEmptyString("Campaign attribution type."),
    limit: s.integer("Maximum number of contact IDs to return.", { minimum: 1, maximum: 200 }),
    after: s.nonEmptyString("Paging cursor returned by a previous request."),
  },
  {
    optional: ["limit", "after"],
  },
);

const getCampaignAnalyticsInputSchema = s.looseRequiredObject(
  "The input payload for this action. Unknown fields are passed through to the HubSpot MCP tool.",
  {
    campaignIds: campaignIdsField,
    metricType: s.nonEmptyString("Campaign analytics metric type."),
    startDate: s.date("Inclusive analytics start date."),
    endDate: s.date("Inclusive analytics end date."),
  },
  {
    optional: ["metricType", "startDate", "endDate"],
  },
);

const getCampaignAssetTypesInputSchema = s.looseObject(
  "The input payload for this action. Unknown fields are passed through to the HubSpot MCP tool.",
  {},
);

const getCampaignAssetMetricsInputSchema = s.looseRequiredObject(
  "The input payload for this action. Unknown fields are passed through to the HubSpot MCP tool.",
  {
    campaignId: campaignIdField,
    assetType: s.nonEmptyString("Campaign asset type name."),
    objectIds: s.array("CRM object IDs associated with the campaign.", hubspotObjectIdField, {
      minItems: 1,
    }),
  },
  {
    optional: ["objectIds"],
  },
);

const submitFeedbackInputSchema = s.looseRequiredObject(
  "The input payload for this action. Unknown fields are passed through to the HubSpot MCP tool.",
  {
    feedback: s.nonEmptyString("Feedback text to send to HubSpot."),
  },
);

const getUserDetailsInputSchema = s.object("The input payload for this action.", {});

const searchOutputSchema = (description: string) =>
  s.object(
    description,
    {
      results: s.array("Records returned by the search request.", hubspotRecordSchema),
      paging: pagingSchema,
      raw: s.unknown("Raw MCP response payload."),
    },
    {
      optional: ["paging", "raw"],
    },
  );

const recordOutputSchema = (description: string) =>
  s.object(description, {
    record: hubspotRecordSchema,
  });

const propertyListOutputSchema = s.object("HubSpot property definition list.", {
  properties: s.array("Property definitions returned for the requested object type.", hubspotPropertySchema),
});

const propertyOutputSchema = s.object("Single HubSpot property definition.", {
  property: hubspotPropertySchema,
});

const userDetailsOutputSchema = s.object("HubSpot MCP user details.", {
  userDetails: s.looseObject("Authenticated user, account, and access details from HubSpot MCP."),
});

const mcpToolOutputSchema = s.object("HubSpot MCP tool response.", {
  result: s.unknown("Raw response payload returned by the HubSpot MCP tool."),
});

export const hubspotActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_crm_objects",
    description: "Search and filter HubSpot CRM records for any object type supported by the MCP server.",
    requiredScopes: [hubspotConnectorScopes.crmRead],
    inputSchema: searchCrmObjectsInputSchema,
    outputSchema: mcpToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_crm_objects",
    description: "Fetch one or more HubSpot CRM objects by ID through the MCP server.",
    requiredScopes: [hubspotConnectorScopes.crmRead],
    inputSchema: getCrmObjectsInputSchema,
    outputSchema: mcpToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "manage_crm_objects",
    description: "Create or update HubSpot CRM records or activities through the MCP server.",
    requiredScopes: [hubspotConnectorScopes.crmWrite],
    inputSchema: manageCrmObjectsInputSchema,
    outputSchema: mcpToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_contacts",
    description: "Search HubSpot contacts with optional filters, sorting, and selected properties.",
    requiredScopes: [hubspotConnectorScopes.contactsRead],
    inputSchema: searchInputSchema,
    outputSchema: searchOutputSchema("HubSpot contact search results."),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get a HubSpot contact by record ID or by a custom idProperty value.",
    requiredScopes: [hubspotConnectorScopes.contactsRead],
    inputSchema: getRecordInputSchema,
    outputSchema: recordOutputSchema("Single HubSpot contact lookup result."),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a HubSpot contact with the provided properties and optional associations.",
    requiredScopes: [hubspotConnectorScopes.contactsWrite],
    inputSchema: createRecordInputSchema,
    outputSchema: recordOutputSchema("HubSpot contact creation result."),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a HubSpot contact by record ID or by a custom idProperty value.",
    requiredScopes: [hubspotConnectorScopes.contactsWrite],
    inputSchema: updateRecordInputSchema,
    outputSchema: recordOutputSchema("HubSpot contact update result."),
  }),
  defineProviderAction(service, {
    name: "search_companies",
    description: "Search HubSpot companies with optional filters, sorting, and selected properties.",
    requiredScopes: [hubspotConnectorScopes.companiesRead],
    inputSchema: searchInputSchema,
    outputSchema: searchOutputSchema("HubSpot company search results."),
  }),
  defineProviderAction(service, {
    name: "get_company",
    description: "Get a HubSpot company by record ID or by a custom idProperty value.",
    requiredScopes: [hubspotConnectorScopes.companiesRead],
    inputSchema: getRecordInputSchema,
    outputSchema: recordOutputSchema("Single HubSpot company lookup result."),
  }),
  defineProviderAction(service, {
    name: "create_company",
    description: "Create a HubSpot company with the provided properties and optional associations.",
    requiredScopes: [hubspotConnectorScopes.companiesWrite],
    inputSchema: createRecordInputSchema,
    outputSchema: recordOutputSchema("HubSpot company creation result."),
  }),
  defineProviderAction(service, {
    name: "update_company",
    description: "Update a HubSpot company by record ID or by a custom idProperty value.",
    requiredScopes: [hubspotConnectorScopes.companiesWrite],
    inputSchema: updateRecordInputSchema,
    outputSchema: recordOutputSchema("HubSpot company update result."),
  }),
  defineProviderAction(service, {
    name: "search_deals",
    description: "Search HubSpot deals with optional filters, sorting, and selected properties.",
    requiredScopes: [hubspotConnectorScopes.dealsRead],
    inputSchema: searchInputSchema,
    outputSchema: searchOutputSchema("HubSpot deal search results."),
  }),
  defineProviderAction(service, {
    name: "get_deal",
    description: "Get a HubSpot deal by record ID or by a custom idProperty value.",
    requiredScopes: [hubspotConnectorScopes.dealsRead],
    inputSchema: getRecordInputSchema,
    outputSchema: recordOutputSchema("Single HubSpot deal lookup result."),
  }),
  defineProviderAction(service, {
    name: "create_deal",
    description: "Create a HubSpot deal with the provided properties and optional associations.",
    requiredScopes: [hubspotConnectorScopes.dealsWrite],
    inputSchema: createRecordInputSchema,
    outputSchema: recordOutputSchema("HubSpot deal creation result."),
  }),
  defineProviderAction(service, {
    name: "update_deal",
    description: "Update a HubSpot deal by record ID or by a custom idProperty value.",
    requiredScopes: [hubspotConnectorScopes.dealsWrite],
    inputSchema: updateRecordInputSchema,
    outputSchema: recordOutputSchema("HubSpot deal update result."),
  }),
  defineProviderAction(service, {
    name: "list_properties",
    description: "List or search HubSpot property definitions for an MCP-supported object type.",
    requiredScopes: [hubspotConnectorScopes.schemasRead],
    inputSchema: listPropertiesInputSchema,
    outputSchema: propertyListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_property",
    description: "Get a single HubSpot property definition for an MCP-supported object type.",
    requiredScopes: [hubspotConnectorScopes.schemasRead],
    inputSchema: getPropertyInputSchema,
    outputSchema: propertyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_properties",
    description: "Find HubSpot property definitions for an object type using keyword search.",
    requiredScopes: [hubspotConnectorScopes.schemasRead],
    inputSchema: searchPropertiesInputSchema,
    outputSchema: mcpToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_properties",
    description: "Get full HubSpot property definitions for an object type.",
    requiredScopes: [hubspotConnectorScopes.schemasRead],
    inputSchema: getPropertiesInputSchema,
    outputSchema: mcpToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_owners",
    description: "Find HubSpot CRM record owners by name, email, or owner ID.",
    requiredScopes: [hubspotConnectorScopes.ownersRead],
    inputSchema: searchOwnersInputSchema,
    outputSchema: mcpToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_campaign_contacts_by_type",
    description: "Fetch paginated HubSpot contact IDs for a campaign filtered by attribution type.",
    requiredScopes: [hubspotConnectorScopes.campaignsRead],
    inputSchema: getCampaignContactsByTypeInputSchema,
    outputSchema: mcpToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_campaign_analytics",
    description: "Get HubSpot campaign analytics for one or more campaigns.",
    requiredScopes: [hubspotConnectorScopes.campaignsRead],
    inputSchema: getCampaignAnalyticsInputSchema,
    outputSchema: mcpToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_campaign_asset_types",
    description: "List HubSpot asset type names available as campaign assets.",
    requiredScopes: [hubspotConnectorScopes.campaignsRead],
    inputSchema: getCampaignAssetTypesInputSchema,
    outputSchema: mcpToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_campaign_asset_metrics",
    description: "Get metrics and properties for CRM objects associated with a HubSpot campaign.",
    requiredScopes: [hubspotConnectorScopes.campaignsRead],
    inputSchema: getCampaignAssetMetricsInputSchema,
    outputSchema: mcpToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "submit_feedback",
    description: "Send feedback about the HubSpot MCP server experience to HubSpot.",
    requiredScopes: [],
    inputSchema: submitFeedbackInputSchema,
    outputSchema: mcpToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user_details",
    description: "Get the authenticated HubSpot MCP user's account and access details.",
    requiredScopes: [],
    inputSchema: getUserDetailsInputSchema,
    outputSchema: userDetailsOutputSchema,
  }),
];
