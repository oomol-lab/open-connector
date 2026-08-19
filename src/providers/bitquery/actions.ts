import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bitquery";

const graphqlVariablesSchema = s.record(
  "GraphQL variables keyed by variable name.",
  s.unknown("A JSON-serializable GraphQL variable value."),
);

const graphqlErrorSchema = s.looseObject(
  {
    message: s.string("The GraphQL error message."),
    locations: s.array(
      "GraphQL source locations associated with the error.",
      s.looseObject(
        {
          line: s.integer("The one-based source line."),
          column: s.integer("The one-based source column."),
        },
        { description: "A GraphQL source location." },
      ),
    ),
    path: s.array("The GraphQL response path associated with the error.", s.unknown("A path item.")),
    extensions: s.unknown("Provider-specific GraphQL error extensions."),
  },
  { description: "A GraphQL error returned by Bitquery." },
);

const graphqlEnvelopeSchema = s.looseObject(
  {
    data: s.unknown("The GraphQL data payload returned by Bitquery."),
    errors: s.array("GraphQL errors returned by Bitquery.", graphqlErrorSchema),
    extensions: s.unknown("Provider-specific GraphQL response extensions."),
  },
  { description: "The Bitquery GraphQL response envelope." },
);

export const bitqueryActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "run_query",
    description:
      "Run a Bitquery V2 GraphQL HTTP query against the canonical streaming endpoint and return the GraphQL response envelope.",
    inputSchema: s.object(
      {
        query: s.string({
          description: "The GraphQL query document to send to Bitquery.",
          minLength: 1,
        }),
        variables: graphqlVariablesSchema,
        operationName: s.string({
          description: "The GraphQL operation name to execute when the query document defines multiple operations.",
          minLength: 1,
        }),
      },
      {
        required: ["query"],
        description: "Input parameters for running a Bitquery GraphQL query.",
      },
    ),
    outputSchema: graphqlEnvelopeSchema,
  }),
];
