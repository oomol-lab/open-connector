import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "emailoctopus";

const limitField = s.integer("Maximum number of records to return, up to 100.", {
  minimum: 1,
  maximum: 100,
});
const pageField = s.positiveInteger("Specific 1-based page number to request.");
const pagingSchema = s.looseObject("Pagination object returned by the official EmailOctopus API.", {
  limit: s.positiveInteger("Page size returned by the official API."),
  current_page: s.positiveInteger("Current page number returned by the official API."),
  total_pages: s.positiveInteger("Total number of pages returned by the official API."),
  next_page: s.nullableString("URL of the next page, if available."),
  prev_page: s.nullableString("URL of the previous page, if available."),
});
const listObjectSchema = s.looseObject("List object returned by the official EmailOctopus API.");
const contactObjectSchema = s.looseObject("Contact object returned by the official EmailOctopus API.");
const campaignObjectSchema = s.looseObject("Campaign object returned by the official EmailOctopus API.");
const listIdField = s.nonEmptyString("EmailOctopus list identifier.");
const contactIdField = s.nonEmptyString("EmailOctopus contact identifier.");
const campaignIdField = s.nonEmptyString("EmailOctopus campaign identifier.");
const contactFieldsSchema = s.looseObject("Custom contact fields object accepted by the official EmailOctopus API.");

export const emailoctopusActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_lists",
    description: "List EmailOctopus mailing lists available to the current API key.",
    inputSchema: s.object(
      "Query parameters for listing EmailOctopus lists.",
      {
        limit: limitField,
        page: pageField,
      },
      { optional: ["limit", "page"] },
    ),
    outputSchema: s.object(
      "Paginated EmailOctopus list collection response normalized by the connector.",
      {
        lists: s.array("Lists returned by the official EmailOctopus API.", listObjectSchema),
        paging: pagingSchema,
      },
      { optional: ["paging"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_list",
    description: "Fetch a single EmailOctopus mailing list by ID.",
    inputSchema: s.object("Path parameters for fetching a single EmailOctopus list.", {
      list_id: listIdField,
    }),
    outputSchema: s.object("Single EmailOctopus list response normalized by the connector.", {
      list: listObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_list_contacts",
    description: "List contacts in a specific EmailOctopus mailing list.",
    inputSchema: s.object(
      "Path and query parameters for listing contacts in an EmailOctopus list.",
      {
        list_id: listIdField,
        limit: limitField,
        page: pageField,
      },
      { optional: ["limit", "page"] },
    ),
    outputSchema: s.object(
      "Paginated EmailOctopus contact collection response normalized by the connector.",
      {
        contacts: s.array("Contacts returned by the official EmailOctopus API.", contactObjectSchema),
        paging: pagingSchema,
      },
      { optional: ["paging"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_list_contact",
    description: "Fetch a single contact from an EmailOctopus mailing list.",
    inputSchema: s.object("Path parameters for fetching or deleting a single EmailOctopus contact.", {
      list_id: listIdField,
      contact_id: contactIdField,
    }),
    outputSchema: s.object("Single EmailOctopus contact response normalized by the connector.", {
      contact: contactObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_list_contact",
    description: "Create a contact in an EmailOctopus mailing list.",
    inputSchema: s.object(
      "Request payload for creating a contact in an EmailOctopus list.",
      {
        list_id: listIdField,
        email_address: s.email("Contact email address accepted by the official EmailOctopus API."),
        fields: contactFieldsSchema,
        tags: s.stringArray("Tag names accepted by the official create-contact API.", {
          itemDescription: "Tag name accepted by the official EmailOctopus API.",
        }),
        status: s.nonEmptyString("Contact status value accepted by the official EmailOctopus API."),
      },
      { optional: ["fields", "tags", "status"] },
    ),
    outputSchema: s.object("Single EmailOctopus contact response normalized by the connector.", {
      contact: contactObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_list_contact",
    description: "Update a contact in an EmailOctopus mailing list.",
    inputSchema: s.object(
      "Request payload for updating a contact in an EmailOctopus list.",
      {
        list_id: listIdField,
        contact_id: contactIdField,
        email_address: s.email("Contact email address accepted by the official EmailOctopus API."),
        fields: contactFieldsSchema,
        tags: s.record(
          "Tag update map accepted by the official update-contact API.",
          s.boolean("Whether the tag should be added or removed."),
        ),
        status: s.nonEmptyString("Contact status value accepted by the official EmailOctopus API."),
      },
      { optional: ["email_address", "fields", "tags", "status"] },
    ),
    outputSchema: s.object("Single EmailOctopus contact response normalized by the connector.", {
      contact: contactObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_list_contact",
    description: "Delete a contact from an EmailOctopus mailing list.",
    inputSchema: s.object("Path parameters for fetching or deleting a single EmailOctopus contact.", {
      list_id: listIdField,
      contact_id: contactIdField,
    }),
    outputSchema: s.object("Success marker returned after an EmailOctopus no-content response.", {
      success: s.boolean("Whether EmailOctopus accepted the operation."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "List EmailOctopus campaigns available to the current API key.",
    inputSchema: s.object(
      "Query parameters for listing EmailOctopus campaigns.",
      {
        limit: limitField,
        page: pageField,
      },
      { optional: ["limit", "page"] },
    ),
    outputSchema: s.object(
      "Paginated EmailOctopus campaign collection response normalized by the connector.",
      {
        campaigns: s.array("Campaigns returned by the official EmailOctopus API.", campaignObjectSchema),
        paging: pagingSchema,
      },
      { optional: ["paging"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    description: "Fetch a single EmailOctopus campaign by ID.",
    inputSchema: s.object("Path parameters for fetching a single EmailOctopus campaign.", {
      campaign_id: campaignIdField,
    }),
    outputSchema: s.object("Single EmailOctopus campaign response normalized by the connector.", {
      campaign: campaignObjectSchema,
    }),
  }),
];
