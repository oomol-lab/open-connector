import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "venafitlsprotectcloud";
const certificateSchema = s.looseObject("A certificate returned by Venafi TLS Protect Cloud.");
const certificateRequestSchema = s.looseObject("A certificate request returned by Venafi TLS Protect Cloud.");

export const venafiTlsProtectCloudActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_certificate",
    description: "Retrieve a certificate by its Venafi TLS Protect Cloud identifier.",
    requiredScopes: [],
    inputSchema: s.object("The certificate to retrieve.", {
      certificateId: s.nonEmptyString("The unique certificate identifier."),
    }),
    outputSchema: s.object("The matching certificate.", { certificate: certificateSchema }),
  }),
  defineProviderAction(service, {
    name: "list_certificates",
    description: "List certificates visible to the Venafi TLS Protect Cloud account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination and subject filters for listing certificates.",
      {
        limit: s.integer("Maximum number of certificates to return.", { minimum: 1, maximum: 500 }),
        offset: s.integer("Zero-based result offset.", { minimum: 0 }),
        subject: s.string("Certificate subject text to filter by."),
      },
      { optional: ["limit", "offset", "subject"] },
    ),
    outputSchema: s.object("A page of certificates.", {
      certificates: s.array("Certificates returned for this page.", certificateSchema),
      total: s.nullable(s.integer("Total matching certificates when reported by Venafi.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_certificate_request",
    description: "Retrieve a certificate request by its Venafi TLS Protect Cloud identifier.",
    requiredScopes: [],
    inputSchema: s.object("The certificate request to retrieve.", {
      certificateRequestId: s.nonEmptyString("The unique certificate request identifier."),
    }),
    outputSchema: s.object("The matching certificate request.", {
      certificateRequest: certificateRequestSchema,
    }),
  }),
];
