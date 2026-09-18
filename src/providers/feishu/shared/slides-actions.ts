import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuSlidesProviderScopes = {
  create: "slides:presentation:create",
  read: "slides:presentation:read",
  update: "slides:presentation:update",
  write: "slides:presentation:write_only",
  wikiRead: "wiki:node:read",
};
const presentationTokenSchema = s.string("The Slides presentation ID or Wiki node token.", {
  minLength: 1,
});
const presentationTypeSchema = s.stringEnum("Whether `presentationToken` is a Slides ID or a Wiki node token.", [
  "slides",
  "wiki",
]);
const slideIdSchema = s.string("The stable Slides page ID.", { minLength: 1 });
const slideXmlSchema = s.string("A complete SML 2.0 `<slide>` XML element for one Slides page.", {
  minLength: 1,
});
const slideSchema = s.looseRequiredObject(
  "A Slides page returned by Feishu.",
  {
    slide_id: s.string("The stable page ID."),
    content: s.string("The SML 2.0 XML content."),
  },
  {
    optional: ["slide_id", "content"],
  },
);
const presentationSchema = s.looseRequiredObject(
  "A Slides XML presentation returned by Feishu.",
  {
    xml_presentation_id: s.string("The presentation ID."),
    content: s.string("The SML 2.0 presentation XML."),
    revision_id: s.integer("The current presentation revision ID."),
    url: s.string("The presentation URL."),
  },
  {
    optional: ["xml_presentation_id", "content", "revision_id", "url"],
  },
);
const referenceFields = {
  presentationToken: presentationTokenSchema,
  presentationType: presentationTypeSchema,
};
export function createFeishuSlidesActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "create_slides_presentation",
      operationType: "write",
      description: "Create a Feishu Slides presentation and optionally add up to ten initial pages.",
      requiredScopes: [feishuSlidesProviderScopes.create, feishuSlidesProviderScopes.write],
      providerPermissions: [feishuSlidesProviderScopes.create, feishuSlidesProviderScopes.write],
      inputSchema: s.object(
        "Provide a title and optional initial slide XML.",
        {
          title: s.string("The presentation title; defaults to `Untitled`.", {
            minLength: 1,
          }),
          slides: s.array("Initial Slides pages to add after creation.", slideXmlSchema, {
            maxItems: 10,
          }),
        },
        {
          optional: ["title", "slides"],
        },
      ),
      outputSchema: s.looseRequiredObject(
        "The created Slides presentation and any initial pages.",
        {
          presentationId: s.string("The created presentation ID."),
          title: s.string("The created presentation title."),
          revisionId: s.integer("The latest revision ID."),
          url: s.string("The presentation URL."),
          slideIds: s.array("The initial page IDs created by this action.", slideIdSchema),
          issues: s.array(
            "Warnings reported while creating the presentation or pages.",
            s.looseObject("A Slides creation issue."),
          ),
        },
        {
          optional: ["revisionId", "url", "issues"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_slides_presentation",
      operationType: "read",
      description: "Get the complete SML 2.0 XML of a Feishu Slides presentation.",
      requiredScopes: [feishuSlidesProviderScopes.read],
      providerPermissions: [feishuSlidesProviderScopes.read],
      inputSchema: s.object(
        "Identify the presentation and revision to read.",
        {
          ...referenceFields,
          revisionId: s.integer("The revision ID; `-1` reads the latest revision.", {
            minimum: -1,
          }),
          removeAttributeIds: s.boolean("Remove XML id attributes for simpler read-only inspection."),
        },
        {
          optional: ["presentationType", "revisionId", "removeAttributeIds"],
        },
      ),
      outputSchema: s.object(
        "The requested Slides presentation XML.",
        {
          presentationId: s.string("The resolved presentation ID."),
          presentation: {
            ...presentationSchema,
            description: "The presentation XML payload.",
          },
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_slide",
      operationType: "read",
      description: "Get one Feishu Slides page as SML 2.0 XML by stable ID or page number.",
      requiredScopes: [feishuSlidesProviderScopes.read],
      providerPermissions: [feishuSlidesProviderScopes.read],
      inputSchema: s.object(
        "Identify the presentation and one page selector.",
        {
          ...referenceFields,
          slideId: slideIdSchema,
          slideNumber: s.positiveInteger("The one-based page number."),
          revisionId: s.integer("The revision ID; `-1` reads the latest revision.", {
            minimum: -1,
          }),
        },
        {
          optional: ["presentationType", "slideId", "slideNumber", "revisionId"],
        },
      ),
      outputSchema: s.object(
        "The requested Slides page XML.",
        {
          presentationId: s.string("The resolved presentation ID."),
          slide: {
            ...slideSchema,
            description: "The returned page XML payload.",
          },
          revisionId: s.integer("The revision that was read."),
        },
        {
          optional: ["revisionId"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "create_slide",
      operationType: "write",
      description: "Create a page in an existing Feishu Slides presentation.",
      requiredScopes: [feishuSlidesProviderScopes.update, feishuSlidesProviderScopes.write],
      providerPermissions: [feishuSlidesProviderScopes.update, feishuSlidesProviderScopes.write],
      inputSchema: s.object(
        "Identify the presentation and provide one page.",
        {
          ...referenceFields,
          content: slideXmlSchema,
          beforeSlideId: s.string("Insert the new page before this page ID; omit it to append.", {
            minLength: 1,
          }),
          revisionId: s.integer("The base revision for optimistic locking; `-1` uses the latest revision.", {
            minimum: -1,
          }),
        },
        {
          optional: ["presentationType", "beforeSlideId", "revisionId"],
        },
      ),
      outputSchema: slideMutationOutputSchema("The created Slides page."),
    }),
    defineProviderAction(service, {
      name: "delete_slide",
      operationType: "destructive",
      description: "Delete a page from a Feishu Slides presentation.",
      requiredScopes: [feishuSlidesProviderScopes.update, feishuSlidesProviderScopes.write],
      providerPermissions: [feishuSlidesProviderScopes.update, feishuSlidesProviderScopes.write],
      inputSchema: s.object(
        "Identify the presentation and page to delete.",
        {
          ...referenceFields,
          slideId: slideIdSchema,
          revisionId: s.integer("The base revision for optimistic locking; `-1` uses the latest revision.", {
            minimum: -1,
          }),
        },
        {
          optional: ["presentationType", "revisionId"],
        },
      ),
      outputSchema: s.object(
        "The Slides page deletion result.",
        {
          presentationId: s.string("The resolved presentation ID."),
          slideId: slideIdSchema,
          deleted: s.boolean("Whether the page was deleted."),
          revisionId: s.integer("The new presentation revision ID."),
        },
        {
          optional: ["revisionId"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "replace_slide_elements",
      operationType: "destructive",
      description:
        "Replace or insert structural elements on one Slides page, with SML boilerplate added for common shape replacements.",
      requiredScopes: [feishuSlidesProviderScopes.update, feishuSlidesProviderScopes.write],
      providerPermissions: [feishuSlidesProviderScopes.update, feishuSlidesProviderScopes.write],
      inputSchema: s.object(
        "Identify the page and provide up to 200 structural edit parts.",
        {
          ...referenceFields,
          slideId: slideIdSchema,
          parts: s.array(
            "Structural replacement and insertion operations.",
            s.anyOf("One structural Slides edit.", [
              s.object(
                "Replace one existing element.",
                {
                  action: s.literal("block_replace", { description: "The structural edit action." }),
                  blockId: s.string("The existing element ID.", { minLength: 1 }),
                  replacement: s.string("The replacement SML element.", { minLength: 1 }),
                },
                {
                  optional: [],
                },
              ),
              s.object(
                "Insert one or more SML elements.",
                {
                  action: s.literal("block_insert", { description: "The structural edit action." }),
                  insertion: s.string("The SML element or elements to insert.", {
                    minLength: 1,
                  }),
                  insertBeforeBlockId: s.string("Insert before this element ID; omit it to append.", { minLength: 1 }),
                },
                {
                  optional: ["insertBeforeBlockId"],
                },
              ),
            ]),
            { minItems: 1, maxItems: 200 },
          ),
          revisionId: s.integer("The base revision for optimistic locking; `-1` uses the latest revision.", {
            minimum: -1,
          }),
          transactionId: s.string("An optional concurrent-edit transaction ID.", {
            minLength: 1,
          }),
        },
        {
          optional: ["presentationType", "revisionId", "transactionId"],
        },
      ),
      outputSchema: s.looseRequiredObject(
        "The structural Slides edit result.",
        {
          presentationId: s.string("The resolved presentation ID."),
          slideId: slideIdSchema,
          partsCount: s.positiveInteger("The number of submitted edit parts."),
          revisionId: s.integer("The resulting presentation revision ID."),
          failedPartIndex: s.integer("The index of a failed part, when reported."),
          failedReason: s.string("The reason a part failed, when reported."),
        },
        {
          optional: ["revisionId", "failedPartIndex", "failedReason"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "replace_slides",
      operationType: "destructive",
      description:
        "Replace multiple Slides pages by creating each replacement before its old page and then deleting the old page.",
      requiredScopes: [feishuSlidesProviderScopes.update, feishuSlidesProviderScopes.write],
      providerPermissions: [feishuSlidesProviderScopes.update, feishuSlidesProviderScopes.write],
      inputSchema: s.object(
        "Identify the presentation and pages to replace.",
        {
          ...referenceFields,
          pages: s.array(
            "The page replacements to run sequentially.",
            s.object(
              "One page replacement.",
              {
                slideId: slideIdSchema,
                content: slideXmlSchema,
              },
              {
                optional: [],
              },
            ),
            { minItems: 1 },
          ),
          revisionId: s.integer("The initial base revision; `-1` uses the latest revision.", {
            minimum: -1,
          }),
        },
        {
          optional: ["presentationType", "revisionId"],
        },
      ),
      outputSchema: s.object(
        "The completed page replacements.",
        {
          presentationId: s.string("The resolved presentation ID."),
          results: s.array(
            "The old and new page IDs for every completed replacement.",
            s.object(
              "One completed page replacement.",
              {
                oldSlideId: slideIdSchema,
                newSlideId: slideIdSchema,
              },
              {
                optional: [],
              },
            ),
          ),
          revisionId: s.integer("The final presentation revision ID."),
        },
        {
          optional: ["revisionId"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_slides_history",
      operationType: "read",
      description: "List historical versions of a Feishu Slides presentation.",
      requiredScopes: [feishuSlidesProviderScopes.read],
      providerPermissions: [feishuSlidesProviderScopes.read],
      inputSchema: s.object(
        "Identify the presentation and history page.",
        {
          ...referenceFields,
          pageSize: s.positiveInteger("The number of entries to return, from 1 to 20.", {
            maximum: 20,
          }),
          pageToken: s.string("The previous page's pagination token.", { minLength: 1 }),
        },
        {
          optional: ["presentationType", "pageSize", "pageToken"],
        },
      ),
      outputSchema: pageOutputSchema("A page of Slides history versions."),
    }),
    defineProviderAction(service, {
      name: "revert_slides_history",
      operationType: "destructive",
      description: "Revert a Feishu Slides presentation to a historical version and return its task metadata.",
      requiredScopes: [feishuSlidesProviderScopes.update, feishuSlidesProviderScopes.write],
      providerPermissions: [feishuSlidesProviderScopes.update, feishuSlidesProviderScopes.write],
      inputSchema: s.object(
        "Identify the presentation and history version.",
        {
          ...referenceFields,
          historyVersionId: s.string("The positive history version ID.", { minLength: 1 }),
        },
        {
          optional: ["presentationType"],
        },
      ),
      outputSchema: historyTaskOutputSchema(),
    }),
    defineProviderAction(service, {
      name: "get_slides_revert_status",
      operationType: "read",
      description: "Get the status of a Slides history revert task.",
      requiredScopes: [feishuSlidesProviderScopes.read],
      providerPermissions: [feishuSlidesProviderScopes.read],
      inputSchema: s.object(
        "Identify the presentation and revert task.",
        {
          ...referenceFields,
          taskId: s.string("The revert task ID.", { minLength: 1 }),
        },
        {
          optional: ["presentationType"],
        },
      ),
      outputSchema: historyTaskOutputSchema(),
    }),
  ];
}
function slideMutationOutputSchema(description: string) {
  return s.looseRequiredObject(
    description,
    {
      presentationId: s.string("The resolved presentation ID."),
      slideId: slideIdSchema,
      revisionId: s.integer("The new presentation revision ID."),
      issues: s.array("Warnings reported by Feishu.", s.looseObject("A Slides mutation issue.")),
    },
    {
      optional: ["revisionId", "issues"],
    },
  );
}
function pageOutputSchema(description: string) {
  return s.object(
    description,
    {
      entries: s.array("The history entries.", s.looseObject("A Slides history version returned by Feishu.")),
      hasMore: s.boolean("Whether another page is available."),
      pageToken: s.string("The pagination token for the next page."),
    },
    {
      optional: ["pageToken"],
    },
  );
}
function historyTaskOutputSchema() {
  return s.looseRequiredObject(
    "A Slides history task result.",
    {
      taskId: s.string("The background task ID."),
      status: s.string("The current task status."),
      historyVersionId: s.string("The history version involved."),
      failedSlideIds: s.array("The pages that failed during a partial revert.", slideIdSchema),
    },
    {
      optional: ["taskId", "status", "historyVersionId", "failedSlideIds"],
    },
  );
}
