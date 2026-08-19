import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ip2location";

const translationLanguages = [
  "ar",
  "cs",
  "da",
  "de",
  "en",
  "es",
  "et",
  "fi",
  "fr",
  "ga",
  "it",
  "ja",
  "ko",
  "ms",
  "nl",
  "pt",
  "ru",
  "sv",
  "tr",
  "vi",
  "zh-cn",
  "zh-tw",
];

function ipv4OrIpv6(description: string) {
  return s.anyOf(description, [s.string({ format: "ipv4", description }), s.string({ format: "ipv6", description })]);
}

const ipInputSchema = s.object(
  "The input payload for one IP geolocation lookup.",
  {
    ip: ipv4OrIpv6("The IPv4 or IPv6 address to query."),
    lang: s.stringEnum(
      "The IP2Location-supported language code for translated place names, including regional variants such as zh-cn and zh-tw.",
      translationLanguages,
    ),
  },
  { optional: ["lang"] },
);

const domainInputSchema = s.object("The input payload for one domain WHOIS lookup.", {
  domain: s.nonEmptyString("The domain name to query."),
});

const hostedDomainsInputSchema = s.object(
  "The input payload for one hosted domains lookup.",
  {
    ip: ipv4OrIpv6("The IPv4 or IPv6 address to query."),
    page: s.integer("The 1-based result page to fetch.", { minimum: 1 }),
  },
  { optional: ["page"] },
);

const contactSchema = s.looseObject("One WHOIS contact object returned by IP2WHOIS.", {
  name: s.string("The contact name returned by the WHOIS record."),
  organization: s.string("The organization name returned by the WHOIS record."),
  street_address: s.string("The street address returned by the WHOIS record."),
  city: s.string("The city returned by the WHOIS record."),
  region: s.string("The region, state, or province returned by the WHOIS record."),
  zip_code: s.string("The postal code returned by the WHOIS record."),
  country: s.string("The country code returned by the WHOIS record."),
  phone: s.string("The phone number returned by the WHOIS record."),
  fax: s.string("The fax number returned by the WHOIS record."),
  email: s.string("The email address returned by the WHOIS record."),
});

const registrarSchema = s.looseObject("Registrar details returned by IP2WHOIS.", {
  iana_id: s.string("The registrar IANA identifier returned by IP2WHOIS."),
  name: s.string("The registrar name returned by IP2WHOIS."),
  url: s.string("The registrar website URL returned by IP2WHOIS."),
});

const ipGeolocationOutputSchema = s.looseObject("The IP geolocation payload returned by IP2Location.io.", {
  ip: s.string("The queried IP address."),
  country_code: s.string("The ISO 3166-1 alpha-2 country code."),
  country_name: s.string("The country name."),
  region_name: s.string("The region or state name."),
  city_name: s.string("The city name."),
  latitude: s.number("The latitude coordinate."),
  longitude: s.number("The longitude coordinate."),
  zip_code: s.string("The postal or ZIP code."),
  time_zone: s.string("The UTC offset returned by IP2Location.io."),
  asn: s.string("The autonomous system number."),
  as: s.string("The autonomous system name."),
  isp: s.string("The internet service provider name."),
  domain: s.string("The primary domain associated with the IP."),
  net_speed: s.string("The connection speed category returned by IP2Location.io."),
  idd_code: s.string("The international direct dialing code."),
  area_code: s.string("The local area code."),
  weather_station_code: s.string("The weather station code."),
  weather_station_name: s.string("The weather station name."),
  elevation: s.number("The elevation in meters."),
  usage_type: s.string("The IP usage type returned by IP2Location.io."),
  is_proxy: s.boolean("Whether the IP address is identified as a proxy."),
});

const domainWhoisOutputSchema = s.looseObject("The domain WHOIS payload returned by IP2WHOIS.", {
  domain: s.string("The queried domain name."),
  domain_id: s.string("The registry identifier returned by IP2WHOIS."),
  status: s.anyOf("The domain status or statuses returned by IP2WHOIS.", [
    s.string("One domain status string returned by IP2WHOIS."),
    s.array("The domain statuses returned by IP2WHOIS.", s.string("One domain status string returned by IP2WHOIS.")),
  ]),
  create_date: s.string("The domain creation timestamp."),
  update_date: s.string("The domain update timestamp."),
  expire_date: s.string("The domain expiration timestamp."),
  domain_age: s.integer("The age of the domain in days."),
  whois_server: s.string("The WHOIS server hostname."),
  registrar: registrarSchema,
  registrant: contactSchema,
  admin: contactSchema,
  tech: contactSchema,
  billing: contactSchema,
  nameservers: s.array(
    "The authoritative nameservers for the domain.",
    s.string("One authoritative nameserver hostname."),
  ),
});

const hostedDomainsOutputSchema = s.object("The hosted domains lookup payload returned by IP2WHOIS.", {
  ip: s.nonEmptyString("The queried IP address."),
  total_domains: s.integer("The total number of hosted domains."),
  page: s.integer("The current result page."),
  per_page: s.integer("The number of domains returned per page."),
  total_pages: s.integer("The total number of result pages."),
  domains: s.array("The hosted domain names returned for the queried IP.", s.string("One hosted domain name.")),
});

export const ip2locationActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_ip_geolocation",
    description: "Retrieve geolocation and network metadata for one IPv4 or IPv6 address.",
    inputSchema: ipInputSchema,
    outputSchema: ipGeolocationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_domain_whois",
    description: "Retrieve WHOIS registration details for one domain.",
    inputSchema: domainInputSchema,
    outputSchema: domainWhoisOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_hosted_domains",
    description: "List the hosted domains associated with one IPv4 or IPv6 address.",
    inputSchema: hostedDomainsInputSchema,
    outputSchema: hostedDomainsOutputSchema,
  }),
];
