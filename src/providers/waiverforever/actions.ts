import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "waiverforever";

const stringIdSchema = s.string({
  minLength: 1,
  pattern: "\\S",
  description: "The WaiverForever resource ID.",
});
const timestampSchema = s.integer("The Unix timestamp in seconds.");
const pageSchema = s.positiveInteger("The page number to request.");
const perPageSchema = s.positiveInteger("The number of records to return per page.");
const templateIdsSchema = s.array("The WaiverForever template IDs used to filter results.", stringIdSchema, {
  minItems: 1,
});
const stringListSchema = s.array("The string values used to filter results.", s.string("A filter value."), {
  minItems: 1,
});
const rawObjectSchema = s.looseObject("The raw object returned by WaiverForever.");
const rawArraySchema = s.array("The raw objects returned by WaiverForever.", rawObjectSchema);
const prefillDataSchema = s.record(
  "The WaiverForever prefill field map keyed by documented prefill field IDs.",
  s.unknown("The prefill value for the field."),
);

export const waiverforeverActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_info",
    operationType: "read",
    description: "Get the WaiverForever account username associated with the API key.",
    inputSchema: s.object({}, { description: "The input payload for getting WaiverForever user info." }),
    outputSchema: s.object(
      {
        username: s.nullableString("The WaiverForever account username."),
        raw: rawObjectSchema,
      },
      { required: ["username", "raw"], description: "The WaiverForever user info response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    operationType: "read",
    description: "List waiver templates available to the WaiverForever account.",
    inputSchema: s.object({}, { description: "The input payload for listing WaiverForever templates." }),
    outputSchema: s.object(
      { templates: rawArraySchema, raw: rawObjectSchema },
      { required: ["templates", "raw"], description: "The WaiverForever template list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "create_template_signing_link",
    operationType: "write",
    description: "Create a one-off signing link for a WaiverForever template.",
    inputSchema: s.object(
      {
        template_id: stringIdSchema,
        ttl: s.positiveInteger("The signing link expiration time in seconds. WaiverForever defaults to 86400."),
        pending_enabled: s.boolean("Whether submissions through the generated tracking link should start as pending."),
      },
      {
        required: ["template_id"],
        optional: ["ttl", "pending_enabled"],
        description: "The input payload for creating a WaiverForever template signing link.",
      },
    ),
    outputSchema: s.object(
      {
        tracking_id: s.nullableString("The generated tracking ID."),
        request_waiver_url: s.nullable(s.url("The generated request waiver URL.")),
        ttl: s.nullableInteger("The signing link expiration time in seconds."),
        pending_enabled: s.nullableBoolean("Whether pending status was requested for this signing link."),
        pending_available: s.nullableBoolean("Whether pending status was available for this signing link."),
        raw: rawObjectSchema,
      },
      {
        required: ["tracking_id", "request_waiver_url", "ttl", "pending_enabled", "pending_available", "raw"],
        description: "The WaiverForever template signing link response.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_waiver",
    operationType: "read",
    description: "Get a signed WaiverForever waiver by ID.",
    inputSchema: s.object(
      { waiver_id: stringIdSchema },
      { required: ["waiver_id"], description: "The input payload for getting a WaiverForever waiver." },
    ),
    outputSchema: s.object(
      { waiver: rawObjectSchema, raw: rawObjectSchema },
      { required: ["waiver", "raw"], description: "The WaiverForever waiver response." },
    ),
  }),
  defineProviderAction(service, {
    name: "search_waivers",
    operationType: "read",
    description: "Search signed WaiverForever waivers with keyword, date, template, and status filters.",
    inputSchema: s.object(
      {
        search_term: s.nonEmptyString("The keyword search term."),
        start_timestamp: timestampSchema,
        end_timestamp: timestampSchema,
        page: pageSchema,
        per_page: perPageSchema,
        template_ids: templateIdsSchema,
        note: s.nonEmptyString("The waiver note text to search."),
        tags: stringListSchema,
        device_ids: stringListSchema,
        request_id: stringIdSchema,
        request_ids: stringListSchema,
        status: s.stringEnum("The waiver status to filter by.", ["approved", "pending", "revoked"]),
      },
      {
        optional: [
          "search_term",
          "start_timestamp",
          "end_timestamp",
          "page",
          "per_page",
          "template_ids",
          "note",
          "tags",
          "device_ids",
          "request_id",
          "request_ids",
          "status",
        ],
        description: "The input payload for searching WaiverForever waivers.",
      },
    ),
    outputSchema: listOutputSchema("waivers", "The WaiverForever waiver search response."),
  }),
  defineProviderAction(service, {
    name: "create_waiver_request",
    operationType: "write",
    description: "Create a WaiverForever waiver request group.",
    inputSchema: s.object(
      {
        name: s.nonEmptyString("The waiver request group name."),
        size: s.integer("The request group size. WaiverForever supports values between 0 and 1000.", {
          minimum: 0,
          maximum: 1000,
        }),
        template_id: stringIdSchema,
        note: s.nonEmptyString("The waiver request group note."),
        type: s.stringEnum("The waiver request group type.", ["normal", "anonymous"]),
        contact_info: s.nonEmptyString("The waiver request contact info."),
        group_prefill_data: prefillDataSchema,
      },
      {
        required: ["name", "size", "template_id"],
        optional: ["note", "type", "contact_info", "group_prefill_data"],
        description: "The input payload for creating a WaiverForever waiver request group.",
      },
    ),
    outputSchema: objectOutputSchema("waiver_request", "The WaiverForever waiver request group response."),
  }),
  defineProviderAction(service, {
    name: "get_waiver_request",
    operationType: "read",
    description: "Get a WaiverForever waiver request group by ID.",
    inputSchema: s.object(
      {
        waiver_request_id: stringIdSchema,
        include_waivers: s.boolean("Whether to include submitted waivers in the response."),
      },
      {
        required: ["waiver_request_id"],
        optional: ["include_waivers"],
        description: "The input payload for getting a WaiverForever waiver request group.",
      },
    ),
    outputSchema: objectOutputSchema("waiver_request", "The WaiverForever waiver request group response."),
  }),
  defineProviderAction(service, {
    name: "list_waiver_requests",
    operationType: "read",
    description: "List WaiverForever waiver request groups for a template with optional filters.",
    inputSchema: s.object(
      {
        template_id: stringIdSchema,
        name: s.nonEmptyString("The waiver request group name search term."),
        status: s.stringEnum("The waiver request group status to filter by.", ["collecting", "accepted"]),
        start_timestamp: timestampSchema,
        end_timestamp: timestampSchema,
        page: pageSchema,
        per_page: perPageSchema,
        include_waivers: s.boolean("Whether to include submitted waivers in each request group."),
        request_ids: stringListSchema,
      },
      {
        required: ["template_id"],
        optional: [
          "name",
          "status",
          "start_timestamp",
          "end_timestamp",
          "page",
          "per_page",
          "include_waivers",
          "request_ids",
        ],
        description: "The input payload for listing WaiverForever waiver request groups for a template.",
      },
    ),
    outputSchema: listOutputSchema("waiver_requests", "The WaiverForever waiver request group list response."),
  }),
];

function objectOutputSchema(outputKey: string, description: string): JsonSchema {
  return s.object(
    { [outputKey]: rawObjectSchema, raw: rawObjectSchema },
    { required: [outputKey, "raw"], description },
  );
}

function listOutputSchema(outputKey: string, description: string): JsonSchema {
  return s.object(
    {
      [outputKey]: rawArraySchema,
      page: s.nullableInteger("The page number returned by WaiverForever."),
      per_page: s.nullableInteger("The page size returned by WaiverForever."),
      count: s.nullableInteger("The total or page count returned by WaiverForever."),
      raw: rawObjectSchema,
    },
    { required: [outputKey, "page", "per_page", "count", "raw"], description },
  );
}
