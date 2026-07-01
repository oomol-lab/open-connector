import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "affinity";

const cursorSchema = s.string("The pagination cursor returned by Affinity.", {
  minLength: 1,
});

const limitSchema = s.integer("The number of items to include in the page.", {
  minimum: 1,
  maximum: 100,
});

const idSchema = s.integer("One Affinity numeric identifier.", {
  exclusiveMinimum: 0,
});

const fieldTypeSchema = s.stringEnum("One Affinity field type selector.", [
  "enriched",
  "global",
  "list",
  "relationship-intelligence",
]);

function positiveId(description: string) {
  return s.integer(description, { exclusiveMinimum: 0 });
}

function repeatedIdArray(description: string) {
  return s.array(description, idSchema, { minItems: 1, maxItems: 100 });
}

function repeatedStringArray(description: string, itemDescription: string) {
  return s.array(description, s.string(itemDescription, { minLength: 1 }), {
    minItems: 1,
    maxItems: 100,
  });
}

const paginationInputFields = {
  cursor: cursorSchema,
  limit: limitSchema,
};

const paginationOutputSchema = s.requiredObject("The Affinity pagination object returned by the API.", {
  nextUrl: s.nullable(s.url("The URL for the next page when Affinity provided one.")),
  prevUrl: s.nullable(s.url("The URL for the previous page when Affinity provided one.")),
});

const fieldValueSchema = s.looseObject(
  {},
  { description: "One Affinity field value union object returned by the API." },
);

const fieldSchema = s.requiredObject("One Affinity field value object returned by the API.", {
  id: s.string("The field identifier."),
  name: s.string("The field display name."),
  type: s.stringEnum("The field category returned by Affinity.", [
    "enriched",
    "global",
    "list",
    "relationship-intelligence",
  ]),
  enrichmentSource: s.nullable(
    s.stringEnum("The enrichment source when Affinity returned one.", ["affinity-data", "dealroom"]),
  ),
  value: fieldValueSchema,
});

const personSchema = s.looseRequiredObject(
  "One Affinity person object returned by the API.",
  {
    id: positiveId("The Affinity person ID."),
    firstName: s.string("The person's first name."),
    lastName: s.nullable(s.string("The person's last name when available.")),
    primaryEmailAddress: s.nullable(s.email("The person's primary email address when available.")),
    emailAddresses: s.array("The person's email addresses.", s.email("One email address returned by Affinity.")),
    type: s.stringEnum("The Affinity person type.", ["internal", "external"]),
    fields: s.array("The non-list-specific fields attached to the person when requested.", fieldSchema),
  },
  { optional: [] },
);

const companySchema = s.looseRequiredObject(
  "One Affinity company object returned by the API.",
  {
    id: positiveId("The Affinity company ID."),
    name: s.string("The company name."),
    domain: s.nullable(s.string("The company's primary domain when available.")),
    domains: s.array("The domains returned for the company.", s.string("One company domain.")),
    isGlobal: s.boolean("Whether the company is global across tenants."),
    fields: s.array("The non-list-specific fields attached to the company when requested.", fieldSchema),
  },
  { optional: [] },
);

const opportunitySchema = s.looseRequiredObject(
  "One Affinity opportunity object returned by the API.",
  {
    id: positiveId("The Affinity opportunity ID."),
    name: s.string("The opportunity name."),
    listId: positiveId("The list ID that owns the opportunity."),
  },
  { optional: [] },
);

const listSchema = s.looseRequiredObject(
  "One Affinity list object returned by the API.",
  {
    id: positiveId("The Affinity list ID."),
    name: s.string("The list name."),
    creatorId: positiveId("The user ID that created the list."),
    ownerId: positiveId("The user ID that owns the list."),
    isPublic: s.boolean("Whether the list is public."),
  },
  { optional: [] },
);

const listWithTypeSchema = s.looseRequiredObject(
  "One Affinity list detail object returned by the API.",
  {
    id: positiveId("The Affinity list ID."),
    name: s.string("The list name."),
    creatorId: positiveId("The user ID that created the list."),
    ownerId: positiveId("The user ID that owns the list."),
    isPublic: s.boolean("Whether the list is public."),
    type: s.stringEnum("The entity type associated with the list.", ["company", "opportunity", "person"]),
  },
  { optional: [] },
);

