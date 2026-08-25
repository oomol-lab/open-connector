import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sslmate_cert_spotter_api";

const domainPattern =
  "^(?!.*://)(?!.*\\/)(?:\\\\.)?(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\\\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$";
const ctDomainPattern =
  "^(?!.*://)(?!.*\\/)(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\\\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$";

const ctSearchDomainField = s.string({
  minLength: 1,
  pattern: ctDomainPattern,
  description: "The registered domain or subdomain to search in the CT Search API.",
});
const monitoredDomainNameField = s.string({
  minLength: 1,
  pattern: domainPattern,
  description: "The monitored domain name. Prefix with a leading dot to cover the entire subdomain tree.",
});
const expandField = s.nonEmptyString("One Cert Spotter expand field such as dns_names or issuer.caa_domains.");

const monitoredDomainSchema = s.object(
  {
    name: monitoredDomainNameField,
    enabled: s.boolean("Whether Cert Spotter monitoring is enabled for this domain."),
  },
  {
    required: ["name", "enabled"],
    description: "A monitored domain object returned by the Cert Spotter monitoring API.",
  },
);

const nullableString = (description: string) => s.nullable(s.string(description));
const nullableTimestamp = (description: string) => s.nullable(s.dateTime(description));

const issuanceSchema = s.looseObject(
  {
    id: s.nonEmptyString("The opaque Cert Spotter issuance identifier."),
    tbs_sha256: s.nonEmptyString("The SHA-256 digest of the CT TBSCertificate."),
    cert_sha256: s.nonEmptyString("The SHA-256 digest of the certificate or precertificate."),
    dns_names: s.array(
      "Expanded DNS names covered by the certificate issuance.",
      s.nonEmptyString("One DNS name covered by the certificate issuance."),
    ),
    pubkey_sha256: s.nonEmptyString("The SHA-256 digest of the certificate public key."),
    pubkey_der: s.nonEmptyString("The base64 DER-encoded certificate public key when expanded."),
    pubkey: s.looseObject({}, { description: "Expanded metadata about the certificate public key." }),
    issuer: s.looseObject({}, { description: "Expanded metadata about the issuer." }),
    not_before: s.dateTime("The certificate not-before timestamp in RFC 3339 format."),
    not_after: s.dateTime("The certificate not-after timestamp in RFC 3339 format."),
    revoked: s.nullable(s.boolean("Whether the certificate is revoked.")),
    revocation: s.looseObject(
      {
        time: nullableTimestamp("The RFC 3339 revocation time, or null when not revoked."),
        reason: s.nullable(s.integer("The RFC 5280 revocation reason code.")),
        checked_at: nullableTimestamp("The RFC 3339 timestamp when Cert Spotter last checked revocation status."),
      },
      { description: "Expanded revocation metadata returned by Cert Spotter." },
    ),
    problem_reporting: nullableString("Instructions for reporting certificate problems, or null when unavailable."),
    cert_der: s.nonEmptyString("The base64 DER-encoded certificate or precertificate when expanded."),
  },
  { description: "A certificate issuance object returned by the Cert Spotter CT Search API." },
);

export const certSpotterActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_certificate_issuances",
    description: "List certificate issuances for one domain from the Cert Spotter CT Search API.",
    inputSchema: s.object(
      {
        domain: ctSearchDomainField,
        after: s.nonEmptyString("Return issuances discovered after the issuance with this Cert Spotter ID."),
        include_subdomains: s.boolean("Whether to include issuances for subdomains of the requested domain."),
        match_wildcards: s.boolean("Whether to include wildcard certificates that match the requested domain."),
        expand: s.array("Repeatable Cert Spotter expand fields to include in the response.", expandField, {
          minItems: 1,
        }),
      },
      {
        required: ["domain"],
        optional: ["after", "include_subdomains", "match_wildcards", "expand"],
        description: "The input payload for listing certificate issuances from Cert Spotter.",
      },
    ),
    outputSchema: s.object(
      {
        issuances: s.array("Certificate issuances returned by the Cert Spotter CT Search API.", issuanceSchema),
        retryAfterSeconds: s.nonNegativeInteger(
          "The Retry-After header in seconds when Cert Spotter suggests how long to wait before polling again.",
        ),
      },
      {
        required: ["issuances"],
        optional: ["retryAfterSeconds"],
        description: "The output payload for listing certificate issuances from Cert Spotter.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_monitored_domains",
    description: "List monitored domains configured in the connected Cert Spotter account.",
    inputSchema: s.object({}, { description: "The input payload for listing monitored domains." }),
    outputSchema: s.actionOutput(
      {
        domains: s.array("Monitored domains returned by the Cert Spotter monitoring API.", monitoredDomainSchema),
      },
      "The output payload for listing monitored domains.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_monitored_domain",
    description: "Get one monitored domain configuration from the connected Cert Spotter account.",
    inputSchema: s.actionInput(
      { name: monitoredDomainNameField },
      ["name"],
      "The input payload for retrieving one monitored domain.",
    ),
    outputSchema: s.actionOutput(
      {
        domain: monitoredDomainSchema,
      },
      "The output payload for retrieving one monitored domain.",
    ),
  }),
  defineProviderAction(service, {
    name: "upsert_monitored_domain",
    description: "Create or update one monitored domain configuration in the connected Cert Spotter account.",
    inputSchema: s.object(
      {
        name: monitoredDomainNameField,
        enabled: s.boolean("Whether monitoring should be enabled for this domain."),
      },
      {
        required: ["name"],
        optional: ["enabled"],
        description: "The input payload for creating or updating one monitored domain.",
      },
    ),
    outputSchema: s.actionOutput(
      {
        domain: monitoredDomainSchema,
      },
      "The output payload for creating or updating one monitored domain.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_monitored_domain",
    description: "Delete one monitored domain configuration from the connected Cert Spotter account.",
    inputSchema: s.actionInput(
      { name: monitoredDomainNameField },
      ["name"],
      "The input payload for deleting one monitored domain.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the monitored domain was deleted."),
      },
      "The output payload for deleting one monitored domain.",
    ),
  }),
];
