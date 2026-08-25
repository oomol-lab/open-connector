import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "humaans";

const personSchema = s.looseRequiredObject("A Humaans person record.", {
  id: s.nonEmptyString("The unique Humaans person identifier."),
});

const tokenInfoOutputSchema = s.requiredObject("The current Humaans access token scopes.", {
  scopes: s.array(
    "Scopes granted to the current Humaans access token.",
    s.nonEmptyString("One scope granted to the current Humaans access token."),
  ),
});

const personOutputSchema = s.requiredObject("A Humaans person response.", {
  person: personSchema,
});

const listPeopleInputSchema = s.object(
  "Filters and pagination for listing Humaans people.",
  {
    firstName: s.nonEmptyString("Filter people by exact first name."),
    lastName: s.nonEmptyString("Filter people by exact last name."),
    preferredName: s.nonEmptyString("Filter people by exact preferred name."),
    email: s.email("Filter people by exact work email address."),
    personalEmail: s.email("Filter people by exact personal email address."),
    spaceId: s.nonEmptyString("Filter people by Humaans Space identifier."),
    teamId: s.nonEmptyString("Filter people by Humaans team identifier."),
    status: s.stringEnum("Filter people by Humaans employment status.", ["all", "newHire", "active", "offboarded"]),
    limit: s.integer("The maximum number of people to return, from 1 to 250.", {
      minimum: 1,
      maximum: 250,
    }),
    skip: s.integer("The number of matching people to skip before returning results.", {
      minimum: 0,
    }),
  },
  {
    optional: [
      "firstName",
      "lastName",
      "preferredName",
      "email",
      "personalEmail",
      "spaceId",
      "teamId",
      "status",
      "limit",
      "skip",
    ],
  },
);

const listPeopleOutputSchema = s.requiredObject("A paginated Humaans people response.", {
  total: s.integer("The total number of people matching the request.", { minimum: 0 }),
  limit: s.integer("The page size reported by Humaans.", { minimum: 1, maximum: 250 }),
  skip: s.integer("The number of matching people skipped by Humaans.", { minimum: 0 }),
  people: s.array("People returned for this page.", personSchema),
});

const getPersonInputSchema = s.requiredObject("The Humaans person to retrieve.", {
  personId: s.nonEmptyString("The unique Humaans person identifier."),
});

export const humaansActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_token_info",
    description: "Retrieve the scopes granted to the current Humaans API access token.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to retrieve Humaans token information.", {}),
    outputSchema: tokenInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_current_person",
    description:
      "Retrieve the Humaans person record that owns the current API access token using public:read or private:read access.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to retrieve the current Humaans person.", {}),
    outputSchema: personOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_people",
    description:
      "List Humaans people with common exact-match filters and offset pagination using public:read or private:read access.",
    requiredScopes: [],
    inputSchema: listPeopleInputSchema,
    outputSchema: listPeopleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_person",
    description: "Retrieve one Humaans person by identifier using public:read or private:read access.",
    requiredScopes: [],
    inputSchema: getPersonInputSchema,
    outputSchema: personOutputSchema,
  }),
];
