import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "leadboxer" as const;

const datasetIdSchema = s.optional(
  s.nonEmptyString("The LeadBoxer dataset ID whose credits should be charged for the lookup."),
);

const ipSchema = s.nonEmptyString("The IPv4 or IPv6 address to enrich.");

const domainSchema = s.nonEmptyString("The clean domain name to enrich, without a protocol or www prefix.", {});

const ipLookupOutputSchema = s.looseRequiredObject("The IP enrichment details returned by LeadBoxer.", {
  ipRange: s.optional(s.string("The CIDR range that contains the searched IP address.")),
  ipCountryCode: s.optional(s.string("The ISO 3166-1 alpha-2 country code associated with the IP address.")),
  ipCountryName: s.optional(s.string("The full country name associated with the IP address.")),
  ipSubContinent: s.optional(s.string("The sub-continent or geographic region associated with the IP address.")),
  ipRegionName: s.optional(s.string("The administrative region or state associated with the IP address.")),
  ipCity: s.optional(s.string("The city associated with the IP address.")),
  ipLatitude: s.optional(s.string("The latitude coordinate returned for the IP address.")),
  ipLongitude: s.optional(s.string("The longitude coordinate returned for the IP address.")),
  ipTimezone: s.optional(s.string("The timezone associated with the IP address.")),
  ipIsp: s.optional(s.string("The internet service provider associated with the IP address.")),
  ipOrganization: s.optional(s.string("The registered organization associated with the IP address.")),
  ipDomain: s.optional(s.string("The primary domain associated with the IP address.")),
  ipUsageType: s.optional(s.string("The LeadBoxer usage classification for the IP address.")),
  searchIp: s.optional(s.string("The normalized IP address used for the lookup.")),
  searchResponseTimeMs: s.optional(s.integer("The lookup response time in milliseconds.")),
});

const organizationAddressSchema = s.looseRequiredObject("The organization address returned by LeadBoxer.", {
  organizationStreetName: s.optional(s.string("The organization's street address.")),
  organizationCity: s.optional(s.string("The organization's city.")),
  organizationState: s.optional(s.string("The organization's state or administrative region.")),
  organizationPostalCode: s.optional(s.string("The organization's postal code.")),
  organizationCountry: s.optional(s.string("The organization's country name.")),
  organizationCountryCode: s.optional(s.string("The organization's country code.")),
  organizationPhone: s.optional(s.string("The organization's phone number.")),
});

const organizationSocialLinksSchema = s.looseRequiredObject("The organization social links returned by LeadBoxer.", {
  organizationLinkedinUrl: s.optional(s.string("The organization's LinkedIn profile URL.")),
});

const domainLookupOutputSchema = s.looseRequiredObject("The organization enrichment details returned by LeadBoxer.", {
  organizationName: s.optional(s.string("The organization's display name.")),
  organizationType: s.optional(s.string("The organization's company type.")),
  organizationStatus: s.optional(s.string("The organization's operating status.")),
  organizationDomain: s.optional(s.string("The organization's primary domain.")),
  organizationDomainAliases: s.optional(
    s.array("The organization's known domain aliases.", s.string("A known organization domain alias.")),
  ),
  organizationIndustryCode: s.optional(s.string("The organization's industry code.")),
  organizationIndustryGroup: s.optional(s.string("The organization's broad industry group.")),
  organizationIndustryName: s.optional(s.string("The organization's industry name.")),
  organizationEmployeeCountRangeCode: s.optional(s.string("The code for the organization's employee-count range.")),
  organizationEmployeeCountRangeName: s.optional(s.string("The label for the organization's employee-count range.")),
  organizationSource: s.optional(s.string("The source used for the organization enrichment.")),
  organizationReportDate: s.optional(s.string("The date of the organization enrichment report.")),
  organizationDescription: s.optional(s.string("The organization's full description.")),
  organizationDescriptionShort: s.optional(s.string("The organization's short description.")),
  organizationSpecialties: s.optional(
    s.array("The organization's reported specialties.", s.string("An organization specialty.")),
  ),
  organizationAddress: s.optional(organizationAddressSchema),
  organizationSocialLinks: s.optional(organizationSocialLinksSchema),
});

export const leadboxerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "lookup_ip",
    description: "Enrich an IPv4 or IPv6 address with LeadBoxer organization, network, and geolocation data.",
    inputSchema: s.object(
      "The input payload for a LeadBoxer IP address lookup.",
      {
        ip: ipSchema,
        datasetId: datasetIdSchema,
      },
      { optional: ["datasetId"] },
    ),
    outputSchema: ipLookupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_domain",
    description: "Enrich a domain name with LeadBoxer organization and firmographic data.",
    inputSchema: s.object(
      "The input payload for a LeadBoxer domain lookup.",
      {
        domain: domainSchema,
        datasetId: datasetIdSchema,
      },
      { optional: ["datasetId"] },
    ),
    outputSchema: domainLookupOutputSchema,
  }),
];
