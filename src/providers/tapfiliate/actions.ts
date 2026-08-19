import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tapfiliate";

const trimmedString = (description: string): JsonSchema => s.nonEmptyString(description);
const dateString = (description: string): JsonSchema => s.date(description);
const pageSchema = s.positiveInteger(
  "The 1-based Tapfiliate result page to request. Omit this field to request the first page.",
);
const metadataSchema = s.record(
  "Provider-defined metadata key-value pairs to send to Tapfiliate.",
  s.unknown("A metadata value accepted by Tapfiliate."),
);
const customFieldsSchema = s.record(
  "Provider-defined affiliate custom fields to send to Tapfiliate.",
  s.unknown("A custom field value accepted by Tapfiliate."),
);

const paginationSchema = s.actionOutput(
  {
    current_page: s.positiveInteger("The page requested for this list operation."),
    next_page: s.nullable(s.positiveInteger("The next page number when Tapfiliate provides one.")),
    previous_page: s.nullable(s.positiveInteger("The previous page number when Tapfiliate provides one.")),
    first_page: s.nullable(s.positiveInteger("The first page number when Tapfiliate provides one.")),
    last_page: s.nullable(s.positiveInteger("The last page number when Tapfiliate provides one.")),
    link_header: s.nullable(s.string("The raw Tapfiliate Link header value when present.")),
  },
  "Pagination details parsed from Tapfiliate's Link header.",
);

const rawObject = (description: string): JsonSchema => s.looseObject(description);

const affiliateOutputSchema = s.actionOutput(
  {
    id: s.string("The Tapfiliate affiliate id."),
    firstname: s.nullableString("The affiliate's first name when returned by Tapfiliate."),
    lastname: s.nullableString("The affiliate's last name when returned by Tapfiliate."),
    email: s.nullableString("The affiliate's email address when returned by Tapfiliate."),
    company: s.nullable(rawObject("The affiliate company object returned by Tapfiliate.")),
    address: s.nullable(rawObject("The affiliate address object returned by Tapfiliate.")),
    meta_data: s.nullable(rawObject("The affiliate metadata object returned by Tapfiliate.")),
    parent_id: s.nullableString("The parent affiliate id when returned by Tapfiliate."),
    affiliate_group_id: s.nullableString("The affiliate group id when returned by Tapfiliate."),
    created_at: s.nullableString("The affiliate creation timestamp returned by Tapfiliate."),
    promoted_at: s.nullableString("The affiliate promotion timestamp returned by Tapfiliate."),
    promotion_method: s.nullableString("The affiliate promotion method returned by Tapfiliate."),
    custom_fields: s.nullable(rawObject("The affiliate custom fields returned by Tapfiliate.")),
    raw: rawObject("The raw affiliate object returned by Tapfiliate."),
  },
  "A normalized Tapfiliate affiliate.",
);

const conversionOutputSchema = s.actionOutput(
  {
    id: s.nullableNumber("The numeric Tapfiliate conversion id when returned."),
    external_id: s.nullableString("The external conversion id supplied by the merchant."),
    amount: s.nullableNumber("The conversion amount when returned by Tapfiliate."),
    click: s.nullable(rawObject("The click object associated with this conversion.")),
    commissions: s.array(
      "The commission objects returned with this conversion.",
      rawObject("A Tapfiliate commission object."),
    ),
    program: s.nullable(rawObject("The program object associated with this conversion.")),
    affiliate: s.nullable(rawObject("The affiliate object associated with this conversion.")),
    customer: s.nullable(rawObject("The customer object associated with this conversion.")),
    meta_data: s.nullable(rawObject("The conversion metadata returned by Tapfiliate.")),
    affiliate_meta_data: s.unknown("Affiliate metadata returned with the conversion."),
    created_at: s.nullableString("The conversion creation timestamp returned by Tapfiliate."),
    warnings: s.unknown("Warnings returned by Tapfiliate for this conversion."),
    raw: rawObject("The raw conversion object returned by Tapfiliate."),
  },
  "A normalized Tapfiliate conversion.",
);

