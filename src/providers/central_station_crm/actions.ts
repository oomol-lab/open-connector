import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "central_station_crm" as const;

function defineAction<TName extends string>(
  input: Omit<Parameters<typeof defineProviderAction<TName>>[1], "providerPermissions"> & {
    service: typeof service;
    providerPermissions?: string[];
  },
): ProviderActionDefinition<TName> {
  const { service: _service, ...action } = input;
  return defineProviderAction(service, action);
}

const idSchema = s.positiveInteger("The CentralStationCRM numeric record identifier.");
const pageSchema = s.positiveInteger("The 1-based CentralStationCRM result page to fetch.");
const perpageSchema = s.positiveInteger("The maximum number of CentralStationCRM records to fetch.");
const orderSchema = s.string("The CentralStationCRM order expression to apply.", {
  minLength: 1,
});
const includesSchema = s.string("Comma-separated CentralStationCRM includes parameter.", {
  minLength: 1,
});
const methodsSchema = s.string("Comma-separated CentralStationCRM methods parameter.", {
  minLength: 1,
});
const noLogSchema = s.boolean("Whether CentralStationCRM should skip creating a protocol log.");

const rawObjectSchema = s.looseObject("The raw object returned by CentralStationCRM.");
const rawArraySchema = s.array("The raw array returned by CentralStationCRM.", rawObjectSchema);

const userSchema = s.looseRequiredObject(
  "A CentralStationCRM user.",
  {
    raw: rawObjectSchema,
    id: idSchema,
    first: s.nullable(s.string("The user's first name.")),
    last: s.nullable(s.string("The user's last name.")),
    name: s.nullable(s.string("The user's last name as returned by CentralStationCRM.")),
    login: s.nullable(s.string("The user's login email address.")),
    current_account: s.nullable(s.string("The current account subdomain or account name.")),
    timezone: s.nullable(s.string("The user's selected timezone.")),
  },
  { optional: ["id", "first", "last", "name", "login", "current_account", "timezone"] },
);

const personSchema = s.looseRequiredObject(
  "A CentralStationCRM person.",
  {
    raw: rawObjectSchema,
    id: idSchema,
    account_id: s.nullable(s.integer("The CentralStationCRM account identifier.")),
    user_id: s.nullable(s.integer("The assigned CentralStationCRM user identifier.")),
    group_id: s.nullable(s.integer("The assigned CentralStationCRM group identifier.")),
    first_name: s.nullable(s.string("The person's first name.")),
    name: s.nullable(s.string("The person's last name or display name.")),
    background: s.nullable(s.string("Background notes about the person.")),
    salutation: s.nullable(s.string("The stored salutation.")),
    title: s.nullable(s.string("The person's title.")),
    country_code: s.nullable(s.string("The person's language or country code.")),
    created_at: s.nullable(s.dateTime("The record creation timestamp.")),
    updated_at: s.nullable(s.dateTime("The record update timestamp.")),
  },
  {
    optional: [
      "id",
      "account_id",
      "user_id",
      "group_id",
      "first_name",
      "name",
      "background",
      "salutation",
      "title",
      "country_code",
      "created_at",
      "updated_at",
    ],
  },
);

const companySchema = s.looseRequiredObject(
  "A CentralStationCRM company.",
  {
    raw: rawObjectSchema,
    id: idSchema,
    account_id: s.nullable(s.integer("The CentralStationCRM account identifier.")),
    user_id: s.nullable(s.integer("The assigned CentralStationCRM user identifier.")),
    group_id: s.nullable(s.integer("The assigned CentralStationCRM group identifier.")),
    name: s.nullable(s.string("The company name.")),
    background: s.nullable(s.string("Background notes about the company.")),
    created_at: s.nullable(s.dateTime("The record creation timestamp.")),
    updated_at: s.nullable(s.dateTime("The record update timestamp.")),
  },
  {
    optional: ["id", "account_id", "user_id", "group_id", "name", "background", "created_at", "updated_at"],
  },
);