const savedViewSchema = s.looseRequiredObject(
  "One Affinity saved view object returned by the API.",
  {
    id: positiveId("The Affinity saved view ID."),
    name: s.string("The saved view name."),
    type: s.stringEnum("The saved view type.", ["sheet", "board", "dashboard"]),
    createdAt: s.dateTime("The timestamp when the saved view was created."),
  },
  { optional: [] },
);

const fieldMetadataSchema = s.looseRequiredObject(
  "One Affinity field metadata object returned by the API.",
  {
    id: s.string("The field identifier."),
    name: s.string("The field name."),
    type: s.stringEnum("The field category returned by Affinity.", [
      "enriched",
      "global",
      "list",
      "relationship-intelligence",
    ]),
    enrichmentSource: s.nullable(
      s.stringEnum("The enrichment source when Affinity returned one.", ["affinity-data", "dealroom"]),
    ),
    valueType: s.stringEnum("The underlying Affinity value type.", [
      "person",
      "person-multi",
      "company",
      "company-multi",
      "filterable-text",
      "filterable-text-multi",
      "number",
      "number-multi",
      "datetime",
      "location",
      "location-multi",
      "text",
      "ranked-dropdown",
      "dropdown",
      "dropdown-multi",
      "formula-number",
      "interaction",
    ]),
  },
  { optional: [] },
);

const personListEntrySchema = s.looseRequiredObject(
  "One person list entry returned by a saved view or list entry endpoint.",
  {
    id: positiveId("The list entry ID."),
    type: s.literal("person", { description: "The entity type for this list entry." }),
    listId: positiveId("The list ID that owns the list entry."),
    createdAt: s.dateTime("The timestamp when the list entry was created."),
    creatorId: s.nullable(
      s.integer("The user ID that created the list entry when present.", {
        exclusiveMinimum: 0,
      }),
    ),
    entity: personSchema,
  },
  { optional: [] },
);

const companyListEntrySchema = s.looseRequiredObject(
  "One company list entry returned by a saved view or list entry endpoint.",
  {
    id: positiveId("The list entry ID."),
    type: s.literal("company", { description: "The entity type for this list entry." }),
    listId: positiveId("The list ID that owns the list entry."),
    createdAt: s.dateTime("The timestamp when the list entry was created."),
    creatorId: s.nullable(
      s.integer("The user ID that created the list entry when present.", {
        exclusiveMinimum: 0,
      }),
    ),
    entity: companySchema,
  },
  { optional: [] },
);

const opportunityListEntrySchema = s.looseRequiredObject(
  "One opportunity list entry returned by a saved view endpoint.",
  {
    id: positiveId("The list entry ID."),
    type: s.literal("opportunity", { description: "The entity type for this list entry." }),
    listId: positiveId("The list ID that owns the list entry."),
    createdAt: s.dateTime("The timestamp when the list entry was created."),
    creatorId: s.nullable(
      s.integer("The user ID that created the list entry when present.", {
        exclusiveMinimum: 0,
      }),
    ),
    entity: s.looseRequiredObject(
      "The Affinity opportunity entity returned for the list entry.",
      {
        id: positiveId("The Affinity opportunity ID."),
        name: s.string("The opportunity name."),
        listId: positiveId("The list ID that owns the opportunity."),
      },
      { optional: [] },
    ),
  },
  { optional: [] },
);

const savedViewListEntrySchema = s.anyOf("One saved-view list entry wrapper returned by Affinity.", [
  companyListEntrySchema,
  opportunityListEntrySchema,
  personListEntrySchema,
]);

