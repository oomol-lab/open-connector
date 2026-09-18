import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "u301";

const shortenLinkOutputSchema = s.actionOutput(
  {
    id: s.nonEmptyString("The unique U301 link identifier."),
    url: s.nonEmptyString("The original destination URL."),
    slug: s.nonEmptyString("The short path segment."),
    isCustomSlug: s.boolean("Whether the slug was provided by the user."),
    domain: s.nonEmptyString("The domain used for the short link."),
    isReused: s.boolean("Whether U301 reused an existing short link for the same URL."),
    shortLink: s.nonEmptyString("The final short link in domain/slug form."),
    comment: s.nullableString("The optional comment stored with the short link."),
  },
  "The created U301 short link.",
);

const domainSchema = s.object("A domain available for U301 short links.", {
  domain: s.nonEmptyString("The domain name."),
  randomCodeLength: s.integer("The random code length used when U301 generates a slug."),
  isPrimary: s.boolean("Whether this domain is the primary domain for the workspace."),
  isGlobal: s.boolean("Whether this domain is a global U301 domain."),
});

export const u301Actions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "shorten_link",
    operationType: "write",
    description: "Create one U301 short link for a destination URL.",
    inputSchema: s.actionInput(
      {
        url: s.url("The destination URL to shorten."),
        domain: s.nonEmptyString("The domain to use for the short link."),
        slug: s.nonEmptyString("The custom slug to use instead of a random code."),
        reuseExisting: s.boolean(
          "Whether U301 should reuse an existing short link when the destination URL already exists.",
        ),
        password: s.nonEmptyString("An optional password required before opening the short link."),
        comment: s.nonEmptyString("An optional note stored with the short link."),
      },
      ["url"],
      "The input payload for creating one U301 short link.",
    ),
    outputSchema: shortenLinkOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_link",
    operationType: "destructive",
    description: "Delete one U301 short link by its domain/slug identifier.",
    inputSchema: s.actionInput(
      {
        shortlink: s.string({
          description: "The short link identifier in the form domain/slug, for example u301.co/abc123.",
          minLength: 3,
          pattern: "^(?!https?://)[^/]+/.+",
        }),
      },
      ["shortlink"],
      "The input payload for deleting one U301 short link.",
    ),
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether U301 confirmed the short link deletion."),
        message: s.nullableString("The upstream success message returned by U301."),
      },
      "The result returned after deleting one U301 short link.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_domains",
    operationType: "read",
    description: "List the U301 short-link domains available in the connected workspace.",
    inputSchema: s.actionInput({}, [], "The input payload for listing U301 domains."),
    outputSchema: s.actionOutput(
      {
        domains: s.array("The domains available in the workspace.", domainSchema),
      },
      "The domains returned by U301.",
    ),
  }),
];
