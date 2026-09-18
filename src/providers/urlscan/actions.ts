import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "urlscan";

const looseObjectSchema = s.looseObject("A raw JSON object returned by urlscan.io.");
const searchAfterSchema = s.array(
  "Sort values from a urlscan.io search result.",
  s.union([s.string("A string sort value."), s.number("A numeric sort value.")], {
    description: "One sort value returned by urlscan.io.",
  }),
);

export const urlscanActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "submit_scan",
    operationType: "write",
    description: "Submit a URL to urlscan.io for scanning.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for submitting a URL scan.",
      {
        url: s.url("URL to submit for scanning."),
        visibility: s.stringEnum("Visibility level for the submitted scan.", ["public", "unlisted", "private"]),
        tags: s.stringArray("User-defined tags to annotate the scan.", {
          minItems: 1,
          maxItems: 10,
          itemDescription: "One tag to add to the scan.",
        }),
        customagent: s.nonEmptyString("Custom User-Agent string to use for the scan."),
        referer: s.nonEmptyString("Custom HTTP referer to use for the scan."),
        overrideSafety: s.boolean("Whether to disable URL reclassification when urlscan.io detects potential PII."),
        country: s.string({
          minLength: 2,
          maxLength: 2,
          description: "Two-letter ISO-3166-1 alpha-2 country code for the scan location.",
        }),
      },
      { optional: ["visibility", "tags", "customagent", "referer", "overrideSafety", "country"] },
    ),
    outputSchema: s.object(
      "Normalized submission response returned by urlscan.io.",
      {
        message: s.nonEmptyString("Submission status message returned by urlscan.io."),
        uuid: s.uuid("Unique scan UUID assigned by urlscan.io."),
        resultUrl: s.url("Browser result URL for the submitted scan."),
        apiUrl: s.url("Result API URL for the submitted scan."),
        visibility: s.nonEmptyString("Visibility level applied to the submitted scan."),
        url: s.url("URL submitted for scanning."),
        country: s.nonEmptyString("Country code used for the scan."),
        options: looseObjectSchema,
      },
      { optional: ["country", "options"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_result",
    operationType: "read",
    description: "Retrieve the JSON result for a completed urlscan.io scan.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving a scan result.", {
      uuid: s.uuid("Unique scan UUID to retrieve."),
    }),
    outputSchema: s.object("Normalized scan result returned by urlscan.io.", {
      uuid: s.uuid("Unique scan UUID used for the lookup."),
      result: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_scans",
    operationType: "read",
    description: "Search urlscan.io scans with the documented search query syntax.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for searching urlscan.io scans.",
      {
        query: s.nonEmptyString('Search query using urlscan.io search syntax, for example "domain:example.com".'),
        size: s.integer("Maximum number of results to return.", { minimum: 1, maximum: 10000 }),
        searchAfter: s.union([s.nonEmptyString("Comma-separated search_after cursor value."), searchAfterSchema], {
          description: "Pagination cursor from the sort values of the last result in the previous page.",
        }),
      },
      { optional: ["query", "size", "searchAfter"] },
    ),
    outputSchema: s.object(
      "Normalized search response returned by urlscan.io.",
      {
        results: s.array("Raw JSON objects returned by urlscan.io.", looseObjectSchema),
        total: s.integer("Total matching scan count reported by urlscan.io.", { minimum: 0 }),
        hasMore: s.boolean("Whether urlscan.io reports that older results are available."),
        nextSearchAfter: searchAfterSchema,
        raw: looseObjectSchema,
      },
      { optional: ["total", "hasMore", "nextSearchAfter", "raw"] },
    ),
  }),
];
