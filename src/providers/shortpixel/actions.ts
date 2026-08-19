import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "shortpixel";

const domainSchema = s.string("The domain name managed in ShortPixel CDN endpoints.", {
  minLength: 1,
  pattern: "\\S",
});

const statusSchema = s.object("The status object returned by ShortPixel.", {
  code: s.string("The status code returned by ShortPixel."),
  message: s.string("The human-readable status message returned by ShortPixel."),
});

const statusActionOutputSchema = s.object(
  "The normalized response returned by ShortPixel domain management actions.",
  {
    status: statusSchema,
    domain: s.nullable(s.string("The domain echoed by ShortPixel when present.")),
    raw: s.looseObject("The raw ShortPixel payload."),
  },
  { optional: ["domain"] },
);

const usedCdnEntrySchema = s.object("One normalized ShortPixel CDN traffic usage entry.", {
  traffic: s.nullable(s.number("The traffic value reported for the day.")),
  raw: s.looseObject("The raw daily CDN usage object returned by ShortPixel."),
});

const usedCreditEntrySchema = s.object("One normalized ShortPixel credit usage entry.", {
  paid: s.nullable(s.number("The paid credits used for the day.")),
  free: s.nullable(s.number("The free credits used for the day.")),
  originalBytes: s.nullable(s.number("The original byte total reported for the day.")),
  optimizedBytes: s.nullable(s.number("The optimized byte total reported for the day.")),
  raw: s.looseObject("The raw daily credit usage object returned by ShortPixel."),
});

const getDomainCdnUsageAction = defineProviderAction(service, {
  name: "get_domain_cdn_usage",
  description: "Read CDN usage and quota details for one ShortPixel-associated domain.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for reading ShortPixel domain CDN usage.", {
    domain: domainSchema,
  }),
  outputSchema: s.object("The response returned when reading ShortPixel domain CDN usage.", {
    email: s.nullable(s.string("The account email returned by ShortPixel when present.")),
    apiQuota: s.nullable(s.number("The monthly API quota reported by ShortPixel.")),
    apiQuotaOneTime: s.nullable(s.number("The one-time API quota reported by ShortPixel.")),
    daysToReset: s.nullable(s.number("The number of days until quota reset.")),
    isSubaccount: s.nullable(s.boolean("Whether the account is a subaccount.")),
    isAlias: s.nullable(s.boolean("Whether the account is an alias account.")),
    remainingCdnTraffic: s.nullable(s.number("The remaining CDN traffic quota for the domain.")),
    usedCdnTraffic: s.nullable(s.number("The used CDN traffic quota for the domain.")),
    freeApiCalls: s.nullable(s.number("The free API calls reported by ShortPixel.")),
    paidApiCalls: s.nullable(s.number("The paid API calls reported by ShortPixel.")),
    paidApiCallsOneTime: s.nullable(s.number("The paid one-time API calls reported by ShortPixel.")),
    cdnQuota: s.nullable(s.number("The total CDN quota reported by ShortPixel.")),
    unlimited: s.nullable(s.boolean("Whether the account has unlimited usage enabled.")),
    usedCdn: s.record("The normalized per-day CDN traffic usage returned by ShortPixel.", usedCdnEntrySchema),
    usedCredits: s.record("The normalized per-day credit usage returned by ShortPixel.", usedCreditEntrySchema),
    raw: s.looseObject("The raw ShortPixel payload."),
  }),
});

const addDomainAction = defineProviderAction(service, {
  name: "add_domain",
  description: "Add and associate a domain with the current ShortPixel account.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for adding a ShortPixel domain.", {
    domain: domainSchema,
  }),
  outputSchema: statusActionOutputSchema,
});

const setDomainAction = defineProviderAction(service, {
  name: "set_domain",
  description: "Associate an existing domain with the current ShortPixel account.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for associating a ShortPixel domain.", {
    domain: domainSchema,
  }),
  outputSchema: statusActionOutputSchema,
});

const revokeDomainAction = defineProviderAction(service, {
  name: "revoke_domain",
  description: "Remove the current ShortPixel account association from a domain.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for revoking a ShortPixel domain.", {
    domain: domainSchema,
  }),
  outputSchema: statusActionOutputSchema,
});

const purgeDomainStorageAction = defineProviderAction(service, {
  name: "purge_domain_storage",
  description: "Purge ShortPixel stored optimized variants for one associated domain.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for purging ShortPixel domain storage.", {
    domain: domainSchema,
  }),
  outputSchema: statusActionOutputSchema,
});

const purgeDomainCacheAction = defineProviderAction(service, {
  name: "purge_domain_cache",
  description: "Purge the ShortPixel CDN cache for one associated domain.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for purging the ShortPixel domain cache.", {
    domain: domainSchema,
  }),
  outputSchema: statusActionOutputSchema,
});

export const shortpixelActions: ActionDefinition[] = [
  getDomainCdnUsageAction,
  addDomainAction,
  setDomainAction,
  revokeDomainAction,
  purgeDomainStorageAction,
  purgeDomainCacheAction,
];
