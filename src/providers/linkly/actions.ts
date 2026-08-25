import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "linkly";

const workspaceIdSchema = s.nonEmptyString("The Linkly workspace ID.");
const linkIdSchema = s.integer("The Linkly link ID.");
const nullableText = (description: string) => s.nullableString(description);
const nullableUrl = (description: string) => s.nullable(s.url(description));

const ruleSchema = s.object(
  "A Linkly redirect rule.",
  {
    what: nullableText("The rule condition type."),
    matches: nullableText("The value matched by the rule."),
    url: nullableUrl("The destination URL used when the rule matches."),
    percentage: s.nullableInteger("The percentage assigned to this rule."),
  },
  { optional: ["what", "matches", "url", "percentage"] },
);

const filterSchema = s.object(
  "Exact-match filters for listing Linkly workspace links.",
  {
    domain: s.nonEmptyString("Filter links by domain."),
    slug: s.nonEmptyString("Filter links by slug."),
    utm_campaign: s.nonEmptyString("Filter links by UTM campaign."),
    utm_content: s.nonEmptyString("Filter links by UTM content."),
    utm_medium: s.nonEmptyString("Filter links by UTM medium."),
    utm_source: s.nonEmptyString("Filter links by UTM source."),
    utm_term: s.nonEmptyString("Filter links by UTM term."),
  },
  {
    optional: ["domain", "slug", "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term"],
  },
);

const linkMutationFields = {
  url: s.url("The destination URL."),
  domain: nullableText("Custom domain without a trailing slash."),
  domain_id: s.integer("Domain ID, used as an alternative to domain."),
  slug: s.nullable(
    s.string("Custom slug, starting with /.", {
      pattern: "^/",
    }),
  ),
  name: nullableText("Nickname for the link."),
  note: nullableText("Private note about this link."),
  enabled: s.boolean("Whether the link is active."),
  forward_params: s.boolean("Whether to forward query parameters to the destination."),
  utm_source: nullableText("UTM source value."),
  utm_medium: nullableText("UTM medium value."),
  utm_campaign: nullableText("UTM campaign value."),
  utm_term: nullableText("UTM term value."),
  utm_content: nullableText("UTM content value."),
  expiry_datetime: s.nullable(s.dateTime("Link expiration date and time.")),
  expiry_destination: nullableUrl("Redirect URL used after expiry."),
  expiry_clicks: s.nullableInteger("Expire the link after this many clicks."),
  public_analytics: s.boolean("Whether analytics are publicly accessible."),
  block_bots: s.boolean("Whether to block bot traffic."),
  hide_referrer: s.boolean("Whether to hide the referrer from the destination."),
  cloaking: s.boolean("Whether link cloaking is enabled."),
  gtm_id: nullableText("Google Tag Manager ID."),
  ga4_tag_id: nullableText("Google Analytics 4 tag ID."),
  fb_pixel_id: nullableText("Facebook Pixel ID."),
  tiktok_pixel_id: nullableText("TikTok Pixel ID."),
  og_title: nullableText("Open Graph title."),
  og_description: nullableText("Open Graph description."),
  og_image: nullableUrl("Open Graph image URL."),
  head_tags: nullableText("Custom HTML tags for the document head."),
  body_tags: nullableText("Custom HTML tags for the document body."),
  linkify_words: nullableText("Words to linkify."),
  replacements: nullableText("URL parameter replacements."),
  rules: s.array("Redirect rules for the link.", ruleSchema),
};

const optionalLinkMutationFields = [
  "domain",
  "domain_id",
  "slug",
  "name",
  "note",
  "enabled",
  "forward_params",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "expiry_datetime",
  "expiry_destination",
  "expiry_clicks",
  "public_analytics",
  "block_bots",
  "hide_referrer",
  "cloaking",
  "gtm_id",
  "ga4_tag_id",
  "fb_pixel_id",
  "tiktok_pixel_id",
  "og_title",
  "og_description",
  "og_image",
  "head_tags",
  "body_tags",
  "linkify_words",
  "replacements",
  "rules",
] as const;

const updateLinkFieldNames = ["url", ...optionalLinkMutationFields] as const;

const workspaceSchema = s.object(
  "A Linkly workspace.",
  {
    id: s.integer("Workspace ID."),
    name: s.string("Workspace name."),
  },
  { required: ["id", "name"] },
);

const linkRuleOutputSchema = s.looseObject("A redirect rule returned by Linkly.", {
  what: s.nullableString("The rule condition type."),
  matches: s.nullableString("The value matched by the rule."),
  url: s.nullableString("The destination URL used when the rule matches."),
  percentage: s.nullableInteger("The percentage assigned to this rule."),
});

