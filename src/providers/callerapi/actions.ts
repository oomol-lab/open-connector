import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "callerapi";

const phoneSchema = s.string("The phone number to look up. CallerAPI accepts E.164 input.", {
  minLength: 1,
});

const accountInfoSchema = s.object("The CallerAPI account information response.", {
  status: s.string("The request status returned by CallerAPI."),
  email: s.string("The authenticated account email address."),
  credits_spent: s.nonNegativeInteger("The number of credits spent by the account."),
  credits_monthly: s.nonNegativeInteger("The monthly credit allocation for the account."),
  credits_left: s.nonNegativeInteger("The number of credits left in the account."),
});

const complaintSchema = s.looseObject("A complaint record returned by CallerAPI.", {
  CreatedDate: s.string("The date and time when the complaint was created."),
  ViolationDate: s.string("The date and time when the reported violation occurred."),
  ConsumerState: s.string("The consumer state associated with the complaint."),
  Subject: s.string("The complaint subject or category."),
  RecordedMessageOrRobocall: s.string("Whether the complaint involved a robocall."),
  Comment: s.string("Additional complaint details when provided."),
});

const businessInfoSchema = s.looseObject("Business details associated with the phone number.", {
  business_name: s.string("The associated business name."),
  category: s.string("The high-level business category."),
  city: s.string("The business city."),
  state: s.string("The business state or province."),
  country: s.string("The business country code."),
  industry: s.string("The business industry."),
  verified: s.boolean("Whether CallerAPI marks the business as verified."),
});

const carrierCountrySchema = s.looseObject("Country information returned with carrier details.", {
  iso: s.string("The ISO country code."),
  code: s.string("The country calling code."),
  name: s.string("The full country name."),
});

const carrierNetworkOriginalSchema = s.looseObject("Original carrier information returned with carrier details.", {
  carrier: s.string("The original carrier name."),
  ocn: s.string("The original operating company number."),
  spid: s.string("The original service provider ID."),
});

const carrierNetworkSchema = s.looseObject("Network information returned with carrier details.", {
  carrier: s.string("The current carrier name."),
  ocn: s.string("The operating company number."),
  spid: s.string("The service provider ID."),
  type: s.string("The network type returned by CallerAPI."),
  original: carrierNetworkOriginalSchema,
});

const carrierNumberSchema = s.looseObject("Number details returned with carrier information.", {
  lrn: s.string("The location routing number."),
  type: s.string("The number type returned by CallerAPI."),
  valid: s.string("The number validity status."),
  mobile: s.boolean("Whether CallerAPI reports the number as mobile."),
  msisdn: s.string("The phone number in MSISDN format."),
  ported: s.boolean("Whether the number has been ported."),
  ported_date: s.string("The date when the number was ported."),
  landline: s.boolean("Whether CallerAPI reports the number as landline."),
  timezone: s.string("The number time zone."),
  reachable: s.string("The number reachability status."),
  local_format: s.string("The local number format."),
});

const carrierInfoSchema = s.looseObject("Carrier and HLR information returned by CallerAPI.", {
  country: carrierCountrySchema,
  network: carrierNetworkSchema,
  number: carrierNumberSchema,
});

const phoneInfoSchema = s.looseObject("Detailed CallerAPI phone intelligence for a number.", {
  phone: s.string("The phone number returned by CallerAPI."),
  is_spam: s.boolean("Whether the number is marked as spam."),
  reputation: s.string("The reputation label for the number."),
  spam_score: s.integer("The spam likelihood score from 0 to 100.", {
    minimum: 0,
    maximum: 100,
  }),
  entity_type: s.string("The entity type returned by CallerAPI."),
  total_complaints: s.nonNegativeInteger("The total complaint count recorded for the number."),
  complaints: s.array("The complaints returned for the phone number.", complaintSchema),
  business_info: businessInfoSchema,
  carrier_info: carrierInfoSchema,
});

const getPhoneNumberInformationOutputSchema = s.object(
  "The phone number information response returned by CallerAPI.",
  {
    status: s.string("The request status returned by CallerAPI."),
    data: phoneInfoSchema,
  },
  { optional: ["data"] },
);

export const callerapiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_information",
    operationType: "read",
    description: "Retrieve the authenticated CallerAPI account email and credit balance.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving CallerAPI account details.", {}),
    outputSchema: accountInfoSchema,
  }),
  defineProviderAction(service, {
    name: "get_phone_number_information",
    operationType: "read",
    description:
      "Look up CallerAPI spam reputation, business details, complaints, and optional HLR carrier data for a phone number.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for looking up CallerAPI phone number information.",
      {
        phone: phoneSchema,
        hlr: s.boolean("Whether to include HLR carrier data in the CallerAPI lookup."),
      },
      { optional: ["hlr"] },
    ),
    outputSchema: getPhoneNumberInformationOutputSchema,
  }),
];
