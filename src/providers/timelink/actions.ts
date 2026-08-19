import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "timelink" as const;

const ulidSchema = s.string("A Timelink ULID identifier.", {
  minLength: 1,
  pattern: "\\S",
});

const tokenSchema = s.object("A Timelink API token record.", {
  id: s.integer("The numeric token identifier returned by Timelink."),
  name: s.string("The token name configured in Timelink."),
  abilities: s.array("The token abilities granted by Timelink.", s.string("One Timelink token ability.")),
  lastUsedAt: s.nullable(s.dateTime("When the token was last used.")),
  expiresAt: s.nullable(s.dateTime("When the token expires.")),
  createdAt: s.dateTime("When the token was created."),
  updatedAt: s.dateTime("When the token was last updated."),
});

const paginationLinkSchema = s.object("A pagination link returned by Timelink.", {
  url: s.nullable(s.string("The page URL.")),
  label: s.string("The human-readable page label."),
  active: s.boolean("Whether this pagination link is active."),
});

const paginationSchema = s.object("Pagination metadata returned by Timelink list endpoints.", {
  currentPage: s.integer("The current page number."),
  from: s.integer("The first item index on the current page."),
  lastPage: s.integer("The last available page number."),
  links: s.array("The pagination links returned by Timelink.", paginationLinkSchema),
  path: s.string("The Timelink API path for this paginated response."),
  perPage: s.integer("The number of items returned per page."),
  to: s.integer("The last item index on the current page."),
  total: s.integer("The total number of items across all pages."),
});

const listOrderSchema = s.object("A Timelink list sorting rule.", {
  column: s.string("The Timelink field name used for sorting.", {
    minLength: 1,
    pattern: "\\S",
  }),
  direction: s.stringEnum("The sort direction.", ["asc", "desc"]),
});

const baseListInputProperties = {
  limit: s.integer("The maximum number of records to return.", { minimum: 1 }),
  search: s.string("A search string matched by Timelink.", {
    minLength: 1,
    pattern: "\\S",
  }),
  ids: s.array("A list of Timelink record IDs to fetch.", ulidSchema, { minItems: 1 }),
  orders: s.array("The Timelink sort rules to apply.", listOrderSchema, { minItems: 1 }),
} as const;

const clientSchema = s.object("A Timelink client record.", {
  id: ulidSchema,
  name: s.string("The client name."),
  companyId: s.nullable(s.integer("The numeric company identifier linked to the client.")),
  extToolId: s.nullable(s.integer("The external tool identifier linked to the client.")),
  info: s.nullable(s.string("The free-form client information text.")),
  color: s.nullable(s.string("The client color value.")),
  active: s.boolean("Whether the client is active."),
  billable: s.boolean("Whether the client is billable by default."),
  acronym: s.nullable(s.string("The client acronym.")),
  imageId: s.nullable(s.string("The image identifier for this client.")),
  demoFlag: s.boolean("Whether the client is a demo record."),
  projectCount: s.nullable(s.integer("The number of projects returned for the client when present.")),
  activeProjectCount: s.nullable(s.integer("The number of active projects returned for the client when present.")),
  raw: s.looseObject("The raw Timelink client object."),
});

const projectSchema = s.object("A Timelink project record.", {
  id: ulidSchema,
  name: s.string("The project name."),
  clientId: s.nullable(s.integer("The numeric client identifier linked to the project.")),
  extToolId: s.nullable(s.integer("The external tool identifier linked to the project.")),
  info: s.nullable(s.string("The free-form project information text.")),
  color: s.nullable(s.string("The project color value.")),
  active: s.boolean("Whether the project is active."),
  billable: s.boolean("Whether the project is billable by default."),
  acronym: s.nullable(s.string("The project acronym.")),
  imageId: s.nullable(s.string("The image identifier for this project.")),
  demoFlag: s.boolean("Whether the project is a demo record."),
  raw: s.looseObject("The raw Timelink project object."),
});

