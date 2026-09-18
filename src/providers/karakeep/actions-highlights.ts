import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { cursorFieldFor, highlightSchema, karakeepIdField, limitField, paginatedHighlightsSchema } from "./schemas.ts";

const service = "karakeep";
const highlightReadScopes = ["highlights:read"] as const;
const highlightWriteScopes = ["highlights:readwrite"] as const;

const highlightIdField = karakeepIdField("The id of the highlight.");

const highlightColorValues = ["yellow", "red", "green", "blue"] as const;

const highlightNoteField = s.nullableString(
  "A note attached to the highlight, or null when the highlight carries no note.",
);

export const karakeepHighlightActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_highlights",
    operationType: "read",
    description: "Retrieve one page of the highlights the authenticated Karakeep user has made across all bookmarks.",
    requiredScopes: highlightReadScopes,
    inputSchema: s.object(
      "Input for listing Karakeep highlights.",
      {
        limit: limitField,
        cursor: cursorFieldFor("list_highlights"),
      },
      { optional: ["limit", "cursor"] },
    ),
    outputSchema: paginatedHighlightsSchema,
  }),
  defineProviderAction(service, {
    name: "create_highlight",
    operationType: "write",
    description:
      "Create a text highlight on a Karakeep bookmark. A highlight is defined by the character offsets it covers in the readable content of the bookmark and can carry a color and a note.",
    requiredScopes: highlightWriteScopes,
    inputSchema: s.object(
      "Input for creating a Karakeep highlight.",
      {
        bookmarkId: karakeepIdField("The id of the bookmark to highlight."),
        startOffset: s.number(
          "The character offset in the readable content of the bookmark where the highlight starts.",
        ),
        endOffset: s.number("The character offset in the readable content of the bookmark where the highlight ends."),
        color: s.withDefault(s.stringEnum("The highlight color.", highlightColorValues), "yellow"),
        text: s.nullableString(
          "The highlighted text. Send null when the text is not known; Karakeep stores the highlight by its offsets either way.",
        ),
        note: s.describe(highlightNoteField, "A note to attach to the highlight, or null for no note."),
      },
      { optional: ["color", "text", "note"] },
    ),
    outputSchema: highlightSchema,
  }),
  defineProviderAction(service, {
    name: "get_highlight",
    operationType: "read",
    description: "Retrieve a single Karakeep highlight by its id.",
    requiredScopes: highlightReadScopes,
    inputSchema: s.requiredObject("Input for retrieving one Karakeep highlight.", {
      highlightId: highlightIdField,
    }),
    outputSchema: highlightSchema,
  }),
  defineProviderAction(service, {
    name: "update_highlight",
    operationType: "write",
    description:
      "Partially update a Karakeep highlight. Only the color and the note can be changed, and sending null for the note clears it.",
    requiredScopes: highlightWriteScopes,
    inputSchema: s.object(
      "Input for updating a Karakeep highlight.",
      {
        highlightId: highlightIdField,
        color: s.stringEnum("The new highlight color.", highlightColorValues),
        note: s.describe(highlightNoteField, "The new note for the highlight, or null to clear the existing note."),
      },
      { optional: ["color", "note"] },
    ),
    outputSchema: highlightSchema,
  }),
  defineProviderAction(service, {
    name: "delete_highlight",
    operationType: "destructive",
    description:
      "Delete a Karakeep highlight and return the record that was removed. The bookmark the highlight belonged to is kept.",
    requiredScopes: highlightWriteScopes,
    inputSchema: s.requiredObject("Input for deleting a Karakeep highlight.", {
      highlightId: highlightIdField,
    }),
    outputSchema: s.describe(highlightSchema, "The Karakeep highlight that was deleted."),
  }),
];
