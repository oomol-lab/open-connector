import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "veille";
const veilleMxRecordSchema = s.looseObject(
  "One mx record returned by Veille.",
  {
    hostname: s.nullableString("Mail server hostname."),
    priority: s.nullableNumber("MX priority, lower is preferred."),
  },
  { optional: ["hostname", "priority"] },
);

const veilleDnsSchema = s.looseObject(
  "DNS health of the domain: MX, SPF and DMARC records.",
  {
    mx: s.nullableBoolean("Whether the domain has MX records."),
    spf: s.nullableString("SPF record of the domain."),
    spf_valid: s.nullableBoolean("Whether the SPF record is valid."),
    dmarc: s.nullableString("DMARC record of the domain."),
    dmarc_valid: s.nullableBoolean("Whether the DMARC record is valid."),
    mx_records: s.array("MX records of the domain.", veilleMxRecordSchema),
  },
  { optional: ["mx", "spf", "spf_valid", "dmarc", "dmarc_valid", "mx_records"] },
);

const veilleAsnSchema = s.looseObject(
  "Network that owns the address.",
  {
    asn: s.nullableNumber("Autonomous system number."),
    org: s.nullableString("Organization that owns the network."),
    type: s.nullableString("Network type, such as hosting, isp or business."),
    route: s.nullableString("IP range announced for the network."),
    domain: s.nullableString("Domain of the network owner."),
    country: s.nullableString("Country code of the network owner."),
    abuse: s.nullableString("Abuse contact email of the network."),
    active: s.nullableBoolean("Whether the network is active."),
  },
  { optional: ["asn", "org", "type", "route", "domain", "country", "abuse", "active"] },
);

const veilleIpLocationSchema = s.looseObject(
  "Geolocation of the address.",
  {
    city: s.nullableString("City."),
    state: s.nullableString("State or region."),
    country: s.nullableString("Country name."),
    country_code: s.nullableString("ISO 3166-1 alpha-2 country code."),
    continent: s.nullableString("Continent code."),
    zip: s.nullableString("Postal code."),
    latitude: s.nullableNumber("Latitude."),
    longitude: s.nullableNumber("Longitude."),
    timezone: s.nullableString("IANA time zone."),
    is_eu_member: s.nullableBoolean("Whether the country is a member of the European Union."),
    currency_code: s.nullableString("ISO 4217 code of the local currency."),
  },
  {
    optional: [
      "city",
      "state",
      "country",
      "country_code",
      "continent",
      "zip",
      "latitude",
      "longitude",
      "timezone",
      "is_eu_member",
      "currency_code",
    ],
  },
);

const veilleWhoisSchema = s.looseObject(
  "Registration dates and registrar.",
  {
    registrar: s.nullableString("Registrar of the domain."),
    creation_date: s.nullableString("Date the domain was registered."),
    updated_date: s.nullableString("Date the registration was last updated."),
    expiration_date: s.nullableString("Date the registration expires."),
  },
  { optional: ["registrar", "creation_date", "updated_date", "expiration_date"] },
);

