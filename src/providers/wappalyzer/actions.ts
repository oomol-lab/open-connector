import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wappalyzer";

export type WappalyzerActionName = "get_credits_balance" | "lookup_technologies" | "find_subdomains" | "verify_email";

const levelValues = ["Very low", "Low", "Medium", "High", "Very high"];
const reachableValues = ["safe", "risky", "invalid", "unknown"];

const categorySchema = s.looseObject("A Wappalyzer technology category.", {
  id: s.integer("The category identifier returned by Wappalyzer."),
  slug: s.string("The category slug returned by Wappalyzer."),
  name: s.string("The category name returned by Wappalyzer."),
});

const technologySchema = s.looseObject("A detected website technology returned by Wappalyzer.", {
  slug: s.string("The technology slug returned by Wappalyzer."),
  name: s.string("The technology name returned by Wappalyzer."),
  cpe: s.string("The CPE identifier returned by Wappalyzer when available."),
  versions: s.array("The technology versions detected by Wappalyzer when available.", s.string("A detected version.")),
  categories: s.array("The categories attached to the detected technology.", categorySchema),
  trafficRank: s.integer("The traffic rank returned by Wappalyzer when available."),
  confirmedAt: s.integer("The timestamp when Wappalyzer confirmed the detection."),
});

const creditHeadersSchema = s.object("The Wappalyzer credit headers returned with the API response.", {
  spent: s.nullable(s.integer("The number of credits spent by the request.")),
  remaining: s.nullable(s.integer("The number of credits remaining after the request.")),
});

export const wappalyzerActions: ProviderActionDefinition<WappalyzerActionName>[] = [
  defineProviderAction(service, {
    name: "get_credits_balance",
    description: "Get the current Wappalyzer API credit balance for the connected account.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      credits: s.integer("The current credit balance returned by Wappalyzer."),
      creditHeaders: creditHeadersSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "lookup_technologies",
    description: "Look up website technologies and related intelligence with Wappalyzer.",
    inputSchema: s.actionInput(
      {
        urls: s.array("The website URLs to inspect.", s.url("A website URL."), {
          minItems: 1,
          maxItems: 10,
        }),
        live: s.boolean("Whether Wappalyzer should scan websites in real time instead of using cached results."),
        sets: s.array(
          "Additional result field sets to include. Use signals to request technologySpend and trafficLevel.",
          s.string("One Wappalyzer result field set."),
          { minItems: 1 },
        ),
        denoise: s.boolean("Whether Wappalyzer should exclude low-confidence detections."),
        minAge: s.integer("The result age in months used to filter Wappalyzer data.", { minimum: 0 }),
        maxAge: s.integer("The maximum result age in months used to filter Wappalyzer data.", {
          minimum: 1,
          maximum: 12,
        }),
        squash: s.boolean("Whether Wappalyzer should merge monthly results."),
      },
      ["urls"],
    ),
    outputSchema: s.actionOutput({
      results: s.array(
        "The normalized lookup results returned by Wappalyzer.",
        s.looseObject("A normalized Wappalyzer technology lookup result.", {
          url: s.url("The website URL returned by Wappalyzer."),
          technologies: s.array("The technologies detected for the website.", technologySchema),
          technologySpend: s.stringEnum(
            "The estimated technology spend level when requested and available.",
            levelValues,
          ),
          trafficLevel: s.stringEnum("The relative monthly traffic level when requested and available.", levelValues),
          errors: s.array("The lookup errors returned by Wappalyzer for this website.", s.string("One error message.")),
        }),
      ),
      creditHeaders: creditHeadersSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "find_subdomains",
    description: "Discover website-serving subdomains for one or more domains with Wappalyzer.",
    inputSchema: s.actionInput(
      {
        domains: s.array("The domains to inspect.", s.string({ minLength: 1, pattern: "\\S" }), {
          minItems: 1,
          maxItems: 10,
        }),
        limit: {
          ...s.integer("The maximum number of subdomains to return. Must be a multiple of 10.", { minimum: 10 }),
          multipleOf: 10,
        },
        after: s.nonEmptyString("The pagination cursor returned as moreAfter by a previous request."),
      },
      ["domains"],
    ),
    outputSchema: s.actionOutput({
      results: s.array(
        "The subdomain results returned by Wappalyzer.",
        s.object("A normalized Wappalyzer subdomain discovery result.", {
          domain: s.string("The domain returned by Wappalyzer."),
          subdomains: s.record(
            "The subdomain records keyed by subdomain name.",
            s.object("A Wappalyzer subdomain timestamp record.", {
              createdAt: s.integer("The timestamp when Wappalyzer first observed the subdomain."),
              updatedAt: s.integer("The timestamp when Wappalyzer last updated the subdomain."),
            }),
          ),
          moreAfter: s.nullable(s.string("The pagination cursor to pass as after when more subdomains are available.")),
        }),
      ),
      creditHeaders: creditHeadersSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "verify_email",
    description: "Verify an email address with Wappalyzer deliverability signals.",
    inputSchema: s.actionInput(
      {
        email: s.email("The email address to verify."),
      },
      ["email"],
    ),
    outputSchema: s.actionOutput({
      result: s.looseObject("A Wappalyzer email verification result.", {
        email: s.email("The email address returned by Wappalyzer."),
        domain: s.string("The email domain returned by Wappalyzer."),
        reachable: s.stringEnum("The reachability classification returned by Wappalyzer.", reachableValues),
        disposable: s.boolean("Whether the email address uses a disposable mailbox provider."),
        roleAccount: s.boolean("Whether the email address appears to be a role account."),
        mxValid: s.boolean("Whether the email domain has valid MX records."),
        connection: s.boolean("Whether Wappalyzer could connect to the mail server."),
        inboxFull: s.boolean("Whether the mailbox appears to be full."),
        catchAll: s.boolean("Whether the domain appears to accept catch-all email."),
        deliverable: s.boolean("Whether Wappalyzer considers the email deliverable."),
        disabled: s.boolean("Whether the mailbox appears disabled."),
        syntaxValid: s.boolean("Whether the email syntax is valid."),
      }),
      creditHeaders: creditHeadersSchema,
    }),
  }),
];
