import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { browserOperations } from "./operations/browser.ts";
import { eventsOperations } from "./operations/events.ts";
import { geoOperations } from "./operations/geo.ts";
import { hackerNewsOperations } from "./operations/hacker-news.ts";
import { hotelsOperations } from "./operations/hotels.ts";
import { instagramOperations } from "./operations/instagram.ts";
import { linkedinOperations } from "./operations/linkedin.ts";
import { localOperations } from "./operations/local.ts";
import { mapsOperations } from "./operations/maps.ts";
import { newsOperations } from "./operations/news.ts";
import { redditOperations } from "./operations/reddit.ts";
import { seoOperations } from "./operations/seo.ts";
import { threadsOperations } from "./operations/threads.ts";
import { tiktokOperations } from "./operations/tiktok.ts";
import { xOperations } from "./operations/x.ts";
import { youtubeOperations } from "./operations/youtube.ts";

export type UnifapiActionName = string;
export type UnifapiActionMethod = "GET" | "POST";

export interface UnifapiOperation {
  name: UnifapiActionName;
  operationId: string;
  description: string;
  method: UnifapiActionMethod;
  path: string;
  pathFields: readonly string[];
  queryFields: readonly string[];
  bodyFields: readonly string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export interface UnifapiOperationDefinition extends Omit<UnifapiOperation, "outputSchema"> {
  paginated: boolean;
}

const billingSchema = s.looseObject(
  {
    credits_charged: s.nonNegativeInteger("Credits charged for the request."),
    records_charged: s.nonNegativeInteger("Records charged for the request."),
    balance_remaining: s.nonNegativeInteger("Credits remaining after the request."),
    truncated_due_to_balance: s.boolean("Whether results were truncated because of credit balance."),
  },
  { description: "UnifAPI billing details for the request." },
);

const paginationSchema = s.looseObject(
  {
    next_cursor: s.string("Cursor to request the next page."),
  },
  { description: "UnifAPI pagination details when the endpoint is paginated." },
);

const baseOutputSchema = s.looseObject(
  {
    request_id: s.string("UnifAPI request id for support and ledger correlation."),
    data: s.unknown("The data payload returned by UnifAPI for this operation."),
    billing: billingSchema,
  },
  { description: "The response returned by UnifAPI." },
);

const paginatedOutputSchema = s.looseObject(
  {
    request_id: s.string("UnifAPI request id for support and ledger correlation."),
    data: s.unknown("The data payload returned by UnifAPI for this operation."),
    pagination: paginationSchema,
    billing: billingSchema,
  },
  { description: "The paginated response returned by UnifAPI." },
);

const operationDefinitions: readonly UnifapiOperationDefinition[] = [
  browserOperations,
  eventsOperations,
  geoOperations,
  hackerNewsOperations,
  hotelsOperations,
  instagramOperations,
  linkedinOperations,
  localOperations,
  mapsOperations,
  newsOperations,
  redditOperations,
  seoOperations,
  threadsOperations,
  tiktokOperations,
  xOperations,
  youtubeOperations,
].flat();

export const unifapiOperations: readonly UnifapiOperation[] = operationDefinitions.map((operation) => ({
  ...operation,
  outputSchema: operation.paginated ? paginatedOutputSchema : baseOutputSchema,
}));

export const unifapiOperationByActionName: Map<string, UnifapiOperation> = new Map(
  unifapiOperations.map((operation) => [operation.name, operation]),
);
