import type { UnifapiOperationDefinition } from "../operations.ts";

import { createDataForSeoFilterSchema, dataForSeoFilterDefinitions } from "./dataforseo-filter.ts";

export const seoOperations: readonly UnifapiOperationDefinition[] = [
  {
    name: "list_seo_backlink_anchors",
    operationId: "postSeoBacklinksAnchors",
    description: "Get anchor texts used in backlinks to a target.",
    method: "POST",
    path: "/seo/backlinks/anchors",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "target",
      "backlinks_status_type",
      "include_subdomains",
      "include_indirect_links",
      "exclude_internal_backlinks",
      "internal_list_limit",
      "rank_scale",
      "filters",
      "backlinks_filters",
      "order_by",
      "limit",
      "offset",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Domain, subdomain, or page to analyze. A domain or subdomain is specified without https:// and www. (example.com); a page is specified as an absolute URL (https://example.com/blog/).",
        },
        backlinks_status_type: {
          type: "string",
          enum: ["live", "all", "lost"],
          description: "Which backlinks to count: live (found on the last check, default), all, or lost.",
        },
        include_subdomains: {
          type: "boolean",
          description: "Include backlinks pointing to the target's subdomains. Defaults to true.",
        },
        include_indirect_links: {
          type: "boolean",
          description: "Include indirect links (via redirects or canonicals) to the target. Defaults to true.",
        },
        exclude_internal_backlinks: {
          type: "boolean",
          description: "Exclude internal backlinks from the target's own subdomains. Defaults to true.",
        },
        internal_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of entries kept in each referring_links_* breakdown map. Defaults to 10.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
        filters: createDataForSeoFilterSchema(
          'Filter the returned anchor rows. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: anchor (anchor text); rank (backlink rank, 0-1000); backlinks (number of backlinks); backlinks_spam_score (average spam score, 0-100); referring_domains (referring domains count); referring_main_domains (referring root domains count); referring_pages (referring pages count); referring_ips (referring IPs count); referring_subnets (referring subnets count); broken_backlinks (backlinks to broken pages); broken_pages (broken pages still receiving backlinks); first_seen (ISO date the first backlink was found); lost_date (ISO date the last backlink was lost). Example: {"and":[{"field":"backlinks","op":">","value":50},{"field":"rank","op":">","value":100}]}',
        ),
        backlinks_filters: createDataForSeoFilterSchema(
          'Filter the underlying individual backlinks before the aggregate metrics are computed. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: dofollow (boolean, link is dofollow); is_new (boolean, appeared since the last check); is_lost (boolean, lost since the last check); is_broken (boolean, points to a broken page); rank (referring page rank, 0-1000); page_from_rank (referring page rank, 0-1000); domain_from_rank (referring domain rank, 0-1000); backlink_spam_score (spam score of the referring page, 0-100); item_type (anchor, image, link, redirect, or canonical); anchor (anchor text); tld_from (top-level domain of the referring page); semantic_location (link location, e.g. article, footer); first_seen (ISO date the backlink was first seen); last_seen (ISO date the backlink was last seen). Example: {"and":[{"field":"dofollow","op":"=","value":true},{"field":"backlink_spam_score","op":"<","value":10}]}',
        ),
        order_by: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                minLength: 1,
                description: "Field to sort by. See the endpoint's list of sortable fields.",
              },
              dir: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
                description: "Sort direction: asc or desc. Defaults to desc.",
              },
            },
            required: ["field"],
            additionalProperties: false,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 3,
          description:
            'Sort the returned anchors. Each rule is {"field","dir"} with dir asc or desc; up to 3 rules, applied in order. Sortable fields: anchor, rank, backlinks, backlinks_spam_score, referring_domains, referring_main_domains, referring_pages, referring_ips, referring_subnets, broken_backlinks, broken_pages, first_seen, lost_date.',
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of records to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of records to skip from the start of the results.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps the headline counters; full adds nofollow variants and the referring_links_* breakdown maps. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for Get anchor texts used in backlinks to a target.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "count_seo_bulk_backlinks",
    operationId: "postSeoBacklinksBulkBacklinks",
    description: "Count backlinks for many targets.",
    method: "POST",
    path: "/seo/backlinks/bulk-backlinks",
    pathFields: [],
    queryFields: [],
    bodyFields: ["targets"],
    inputSchema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 1000,
          description:
            "Domains, subdomains, or pages to analyze (up to 1000). Domains/subdomains without https:// and www.; pages as absolute URLs.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Count backlinks for many targets.",
      required: ["targets"],
    },
    paginated: false,
  },
  {
    name: "count_seo_bulk_new_lost_backlinks",
    operationId: "postSeoBacklinksBulkNewLostBacklinks",
    description: "Count new and lost backlinks for many targets.",
    method: "POST",
    path: "/seo/backlinks/bulk-new-lost-backlinks",
    pathFields: [],
    queryFields: [],
    bodyFields: ["targets", "date_from"],
    inputSchema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 1000,
          description:
            "Domains, subdomains, or pages to analyze (up to 1000). Domains/subdomains without https:// and www.; pages as absolute URLs.",
        },
        date_from: {
          type: "string",
          description:
            "Start date (yyyy-mm-dd) for counting new and lost backlinks. Minimum 2019-01-30; defaults to one month ago.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Count new and lost backlinks for many targets.",
      required: ["targets"],
    },
    paginated: false,
  },
  {
    name: "count_seo_bulk_new_lost_referring_domains",
    operationId: "postSeoBacklinksBulkNewLostReferringDomains",
    description: "Count new and lost referring domains for many targets.",
    method: "POST",
    path: "/seo/backlinks/bulk-new-lost-referring-domains",
    pathFields: [],
    queryFields: [],
    bodyFields: ["targets", "date_from"],
    inputSchema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 1000,
          description:
            "Domains, subdomains, or pages to analyze (up to 1000). Domains/subdomains without https:// and www.; pages as absolute URLs.",
        },
        date_from: {
          type: "string",
          description:
            "Start date (yyyy-mm-dd) for counting new and lost referring domains. Minimum 2019-01-30; defaults to one month ago.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Count new and lost referring domains for many targets.",
      required: ["targets"],
    },
    paginated: false,
  },
  {
    name: "summarize_seo_bulk_pages",
    operationId: "postSeoBacklinksBulkPagesSummary",
    description: "Summarize backlinks for many pages at once.",
    method: "POST",
    path: "/seo/backlinks/bulk-pages-summary",
    pathFields: [],
    queryFields: [],
    bodyFields: ["targets", "include_subdomains", "rank_scale", "view"],
    inputSchema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 1000,
          description:
            "Domains, subdomains, or pages to analyze (up to 1000). Domains/subdomains without https:// and www.; pages as absolute URLs.",
        },
        include_subdomains: {
          type: "boolean",
          description: "Include backlinks pointing to the target's subdomains. Defaults to true.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps the headline counters; full adds nofollow variants and the referring_links_* breakdown maps. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Summarize backlinks for many pages at once.",
      required: ["targets"],
    },
    paginated: false,
  },
  {
    name: "get_seo_bulk_backlink_ranks",
    operationId: "postSeoBacklinksBulkRanks",
    description: "Get backlink ranks for many targets.",
    method: "POST",
    path: "/seo/backlinks/bulk-ranks",
    pathFields: [],
    queryFields: [],
    bodyFields: ["targets", "rank_scale"],
    inputSchema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 1000,
          description:
            "Domains, subdomains, or pages to analyze (up to 1000). Domains/subdomains without https:// and www.; pages as absolute URLs.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
      },
      additionalProperties: false,
      description: "The input payload for Get backlink ranks for many targets.",
      required: ["targets"],
    },
    paginated: false,
  },
  {
    name: "count_seo_bulk_referring_domains",
    operationId: "postSeoBacklinksBulkReferringDomains",
    description: "Count referring domains for many targets.",
    method: "POST",
    path: "/seo/backlinks/bulk-referring-domains",
    pathFields: [],
    queryFields: [],
    bodyFields: ["targets"],
    inputSchema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 1000,
          description:
            "Domains, subdomains, or pages to analyze (up to 1000). Domains/subdomains without https:// and www.; pages as absolute URLs.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Count referring domains for many targets.",
      required: ["targets"],
    },
    paginated: false,
  },
  {
    name: "get_seo_bulk_spam_scores",
    operationId: "postSeoBacklinksBulkSpamScore",
    description: "Get spam scores for many targets.",
    method: "POST",
    path: "/seo/backlinks/bulk-spam-score",
    pathFields: [],
    queryFields: [],
    bodyFields: ["targets"],
    inputSchema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 1000,
          description:
            "Domains, subdomains, or pages to analyze (up to 1000). Domains/subdomains without https:// and www.; pages as absolute URLs.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Get spam scores for many targets.",
      required: ["targets"],
    },
    paginated: false,
  },
  {
    name: "find_seo_backlink_competitors",
    operationId: "postSeoBacklinksCompetitors",
    description: "Find competitors by shared referring domains.",
    method: "POST",
    path: "/seo/backlinks/competitors",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "target",
      "main_domain",
      "exclude_large_domains",
      "exclude_internal_backlinks",
      "rank_scale",
      "filters",
      "order_by",
      "limit",
      "offset",
    ],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Domain, subdomain, or page to analyze. A domain or subdomain is specified without https:// and www. (example.com); a page is specified as an absolute URL (https://example.com/blog/).",
        },
        main_domain: {
          type: "boolean",
          description: "Treat the target and competitors as root domains rather than exact subdomains.",
        },
        exclude_large_domains: {
          type: "boolean",
          description: "Exclude very large generic domains (e.g. youtube.com, facebook.com) from results.",
        },
        exclude_internal_backlinks: {
          type: "boolean",
          description: "Exclude internal backlinks from the target's own subdomains. Defaults to true.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
        filters: createDataForSeoFilterSchema(
          'Filter the returned competitors. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: rank (backlink rank of the competing domain, 0-1000); intersections (referring domains shared with the target). Example: {"field":"intersections","op":">","value":20}',
        ),
        order_by: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                minLength: 1,
                description: "Field to sort by. See the endpoint's list of sortable fields.",
              },
              dir: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
                description: "Sort direction: asc or desc. Defaults to desc.",
              },
            },
            required: ["field"],
            additionalProperties: false,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 3,
          description:
            'Sort the returned competitors. Each rule is {"field","dir"} with dir asc or desc; up to 3 rules, applied in order. Sortable fields: rank, intersections.',
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of records to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of records to skip from the start of the results.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for Find competitors by shared referring domains.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "find_seo_backlink_domain_intersection",
    operationId: "postSeoBacklinksDomainIntersection",
    description: "Find domains linking to multiple targets.",
    method: "POST",
    path: "/seo/backlinks/domain-intersection",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "targets",
      "exclude_targets",
      "intersection_mode",
      "backlinks_status_type",
      "include_subdomains",
      "include_indirect_links",
      "exclude_internal_backlinks",
      "internal_list_limit",
      "rank_scale",
      "filters",
      "backlinks_filters",
      "order_by",
      "limit",
      "offset",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 20,
          description:
            "Domains, subdomains, or pages to find common referring domains for (1-20). Order is preserved as the 1-based index in the response.",
        },
        exclude_targets: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "One item in the array.",
          },
          maxItems: 10,
          description: "Domains, subdomains, or pages to exclude (up to 10). Domains linking to these are dropped.",
        },
        intersection_mode: {
          type: "string",
          enum: ["all", "partial"],
          description:
            "all (default) returns domains linking to any target; partial returns only domains linking to every target.",
        },
        backlinks_status_type: {
          type: "string",
          enum: ["live", "all", "lost"],
          description: "Which backlinks to count: live (found on the last check, default), all, or lost.",
        },
        include_subdomains: {
          type: "boolean",
          description: "Include backlinks pointing to the target's subdomains. Defaults to true.",
        },
        include_indirect_links: {
          type: "boolean",
          description: "Include indirect links (via redirects or canonicals) to the target. Defaults to true.",
        },
        exclude_internal_backlinks: {
          type: "boolean",
          description: "Exclude internal backlinks from the target's own subdomains. Defaults to true.",
        },
        internal_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of entries kept in each referring_links_* breakdown map. Defaults to 10.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
        filters: createDataForSeoFilterSchema(
          'Filter the intersecting domains. Prefix each metric field with the 1-based target index, e.g. 1.rank, 2.referring_domains. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: rank (backlink rank, 0-1000); backlinks (number of backlinks); backlinks_spam_score (average spam score, 0-100); referring_domains (referring domains count); referring_main_domains (referring root domains count); referring_pages (referring pages count); referring_ips (referring IPs count); referring_subnets (referring subnets count); broken_backlinks (backlinks to broken pages); broken_pages (broken pages still receiving backlinks); first_seen (ISO date the first backlink was found); lost_date (ISO date the last backlink was lost). Example: {"and":[{"field":"1.rank","op":">","value":300},{"field":"2.rank","op":">","value":300}]}',
        ),
        backlinks_filters: createDataForSeoFilterSchema(
          'Filter the underlying individual backlinks before the aggregate metrics are computed. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: dofollow (boolean, link is dofollow); is_new (boolean, appeared since the last check); is_lost (boolean, lost since the last check); is_broken (boolean, points to a broken page); rank (referring page rank, 0-1000); page_from_rank (referring page rank, 0-1000); domain_from_rank (referring domain rank, 0-1000); backlink_spam_score (spam score of the referring page, 0-100); item_type (anchor, image, link, redirect, or canonical); anchor (anchor text); tld_from (top-level domain of the referring page); semantic_location (link location, e.g. article, footer); first_seen (ISO date the backlink was first seen); last_seen (ISO date the backlink was last seen). Example: {"and":[{"field":"dofollow","op":"=","value":true},{"field":"backlink_spam_score","op":"<","value":10}]}',
        ),
        order_by: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                minLength: 1,
                description: "Field to sort by. See the endpoint's list of sortable fields.",
              },
              dir: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
                description: "Sort direction: asc or desc. Defaults to desc.",
              },
            },
            required: ["field"],
            additionalProperties: false,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 3,
          description:
            'Sort the intersecting domains. Prefix each field with the 1-based target index, e.g. 1.rank. Each rule is {"field","dir"} with dir asc or desc; up to 3 rules, applied in order. Sortable fields: rank, backlinks, backlinks_spam_score, referring_domains, referring_main_domains, referring_pages, referring_ips, referring_subnets, broken_backlinks, broken_pages, first_seen, lost_date.',
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of records to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of records to skip from the start of the results.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps the headline counters; full adds nofollow variants and the referring_links_* breakdown maps. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for Find domains linking to multiple targets.",
      required: ["targets"],
    },
    paginated: false,
  },
  {
    name: "summarize_seo_backlink_domain_pages",
    operationId: "postSeoBacklinksDomainPagesSummary",
    description: "Summarize backlinks for each page of a target.",
    method: "POST",
    path: "/seo/backlinks/domain-pages-summary",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "target",
      "backlinks_status_type",
      "include_subdomains",
      "include_indirect_links",
      "exclude_internal_backlinks",
      "internal_list_limit",
      "rank_scale",
      "filters",
      "backlinks_filters",
      "order_by",
      "limit",
      "offset",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Domain, subdomain, or page to analyze. A domain or subdomain is specified without https:// and www. (example.com); a page is specified as an absolute URL (https://example.com/blog/).",
        },
        backlinks_status_type: {
          type: "string",
          enum: ["live", "all", "lost"],
          description: "Which backlinks to count: live (found on the last check, default), all, or lost.",
        },
        include_subdomains: {
          type: "boolean",
          description: "Include backlinks pointing to the target's subdomains. Defaults to true.",
        },
        include_indirect_links: {
          type: "boolean",
          description: "Include indirect links (via redirects or canonicals) to the target. Defaults to true.",
        },
        exclude_internal_backlinks: {
          type: "boolean",
          description: "Exclude internal backlinks from the target's own subdomains. Defaults to true.",
        },
        internal_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of entries kept in each referring_links_* breakdown map. Defaults to 10.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
        filters: createDataForSeoFilterSchema(
          'Filter the returned page summaries. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: url (page URL on the target); rank (backlink rank, 0-1000); backlinks (number of backlinks); backlinks_spam_score (average spam score, 0-100); referring_domains (referring domains count); referring_main_domains (referring root domains count); referring_pages (referring pages count); referring_ips (referring IPs count); referring_subnets (referring subnets count); broken_backlinks (backlinks to broken pages); broken_pages (broken pages still receiving backlinks); first_seen (ISO date the first backlink was found); lost_date (ISO date the last backlink was lost). Example: {"field":"referring_domains","op":">","value":5}',
        ),
        backlinks_filters: createDataForSeoFilterSchema(
          'Filter the underlying individual backlinks before the aggregate metrics are computed. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: dofollow (boolean, link is dofollow); is_new (boolean, appeared since the last check); is_lost (boolean, lost since the last check); is_broken (boolean, points to a broken page); rank (referring page rank, 0-1000); page_from_rank (referring page rank, 0-1000); domain_from_rank (referring domain rank, 0-1000); backlink_spam_score (spam score of the referring page, 0-100); item_type (anchor, image, link, redirect, or canonical); anchor (anchor text); tld_from (top-level domain of the referring page); semantic_location (link location, e.g. article, footer); first_seen (ISO date the backlink was first seen); last_seen (ISO date the backlink was last seen). Example: {"and":[{"field":"dofollow","op":"=","value":true},{"field":"backlink_spam_score","op":"<","value":10}]}',
        ),
        order_by: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                minLength: 1,
                description: "Field to sort by. See the endpoint's list of sortable fields.",
              },
              dir: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
                description: "Sort direction: asc or desc. Defaults to desc.",
              },
            },
            required: ["field"],
            additionalProperties: false,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 3,
          description:
            'Sort the returned page summaries. Each rule is {"field","dir"} with dir asc or desc; up to 3 rules, applied in order. Sortable fields: url, rank, backlinks, backlinks_spam_score, referring_domains, referring_main_domains, referring_pages, referring_ips, referring_subnets, broken_backlinks, broken_pages, first_seen, lost_date.',
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of records to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of records to skip from the start of the results.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps the headline counters; full adds nofollow variants and the referring_links_* breakdown maps. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for Summarize backlinks for each page of a target.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "list_seo_backlink_domain_pages",
    operationId: "postSeoBacklinksDomainPages",
    description: "List target pages ranked by backlinks.",
    method: "POST",
    path: "/seo/backlinks/domain-pages",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "target",
      "backlinks_status_type",
      "include_subdomains",
      "exclude_internal_backlinks",
      "internal_list_limit",
      "rank_scale",
      "filters",
      "backlinks_filters",
      "order_by",
      "limit",
      "offset",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Domain, subdomain, or page to analyze. A domain or subdomain is specified without https:// and www. (example.com); a page is specified as an absolute URL (https://example.com/blog/).",
        },
        backlinks_status_type: {
          type: "string",
          enum: ["live", "all", "lost"],
          description: "Which backlinks to count: live (found on the last check, default), all, or lost.",
        },
        include_subdomains: {
          type: "boolean",
          description: "Include backlinks pointing to the target's subdomains. Defaults to true.",
        },
        exclude_internal_backlinks: {
          type: "boolean",
          description: "Exclude internal backlinks from the target's own subdomains. Defaults to true.",
        },
        internal_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of entries kept in each referring_links_* breakdown map. Defaults to 10.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
        filters: createDataForSeoFilterSchema(
          'Filter the returned target pages. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: url (page URL on the target); status_code (last HTTP status code of the page); size (page size in bytes); media_type (media type, e.g. text/html); first_visited (ISO date first crawled); fetch_time (ISO date last crawled); rank (backlink rank, 0-1000); backlinks (number of backlinks); backlinks_spam_score (average spam score, 0-100); referring_domains (referring domains count); referring_main_domains (referring root domains count); referring_pages (referring pages count); referring_ips (referring IPs count); referring_subnets (referring subnets count); broken_backlinks (backlinks to broken pages); broken_pages (broken pages still receiving backlinks); first_seen (ISO date the first backlink was found); lost_date (ISO date the last backlink was lost). Example: {"and":[{"field":"referring_domains","op":">","value":5},{"field":"status_code","op":"=","value":200}]}',
        ),
        backlinks_filters: createDataForSeoFilterSchema(
          'Filter the underlying individual backlinks before the aggregate metrics are computed. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: dofollow (boolean, link is dofollow); is_new (boolean, appeared since the last check); is_lost (boolean, lost since the last check); is_broken (boolean, points to a broken page); rank (referring page rank, 0-1000); page_from_rank (referring page rank, 0-1000); domain_from_rank (referring domain rank, 0-1000); backlink_spam_score (spam score of the referring page, 0-100); item_type (anchor, image, link, redirect, or canonical); anchor (anchor text); tld_from (top-level domain of the referring page); semantic_location (link location, e.g. article, footer); first_seen (ISO date the backlink was first seen); last_seen (ISO date the backlink was last seen). Example: {"and":[{"field":"dofollow","op":"=","value":true},{"field":"backlink_spam_score","op":"<","value":10}]}',
        ),
        order_by: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                minLength: 1,
                description: "Field to sort by. See the endpoint's list of sortable fields.",
              },
              dir: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
                description: "Sort direction: asc or desc. Defaults to desc.",
              },
            },
            required: ["field"],
            additionalProperties: false,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 3,
          description:
            'Sort the returned target pages. Each rule is {"field","dir"} with dir asc or desc; up to 3 rules, applied in order. Sortable fields: url, status_code, size, media_type, first_visited, fetch_time, rank, backlinks, backlinks_spam_score, referring_domains, referring_main_domains, referring_pages, referring_ips, referring_subnets, broken_backlinks, broken_pages, first_seen, lost_date.',
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of records to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of records to skip from the start of the results.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps the headline counters; full adds nofollow variants and the referring_links_* breakdown maps. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for List target pages ranked by backlinks.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "get_seo_backlink_history",
    operationId: "postSeoBacklinksHistory",
    description: "Get historical backlink metrics for a target.",
    method: "POST",
    path: "/seo/backlinks/history",
    pathFields: [],
    queryFields: [],
    bodyFields: ["target", "date_from", "date_to", "rank_scale", "view"],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Domain, subdomain, or page to analyze. A domain or subdomain is specified without https:// and www. (example.com); a page is specified as an absolute URL (https://example.com/blog/).",
        },
        date_from: {
          type: "string",
          description: "Start date (yyyy-mm-dd) for the history. Minimum 2019-01-30; defaults to one year ago.",
        },
        date_to: {
          type: "string",
          description: "End date (yyyy-mm-dd). Defaults to today.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps the headline counters; full adds nofollow variants and the referring_links_* breakdown maps. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Get historical backlink metrics for a target.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "list_seo_backlinks",
    operationId: "postSeoBacklinksList",
    description: "List individual backlinks pointing to a target.",
    method: "POST",
    path: "/seo/backlinks/list",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "target",
      "mode",
      "backlinks_status_type",
      "include_subdomains",
      "include_indirect_links",
      "exclude_internal_backlinks",
      "rank_scale",
      "filters",
      "order_by",
      "limit",
      "offset",
      "search_after_token",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Domain, subdomain, or page to analyze. A domain or subdomain is specified without https:// and www. (example.com); a page is specified as an absolute URL (https://example.com/blog/).",
        },
        mode: {
          type: "string",
          enum: ["as_is", "one_per_domain", "one_per_anchor"],
          description:
            "Result grouping: as_is returns every backlink (default), one_per_domain returns one per referring domain, one_per_anchor returns one per anchor.",
        },
        backlinks_status_type: {
          type: "string",
          enum: ["live", "all", "lost"],
          description: "Which backlinks to count: live (found on the last check, default), all, or lost.",
        },
        include_subdomains: {
          type: "boolean",
          description: "Include backlinks pointing to the target's subdomains. Defaults to true.",
        },
        include_indirect_links: {
          type: "boolean",
          description: "Include indirect links (via redirects or canonicals) to the target. Defaults to true.",
        },
        exclude_internal_backlinks: {
          type: "boolean",
          description: "Exclude internal backlinks from the target's own subdomains. Defaults to true.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
        filters: createDataForSeoFilterSchema(
          'Filter the returned individual backlinks. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: domain_from (domain of the referring page); url_from (URL of the referring page); url_to (target URL the backlink points to); domain_to (target domain the backlink points to); dofollow (boolean, link is dofollow); is_new (boolean, appeared since the last check); is_lost (boolean, lost since the last check); is_broken (boolean, points to a broken page); rank (referring page rank, 0-1000); page_from_rank (referring page rank, 0-1000); domain_from_rank (referring domain rank, 0-1000); backlink_spam_score (spam score of the referring page, 0-100); item_type (anchor, image, link, redirect, or canonical); anchor (anchor text); tld_from (top-level domain of the referring page); semantic_location (link location, e.g. article, footer); first_seen (ISO date the backlink was first seen); last_seen (ISO date the backlink was last seen). Example: {"and":[{"field":"dofollow","op":"=","value":true},{"field":"is_broken","op":"=","value":false}]}',
        ),
        order_by: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                minLength: 1,
                description: "Field to sort by. See the endpoint's list of sortable fields.",
              },
              dir: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
                description: "Sort direction: asc or desc. Defaults to desc.",
              },
            },
            required: ["field"],
            additionalProperties: false,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 3,
          description:
            'Sort the returned backlinks. Each rule is {"field","dir"} with dir asc or desc; up to 3 rules, applied in order. Sortable fields: domain_from, url_from, url_to, domain_to, dofollow, is_new, is_lost, is_broken, rank, page_from_rank, domain_from_rank, backlink_spam_score, item_type, anchor, tld_from, semantic_location, first_seen, last_seen.',
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of records to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of records to skip from the start of the results.",
        },
        search_after_token: {
          type: "string",
          description:
            "Continuation token from a previous response, used to page past the 20,000-result offset limit. Keep all other parameters identical when paging.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls backlink detail. summary keeps link identity and headline rank/anchor data; full adds referring-page details and link attributes. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for List individual backlinks pointing to a target.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "find_seo_backlink_page_intersection",
    operationId: "postSeoBacklinksPageIntersection",
    description: "Find pages linking to multiple targets.",
    method: "POST",
    path: "/seo/backlinks/page-intersection",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "targets",
      "exclude_targets",
      "intersection_mode",
      "backlinks_status_type",
      "include_subdomains",
      "include_indirect_links",
      "exclude_internal_backlinks",
      "internal_list_limit",
      "rank_scale",
      "filters",
      "order_by",
      "limit",
      "offset",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 20,
          description:
            "Domains, subdomains, or pages to find common referring pages for (1-20). Order is preserved as the 1-based index in the response.",
        },
        exclude_targets: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "One item in the array.",
          },
          maxItems: 10,
          description: "Domains, subdomains, or pages to exclude (up to 10). Pages linking to these are dropped.",
        },
        intersection_mode: {
          type: "string",
          enum: ["all", "partial"],
          description:
            "all (default) returns pages linking to any target; partial returns only pages linking to every target.",
        },
        backlinks_status_type: {
          type: "string",
          enum: ["live", "all", "lost"],
          description: "Which backlinks to count: live (found on the last check, default), all, or lost.",
        },
        include_subdomains: {
          type: "boolean",
          description: "Include backlinks pointing to the target's subdomains. Defaults to true.",
        },
        include_indirect_links: {
          type: "boolean",
          description: "Include indirect links (via redirects or canonicals) to the target. Defaults to true.",
        },
        exclude_internal_backlinks: {
          type: "boolean",
          description: "Exclude internal backlinks from the target's own subdomains. Defaults to true.",
        },
        internal_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of entries kept in each referring_links_* breakdown map. Defaults to 10.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
        filters: createDataForSeoFilterSchema(
          'Filter the intersecting referring pages. Prefix each backlink field with the 1-based target index, e.g. 1.dofollow, 2.rank. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: dofollow (boolean, link is dofollow); is_new (boolean, appeared since the last check); is_lost (boolean, lost since the last check); is_broken (boolean, points to a broken page); rank (referring page rank, 0-1000); page_from_rank (referring page rank, 0-1000); domain_from_rank (referring domain rank, 0-1000); backlink_spam_score (spam score of the referring page, 0-100); item_type (anchor, image, link, redirect, or canonical); anchor (anchor text); tld_from (top-level domain of the referring page); semantic_location (link location, e.g. article, footer); first_seen (ISO date the backlink was first seen); last_seen (ISO date the backlink was last seen). Example: {"field":"1.dofollow","op":"=","value":true}',
        ),
        order_by: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                minLength: 1,
                description: "Field to sort by. See the endpoint's list of sortable fields.",
              },
              dir: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
                description: "Sort direction: asc or desc. Defaults to desc.",
              },
            },
            required: ["field"],
            additionalProperties: false,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 3,
          description:
            'Sort the intersecting referring pages. Prefix each field with the 1-based target index, e.g. 1.rank. Each rule is {"field","dir"} with dir asc or desc; up to 3 rules, applied in order. Sortable fields: dofollow, is_new, is_lost, is_broken, rank, page_from_rank, domain_from_rank, backlink_spam_score, item_type, anchor, tld_from, semantic_location, first_seen, last_seen.',
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of records to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of records to skip from the start of the results.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls backlink detail. summary keeps link identity and headline rank/anchor data; full adds referring-page details and link attributes. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for Find pages linking to multiple targets.",
      required: ["targets"],
    },
    paginated: false,
  },
  {
    name: "list_seo_referring_domains",
    operationId: "postSeoBacklinksReferringDomains",
    description: "List referring domains pointing to a target.",
    method: "POST",
    path: "/seo/backlinks/referring-domains",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "target",
      "backlinks_status_type",
      "include_subdomains",
      "include_indirect_links",
      "exclude_internal_backlinks",
      "internal_list_limit",
      "rank_scale",
      "filters",
      "order_by",
      "limit",
      "offset",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Domain, subdomain, or page to analyze. A domain or subdomain is specified without https:// and www. (example.com); a page is specified as an absolute URL (https://example.com/blog/).",
        },
        backlinks_status_type: {
          type: "string",
          enum: ["live", "all", "lost"],
          description: "Which backlinks to count: live (found on the last check, default), all, or lost.",
        },
        include_subdomains: {
          type: "boolean",
          description: "Include backlinks pointing to the target's subdomains. Defaults to true.",
        },
        include_indirect_links: {
          type: "boolean",
          description: "Include indirect links (via redirects or canonicals) to the target. Defaults to true.",
        },
        exclude_internal_backlinks: {
          type: "boolean",
          description: "Exclude internal backlinks from the target's own subdomains. Defaults to true.",
        },
        internal_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of entries kept in each referring_links_* breakdown map. Defaults to 10.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
        filters: createDataForSeoFilterSchema(
          'Filter the returned referring domains. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: domain (referring domain); rank (backlink rank, 0-1000); backlinks (number of backlinks); backlinks_spam_score (average spam score, 0-100); referring_domains (referring domains count); referring_main_domains (referring root domains count); referring_pages (referring pages count); referring_ips (referring IPs count); referring_subnets (referring subnets count); broken_backlinks (backlinks to broken pages); broken_pages (broken pages still receiving backlinks); first_seen (ISO date the first backlink was found); lost_date (ISO date the last backlink was lost). Example: {"and":[{"field":"rank","op":">","value":200},{"field":"backlinks","op":">","value":10}]}',
        ),
        order_by: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                minLength: 1,
                description: "Field to sort by. See the endpoint's list of sortable fields.",
              },
              dir: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
                description: "Sort direction: asc or desc. Defaults to desc.",
              },
            },
            required: ["field"],
            additionalProperties: false,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 3,
          description:
            'Sort the returned referring domains. Each rule is {"field","dir"} with dir asc or desc; up to 3 rules, applied in order. Sortable fields: domain, rank, backlinks, backlinks_spam_score, referring_domains, referring_main_domains, referring_pages, referring_ips, referring_subnets, broken_backlinks, broken_pages, first_seen, lost_date.',
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of records to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of records to skip from the start of the results.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps the headline counters; full adds nofollow variants and the referring_links_* breakdown maps. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for List referring domains pointing to a target.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "list_seo_referring_networks",
    operationId: "postSeoBacklinksReferringNetworks",
    description: "List referring IP networks pointing to a target.",
    method: "POST",
    path: "/seo/backlinks/referring-networks",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "target",
      "network_address_type",
      "backlinks_status_type",
      "include_subdomains",
      "include_indirect_links",
      "exclude_internal_backlinks",
      "internal_list_limit",
      "rank_scale",
      "filters",
      "backlinks_filters",
      "order_by",
      "limit",
      "offset",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Domain, subdomain, or page to analyze. A domain or subdomain is specified without https:// and www. (example.com); a page is specified as an absolute URL (https://example.com/blog/).",
        },
        network_address_type: {
          type: "string",
          enum: ["ip", "subnet"],
          description: "Group referring networks by individual IP (ip, default) or by subnet (subnet).",
        },
        backlinks_status_type: {
          type: "string",
          enum: ["live", "all", "lost"],
          description: "Which backlinks to count: live (found on the last check, default), all, or lost.",
        },
        include_subdomains: {
          type: "boolean",
          description: "Include backlinks pointing to the target's subdomains. Defaults to true.",
        },
        include_indirect_links: {
          type: "boolean",
          description: "Include indirect links (via redirects or canonicals) to the target. Defaults to true.",
        },
        exclude_internal_backlinks: {
          type: "boolean",
          description: "Exclude internal backlinks from the target's own subdomains. Defaults to true.",
        },
        internal_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of entries kept in each referring_links_* breakdown map. Defaults to 10.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
        filters: createDataForSeoFilterSchema(
          'Filter the returned referring networks. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: rank (backlink rank, 0-1000); backlinks (number of backlinks); backlinks_spam_score (average spam score, 0-100); referring_domains (referring domains count); referring_main_domains (referring root domains count); referring_pages (referring pages count); referring_ips (referring IPs count); referring_subnets (referring subnets count); broken_backlinks (backlinks to broken pages); broken_pages (broken pages still receiving backlinks); first_seen (ISO date the first backlink was found); lost_date (ISO date the last backlink was lost). Example: {"field":"referring_domains","op":">","value":5}',
        ),
        backlinks_filters: createDataForSeoFilterSchema(
          'Filter the underlying individual backlinks before the aggregate metrics are computed. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: dofollow (boolean, link is dofollow); is_new (boolean, appeared since the last check); is_lost (boolean, lost since the last check); is_broken (boolean, points to a broken page); rank (referring page rank, 0-1000); page_from_rank (referring page rank, 0-1000); domain_from_rank (referring domain rank, 0-1000); backlink_spam_score (spam score of the referring page, 0-100); item_type (anchor, image, link, redirect, or canonical); anchor (anchor text); tld_from (top-level domain of the referring page); semantic_location (link location, e.g. article, footer); first_seen (ISO date the backlink was first seen); last_seen (ISO date the backlink was last seen). Example: {"and":[{"field":"dofollow","op":"=","value":true},{"field":"backlink_spam_score","op":"<","value":10}]}',
        ),
        order_by: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                minLength: 1,
                description: "Field to sort by. See the endpoint's list of sortable fields.",
              },
              dir: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
                description: "Sort direction: asc or desc. Defaults to desc.",
              },
            },
            required: ["field"],
            additionalProperties: false,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 3,
          description:
            'Sort the returned referring networks. Each rule is {"field","dir"} with dir asc or desc; up to 3 rules, applied in order. Sortable fields: rank, backlinks, backlinks_spam_score, referring_domains, referring_main_domains, referring_pages, referring_ips, referring_subnets, broken_backlinks, broken_pages, first_seen, lost_date.',
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of records to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of records to skip from the start of the results.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps the headline counters; full adds nofollow variants and the referring_links_* breakdown maps. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for List referring IP networks pointing to a target.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "get_seo_backlink_summary",
    operationId: "postSeoBacklinksSummary",
    description: "Get the backlink profile summary for a target.",
    method: "POST",
    path: "/seo/backlinks/summary",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "target",
      "backlinks_status_type",
      "include_subdomains",
      "include_indirect_links",
      "exclude_internal_backlinks",
      "internal_list_limit",
      "rank_scale",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Domain, subdomain, or page to analyze. A domain or subdomain is specified without https:// and www. (example.com); a page is specified as an absolute URL (https://example.com/blog/).",
        },
        backlinks_status_type: {
          type: "string",
          enum: ["live", "all", "lost"],
          description: "Which backlinks to count: live (found on the last check, default), all, or lost.",
        },
        include_subdomains: {
          type: "boolean",
          description: "Include backlinks pointing to the target's subdomains. Defaults to true.",
        },
        include_indirect_links: {
          type: "boolean",
          description: "Include indirect links (via redirects or canonicals) to the target. Defaults to true.",
        },
        exclude_internal_backlinks: {
          type: "boolean",
          description: "Exclude internal backlinks from the target's own subdomains. Defaults to true.",
        },
        internal_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of entries kept in each referring_links_* breakdown map. Defaults to 10.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps the headline counters; full adds nofollow variants and the referring_links_* breakdown maps. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Get the backlink profile summary for a target.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "get_seo_new_lost_backlinks_timeseries",
    operationId: "postSeoBacklinksTimeseriesNewLost",
    description: "Get new and lost backlinks over time.",
    method: "POST",
    path: "/seo/backlinks/timeseries-new-lost",
    pathFields: [],
    queryFields: [],
    bodyFields: ["target", "date_from", "date_to", "group_range", "include_subdomains"],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Domain, subdomain, or page to analyze. A domain or subdomain is specified without https:// and www. (example.com); a page is specified as an absolute URL (https://example.com/blog/).",
        },
        date_from: {
          type: "string",
          description: "Start date (yyyy-mm-dd) for the series. Minimum 2019-01-30; defaults to one month ago.",
        },
        date_to: {
          type: "string",
          description: "End date (yyyy-mm-dd). Defaults to today.",
        },
        group_range: {
          type: "string",
          enum: ["day", "week", "month", "year"],
          description: "Granularity used to group the series. Defaults to month.",
        },
        include_subdomains: {
          type: "boolean",
          description: "Include backlinks pointing to the target's subdomains. Defaults to true.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Get new and lost backlinks over time.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "get_seo_backlink_timeseries",
    operationId: "postSeoBacklinksTimeseries",
    description: "Get backlink metrics over time.",
    method: "POST",
    path: "/seo/backlinks/timeseries",
    pathFields: [],
    queryFields: [],
    bodyFields: ["target", "date_from", "date_to", "group_range", "include_subdomains", "rank_scale"],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          description:
            "Domain, subdomain, or page to analyze. A domain or subdomain is specified without https:// and www. (example.com); a page is specified as an absolute URL (https://example.com/blog/).",
        },
        date_from: {
          type: "string",
          description: "Start date (yyyy-mm-dd) for the series. Minimum 2019-01-30; defaults to one month ago.",
        },
        date_to: {
          type: "string",
          description: "End date (yyyy-mm-dd). Defaults to today.",
        },
        group_range: {
          type: "string",
          enum: ["day", "week", "month", "year"],
          description: "Granularity used to group the series. Defaults to month.",
        },
        include_subdomains: {
          type: "boolean",
          description: "Include backlinks pointing to the target's subdomains. Defaults to true.",
        },
        rank_scale: {
          type: "string",
          enum: ["one_hundred", "one_thousand"],
          description: "Scale for rank values: one_thousand (0-1000, default) or one_hundred (0-100).",
        },
      },
      additionalProperties: false,
      description: "The input payload for Get backlink metrics over time.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "estimate_seo_bulk_traffic",
    operationId: "postSeoCompetitorsBulkTraffic",
    description: "Estimate organic traffic for domains.",
    method: "POST",
    path: "/seo/competitors/bulk-traffic",
    pathFields: [],
    queryFields: [],
    bodyFields: ["targets", "location", "language", "view"],
    inputSchema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 253,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 1000,
          description: "Domains to estimate traffic for (1-1000).",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps headline traffic and top positions, full adds the complete position breakdown. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Estimate organic traffic for domains.",
      required: ["targets"],
    },
    paginated: false,
  },
  {
    name: "find_seo_domain_keyword_intersection",
    operationId: "postSeoCompetitorsDomainIntersection",
    description: "Find keywords two domains both rank for.",
    method: "POST",
    path: "/seo/competitors/domain-intersection",
    pathFields: [],
    queryFields: [],
    bodyFields: ["target1", "target2", "location", "language", "intersections", "limit", "offset", "view"],
    inputSchema: {
      type: "object",
      properties: {
        target1: {
          type: "string",
          minLength: 1,
          maxLength: 253,
          description: "First domain, such as example.com.",
        },
        target2: {
          type: "string",
          minLength: 1,
          maxLength: 253,
          description: "Second domain to compare against.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        intersections: {
          type: "boolean",
          description:
            "When true (default), return keywords both domains rank for. When false, return keywords the first domain ranks for but the second does not.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of keywords to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of keywords to skip from the start of the results.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "standard", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls keyword detail. summary keeps lean metrics, standard adds intent/bids/SERP context, full includes monthly trend data. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Find keywords two domains both rank for.",
      required: ["target1", "target2"],
    },
    paginated: false,
  },
  {
    name: "get_seo_domain_rank_overview",
    operationId: "postSeoCompetitorsDomainRankOverview",
    description: "Get a domain's ranking and traffic overview.",
    method: "POST",
    path: "/seo/competitors/domain-rank-overview",
    pathFields: [],
    queryFields: [],
    bodyFields: ["target", "location", "language", "view"],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 253,
          description: "Target domain, such as example.com or https://example.com. Specified without www.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. full (default) returns the complete position breakdown; summary keeps only headline traffic and top positions.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Get a domain's ranking and traffic overview.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "find_seo_domain_competitors",
    operationId: "postSeoCompetitorsDomain",
    description: "Find a domain's organic competitors.",
    method: "POST",
    path: "/seo/competitors/domain",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "target",
      "location",
      "language",
      "exclude_top_domains",
      "intersecting_domains",
      "limit",
      "offset",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 253,
          description: "Target domain, such as example.com or https://example.com. Specified without www.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        exclude_top_domains: {
          type: "boolean",
          description: "When true, exclude the largest global domains (e.g. wikipedia, amazon) from results.",
        },
        intersecting_domains: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 253,
            description: "One item in the array.",
          },
          maxItems: 20,
          description: "Restrict results to competitors that also share keywords with these domains.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of competing domains to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of domains to skip from the start of the results.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps headline traffic and top positions, full adds the complete position breakdown and full-domain metrics. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Find a domain's organic competitors.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "estimate_seo_historical_bulk_traffic",
    operationId: "postSeoCompetitorsHistoricalBulkTraffic",
    description: "Estimate historical traffic for domains.",
    method: "POST",
    path: "/seo/competitors/historical-bulk-traffic",
    pathFields: [],
    queryFields: [],
    bodyFields: ["targets", "location", "language", "date_from", "date_to"],
    inputSchema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 253,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 1000,
          description: "Domains to estimate historical traffic for (1-1000).",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        date_from: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Start of the history window. Date in yyyy-mm-dd format. Minimum date: 2019-01-01.",
        },
        date_to: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "End of the history window. Date in yyyy-mm-dd format. Minimum date: 2019-01-01.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Estimate historical traffic for domains.",
      required: ["targets"],
    },
    paginated: false,
  },
  {
    name: "get_seo_historical_rank_overview",
    operationId: "postSeoCompetitorsHistoricalRankOverview",
    description: "Get a domain's historical ranking overview.",
    method: "POST",
    path: "/seo/competitors/historical-rank-overview",
    pathFields: [],
    queryFields: [],
    bodyFields: ["target", "location", "language", "date_from", "date_to", "view"],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 253,
          description: "Target domain, such as example.com or https://example.com. Specified without www.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        date_from: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Start of the history window. Date in yyyy-mm-dd format. Minimum date: 2019-01-01.",
        },
        date_to: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "End of the history window. Date in yyyy-mm-dd format. Minimum date: 2019-01-01.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps headline traffic and top positions, full adds the complete position breakdown. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Get a domain's historical ranking overview.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "get_seo_historical_serps",
    operationId: "postSeoCompetitorsHistoricalSerps",
    description: "Get historical SERP snapshots for a keyword.",
    method: "POST",
    path: "/seo/competitors/historical-serps",
    pathFields: [],
    queryFields: [],
    bodyFields: ["keyword", "location", "language", "date_from", "date_to"],
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          minLength: 1,
          maxLength: 700,
          description: "Keyword to retrieve historical SERP snapshots for.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        date_from: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Start of the history window. Date in yyyy-mm-dd format. Minimum date: 2019-01-01.",
        },
        date_to: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "End of the history window. Date in yyyy-mm-dd format. Minimum date: 2019-01-01.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Get historical SERP snapshots for a keyword.",
      required: ["keyword"],
    },
    paginated: false,
  },
  {
    name: "find_seo_page_keyword_intersection",
    operationId: "postSeoCompetitorsPageIntersection",
    description: "Find keywords specific pages rank for.",
    method: "POST",
    path: "/seo/competitors/page-intersection",
    pathFields: [],
    queryFields: [],
    bodyFields: ["pages", "exclude_pages", "location", "language", "intersection_mode", "limit", "offset", "view"],
    inputSchema: {
      type: "object",
      properties: {
        pages: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 20,
          description: "Absolute page URLs to compare (1-20). A trailing /* wildcard matches a page and its sub-paths.",
        },
        exclude_pages: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            description: "One item in the array.",
          },
          maxItems: 10,
          description: "Page URLs to exclude (up to 10). Keywords where these rank are dropped.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        intersection_mode: {
          type: "string",
          enum: ["union", "intersect"],
          description:
            "union (default) returns keywords any page ranks for; intersect returns only keywords all pages rank for in the same SERP.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of keywords to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of keywords to skip from the start of the results.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "standard", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls keyword detail. summary keeps lean metrics, standard adds intent/bids/SERP context, full includes monthly trend data. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Find keywords specific pages rank for.",
      required: ["pages"],
    },
    paginated: false,
  },
  {
    name: "find_seo_ranked_keywords",
    operationId: "postSeoCompetitorsRankedKeywords",
    description: "Find the keywords a domain ranks for.",
    method: "POST",
    path: "/seo/competitors/ranked-keywords",
    pathFields: [],
    queryFields: [],
    bodyFields: ["target", "location", "language", "limit", "offset", "ignore_synonyms", "view"],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 253,
          description:
            "Target domain, such as example.com or https://example.com. Specified without www. A page URL can also be passed to get only that page's rankings.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of ranked keywords to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of keywords to skip from the start of the results.",
        },
        ignore_synonyms: {
          type: "boolean",
          description: "When true, exclude highly similar keyword variations from the results.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "standard", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls keyword detail. summary keeps lean metrics, standard adds intent/bids/SERP context, full includes monthly trend data. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Find the keywords a domain ranks for.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "list_seo_relevant_pages",
    operationId: "postSeoCompetitorsRelevantPages",
    description: "List a domain's top ranking pages.",
    method: "POST",
    path: "/seo/competitors/relevant-pages",
    pathFields: [],
    queryFields: [],
    bodyFields: ["target", "location", "language", "limit", "offset", "view"],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 253,
          description: "Target domain, such as example.com or https://example.com. Specified without www.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of pages to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of pages to skip from the start of the results.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps headline traffic and top positions, full adds the complete position breakdown. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for List a domain's top ranking pages.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "find_seo_serp_competitors",
    operationId: "postSeoCompetitorsSerp",
    description: "Find domains competing for keywords.",
    method: "POST",
    path: "/seo/competitors/serp",
    pathFields: [],
    queryFields: [],
    bodyFields: ["keywords", "location", "language", "include_subdomains", "limit", "offset"],
    inputSchema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 80,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 200,
          description: "Seed keywords (1-200). Returns the domains that rank for them.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        include_subdomains: {
          type: "boolean",
          description: "When true (default), count subdomain rankings toward each domain.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of competing domains to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of domains to skip from the start of the results.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Find domains competing for keywords.",
      required: ["keywords"],
    },
    paginated: false,
  },
  {
    name: "list_seo_subdomains",
    operationId: "postSeoCompetitorsSubdomains",
    description: "List a domain's subdomains with traffic.",
    method: "POST",
    path: "/seo/competitors/subdomains",
    pathFields: [],
    queryFields: [],
    bodyFields: ["target", "location", "language", "limit", "offset", "view"],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 253,
          description: "Target domain, such as example.com or https://example.com. Specified without www.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of subdomains to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of subdomains to skip from the start of the results.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls metric depth. summary keeps headline traffic and top positions, full adds the complete position breakdown. Defaults to summary.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for List a domain's subdomains with traffic.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "collect_seo_keyword_autocomplete",
    operationId: "postSeoKeywordsAutocomplete",
    description: "Collect autocomplete keyword suggestions.",
    method: "POST",
    path: "/seo/keywords/autocomplete",
    pathFields: [],
    queryFields: [],
    bodyFields: ["keyword", "location", "language", "cursor_pointer", "client"],
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          minLength: 1,
          maxLength: 700,
          description: "Seed query typed into Google search. Returns the autocomplete suggestions Google offers.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, full location name, or latitude,longitude,radius coordinate string. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        cursor_pointer: {
          type: "integer",
          minimum: 0,
          maximum: 700,
          description:
            "Cursor position within the keyword. Defaults to the end of the keyword, matching how Google expands suggestions as you type.",
        },
        client: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          description:
            "Autocomplete client to emulate, such as chrome or gws-wiz. Different clients can return different suggestion sets.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Collect autocomplete keyword suggestions.",
      required: ["keyword"],
    },
    paginated: false,
  },
  {
    name: "score_seo_keyword_difficulty",
    operationId: "postSeoKeywordsDifficulty",
    description: "Score keyword difficulty.",
    method: "POST",
    path: "/seo/keywords/difficulty",
    pathFields: [],
    queryFields: [],
    bodyFields: ["keywords", "location", "language"],
    inputSchema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 80,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 1000,
          description: "Keywords to score (1-1000). Returns the keyword difficulty for each.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Score keyword difficulty.",
      required: ["keywords"],
    },
    paginated: false,
  },
  {
    name: "find_seo_site_keywords",
    operationId: "postSeoKeywordsForSite",
    description: "Find keywords a domain ranks for.",
    method: "POST",
    path: "/seo/keywords/for-site",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "target",
      "location",
      "language",
      "limit",
      "offset",
      "offset_token",
      "include_subdomains",
      "include_serp_info",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 253,
          description:
            "Target domain, such as example.com or https://example.com. Returns keywords the domain is relevant for.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of keywords to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of keywords to skip from the start of the results.",
        },
        offset_token: {
          type: "string",
          minLength: 1,
          maxLength: 2000,
          description:
            "Pagination token from a previous response. When set, all other params except limit are ignored.",
        },
        include_subdomains: {
          type: "boolean",
          description: "When true (default), include keywords from subdomains of the target.",
        },
        include_serp_info: {
          type: "boolean",
          description:
            "When true, include SERP data (result count and SERP feature types) for each keyword. Can add source cost.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "standard", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls response size. summary keeps lean metrics, standard adds intent/bids/SERP context, full includes monthly trend data. Defaults to standard.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Find keywords a domain ranks for.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "get_seo_keyword_history",
    operationId: "postSeoKeywordsHistory",
    description: "Get historical keyword data.",
    method: "POST",
    path: "/seo/keywords/history",
    pathFields: [],
    queryFields: [],
    bodyFields: ["keywords", "location", "language"],
    inputSchema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 80,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 700,
          description: "Keywords to look up (1-700). Returns historical metrics since 2019 for each.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Get historical keyword data.",
      required: ["keywords"],
    },
    paginated: false,
  },
  {
    name: "discover_seo_keyword_ideas",
    operationId: "postSeoKeywordsIdeas",
    description: "Discover keyword ideas.",
    method: "POST",
    path: "/seo/keywords/ideas",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "keywords",
      "location",
      "language",
      "limit",
      "offset",
      "offset_token",
      "closely_variants",
      "ignore_synonyms",
      "include_serp_info",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 80,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 200,
          description:
            "Seed keywords (1-200). Returns search terms relevant to the product or service categories of these keywords.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of keyword ideas to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of keyword ideas to skip from the start of the results.",
        },
        offset_token: {
          type: "string",
          minLength: 1,
          maxLength: 2000,
          description:
            "Pagination token from a previous response. When set, all other params except limit are ignored.",
        },
        closely_variants: {
          type: "boolean",
          description:
            "When true, use phrase-match search; when false (default), use broad-match search for wider ideas.",
        },
        ignore_synonyms: {
          type: "boolean",
          description: "When true, exclude highly similar keywords and return only core keywords.",
        },
        include_serp_info: {
          type: "boolean",
          description:
            "When true, include SERP data (result count and SERP feature types) for each keyword. Can add source cost.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "standard", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls response size. summary keeps lean metrics, standard adds intent/bids/SERP context, full includes monthly trend data. Defaults to standard.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Discover keyword ideas.",
      required: ["keywords"],
    },
    paginated: false,
  },
  {
    name: "classify_seo_keyword_intent",
    operationId: "postSeoKeywordsIntent",
    description: "Classify keyword search intent.",
    method: "POST",
    path: "/seo/keywords/intent",
    pathFields: [],
    queryFields: [],
    bodyFields: ["keywords", "language"],
    inputSchema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 80,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 1000,
          description: "Keywords to classify (1-1000). Returns the search intent for each.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Classify keyword search intent.",
      required: ["keywords"],
    },
    paginated: false,
  },
  {
    name: "get_seo_keyword_overview",
    operationId: "postSeoKeywordsOverview",
    description: "Look up keyword metrics.",
    method: "POST",
    path: "/seo/keywords/overview",
    pathFields: [],
    queryFields: [],
    bodyFields: ["keywords", "location", "language", "include_serp_info", "view"],
    inputSchema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 80,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 700,
          description: "Keywords to look up (1-700). Returns current metrics for each keyword.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        include_serp_info: {
          type: "boolean",
          description:
            "When true, include SERP data (result count and SERP feature types) for each keyword. Can add source cost.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "standard", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls response size. summary keeps lean metrics, standard adds intent/bids/SERP context, full includes monthly trend data. Defaults to standard.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Look up keyword metrics.",
      required: ["keywords"],
    },
    paginated: false,
  },
  {
    name: "find_seo_related_keywords",
    operationId: "postSeoKeywordsRelated",
    description: "Find related keywords.",
    method: "POST",
    path: "/seo/keywords/related",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "keyword",
      "location",
      "language",
      "depth",
      "limit",
      "offset",
      "ignore_synonyms",
      "include_serp_info",
      "include_seed_keyword",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          description: "Seed keyword. Returns keywords from Google's 'searches related to' element.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        depth: {
          type: "integer",
          minimum: 0,
          maximum: 4,
          description:
            "Keyword search depth, 0-4. Higher depth returns more keywords (1about 8, 2about 72, 3about 584, 4about 4680). Defaults to 1.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of related keywords to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of related keywords to skip from the start of the results.",
        },
        ignore_synonyms: {
          type: "boolean",
          description: "When true, exclude highly similar keywords and return only core keywords.",
        },
        include_serp_info: {
          type: "boolean",
          description:
            "When true, include SERP data (result count and SERP feature types) for each keyword. Can add source cost.",
        },
        include_seed_keyword: {
          type: "boolean",
          description: "When true, include metrics for the seed keyword in the response.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "standard", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls response size. summary keeps lean metrics, standard adds intent/bids/SERP context, full includes monthly trend data. Defaults to standard.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Find related keywords.",
      required: ["keyword"],
    },
    paginated: false,
  },
  {
    name: "find_seo_keyword_suggestions",
    operationId: "postSeoKeywordsSuggestions",
    description: "Find keyword suggestions.",
    method: "POST",
    path: "/seo/keywords/suggestions",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "keyword",
      "location",
      "language",
      "limit",
      "offset",
      "offset_token",
      "exact_match",
      "ignore_synonyms",
      "include_serp_info",
      "include_seed_keyword",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          description: "Seed keyword. Returns long-tail search queries that include this keyword.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, or full location name. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Maximum number of keyword suggestions to return. Defaults to 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of keyword suggestions to skip from the start of the results.",
        },
        offset_token: {
          type: "string",
          minLength: 1,
          maxLength: 2000,
          description:
            "Pagination token from a previous response. When set, all other params except limit are ignored.",
        },
        exact_match: {
          type: "boolean",
          description: "When true, return only suggestions that contain the exact seed keyword in the same word order.",
        },
        ignore_synonyms: {
          type: "boolean",
          description: "When true, exclude highly similar keywords and return only core keywords.",
        },
        include_serp_info: {
          type: "boolean",
          description:
            "When true, include SERP data (result count and SERP feature types) for each keyword. Can add source cost.",
        },
        include_seed_keyword: {
          type: "boolean",
          description: "When true, include metrics for the seed keyword in the response.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "standard", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls response size. summary keeps lean metrics, standard adds intent/bids/SERP context, full includes monthly trend data. Defaults to standard.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Find keyword suggestions.",
      required: ["keyword"],
    },
    paginated: false,
  },
  {
    name: "collect_seo_serp",
    operationId: "postSeoSerp",
    description: "Collect organic SERP SEO evidence.",
    method: "POST",
    path: "/seo/serp",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "query",
      "target",
      "location",
      "language",
      "device",
      "os",
      "page",
      "depth",
      "limit",
      "view",
      "include_ai_overview",
      "people_also_ask_depth",
      "include_pixel_rankings",
      "viewport",
      "google_domain",
      "google_search_params",
      "include_omitted_results",
      "remove_url_params",
      "expand_related_results",
      "stop_at_target",
      "target_match",
      "target_search_mode",
      "target_element_types",
    ],
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 700,
          description: "Search query to inspect.",
        },
        target: {
          type: "string",
          minLength: 1,
          description:
            "Optional domain or URL to mark in the results, such as example.com or https://example.com/page.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, full location name, or latitude,longitude,radius coordinate string. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        device: {
          type: "string",
          enum: ["desktop", "mobile"],
          description: "SERP device type. Defaults to desktop.",
        },
        os: {
          allOf: [
            {
              type: "string",
              enum: ["windows", "macos", "android", "ios"],
              description: "The os value.",
            },
            {
              description:
                "Optional device operating system. Use windows/macos with desktop or android/ios with mobile.",
            },
          ],
          description: "The os value.",
        },
        page: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description:
            "1-based Google result page to start from. Defaults to 1. Implemented with Google's start parameter and ranks are adjusted to global SERP positions.",
        },
        depth: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          description:
            "Organic result depth to crawl from the requested page. Defaults to 10. DataForSEO bills source in 10-result pages; UnifAPI bills returned billable organic records.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          description:
            "Number of organic results to return, matching the limit parameter used across other UnifAPI endpoints. Maps to DataForSEO depth and is used only when depth is omitted; defaults to 10.",
        },
        view: {
          allOf: [
            {
              type: "string",
              enum: ["summary", "standard", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls response size. summary keeps lean rank evidence, standard omits raw extras, full includes raw rich SERP context. Defaults to standard.",
            },
          ],
          description: "The view value.",
        },
        include_ai_overview: {
          type: "boolean",
          description:
            "When true, ask DataForSEO to load asynchronous Google AI Overview blocks in the organic SERP when available. This can add source cost.",
        },
        people_also_ask_depth: {
          type: "integer",
          minimum: 1,
          maximum: 4,
          description:
            "Optional click depth for People Also Ask expansion. Useful for SEO content-gap research and can add source cost.",
        },
        include_pixel_rankings: {
          type: "boolean",
          description:
            "When true, request pixel rectangle data for above-the-fold and visual rank analysis. This can add source cost.",
        },
        viewport: {
          type: "object",
          properties: {
            width: {
              type: "integer",
              minimum: 240,
              maximum: 9999,
              description: "Browser viewport width for pixel ranking calculations.",
            },
            height: {
              type: "integer",
              minimum: 240,
              maximum: 9999,
              description: "Browser viewport height for pixel ranking calculations.",
            },
            pixel_ratio: {
              type: "number",
              minimum: 0.5,
              maximum: 3,
              description: "Browser device pixel ratio for pixel ranking calculations.",
            },
          },
          description: "Viewport settings used only with include_pixel_rankings.",
        },
        google_domain: {
          type: "string",
          minLength: 4,
          maxLength: 80,
          description: "Optional Google domain override such as google.co.uk or google.de.",
        },
        google_search_params: {
          type: "string",
          minLength: 1,
          maxLength: 500,
          description:
            "Advanced Google search URL parameters such as nfpr=1. Prefer typed fields like page and include_omitted_results when available.",
        },
        include_omitted_results: {
          type: "boolean",
          description:
            "When true, adds filter=0 to inspect Google results that may otherwise be omitted. Useful for deep rank checks.",
        },
        remove_url_params: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 80,
            description: "One item in the array.",
          },
          maxItems: 10,
          description: "URL query parameters to remove from result URLs before matching, such as srsltid.",
        },
        expand_related_results: {
          type: "boolean",
          description:
            "When true, return related/sitelink-style organic results as separate organic elements instead of nesting them.",
        },
        stop_at_target: {
          type: "boolean",
          description:
            "When true and target is provided, stop crawling once the target is found. Useful for cheaper deep-rank checks, but later competitors may be omitted.",
        },
        target_match: {
          type: "string",
          enum: ["domain", "with_subdomains", "wildcard"],
          description: "How stop_at_target should match the target. Defaults to with_subdomains.",
        },
        target_search_mode: {
          type: "string",
          enum: ["any", "all"],
          description:
            "When stop_at_target is true and multiple targets are used source, controls whether any or all targets stop the crawl. Defaults to any.",
        },
        target_element_types: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "organic",
              "paid",
              "local_pack",
              "featured_snippet",
              "events",
              "google_flights",
              "images",
              "jobs",
              "knowledge_graph",
              "local_service",
              "map",
              "scholarly_articles",
              "third_party_reviews",
              "twitter",
            ],
            description: "One item in the array.",
          },
          maxItems: 8,
          description:
            "SERP element types to inspect for stop_at_target matches. Defaults to all first-level URL/domain elements.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Collect organic SERP SEO evidence.",
      required: ["query"],
    },
    paginated: false,
  },
];
