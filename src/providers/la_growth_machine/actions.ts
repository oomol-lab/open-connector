import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "la_growth_machine";

const rawObjectSchema = s.looseObject("A raw La Growth Machine object.");
const memberSchema = s.looseObject("A La Growth Machine member.", {
  id: s.string("The La Growth Machine member ID."),
  name: s.string("The member name."),
  label: s.string("The member display label."),
});
const audienceSchema = s.looseObject("A La Growth Machine audience.", {
  id: s.string("The La Growth Machine audience ID."),
  name: s.string("The audience name."),
  leadsCount: s.integer("The number of leads in the audience."),
});
const audienceIdSchema = s.string({
  description: "La Growth Machine audience MongoDB ObjectId.",
  minLength: 24,
  maxLength: 24,
  pattern: "^[0-9a-fA-F]{24}$",
});
const leadSchema = s.looseObject("A La Growth Machine lead.", {
  id: s.string("The La Growth Machine lead ID."),
  firstname: s.string("The lead first name."),
  lastname: s.string("The lead last name."),
  proEmail: s.string("The lead professional email address."),
  persoEmail: s.string("The lead personal email address."),
  companyName: s.string("The lead company name."),
  companyUrl: s.string("The lead company URL."),
  linkedinUrl: s.string("The lead LinkedIn profile URL."),
  status: s.string("The lead status in La Growth Machine."),
});

const paginationInputSchema = {
  skip: s.nonNegativeInteger("Number of records to skip before returning the page."),
  limit: s.positiveInteger("Maximum number of records to return.", { maximum: 100 }),
};

const searchLeadFields = {
  leadId: s.nonEmptyString("La Growth Machine lead ID to search for."),
  firstname: s.nonEmptyString("Lead first name to search for."),
  lastname: s.nonEmptyString("Lead last name to search for."),
  companyName: s.nonEmptyString("Lead company name to search for."),
  companyUrl: s.nonEmptyString("Lead company URL to search for."),
  linkedinUrl: s.nonEmptyString("Lead LinkedIn profile URL to search for."),
  linkedinId: s.nonEmptyString("Lead LinkedIn ID to search for."),
  linkedinPublicId: s.nonEmptyString("Lead public LinkedIn ID to search for."),
  email: s.nonEmptyString("Lead email address to search for."),
  location: s.nonEmptyString("Lead location to search for."),
  industry: s.nonEmptyString("Lead industry to search for."),
  crmId: s.nonEmptyString("External CRM ID to search for."),
};
const searchLeadFieldKeys = [
  "leadId",
  "firstname",
  "lastname",
  "companyName",
  "companyUrl",
  "linkedinUrl",
  "linkedinId",
  "linkedinPublicId",
  "email",
  "location",
  "industry",
  "crmId",
] as const satisfies readonly (keyof typeof searchLeadFields & string)[];

const leadMutationFields = {
  audience: s.nonEmptyString("Audience name where the lead should be created or updated."),
  leadId: leadProfileString("Existing La Growth Machine lead ID to update."),
  firstname: leadProfileString("Lead first name."),
  lastname: leadProfileString("Lead last name."),
  gender: s.stringEnum("Lead gender.", ["man", "woman"]),
  bio: s.string({ description: "Lead biography.", minLength: 1, maxLength: 255 }),
  proEmail: leadProfileString("Lead professional email address."),
  persoEmail: leadProfileString("Lead personal email address."),
  companyName: leadProfileString("Lead company name."),
  companyUrl: leadProfileString("Lead company URL."),
  linkedinUrl: leadProfileString("Lead LinkedIn profile URL."),
  jobTitle: leadProfileString("Lead job title."),
  profilePicture: leadProfileString("Lead profile picture URL."),
  phone: leadProfileString("Lead phone number."),
  location: leadProfileString("Lead location."),
  industry: leadProfileString("Lead industry."),
  crm_id: leadProfileString("External CRM ID for the lead."),
  relationsCount: s.number("Lead relationship count."),
  twitter: leadProfileString("Lead Twitter or X profile."),
  customAttribute1: s.string({ description: "Custom lead attribute 1.", minLength: 1, maxLength: 1000 }),
  customAttribute2: s.string({ description: "Custom lead attribute 2.", minLength: 1, maxLength: 1000 }),
  customAttribute3: s.string({ description: "Custom lead attribute 3.", minLength: 1, maxLength: 1000 }),
  customAttribute4: s.string({ description: "Custom lead attribute 4.", minLength: 1, maxLength: 1000 }),
  customAttribute5: s.string({ description: "Custom lead attribute 5.", minLength: 1, maxLength: 1000 }),
  customAttribute6: s.string({ description: "Custom lead attribute 6.", minLength: 1, maxLength: 1000 }),
  customAttribute7: s.string({ description: "Custom lead attribute 7.", minLength: 1, maxLength: 1000 }),
  customAttribute8: s.string({ description: "Custom lead attribute 8.", minLength: 1, maxLength: 1000 }),
  customAttribute9: s.string({ description: "Custom lead attribute 9.", minLength: 1, maxLength: 1000 }),
  customAttribute10: s.string({ description: "Custom lead attribute 10.", minLength: 1, maxLength: 1000 }),
  excludeContactedLeads: s.boolean("Whether La Growth Machine should skip leads that were already contacted."),
  enrichData: s.looseObject("Caller-provided enrichment data for the lead."),
  enrichStatus: s.nonEmptyString("Caller-provided enrichment status."),
};
const leadMutationFieldKeys = [
  "audience",
  "leadId",
  "firstname",
  "lastname",
  "gender",
  "bio",
  "proEmail",
  "persoEmail",
  "companyName",
  "companyUrl",
  "linkedinUrl",
  "jobTitle",
  "profilePicture",
  "phone",
  "location",
  "industry",
  "crm_id",
  "relationsCount",
  "twitter",
  "customAttribute1",
  "customAttribute2",
  "customAttribute3",
  "customAttribute4",
  "customAttribute5",
  "customAttribute6",
  "customAttribute7",
  "customAttribute8",
  "customAttribute9",
  "customAttribute10",
  "excludeContactedLeads",
  "enrichData",
  "enrichStatus",
] as const satisfies readonly (keyof typeof leadMutationFields & string)[];