const serviceSchema = s.object("A Timelink service record.", {
  id: ulidSchema,
  name: s.string("The service name."),
  companyId: s.nullable(s.integer("The numeric company identifier linked to the service.")),
  extToolId: s.nullable(s.integer("The external tool identifier linked to the service.")),
  info: s.nullable(s.string("The free-form service information text.")),
  color: s.nullable(s.string("The service color value.")),
  active: s.boolean("Whether the service is active."),
  billable: s.boolean("Whether the service is billable by default."),
  acronym: s.nullable(s.string("The service acronym.")),
  imageId: s.nullable(s.string("The image identifier for this service.")),
  defaultTimeEntryDescription: s.nullable(s.string("The default time entry description configured for the service.")),
  raw: s.looseObject("The raw Timelink service object."),
});

const timeEntrySchema = s.object("A Timelink time entry record.", {
  id: ulidSchema,
  userId: s.nullable(s.string("The user identifier linked to the time entry.")),
  clientId: s.nullable(s.string("The client identifier linked to the time entry.")),
  projectId: s.nullable(s.string("The project identifier linked to the time entry.")),
  serviceId: s.nullable(s.string("The service identifier linked to the time entry.")),
  description: s.nullable(s.string("The time entry description.")),
  billable: s.boolean("Whether the time entry is billable."),
  billed: s.boolean("Whether the time entry has been billed."),
  billedAt: s.nullable(s.dateTime("When the time entry was billed.")),
  isInterrupt: s.boolean("Whether the time entry is marked as an interruption."),
  startedAt: s.dateTime("When the time entry started."),
  endedAt: s.nullable(s.dateTime("When the time entry ended.")),
  createdAt: s.dateTime("When the time entry was created."),
  updatedAt: s.dateTime("When the time entry was last updated."),
  deletedAt: s.nullable(s.dateTime("When the time entry was deleted.")),
  extToolId: s.nullable(s.string("The external tool identifier linked to the time entry.")),
  tempId: s.nullable(s.string("The temporary identifier used by Timelink clients.")),
  pushState: s.nullable(s.integer("The Timelink push state value.")),
  pushErrors: s.array("The Timelink push errors.", s.string("One Timelink push error message.")),
  raw: s.looseObject("The raw Timelink time entry object."),
});

const lastUsedSchema = s.object("The recent Timelink entities referenced by the user.", {
  clients: s.array("The last used client identifiers.", s.string("One client identifier.")),
  projects: s.array("The last used project identifiers.", s.string("One project identifier.")),
  services: s.array("The last used service identifiers.", s.string("One service identifier.")),
});

const userSchema = s.object("A Timelink user record.", {
  id: s.string("The user identifier."),
  firstName: s.string("The user's first name."),
  lastName: s.string("The user's last name."),
  fullName: s.string("The user's full name."),
  email: s.string("The user's email address."),
  companyId: s.string("The company identifier linked to the user."),
  emailVerifiedAt: s.nullable(s.dateTime("When the user's email was verified.")),
  active: s.boolean("Whether the user is active."),
  timezone: s.string("The user's configured timezone."),
  language: s.string("The user's configured language."),
  lastUsed: lastUsedSchema,
  settings: s.nullable(s.looseObject("The raw Timelink user settings object.")),
  raw: s.looseObject("The raw Timelink user object."),
});

const companySubscriptionSchema = s.object("The Timelink subscription details for the company.", {
  status: s.stringEnum("The subscription status.", ["active", "canceled"]),
  product: s.stringEnum("The subscription product.", ["basic", "trial"]),
  quantity: s.integer("The number of seats in the subscription."),
  trial: s.boolean("Whether the subscription is currently a trial."),
  trialEndsAt: s.nullable(s.dateTime("When the trial ends.")),
  endsAt: s.nullable(s.dateTime("When the subscription ends.")),
  raw: s.looseObject("The raw Timelink subscription object."),
});

