import { providerInputError, ProviderRequestError } from "../../provider-runtime.ts";

export interface FeishuMarkdownDownloadInput {
  readonly fileToken: string;
  readonly version?: string;
}

export interface FeishuMarkdownDownloadResult {
  readonly markdown: string;
  readonly fileName?: string;
  readonly version?: string;
}

export interface FeishuMarkdownUploadInput {
  readonly fileToken?: string;
  readonly fileName: string;
  readonly markdown: string;
  readonly parentType: "explorer" | "wiki";
  readonly parentNode: string;
}

export interface FeishuMarkdownUploadResult {
  readonly fileToken: string;
  readonly fileName?: string;
  readonly version?: string;
  readonly url?: string;
}

export interface FeishuMarkdownFileMetadata {
  readonly fileName?: string;
  readonly url?: string;
}

export interface FeishuMarkdownRuntimeContext {
  readonly download: (input: FeishuMarkdownDownloadInput) => Promise<FeishuMarkdownDownloadResult>;
  readonly upload: (input: FeishuMarkdownUploadInput) => Promise<FeishuMarkdownUploadResult>;
  readonly getMetadata?: (fileToken: string) => Promise<FeishuMarkdownFileMetadata>;
}

interface FeishuMarkdownActionHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const maximumDiffBytes = 10 * 1024 * 1024;
const maximumLcsCells = 2_000_000;

export function createFeishuMarkdownActionHandlers(
  context: FeishuMarkdownRuntimeContext,
): Record<string, FeishuMarkdownActionHandler> {
  return {
    create_markdown_file(input) {
      return createMarkdownFile(input, context);
    },
    fetch_markdown_file(input) {
      return fetchMarkdownFile(input, context);
    },
    diff_markdown_file(input) {
      return diffMarkdownFile(input, context);
    },
    patch_markdown_file(input) {
      return patchMarkdownFile(input, context);
    },
    overwrite_markdown_file(input) {
      return overwriteMarkdownFile(input, context);
    },
  };
}

async function createMarkdownFile(input: Record<string, unknown>, context: FeishuMarkdownRuntimeContext) {
  const fileName = markdownFileName(input.fileName, "fileName");
  const markdown = nonEmptyMarkdown(input.markdown);
  const folderToken = optionalString(input.folderToken);
  const wikiToken = optionalString(input.wikiToken);
  if (folderToken && wikiToken) {
    throw providerInputError("folderToken and wikiToken are mutually exclusive");
  }

  const result = await context.upload({
    fileName,
    markdown,
    parentType: wikiToken ? "wiki" : "explorer",
    parentNode: wikiToken ?? folderToken ?? "",
  });
  return normalizeWriteResult(result, fileName, markdown);
}

async function fetchMarkdownFile(input: Record<string, unknown>, context: FeishuMarkdownRuntimeContext) {
  const fileToken = requiredString(input.fileToken, "fileToken");
  const result = await context.download({
    fileToken,
    version: optionalString(input.version),
  });
  ensureMarkdownString(result.markdown);
  return {
    fileToken,
    fileName: markdownFileName(result.fileName ?? `${fileToken}.md`, "downloaded fileName"),
    markdown: result.markdown,
    version: result.version,
    sizeBytes: utf8Size(result.markdown),
  };
}