const whoAmIOutputSchema = s.requiredObject("The authenticated Affinity account summary.", {
  tenant: s.looseRequiredObject(
    "The Affinity tenant returned by whoami.",
    {
      id: positiveId("The tenant ID."),
      name: s.string("The tenant name."),
      subdomain: s.string("The tenant subdomain."),
    },
    { optional: [] },
  ),
  user: s.looseRequiredObject(
    "The Affinity user returned by whoami.",
    {
      id: positiveId("The user ID."),
      firstName: s.string("The user's first name."),
      lastName: s.nullable(s.string("The user's last name when available.")),
      emailAddress: s.email("The user's email address."),
    },
    { optional: [] },
  ),
  grant: s.looseRequiredObject(
    "The Affinity grant returned by whoami.",
    {
      type: s.stringEnum("The authentication grant type.", ["api-key", "access-token"]),
      scopes: s.array("The grant scopes returned by Affinity.", s.string("One grant scope.")),
      createdAt: s.dateTime("When the grant was created."),
    },
    { optional: [] },
  ),
});

const personsOutputSchema = s.requiredObject("The Affinity persons page wrapper.", {
  persons: s.array("The Affinity persons returned by the API.", personSchema),
  pagination: paginationOutputSchema,
});

const personOutputSchema = s.requiredObject("The Affinity person response wrapper.", {
  person: personSchema,
});

const companiesOutputSchema = s.requiredObject("The Affinity companies page wrapper.", {
  companies: s.array("The Affinity companies returned by the API.", companySchema),
  pagination: paginationOutputSchema,
});

const companyOutputSchema = s.requiredObject("The Affinity company response wrapper.", {
  company: companySchema,
});

const opportunitiesOutputSchema = s.requiredObject("The Affinity opportunities page wrapper.", {
  opportunities: s.array("The Affinity opportunities returned by the API.", opportunitySchema),
  pagination: paginationOutputSchema,
});

const opportunityOutputSchema = s.requiredObject("The Affinity opportunity response wrapper.", {
  opportunity: opportunitySchema,
});

const listsOutputSchema = s.requiredObject("The Affinity lists page wrapper.", {
  lists: s.array("The Affinity lists returned by the API.", listSchema),
  pagination: paginationOutputSchema,
});

const listOutputSchema = s.requiredObject("The Affinity list response wrapper.", {
  list: listWithTypeSchema,
});

const fieldsOutputSchema = s.requiredObject("The Affinity field metadata page wrapper.", {
  fields: s.array("The Affinity field metadata records returned by the API.", fieldMetadataSchema),
  pagination: paginationOutputSchema,
});

const savedViewsOutputSchema = s.requiredObject("The Affinity saved views page wrapper.", {
  savedViews: s.array("The Affinity saved views returned by the API.", savedViewSchema),
  pagination: paginationOutputSchema,
});

const savedViewOutputSchema = s.requiredObject("The Affinity saved view response wrapper.", {
  savedView: savedViewSchema,
});

const listEntriesOutputSchema = s.requiredObject("The Affinity saved-view list entries page wrapper.", {
  listEntries: s.array("The Affinity list entries returned by the API.", savedViewListEntrySchema),
  pagination: paginationOutputSchema,
});

const entityListEntriesOutputSchema = s.requiredObject("The Affinity entity list entries page wrapper.", {
  listEntries: s.array(
    "The Affinity list entries returned for the entity.",
    s.looseRequiredObject(
      "One Affinity entity list entry object.",
      {
        id: positiveId("The list entry ID."),
        listId: positiveId("The list ID that owns the list entry."),
        createdAt: s.dateTime("The timestamp when the list entry was created."),
        creatorId: s.nullable(
          s.integer("The user ID that created the list entry when present.", {
            exclusiveMinimum: 0,
          }),
        ),
        fields: s.array("The list-specific fields returned for the list entry.", fieldSchema),
      },
      { optional: [] },
    ),
  ),
  pagination: paginationOutputSchema,
});

const emptyInputSchema = s.object("No additional input is required for this action.", {});

const pageInputSchema = s.object("The pagination input for this Affinity list action.", paginationInputFields, {
  optional: ["cursor", "limit"],
});

const personFiltersInputSchema = s.object(
  "The input payload for listing Affinity persons.",
  {
    ...paginationInputFields,
    ids: repeatedIdArray("The Affinity person IDs to fetch directly."),
    fieldIds: repeatedStringArray("The field IDs for which to return person field data.", "One Affinity field ID."),
    fieldTypes: s.array("The field types for which to return person field data.", fieldTypeSchema, {
      minItems: 1,
      maxItems: 4,
    }),
  },
  { optional: ["cursor", "limit", "ids", "fieldIds", "fieldTypes"] },
);

