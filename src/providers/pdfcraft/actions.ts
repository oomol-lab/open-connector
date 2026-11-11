import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pdfcraft";
const uuid = s.string("The PDFCraft transform UUID. Save it to resume the task.", {
  format: "uuid",
});
const result = s.unknown("The upstream MCP result, including data, recovery guidance and any additional fields.");
const parameters = s.requiredObject(
  "Conversion parameters. PDF supports Markdown or EPUB without translation; PDF output and EPUB input require translation. EPUB input does not accept refinement.",
  {
    output_format: s.stringEnum("The output format. Markdown is downloaded as a ZIP archive.", [
      "markdown",
      "epub",
      "pdf",
    ]),
    target_language: s.optional(
      s.stringEnum(
        "The case-sensitive translation target; omit to keep the source language for PDF to Markdown or EPUB.",
        [
          "zh-CN",
          "en",
          "de",
          "es",
          "fr",
          "it",
          "ja",
          "ko",
          "pt",
          "ru",
          "ar",
          "hi",
          "nl",
          "pl",
          "tr",
          "vi",
          "th",
          "id",
          "sv",
          "da",
          "no",
          "fi",
        ],
      ),
    ),
    rendering_mode: s.optional(
      s.stringEnum(
        "Defaults to source without translation and replace with translation. PDF output only supports replace.",
        ["source", "replace", "bilingual", "bilingual-inline"],
      ),
    ),
    translation_prompt: s.optional(
      s.nonEmptyString("Optional terminology instructions; only allowed with translation.", { pattern: "\\S" }),
    ),
    refinement: s.optional(
      s.stringEnum("PDF-only extraction mode. Defaults to disabled.", ["disabled", "refinement_with_footnotes"]),
    ),
  },
);
const transform = s.looseObject("The current transform, with upstream metadata preserved.", {
  uuid,
  status: s.string("The task state: waiting_for_upload, running, succeeded, failed or cancelled."),
});

export const actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover PDFCraft tools and their live schemas for conversion, translation, balance, estimates, task recovery and downloads. Call get_capabilities through call_tool before the first conversion.",
    inputSchema: s.requiredObject("No input is required.", {}),
    outputSchema: s.requiredObject("The live PDFCraft MCP catalog.", {
      tools: s.array("Available tools with input and output schemas.", s.looseObject("An upstream tool definition.")),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    operationType: "destructive",
    description:
      "Call a PDFCraft MCP tool using its live schema from list_tools. Results preserve the upstream data envelope. For file conversion, prefer submit_transform to handle uploading a public file URL. get_download_urls defaults to complete output; request limited output only explicitly.",
    inputSchema: s.requiredObject("A tool invocation using the current upstream schema.", {
      toolName: s.nonEmptyString("The exact tool name returned by list_tools.", { pattern: "\\S" }),
      arguments: s.optional(
        s.looseObject("JSON arguments matching the selected tool schema; defaults to an empty object."),
      ),
    }),
    outputSchema: s.requiredObject("The PDFCraft tool result.", { result }),
  }),
  defineProviderAction(service, {
    name: "submit_transform",
    operationType: "write",
    description:
      "Download a public PDF or EPUB URL, create a PDFCraft task, upload the bytes and launch conversion or translation. Uses OOMOL credits. Returns immediately after launch; use get_transform to check completion, then call get_download_urls for a download link. Connector accepts files up to 100 MiB. On failure after creation, retain the UUID from the error and resume that task instead of creating another.",
    asyncLifecycle: { startActionId: "pdfcraft.submit_transform", statusActionId: "pdfcraft.get_transform" },
    inputSchema: s.requiredObject("A URL-based conversion request.", {
      fileUrl: s.string("A publicly accessible direct file download URL; local paths are not supported.", {
        format: "uri",
      }),
      input_format: s.stringEnum("The source document format.", ["pdf", "epub"]),
      input_filename: s.optional(
        s.string("An optional display name for the source document.", {
          minLength: 1,
          maxLength: 255,
        }),
      ),
      parameters,
    }),
    outputSchema: transform,
  }),
  defineProviderAction(service, {
    name: "get_transform",
    operationType: "read",
    description:
      "Get a PDFCraft task and its progress or failure recovery guidance. When succeeded, call get_download_urls through call_tool and save the result before it expires.",
    asyncLifecycle: { startActionId: "pdfcraft.submit_transform", statusActionId: "pdfcraft.get_transform" },
    inputSchema: s.requiredObject("The task to retrieve.", { uuid }),
    outputSchema: transform,
  }),
];