const companySchema = s.object("A Timelink company record.", {
  id: s.string("The company identifier."),
  name: s.string("The company name."),
  address: s.string("The company address."),
  city: s.string("The company city."),
  zip: s.string("The company ZIP or postal code."),
  country: s.string("The company country."),
  phone: s.string("The company phone number."),
  email: s.string("The company admin email."),
  invoiceEmail: s.string("The company invoice email."),
  forceOauth: s.nullable(s.boolean("Whether Timelink forces OAuth for the company.")),
  oauthProvider: s.nullable(s.string("The OAuth provider configured for the company.")),
  autoupdateQuantity: s.nullable(s.boolean("Whether Timelink auto-updates the subscription quantity.")),
  subscription: s.nullable(companySubscriptionSchema),
  pullProvider: s.nullable(s.string("The active Timelink pull provider.")),
  pushProvider: s.nullable(s.string("The active Timelink push provider.")),
  settings: s.nullable(s.looseObject("The raw Timelink company settings object.")),
  raw: s.looseObject("The raw Timelink company object."),
});

const listClientsInputSchema = s.object(
  "The input payload for listing Timelink clients.",
  {
    ...baseListInputProperties,
    active: s.boolean("Filter clients by active state."),
    withLimitedPartOfProjects: s.boolean("Whether Timelink should include a limited subset of each client's projects."),
    projectsLimit: s.integer("The number of nested projects to include per client.", {
      minimum: 1,
    }),
  },
  {
    optional: ["limit", "search", "ids", "orders", "active", "withLimitedPartOfProjects", "projectsLimit"],
  },
);

const getByIdInputSchema = s.object("The input payload for fetching a record by ID.", {
  id: ulidSchema,
});

const listProjectsInputSchema = s.object(
  "The input payload for listing Timelink projects.",
  {
    ...baseListInputProperties,
    active: s.boolean("Filter projects by active state."),
    clientId: s.string("Filter projects by the linked client identifier.", {
      minLength: 1,
      pattern: "\\S",
    }),
  },
  { optional: ["limit", "search", "ids", "orders", "active", "clientId"] },
);

const listServicesInputSchema = s.object(
  "The input payload for listing Timelink services.",
  {
    ...baseListInputProperties,
    active: s.boolean("Filter services by active state."),
  },
  { optional: ["limit", "search", "ids", "orders", "active"] },
);

const listUsersInputSchema = s.object(
  "The input payload for listing Timelink users.",
  {
    ...baseListInputProperties,
    active: s.boolean("Filter users by active state."),
  },
  { optional: ["limit", "search", "ids", "orders", "active"] },
);

const listTimeEntriesInputSchema = s.object(
  "The input payload for listing Timelink time entries.",
  {
    ...baseListInputProperties,
    withRelations: s.boolean("Whether Timelink should include related entities."),
    start: s.dateTime("Filter time entries starting from this timestamp."),
    end: s.dateTime("Filter time entries ending before this timestamp."),
    onlyDeleted: s.boolean("Whether to return only deleted time entries."),
    isInterrupt: s.boolean("Filter time entries by interruption state."),
    isBilled: s.boolean("Filter time entries by billed state."),
    isBillable: s.boolean("Filter time entries by billable state."),
    searchInDescription: s.string("The Timelink description search mode or term passed through to the API.", {
      minLength: 1,
      pattern: "\\S",
    }),
    clientId: s.string("Filter time entries by client identifier.", {
      minLength: 1,
      pattern: "\\S",
    }),
    projectId: s.string("Filter time entries by project identifier.", {
      minLength: 1,
      pattern: "\\S",
    }),
    serviceId: s.string("Filter time entries by service identifier.", {
      minLength: 1,
      pattern: "\\S",
    }),
    userId: s.string("Filter time entries by user identifier.", {
      minLength: 1,
      pattern: "\\S",
    }),
    userIds: s.array(
      "Filter time entries by multiple user identifiers.",
      s.string("One user identifier.", { minLength: 1, pattern: "\\S" }),
      { minItems: 1 },
    ),
    extToolId: s.string("Filter time entries by external tool identifier.", {
      minLength: 1,
      pattern: "\\S",
    }),
    exact: s.boolean("Whether the Timelink search should be exact."),
  },
  {
    optional: [
      "limit",
      "search",
      "ids",
      "orders",
      "withRelations",
      "start",
      "end",
      "onlyDeleted",
      "isInterrupt",
      "isBilled",
      "isBillable",
      "searchInDescription",
      "clientId",
      "projectId",
      "serviceId",
      "userId",
      "userIds",
      "extToolId",
      "exact",
    ],
  },
);

