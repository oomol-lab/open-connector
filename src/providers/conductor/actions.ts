import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "conductor";

const websiteIdSchema = s.nonEmptyString("The Conductor Monitoring website ID returned by list_websites.");
const scopeSchema = s.nonEmptyString(
  "The Conductor Monitoring scope, such as website, segment:<segment_id>, or segment_label:<segment_label>.",
);
const capturedAtSchema = s.nonEmptyString(
  "Optional historical capture timestamp in ISO 8601 format accepted by Conductor.",
);
const pageNumberSchema = s.positiveInteger(
  "The one-based page number to retrieve. Do not use together with page_cursor.",
);
const perPageSchema = s.positiveInteger("The number of records to return per page.", { maximum: 1000 });
const pageCursorSchema = s.nonEmptyString(
  "The page cursor returned by the previous Conductor Monitoring page-list response. Do not use together with page.",
);

const rawPayloadSchema = s.looseObject("The raw Conductor Monitoring JSON response.");
const looseDataObjectSchema = s.looseObject("The Conductor Monitoring data object.");
const looseDataArraySchema = s.array(
  "The Conductor Monitoring data array.",
  s.looseObject("One Conductor Monitoring record."),
);
const metadataFields = {
  data_captured_at: s.nullableString("The timestamp when Conductor captured the returned data."),
  is_data_golden: s.nullableBoolean("Whether Conductor marks the returned data as golden."),
  raw: rawPayloadSchema,
};
const optionalMetadataFields = ["data_captured_at", "is_data_golden"];

const websiteSchema = s.looseRequiredObject("One Conductor Monitoring website.", {
  id: s.string("The Conductor Monitoring website ID."),
  app_url: s.nullableString("The Conductor app URL for the website."),
  domain: s.nullableString("The website domain URL."),
  name: s.nullableString("The website display name when available."),
  page_capacity: s.nullableInteger("The configured page capacity for the website."),
});

const segmentSchema = s.looseRequiredObject("One Conductor Monitoring segment.", {
  id: s.string("The Conductor Monitoring segment ID."),
  color: s.nullableString("The segment color value."),
  label: s.nullableString("The segment label."),
  shortcode: s.nullableString("The segment shortcode when available."),
});

export const conductorActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_websites",
    description: "List websites available in the connected Conductor Monitoring account.",
    inputSchema: s.object("Input for listing Conductor Monitoring websites.", {}),
    outputSchema: s.object("The Conductor Monitoring website list response.", {
      data: s.array("Websites returned by Conductor Monitoring.", websiteSchema),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_segments",
    description: "List Conductor Monitoring segments for one website.",
    inputSchema: s.object("Input for listing Conductor Monitoring segments.", { website_id: websiteIdSchema }),
    outputSchema: s.object("The Conductor Monitoring segment list response.", {
      data: s.array("Segments returned by Conductor Monitoring.", segmentSchema),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_statistics",
    description: "Retrieve Conductor Monitoring statistics for a whole website or a segment scope.",
    inputSchema: s.object(
      "Input for retrieving Conductor Monitoring statistics.",
      {
        website_id: websiteIdSchema,
        scope: scopeSchema,
        captured_at: capturedAtSchema,
      },
      { optional: ["captured_at"] },
    ),
    outputSchema: s.object(
      "The Conductor Monitoring statistics response.",
      { data: looseDataObjectSchema, ...metadataFields },
      { optional: optionalMetadataFields },
    ),
  }),
  defineProviderAction(service, {
    name: "list_pages",
    description: "List pages for a Conductor Monitoring website with pagination.",
    inputSchema: s.object(
      "Input for listing Conductor Monitoring pages.",
      {
        website_id: websiteIdSchema,
        per_page: perPageSchema,
        page: pageNumberSchema,
        page_cursor: pageCursorSchema,
        sort: s.stringEnum("The field Conductor should sort by.", ["url"]),
        direction: s.stringEnum("The Conductor sort direction.", ["asc", "desc"]),
      },
      { optional: ["page", "page_cursor", "sort", "direction"] },
    ),
    outputSchema: s.object(
      "The Conductor Monitoring page list response.",
      { data: looseDataObjectSchema, ...metadataFields },
      { optional: optionalMetadataFields },
    ),
  }),
  defineProviderAction(service, {
    name: "get_page",
    description: "Retrieve data for one URL in a Conductor Monitoring website.",
    inputSchema: s.object("Input for retrieving one Conductor Monitoring page.", {
      website_id: websiteIdSchema,
      url: s.url("The page URL to retrieve from the Conductor Monitoring website."),
    }),
    outputSchema: s.object(
      "The Conductor Monitoring page detail response.",
      { data: looseDataObjectSchema, ...metadataFields },
      { optional: optionalMetadataFields },
    ),
  }),
  defineProviderAction(service, {
    name: "list_issues",
    description: "List Conductor Monitoring issues for a whole website or a segment scope.",
    inputSchema: s.object(
      "Input for listing Conductor Monitoring issues.",
      {
        website_id: websiteIdSchema,
        scope: scopeSchema,
        captured_at: capturedAtSchema,
      },
      { optional: ["captured_at"] },
    ),
    outputSchema: s.object(
      "The Conductor Monitoring issue list response.",
      { data: looseDataArraySchema, ...metadataFields },
      { optional: optionalMetadataFields },
    ),
  }),
  defineProviderAction(service, {
    name: "list_affected_pages",
    description: "List pages affected by one Conductor Monitoring issue.",
    inputSchema: s.object(
      "Input for listing pages affected by a Conductor Monitoring issue.",
      {
        website_id: websiteIdSchema,
        issue: s.nonEmptyString("The issue name returned by list_issues."),
        page: pageNumberSchema,
        per_page: perPageSchema,
      },
      { optional: ["page", "per_page"] },
    ),
    outputSchema: s.object(
      "The Conductor Monitoring affected pages response.",
      { data: looseDataObjectSchema, ...metadataFields },
      { optional: optionalMetadataFields },
    ),
  }),
];