const linkSchema = s.looseObject("A Linkly link resource.", {
  id: s.nullableInteger("Link ID."),
  workspace_id: s.nullableInteger("Workspace ID."),
  url: s.string("Destination URL."),
  full_url: s.string("Full shortened URL."),
  domain: s.nullableString("Short link domain."),
  slug: s.nullableString("Short link slug."),
  name: s.nullableString("Link nickname."),
  note: s.nullableString("Private note about this link."),
  enabled: s.nullableBoolean("Whether the link is active."),
  deleted: s.nullableBoolean("Whether the link is deleted."),
  clicks_total: s.integer("Total number of clicks."),
  clicks_today: s.integer("Number of clicks today."),
  clicks_thirty_days: s.integer("Number of clicks in the last 30 days."),
  sparkline: s.array("Recent click sparkline values.", s.integer("A sparkline point.")),
  utm_source: s.nullableString("UTM source value."),
  utm_medium: s.nullableString("UTM medium value."),
  utm_campaign: s.nullableString("UTM campaign value."),
  utm_term: s.nullableString("UTM term value."),
  utm_content: s.nullableString("UTM content value."),
  forward_params: s.nullableBoolean("Whether query parameters are forwarded."),
  rules: s.nullable(s.array("Redirect rules returned by Linkly.", linkRuleOutputSchema)),
});

const listLinksInputSchema = s.object(
  "Input for listing Linkly workspace links.",
  {
    workspace_id: workspaceIdSchema,
    search: s.nonEmptyString("Search query."),
    page: s.integer("Page number."),
    page_size: s.integer("Number of links to return."),
    sort_by: s.nonEmptyString("Field used to sort links."),
    sort_dir: s.stringEnum("Sort direction.", ["desc", "asc"]),
    filter: filterSchema,
  },
  { optional: ["search", "page", "page_size", "sort_by", "sort_dir", "filter"] },
);

const getLinkInputSchema = s.object(
  "Input for getting a Linkly link.",
  {
    id: linkIdSchema,
    workspace_id: workspaceIdSchema,
  },
  { optional: ["workspace_id"] },
);

const createLinkInputSchema = s.object(
  "Input for creating a Linkly link.",
  {
    workspace_id: workspaceIdSchema,
    ...linkMutationFields,
  },
  { optional: optionalLinkMutationFields },
);

const updateLinkInputSchema = s.object(
  "Input for updating a Linkly link.",
  {
    workspace_id: workspaceIdSchema,
    id: linkIdSchema,
    ...linkMutationFields,
  },
  { optional: updateLinkFieldNames },
);
updateLinkInputSchema.anyOf = updateLinkFieldNames.map((field) => ({ required: [field] }));

export const linklyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List Linkly workspaces available to the authenticated API key.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing Linkly workspaces.", {}),
    outputSchema: s.object(
      "The Linkly workspace list.",
      {
        workspaces: s.array("Workspaces returned by Linkly.", workspaceSchema),
      },
      { required: ["workspaces"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_links",
    description: "List links in a Linkly workspace with optional search, filters, and pagination.",
    requiredScopes: [],
    inputSchema: listLinksInputSchema,
    outputSchema: s.object(
      "The Linkly paginated link list.",
      {
        links: s.array("Links returned by Linkly.", linkSchema),
        page_number: s.integer("Current page number."),
        page_size: s.integer("Current page size."),
        total_entries: s.integer("Number of entries matching the query."),
        total_pages: s.integer("Total number of pages."),
        total_rows: s.integer("Total number of rows."),
        workspace_link_count: s.integer("Total number of links in the workspace."),
      },
      {
        optional: ["page_number", "page_size", "total_entries", "total_pages", "total_rows", "workspace_link_count"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_link",
    description: "Get a Linkly link by ID, optionally scoped to a workspace.",
    requiredScopes: [],
    inputSchema: getLinkInputSchema,
    outputSchema: s.object(
      "The Linkly link response.",
      {
        link: linkSchema,
      },
      { required: ["link"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_link",
    description: "Create a Linkly short link in a workspace.",
    requiredScopes: [],
    inputSchema: createLinkInputSchema,
    outputSchema: s.object(
      "The Linkly link create response.",
      {
        link: linkSchema,
      },
      { required: ["link"] },
    ),
  }),
  defineProviderAction(service, {
    name: "update_link",
    description: "Update a Linkly short link in a workspace.",
    requiredScopes: [],
    inputSchema: updateLinkInputSchema,
    outputSchema: s.object(
      "The Linkly link update response.",
      {
        link: linkSchema,
      },
      { required: ["link"] },
    ),
  }),
  defineProviderAction(service, {
    name: "delete_link",
    description: "Delete a Linkly short link from a workspace.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for deleting a Linkly link.",
      {
        workspace_id: workspaceIdSchema,
        id: linkIdSchema,
      },
      { required: ["workspace_id", "id"] },
    ),
    outputSchema: s.object(
      "The Linkly delete response.",
      {
        message: s.string("Delete result message returned by Linkly."),
      },
      { required: ["message"] },
    ),
  }),
];
