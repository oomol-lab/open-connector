import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "neutrino";

function requiredString(description: string): JsonSchema {
  return s.string(description, { minLength: 1 });
}

function outputObject(description: string, properties: Record<string, JsonSchema>): JsonSchema {
  return s.object(description, properties, {
    optional: Object.keys(properties),
    additionalProperties: true,
  });
}

const countryCodeSchema = s.string("An ISO 3166-1 alpha-2 country code.", {
  minLength: 2,
  maxLength: 2,
});

const timezoneSchema = outputObject("Timezone details returned by Neutrino.", {
  id: s.string("The IANA timezone ID, or an empty string if no valid timezone was detected."),
  name: s.string("The full timezone name."),
  abbr: s.string("The timezone abbreviation."),
  date: s.string("The current date in the timezone as YYYY-MM-DD."),
  time: s.string("The current time in the timezone."),
  offset: s.string("The UTC offset for the timezone in ISO 8601 format."),
});

const blocklistSensorSchema = outputObject("A Neutrino blocklist sensor entry.", {
  id: s.integer("The permanent unique sensor ID."),
  blocklist: s.string("The primary blocklist category this sensor belongs to."),
  description: s.string("Details about the sensor source and malicious activity type."),
});

const validateEmailInputSchema = s.object(
  "Input parameters for Neutrino email validation.",
  {
    email: requiredString("The email address to parse, validate, and clean."),
    "fix-typos": s.boolean("Whether to automatically attempt to fix typos in the address."),
  },
  { required: ["email"], optional: ["fix-typos"] },
);

const validateEmailOutputSchema = outputObject("Email validation result returned by Neutrino.", {
  valid: s.boolean(
    "Whether the email has valid syntax, an active domain, correct DNS records, and operational MX servers.",
  ),
  email: s.string("The complete email address, corrected when typo fixing is enabled."),
  domain: s.string("The domain name of the email address."),
  provider: s.string("The domain name of the email hosting provider."),
  "mx-ip": s.string("The first resolved IP address of the primary MX server, or an empty string."),
  "is-freemail": s.boolean("Whether the address is from a free email provider."),
  "is-disposable": s.boolean("Whether the address is from a disposable, temporary, or darknet email service."),
  "is-personal": s.boolean("Whether the address likely belongs to a person."),
  "typos-fixed": s.boolean("Whether any typos were fixed."),
  "syntax-error": s.boolean("Whether the address has RFC syntax errors."),
  "domain-error": s.boolean("Whether the address has domain name or DNS errors."),
  "domain-status": s.string("The email domain status returned by Neutrino."),
});

const validatePhoneInputSchema = s.object(
  "Input parameters for Neutrino phone validation.",
  {
    number: requiredString("The phone number in international or local format."),
    "country-code": countryCodeSchema,
    ip: s.string("A user IP address used to infer the country for local numbers."),
  },
  { required: ["number"], optional: ["country-code", "ip"] },
);

const validatePhoneOutputSchema = outputObject("Phone validation result returned by Neutrino.", {
  valid: s.boolean("Whether this is a valid phone number."),
  type: s.string("The number type based on the number prefix."),
  "international-calling-code": s.string("The international calling code."),
  "international-number": s.string("The number represented in E.164 format."),
  "local-number": s.string("The number represented in local dialing format."),
  location: s.string("The phone number location."),
  country: s.string("The phone number country."),
  "country-code": s.string("The phone number country as an ISO 2-letter country code."),
  "country-code3": s.string("The phone number country as an ISO 3-letter country code."),
  "currency-code": s.string("The ISO 4217 currency code associated with the country."),
  "is-mobile": s.boolean("Whether this is a mobile number."),
  "prefix-network": s.string("The network or carrier that owns the prefix when available."),
});

const getIpInfoInputSchema = s.object(
  "Input parameters for Neutrino IP info lookup.",
  {
    ip: requiredString("An IPv4 or IPv6 address. CIDR notation is also accepted by Neutrino."),
    "reverse-lookup": s.boolean("Whether to run a reverse DNS PTR lookup."),
  },
  { required: ["ip"], optional: ["reverse-lookup"] },
);

const getIpInfoOutputSchema = outputObject("IP geolocation payload returned by Neutrino.", {
  ip: s.string("The IPv4 or IPv6 address returned."),
  valid: s.boolean("Whether this is a valid IPv4 or IPv6 address."),
  "is-v6": s.boolean("Whether this is an IPv6 address."),
  "is-v4-mapped": s.boolean("Whether this is an IPv4-mapped IPv6 address."),
  "is-bogon": s.boolean("Whether this is a bogon, private, local, or reserved IP address."),
  country: s.string("The full country name."),
  "country-code": s.string("The ISO 2-letter country code."),
  "country-code3": s.string("The ISO 3-letter country code."),
  "continent-code": s.string("The ISO 2-letter continent code."),
  "currency-code": s.string("The ISO 4217 currency code associated with the country."),
  city: s.string("The city name when detectable."),
  region: s.string("The region name when detectable."),
  "region-code": s.string("The ISO 3166-2 region code when detectable."),
  "language-code": s.string("The ISO 2-letter official language code for the country."),
  longitude: s.number("The location longitude."),
  latitude: s.number("The location latitude."),
  hostname: s.string("The full hostname when reverse lookup is enabled."),
  "host-domain": s.string("The host domain when reverse lookup is enabled."),
  timezone: timezoneSchema,
});

