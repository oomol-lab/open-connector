import type { ConnectionSummary } from "../../connection-service.ts";
import type { ActionPolicyDecision } from "../../core/action-policy.ts";
import type { ActionDefinition, JsonSchema } from "../../core/types.ts";
import type { BlockContent, DefinitionContent, ListItem, PhrasingContent, Root, TableCell, TableRow } from "mdast";

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";

export type ActionMarkdownContext = {
  connection?: ConnectionSummary;
  providerPermissions?: string[];
  policy?: ActionPolicyDecision;
};

/**
 * Render a compact action guide for coding agents and humans who want the raw
 * local HTTP contract without browsing the full catalog JSON.
 */
export function renderActionMarkdown(action: ActionDefinition, context: ActionMarkdownContext = {}): string {
  const exampleInput = buildExampleInput(action.inputSchema);
  const exampleBody = JSON.stringify({ input: exampleInput }, null, 2);
  const providerPermissions = context.providerPermissions ?? action.providerPermissions;
  const root: Root = {
    type: "root",
    children: [
      heading(1, action.id),
      ...markdownBlocks(action.description),
      heading(2, "Execute"),
      code(
        "bash",
        [
          `curl -s http://localhost:3000/v1/actions/${action.id} \\`,
          "  -H 'content-type: application/json' \\",
          `  -d '${JSON.stringify({ input: exampleInput })}'`,
        ].join("\n"),
      ),
      code(
        "ts",
        [
          `const response = await fetch("http://localhost:3000/v1/actions/${action.id}", {`,
          `  method: "POST",`,
          `  headers: { "content-type": "application/json" },`,
          `  body: JSON.stringify(${indentMultiline(exampleBody, 2)}),`,
          `});`,
          `const result = await response.json();`,
        ].join("\n"),
      ),
      heading(2, "Input Parameters"),
      ...describeParameters(action.inputSchema),
      heading(2, "Required Scopes"),
      ...describeStringList(action.requiredScopes, "No provider scopes are required."),
      heading(2, "Provider Permissions"),
      ...describeStringList(providerPermissions, "No provider permissions are declared."),
      heading(2, "Execution Policy"),
      ...describePolicy(context.policy),
      heading(2, "Current Connection"),
      ...describeConnection(context.connection),
      heading(2, "Notes For Agents"),
      list([
        textParagraph("Use the local runtime endpoint above; do not call provider APIs directly unless the user asks."),
        paragraph(["Send JSON with a top-level ", inlineCode("input"), " object."]),
        textParagraph("Check the current connection and provider scopes before choosing actions on the user's behalf."),
        textParagraph(
          "If execution fails with a credential error, ask the user to connect the app in the local console.",
        ),
      ]),
    ],
  };

  return toMarkdown(root, {
    bullet: "-",
    fences: true,
    extensions: [gfmToMarkdown()],
  });
}

function describePolicy(policy: ActionPolicyDecision | undefined): BlockContent[] {
  if (!policy) {
    return [textParagraph("Allowed. No execution policy restrictions apply.")];
  }
  const summary = textParagraph(
    policy.allowed ? "Allowed by the current execution policy." : `Denied: ${policy.message}`,
  );
  if (policy.checks.length === 0) {
    return [summary, textParagraph("No policy rules matched or restricted this action.")];
  }
  return [
    summary,
    list(
      policy.checks.map((check) =>
        paragraph([
          inlineCode(check.source),
          ": ",
          inlineCode(check.outcome),
          ...(check.rule ? [" via ", inlineCode(check.rule)] : []),
        ]),
      ),
    ),
  ];
}

function describeConnection(connection: ConnectionSummary | undefined): BlockContent[] {
  if (!connection) {
    return [textParagraph("This provider is not connected in the local runtime.")];
  }

  const scopes: Array<string | PhrasingContent> =
    connection.profile.grantedScopes.length > 0
      ? joinPhrasing(
          connection.profile.grantedScopes.map((scope) => inlineCode(scope)),
          ", ",
        )
      : ["unknown or not provider-scoped"];

  return [
    list([
      paragraph(["Account: ", connection.profile.displayName]),
      paragraph(["Account ID: ", inlineCode(connection.profile.accountId)]),
      paragraph(["Auth type: ", inlineCode(connection.authType)]),
      paragraph(["Granted scopes: ", ...scopes]),
    ]),
  ];
}

function describeParameters(schema: JsonSchema): BlockContent[] {
  const properties = readProperties(schema);
  const entries = Object.entries(properties);
  if (entries.length === 0) {
    return [textParagraph("This action does not require input parameters.")];
  }

  const required = new Set(readRequired(schema));
  return [
    parameterTable(entries, required),
    listItems(
      entries.map(([name, property]) =>
        listItem([paragraph([inlineCode(name)]), ...markdownBlockContent(readDescription(property))]),
      ),
    ),
  ];
}