const dealSchema = s.looseRequiredObject(
  "A CentralStationCRM deal.",
  {
    raw: rawObjectSchema,
    id: idSchema,
    account_id: s.nullable(s.integer("The CentralStationCRM account identifier.")),
    company_id: s.nullable(s.integer("The linked company identifier.")),
    user_id: s.nullable(s.integer("The assigned CentralStationCRM user identifier.")),
    group_id: s.nullable(s.integer("The assigned CentralStationCRM group identifier.")),
    name: s.nullable(s.string("The deal name.")),
    value: s.nullable(s.string("The monetary value of the deal.")),
    value_type: s.nullable(s.string("The billing type of the deal value.")),
    value_sum: s.nullable(s.string("The total value sum returned by CentralStationCRM.")),
    value_count: s.nullable(s.string("The value count returned by CentralStationCRM.")),
    current_state: s.nullable(s.string("The current deal state.")),
    target_date: s.nullable(s.date("The target date for the deal.")),
    finished_at: s.nullable(s.dateTime("The timestamp when the deal was finished.")),
    currency: s.nullable(s.string("The deal currency code.")),
    background: s.nullable(s.string("Background notes about the deal.")),
    deal_type_id: s.nullable(s.integer("The pipeline identifier.")),
    deal_type_stage_id: s.nullable(s.integer("The pipeline stage identifier.")),
    probability: s.nullable(s.integer("The probability of winning the deal in percent.")),
    created_at: s.nullable(s.dateTime("The record creation timestamp.")),
    updated_at: s.nullable(s.dateTime("The record update timestamp.")),
  },
  {
    optional: [
      "id",
      "account_id",
      "company_id",
      "user_id",
      "group_id",
      "name",
      "value",
      "value_type",
      "value_sum",
      "value_count",
      "current_state",
      "target_date",
      "finished_at",
      "currency",
      "background",
      "deal_type_id",
      "deal_type_stage_id",
      "probability",
      "created_at",
      "updated_at",
    ],
  },
);

const paginationInputSchema = {
  page: pageSchema,
  perpage: perpageSchema,
  order: orderSchema,
  includes: includesSchema,
  methods: methodsSchema,
} as const;

const tagFilterInputSchema = {
  tag_id: idSchema,
  tag_name: s.string("The CentralStationCRM tag name to filter by.", { minLength: 1 }),
} as const;

const personPayloadSchema = s.looseRequiredObject(
  "The CentralStationCRM person payload.",
  {
    name: s.string("The person's last name or display name.", { minLength: 1 }),
    first_name: s.string("The person's first name.", { minLength: 1 }),
    background: s.string("Background notes about the person.", { minLength: 1 }),
    user_id: idSchema,
    group_id: idSchema,
    country_code: s.string("The person's language or country code.", { minLength: 1 }),
    salutation: s.string("The stored salutation.", { minLength: 1 }),
    title: s.string("The person's title.", { minLength: 1 }),
  },
  {
    optional: ["first_name", "background", "user_id", "group_id", "country_code", "salutation", "title"],
  },
);

const companyPayloadSchema = s.looseRequiredObject(
  "The CentralStationCRM company payload.",
  {
    name: s.string("The company name.", { minLength: 1 }),
    background: s.string("Background notes about the company.", { minLength: 1 }),
    user_id: idSchema,
    group_id: idSchema,
  },
  { optional: ["background", "user_id", "group_id"] },
);

