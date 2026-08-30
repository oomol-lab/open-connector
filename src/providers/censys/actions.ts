import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "censys" as const;

function defineAction<TName extends string>(
  input: Omit<Parameters<typeof defineProviderAction<TName>>[1], "providerPermissions"> & {
    service: typeof service;
    providerPermissions?: string[];
  },
): ProviderActionDefinition<TName> {
  const { service: _service, ...action } = input;
  return defineProviderAction(service, action);
}

function nonEmptyString(description: string) {
  return s.string(description, { minLength: 1 });
}

function optionalRfc3339DateTime(description: string) {
  return s.dateTime(description);
}

const webPropertyIdSchema = s.string(
  "Censys web property ID in hostname:port format, such as platform.censys.io:443.",
  {
    minLength: 1,
    pattern: "^[^:/?#]+:[0-9]{1,5}$",
  },
);
const rawCensysObject = s.looseObject("Raw JSON object returned by Censys.");

export const censysActions: ProviderActionDefinition[] = [
  defineAction({
    service,
    name: "get_host",
    description: "Get one Censys Global Data host asset by host ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving one Censys host asset.",
      {
        host_id: nonEmptyString("Censys host ID to retrieve."),
        at_time: optionalRfc3339DateTime("RFC 3339 timestamp for retrieving a historical host view."),
      },
      { optional: ["at_time"] },
    ),
    outputSchema: s.object("Normalized Censys host asset details.", {
      host: {
        ...rawCensysObject,
        description: "Raw host asset returned by Censys.",
      },
    }),
  }),
  defineAction({
    service,
    name: "get_certificate",
    description: "Get one Censys Global Data certificate asset by certificate ID.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving one Censys certificate asset.", {
      certificate_id: nonEmptyString("Censys certificate ID to retrieve."),
    }),
    outputSchema: s.object("Normalized Censys certificate asset details.", {
      certificate: {
        ...rawCensysObject,
        description: "Raw certificate asset returned by Censys.",
      },
    }),
  }),
  defineAction({
    service,
    name: "get_web_property",
    description: "Get one Censys Global Data web property asset by web property ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving one Censys web property asset.",
      {
        webproperty_id: webPropertyIdSchema,
        at_time: optionalRfc3339DateTime("RFC 3339 timestamp for retrieving a historical web property view."),
      },
      { optional: ["at_time"] },
    ),
    outputSchema: s.object("Normalized Censys web property asset details.", {
      webProperty: {
        ...rawCensysObject,
        description: "Raw web property asset returned by Censys.",
      },
    }),
  }),
];