function parameterTable(entries: Array<[string, JsonSchema]>, required: Set<string>): BlockContent {
  return {
    type: "table",
    align: [null, null, null],
    children: [
      tableRow(["Name", "Required", "Type"].map(textTableCell)),
      ...entries.map(([name, property]) =>
        tableRow([
          inlineCodeTableCell(name),
          textTableCell(required.has(name) ? "Yes" : "No"),
          inlineCodeTableCell(describeType(property)),
        ]),
      ),
    ],
  };
}

function describeStringList(values: string[], emptyText: string): BlockContent[] {
  return values.length > 0 ? [list(values.map((value) => paragraph([inlineCode(value)])))] : [textParagraph(emptyText)];
}

function markdownBlocks(value: string): DocumentContent[] {
  const text = value.trim();
  if (!text) {
    return [];
  }
  return fromMarkdown(text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }).children.filter(isDocumentContent);
}

function markdownBlockContent(value: string): BlockContent[] {
  return markdownBlocks(value).filter(isBlockContent);
}

function heading(depth: 1 | 2, value: string): BlockContent {
  return { type: "heading", depth, children: [{ type: "text", value }] };
}

function paragraph(children: Array<string | PhrasingContent>): BlockContent {
  return {
    type: "paragraph",
    children: children.map((child) => (typeof child === "string" ? { type: "text", value: child } : child)),
  };
}

function textParagraph(value: string): BlockContent {
  return paragraph([value]);
}

function inlineCode(value: string): PhrasingContent {
  return { type: "inlineCode", value };
}

function code(lang: string, value: string): BlockContent {
  return { type: "code", lang, value };
}

function list(children: BlockContent[]): BlockContent {
  return listItems(children.map((child) => listItem([child])));
}

function listItems(children: ListItem[]): BlockContent {
  return {
    type: "list",
    ordered: false,
    spread: false,
    children,
  };
}

function listItem(children: BlockContent[]): ListItem {
  return { type: "listItem", spread: children.length > 1, children };
}

function joinPhrasing(values: PhrasingContent[], separator: string): Array<string | PhrasingContent> {
  return values.flatMap((value, index) => (index === 0 ? [value] : [separator, value]));
}

function tableRow(children: TableCell[]): TableRow {
  return { type: "tableRow", children };
}

function textTableCell(value: string): TableCell {
  return { type: "tableCell", children: [{ type: "text", value }] };
}

function inlineCodeTableCell(value: string): TableCell {
  return { type: "tableCell", children: [{ type: "inlineCode", value }] };
}

function indentMultiline(value: string, spaces: number): string {
  const indent = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${indent}${line}`))
    .join("\n");
}

function isDocumentContent(node: Root["children"][number]): node is BlockContent | DefinitionContent {
  return [
    "blockquote",
    "code",
    "definition",
    "footnoteDefinition",
    "heading",
    "html",
    "list",
    "paragraph",
    "table",
    "thematicBreak",
  ].includes(node.type);
}

function isBlockContent(node: DocumentContent): node is BlockContent {
  return node.type !== "definition" && node.type !== "footnoteDefinition";
}

type DocumentContent = BlockContent | DefinitionContent;

function buildExampleInput(schema: JsonSchema): Record<string, unknown> {
  const properties = readProperties(schema);
  const input: Record<string, unknown> = {};
  for (const name of readRequired(schema)) {
    input[name] = exampleValue(properties[name]);
  }
  return input;
}

function readProperties(schema: JsonSchema): Record<string, JsonSchema> {
  return schema.properties && typeof schema.properties === "object"
    ? (schema.properties as Record<string, JsonSchema>)
    : {};
}

function readRequired(schema: JsonSchema): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === "string")
    : [];
}

function describeType(schema: JsonSchema | undefined): string {
  if (!schema) {
    return "unknown";
  }
  if (typeof schema.const === "string" || typeof schema.const === "number" || typeof schema.const === "boolean") {
    return JSON.stringify(schema.const);
  }
  if (Array.isArray(schema.enum)) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  }
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.map((item) => describeType(item as JsonSchema)).join(" | ");
  }
  return typeof schema.type === "string" ? schema.type : "unknown";
}

function readDescription(schema: JsonSchema | undefined): string {
  return schema && typeof schema.description === "string" ? schema.description : "";
}

function exampleValue(schema: JsonSchema | undefined): unknown {
  if (!schema) {
    return "";
  }
  if (schema.default !== undefined) {
    return schema.default;
  }
  if (schema.const !== undefined) {
    return schema.const;
  }
  if (Array.isArray(schema.enum)) {
    return schema.enum[0];
  }
  if (schema.type === "integer" || schema.type === "number") {
    return 1;
  }
  if (schema.type === "boolean") {
    return false;
  }
  if (schema.type === "array") {
    return [];
  }
  if (schema.type === "object") {
    return {};
  }
  return "";
}