const dealPayloadSchema = s.looseRequiredObject(
  "The CentralStationCRM deal payload.",
  {
    name: s.string("The deal name.", { minLength: 1 }),
    value: s.nullable(s.string("The monetary value of the deal.")),
    value_type: s.nullable(s.string("The billing type of the deal value.")),
    target_date: s.nullable(s.date("The target date for the deal.")),
    current_state: s.string("The current deal state.", { minLength: 1 }),
    company_id: idSchema,
    user_id: idSchema,
    group_id: idSchema,
    background: s.string("Background notes about the deal.", { minLength: 1 }),
    deal_type_id: idSchema,
    deal_type_stage_id: idSchema,
    probability: s.integer("The probability of winning the deal in percent.", {
      minimum: 0,
      maximum: 100,
    }),
    currency: s.string("The deal currency code.", { minLength: 1 }),
    person_ids_set: s.string("Comma-separated person identifiers to assign to the deal.", {
      minLength: 1,
    }),
  },
  {
    optional: [
      "value",
      "value_type",
      "target_date",
      "current_state",
      "company_id",
      "user_id",
      "group_id",
      "background",
      "deal_type_id",
      "deal_type_stage_id",
      "probability",
      "currency",
      "person_ids_set",
    ],
  },
);

const getByIdInputSchema = s.object(
  "The input payload for reading one CentralStationCRM record.",
  {
    id: idSchema,
    includes: includesSchema,
    methods: methodsSchema,
  },
  { optional: ["includes", "methods"] },
);

const deleteByIdInputSchema = s.object(
  "The input payload for deleting one CentralStationCRM record.",
  {
    id: idSchema,
    no_log: noLogSchema,
  },
  { optional: ["no_log"] },
);

const deleteOutputSchema = s.object("The output payload for deleting one CentralStationCRM record.", {
  deleted: s.boolean("Whether the record was deleted."),
  id: idSchema,
  raw: rawObjectSchema,
});

const getUserAction = defineAction({
  service,
  name: "get_user",
  description: "Get the current CentralStationCRM API user.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting the current user.", {}),
  outputSchema: s.object("The output payload containing the current CentralStationCRM user.", {
    user: userSchema,
    raw: rawObjectSchema,
  }),
});

const listPeopleAction = defineAction({
  service,
  name: "list_people",
  description: "List people in CentralStationCRM with optional paging and tag filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing CentralStationCRM people.",
    {
      ...paginationInputSchema,
      ...tagFilterInputSchema,
    },
    { optional: ["page", "perpage", "order", "includes", "methods", "tag_id", "tag_name"] },
  ),
  outputSchema: s.object("The output payload containing CentralStationCRM people.", {
    people: s.array("The people returned by CentralStationCRM.", personSchema),
    page: s.nullable(pageSchema),
    perpage: s.nullable(perpageSchema),
    raw: rawArraySchema,
  }),
});

const searchPeopleAction = defineAction({
  service,
  name: "search_people",
  description: "Search CentralStationCRM people by documented search fields.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for searching CentralStationCRM people.",
    {
      page: pageSchema,
      perpage: perpageSchema,
      name: s.string("The person name search term.", { minLength: 1 }),
      first_name: s.string("The first name search term.", { minLength: 1 }),
      email: s.string("The email search term.", { minLength: 1 }),
      phone: s.string("The phone search term.", { minLength: 1 }),
      includes: includesSchema,
      methods: methodsSchema,
    },
    {
      optional: ["page", "perpage", "name", "first_name", "email", "phone", "includes", "methods"],
    },
  ),
  outputSchema: s.object("The output payload containing matching CentralStationCRM people.", {
    people: s.array("The matching people returned by CentralStationCRM.", personSchema),
    page: s.nullable(pageSchema),
    perpage: s.nullable(perpageSchema),
    raw: rawArraySchema,
  }),
});

const getPersonAction = defineAction({
  service,
  name: "get_person",
  description: "Get one CentralStationCRM person by identifier.",
  requiredScopes: [],
  inputSchema: getByIdInputSchema,
  outputSchema: s.object("The output payload containing one CentralStationCRM person.", {
    person: personSchema,
    raw: rawObjectSchema,
  }),
});

