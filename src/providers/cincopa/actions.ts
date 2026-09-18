import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cincopa";

const looseItemSchema = s.looseObject("One raw Cincopa row returned by the upstream API.");
const paginationSchema = s.object("Pagination metadata returned by Cincopa list endpoints.", {
  page: s.integer("The current result page returned by Cincopa."),
  itemsPerPage: s.integer("The number of rows requested per page."),
  itemsCount: s.integer("The total number of rows available for the current query."),
  pageCount: s.integer("The total number of pages available for the current query."),
});
const tagCloudSchema = s.record("Mapping of Cincopa tag names to item counts.", s.integer("The item count."));
const positiveInteger = (description: string) => s.positiveInteger(description);
const nonEmptyString = (description: string) => s.nonEmptyString(description);
const stringArray = (description: string, itemDescription: string) =>
  s.stringArray(description, { minItems: 1, itemDescription });

export const cincopaActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_galleries",
    operationType: "read",
    description: "List galleries from a Cincopa account with optional search and tag filters.",
    inputSchema: s.object(
      "Input parameters for listing galleries from a Cincopa account.",
      {
        search: nonEmptyString("Search term matched against gallery captions, descriptions, IDs, and tags."),
        page: positiveInteger("Result page number to request from Cincopa."),
        itemsPerPage: positiveInteger("Maximum number of galleries to request in one page."),
        filterTags: stringArray(
          "Gallery tags to include or exclude. Prefix a value with '-' to exclude it.",
          "One gallery tag filter value.",
        ),
      },
      { optional: ["search", "page", "itemsPerPage", "filterTags"] },
    ),
    outputSchema: s.actionOutput({
      workspace: s.string("Workspace name returned by Cincopa for the request context."),
      galleries: s.array("Gallery rows returned by Cincopa.", looseItemSchema),
      tagCloud: tagCloudSchema,
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_gallery_items",
    operationType: "read",
    description: "List items from one Cincopa gallery by FID.",
    inputSchema: s.object(
      "Input parameters for listing items inside one Cincopa gallery.",
      {
        fid: nonEmptyString("The Cincopa gallery FID to inspect."),
        details: stringArray(
          "Metadata field names to request from Cincopa for each gallery item.",
          "One Cincopa metadata field name.",
        ),
        page: positiveInteger("Result page number to request from Cincopa."),
        itemsPerPage: positiveInteger("Maximum number of gallery items to request in one page."),
      },
      { optional: ["details", "page", "itemsPerPage"] },
    ),
    outputSchema: s.actionOutput({
      fid: s.string("The gallery FID returned by Cincopa."),
      uploadUrl: s.url("The upload URL returned for the gallery."),
      claimed: s.string("The gallery claim marker returned by Cincopa."),
      spfid: s.string("The secondary gallery identifier returned by Cincopa."),
      items: s.array("Gallery item rows returned by Cincopa.", looseItemSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_assets",
    operationType: "read",
    description: "List assets from a Cincopa account with optional metadata filters.",
    inputSchema: s.object(
      "Input parameters for listing assets from a Cincopa account.",
      {
        search: nonEmptyString("Free-text search term for asset metadata."),
        types: stringArray(
          "Asset types to include, such as image, video, audio, or other.",
          "One Cincopa asset type value.",
        ),
        rid: nonEmptyString("Exact Cincopa RID to search for."),
        referenceId: nonEmptyString("Exact Cincopa reference_id to search for."),
        tag: nonEmptyString("Asset tag filter value."),
        details: stringArray(
          "Metadata field names to request from Cincopa for each asset row.",
          "One Cincopa metadata field name.",
        ),
        page: positiveInteger("Result page number to request from Cincopa."),
        itemsPerPage: positiveInteger("Maximum number of assets to request in one page."),
      },
      { optional: ["search", "types", "rid", "referenceId", "tag", "details", "page", "itemsPerPage"] },
    ),
    outputSchema: s.actionOutput({
      items: s.array("Asset rows returned by Cincopa.", looseItemSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_asset_tags",
    operationType: "read",
    description: "List the asset tag cloud available in a Cincopa account.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing Cincopa asset tags."),
    outputSchema: s.actionOutput({ tagCloud: tagCloudSchema }),
  }),
] satisfies Array<
  ProviderActionDefinition<"list_galleries" | "list_gallery_items" | "list_assets" | "list_asset_tags">
>;
