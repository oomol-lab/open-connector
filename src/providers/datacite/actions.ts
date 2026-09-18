import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "datacite";

const rawObjectSchema = s.looseObject("The raw object returned by the DataCite JSON:API.");

const doiResourceSchema = s.object("A DataCite DOI resource.", {
  id: s.string("The normalized DOI name."),
  type: s.string("The JSON:API resource type."),
  attributes: s.looseObject("The DOI metadata attributes returned by DataCite."),
  relationships: s.optional(s.looseObject("The JSON:API relationships returned for the DOI when present.")),
});

const doiSchema = s.nonEmptyString("The DOI name, such as 10.14454/qdd3-ps68. A doi.org URL is also accepted.");

const stateSchema = s.array(
  "The DOI states to include. Draft and Registered records require API key authentication.",
  s.stringEnum("One DataCite DOI state.", ["draft", "registered", "findable"]),
  { minItems: 1 },
);

const resourceTypeSchema = s.array(
  "The DataCite resourceTypeGeneral values to include.",
  s.stringEnum("One DataCite resourceTypeGeneral value.", [
    "audiovisual",
    "award",
    "book",
    "book-chapter",
    "collection",
    "computational-notebook",
    "conference-paper",
    "conference-proceeding",
    "data-paper",
    "dataset",
    "dissertation",
    "event",
    "image",
    "instrument",
    "interactive-resource",
    "journal",
    "journal-article",
    "model",
    "output-management-plan",
    "peer-review",
    "physical-object",
    "poster",
    "preprint",
    "presentation",
    "project",
    "report",
    "service",
    "software",
    "sound",
    "standard",
    "study-registration",
    "text",
    "workflow",
    "other",
  ]),
  { minItems: 1 },
);

const sortSchema = s.stringEnum("The ordering applied to matching DOI records.", [
  "relevance",
  "name",
  "-name",
  "created",
  "-created",
  "updated",
  "-updated",
  "published",
  "-published",
  "view-count",
  "-view-count",
  "download-count",
  "-download-count",
  "citation-count",
  "-citation-count",
  "title",
  "-title",
]);

export const dataciteActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_doi",
    operationType: "read",
    description:
      "Retrieve one DataCite DOI metadata record, including non-public states when the connected API key permits access.",
    inputSchema: s.object(
      "Input parameters for retrieving one DataCite DOI record.",
      {
        doi: doiSchema,
        affiliation: s.boolean("Whether to include detailed affiliation identifier information."),
        publisher: s.boolean("Whether to include detailed publisher identifier information."),
      },
      { optional: ["affiliation", "publisher"] },
    ),
    outputSchema: s.object("The DataCite response for one DOI.", {
      data: doiResourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_dois",
    operationType: "read",
    description:
      "Search, filter, sort, and page through DataCite DOI metadata records with public or authenticated access.",
    inputSchema: s.object(
      "Input parameters for listing DataCite DOI records.",
      {
        query: s.nonEmptyString("An OpenSearch query string over DOI metadata fields, such as titles.title:climate."),
        prefix: s.nonEmptyString("One DOI prefix or a comma-separated list of prefixes, such as 10.5438."),
        clientId: s.nonEmptyString("One repository ID or a comma-separated list of repository IDs."),
        providerId: s.nonEmptyString("One member or consortium organization ID, or a comma-separated list of IDs."),
        consortiumId: s.nonEmptyString("The DataCite consortium ID to filter by."),
        resourceTypeIds: resourceTypeSchema,
        subject: s.nonEmptyString("A free-text subject used to filter DOI metadata."),
        userId: s.nonEmptyString("An ORCID iD used to match creator identifiers."),
        affiliationId: s.nonEmptyString("A ROR ID used to match creator affiliations."),
        funderId: s.nonEmptyString("A Crossref Funder ID used to match funding references."),
        published: s.nonEmptyString("A publication year or comma-separated publication years in YYYY format."),
        created: s.nonEmptyString("A creation year or comma-separated creation years in YYYY format."),
        registered: s.nonEmptyString("A registration year or comma-separated registration years in YYYY format."),
        states: stateSchema,
        hasCitations: s.integer("The minimum citation count to include.", { minimum: 0 }),
        hasReferences: s.integer("The minimum reference count to include.", { minimum: 0 }),
        sort: sortSchema,
        detail: s.boolean("Whether to include extended DOI metadata and relationships."),
        affiliation: s.boolean("Whether to include detailed affiliation identifier information."),
        publisher: s.boolean("Whether to include detailed publisher identifier information."),
        pageNumber: s.integer("The page number for numbered pagination.", { minimum: 1 }),
        pageSize: s.integer("The number of DOI records to return, from 0 through 1,000.", {
          minimum: 0,
          maximum: 1_000,
        }),
        pageCursor: s.nonEmptyString("The cursor returned by DataCite for cursor-based pagination."),
      },
      {
        optional: [
          "query",
          "prefix",
          "clientId",
          "providerId",
          "consortiumId",
          "resourceTypeIds",
          "subject",
          "userId",
          "affiliationId",
          "funderId",
          "published",
          "created",
          "registered",
          "states",
          "hasCitations",
          "hasReferences",
          "sort",
          "detail",
          "affiliation",
          "publisher",
          "pageNumber",
          "pageSize",
          "pageCursor",
        ],
      },
    ),
    outputSchema: s.object("The DataCite response for a DOI list.", {
      data: s.array("The matching DOI resources.", doiResourceSchema),
      meta: rawObjectSchema,
      links: rawObjectSchema,
    }),
  }),
];
