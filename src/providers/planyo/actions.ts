import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const language = s.string("Two-letter ISO 639-1 language code; normalized to uppercase.", {
  minLength: 2,
  maxLength: 2,
});
const siteId = s.integer("Planyo site ID; required for metasite keys when reading site information.");
const resource = s.looseObject("Resource settings, custom properties and photos returned by Planyo.", {
  name: s.string("Resource name."),
  quantity: s.integer("Number of resource units."),
  site_id: s.integer("Planyo site ID."),
});
const planyoActions: ActionDefinition[] = [
  defineProviderAction("planyo", {
    name: "get_site_info",
    operationType: "read",
    requiredScopes: [],
    description: "Read Planyo site information, custom properties and photos.",
    inputSchema: s.object(
      "Site information query.",
      { site_id: siteId, language },
      { optional: ["site_id", "language"] },
    ),
    outputSchema: s.looseObject("Site information returned by Planyo.", {
      name: s.string("Site name."),
      timezone: s.string("Site timezone."),
      default_language: s.string("Default site language."),
    }),
  }),
  defineProviderAction("planyo", {
    name: "get_resource_info",
    operationType: "read",
    requiredScopes: [],
    description: "Read a Planyo resource's settings, custom properties and photos.",
    inputSchema: s.object(
      "Resource information query.",
      {
        resource_id: s.integer("Planyo resource ID."),
        language,
      },
      { optional: ["language"] },
    ),
    outputSchema: resource,
  }),
  defineProviderAction("planyo", {
    name: "list_resources",
    operationType: "read",
    requiredScopes: [],
    description: "List one page of Planyo resources with optional settings, photos and filters.",
    inputSchema: s.object(
      "Resource list query.",
      {
        detail_level: s.integer("Bitmask: 1 names, 2 settings, 4 custom properties, 8 photos; default 1.", {
          minimum: 1,
          maximum: 15,
        }),
        page: s.integer("Zero-based page number; default 0.", { minimum: 0 }),
        page_size: s.integer("Maximum results per page; default 100.", {
          minimum: 1,
          maximum: 300,
        }),
        list_published_only: s.boolean("Return only published resources."),
        list_reservable_only: s.boolean("Return only resources bookable outside a package."),
        list_resource_types: s.string("Comma-separated resource types: resource, bundle, package; or all."),
        admin_id: s.integer("Filter by resource administrator ID."),
        properties: {
          ...s.record(
            "Custom resource filters: use full prop_res_ prefixed parameter names.",
            s.string("Custom resource filter value."),
          ),
          propertyNames: { pattern: "^prop_res_.+" },
        },
        ppp_resfilter: s.string("Comma-separated resource IDs to include."),
        sort: s.string("Sort by resname, site, location or a prop_res_ custom property name."),
        site_id: siteId,
        language,
      },
      {
        optional: [
          "detail_level",
          "page",
          "page_size",
          "list_published_only",
          "list_reservable_only",
          "list_resource_types",
          "admin_id",
          "properties",
          "ppp_resfilter",
          "sort",
          "site_id",
          "language",
        ],
      },
    ),
    outputSchema: s.looseObject("One page of resources with pagination metadata.", {
      resource_count: s.integer("Total resources matching the query."),
      max_page: s.integer("Last zero-based page number."),
      resources: s.array("Resources returned on this page.", resource),
    }),
  }),
];
export default planyoActions;
