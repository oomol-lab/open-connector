import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const pageId = s.integer("The page ID.", { minimum: 1 });
const catalogId = s.integer("The catalog ID.", { minimum: 1 });
const sortNumber = s.integer("The display order; ShowDoc defaults to 99 when omitted.");
const returnedId = (description: string) => s.union([s.integer(description), s.string(description)], { description });
const pageResult = s.looseObject(
  "The page returned by ShowDoc, including additional upstream fields.",
  {
    page_id: returnedId("The page ID returned by ShowDoc."),
    page_title: s.string("The page title returned by ShowDoc."),
    page_content: s.string("The page content with one layer of ShowDoc HTML escaping decoded."),
  },
  { required: ["page_id"] },
);

const catalogResult = s.looseObject(
  "The catalog returned by ShowDoc, including additional upstream fields.",
  {
    cat_id: returnedId("The catalog ID returned by ShowDoc."),
    cat_name: s.string("The catalog name returned by ShowDoc."),
    parent_cat_id: returnedId("The parent catalog ID; zero denotes the project root."),
    s_number: returnedId("The catalog display order."),
  },
  { required: ["cat_id"] },
);

export const showdocActions: ActionDefinition[] = [
  defineProviderAction("showdoc", {
    name: "update_page",
    operationType: "write",
    description:
      "Create or update a ShowDoc page by its title within a catalog, automatically creating the catalog path when needed.",
    inputSchema: s.object(
      "The page to create or update.",
      {
        page_title: s.nonEmptyString("The page title, unique within its catalog."),
        page_content: s.string("The complete Markdown or HTML page content to write."),
        cat_name: s.string("The catalog path, such as Guides/Setup; omit for the project root."),
        s_number: sortNumber,
      },
      { optional: ["cat_name", "s_number"] },
    ),
    outputSchema: pageResult,
  }),
  defineProviderAction("showdoc", {
    name: "get_page",
    operationType: "read",
    description:
      "Read a ShowDoc page by ID or title and decode one layer of HTML escaping in its content. Prefer ID when titles repeat across catalogs.",
    inputSchema: s.object(
      "The page to retrieve; provide an ID or title. ID takes precedence when both are supplied.",
      {
        page_id: pageId,
        page_title: s.nonEmptyString("The page title to look up when page_id is omitted."),
      },
      {
        optional: ["page_id", "page_title"],
        anyOf: [{ required: ["page_id"] }, { required: ["page_title"] }],
      },
    ),
    outputSchema: pageResult,
  }),
  defineProviderAction("showdoc", {
    name: "delete_page",
    operationType: "destructive",
    description: "Move a ShowDoc page to the recycle bin.",
    inputSchema: s.requiredObject("The page to delete.", { page_id: pageId }),
    outputSchema: s.looseObject(
      "The deleted page reference.",
      { page_id: returnedId("The deleted page ID.") },
      { required: ["page_id"] },
    ),
  }),
  defineProviderAction("showdoc", {
    name: "get_catalog_tree",
    operationType: "read",
    description: "Read the complete ShowDoc project catalog and page tree.",
    inputSchema: s.object("No parameters are needed for the connected project.", {}),
    outputSchema: s.looseObject(
      "The full project tree returned by ShowDoc.",
      {
        pages: s.array("Pages at the project root.", s.looseObject("An upstream page summary.")),
        catalogs: s.array(
          "Catalogs with their nested pages and subcatalogs.",
          s.looseObject("An upstream catalog subtree."),
        ),
      },
      { required: ["pages", "catalogs"] },
    ),
  }),
  defineProviderAction("showdoc", {
    name: "create_catalog",
    operationType: "write",
    description: "Create a ShowDoc catalog under the project root or a parent catalog.",
    inputSchema: s.object(
      "The catalog to create.",
      {
        cat_name: s.nonEmptyString("The new catalog name."),
        parent_cat_id: s.integer("The parent catalog ID; omit or use zero for the project root.", {
          minimum: 0,
        }),
        s_number: sortNumber,
      },
      { optional: ["parent_cat_id", "s_number"] },
    ),
    outputSchema: catalogResult,
  }),
  defineProviderAction("showdoc", {
    name: "update_catalog",
    operationType: "write",
    description: "Change a ShowDoc catalog name or display order.",
    inputSchema: s.object(
      "The catalog and at least one field to change.",
      {
        cat_id: catalogId,
        cat_name: s.nonEmptyString("The new catalog name."),
        s_number: s.integer("The new display order."),
      },
      {
        optional: ["cat_name", "s_number"],
        anyOf: [{ required: ["cat_name"] }, { required: ["s_number"] }],
      },
    ),
    outputSchema: catalogResult,
  }),
  defineProviderAction("showdoc", {
    name: "delete_catalog",
    operationType: "destructive",
    description: "Delete a ShowDoc catalog and all its subcatalogs, moving their pages to the recycle bin.",
    inputSchema: s.requiredObject("The catalog subtree to delete.", { cat_id: catalogId }),
    outputSchema: s.looseObject(
      "The deleted catalog reference.",
      { cat_id: returnedId("The deleted catalog ID.") },
      { required: ["cat_id"] },
    ),
  }),
  defineProviderAction("showdoc", {
    name: "upload_attachment",
    operationType: "write",
    description: "Download a file from a public URL and upload it to ShowDoc, optionally associating it with a page.",
    inputSchema: s.object(
      "The source file and optional page association.",
      {
        fileUrl: s.url("A public HTTP or HTTPS URL for the file to download."),
        fileName: s.nonEmptyString(
          "The upload filename including its extension; defaults to the URL basename or attachment.bin.",
        ),
        page_id: pageId,
      },
      { optional: ["fileName", "page_id"] },
    ),
    outputSchema: s.looseObject(
      "The uploaded attachment reference returned by ShowDoc.",
      {
        url: s.string("The attachment download URL."),
        file_id: returnedId("The attachment ID, when returned."),
        sign: s.string("The attachment access signature, when returned."),
      },
      { required: ["url"] },
    ),
  }),
  defineProviderAction("showdoc", {
    name: "delete_attachment",
    operationType: "destructive",
    description: "Delete an uploaded ShowDoc attachment by file ID, access signature, or attachment URL.",
    inputSchema: s.object(
      "At least one attachment reference to delete.",
      {
        file_id: s.integer("The attachment ID.", { minimum: 1 }),
        sign: s.nonEmptyString("The attachment access signature."),
        file_url: s.url("The ShowDoc attachment URL from which ShowDoc extracts the signature."),
      },
      {
        optional: ["file_id", "sign", "file_url"],
        anyOf: [{ required: ["file_id"] }, { required: ["sign"] }, { required: ["file_url"] }],
      },
    ),
    outputSchema: s.looseObject(
      "The deleted attachment reference.",
      { file_id: returnedId("The deleted attachment ID.") },
      { required: ["file_id"] },
    ),
  }),
];