const commissionOutputSchema = s.actionOutput(
  {
    id: s.nullableNumber("The numeric Tapfiliate commission id when returned."),
    amount: s.nullableNumber("The commission amount."),
    approved: s.nullableBoolean("Whether the commission is approved."),
    created_at: s.nullableString("The commission creation timestamp returned by Tapfiliate."),
    commission_type: s.nullableString("The Tapfiliate commission type identifier."),
    commission_name: s.nullableString("The Tapfiliate commission display name."),
    kind: s.nullableString("The Tapfiliate commission kind."),
    currency: s.nullableString("The commission currency."),
    conversion: s.nullable(rawObject("The conversion object associated with this commission.")),
    affiliate: s.nullable(rawObject("The affiliate object associated with this commission.")),
    payout: s.unknown("The payout value returned by Tapfiliate."),
    comment: s.nullableString("The commission comment when returned by Tapfiliate."),
    final: s.unknown("The finalization state returned by Tapfiliate."),
    finalization_date: s.nullableString("The finalization date returned by Tapfiliate."),
    raw: rawObject("The raw commission object returned by Tapfiliate."),
  },
  "A normalized Tapfiliate commission.",
);

const programOutputSchema = s.actionOutput(
  {
    id: s.string("The Tapfiliate program id."),
    title: s.nullableString("The program title."),
    currency: s.nullableString("The program currency."),
    cookie_time: s.nullableNumber("The program cookie time in days when returned."),
    default_landing_page_url: s.nullableString("The default landing page URL for this program."),
    recurring: s.nullableBoolean("Whether the program is recurring."),
    recurring_cap: s.nullableNumber("The recurring cap when returned."),
    recurring_period_days: s.nullableNumber("The recurring period in days when returned."),
    program_category: s.nullable(rawObject("The program category object returned by Tapfiliate.")),
    currency_symbol: s.nullableString("The program currency symbol."),
    raw: rawObject("The raw program object returned by Tapfiliate."),
  },
  "A normalized Tapfiliate program.",
);

const affiliateGroupOutputSchema = s.actionOutput(
  {
    id: s.string("The Tapfiliate affiliate group id."),
    title: s.nullableString("The affiliate group title."),
    affiliate_count: s.nullableNumber("The number of affiliates in the group when returned."),
    raw: rawObject("The raw affiliate group object returned by Tapfiliate."),
  },
  "A normalized Tapfiliate affiliate group.",
);

const clickOutputSchema = s.actionOutput(
  {
    id: s.string("The Tapfiliate click id."),
    created_at: s.nullableString("The click creation timestamp returned by Tapfiliate."),
    meta_data: s.unknown("The click metadata returned by Tapfiliate."),
    details: s.nullable(rawObject("The click details object returned by Tapfiliate.")),
    geolocation: s.nullable(rawObject("The click geolocation object returned by Tapfiliate.")),
    raw: rawObject("The raw click object returned by Tapfiliate."),
  },
  "A normalized Tapfiliate click.",
);

const clickCreationOutputSchema = s.actionOutput(
  {
    id: s.string("The Tapfiliate click id."),
    raw: rawObject("The raw create click response returned by Tapfiliate."),
  },
  "The Tapfiliate click creation result.",
);

const companyInputSchema = s.object(
  "The affiliate's company data.",
  {
    name: trimmedString("The affiliate company's name."),
    description: trimmedString("The affiliate company's description."),
  },
  { optional: ["name", "description"], additionalProperties: true },
);

const addressInputSchema = s.object(
  "The affiliate's address data.",
  {
    address: trimmedString("The street address."),
    address_two: trimmedString("The second address line."),
    postal_code: trimmedString("The postal code."),
    city: trimmedString("The city."),
    state: trimmedString("The state or region."),
    country: s.object("The affiliate address country.", {
      code: trimmedString("The ISO 3166-1 country code."),
    }),
  },
  { optional: ["address_two", "state"] },
);

const listAffiliatesInputSchema = s.actionInput(
  {
    page: pageSchema,
    click_id: trimmedString("A click id used to filter affiliates."),
    source_id: trimmedString("A source id used to filter affiliates."),
    email: s.email("An email address used to filter affiliates."),
    referral_code: trimmedString("An affiliate referral code used to filter affiliates."),
    parent_id: trimmedString("A parent affiliate id used to list child affiliates."),
    affiliate_group_id: trimmedString("An affiliate group id used to filter affiliates."),
  },
  [],
  "Filters for listing Tapfiliate affiliates.",
);

