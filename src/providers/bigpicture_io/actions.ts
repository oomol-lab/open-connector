import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bigpicture_io";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const ipInputSchema = s.anyOf("The IPv4 or IPv6 address to look up.", [
  s.string({ description: "An IPv4 address.", format: "ipv4" }),
  s.string({ description: "An IPv6 address.", format: "ipv6" }),
]);
const nullableString = (description: string) => s.nullable(s.string(description));
const nullableNumber = (description: string) => s.nullable(s.number(description));
const nullableBoolean = (description: string) => s.nullable(s.boolean(description));
const companySchema = s.looseObject("A BigPicture company profile.", {
  id: nullableString("The BigPicture company identifier."),
  domain: nullableString("The company's primary domain."),
  name: nullableString("The company display name."),
  legalName: nullableString("The company's legal name."),
  logo: nullableString("The URL for the company logo."),
  url: nullableString("The company website URL."),
  tags: s.nullable(s.array("The descriptive tags assigned to the company.", s.string("One company tag."))),
  description: nullableString("The best description BigPicture has for the company."),
  category: nullableString("The company category returned by BigPicture."),
  type: nullableString("The company type returned by BigPicture."),
  ticker: nullableString("The public stock ticker when available."),
  exchange: nullableString("The public stock exchange when available."),
  employees: s.unknown("The employee count or employee range value returned by BigPicture."),
  foundedYear: s.unknown("The year the company was founded."),
  indexedAt: nullableString("The timestamp when BigPicture indexed the company profile."),
});
const companyOutputSchema = s.actionOutput(
  {
    company: companySchema,
  },
  "Output payload for a BigPicture domain company lookup.",
);
const geoSchema = s.looseObject("Geographic details BigPicture associates with the IP address.", {
  city: nullableString("The city where the IP address is located."),
  state: nullableString("The state or region where the IP address is located."),
  stateCode: nullableString("The state or region code for the IP address."),
  country: nullableString("The country where the IP address is located."),
  countryCode: nullableString("The country code for the IP address."),
  continent: nullableString("The continent where the IP address is located."),
  continentCode: nullableString("The continent code for the IP address."),
  isEU: nullableBoolean("Whether the IP address is located in the European Union."),
});
const whoisSchema = s.looseObject("WHOIS ownership details BigPicture associates with the IP.", {
  domain: nullableString("The domain associated with the WHOIS record."),
  name: nullableString("The organization name associated with the WHOIS record."),
});
const asnSchema = s.looseObject("ASN details BigPicture associates with the IP.", {
  asn: nullableString("The autonomous system number."),
  name: nullableString("The organization name associated with the ASN record."),
  route: nullableString("The subnet route for the ASN record."),
});
const ipLookupOutputSchema = s.looseObject("Output payload for a BigPicture IP-to-company lookup.", {
  ip: s.string("The IP address that was requested."),
  type: nullableString("The result type, such as business, ISP, or hosting."),
  fuzzy: nullableBoolean("Whether the company match is fuzzy."),
  confidence: nullableNumber("The confidence score of the matched company on a scale from 0 to 1."),
  geo: geoSchema,
  company: companySchema,
  whois: whoisSchema,
  asn: asnSchema,
});

export type BigpictureIoActionName = "find_company_by_domain" | "find_company_by_ip";

export const bigpictureIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "find_company_by_domain",
    description: "Look up a BigPicture company profile by domain name.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        domain: nonEmptyString("The company domain to look up, such as `example.com`, without a URL scheme."),
      },
      ["domain"],
      "Input payload for looking up a company by domain.",
    ),
    outputSchema: companyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "find_company_by_ip",
    description: "Look up the company associated with an IPv4 or IPv6 address using BigPicture.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        ip: ipInputSchema,
      },
      ["ip"],
      "Input payload for looking up a company by IP address.",
    ),
    outputSchema: ipLookupOutputSchema,
  }),
];
