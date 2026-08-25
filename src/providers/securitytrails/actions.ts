import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "securitytrails";

const hostnameSchema = s.string({
  minLength: 1,
  pattern: "^(?!.*://)(?!.*\\/).+$",
  description: "The bare domain or subdomain to query without protocol or path.",
});
const looseObjectSchema = s.looseObject("A raw JSON object returned by SecurityTrails.");
const recordTypeCountsSchema = s.record(
  "Mapping of DNS record type to the number of matching subdomains.",
  s.number("The number of matching subdomains for this DNS record type."),
);
const pageField = s.integer("The 1-based results page to fetch from the associated-domain listing.", {
  minimum: 1,
});

export const securitytrailsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_domain",
    description: "Get current DNS and domain details for one hostname from SecurityTrails.",
    inputSchema: s.object("The input payload for current domain details.", {
      hostname: hostnameSchema,
    }),
    outputSchema: s.object("The output payload for current domain details.", {
      domain: {
        ...looseObjectSchema,
        description: "Raw domain details returned by SecurityTrails.",
      },
    }),
  }),
  defineProviderAction(service, {
    name: "get_subdomains",
    description: "List known subdomains for one hostname from SecurityTrails.",
    inputSchema: s.object("The input payload for known subdomains.", {
      hostname: hostnameSchema,
    }),
    outputSchema: s.object("The output payload for known subdomains.", {
      hostname: s.nonEmptyString("The hostname used for the subdomain lookup."),
      subdomains: s.array(
        "Known subdomain labels for the requested hostname.",
        s.nonEmptyString("One subdomain label returned by SecurityTrails."),
      ),
      recordTypeCounts: recordTypeCountsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "find_associated_domains",
    description: "Find domains associated with one hostname in SecurityTrails.",
    inputSchema: s.object(
      "The input payload for associated domains.",
      {
        hostname: hostnameSchema,
        page: pageField,
      },
      { optional: ["page"] },
    ),
    outputSchema: s.object("The output payload for associated domains.", {
      hostname: s.nonEmptyString("The hostname used for the associated-domain lookup."),
      records: s.array(
        "Associated-domain records returned by SecurityTrails.",
        s.looseObject("One associated-domain record returned by SecurityTrails."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_domain_ssl",
    description: "Get SSL certificate details for one hostname from SecurityTrails.",
    inputSchema: s.object("The input payload for SSL certificate details.", {
      hostname: hostnameSchema,
    }),
    outputSchema: s.object("The output payload for SSL certificate details.", {
      hostname: s.nonEmptyString("The hostname used for the SSL lookup."),
      ssl: { ...looseObjectSchema, description: "Raw SSL details returned by SecurityTrails." },
    }),
  }),
];