const createAffiliateInputSchema = s.actionInput(
  {
    firstname: trimmedString("The affiliate's first name."),
    lastname: trimmedString("The affiliate's last name."),
    email: s.email("The affiliate's email address."),
    password: trimmedString("The password for the new affiliate account."),
    company: companyInputSchema,
    address: addressInputSchema,
    custom_fields: customFieldsSchema,
  },
  ["firstname", "lastname", "email"],
  "Fields for creating a Tapfiliate affiliate.",
);

const listConversionsInputSchema = s.actionInput(
  {
    page: pageSchema,
    program_id: trimmedString("The program id used to filter conversions."),
    external_id: trimmedString("The external conversion id used to filter conversions."),
    affiliate_id: trimmedString("The affiliate id used to filter conversions."),
    pending: s.boolean("Only include conversions that have pending commissions."),
    date_from: dateString("The start date for conversion filtering."),
    date_to: dateString("The end date for conversion filtering."),
    use_profile_timezone: s.boolean("Whether Tapfiliate should use the profile time zone."),
  },
  [],
  "Filters for listing Tapfiliate conversions.",
);

const createConversionInputBaseSchema = s.actionInput(
  {
    override_max_cookie_time: s.boolean("Whether to override Tapfiliate's maximum cookie time for this conversion."),
    referral_code: trimmedString("An affiliate referral code."),
    tracking_id: trimmedString("The tracking id retrieved from the Tapfiliate JavaScript library."),
    click_id: trimmedString("The Tapfiliate click id used to add reporting information."),
    coupon: trimmedString("A coupon code used to track the conversion."),
    currency: s.string({
      minLength: 3,
      maxLength: 3,
      description: "The three-letter ISO currency code for the conversion.",
    }),
    asset_id: trimmedString("The Tapfiliate asset id."),
    source_id: trimmedString("The Tapfiliate source id."),
    external_id: trimmedString("A unique conversion id from the caller's system."),
    amount: s.number("The conversion amount."),
    customer_id: trimmedString("The customer id from the caller's system."),
    commission_type: trimmedString("The Tapfiliate commission type."),
    commissions: s.array(
      "Commission overrides to send to Tapfiliate.",
      s.looseObject("A Tapfiliate commission override object."),
      { minItems: 1 },
    ),
    meta_data: metadataSchema,
    program_group: trimmedString("The Tapfiliate program group id."),
    user_agent: trimmedString("The client's user agent string."),
    ip: trimmedString("The client's IP address."),
  },
  [],
  "Fields for creating a Tapfiliate conversion.",
);

const createConversionInputSchema = {
  ...createConversionInputBaseSchema,
  anyOf: [
    { required: ["referral_code"] },
    { required: ["customer_id"] },
    { required: ["click_id"] },
    { required: ["coupon"] },
    { required: ["tracking_id"] },
    { required: ["asset_id", "source_id"] },
  ],
  dependentRequired: {
    asset_id: ["source_id"],
  },
} satisfies JsonSchema;

const listCommissionsInputSchema = s.actionInput(
  {
    page: pageSchema,
    affiliate_id: trimmedString("The affiliate id used to filter commissions."),
    status: s.stringEnum("The Tapfiliate commission approval status.", ["approved", "disapproved", "pending"]),
    paid: s.boolean("Whether to include only paid commissions."),
  },
  [],
  "Filters for listing Tapfiliate commissions.",
);

const listProgramsInputSchema = s.actionInput(
  {
    page: pageSchema,
    asset_id: trimmedString("An asset id used to filter programs."),
  },
  [],
  "Filters for listing Tapfiliate programs.",
);

const listClicksInputSchema = s.actionInput(
  {
    page: pageSchema,
    program_id: trimmedString("The program id used to filter clicks."),
    affiliate_id: trimmedString("The affiliate id used to filter clicks."),
    date_from: dateString("The start date for click filtering."),
    date_to: dateString("The end date for click filtering."),
  },
  [],
  "Filters for listing Tapfiliate clicks.",
);

const createClickInputSchema = s.actionInput(
  {
    referral_code: trimmedString("The affiliate referral code obtained from the referral URL."),
    source_id: trimmedString("The source id used by the affiliate when present."),
    meta_data: metadataSchema,
    referrer: s.url("The HTTP referrer used in Tapfiliate reporting."),
    landing_page: s.url("The current landing page used in Tapfiliate reporting."),
    user_agent: trimmedString("The full client user agent string."),
    ip: trimmedString("The client IP address."),
  },
  ["referral_code"],
  "Fields for creating a Tapfiliate click.",
);