const createPersonAction = defineAction({
  service,
  name: "create_person",
  description: "Create a person in CentralStationCRM.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a CentralStationCRM person.",
    {
      person: personPayloadSchema,
      includes: includesSchema,
      methods: methodsSchema,
      no_log: noLogSchema,
    },
    { optional: ["includes", "methods", "no_log"] },
  ),
  outputSchema: s.object("The output payload containing the created CentralStationCRM person.", {
    person: personSchema,
    raw: rawObjectSchema,
  }),
});

const updatePersonAction = defineAction({
  service,
  name: "update_person",
  description: "Update a person in CentralStationCRM.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for updating a CentralStationCRM person.",
    {
      id: idSchema,
      person: personPayloadSchema,
      no_log: noLogSchema,
    },
    { optional: ["no_log"] },
  ),
  outputSchema: s.object("The output payload containing the updated CentralStationCRM person.", {
    person: personSchema,
    raw: rawObjectSchema,
  }),
});

const deletePersonAction = defineAction({
  service,
  name: "delete_person",
  description: "Delete a person from CentralStationCRM.",
  requiredScopes: [],
  inputSchema: deleteByIdInputSchema,
  outputSchema: deleteOutputSchema,
});

const listCompaniesAction = defineAction({
  service,
  name: "list_companies",
  description: "List companies in CentralStationCRM with optional paging and tag filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing CentralStationCRM companies.",
    {
      ...paginationInputSchema,
      ...tagFilterInputSchema,
    },
    { optional: ["page", "perpage", "order", "includes", "methods", "tag_id", "tag_name"] },
  ),
  outputSchema: s.object("The output payload containing CentralStationCRM companies.", {
    companies: s.array("The companies returned by CentralStationCRM.", companySchema),
    page: s.nullable(pageSchema),
    perpage: s.nullable(perpageSchema),
    raw: rawArraySchema,
  }),
});

const searchCompaniesAction = defineAction({
  service,
  name: "search_companies",
  description: "Search CentralStationCRM companies by documented search fields.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for searching CentralStationCRM companies.",
    {
      page: pageSchema,
      perpage: perpageSchema,
      name: s.string("The company name search term.", { minLength: 1 }),
      includes: includesSchema,
      methods: methodsSchema,
    },
    { optional: ["page", "perpage", "name", "includes", "methods"] },
  ),
  outputSchema: s.object("The output payload containing matching CentralStationCRM companies.", {
    companies: s.array("The matching companies returned by CentralStationCRM.", companySchema),
    page: s.nullable(pageSchema),
    perpage: s.nullable(perpageSchema),
    raw: rawArraySchema,
  }),
});

const getCompanyAction = defineAction({
  service,
  name: "get_company",
  description: "Get one CentralStationCRM company by identifier.",
  requiredScopes: [],
  inputSchema: getByIdInputSchema,
  outputSchema: s.object("The output payload containing one CentralStationCRM company.", {
    company: companySchema,
    raw: rawObjectSchema,
  }),
});

const createCompanyAction = defineAction({
  service,
  name: "create_company",
  description: "Create a company in CentralStationCRM.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a CentralStationCRM company.",
    {
      company: companyPayloadSchema,
      includes: includesSchema,
      methods: methodsSchema,
      no_log: noLogSchema,
    },
    { optional: ["includes", "methods", "no_log"] },
  ),
  outputSchema: s.object("The output payload containing the created CentralStationCRM company.", {
    company: companySchema,
    raw: rawObjectSchema,
  }),
});

const updateCompanyAction = defineAction({
  service,
  name: "update_company",
  description: "Update a company in CentralStationCRM.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for updating a CentralStationCRM company.",
    {
      id: idSchema,
      company: companyPayloadSchema,
      no_log: noLogSchema,
    },
    { optional: ["no_log"] },
  ),
  outputSchema: s.object("The output payload containing the updated CentralStationCRM company.", {
    company: companySchema,
    raw: rawObjectSchema,
  }),
});

