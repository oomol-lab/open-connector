import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "short_menu";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });

const tagSchema = s.object(
  "Tag object used by the Short Menu API.",
  {
    id: s.string("Short Menu tag identifier, when available."),
    name: nonEmptyString("Tag name assigned to the short link."),
  },
  { optional: ["id"] },
);

const domainSchema = s.object("Short Menu domain object.", {
  id: nonEmptyString("Short Menu domain identifier."),
  name: nonEmptyString("Domain name used for the short link."),
});

const linkSchema = s.object(
  "Short Menu short link object.",
  {
    id: nonEmptyString("Short Menu short link identifier."),
    createdAt: s.string("Timestamp when the short link was created."),
    destinationUrl: nonEmptyString("Destination URL that the short link redirects to."),
    title: s.string("Resolved title returned by Short Menu, when available."),
    slug: nonEmptyString("Path slug used by the short link."),
    domain: domainSchema,
    shortUrl: nonEmptyString("Full short URL returned by Short Menu."),
    clickCount: s.number("Click count returned by Short Menu, when available."),
    tags: s.array("Tags assigned to the short link.", tagSchema),
  },
  { optional: ["title", "clickCount"] },
);

const createLinkInputSchema = s.object(
  "Input payload for creating a Short Menu short link.",
  {
    destinationUrl: s.url("Destination URL to shorten."),
    domain: nonEmptyString("Domain name to use for the short link."),
    slug: s.string(
      "Custom slug to assign to the short link. Pass an empty string to let Short Menu generate a random slug.",
    ),
    tags: s.array("Tags to attach when creating the short link.", tagSchema),
  },
  { optional: ["slug"] },
);

const updateLinkInputSchema = s.object(
  "Input payload for updating a Short Menu short link.",
  {
    id: nonEmptyString("Identifier of the short link to update."),
    destinationUrl: s.url("Updated destination URL for the short link."),
    tags: s.array("Replacement tag list for the short link.", tagSchema),
  },
  { optional: ["destinationUrl", "tags"] },
);

const deleteLinkInputSchema = s.object("Input payload for deleting a Short Menu short link.", {
  id: nonEmptyString("Identifier of the short link to delete."),
});

const deleteLinkOutputSchema = s.object("Normalized delete result returned after removing a Short Menu short link.", {
  id: nonEmptyString("Identifier of the short link that was deleted."),
  deleted: s.boolean("Whether the short link was deleted successfully."),
});

export const shortMenuActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_link",
    description: "Create a Short Menu short link.",
    requiredScopes: [],
    inputSchema: createLinkInputSchema,
    outputSchema: linkSchema,
  }),
  defineProviderAction(service, {
    name: "update_link",
    description: "Update an existing Short Menu short link.",
    requiredScopes: [],
    inputSchema: updateLinkInputSchema,
    outputSchema: linkSchema,
  }),
  defineProviderAction(service, {
    name: "delete_link",
    description: "Delete an existing Short Menu short link.",
    requiredScopes: [],
    inputSchema: deleteLinkInputSchema,
    outputSchema: deleteLinkOutputSchema,
  }),
];
