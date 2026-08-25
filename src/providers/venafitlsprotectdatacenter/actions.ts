import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "venafitlsprotectdatacenter";
const certificateSchema = s.looseObject("A certificate returned by Venafi TLS Protect Datacenter.");

export const venafiTlsProtectDatacenterActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_certificate",
    description: "Retrieve a certificate by GUID from Venafi TLS Protect Datacenter.",
    requiredScopes: [],
    inputSchema: s.object("The certificate to retrieve.", {
      certificateId: s.nonEmptyString("The certificate GUID."),
    }),
    outputSchema: s.object("The matching certificate.", { certificate: certificateSchema }),
  }),
  defineProviderAction(service, {
    name: "list_certificates",
    description: "List certificates visible to the Venafi TLS Protect Datacenter integration.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination fields for listing certificates.",
      {
        limit: s.integer("Maximum number of certificates to return.", { minimum: 1, maximum: 500 }),
        next: s.nonEmptyString("The next-page URL returned by a previous list_certificates call."),
      },
      { optional: ["limit", "next"] },
    ),
    outputSchema: s.object("A page of certificates and the next page URL when available.", {
      certificates: s.array("Certificates returned for this page.", certificateSchema),
      next: s.nullable(s.string("Relative next-page URL returned by Venafi.")),
    }),
  }),
  defineProviderAction(service, {
    name: "check_policy",
    description: "Check the effective certificate policy for a policy distinguished name.",
    requiredScopes: [],
    inputSchema: s.object("The policy folder to inspect.", {
      policyDn: s.nonEmptyString("The distinguished name of the policy folder."),
    }),
    outputSchema: s.object("The effective policy returned by Venafi.", {
      policy: s.looseObject("The effective certificate policy."),
    }),
  }),
];
