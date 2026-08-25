import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "leadmagic";

const findWorkEmailInputSchema: JsonSchema = {
  ...s.object(
    "Input for LeadMagic work email finder.",
    {
      firstName: s.nonEmptyString("The person's first name. Required if fullName is not provided."),
      lastName: s.nonEmptyString("The person's last name. Required if fullName is not provided."),
      fullName: s.nonEmptyString("The person's full name as an alternative to firstName and lastName."),
      domain: s.nonEmptyString("The company website domain, such as example.com."),
      companyName: s.nonEmptyString("The company name when a domain is not available."),
    },
    { optional: ["firstName", "lastName", "fullName", "domain", "companyName"] },
  ),
  allOf: [
    { anyOf: [{ required: ["fullName"] }, { required: ["firstName"] }, { required: ["lastName"] }] },
    { anyOf: [{ required: ["domain"] }, { required: ["companyName"] }] },
  ],
};

const findMobileInputSchema: JsonSchema = {
  ...s.object(
    "Input for LeadMagic mobile finder.",
    {
      profileUrl: s.nonEmptyString("The professional profile URL or username to look up."),
      workEmail: s.email("The professional email address to improve matching."),
      personalEmail: s.email("The personal email address to use as an alternative identifier."),
    },
    { optional: ["profileUrl", "workEmail", "personalEmail"] },
  ),
  anyOf: [{ required: ["profileUrl"] }, { required: ["workEmail"] }, { required: ["personalEmail"] }],
};

const enrichCompanyInputSchema: JsonSchema = {
  ...s.object(
    "Input for LeadMagic company enrichment.",
    {
      companyDomain: s.nonEmptyString("The company website domain to enrich, such as example.com."),
      profileUrl: s.nonEmptyString("The professional company profile URL or slug."),
      companyName: s.nonEmptyString("The company name to enrich."),
    },
    { optional: ["companyDomain", "profileUrl", "companyName"] },
  ),
  anyOf: [{ required: ["companyDomain"] }, { required: ["profileUrl"] }, { required: ["companyName"] }],
};