async function diffMarkdownFile(input: Record<string, unknown>, context: FeishuMarkdownRuntimeContext) {
  const fileToken = requiredString(input.fileToken, "fileToken");
  const fromVersion = optionalString(input.fromVersion);
  const toVersion = optionalString(input.toVersion);
  const proposedMarkdown = typeof input.markdown === "string" ? input.markdown : undefined;
  const contextLines = optionalNonNegativeInteger(input.contextLines, "contextLines") ?? 3;
  if (proposedMarkdown === undefined && fromVersion === undefined) {
    throw providerInputError("provide markdown for remote-to-input diff or fromVersion for remote-to-remote diff");
  }
  if (proposedMarkdown !== undefined && toVersion !== undefined) {
    throw providerInputError("toVersion cannot be combined with markdown");
  }

  const from = await context.download({ fileToken, version: fromVersion });
  ensureDiffSize(from.markdown, "remote Markdown");
  let toMarkdown: string;
  let toLabel: string;
  let mode: "remote_vs_remote" | "remote_vs_input";
  if (proposedMarkdown !== undefined) {
    ensureDiffSize(proposedMarkdown, "input Markdown");
    toMarkdown = proposedMarkdown;
    toLabel = "b/input.md";
    mode = "remote_vs_input";
  } else {
    const to = await context.download({ fileToken, version: toVersion });
    ensureDiffSize(to.markdown, "remote Markdown");
    toMarkdown = to.markdown;
    toLabel = `b/${fileToken}@${toVersion ? `version:${toVersion}` : "latest"}`;
    mode = "remote_vs_remote";
  }

  const fromLabel = `a/${fileToken}@${fromVersion ? `version:${fromVersion}` : "latest"}`;
  const summary = summarizeDiff(fromLabel, toLabel, from.markdown, toMarkdown, contextLines);
  return {
    ...summary,
    mode,
    fileToken,
    fromVersion: fromVersion ?? null,
    toVersion: toVersion ?? null,
    fromLabel,
    toLabel,
    contextLines,
  };
}

async function patchMarkdownFile(input: Record<string, unknown>, context: FeishuMarkdownRuntimeContext) {
  const fileToken = requiredString(input.fileToken, "fileToken");
  const pattern = requiredRawString(input.pattern, "pattern", false);
  const replacement = requiredRawString(input.replacement, "replacement", true);
  const downloaded = await context.download({ fileToken });
  ensureMarkdownString(downloaded.markdown);
  const regex = input.regex === true;
  if (regex) {
    ensureRegexPatchSize(downloaded.markdown, "remote Markdown");
    ensureRegexPatchSize(pattern, "pattern");
  }
  const patched = applyPatch(downloaded.markdown, pattern, replacement, regex);
  const fileName = markdownFileName(
    optionalString(input.fileName) ?? downloaded.fileName ?? `${fileToken}.md`,
    "fileName",
  );
  const beforeSize = utf8Size(downloaded.markdown);
  if (patched.matchCount === 0) {
    return {
      updated: false,
      mode: input.regex === true ? "regex" : "literal",
      matchCount: 0,
      fileName,
      version: undefined,
      sizeBytesBefore: beforeSize,
      sizeBytesAfter: beforeSize,
    };
  }

  const markdown = nonEmptyMarkdown(patched.markdown);
  const result = await context.upload({
    fileToken,
    fileName,
    markdown,
    parentType: "explorer",
    parentNode: "",
  });
  return {
    updated: true,
    mode: input.regex === true ? "regex" : "literal",
    matchCount: patched.matchCount,
    fileName: result.fileName ?? fileName,
    version: result.version,
    sizeBytesBefore: beforeSize,
    sizeBytesAfter: utf8Size(markdown),
  };
}

async function overwriteMarkdownFile(input: Record<string, unknown>, context: FeishuMarkdownRuntimeContext) {
  const fileToken = requiredString(input.fileToken, "fileToken");
  const markdown = nonEmptyMarkdown(input.markdown);
  let fileName = optionalString(input.fileName);
  let metadata: FeishuMarkdownFileMetadata | undefined = undefined;
  if (!fileName && context.getMetadata) {
    metadata = await context.getMetadata(fileToken);
    fileName = metadata.fileName;
  }
  fileName = markdownFileName(fileName ?? `${fileToken}.md`, "fileName");

  const result = await context.upload({
    fileToken,
    fileName,
    markdown,
    parentType: "explorer",
    parentNode: "",
  });
  return normalizeWriteResult(
    {
      ...result,
      url: result.url ?? metadata?.url,
    },
    fileName,
    markdown,
    fileToken,
  );
}

function normalizeWriteResult(
  result: FeishuMarkdownUploadResult,
  fallbackName: string,
  markdown: string,
  fallbackToken?: string,
) {
  const fileToken = optionalString(result.fileToken) ?? fallbackToken;
  if (!fileToken) {
    throw new ProviderRequestError(502, "Feishu Markdown upload returned no file token");
  }
  return {
    fileToken,
    fileName: markdownFileName(result.fileName ?? fallbackName, "uploaded fileName"),
    version: result.version,
    sizeBytes: utf8Size(markdown),
    url: result.url,
  };
}

