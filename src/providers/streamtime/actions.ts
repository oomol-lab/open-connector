import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "streamtime";

const positiveIntegerSchema = (description: string) => s.integer(description, { minimum: 1 });
const trimmedStringSchema = (description: string) => s.nonEmptyString(description);
const emptyInputSchema = s.object("No additional input is required for this action.", {});

const companyIdInputSchema = s.object("The company identifier used for this request.", {
  companyId: positiveIntegerSchema("The Streamtime company ID."),
});
const contactIdInputSchema = s.object("The contact identifier used for this request.", {
  contactId: positiveIntegerSchema("The Streamtime contact ID."),
});
const jobIdInputSchema = s.object("The job identifier used for this request.", {
  jobId: positiveIntegerSchema("The Streamtime job ID."),
});

const companyWriteFields = {
  name: trimmedStringSchema("The company name."),
  taxNumber: trimmedStringSchema("The tax, GST, or VAT number for the company."),
  phone1: trimmedStringSchema("The primary phone number for the company."),
  phone2: trimmedStringSchema("The secondary phone number for the company."),
  websiteAddress: trimmedStringSchema("The public website URL for the company."),
};

const createCompanyInputSchema = s.object("The input payload for creating a Streamtime company.", companyWriteFields, {
  optional: ["taxNumber", "phone1", "phone2", "websiteAddress"],
});

const updateCompanyInputSchema = s.object(
  "The input payload for updating a Streamtime company.",
  {
    companyId: positiveIntegerSchema("The Streamtime company ID."),
    ...companyWriteFields,
  },
  { optional: ["name", "taxNumber", "phone1", "phone2", "websiteAddress"] },
);

const contactWriteFields = {
  firstName: trimmedStringSchema("The contact first name."),
  lastName: trimmedStringSchema("The contact last name."),
  email: s.email("The contact email address."),
  phoneNumber: trimmedStringSchema("The contact phone number."),
  position: trimmedStringSchema("The contact job title or position."),
};

const createCompanyContactInputSchema = s.object(
  "The input payload for creating a contact under a Streamtime company.",
  {
    companyId: positiveIntegerSchema("The Streamtime company ID."),
    ...contactWriteFields,
  },
  { optional: ["lastName", "email", "phoneNumber", "position"] },
);

const updateContactInputSchema = s.object(
  "The input payload for updating a Streamtime contact.",
  {
    contactId: positiveIntegerSchema("The Streamtime contact ID."),
    ...contactWriteFields,
  },
  { optional: ["firstName", "lastName", "email", "phoneNumber", "position"] },
);

const jobWriteFields = {
  companyId: positiveIntegerSchema("The Streamtime company ID that owns the job."),
  jobLeadUserId: positiveIntegerSchema("The Streamtime user ID to assign as the job lead."),
  rateCardId: positiveIntegerSchema("The Streamtime rate card ID to apply to the job."),
  branchId: positiveIntegerSchema("The Streamtime branch ID for the job."),
  name: trimmedStringSchema("The job name."),
  number: trimmedStringSchema("The job number."),
  contactId: positiveIntegerSchema("The Streamtime contact ID the job is being done for."),
  purchaseOrderNumber: trimmedStringSchema("The client purchase order number."),
};

const createJobInputSchema = s.object("The input payload for creating a Streamtime job.", jobWriteFields, {
  optional: ["jobLeadUserId", "branchId", "number", "contactId", "purchaseOrderNumber"],
});

const updateJobInputSchema = s.object(
  "The input payload for updating a Streamtime job.",
  {
    jobId: positiveIntegerSchema("The Streamtime job ID."),
    ...jobWriteFields,
  },
  {
    optional: [
      "companyId",
      "jobLeadUserId",
      "rateCardId",
      "branchId",
      "name",
      "number",
      "contactId",
      "purchaseOrderNumber",
    ],
  },
);

const organisationSchema = s.looseObject("The Streamtime organisation object returned by the API.");
const branchSchema = s.looseObject("One Streamtime branch object returned by the API.");
const rateCardSchema = s.looseObject("One Streamtime rate card object returned by the API.");
const userSchema = s.looseObject("One Streamtime user object returned by the API.");
const companySchema = s.looseObject("One Streamtime company object returned by the API.");
const contactSchema = s.looseObject("One Streamtime contact object returned by the API.");
const jobSchema = s.looseObject("One Streamtime job object returned by the API.");

const companyOutputSchema = s.object("The Streamtime company response wrapper.", {
  company: companySchema,
});
const contactOutputSchema = s.object("The Streamtime contact response wrapper.", {
  contact: contactSchema,
});
const jobOutputSchema = s.object("The Streamtime job response wrapper.", {
  job: jobSchema,
});

export const streamtimeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_organisation",
    operationType: "read",
    description: "Get the authenticated Streamtime organisation details.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The Streamtime organisation response wrapper.", { organisation: organisationSchema }),
  }),
  defineProviderAction(service, {
    name: "list_branches",
    operationType: "read",
    description: "List the Streamtime branches available to the authenticated organisation.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The Streamtime branch list response wrapper.", {
      branches: s.array("The Streamtime branches returned by the API.", branchSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_rate_cards",
    operationType: "read",
    description: "List the Streamtime rate cards available to the authenticated organisation.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The Streamtime rate card list response wrapper.", {
      rateCards: s.array("The Streamtime rate cards returned by the API.", rateCardSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List the Streamtime users available to the authenticated organisation.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The Streamtime user list response wrapper.", {
      users: s.array("The Streamtime users returned by the API.", userSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_company",
    operationType: "write",
    description: "Create a company in Streamtime for the authenticated organisation.",
    inputSchema: createCompanyInputSchema,
    outputSchema: companyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_company",
    operationType: "read",
    description: "Get a Streamtime company by ID.",
    inputSchema: companyIdInputSchema,
    outputSchema: companyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_company",
    operationType: "write",
    description: "Update a Streamtime company by ID.",
    inputSchema: updateCompanyInputSchema,
    outputSchema: companyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_company_contacts",
    operationType: "read",
    description: "List the contacts that belong to a Streamtime company.",
    inputSchema: companyIdInputSchema,
    outputSchema: s.object("The Streamtime contact list response wrapper.", {
      contacts: s.array("The Streamtime contacts returned by the API.", contactSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_company_contact",
    operationType: "write",
    description: "Create a contact under a Streamtime company.",
    inputSchema: createCompanyContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Get a Streamtime contact by ID.",
    inputSchema: contactIdInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    operationType: "write",
    description: "Update a Streamtime contact by ID.",
    inputSchema: updateContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_job",
    operationType: "write",
    description: "Create a Streamtime job linked to a company, rate card, and optional contact.",
    inputSchema: createJobInputSchema,
    outputSchema: jobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_job",
    operationType: "read",
    description: "Get a Streamtime job by ID.",
    inputSchema: jobIdInputSchema,
    outputSchema: jobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_job",
    operationType: "write",
    description: "Update a Streamtime job by ID.",
    inputSchema: updateJobInputSchema,
    outputSchema: jobOutputSchema,
  }),
];
