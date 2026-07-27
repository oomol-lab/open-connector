import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  attachmentSchema,
  gidField,
  includeFieldsSchema,
  nextCursorSchema,
  paginationFields,
  successOutputSchema,
} from "./schemas.ts";

const service = "asana";

const attachmentOutputSchema = s.object("The output payload for this action.", {
  attachment: attachmentSchema,
});

const attachmentsOutputSchema = s.object("The output payload for this action.", {
  attachments: s.array("The Asana attachments.", attachmentSchema),
  nextCursor: nextCursorSchema,
});

function resourceInput(idField: string, description: string): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      [idField]: gidField(description),
      includeFields: includeFieldsSchema,
    },
    { required: [idField] },
  );
}

const createAttachmentInputSchema = s.object(
  "The input payload for this action.",
  {
    parentId: gidField("The parent task, project, or project brief gid."),
    fileId: s.nonEmptyString("The local transit file identifier to upload."),
    externalUrl: s.url("The public URL of an external resource to attach."),
    name: s.nonEmptyString("The attachment name required for an external resource."),
    includeFields: includeFieldsSchema,
  },
  { required: ["parentId"] },
);
createAttachmentInputSchema.oneOf = [
  {
    required: ["fileId"],
    not: { anyOf: [{ required: ["externalUrl"] }, { required: ["name"] }] },
  },
  {
    required: ["externalUrl", "name"],
    not: { required: ["fileId"] },
  },
];

export const asanaAttachmentActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_attachment",
    description: "Get an Asana attachment by gid.",
    requiredScopes: ["attachments:read"],
    inputSchema: resourceInput("attachmentId", "The attachment gid."),
    outputSchema: attachmentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_attachment",
    description: "Delete an Asana attachment.",
    requiredScopes: ["attachments:delete"],
    inputSchema: s.object(
      "The input payload for this action.",
      { attachmentId: gidField("The attachment gid.") },
      { required: ["attachmentId"] },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_attachments",
    description: "List attachments on an Asana task, project, or project brief.",
    requiredScopes: ["attachments:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        parentId: gidField("The parent task, project, or project brief gid."),
        ...paginationFields,
        includeFields: includeFieldsSchema,
      },
      { required: ["parentId"] },
    ),
    outputSchema: attachmentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_attachment",
    description: "Attach a public external URL or local transit file to an Asana object.",
    requiredScopes: ["attachments:write"],
    inputSchema: createAttachmentInputSchema,
    outputSchema: attachmentOutputSchema,
  }),
];
