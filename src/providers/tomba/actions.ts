import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tomba";

const trimmedString = (description: string) => s.nonEmptyString(description);
const emptyInput = s.object("No input is required for this Tomba action.", {});
const rawResponse = s.object("A Tomba API response with the upstream payload preserved.", {
  raw: s.looseObject("The raw JSON payload returned by Tomba."),
});
const account = s.object("The authenticated Tomba account response.", {
  email: s.nullable(s.email("The authenticated account email address when returned by Tomba.")),
  userId: s.nullableInteger("The authenticated Tomba user ID when returned by Tomba."),
  planName: s.nullableString("The authenticated account plan name when available."),
  raw: s.looseObject("The raw Tomba account payload."),
});

export const tombaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve information about the authenticated Tomba account.",
    inputSchema: emptyInput,
    outputSchema: account,
  }),
  defineProviderAction(service, {
    name: "domain_search",
    description: "Search for email addresses and company intelligence for a domain.",
    inputSchema: s.object(
      "Input for searching email addresses by company domain.",
      {
        domain: trimmedString("The domain name or website URL to search."),
        page: s.positiveInteger("Optional page number for paginated Tomba results."),
        limit: s.positiveInteger("Optional maximum number of results to request from Tomba."),
      },
      { optional: ["page", "limit"] },
    ),
    outputSchema: rawResponse,
  }),
  defineProviderAction(service, {
    name: "email_finder",
    description: "Find the most likely professional email address for a person at a domain.",
    inputSchema: s.object("Input for finding one professional email address by person and company.", {
      domain: trimmedString("The company domain to search."),
      firstName: trimmedString("The person's first name."),
      lastName: trimmedString("The person's last name."),
    }),
    outputSchema: rawResponse,
  }),
  defineProviderAction(service, {
    name: "email_verifier",
    description: "Verify deliverability and metadata for an email address.",
    inputSchema: s.object("Input for verifying one email address.", {
      email: s.email("The email address to verify."),
    }),
    outputSchema: rawResponse,
  }),
  defineProviderAction(service, {
    name: "email_sources",
    description: "Retrieve public source URLs where Tomba found an email address.",
    inputSchema: s.object("Input for retrieving public sources for an email.", {
      email: s.email("The email address whose sources should be returned."),
    }),
    outputSchema: rawResponse,
  }),
  defineProviderAction(service, {
    name: "email_count",
    description: "Count known email addresses and related breakdowns for a domain.",
    inputSchema: s.object("Input for counting known emails for a domain.", {
      domain: trimmedString("The domain name to count email addresses for."),
    }),
    outputSchema: rawResponse,
  }),
  defineProviderAction(service, {
    name: "technology",
    description: "Detect technologies and tools used by a company domain.",
    inputSchema: s.object("Input for detecting technologies used by a domain.", {
      domain: trimmedString("The domain name to inspect for technologies."),
    }),
    outputSchema: rawResponse,
  }),
  defineProviderAction(service, {
    name: "linkedin",
    description: "Find contact data associated with a public LinkedIn profile URL.",
    inputSchema: s.object("Input for finding contact data from a LinkedIn URL.", {
      url: s.url("The public LinkedIn profile URL to search."),
    }),
    outputSchema: rawResponse,
  }),
  defineProviderAction(service, {
    name: "enrich",
    description: "Enrich a known email address with person and company attributes.",
    inputSchema: s.object("Input for enriching a known email address.", {
      email: s.email("The email address to enrich."),
    }),
    outputSchema: rawResponse,
  }),
  defineProviderAction(service, {
    name: "search_companies",
    description: "Search companies with Tomba Reveal using a natural-language query or filters.",
    inputSchema: s.object(
      "Input for searching companies with Tomba Reveal.",
      {
        query: trimmedString(
          "Natural language company search query. Use this on the first request, then reuse filters from the response when needed.",
        ),
        filters: s.looseObject("Structured Tomba Reveal filters to apply instead of a query."),
        page: s.positiveInteger("Optional page number for paginated company search results."),
      },
      { optional: ["query", "filters", "page"] },
    ),
    outputSchema: rawResponse,
  }),
];