export const veilleActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "verify_email",
    operationType: "read",
    description:
      "Verify that an email address can receive mail with an SMTP inbox test and catch-all detection, and get a verdict with a 0-100 risk score.",
    inputSchema: s.actionInput(
      {
        email: s.nonEmptyString('The email address to check (e.g., "jane@company.com").'),
      },
      ["email"],
      "Input for Verify Email.",
    ),
    outputSchema: s.looseObject(
      "The Veille response for Verify Email.",
      {
        qualification: s.nullableString("Verdict: valid, invalid, risky, disposable or unknown."),
        smtp_valid: s.nullableBoolean("Whether the inbox accepted mail in the SMTP test."),
        email: s.nullableString("The email address that was checked."),
        normalized_email: s.nullableString("The address in lowercase, as checked."),
        domain: s.nullableString("Domain of the address."),
        risk_score: s.nullableNumber("Risk score from 0 (safe) to 100 (risky)."),
        disposable: s.nullableBoolean("Whether the address uses a disposable or temporary inbox."),
        role_account: s.nullableBoolean("Whether the address is a role account, such as contact@ or support@."),
        role_type: s.nullableString("Role of a role account, such as contact or support."),
        public_domain: s.nullableBoolean("Whether the domain is a public webmail provider."),
        relay_domain: s.nullableBoolean("Whether the domain is an email relay or forwarding service."),
        is_alias: s.nullableBoolean("Whether the address is an alias, such as a plus address."),
        education: s.nullableBoolean("Whether the domain belongs to an education institution."),
        has_gravatar: s.nullableBoolean("Whether the address has a Gravatar profile."),
        dns: veilleDnsSchema,
      },
      {
        optional: [
          "qualification",
          "smtp_valid",
          "email",
          "normalized_email",
          "domain",
          "risk_score",
          "disposable",
          "role_account",
          "role_type",
          "public_domain",
          "relay_domain",
          "is_alias",
          "education",
          "has_gravatar",
          "dns",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "check_email",
    operationType: "read",
    description:
      "Check an email address without an SMTP test: disposable or temporary inbox, role account, public webmail, relay or alias, DNS health and a 0-100 risk score.",
    inputSchema: s.actionInput(
      {
        email: s.nonEmptyString('The email address to check (e.g., "jane@company.com").'),
      },
      ["email"],
      "Input for Check Email.",
    ),
    outputSchema: s.looseObject(
      "The Veille response for Check Email.",
      {
        email: s.nullableString("The email address that was checked."),
        normalized_email: s.nullableString("The address in lowercase, as checked."),
        domain: s.nullableString("Domain of the address."),
        risk_score: s.nullableNumber("Risk score from 0 (safe) to 100 (risky)."),
        disposable: s.nullableBoolean("Whether the address uses a disposable or temporary inbox."),
        role_account: s.nullableBoolean("Whether the address is a role account, such as contact@ or support@."),
        role_type: s.nullableString("Role of a role account, such as contact or support."),
        public_domain: s.nullableBoolean("Whether the domain is a public webmail provider."),
        relay_domain: s.nullableBoolean("Whether the domain is an email relay or forwarding service."),
        is_alias: s.nullableBoolean("Whether the address is an alias, such as a plus address."),
        education: s.nullableBoolean("Whether the domain belongs to an education institution."),
        has_gravatar: s.nullableBoolean("Whether the address has a Gravatar profile."),
        dns: veilleDnsSchema,
      },
      {
        optional: [
          "email",
          "normalized_email",
          "domain",
          "risk_score",
          "disposable",
          "role_account",
          "role_type",
          "public_domain",
          "relay_domain",
          "is_alias",
          "education",
          "has_gravatar",
          "dns",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "validate_phone",
    operationType: "read",
    description:
      "Validate a phone number in E.164 format and get its line type, carrier, country, time zones, virtual or disposable flags and a 0-100 risk score.",
    inputSchema: s.actionInput(
      {
        phone: s.nonEmptyString('The phone number in E.164 format, starting with + (e.g., "+33142928100").'),
      },
      ["phone"],
      "Input for Validate Phone.",
    ),
    outputSchema: s.looseObject(
      "The Veille response for Validate Phone.",
      {
        is_valid: s.nullableBoolean("Whether the number is valid."),
        e164_format: s.nullableString("The number in E.164 format."),
        international_format: s.nullableString("The number in international format."),
        national_format: s.nullableString("The number in national format."),
        line_type: s.nullableString("Line type, such as mobile, fixed_line or voip."),
        carrier: s.nullableString("Carrier of the number."),
        carrier_type: s.nullableString("Carrier type."),
        country: s.nullableString("ISO 3166-1 alpha-2 country code of the number."),
        country_name: s.nullableString("Country of the number."),
        country_code: s.nullableString("International calling code, without +."),
        location: s.nullableString("City or region the number is registered to."),
        timezones: s.array("Time zones of the number.", s.string()),
        is_virtual: s.nullableBoolean("Whether the number is virtual."),
        is_disposable: s.nullableBoolean("Whether the number is a disposable number."),
        is_spam: s.nullableBoolean("Whether the number is reported for spam."),
        is_threat: s.nullableBoolean("Whether the number is reported as a threat."),
        risk_score: s.nullableNumber("Risk score from 0 (safe) to 100 (risky)."),
      },
      {
        optional: [
          "is_valid",
          "e164_format",
          "international_format",
          "national_format",
          "line_type",
          "carrier",
          "carrier_type",
          "country",
          "country_name",
          "country_code",
          "location",
          "timezones",
          "is_virtual",
          "is_disposable",
          "is_spam",
          "is_threat",
          "risk_score",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "check_ip",
    operationType: "read",
    description:
      "Check an IPv4 or IPv6 address for VPN, proxy, Tor exit, datacenter, abuse and crawler traffic, with its network owner, location and a 0-100 threat score.",
    inputSchema: s.actionInput(
      {
        ip: s.nonEmptyString('The IPv4 or IPv6 address (e.g., "8.8.8.8").'),
      },
      ["ip"],
      "Input for Check IP.",
    ),
    outputSchema: s.looseObject(
      "The Veille response for Check IP.",
      {
        ip: s.nullableString("The IP address that was checked."),
        threat_score: s.nullableNumber("Threat score from 0 (safe) to 100 (risky)."),
        is_vpn: s.nullableBoolean("Whether the address belongs to a VPN."),
        is_proxy: s.nullableBoolean("Whether the address is a proxy."),
        is_tor: s.nullableBoolean("Whether the address is a Tor exit node."),
        is_datacenter: s.nullableBoolean("Whether the address belongs to a datacenter or hosting provider."),
        is_abuser: s.nullableBoolean("Whether the address is reported for abuse."),
        is_crawler: s.nullableBoolean("Whether the address belongs to a known crawler."),
        is_mobile: s.nullableBoolean("Whether the address belongs to a mobile network."),
        is_bogon: s.nullableBoolean("Whether the address is a bogon (reserved or unassigned) address."),
        asn: veilleAsnSchema,
        location: veilleIpLocationSchema,
      },
      {
        optional: [
          "ip",
          "threat_score",
          "is_vpn",
          "is_proxy",
          "is_tor",
          "is_datacenter",
          "is_abuser",
          "is_crawler",
          "is_mobile",
          "is_bogon",
          "asn",
          "location",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "check_domain",
    operationType: "read",
    description:
      "Check whether a domain hosts disposable, public webmail, relay or education email, with its DNS health, WHOIS dates and age.",
    inputSchema: s.actionInput(
      {
        domain: s.nonEmptyString('A domain, URL or email address; the domain is extracted (e.g., "mailinator.com").'),
      },
      ["domain"],
      "Input for Check Domain.",
    ),
    outputSchema: s.looseObject(
      "The Veille response for Check Domain.",
      {
        domain: s.nullableString("The domain that was checked."),
        disposable: s.nullableBoolean("Whether the domain provides disposable or temporary inboxes."),
        public_domain: s.nullableBoolean("Whether the domain is a public webmail provider."),
        relay_domain: s.nullableBoolean("Whether the domain is an email relay or forwarding service."),
        education: s.nullableBoolean("Whether the domain belongs to an education institution."),
        is_subdomain: s.nullableBoolean("Whether the domain is a subdomain."),
        domain_age_days: s.nullableNumber("Age of the domain in days."),
        tags: s.array("Labels for the domain, such as disposable.", s.string()),
        sources: s.array("Lists that report the domain.", s.string()),
        first_seen: s.nullableString("When Veille first saw the domain."),
        last_seen: s.nullableString("When Veille last saw the domain."),
        whois: veilleWhoisSchema,
        dns: veilleDnsSchema,
      },
      {
        optional: [
          "domain",
          "disposable",
          "public_domain",
          "relay_domain",
          "education",
          "is_subdomain",
          "domain_age_days",
          "tags",
          "sources",
          "first_seen",
          "last_seen",
          "whois",
          "dns",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "verify_vat",
    operationType: "read",
    description:
      "Check an EU VAT number against VIES and get whether it is valid, with the registered company name and address when the member state shares them.",
    inputSchema: s.actionInput(
      {
        vatNumber: s.nonEmptyString('The VAT number with its country prefix (e.g., "FR40303265045").'),
      },
      ["vatNumber"],
      "Input for Verify VAT Number.",
    ),
    outputSchema: s.looseObject(
      "The Veille response for Verify VAT Number.",
      {
        valid: s.nullableBoolean("Whether the number is valid."),
        vat_number: s.nullableString("The VAT number without its country prefix."),
        country_code: s.nullableString("Country code of the number."),
        company_name: s.nullableString("Registered company name, when the member state shares it."),
        company_address: s.nullableString("Registered company address, when the member state shares it."),
      },
      { optional: ["valid", "vat_number", "country_code", "company_name", "company_address"] },
    ),
  }),
  defineProviderAction(service, {
    name: "validate_iban",
    operationType: "read",
    description:
      "Check an IBAN's structure and checksum and get its bank name, BIC, bank and branch codes, country and SEPA membership.",
    inputSchema: s.actionInput(
      {
        iban: s.nonEmptyString('The IBAN, with or without spaces (e.g., "FR7630006000011234567890189").'),
      },
      ["iban"],
      "Input for Validate IBAN.",
    ),
    outputSchema: s.looseObject(
      "The Veille response for Validate IBAN.",
      {
        valid: s.nullableBoolean("Whether the IBAN is valid."),
        iban: s.nullableString("The IBAN without spaces."),
        bic: s.nullableString("BIC of the bank."),
        bank_name: s.nullableString("Name of the bank."),
        bank_code: s.nullableString("Bank code."),
        branch_code: s.nullableString("Branch code."),
        account_number: s.nullableString("Account number."),
        bban: s.nullableString("Basic bank account number."),
        checksum_digits: s.nullableString("Checksum digits."),
        country_code: s.nullableString("Country code of the IBAN."),
        country_name: s.nullableString("Country of the IBAN."),
        in_sepa_zone: s.nullableBoolean("Whether the country is in the SEPA zone."),
      },
      {
        optional: [
          "valid",
          "iban",
          "bic",
          "bank_name",
          "bank_code",
          "branch_code",
          "account_number",
          "bban",
          "checksum_digits",
          "country_code",
          "country_name",
          "in_sepa_zone",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_exchange_rates",
    operationType: "read",
    description:
      "Get the European Central Bank's daily exchange rates for a base currency, optionally limited to some target currencies.",
    inputSchema: s.actionInput(
      {
        base: s.nonEmptyString('ISO 4217 code of the base currency; defaults to EUR (e.g., "USD").'),
        symbols: s.nonEmptyString('Comma-separated ISO 4217 codes to keep (e.g., "EUR,GBP").'),
      },
      [],
      "Input for Get Exchange Rates.",
    ),
    outputSchema: s.looseObject(
      "The Veille response for Get Exchange Rates.",
      {
        base: s.nullableString("Base currency of the rates."),
        date: s.nullableString("Date of the rates (YYYY-MM-DD)."),
        rates: s.unknownObject("Rates keyed by ISO 4217 currency code, for one unit of the base currency."),
      },
      { optional: ["base", "date", "rates"] },
    ),
  }),
];
