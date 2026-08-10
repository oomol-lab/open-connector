import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";

export const blazeMeterSortSchema: JsonSchema = s.array(
  "Sort fields accepted by BlazeMeter, such as name or -created.",
  s.nonEmptyString("One BlazeMeter sort field. Prefix with - for descending order."),
);

const blazeMeterErrorSchema = s.object(
  "The error object returned by BlazeMeter when a request fails.",
  {
    code: s.nullable(s.integer("The numeric BlazeMeter error code.")),
    message: s.nullable(s.string("The BlazeMeter error message.")),
  },
  { optional: ["code", "message"] },
);

export const blazeMeterResponseEnvelopeSchema: JsonSchema = s.actionOutput(
  {
    apiVersion: s.nullable(s.integer("The BlazeMeter API version returned by the endpoint.")),
    requestId: s.nullable(s.string("The BlazeMeter request identifier.")),
    error: s.nullable(blazeMeterErrorSchema),
    result: s.unknown("The result payload returned by BlazeMeter."),
    total: s.nullable(s.integer("The total number of matching records when returned.")),
    limit: s.nullable(s.integer("The response limit when returned.")),
    skip: s.nullable(s.integer("The response offset when returned.")),
    hidden: s.nullable(s.integer("The number of hidden records when returned.")),
    raw: s.looseObject("The raw BlazeMeter response object."),
  },
  "A normalized BlazeMeter API v4 response envelope.",
);