const searchLeadsInputSchema: JsonSchema = s.object("Input for searching La Growth Machine leads.", searchLeadFields, {
  optional: [...searchLeadFieldKeys],
});
searchLeadsInputSchema.anyOf = searchLeadFieldKeys.map((key) => ({ required: [key] }));

const createOrUpdateLeadInputSchema: JsonSchema = s.object(
  "Input for creating or updating a La Growth Machine lead.",
  leadMutationFields,
  {
    optional: [...leadMutationFieldKeys],
  },
);
createOrUpdateLeadInputSchema.anyOf = [
  { required: ["leadId"] },
  { required: ["proEmail"] },
  { required: ["persoEmail"] },
  { required: ["linkedinUrl"] },
  { required: ["twitter"] },
  { required: ["firstname", "lastname", "companyName"] },
  { required: ["firstname", "lastname", "companyUrl"] },
];

export const laGrowthMachineActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_members",
    description: "List members in the authenticated La Growth Machine account.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing La Growth Machine members.", {}),
    outputSchema: s.object("Members returned by La Growth Machine.", {
      members: s.array("La Growth Machine members.", memberSchema),
      raw: s.anyOf("Raw La Growth Machine members response.", [
        s.array("Raw member array returned by La Growth Machine.", rawObjectSchema),
        rawObjectSchema,
      ]),
    }),
  }),
  defineProviderAction(service, {
    name: "list_audiences",
    description: "List audiences in the authenticated La Growth Machine account.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing La Growth Machine audiences.", {}),
    outputSchema: s.object("Audiences returned by La Growth Machine.", {
      audiences: s.array("La Growth Machine audiences.", audienceSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_audience",
    description: "Create an empty La Growth Machine audience.",
    requiredScopes: [],
    inputSchema: s.object("Input for creating a La Growth Machine audience.", {
      name: s.string({ description: "Audience name to create.", minLength: 1, maxLength: 100 }),
    }),
    outputSchema: s.object("Audience created by La Growth Machine.", {
      audience: audienceSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_audience_detail",
    description: "Get detailed information about one La Growth Machine audience.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a La Growth Machine audience.", {
      audienceId: audienceIdSchema,
    }),
    outputSchema: s.object("Audience detail returned by La Growth Machine.", {
      audience: audienceSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_audience_leads",
    description: "List leads belonging to a La Growth Machine audience.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing leads in a La Growth Machine audience.",
      {
        audienceId: audienceIdSchema,
        ...paginationInputSchema,
      },
      { optional: ["skip", "limit"] },
    ),
    outputSchema: s.object("Audience leads returned by La Growth Machine.", {
      leads: s.array("Leads in the audience.", leadSchema),
      total: s.nullable(s.integer("Total number of matching audience leads, if returned.")),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_leads",
    description: "Search La Growth Machine leads by one or more documented criteria.",
    requiredScopes: [],
    inputSchema: searchLeadsInputSchema,
    outputSchema: s.object("Leads matching the La Growth Machine search criteria.", {
      leads: s.array("Matching La Growth Machine leads.", leadSchema),
      tooManyResults: s.boolean("Whether La Growth Machine found too many matches and needs narrower search criteria."),
      raw: s.anyOf("Raw La Growth Machine search response.", [
        s.array("Raw lead array returned by La Growth Machine.", rawObjectSchema),
        rawObjectSchema,
      ]),
    }),
  }),
  defineProviderAction(service, {
    name: "create_or_update_lead",
    description: "Create a La Growth Machine lead or update it when it already exists.",
    requiredScopes: [],
    inputSchema: createOrUpdateLeadInputSchema,
    outputSchema: s.object("Lead created or updated by La Growth Machine.", {
      lead: leadSchema,
      raw: rawObjectSchema,
    }),
  }),
];

function leadProfileString(description: string): JsonSchema {
  return s.string({ description, minLength: 1, maxLength: 255 });
}