const lookupDomainInputSchema = s.object(
  "Input parameters for Neutrino domain lookup.",
  {
    host: requiredString("A domain name, hostname, FQDN, URL, HTML link, or email address."),
    live: s.boolean("Whether to perform live checks for domains Neutrino has not seen before."),
  },
  { required: ["host"], optional: ["live"] },
);

const lookupDomainOutputSchema = outputObject("Domain intelligence payload returned by Neutrino.", {
  domain: s.string("The primary domain name excluding subdomains."),
  valid: s.boolean("Whether a valid registered domain with DNS NS records was found."),
  fqdn: s.string("The fully qualified domain name."),
  "is-subdomain": s.boolean("Whether the FQDN is a subdomain of the primary domain."),
  tld: s.string("The top-level domain."),
  "tld-cc": s.string("The associated ISO 2-letter country code for country-code TLDs."),
  rank: s.integer("The estimated global traffic rank, or 0 when outside the top one million."),
  "is-gov": s.boolean("Whether this domain is under a government or military TLD."),
  "is-opennic": s.boolean("Whether this domain is under an OpenNIC TLD."),
  "is-pending": s.boolean("Whether this unseen domain is still being processed."),
  "is-adult": s.boolean("Whether the domain hosts adult content."),
  "is-malicious": s.boolean("Whether the domain is listed on at least one blocklist."),
  blocklists: s.array("Blocklist categories this domain is listed on.", s.string("A category.")),
  sensors: s.array("Blocklist sensors that detected this domain.", blocklistSensorSchema),
  "registered-date": s.string("The ISO registration or first-seen date, or an empty string."),
  age: s.integer("The number of days since the domain was registered."),
  "registrar-name": s.string("The domain registrar name."),
  "registrar-id": s.integer("The IANA registrar ID, or 0 when unavailable."),
  "dns-provider": s.string("The primary DNS provider domain."),
  "mail-provider": s.string("The primary email provider domain, or an empty string."),
  "expiry-date": s.string("The ISO expiry date, or an empty string."),
  "mail-status": s.string("The domain mail configuration status."),
  "website-status": s.string("The domain website configuration status."),
  "website-provider": s.string("The primary website hosting provider domain, or an empty string."),
});

const checkIpBlocklistInputSchema = s.object(
  "Input parameters for Neutrino IP blocklist lookup.",
  {
    ip: requiredString(
      "An IPv4 or IPv6 address. CIDR notation, port numbers, and comma-separated IPs are also accepted by Neutrino.",
    ),
    "vpn-lookup": s.boolean("Whether to include public VPN provider IP addresses."),
  },
  { required: ["ip"], optional: ["vpn-lookup"] },
);

const checkIpBlocklistOutputSchema = outputObject("IP blocklist payload returned by Neutrino.", {
  ip: s.string("The IP address that was checked."),
  "is-bot": s.boolean("Whether the IP hosts a malicious bot or botnet member."),
  "is-exploit-bot": s.boolean("Whether the IP is running exploit scanning software."),
  "is-malware": s.boolean("Whether the IP is involved in distributing or running malware."),
  "is-spider": s.boolean("Whether the IP is running a hostile web spider."),
  "is-dshield": s.boolean("Whether DShield flagged the IP as a significant attack source."),
  "list-count": s.integer("The number of blocklists the IP is listed on."),
  "is-proxy": s.boolean("Whether the IP is an anonymous web proxy."),
  "is-hijacked": s.boolean("Whether the IP is part of a hijacked netblock."),
  "is-tor": s.boolean("Whether the IP is a Tor node or related service."),
  "is-spyware": s.boolean("Whether the IP is involved in distributing or running spyware."),
  "is-spam-bot": s.boolean("Whether the IP hosts spam bot software."),
  "is-listed": s.boolean("Whether the IP is listed on any blocklist."),
  "is-vpn": s.boolean("Whether the IP belongs to a public VPN provider."),
  "last-seen": s.integer("The Unix time when this IP was last seen on any blocklist."),
  blocklists: s.array("Blocklist categories this IP is listed on.", s.string("A category.")),
  sensors: s.array("Sensors that detected this IP.", blocklistSensorSchema),
  cidr: s.string("The CIDR address for this listing when listed."),
});

export const neutrinoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "validate_email",
    operationType: "read",
    description: "Parse, validate, and clean an email address with Neutrino.",
    inputSchema: validateEmailInputSchema,
    outputSchema: validateEmailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "validate_phone",
    operationType: "read",
    description: "Parse, validate, format, and locate a phone number with Neutrino.",
    inputSchema: validatePhoneInputSchema,
    outputSchema: validatePhoneOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_ip_info",
    operationType: "read",
    description: "Get Neutrino geolocation and reverse-DNS details for an IP address.",
    inputSchema: getIpInfoInputSchema,
    outputSchema: getIpInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_domain",
    operationType: "read",
    description: "Get Neutrino domain registration, DNS, mail, website, and blocklist details.",
    inputSchema: lookupDomainInputSchema,
    outputSchema: lookupDomainOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_ip_blocklist",
    operationType: "read",
    description: "Check whether an IP address is listed on Neutrino security blocklists.",
    inputSchema: checkIpBlocklistInputSchema,
    outputSchema: checkIpBlocklistOutputSchema,
  }),
];

export type NeutrinoActionName =
  | "validate_email"
  | "validate_phone"
  | "get_ip_info"
  | "lookup_domain"
  | "check_ip_blocklist";
