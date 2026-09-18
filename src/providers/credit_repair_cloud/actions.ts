import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "credit_repair_cloud";

const idSchema = s.string({
  minLength: 1,
  pattern: "\\S",
  description: "The encrypted Credit Repair Cloud record ID.",
});
const emailSchema = s.string({
  minLength: 1,
  description: "The email address in Credit Repair Cloud.",
  format: "email",
});

const leadClientRecordSchema = s.object(
  "A lead or client record accepted by Credit Repair Cloud.",
  {
    type: s.string({
      minLength: 1,
      pattern: "\\S",
      description:
        "The Credit Repair Cloud lead/client status, such as Client, Lead, Lead/Inactive, Inactive, Suspended, or a configured custom status.",
    }),
    firstname: s.string({ minLength: 1, pattern: "\\S", description: "The lead or client first name." }),
    lastname: s.string({ minLength: 1, pattern: "\\S", description: "The lead or client last name." }),
    middlename: s.string("The lead or client middle name."),
    suffix: s.string("The lead or client suffix."),
    email: emailSchema,
    phone_home: s.nonEmptyString("The home phone number."),
    phone_mobile: s.nonEmptyString("The mobile phone number."),
    phone_work: s.nonEmptyString("The work phone number."),
    phone_work_ext: s.nonEmptyString("The work phone extension."),
    fax: s.nonEmptyString("The fax number."),
    street_address: s.string("The street mailing address."),
    city: s.string("The mailing address city."),
    state: s.string("The mailing address state abbreviation."),
    zip: s.string("The mailing address ZIP or postal code."),
    post_code: s.string("The mailing address post code accepted by Credit Repair Cloud."),
    ssno: s.string("The last four digits of the Social Security number."),
    birth_date: s.string("The birth date in mm/dd/yyyy format."),
    memo: s.string("The lead or client memo."),
    previous_mailing_address: s.string("The previous mailing address."),
    previous_city: s.string("The previous mailing address city."),
    previous_state: s.string("The previous mailing address state abbreviation."),
    previous_zip: s.string("The previous mailing address ZIP or postal code."),
    client_assigned_to: s.string("Comma-separated team member names to assign to the client."),
    client_portal_access: s.stringEnum("Whether client portal access should be enabled.", ["on", "off"]),
    client_userid: emailSchema,
    client_agreement: s.string("The client agreement name configured in Credit Repair Cloud."),
    send_setup_password_info_via_email: s.stringEnum(
      "Whether Credit Repair Cloud should email setup password instructions.",
      ["yes", "no"],
    ),
    referred_by_firstname: s.string("The referrer first name."),
    referred_by_lastname: s.string("The referrer last name."),
    referred_by_email: emailSchema,
  },
  {
    optional: [
      "middlename",
      "suffix",
      "email",
      "phone_home",
      "phone_mobile",
      "phone_work",
      "phone_work_ext",
      "fax",
      "street_address",
      "city",
      "state",
      "zip",
      "post_code",
      "ssno",
      "birth_date",
      "memo",
      "previous_mailing_address",
      "previous_city",
      "previous_state",
      "previous_zip",
      "client_assigned_to",
      "client_portal_access",
      "client_userid",
      "client_agreement",
      "send_setup_password_info_via_email",
      "referred_by_firstname",
      "referred_by_lastname",
      "referred_by_email",
    ],
  },
);

