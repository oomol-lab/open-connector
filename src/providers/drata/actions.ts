import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "drata" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });

const cursorSchema = nonEmptyString("The Drata cursor returned in pagination.cursor by a previous list response.");
const pageSizeSchema = s.integer("The number of results to return.", {
  minimum: 1,
  maximum: 500,
});
const includeTotalCountSchema = s.boolean("Whether Drata should include totalCount on the first page of results.");
const sortSchema = nonEmptyString("The Drata field name to sort by.");
const sortDirectionSchema = s.stringEnum("The direction to sort returned data.", ["asc", "desc"]);
const expandSchema = s.array(
  "Related Drata subcollections and sub-objects to expand.",
  nonEmptyString("One Drata expand value."),
);
const paginationSchema = s.looseRequiredObject(
  "Drata cursor pagination metadata.",
  {
    cursor: s.nullable(s.string("The cursor to pass to the next list request, when present.")),
    totalCount: s.nullable(s.integer("The total count returned when includeTotalCount is used.")),
  },
  { optional: ["cursor", "totalCount"] },
);
const rawObjectSchema = s.looseObject("The raw Drata object returned by the API.");
const listRawSchema = s.looseObject("The raw Drata list response returned by the API.");

const listInputProperties = {
  cursor: cursorSchema,
  size: pageSizeSchema,
  sort: sortSchema,
  sortDir: sortDirectionSchema,
  includeTotalCount: includeTotalCountSchema,
  expand: expandSchema,
};

const listInputOptional = ["cursor", "size", "sort", "sortDir", "includeTotalCount", "expand"] as const;

const listOutputProperties = {
  data: s.array("The Drata records returned for the current page.", rawObjectSchema),
  pagination: paginationSchema,
  raw: listRawSchema,
};

const companySchema = s.looseRequiredObject(
  "The Drata company metadata for the connected account.",
  {
    accountId: s.string("The Drata account ID for the company."),
    domain: s.string("The company's domain."),
    name: s.string("The company's common name."),
    legalName: s.nullable(s.string("The company's full legal name.")),
    description: s.nullable(s.string("The company description.")),
    logoUrl: s.nullable(s.string("The company avatar URL.")),
    createdAt: s.string("The account creation timestamp."),
    updatedAt: s.string("The account update timestamp."),
  },
  {
    optional: ["accountId", "domain", "name", "legalName", "description", "logoUrl", "createdAt", "updatedAt"],
  },
);

const getCompanyAction = defineProviderAction(service, {
  name: "get_company",
  description: "Get company metadata for the connected Drata account.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting Drata company metadata.", {}),
  outputSchema: s.object("The response returned when getting Drata company metadata.", {
    company: companySchema,
    raw: rawObjectSchema,
  }),
});

const listWorkspacesAction = defineProviderAction(service, {
  name: "list_workspaces",
  description: "List Drata workspaces visible to the current API key.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing Drata workspaces.", listInputProperties, {
    optional: listInputOptional,
  }),
  outputSchema: s.object("The response returned when listing Drata workspaces.", {
    ...listOutputProperties,
  }),
});

const listPersonnelAction = defineProviderAction(service, {
  name: "list_personnel",
  description: "List Drata personnel visible to the current API key.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Drata personnel.",
    {
      ...listInputProperties,
      employmentStatus: s.array(
        "Employment statuses to filter personnel by.",
        nonEmptyString("One Drata employment status."),
      ),
      complianceStatus: s.array(
        "Overall compliance statuses to filter personnel by.",
        nonEmptyString("One Drata compliance status."),
      ),
    },
    {
      optional: [...listInputOptional, "employmentStatus", "complianceStatus"],
    },
  ),
  outputSchema: s.object("The response returned when listing Drata personnel.", {
    ...listOutputProperties,
  }),
});

const getPersonnelAction = defineProviderAction(service, {
  name: "get_personnel",
  description: "Get one Drata personnel record by ID or email-prefixed identifier.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting Drata personnel.",
    {
      personnelId: s.anyOf("The personnel ID or an email-prefixed identifier.", [
        s.integer("The integer Drata personnel ID."),
        nonEmptyString("An email-prefixed identifier such as email:user@example.com."),
      ]),
      expand: expandSchema,
    },
    { optional: ["expand"] },
  ),
  outputSchema: s.object("The response returned when getting Drata personnel.", {
    personnel: rawObjectSchema,
    raw: rawObjectSchema,
  }),
});

