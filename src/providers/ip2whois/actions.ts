import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ip2whois";

const contactSchema = s.object("A WHOIS contact object.", {
  name: s.string("Contact name from the WHOIS record."),
  organization: s.string("Organization name from the WHOIS record."),
  street_address: s.string("Street address from the WHOIS record."),
  city: s.string("City value from the WHOIS record."),
  region: s.string("Region, state, or province from the WHOIS record."),
  zip_code: s.string("Postal code from the WHOIS record."),
  country: s.string("Two-letter country code from the WHOIS record."),
  phone: s.string("Phone number from the WHOIS record."),
  fax: s.string("Fax number from the WHOIS record."),
  email: s.string("Email address from the WHOIS record."),
});

const registrarSchema = s.object("Registrar information for the queried domain.", {
  name: s.string("Name of the registrar."),
  iana_id: s.string("Registrar IANA identifier."),
  url: s.string("Registrar website URL."),
});

const domainLookupInputSchema = s.object("The input payload for a domain WHOIS lookup.", {
  domain: s.nonEmptyString("The bare domain name to query."),
});

const hostedDomainsLookupInputSchema = s.object(
  "The input payload for a hosted domains lookup.",
  {
    ip: s.nonEmptyString("The IPv4 or IPv6 address to query."),
    page: s.integer("The result page to fetch.", { minimum: 1 }),
  },
  { optional: ["page"] },
);

const domainLookupOutputSchema = s.object(
  "WHOIS lookup result for a domain.",
  {
    domain: s.string("The queried domain name."),
    domain_id: s.string("Domain registry identifier returned by IP2WHOIS."),
    status: s.string("Domain status returned by the WHOIS record."),
    create_date: s.string("Domain creation date in ISO 8601 format."),
    update_date: s.string("Domain update date in ISO 8601 format."),
    expire_date: s.string("Domain expiration date in ISO 8601 format."),
    domain_age: s.integer("Age of the domain in days."),
    whois_server: s.string("WHOIS server hostname for the domain."),
    registrar: { ...registrarSchema, description: "Registrar information for the domain." },
    registrant: { ...contactSchema, description: "Registrant contact details." },
    admin: { ...contactSchema, description: "Administrative contact details." },
    tech: { ...contactSchema, description: "Technical contact details." },
    billing: { ...contactSchema, description: "Billing contact details." },
    nameservers: s.array("Authoritative nameservers for the domain.", s.string("Authoritative nameserver hostname.")),
  },
  { optional: ["domain_id", "whois_server"] },
);

const hostedDomainsLookupOutputSchema = s.object("Hosted domains lookup result for an IP address.", {
  ip: s.string("The queried IP address."),
  page: s.integer("Current page number."),
  per_page: s.integer("Number of domains returned per page."),
  total_pages: s.integer("Total number of available pages."),
  total_domains: s.integer("Total number of domains hosted on the IP."),
  domains: s.array("Hosted domain names.", s.string("Hosted domain name.")),
});

export const ip2whoisActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "lookup_domain",
    description: "Look up WHOIS registration details for a domain.",
    inputSchema: domainLookupInputSchema,
    outputSchema: domainLookupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_hosted_domains",
    description: "List hosted domains associated with an IP address.",
    inputSchema: hostedDomainsLookupInputSchema,
    outputSchema: hostedDomainsLookupOutputSchema,
  }),
];