const affiliateRecordSchema = s.object(
  "An affiliate record accepted by Credit Repair Cloud.",
  {
    type: s.stringEnum("The Credit Repair Cloud affiliate status type.", ["Active", "Inactive", "Pending"]),
    firstname: s.string({ minLength: 1, pattern: "\\S", description: "The affiliate first name." }),
    lastname: s.string({ minLength: 1, pattern: "\\S", description: "The affiliate last name." }),
    gender: s.stringEnum("The affiliate gender value accepted by Credit Repair Cloud.", ["Male", "Female"]),
    company: s.string("The affiliate company name."),
    company_url: s.string("The affiliate company URL.", {
      format: "uri",
    }),
    email: emailSchema,
    phone: s.nonEmptyString("The affiliate phone number."),
    phone_ext: s.nonEmptyString("The affiliate phone extension."),
    alternate_phone: s.nonEmptyString("The affiliate alternate phone number."),
    fax: s.nonEmptyString("The affiliate fax number."),
    mailing_address: s.string("The affiliate mailing address."),
    city: s.string("The affiliate mailing address city."),
    state: s.string("The affiliate mailing address state abbreviation."),
    zip: s.string("The affiliate mailing address ZIP or postal code."),
    post_code: s.string("The affiliate mailing address post code accepted by Credit Repair Cloud."),
    internal_note: s.string("The internal note for the affiliate."),
    affiliate_portal_access: s.stringEnum("Whether affiliate portal access should be enabled.", ["on", "off"]),
    affiliate_userid: emailSchema,
    send_setup_password_info_via_email: s.stringEnum(
      "Whether Credit Repair Cloud should email setup password instructions.",
      ["yes", "no"],
    ),
  },
  {
    optional: [
      "gender",
      "company",
      "company_url",
      "phone_ext",
      "alternate_phone",
      "fax",
      "mailing_address",
      "city",
      "state",
      "zip",
      "post_code",
      "internal_note",
      "affiliate_portal_access",
      "affiliate_userid",
      "send_setup_password_info_via_email",
    ],
  },
);

const leadClientInputSchema = s.requiredObject("The input payload for creating a lead or client.", {
  record: leadClientRecordSchema,
});

const updateLeadClientInputSchema = s.requiredObject("The input payload for updating a lead or client.", {
  id: idSchema,
  record: leadClientRecordSchema,
});

const affiliateInputSchema = s.requiredObject("The input payload for creating an affiliate.", {
  record: affiliateRecordSchema,
});

const updateAffiliateInputSchema = s.requiredObject("The input payload for updating an affiliate.", {
  id: idSchema,
  record: affiliateRecordSchema,
});

const idInputSchema = s.requiredObject("The input payload for a Credit Repair Cloud record ID.", {
  id: idSchema,
});

const mutationOutputSchema = s.requiredObject("The normalized Credit Repair Cloud mutation response.", {
  success: s.boolean("Whether Credit Repair Cloud reported success."),
  id: s.nullable(s.string("The returned record ID when Credit Repair Cloud includes one.")),
  code: s.nullable(s.string("The Credit Repair Cloud error or status code when present.")),
  message: s.nullable(s.string("The Credit Repair Cloud response message when present.")),
  raw: s.looseObject("The raw parsed Credit Repair Cloud XML response."),
});

const viewOutputSchema = s.requiredObject("The normalized Credit Repair Cloud view response.", {
  success: s.boolean("Whether Credit Repair Cloud reported success."),
  record: s.nullable(s.looseObject("The returned Credit Repair Cloud record when present.")),
  code: s.nullable(s.string("The Credit Repair Cloud error or status code when present.")),
  message: s.nullable(s.string("The Credit Repair Cloud response message when present.")),
  raw: s.looseObject("The raw parsed Credit Repair Cloud XML response."),
});

export const creditRepairCloudActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "insert_lead_client",
    operationType: "write",
    description: "Create a Credit Repair Cloud lead or client record.",
    inputSchema: leadClientInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_lead_client",
    operationType: "write",
    description: "Update a Credit Repair Cloud lead or client record.",
    inputSchema: updateLeadClientInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_lead_client",
    operationType: "destructive",
    description: "Delete a Credit Repair Cloud lead or client record.",
    inputSchema: idInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "view_lead_client",
    operationType: "read",
    description: "View a Credit Repair Cloud lead or client record.",
    inputSchema: idInputSchema,
    outputSchema: viewOutputSchema,
  }),
  defineProviderAction(service, {
    name: "insert_affiliate",
    operationType: "write",
    description: "Create a Credit Repair Cloud affiliate record.",
    inputSchema: affiliateInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_affiliate",
    operationType: "write",
    description: "Update a Credit Repair Cloud affiliate record.",
    inputSchema: updateAffiliateInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_affiliate",
    operationType: "destructive",
    description: "Delete a Credit Repair Cloud affiliate record.",
    inputSchema: idInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "view_affiliate",
    operationType: "read",
    description: "View a Credit Repair Cloud affiliate record.",
    inputSchema: idInputSchema,
    outputSchema: viewOutputSchema,
  }),
];