const listActiveTimeEntriesInputSchema = s.object(
  "The input payload for listing active Timelink time entries.",
  {
    limit: s.integer("The maximum number of active time entries to return.", { minimum: 1 }),
    withRelations: s.boolean("Whether Timelink should include related entities."),
  },
  { optional: ["limit", "withRelations"] },
);

const emptyInputSchema = s.object("The input payload for this Timelink action.", {});

export const timelinkActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_clients",
    description: "List Timelink clients with optional filtering and pagination parameters.",
    requiredScopes: [],
    inputSchema: listClientsInputSchema,
    outputSchema: s.object("The response returned when listing Timelink clients.", {
      clients: s.array("The Timelink clients returned by the API.", clientSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_client",
    description: "Fetch one Timelink client by its identifier.",
    requiredScopes: [],
    inputSchema: getByIdInputSchema,
    outputSchema: s.object("The response returned when fetching a Timelink client.", {
      client: clientSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Timelink projects with optional filtering and pagination parameters.",
    requiredScopes: [],
    inputSchema: listProjectsInputSchema,
    outputSchema: s.object("The response returned when listing Timelink projects.", {
      projects: s.array("The Timelink projects returned by the API.", projectSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Fetch one Timelink project by its identifier.",
    requiredScopes: [],
    inputSchema: getByIdInputSchema,
    outputSchema: s.object("The response returned when fetching a Timelink project.", {
      project: projectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_services",
    description: "List Timelink services with optional filtering and pagination parameters.",
    requiredScopes: [],
    inputSchema: listServicesInputSchema,
    outputSchema: s.object("The response returned when listing Timelink services.", {
      services: s.array("The Timelink services returned by the API.", serviceSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_service",
    description: "Fetch one Timelink service by its identifier.",
    requiredScopes: [],
    inputSchema: getByIdInputSchema,
    outputSchema: s.object("The response returned when fetching a Timelink service.", {
      service: serviceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_time_entries",
    description: "List Timelink time entries with optional filtering and pagination parameters.",
    requiredScopes: [],
    inputSchema: listTimeEntriesInputSchema,
    outputSchema: s.object("The response returned when listing Timelink time entries.", {
      timeEntries: s.array("The Timelink time entries returned by the API.", timeEntrySchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_time_entry",
    description: "Fetch one Timelink time entry by its identifier.",
    requiredScopes: [],
    inputSchema: getByIdInputSchema,
    outputSchema: s.object("The response returned when fetching a Timelink time entry.", {
      timeEntry: timeEntrySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_active_time_entries",
    description: "List currently active Timelink time entries.",
    requiredScopes: [],
    inputSchema: listActiveTimeEntriesInputSchema,
    outputSchema: s.object("The response returned when listing active Timelink time entries.", {
      timeEntries: s.array("The active Timelink time entries.", timeEntrySchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_time_entry_required_fields",
    description: "List the Timelink field names that are required for time entries.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The response returned when listing required time entry fields.", {
      fields: s.array("The required Timelink field names.", s.string("One required field name.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Timelink users with optional filtering and pagination parameters.",
    requiredScopes: [],
    inputSchema: listUsersInputSchema,
    outputSchema: s.object("The response returned when listing Timelink users.", {
      users: s.array("The Timelink users returned by the API.", userSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Fetch one Timelink user by its identifier.",
    requiredScopes: [],
    inputSchema: getByIdInputSchema,
    outputSchema: s.object("The response returned when fetching a Timelink user.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_company",
    description: "Fetch the current Timelink company details for the authenticated token.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The response returned when fetching Timelink company details.", {
      company: companySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_current_token",
    description: "Inspect the current Timelink API token metadata.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The response returned when fetching Timelink token details.", {
      token: tokenSchema,
    }),
  }),
];