export const leadmagicActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_credits",
    description: "Get the current LeadMagic credit balance for the API key.",
    requiredScopes: [],
    inputSchema: s.object("No input is required for LeadMagic credit balance lookup.", {}),
    outputSchema: s.object("The LeadMagic credit balance response.", {
      credits: s.number("The current LeadMagic credit balance."),
      raw: s.looseObject("The raw LeadMagic credit balance payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "validate_email",
    description: "Validate an email address for deliverability and domain intelligence.",
    requiredScopes: [],
    inputSchema: s.object("Input for LeadMagic email validation.", {
      email: s.email("The email address to validate."),
    }),
    outputSchema: s.object("The normalized LeadMagic email validation response.", {
      email: s.nullableString("The normalized email address returned by LeadMagic."),
      emailStatus: s.nullableString("The validation status, such as valid, invalid, or unknown."),
      isDomainCatchAll: s.nullableBoolean("Whether LeadMagic detected an accept-all domain."),
      creditsConsumed: s.nullableNumber("The credits consumed by this validation request."),
      message: s.nullableString("The human-readable LeadMagic validation message."),
      mxRecord: s.nullableString("The primary MX record for the email domain."),
      mxProvider: s.nullableString("The email provider detected from MX records."),
      mxGateway: s.nullableString("The MX security gateway vendor when available."),
      mxGatewayType: s.nullableString("The MX security gateway type when available."),
      mxSecurityGateway: s.nullableBoolean("Whether a security gateway is present."),
      company: s.looseObject("Company enrichment fields returned with the validation result."),
      raw: s.looseObject("The raw LeadMagic email validation payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_work_email",
    description: "Find a professional email address from a person's name and company.",
    requiredScopes: [],
    inputSchema: findWorkEmailInputSchema,
    outputSchema: s.object("The normalized LeadMagic work email finder response.", {
      email: s.nullableString("The found professional email address, or null when none was found."),
      status: s.nullableString("The LeadMagic result status, such as valid or null."),
      creditsConsumed: s.nullableNumber("The credits consumed by this lookup."),
      message: s.nullableString("The human-readable LeadMagic result message."),
      employmentVerified: s.nullableBoolean("Whether employment at the company was verified."),
      mxRecord: s.nullableString("The primary MX record for the company domain."),
      mxProvider: s.nullableString("The email provider detected from MX records."),
      hasMx: s.nullableBoolean("Whether the company domain has MX records."),
      company: s.looseObject("Company enrichment fields returned with the email finder result."),
      raw: s.looseObject("The raw LeadMagic work email finder payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_mobile",
    description: "Find a mobile phone number from a profile URL or email identifier.",
    requiredScopes: [],
    inputSchema: findMobileInputSchema,
    outputSchema: s.object("The normalized LeadMagic mobile finder response.", {
      profileUrl: s.nullableString("The profile URL used for the mobile lookup."),
      email: s.nullableString("The email address used for the mobile lookup."),
      mobileNumber: s.nullableString("The mobile phone number found, or null when none was found."),
      creditsConsumed: s.nullableNumber("The credits consumed by this lookup."),
      message: s.nullableString("The human-readable LeadMagic result message."),
      raw: s.looseObject("The raw LeadMagic mobile finder payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "enrich_profile",
    description: "Retrieve professional profile data from a profile URL or username.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for LeadMagic profile enrichment.",
      {
        profileUrl: s.nonEmptyString("The professional profile URL or username to enrich."),
        extendedResponse: s.boolean("Whether to include extended profile fields such as image URL."),
      },
      { optional: ["extendedResponse"] },
    ),
    outputSchema: s.object("The normalized LeadMagic profile enrichment response.", {
      profileUrl: s.nullableString("The professional profile URL returned by LeadMagic."),
      firstName: s.nullableString("The person's first name."),
      lastName: s.nullableString("The person's last name."),
      fullName: s.nullableString("The person's full name."),
      professionalTitle: s.nullableString("The person's current professional title."),
      bio: s.nullableString("The person's profile summary."),
      location: s.nullableString("The person's geographic location."),
      country: s.nullableString("The person's country."),
      followersRange: s.nullableString("The person's social follower range."),
      companyName: s.nullableString("The person's current company name."),
      companyIndustry: s.nullableString("The person's current company industry."),
      companyWebsite: s.nullableString("The person's current company website."),
      totalTenureYears: s.nullableString("The person's total career tenure in years."),
      totalTenureMonths: s.nullableString("The person's total career tenure in months."),
      workExperience: s.array(
        "The work history entries returned by LeadMagic.",
        s.looseObject("One work history entry."),
      ),
      education: s.array("The education entries returned by LeadMagic.", s.looseObject("One education entry.")),
      certifications: s.array(
        "The certification entries returned by LeadMagic.",
        s.looseObject("One certification entry."),
      ),
      raw: s.looseObject("The raw LeadMagic profile enrichment payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "enrich_company",
    description: "Find and enrich company data by domain, profile URL, or company name.",
    requiredScopes: [],
    inputSchema: enrichCompanyInputSchema,
    outputSchema: s.object("The normalized LeadMagic company enrichment response.", {
      companyName: s.nullableString("The official company name returned by LeadMagic."),
      companyId: s.nullableInteger("The LeadMagic company identifier."),
      industry: s.nullableString("The company's primary industry."),
      employeeCount: s.nullableInteger("The exact employee count when returned by LeadMagic."),
      employeeRange: s.nullableString("The employee count range returned by LeadMagic."),
      founded: s.nullableInteger("The company's founding year."),
      headquarters: s.nullable(s.looseObject("The company headquarters location object.")),
      revenue: s.nullableString("The company's annual revenue range."),
      funding: s.nullableString("The company's total funding value."),
      followerCount: s.nullableInteger("The company's social follower count."),
      twitterUrl: s.nullableString("The company's Twitter or X profile URL."),
      facebookUrl: s.nullableString("The company's Facebook page URL."),
      b2bProfileUrl: s.nullableString("The company's professional profile URL."),
      logoUrl: s.nullableString("The company's logo URL."),
      description: s.nullableString("The company description."),
      specialties: s.array("The company specialties returned by LeadMagic.", s.string("One company specialty.")),
      competitors: s.array("The competitor names returned by LeadMagic.", s.string("One competitor name.")),
      raw: s.looseObject("The raw LeadMagic company enrichment payload."),
    }),
  }),
];