const companyFiltersInputSchema = s.object(
  "The input payload for listing Affinity companies.",
  {
    ...paginationInputFields,
    ids: repeatedIdArray("The Affinity company IDs to fetch directly."),
    fieldIds: repeatedStringArray("The field IDs for which to return company field data.", "One Affinity field ID."),
    fieldTypes: s.array("The field types for which to return company field data.", fieldTypeSchema, {
      minItems: 1,
      maxItems: 3,
    }),
  },
  { optional: ["cursor", "limit", "ids", "fieldIds", "fieldTypes"] },
);

const opportunityFiltersInputSchema = s.object(
  "The input payload for listing Affinity opportunities.",
  {
    ...paginationInputFields,
    ids: repeatedIdArray("The Affinity opportunity IDs to fetch directly."),
  },
  { optional: ["cursor", "limit", "ids"] },
);

const personIdInputSchema = s.object(
  "The input payload for fetching one Affinity person.",
  {
    personId: positiveId("The Affinity person ID."),
    fieldIds: repeatedStringArray("The field IDs for which to return person field data.", "One Affinity field ID."),
    fieldTypes: s.array(
      "The field types for which to return person field data.",
      s.stringEnum("One Affinity person field type selector.", ["enriched", "global", "relationship-intelligence"]),
      { minItems: 1, maxItems: 3 },
    ),
  },
  { required: ["personId"] },
);

const companyIdInputSchema = s.object(
  "The input payload for fetching one Affinity company.",
  {
    companyId: positiveId("The Affinity company ID."),
    fieldIds: repeatedStringArray("The field IDs for which to return company field data.", "One Affinity field ID."),
    fieldTypes: s.array(
      "The field types for which to return company field data.",
      s.stringEnum("One Affinity company field type selector.", ["enriched", "global", "relationship-intelligence"]),
      { minItems: 1, maxItems: 3 },
    ),
  },
  { required: ["companyId"] },
);

const opportunityIdInputSchema = s.object(
  "The input payload for fetching one Affinity opportunity.",
  {
    opportunityId: positiveId("The Affinity opportunity ID."),
  },
  { required: ["opportunityId"] },
);

const listIdInputSchema = s.object(
  "The input payload for fetching one Affinity list.",
  {
    listId: positiveId("The Affinity list ID."),
  },
  { required: ["listId"] },
);

const listEntriesInputSchema = s.object(
  "The input payload for listing Affinity list entries.",
  {
    listId: positiveId("The Affinity list ID."),
    ...paginationInputFields,
    fieldIds: repeatedStringArray("The field IDs for which to return list entry field data.", "One Affinity field ID."),
    fieldTypes: s.array("The field types for which to return list entry field data.", fieldTypeSchema, {
      minItems: 1,
      maxItems: 4,
    }),
  },
  { optional: ["cursor", "limit", "fieldIds", "fieldTypes"] },
);

const savedViewIdInputSchema = s.object(
  "The input payload for fetching one Affinity saved view.",
  {
    listId: positiveId("The Affinity list ID."),
    viewId: positiveId("The Affinity saved view ID."),
  },
  { required: ["listId", "viewId"] },
);

const savedViewListEntriesInputSchema = s.object(
  "The input payload for listing Affinity saved-view list entries.",
  {
    listId: positiveId("The Affinity list ID."),
    viewId: positiveId("The Affinity saved view ID."),
    ...paginationInputFields,
  },
  { optional: ["cursor", "limit"] },
);

const entityListsInputFields = {
  ...paginationInputFields,
};

const personListsInputSchema = s.object(
  "The input payload for listing the lists that contain one Affinity person.",
  {
    personId: positiveId("The Affinity person ID."),
    ...entityListsInputFields,
  },
  { optional: ["cursor", "limit"] },
);

const personListEntriesInputSchema = s.object(
  "The input payload for listing all list entries for one Affinity person.",
  {
    personId: positiveId("The Affinity person ID."),
    ...entityListsInputFields,
  },
  { optional: ["cursor", "limit"] },
);

