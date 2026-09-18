import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "profileapi";
const data = s.object(
  "The person identifiers returned by profileAPI.",
  {
    id: s.nonEmptyString("The profileAPI person identifier, formatted as a UUID without hyphens."),
    linkedInUrl: s.url("The LinkedIn profile URL returned for the matched person."),
  },
  { optional: ["linkedInUrl"] },
);
const outputSchema = s.object("The profileAPI reverse lookup response.", { data });

export const profileapiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "reverse_lookup_email",
    operationType: "read",
    description: "Resolve a profileAPI person identifier and basic profile link from one email address.",
    requiredScopes: [],
    inputSchema: s.object("The email reverse lookup request.", {
      email: s.email("The email address to reverse lookup."),
    }),
    outputSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_lookup_phone",
    operationType: "read",
    description: "Resolve a profileAPI person identifier and basic profile link from one E.164 phone number.",
    requiredScopes: [],
    inputSchema: s.object("The phone reverse lookup request.", {
      phone: s.nonEmptyString("The phone number to reverse lookup in E.164 format, including the leading plus sign.", {
        pattern: "^\\+[1-9][0-9]{1,14}$",
      }),
    }),
    outputSchema,
  }),
];
