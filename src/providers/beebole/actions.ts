import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "beebole";

const graphqlVariablesSchema = s.record(
  "GraphQL variables keyed by variable name.",
  s.unknown("A JSON-serializable GraphQL variable value."),
);

const graphqlErrorLocationSchema = s.looseObject("A GraphQL error source location.", {
  line: s.integer("The one-based source line for the GraphQL error."),
  column: s.integer("The one-based source column for the GraphQL error."),
});

const graphqlErrorSchema = s.looseObject("A GraphQL error returned by Beebole.", {
  message: s.string("The GraphQL error message."),
  locations: s.array("Source locations associated with the GraphQL error.", graphqlErrorLocationSchema),
  path: s.array("GraphQL response path entries associated with the error.", s.unknown("A path item.")),
  extensions: s.looseObject("Provider-specific GraphQL error metadata."),
});

export const beeboleActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "execute_graphql",
    operationType: "write",
    description: "Execute a JSON-friendly Beebole GraphQL query or mutation against the connected account.",
    inputSchema: s.object(
      "The input payload for executing a Beebole GraphQL operation.",
      {
        query: s.nonEmptyString("The GraphQL query or mutation document to execute."),
        variables: graphqlVariablesSchema,
        operationName: s.nonEmptyString(
          "The GraphQL operation name to execute when the document defines multiple operations.",
        ),
      },
      { required: ["query"] },
    ),
    outputSchema: s.object(
      "The raw Beebole GraphQL response envelope.",
      {
        data: s.unknown("The GraphQL data payload returned by Beebole."),
        errors: s.array("GraphQL errors returned by Beebole.", graphqlErrorSchema),
        extensions: s.looseObject("Provider-specific GraphQL response extensions."),
      },
      { optional: ["data", "errors", "extensions"] },
    ),
  }),
];