const companyListsInputSchema = s.object(
  "The input payload for listing the lists that contain one Affinity company.",
  {
    companyId: positiveId("The Affinity company ID."),
    ...entityListsInputFields,
  },
  { optional: ["cursor", "limit"] },
);

const companyListEntriesInputSchema = s.object(
  "The input payload for listing all list entries for one Affinity company.",
  {
    companyId: positiveId("The Affinity company ID."),
    ...entityListsInputFields,
  },
  { optional: ["cursor", "limit"] },
);

export const affinityActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the authenticated Affinity user, tenant, and API grant summary.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: whoAmIOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_persons",
    description: "List Affinity persons with optional ID and field selectors.",
    requiredScopes: [],
    inputSchema: personFiltersInputSchema,
    outputSchema: personsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_person",
    description: "Get one Affinity person by ID with optional field selectors.",
    requiredScopes: [],
    inputSchema: personIdInputSchema,
    outputSchema: personOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_person_fields",
    description: "List non-list-specific Affinity person field metadata.",
    requiredScopes: [],
    inputSchema: pageInputSchema,
    outputSchema: fieldsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_person_lists",
    description: "List the Affinity lists that contain one person.",
    requiredScopes: [],
    inputSchema: personListsInputSchema,
    outputSchema: listsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_person_list_entries",
    description: "List all Affinity list entries for one person across lists.",
    requiredScopes: [],
    inputSchema: personListEntriesInputSchema,
    outputSchema: entityListEntriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_companies",
    description: "List Affinity companies with optional ID and field selectors.",
    requiredScopes: [],
    inputSchema: companyFiltersInputSchema,
    outputSchema: companiesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_company",
    description: "Get one Affinity company by ID with optional field selectors.",
    requiredScopes: [],
    inputSchema: companyIdInputSchema,
    outputSchema: companyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_company_fields",
    description: "List non-list-specific Affinity company field metadata.",
    requiredScopes: [],
    inputSchema: pageInputSchema,
    outputSchema: fieldsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_company_lists",
    description: "List the Affinity lists that contain one company.",
    requiredScopes: [],
    inputSchema: companyListsInputSchema,
    outputSchema: listsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_company_list_entries",
    description: "List all Affinity list entries for one company across lists.",
    requiredScopes: [],
    inputSchema: companyListEntriesInputSchema,
    outputSchema: entityListEntriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_opportunities",
    description: "List Affinity opportunities with optional ID filtering.",
    requiredScopes: [],
    inputSchema: opportunityFiltersInputSchema,
    outputSchema: opportunitiesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_opportunity",
    description: "Get one Affinity opportunity by ID.",
    requiredScopes: [],
    inputSchema: opportunityIdInputSchema,
    outputSchema: opportunityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_lists",
    description: "List the Affinity lists visible to the authenticated user.",
    requiredScopes: [],
    inputSchema: pageInputSchema,
    outputSchema: listsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_list",
    description: "Get one Affinity list by ID.",
    requiredScopes: [],
    inputSchema: listIdInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_list_fields",
    description: "List the field metadata for one Affinity list.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing field metadata on one Affinity list.",
      {
        listId: positiveId("The Affinity list ID."),
        ...paginationInputFields,
      },
      { optional: ["cursor", "limit"] },
    ),
    outputSchema: fieldsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_list_entries",
    description: "List the Affinity list entries for one list with optional field selectors.",
    requiredScopes: [],
    inputSchema: listEntriesInputSchema,
    outputSchema: listEntriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_saved_views",
    description: "List the saved views configured on one Affinity list.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing saved views on one Affinity list.",
      {
        listId: positiveId("The Affinity list ID."),
        ...paginationInputFields,
      },
      { optional: ["cursor", "limit"] },
    ),
    outputSchema: savedViewsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_saved_view",
    description: "Get one Affinity saved view by list ID and saved view ID.",
    requiredScopes: [],
    inputSchema: savedViewIdInputSchema,
    outputSchema: savedViewOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_saved_view_list_entries",
    description: "List the Affinity list entries returned by one saved view.",
    requiredScopes: [],
    inputSchema: savedViewListEntriesInputSchema,
    outputSchema: listEntriesOutputSchema,
  }),
] satisfies ActionDefinition[];

export type AffinityActionName = (typeof affinityActions)[number]["name"];
