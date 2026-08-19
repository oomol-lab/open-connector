import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bunnycdn";

const pullZoneIdSchema = s.positiveInteger("The Bunny Pull Zone ID.");

const hostnameSchema = s.looseObject("A Bunny Pull Zone hostname.", {
  Id: s.integer("The unique hostname ID."),
  Value: s.string("The hostname value."),
  ForceSSL: s.boolean("Whether Force SSL is enabled."),
  IsSystemHostname: s.boolean("Whether this hostname is controlled by bunny.net."),
  IsManagedHostname: s.boolean("Whether this is a managed bunny.net hostname."),
  HasCertificate: s.boolean("Whether the hostname has an SSL certificate configured."),
  Certificate: s.string("The Base64Url-encoded certificate returned by Bunny when requested."),
  CertificateProvisionType: s.integer("The certificate provision type."),
});

const pullZoneSchema = s.looseObject("A Bunny Pull Zone payload.", {
  Id: s.integer("The unique pull zone ID."),
  Name: s.string("The pull zone name."),
  OriginUrl: s.string("The origin URL used by the pull zone."),
  Enabled: s.boolean("Whether the pull zone is enabled."),
  Suspended: s.boolean("Whether the pull zone is suspended."),
  Hostnames: s.array("The hostnames linked to this pull zone.", hostnameSchema),
  StorageZoneId: s.integer("The linked storage zone ID."),
  EdgeScriptId: s.integer("The linked edge script ID."),
  AllowedReferrers: s.stringArray("The referrer hostnames allowed to access the pull zone."),
  BlockedReferrers: s.stringArray("The referrer hostnames blocked from the pull zone."),
  BlockedIps: s.stringArray("The IP addresses blocked from the pull zone."),
  ZoneSecurityEnabled: s.boolean("Whether secure-token URL authentication is enabled."),
  IgnoreQueryStrings: s.boolean("Whether the pull zone ignores query strings for cache keys."),
  MonthlyBandwidthLimit: s.integer("The monthly bandwidth limit in bytes."),
  MonthlyBandwidthUsed: s.integer("The bandwidth used this month in bytes."),
  MonthlyCharges: s.number("The total monthly charges accumulated by the pull zone."),
  AddHostHeader: s.boolean("Whether Bunny forwards the current hostname to the origin."),
  OriginHostHeader: s.string("The host header sent to the origin."),
});

const listPullZonesInputSchema = s.object(
  "Input parameters for listing Bunny Pull Zones.",
  {
    page: s.positiveInteger("The page number to return."),
    perPage: s.integer("The page size to return when page is provided.", { minimum: 5, maximum: 1000 }),
    search: s.nonEmptyString("The search term used to filter pull zones by name or related text."),
    includeCertificate: s.boolean("Whether hostname certificate data should be included."),
  },
  { optional: ["page", "perPage", "search", "includeCertificate"] },
);

const getPullZoneInputSchema = s.object(
  "Input parameters for retrieving one Bunny Pull Zone.",
  {
    pullZoneId: pullZoneIdSchema,
    includeCertificate: s.boolean("Whether hostname certificate data should be included."),
  },
  { required: ["pullZoneId"], optional: ["includeCertificate"] },
);

const purgePullZoneCacheInputSchema = s.object(
  "Input parameters for purging a Bunny Pull Zone cache.",
  {
    pullZoneId: pullZoneIdSchema,
    cacheTag: s.nonEmptyString("Optional cache tag used to purge only matching cached objects."),
  },
  { required: ["pullZoneId"], optional: ["cacheTag"] },
);

export const bunnycdnActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_pull_zones",
    description: "List Bunny Pull Zones with optional pagination, search, and certificate expansion.",
    inputSchema: listPullZonesInputSchema,
    outputSchema: s.object(
      "The normalized response returned when listing Bunny Pull Zones.",
      {
        pullZones: s.array("The pull zones returned by Bunny.", pullZoneSchema),
        currentPage: s.integer("The current page number when Bunny returns a paginated response."),
        totalItems: s.integer("The total number of pull zones available for the current query."),
        hasMoreItems: s.boolean("Whether another page of pull zones is available."),
      },
      { required: ["pullZones"], optional: ["currentPage", "totalItems", "hasMoreItems"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_pull_zone",
    description: "Get one Bunny Pull Zone by ID.",
    inputSchema: getPullZoneInputSchema,
    outputSchema: s.actionOutput(
      {
        pullZone: pullZoneSchema,
      },
      "The response returned when retrieving one Bunny Pull Zone.",
    ),
  }),
  defineProviderAction(service, {
    name: "purge_pull_zone_cache",
    description: "Purge the cache for a Bunny Pull Zone, optionally restricted to one cache tag.",
    inputSchema: purgePullZoneCacheInputSchema,
    outputSchema: s.object(
      "The confirmation returned after purging a Bunny Pull Zone cache.",
      {
        pullZoneId: pullZoneIdSchema,
        purged: s.boolean("Whether the purge request completed successfully."),
        cacheTag: s.nonEmptyString("The cache tag passed to Bunny for the purge request."),
      },
      { required: ["pullZoneId", "purged"], optional: ["cacheTag"] },
    ),
  }),
];
