import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "embase";

const nonEmptyString = (description: string) => s.nonWhitespaceString(description);

const quotaSchema = s.object("The Embase quota metadata returned in response headers.", {
  limit: s.nullable(s.nonNegativeInteger("The request quota when Elsevier returns it.")),
  remaining: s.nullable(s.nonNegativeInteger("The remaining requests in the current quota window.")),
  resetAt: s.nullable(s.dateTime("The ISO 8601 time when the current quota window resets.")),
});

const upstreamRecordSchema = s.looseObject("One raw Embase record returned by Elsevier.");
const rawResponseSchema = s.looseObject("The raw JSON response returned by Elsevier.");

const searchArticlesAction = defineProviderAction(service, {
  name: "search_articles",
  operationType: "read",
  description: "Search Embase biomedical literature with a CommandLanguage query or an encoded alert identifier.",
  inputSchema: s.object(
    "Input parameters for searching Embase articles.",
    {
      query: nonEmptyString("An Embase CommandLanguage Boolean query."),
      alertId: nonEmptyString("An encoded Embase alert identifier from an alert email."),
      start: s.positiveInteger("The one-based position of the first result to return."),
      count: s.positiveInteger("The maximum number of results to return, subject to the account service limit."),
      sort: s.stringEnum("The ordering applied to matching records.", ["entrydate", "publicationyear", "relevance"]),
    },
    { optional: ["query", "alertId", "start", "count", "sort"] },
  ),
  outputSchema: s.object("A normalized page of Embase search results.", {
    totalResults: s.nullable(s.nonNegativeInteger("The total number of matching records.")),
    entries: s.array("The raw Embase result records in this page.", upstreamRecordSchema),
    quota: quotaSchema,
    raw: rawResponseSchema,
  }),
});

const getArticleAction = defineProviderAction(service, {
  name: "get_article",
  operationType: "read",
  description: "Get one Embase article record by a documented literature identifier.",
  inputSchema: s.object("Input parameters for retrieving one Embase article.", {
    identifierType: s.stringEnum("The identifier namespace used by the supplied value.", [
      "lui",
      "pii",
      "doi",
      "embase",
      "pubmed_id",
      "medline",
    ]),
    identifier: nonEmptyString("The article identifier in the selected namespace."),
  }),
  outputSchema: s.object("The result of retrieving one Embase article record.", {
    record: upstreamRecordSchema,
    quota: quotaSchema,
    raw: rawResponseSchema,
  }),
});

export const embaseActions: ActionDefinition[] = [searchArticlesAction, getArticleAction];
