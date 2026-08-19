import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ipqualityscore";

const strictnessSchema = s.integer(
  "How strict IPQS should be when scoring the lookup. Higher values may increase false positives.",
  { minimum: 0, maximum: 3 },
);
const urlStrictnessSchema = s.integer(
  "How strict IPQS should be when scanning the URL. Higher values may increase false positives.",
  { minimum: 0, maximum: 2 },
);
const timeoutSchema = s.integer("Maximum number of seconds IPQS should spend on mail service provider checks.", {
  minimum: 1,
  maximum: 60,
});
const fraudScoreSchema = s.integer("The risk score returned by IPQS from 0 to 100.", {
  minimum: 0,
  maximum: 100,
});

const ipInputSchema = s.object(
  "Input for checking IP address reputation with IPQualityScore.",
  {
    ipAddress: s.nonEmptyString("The IPv4 or IPv6 address to inspect."),
    strictness: strictnessSchema,
    allowPublicAccessPoints: s.boolean(
      "Whether to reduce risk flags for public access points such as schools or libraries.",
    ),
    userAgent: s.nonEmptyString("The user agent associated with the IP lookup."),
    userLanguage: s.nonEmptyString("The browser language associated with the IP lookup."),
  },
  { optional: ["strictness", "allowPublicAccessPoints", "userAgent", "userLanguage"] },
);
const ipOutputSchema = s.looseRequiredObject(
  "IP reputation result returned by IPQualityScore.",
  {
    success: s.boolean("Whether IPQS completed the IP reputation lookup successfully."),
    message: s.string("Human-readable status message returned by IPQS."),
    fraud_score: fraudScoreSchema,
    country_code: s.nullableString("The two-letter country code associated with the IP."),
    region: s.nullableString("The region associated with the IP."),
    city: s.nullableString("The city associated with the IP."),
    ISP: s.nullableString("The internet service provider associated with the IP."),
    ASN: s.nullableInteger("The autonomous system number associated with the IP."),
    organization: s.nullableString("The organization associated with the IP."),
    is_crawler: s.boolean("Whether IPQS identified the IP as a crawler."),
    timezone: s.nullableString("The timezone associated with the IP."),
    mobile: s.boolean("Whether the IP appears to belong to a mobile connection."),
    host: s.nullableString("The host associated with the IP."),
    proxy: s.boolean("Whether IPQS identified the IP as a proxy."),
    vpn: s.boolean("Whether IPQS identified the IP as a VPN."),
    tor: s.boolean("Whether IPQS identified the IP as Tor."),
    active_vpn: s.boolean("Whether IPQS identified an active VPN connection."),
    active_tor: s.boolean("Whether IPQS identified an active Tor connection."),
    recent_abuse: s.boolean("Whether IPQS has seen recent abuse from the IP."),
    bot_status: s.boolean("Whether IPQS identified bot behavior for the IP."),
    connection_type: s.nullableString("The connection type associated with the IP."),
    abuse_velocity: s.nullableString("The recent abuse velocity associated with the IP."),
    request_id: s.string("The IPQS request identifier for support and tracing."),
  },
  {
    optional: [
      "country_code",
      "region",
      "city",
      "ISP",
      "ASN",
      "organization",
      "is_crawler",
      "timezone",
      "mobile",
      "host",
      "proxy",
      "vpn",
      "tor",
      "active_vpn",
      "active_tor",
      "recent_abuse",
      "bot_status",
      "connection_type",
      "abuse_velocity",
      "request_id",
    ],
  },
);
const emailInputSchema = s.object(
  "Input for validating an email address with IPQualityScore.",
  {
    email: s.email("The email address to validate."),
    timeout: timeoutSchema,
    abuseStrictness: strictnessSchema,
  },
  { optional: ["timeout", "abuseStrictness"] },
);
const emailOutputSchema = s.looseRequiredObject(
  "Email validation result returned by IPQualityScore.",
  {
    success: s.boolean("Whether IPQS completed the email validation lookup successfully."),
    message: s.string("Human-readable status message returned by IPQS."),
    valid: s.boolean("Whether IPQS considers the email address valid."),
    disposable: s.boolean("Whether the email address belongs to a disposable email provider."),
    smtp_score: s.nullableInteger("The SMTP deliverability score returned by IPQS."),
    overall_score: s.nullableInteger("The overall email quality score returned by IPQS."),
    first_name: s.nullableString("The first name inferred by IPQS, when available."),
    generic: s.boolean("Whether IPQS considers the email address generic."),
    common: s.boolean("Whether the email address is commonly used."),
    dns_valid: s.boolean("Whether DNS records for the email domain are valid."),
    honeypot: s.boolean("Whether IPQS identified the email as a honeypot."),
    deliverability: s.nullableString("The deliverability classification returned by IPQS."),
    frequent_complainer: s.boolean("Whether the email is associated with frequent complaints."),
    spam_trap_score: s.nullableString("The spam trap score returned by IPQS."),
    catch_all: s.boolean("Whether the email domain accepts all mailbox names."),
    timed_out: s.boolean("Whether IPQS timed out during provider checks."),
    suspect: s.boolean("Whether IPQS considers the email suspicious."),
    recent_abuse: s.boolean("Whether IPQS has seen recent abuse for the email."),
    fraud_score: fraudScoreSchema,
    suggested_domain: s.nullableString("Suggested corrected domain for possible typos."),
    leaked: s.boolean("Whether IPQS found the email in leaked data."),
    sanitized_email: s.email("The normalized email address returned by IPQS."),
    request_id: s.string("The IPQS request identifier for support and tracing."),
  },
  {
    optional: [
      "disposable",
      "smtp_score",
      "overall_score",
      "first_name",
      "generic",
      "common",
      "dns_valid",
      "honeypot",
      "deliverability",
      "frequent_complainer",
      "spam_trap_score",
      "catch_all",
      "timed_out",
      "suspect",
      "recent_abuse",
      "fraud_score",
      "suggested_domain",
      "leaked",
      "sanitized_email",
      "request_id",
    ],
  },
);
const phoneInputSchema = s.object(
  "Input for validating a phone number with IPQualityScore.",
  {
    phone: s.nonEmptyString("The phone number to validate."),
    country: s.array(
      "Optional ISO 3166-1 alpha-2 countries to use when interpreting local numbers.",
      s.string("An ISO 3166-1 alpha-2 country code.", {
        minLength: 2,
        maxLength: 2,
        pattern: "^[A-Za-z]{2}$",
      }),
      { minItems: 1 },
    ),
    strictness: strictnessSchema,
  },
  { optional: ["country", "strictness"] },
);
const smsPumpingSchema = s.looseRequiredObject(
  "SMS pumping risk details returned by IPQS.",
  {
    risk_score: fraudScoreSchema,
    message: s.string("Human-readable SMS pumping risk message returned by IPQS."),
    velocity: s.string("SMS pumping velocity classification returned by IPQS."),
  },
  { optional: ["risk_score", "message", "velocity"] },
);
const phoneOutputSchema = s.looseRequiredObject(
  "Phone validation result returned by IPQualityScore.",
  {
    success: s.boolean("Whether IPQS completed the phone validation lookup successfully."),
    message: s.string("Human-readable status message returned by IPQS."),
    formatted: s.nullableString("The formatted phone number returned by IPQS."),
    local_format: s.nullableString("The local phone number format returned by IPQS."),
    valid: s.boolean("Whether IPQS considers the phone number valid."),
    fraud_score: fraudScoreSchema,
    recent_abuse: s.boolean("Whether IPQS has seen recent abuse for the phone number."),
    VOIP: s.boolean("Whether the phone number appears to be a VoIP number."),
    prepaid: s.boolean("Whether the phone number appears to be prepaid."),
    risky: s.boolean("Whether IPQS considers the phone number risky."),
    active: s.boolean("Whether IPQS considers the phone number active."),
    name: s.nullableString("The phone owner name returned by IPQS, when available."),
    carrier: s.nullableString("The carrier associated with the phone number."),
    line_type: s.nullableString("The line type associated with the phone number."),
    country: s.nullableString("The country associated with the phone number."),
    city: s.nullableString("The city associated with the phone number."),
    zip_code: s.nullableString("The postal code associated with the phone number."),
    region: s.nullableString("The region associated with the phone number."),
    dialing_code: s.nullableInteger("The international dialing code associated with the phone number."),
    sms_pumping: smsPumpingSchema,
    request_id: s.string("The IPQS request identifier for support and tracing."),
  },
  {
    optional: [
      "formatted",
      "local_format",
      "fraud_score",
      "recent_abuse",
      "VOIP",
      "prepaid",
      "risky",
      "active",
      "name",
      "carrier",
      "line_type",
      "country",
      "city",
      "zip_code",
      "region",
      "dialing_code",
      "sms_pumping",
      "request_id",
    ],
  },
);
const urlInputSchema = s.object(
  "Input for scanning a URL or domain with IPQualityScore.",
  {
    url: s.nonEmptyString("The URL or domain to scan."),
    strictness: urlStrictnessSchema,
  },
  { optional: ["strictness"] },
);
const domainAgeSchema = s.looseRequiredObject(
  "Domain age details returned by IPQualityScore.",
  {
    human: s.nullableString("Human-readable domain age returned by IPQS."),
    timestamp: s.nullableInteger("Domain creation timestamp returned by IPQS."),
    iso: s.nullableString("Domain creation date returned by IPQS."),
  },
  { optional: ["human", "timestamp", "iso"] },
);
const urlOutputSchema = s.looseRequiredObject(
  "URL reputation result returned by IPQualityScore.",
  {
    success: s.boolean("Whether IPQS completed the URL scan successfully."),
    message: s.string("Human-readable status message returned by IPQS."),
    unsafe: s.boolean("Whether IPQS considers the URL unsafe."),
    domain: s.nullableString("The domain parsed from the submitted URL."),
    root_domain: s.nullableString("The root domain parsed from the submitted URL."),
    ip_address: s.nullableString("The IP address associated with the domain."),
    server: s.nullableString("The server header or hosting stack returned by IPQS."),
    content_type: s.nullableString("The content type returned by IPQS."),
    status_code: s.nullableInteger("The HTTP status code returned by IPQS."),
    page_size: s.nullableInteger("The page size returned by IPQS."),
    domain_rank: s.nullableInteger("The domain rank returned by IPQS."),
    dns_valid: s.boolean("Whether DNS records for the domain are valid."),
    parking: s.boolean("Whether IPQS considers the domain parked."),
    spamming: s.boolean("Whether IPQS associates the URL with spam."),
    malware: s.boolean("Whether IPQS associates the URL with malware."),
    phishing: s.boolean("Whether IPQS associates the URL with phishing."),
    suspicious: s.boolean("Whether IPQS considers the URL suspicious."),
    adult: s.boolean("Whether IPQS classifies the URL as adult content."),
    risk_score: fraudScoreSchema,
    domain_age: domainAgeSchema,
    category: s.nullableString("The content category returned by IPQS."),
    domain_trust: s.nullableString("The domain trust classification returned by IPQS."),
    request_id: s.string("The IPQS request identifier for support and tracing."),
  },
  {
    optional: [
      "domain",
      "root_domain",
      "ip_address",
      "server",
      "content_type",
      "status_code",
      "page_size",
      "domain_rank",
      "dns_valid",
      "parking",
      "spamming",
      "malware",
      "phishing",
      "suspicious",
      "adult",
      "risk_score",
      "domain_age",
      "category",
      "domain_trust",
      "request_id",
    ],
  },
);

export const ipqualityscoreActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "check_ip_reputation",
    description: "Check an IP address for proxy, VPN, Tor, bot, and abuse risk signals.",
    inputSchema: ipInputSchema,
    outputSchema: ipOutputSchema,
  }),
  defineProviderAction(service, {
    name: "validate_email",
    description: "Validate an email address and return deliverability and abuse risk signals.",
    inputSchema: emailInputSchema,
    outputSchema: emailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "validate_phone",
    description: "Validate a phone number and return carrier, activity, and risk signals.",
    inputSchema: phoneInputSchema,
    outputSchema: phoneOutputSchema,
  }),
  defineProviderAction(service, {
    name: "scan_url",
    description: "Scan a URL or domain and return malware, phishing, and domain risk signals.",
    inputSchema: urlInputSchema,
    outputSchema: urlOutputSchema,
  }),
];