interface PatchResult {
  readonly markdown: string;
  readonly matchCount: number;
}

function applyPatch(markdown: string, pattern: string, replacement: string, regex: boolean): PatchResult {
  if (!regex) {
    return {
      markdown: markdown.replaceAll(pattern, replacement),
      matchCount: markdown.split(pattern).length - 1,
    };
  }

  let expression: RegExp;
  try {
    expression = new RegExp(pattern, "g");
  } catch (error) {
    throw providerInputError(
      `pattern is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    markdown: markdown.replace(expression, replacement),
    matchCount: [...markdown.matchAll(expression)].length,
  };
}

type DiffLineKind = "equal" | "delete" | "insert";

interface DiffLine {
  readonly kind: DiffLineKind;
  readonly content: string;
}

interface DiffRange {
  readonly start: number;
  readonly end: number;
}

interface DiffHunk {
  readonly header: string;
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
}

function summarizeDiff(
  fromLabel: string,
  toLabel: string,
  fromMarkdown: string,
  toMarkdown: string,
  contextLines: number,
) {
  const operations = lineDiff(splitLines(fromMarkdown), splitLines(toMarkdown));
  const ranges = diffRanges(operations, contextLines);
  let addedLines = 0;
  let deletedLines = 0;
  for (const operation of operations) {
    if (operation.kind === "insert") {
      addedLines++;
    } else if (operation.kind === "delete") {
      deletedLines++;
    }
  }
  const hunks = ranges.map((range) => diffHunk(operations, range));
  return {
    changed: addedLines > 0 || deletedLines > 0,
    addedLines,
    deletedLines,
    hunks,
    diff: unifiedDiff(fromLabel, toLabel, operations, ranges),
  };
}

function splitLines(value: string) {
  if (!value) {
    return [];
  }
  const parts = value.split("\n");
  const lines: string[] = [];
  for (let index = 0; index < parts.length; index++) {
    if (index === parts.length - 1 && parts[index] === "") {
      continue;
    }
    lines.push(index < parts.length - 1 ? `${parts[index]}\n` : parts[index]!);
  }
  return lines;
}

function lineDiff(before: readonly string[], after: readonly string[]) {
  if (before.length * after.length > maximumLcsCells) {
    return fallbackLineDiff(before, after);
  }

  const width = after.length + 1;
  const lengths = new Uint32Array((before.length + 1) * width);
  for (let oldIndex = before.length - 1; oldIndex >= 0; oldIndex--) {
    for (let newIndex = after.length - 1; newIndex >= 0; newIndex--) {
      const offset = oldIndex * width + newIndex;
      lengths[offset] =
        before[oldIndex] === after[newIndex]
          ? lengths[(oldIndex + 1) * width + newIndex + 1]! + 1
          : Math.max(lengths[(oldIndex + 1) * width + newIndex]!, lengths[oldIndex * width + newIndex + 1]!);
    }
  }

  const operations: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < before.length && newIndex < after.length) {
    if (before[oldIndex] === after[newIndex]) {
      operations.push({ kind: "equal", content: before[oldIndex]! });
      oldIndex++;
      newIndex++;
    } else if (lengths[(oldIndex + 1) * width + newIndex]! >= lengths[oldIndex * width + newIndex + 1]!) {
      operations.push({ kind: "delete", content: before[oldIndex]! });
      oldIndex++;
    } else {
      operations.push({ kind: "insert", content: after[newIndex]! });
      newIndex++;
    }
  }
  while (oldIndex < before.length) {
    operations.push({ kind: "delete", content: before[oldIndex++]! });
  }
  while (newIndex < after.length) {
    operations.push({ kind: "insert", content: after[newIndex++]! });
  }
  return operations;
}

function fallbackLineDiff(before: readonly string[], after: readonly string[]) {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) {
    suffix++;
  }

  const operations: DiffLine[] = [];
  for (const content of before.slice(0, prefix)) {
    operations.push({ kind: "equal", content });
  }
  for (const content of before.slice(prefix, before.length - suffix)) {
    operations.push({ kind: "delete", content });
  }
  for (const content of after.slice(prefix, after.length - suffix)) {
    operations.push({ kind: "insert", content });
  }
  for (const content of before.slice(before.length - suffix)) {
    operations.push({ kind: "equal", content });
  }
  return operations;
}

function diffRanges(operations: readonly DiffLine[], contextLines: number) {
  const changedIndexes: number[] = [];
  for (let index = 0; index < operations.length; index++) {
    if (operations[index]!.kind !== "equal") {
      changedIndexes.push(index);
    }
  }
  if (changedIndexes.length === 0) {
    return [];
  }

  const ranges: DiffRange[] = [];
  let current: DiffRange = {
    start: Math.max(0, changedIndexes[0]! - contextLines),
    end: Math.min(operations.length, changedIndexes[0]! + contextLines + 1),
  };
  for (const index of changedIndexes.slice(1)) {
    const next: DiffRange = {
      start: Math.max(0, index - contextLines),
      end: Math.min(operations.length, index + contextLines + 1),
    };
    if (next.start <= current.end) {
      current = { start: current.start, end: Math.max(current.end, next.end) };
    } else {
      ranges.push(current);
      current = next;
    }
  }
  ranges.push(current);
  return ranges;
}

function diffHunk(operations: readonly DiffLine[], range: DiffRange): DiffHunk {
  let oldBefore = 0;
  let newBefore = 0;
  for (const operation of operations.slice(0, range.start)) {
    if (operation.kind !== "insert") oldBefore++;
    if (operation.kind !== "delete") newBefore++;
  }

  let oldLines = 0;
  let newLines = 0;
  for (const operation of operations.slice(range.start, range.end)) {
    if (operation.kind !== "insert") oldLines++;
    if (operation.kind !== "delete") newLines++;
  }
  const oldStart = oldLines === 0 ? oldBefore : oldBefore + 1;
  const newStart = newLines === 0 ? newBefore : newBefore + 1;
  return {
    header: `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`,
    oldStart,
    oldLines,
    newStart,
    newLines,
  };
}

function unifiedDiff(
  fromLabel: string,
  toLabel: string,
  operations: readonly DiffLine[],
  ranges: readonly DiffRange[],
) {
  if (ranges.length === 0) {
    return "";
  }

  let output = `--- ${fromLabel}\n+++ ${toLabel}\n`;
  for (const range of ranges) {
    output += `${diffHunk(operations, range).header}\n`;
    for (const operation of operations.slice(range.start, range.end)) {
      const prefix = operation.kind === "insert" ? "+" : operation.kind === "delete" ? "-" : " ";
      output += `${prefix}${operation.content}`;
      if (!operation.content.endsWith("\n")) {
        output += "\n\\ No newline at end of file\n";
      }
    }
  }
  return output;
}

function ensureDiffSize(markdown: string, field: string) {
  ensureMarkdownString(markdown);
  if (utf8Size(markdown) > maximumDiffBytes) {
    throw providerInputError(`${field} exceeds the 10 MB diff limit`);
  }
}

function ensureRegexPatchSize(value: string, field: string) {
  if (utf8Size(value) > maximumDiffBytes) {
    throw providerInputError(`${field} exceeds the 10 MB regex patch limit`);
  }
}

function nonEmptyMarkdown(value: unknown) {
  const markdown = requiredRawString(value, "markdown", false);
  if (utf8Size(markdown) === 0) {
    throw providerInputError("empty Markdown content is not supported");
  }
  return markdown;
}

function ensureMarkdownString(value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, "Markdown download returned non-string content");
  }
}

function markdownFileName(value: unknown, field: string) {
  const result = requiredString(value, field);
  if (!result.toLowerCase().endsWith(".md")) {
    throw providerInputError(`${field} must end with .md`);
  }
  return result;
}

function optionalNonNegativeInteger(value: unknown, field: string) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw providerInputError(`${field} must be a non-negative integer`);
  }
  return value;
}

function requiredRawString(value: unknown, field: string, allowEmpty: boolean) {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw providerInputError(`${field} is required`);
  }
  return value;
}

function requiredString(value: unknown, field: string) {
  const result = optionalString(value);
  if (!result) {
    throw providerInputError(`${field} is required`);
  }
  return result;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function utf8Size(value: string) {
  return new TextEncoder().encode(value).byteLength;
}