export const tapfiliateActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_affiliates",
    description: "List Tapfiliate affiliates with optional id, email, referral, and group filters.",
    inputSchema: listAffiliatesInputSchema,
    outputSchema: s.actionOutput(
      {
        affiliates: s.array("The affiliates returned by Tapfiliate.", affiliateOutputSchema),
        pagination: paginationSchema,
      },
      "The Tapfiliate affiliates list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_affiliate",
    description: "Retrieve a single Tapfiliate affiliate by affiliate id.",
    inputSchema: s.actionInput(
      { affiliate_id: trimmedString("The Tapfiliate affiliate id.") },
      ["affiliate_id"],
      "The Tapfiliate affiliate to retrieve.",
    ),
    outputSchema: s.actionOutput({ affiliate: affiliateOutputSchema }, "The Tapfiliate affiliate response."),
  }),
  defineProviderAction(service, {
    name: "create_affiliate",
    description: "Create a Tapfiliate affiliate with contact, company, address, and custom field data.",
    inputSchema: createAffiliateInputSchema,
    outputSchema: s.actionOutput({ affiliate: affiliateOutputSchema }, "The Tapfiliate create affiliate response."),
  }),
  defineProviderAction(service, {
    name: "list_conversions",
    description: "List Tapfiliate conversions with optional program, external id, affiliate, date, and status filters.",
    inputSchema: listConversionsInputSchema,
    outputSchema: s.actionOutput(
      {
        conversions: s.array("The conversions returned by Tapfiliate.", conversionOutputSchema),
        pagination: paginationSchema,
      },
      "The Tapfiliate conversions list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_conversion",
    description:
      "Create a Tapfiliate conversion using a documented referral, customer, click, coupon, tracking, or asset-source matcher.",
    inputSchema: createConversionInputSchema,
    outputSchema: s.actionOutput({ conversion: conversionOutputSchema }, "The Tapfiliate create conversion response."),
  }),
  defineProviderAction(service, {
    name: "list_commissions",
    description: "List Tapfiliate commissions with optional affiliate, approval status, and paid filters.",
    inputSchema: listCommissionsInputSchema,
    outputSchema: s.actionOutput(
      {
        commissions: s.array("The commissions returned by Tapfiliate.", commissionOutputSchema),
        pagination: paginationSchema,
      },
      "The Tapfiliate commissions list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_programs",
    description: "List Tapfiliate programs with an optional asset filter.",
    inputSchema: listProgramsInputSchema,
    outputSchema: s.actionOutput(
      {
        programs: s.array("The programs returned by Tapfiliate.", programOutputSchema),
        pagination: paginationSchema,
      },
      "The Tapfiliate programs list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_affiliate_groups",
    description: "List Tapfiliate affiliate groups.",
    inputSchema: s.actionInput({ page: pageSchema }, [], "The input payload for listing Tapfiliate affiliate groups."),
    outputSchema: s.actionOutput(
      {
        affiliate_groups: s.array("The affiliate groups returned by Tapfiliate.", affiliateGroupOutputSchema),
        pagination: paginationSchema,
      },
      "The Tapfiliate affiliate groups list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_affiliate_group",
    description: "Create a Tapfiliate affiliate group.",
    inputSchema: s.actionInput(
      { title: trimmedString("The affiliate group title.") },
      ["title"],
      "Fields for creating a Tapfiliate affiliate group.",
    ),
    outputSchema: s.actionOutput(
      {
        affiliate_group: affiliateGroupOutputSchema,
      },
      "The Tapfiliate create affiliate group response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_clicks",
    description: "List Tapfiliate Enterprise click records with optional program, affiliate, and date filters.",
    inputSchema: listClicksInputSchema,
    outputSchema: s.actionOutput(
      {
        clicks: s.array("The clicks returned by Tapfiliate.", clickOutputSchema),
        pagination: paginationSchema,
      },
      "The Tapfiliate clicks list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_click",
    description: "Create a Tapfiliate REST-only tracking click and return its click id for later conversion creation.",
    inputSchema: createClickInputSchema,
    outputSchema: s.actionOutput({ click: clickCreationOutputSchema }, "The Tapfiliate create click response."),
  }),
];