const deleteCompanyAction = defineAction({
  service,
  name: "delete_company",
  description: "Delete a company from CentralStationCRM.",
  requiredScopes: [],
  inputSchema: deleteByIdInputSchema,
  outputSchema: deleteOutputSchema,
});

const listDealsAction = defineAction({
  service,
  name: "list_deals",
  description: "List deals in CentralStationCRM with optional paging and tag filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing CentralStationCRM deals.",
    {
      ...paginationInputSchema,
      ...tagFilterInputSchema,
    },
    { optional: ["page", "perpage", "order", "includes", "methods", "tag_id", "tag_name"] },
  ),
  outputSchema: s.object("The output payload containing CentralStationCRM deals.", {
    deals: s.array("The deals returned by CentralStationCRM.", dealSchema),
    page: s.nullable(pageSchema),
    perpage: s.nullable(perpageSchema),
    raw: rawArraySchema,
  }),
});

const searchDealsAction = defineAction({
  service,
  name: "search_deals",
  description: "Search CentralStationCRM deals by documented search fields.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for searching CentralStationCRM deals.",
    {
      page: pageSchema,
      perpage: perpageSchema,
      name: s.string("The deal name search term.", { minLength: 1 }),
      includes: includesSchema,
      methods: methodsSchema,
    },
    { optional: ["page", "perpage", "name", "includes", "methods"] },
  ),
  outputSchema: s.object("The output payload containing matching CentralStationCRM deals.", {
    deals: s.array("The matching deals returned by CentralStationCRM.", dealSchema),
    page: s.nullable(pageSchema),
    perpage: s.nullable(perpageSchema),
    raw: rawArraySchema,
  }),
});

const getDealAction = defineAction({
  service,
  name: "get_deal",
  description: "Get one CentralStationCRM deal by identifier.",
  requiredScopes: [],
  inputSchema: getByIdInputSchema,
  outputSchema: s.object("The output payload containing one CentralStationCRM deal.", {
    deal: dealSchema,
    raw: rawObjectSchema,
  }),
});

const createDealAction = defineAction({
  service,
  name: "create_deal",
  description: "Create a deal in CentralStationCRM.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a CentralStationCRM deal.",
    {
      deal: dealPayloadSchema,
      includes: includesSchema,
      methods: methodsSchema,
      no_log: noLogSchema,
    },
    { optional: ["includes", "methods", "no_log"] },
  ),
  outputSchema: s.object("The output payload containing the created CentralStationCRM deal.", {
    deal: dealSchema,
    raw: rawObjectSchema,
  }),
});

const updateDealAction = defineAction({
  service,
  name: "update_deal",
  description: "Update a deal in CentralStationCRM.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for updating a CentralStationCRM deal.",
    {
      id: idSchema,
      deal: dealPayloadSchema,
      no_log: noLogSchema,
    },
    { optional: ["no_log"] },
  ),
  outputSchema: s.object("The output payload containing the updated CentralStationCRM deal.", {
    deal: dealSchema,
    raw: rawObjectSchema,
  }),
});

const deleteDealAction = defineAction({
  service,
  name: "delete_deal",
  description: "Delete a deal from CentralStationCRM.",
  requiredScopes: [],
  inputSchema: deleteByIdInputSchema,
  outputSchema: deleteOutputSchema,
});

export const centralStationCrmActions: ProviderActionDefinition[] = [
  getUserAction,
  listPeopleAction,
  searchPeopleAction,
  getPersonAction,
  createPersonAction,
  updatePersonAction,
  deletePersonAction,
  listCompaniesAction,
  searchCompaniesAction,
  getCompanyAction,
  createCompanyAction,
  updateCompanyAction,
  deleteCompanyAction,
  listDealsAction,
  searchDealsAction,
  getDealAction,
  createDealAction,
  updateDealAction,
  deleteDealAction,
];