const workspaceIdSchema = s.integer("The Drata workspace ID.");

const listControlsAction = defineProviderAction(service, {
  name: "list_controls",
  description: "List controls in a Drata workspace.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Drata controls.",
    {
      workspaceId: workspaceIdSchema,
      ...listInputProperties,
      isMonitored: s.boolean("Whether to filter controls by monitor presence."),
      isReady: s.boolean("Whether to filter controls by readiness."),
      hasEvidence: s.boolean("Whether to filter controls by evidence presence."),
      hasPolicy: s.boolean("Whether to filter controls by policy presence."),
      hasPassingTest: s.boolean("Whether to filter controls with at least one passing test."),
      ticketStatus: nonEmptyString("The task management ticket status to filter controls by."),
      policyId: s.integer("The policy ID to filter controls by."),
      isEnabled: s.boolean("Whether to filter controls by enabled status."),
      isArchived: s.boolean("Whether to filter controls by archived status."),
    },
    {
      optional: [
        ...listInputOptional,
        "isMonitored",
        "isReady",
        "hasEvidence",
        "hasPolicy",
        "hasPassingTest",
        "ticketStatus",
        "policyId",
        "isEnabled",
        "isArchived",
      ],
    },
  ),
  outputSchema: s.object("The response returned when listing Drata controls.", {
    ...listOutputProperties,
  }),
});

const getControlAction = defineProviderAction(service, {
  name: "get_control",
  description: "Get one Drata control by ID or code-prefixed identifier.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting a Drata control.",
    {
      workspaceId: workspaceIdSchema,
      controlId: s.anyOf("The control ID or a code-prefixed identifier.", [
        s.integer("The integer Drata control ID."),
        nonEmptyString("A control code prefixed with code:, such as code:DCF-37."),
      ]),
      cursor: cursorSchema,
      size: pageSizeSchema,
      sort: sortSchema,
      sortDir: sortDirectionSchema,
      expand: expandSchema,
    },
    { optional: ["cursor", "size", "sort", "sortDir", "expand"] },
  ),
  outputSchema: s.object("The response returned when getting a Drata control.", {
    control: rawObjectSchema,
    raw: rawObjectSchema,
  }),
});

const listVendorsAction = defineProviderAction(service, {
  name: "list_vendors",
  description: "List vendors in Drata.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Drata vendors.",
    {
      ...listInputProperties,
      category: nonEmptyString("The Drata vendor category to filter by."),
      impactLevel: nonEmptyString("The overall vendor impact level to filter by."),
      renewalDate: s.date("The vendor renewal date to filter by."),
      renewalScheduleType: nonEmptyString("The vendor renewal schedule type to filter by."),
      risk: nonEmptyString("The vendor risk level to filter by."),
      status: nonEmptyString("The vendor status to filter by."),
      type: nonEmptyString("The vendor type to filter by."),
    },
    {
      optional: [
        ...listInputOptional,
        "category",
        "impactLevel",
        "renewalDate",
        "renewalScheduleType",
        "risk",
        "status",
        "type",
      ],
    },
  ),
  outputSchema: s.object("The response returned when listing Drata vendors.", {
    ...listOutputProperties,
  }),
});

const getVendorAction = defineProviderAction(service, {
  name: "get_vendor",
  description: "Get one Drata vendor by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting a Drata vendor.",
    {
      vendorId: s.integer("The Drata vendor ID."),
      expand: expandSchema,
    },
    { optional: ["expand"] },
  ),
  outputSchema: s.object("The response returned when getting a Drata vendor.", {
    vendor: rawObjectSchema,
    raw: rawObjectSchema,
  }),
});

export const drataActions: ActionDefinition[] = [
  getCompanyAction,
  listWorkspacesAction,
  listPersonnelAction,
  getPersonnelAction,
  listControlsAction,
  getControlAction,
  listVendorsAction,
  getVendorAction,
];
