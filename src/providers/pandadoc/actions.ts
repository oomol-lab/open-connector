import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pandadoc";
const rawObject = s.looseObject("A loose JSON object returned by the PandaDoc API.");
const contact = s.looseObject("A PandaDoc contact.");
const template = s.looseObject("A PandaDoc template.");
const document = s.looseObject("A PandaDoc document.");
const folder = s.looseObject("A PandaDoc document folder.");
const pageInput = {
  page: s.integer("Page number to return.", { minimum: 1 }),
  count: s.integer("Number of results to return.", { minimum: 1 }),
};
const listMeta = {
  count: s.integer("Total number of results available when PandaDoc returns pagination metadata."),
  next: s.nullableString("URL for the next page of results, or null when there is no next page."),
  previous: s.nullableString("URL for the previous page of results, or null when there is no previous page."),
};

export const pandadocActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List contacts in the connected PandaDoc workspace, optionally filtered by email.",
    inputSchema: s.object(
      "Input parameters for listing PandaDoc contacts.",
      {
        email: s.email("Only return contacts with this email address."),
      },
      { optional: ["email"] },
    ),
    outputSchema: s.object("PandaDoc contact list response.", {
      results: s.array("Contacts returned by PandaDoc.", contact),
    }),
  }),
  defineProviderAction(service, {
    name: "create_or_update_contact",
    description: "Create a PandaDoc contact or update the existing contact with the same email address.",
    inputSchema: s.object(
      "Input parameters for creating or updating a PandaDoc contact.",
      {
        email: s.email("Email address of the contact."),
        first_name: s.string("First name of the contact."),
        last_name: s.string("Last name of the contact."),
        company: s.string("Company name of the contact."),
        phone: s.string("Phone number of the contact."),
        job_title: s.string("Job title of the contact."),
        state: s.string("State of the contact."),
        city: s.string("City of the contact."),
        country: s.string("Country of the contact."),
        postal_code: s.string("Postal code of the contact."),
        street_address: s.string("Street address of the contact."),
      },
      {
        optional: [
          "first_name",
          "last_name",
          "company",
          "phone",
          "job_title",
          "state",
          "city",
          "country",
          "postal_code",
          "street_address",
        ],
      },
    ),
    outputSchema: contact,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete a contact from the connected PandaDoc workspace.",
    inputSchema: s.object("Input parameters for deleting a PandaDoc contact.", {
      contact_id: s.nonEmptyString("The PandaDoc contact identifier."),
    }),
    outputSchema: s.object("PandaDoc contact deletion response.", {
      success: s.boolean("Whether the contact was deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List templates available in the connected PandaDoc workspace.",
    inputSchema: s.object(
      "Input parameters for listing PandaDoc templates.",
      {
        ...pageInput,
        q: s.string("Search query."),
        id: s.string("Only return the template with this ID."),
        shared: s.boolean("Whether to include shared templates."),
        deleted: s.boolean("Whether to include deleted templates."),
        folder_uuid: s.string("Folder UUID filter."),
        fields: s.stringArray("Fields to include in the PandaDoc response."),
        tag: s.stringArray("Tags to filter by."),
      },
      { optional: ["page", "count", "q", "id", "shared", "deleted", "folder_uuid", "fields", "tag"] },
    ),
    outputSchema: s.object(
      "PandaDoc template list response.",
      {
        results: s.array("Templates returned by PandaDoc.", template),
        ...listMeta,
      },
      { optional: ["count", "next", "previous"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_template_details",
    description: "Retrieve detailed metadata for a specific PandaDoc template.",
    inputSchema: s.object("Input parameters for retrieving a PandaDoc template.", {
      template_id: s.nonEmptyString("The PandaDoc template identifier."),
    }),
    outputSchema: template,
  }),
  defineProviderAction(service, {
    name: "create_template",
    description: "Create a PandaDoc template from structured content or from a transit file upload.",
    inputSchema: s.object(
      "Input parameters for creating a PandaDoc template.",
      {
        name: s.nonEmptyString("The template name."),
        description: s.string("Optional description of the template."),
        tags: s.stringArray("Tags assigned to the template."),
        content: rawObject,
        file: s.transitFile("PDF file uploaded through POST /api/files."),
      },
      { optional: ["description", "tags", "content", "file"] },
    ),
    outputSchema: template,
  }),
  defineProviderAction(service, {
    name: "delete_template",
    description: "Delete a template from the connected PandaDoc workspace.",
    inputSchema: s.object("Input parameters for deleting a PandaDoc template.", {
      template_id: s.nonEmptyString("The PandaDoc template identifier."),
    }),
    outputSchema: s.object("PandaDoc template deletion response.", {
      status: s.string("Deletion status returned by PandaDoc."),
      message: s.string("Deletion message returned by PandaDoc."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_document_folders",
    description: "List document folders in the connected PandaDoc workspace.",
    inputSchema: s.object(
      "Input parameters for listing PandaDoc document folders.",
      {
        ...pageInput,
        parent_uuid: s.string("Parent folder UUID."),
      },
      { optional: ["page", "count", "parent_uuid"] },
    ),
    outputSchema: s.object(
      "PandaDoc document folder list response.",
      {
        results: s.array("Folders returned by PandaDoc.", folder),
        ...listMeta,
      },
      { optional: ["count", "next", "previous"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_folder",
    description: "Create a new document folder in PandaDoc.",
    inputSchema: s.object(
      "Input parameters for creating a PandaDoc folder.",
      {
        name: s.nonEmptyString("The folder name."),
        parent_uuid: s.string("Parent folder UUID."),
      },
      { optional: ["parent_uuid"] },
    ),
    outputSchema: folder,
  }),
  defineProviderAction(service, {
    name: "create_document_from_file",
    description: "Create a PandaDoc document from a PDF file reference and document metadata.",
    inputSchema: s.object(
      "Input parameters for creating a PandaDoc document from a file.",
      {
        name: s.nonEmptyString("The document name."),
        file: s.transitFile("PDF, DOCX, or RTF file uploaded through POST /api/files."),
        recipients: s.array("Document recipients.", rawObject),
        tokens: s.array("Document tokens.", rawObject),
        fields: rawObject,
        metadata: rawObject,
        tags: s.stringArray("Tags assigned to the document."),
        folder_uuid: s.string("Target folder UUID."),
      },
      { optional: ["recipients", "tokens", "fields", "metadata", "tags", "folder_uuid"] },
    ),
    outputSchema: document,
  }),
  defineProviderAction(service, {
    name: "get_document_details",
    description: "Retrieve detailed metadata for a specific PandaDoc document.",
    inputSchema: s.object("Input parameters for retrieving a PandaDoc document.", {
      document_id: s.nonEmptyString("The PandaDoc document identifier."),
    }),
    outputSchema: document,
  }),
  defineProviderAction(service, {
    name: "create_webhook",
    description: "Create a PandaDoc webhook subscription for document lifecycle events.",
    inputSchema: s.object("Input parameters for creating a PandaDoc webhook.", {
      name: s.nonEmptyString("Webhook name."),
      url: s.url("Webhook destination URL."),
      triggers: s.stringArray("PandaDoc event trigger names."),
    }),
    outputSchema: rawObject,
  }),
  defineProviderAction(service, {
    name: "create_document_attachment",
    description: "Upload an attachment file to a draft PandaDoc document.",
    inputSchema: s.object("Input parameters for uploading a PandaDoc document attachment.", {
      document_id: s.nonEmptyString("The PandaDoc document identifier."),
      file: s.transitFile("Attachment file uploaded through POST /api/files."),
    }),
    outputSchema: rawObject,
  }),
];
