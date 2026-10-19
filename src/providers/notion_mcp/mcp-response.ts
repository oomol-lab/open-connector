import {
  compactObject,
  looseArray,
  optionalRawString,
  optionalRecord,
  optionalString,
  pickOptionalString,
  recordOrEmpty,
} from "../../core/cast.ts";

/**
 * Readers for the text envelopes Notion's beta MCP tools answer in, as they were recorded live. Every reader is
 * defensive: a field the server omits is absent from the typed result, an unrecognized shape yields an empty
 * result, and nothing here throws, because the caller keeps the raw text beside the typed fields.
 */

interface NotionMcpUser {
  id?: string;
  name?: string;
  email?: string;
  type?: string;
}

interface NotionMcpSearchResult {
  id?: string;
  title?: string;
  url?: string;
  type?: string;
  timestamp?: string;
  path?: string;
}

interface NotionMcpSearch {
  type: string | undefined;
  results: NotionMcpSearchResult[];
  notices: string[];
}

interface NotionMcpPage {
  title?: string;
  url?: string;
  page_last_edited_at?: string;
  properties?: string;
  content?: string;
  truncated: boolean;
}

interface NotionMcpComment {
  id?: string;
  discussion_id?: string;
  plain_text?: string;
  created_time?: string;
  created_by?: NotionMcpUser;
}

interface NotionMcpToolRestriction {
  parameter: string;
  reason: string;
}

interface NotionMcpToolAccess {
  tool: string;
  status: string | undefined;
  restricted_parameters: NotionMcpToolRestriction[];
  upgrade_url: string | undefined;
  full_version_url: string | undefined;
  landing_page_url: string | undefined;
  landing_page_action: string | undefined;
}

interface NotionMcpCreatedPage {
  id?: string;
  url?: string;
  title?: string;
}

/** One `<tag ...>body</tag>` element, with its position in the scanned text. */
interface XmlBlock {
  attributes: string;
  body: string;
  start: number;
  end: number;
}

// Tag and attribute patterns exclude `<` and use a lookbehind so each scan is linear in the text length: page
// content and comments are user-written, and a quadratic pattern would block the event loop on a crafted answer.
const pageTag = /<page\b([^<>]*)>/i;
const contentOpening = /<content\b[^<>]*>/i;
const tagAttribute = /(?<![\w:-])([\w:-]+)\s*=\s*"([^"]*)"/g;
const anyTag = /<[^<>]+>/g;
const namedEntities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
// A Notion page link in prose, and the 32-hex page id a link or an id carries.
const notionLink = /https:\/\/(?:www\.)?notion\.so\/[^\s)"'<>]+/g;
const notionPageId = /([0-9a-f]{32})(?:[?#]|$)/i;

/** Notion's tools answer JSON in a text block on most calls and prose or XML fragments on the rest. */
export function decodeNotionToolText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Not JSON after all: the text is the value.
    }
  }
  return text;
}

/**
 * The connected user as notion-get-users answers `user_id: "self"`: the first listed user of
 * `{results: [{type, id, name, email}], has_more}` that carries an ID or an email, or the answer itself when it is a
 * single user.
 */
export function parseNotionSelf(value: unknown): NotionMcpUser | undefined {
  const users = findList(value, "results", "users").flatMap((item) => {
    const user = readUser(item);
    return user ? [user] : [];
  });
  const candidates = users.length > 0 ? users : [readUser(value)];
  return candidates.find((user) => user?.id !== undefined || user?.email !== undefined);
}

/**
 * Search results plus the server's notices, such as a filter dropped on the connected plan, and the search `type`
 * the server reports: `workspace_search`, or `ai_search` when it routed a keyword query to Notion AI search.
 */
export function parseNotionSearch(value: unknown): NotionMcpSearch {
  const record = optionalRecord(value);
  const results = findList(value, "results", "pages", "items").flatMap((item) => {
    const result = optionalRecord(item);
    if (!result) return [];
    const typed: NotionMcpSearchResult = compactObject({
      id: pickOptionalString(result, "id"),
      title: readTitle(result),
      url: pickOptionalString(result, "url"),
      type: pickOptionalString(result, "type"),
      timestamp: pickOptionalString(result, "timestamp", "last_edited_time"),
      path: pickOptionalString(result, "path"),
    });
    return [typed];
  });
  return { type: record && pickOptionalString(record, "type"), results, notices: readNotices(record?.notices) };
}

/**
 * The page envelope notion-fetch answers: a preamble line, then
 * `<page url="..."><properties>...</properties><content>MARKDOWN</content></page>`, either bare in the text block or
 * under `text` of a `{title, url, page_last_edited_at, text}` object. A page the server cut says so with a
 * `truncated` flag on the object or on the tag.
 */
export function parseNotionPage(value: unknown): NotionMcpPage {
  const record = optionalRecord(value);
  const text = record ? pickOptionalString(record, "text", "content", "markdown", "body") : optionalString(value);
  const tag = text === undefined ? null : pageTag.exec(text);
  const attributes = tag ? readAttributes(tag[1]!) : {};
  const properties = text === undefined ? undefined : nextXmlBlock(text, "properties", 0);
  const content = text === undefined ? undefined : nextXmlBlock(text, "content", 0);
  let body: string | undefined;
  if (content) {
    body = content.body;
  } else if (text !== undefined) {
    // No closed content block: an unclosed one takes the rest; a bare answer is the whole text.
    const opening = contentOpening.exec(text);
    body = opening ? text.slice(opening.index + opening[0].length) : text;
  }
  return {
    ...compactObject({
      title: (record && pickOptionalString(record, "title")) ?? optionalString(attributes.title),
      url: (record && pickOptionalString(record, "url")) ?? optionalString(attributes.url),
      page_last_edited_at:
        (record && pickOptionalString(record, "page_last_edited_at", "last_edited_time")) ??
        optionalString(attributes.page_last_edited_at ?? attributes.last_edited_time),
      properties: properties ? unescapeEntities(properties.body).trim() : undefined,
      content: body === undefined ? undefined : unescapeEntities(body).trim(),
    }),
    truncated:
      record?.truncated === true ||
      isTrue(attributes.truncated) ||
      (content !== undefined && isTrue(readAttributes(content.attributes).truncated)),
  };
}

/**
 * Comments as notion-get-comments answers them, in both recorded shapes: the structured
 * `{discussions: [{id, comments: [{id, plain_text, created_time, created_by}]}]}` (or a flat `{comments: [...]}`),
 * or the XML twin `<discussion id><comment id author author_id created_time>text</comment></discussion>`.
 */
export function parseNotionComments(value: unknown): NotionMcpComment[] {
  const record = optionalRecord(value);
  if (!record) {
    const text = optionalString(value);
    return text === undefined ? [] : readXmlComments(text);
  }
  const comments = findList(record, "comments", "results", "items").flatMap((item) => readComment(item, undefined));
  for (const discussion of findList(record, "discussions")) {
    const thread = optionalRecord(discussion);
    if (!thread) continue;
    const discussionId = pickOptionalString(thread, "id", "discussion_id");
    comments.push(...findList(thread, "comments", "results").flatMap((item) => readComment(item, discussionId)));
  }
  if (comments.length > 0) return comments;
  const text = pickOptionalString(record, "text");
  return text === undefined ? [] : readXmlComments(text);
}

/**
 * The plan report notion-get-tool-access answers: `{current_tool_access: {<tool>: {status, restricted_parameters?,
 * upgrade_url?, full_version_url?, landing_page_url?, landing_page_action?}}}`, keyed by each tool's base name
 * (`search`, `ai_search`), where `restricted_parameters` maps a parameter path such as `filters.title_only` to the
 * reason it is unavailable. The reason is kept as text and never interpreted.
 */
export function parseNotionToolAccess(value: unknown): NotionMcpToolAccess[] {
  const access = recordOrEmpty(optionalRecord(value)?.current_tool_access);
  return Object.entries(access).flatMap(([tool, item]) => {
    const entry = optionalRecord(item);
    if (!entry) return [];
    const restrictions = Object.entries(recordOrEmpty(entry.restricted_parameters)).map(([parameter, reason]) => ({
      parameter,
      reason: optionalRawString(reason) ?? JSON.stringify(reason),
    }));
    return [
      {
        tool,
        status: pickOptionalString(entry, "status"),
        restricted_parameters: restrictions,
        upgrade_url: pickOptionalString(entry, "upgrade_url"),
        full_version_url: pickOptionalString(entry, "full_version_url"),
        landing_page_url: pickOptionalString(entry, "landing_page_url"),
        landing_page_action: pickOptionalString(entry, "landing_page_action"),
      },
    ];
  });
}

/**
 * The pages a notion-create-pages answer names, in its order: a `pages`/`results` list of `{id, url, title}`
 * records, a single page record, or the page links in a prose answer, each id read off its link. An async task's
 * id travels beside them when the server deferred the work.
 */
export function parseNotionCreatedPages(value: unknown): { pages: NotionMcpCreatedPage[]; async_task_id?: string } {
  const record = optionalRecord(value);
  if (record?.object === "async_task") {
    return { pages: [], ...compactObject({ async_task_id: asyncTaskId(record) }) };
  }
  const listed = findList(value, "pages", "results", "created_pages").flatMap((item) => {
    const page = readCreatedPage(item);
    return page ? [page] : [];
  });
  const single = listed.length === 0 ? readCreatedPage(record) : undefined;
  const pages = listed.length > 0 ? listed : single ? [single] : linkedPages(optionalString(value) ?? textOf(record));
  return { pages, ...compactObject({ async_task_id: asyncTaskId(record) }) };
}

/** The page a notion-update-page answer names: its link, when the prose or the record carries one, and a deferred task's id. */
interface NotionMcpUpdatedPage {
  url?: string;
  async_task_id?: string;
  warnings?: Record<string, unknown>[];
}

export function parseNotionUpdatedPage(value: unknown): NotionMcpUpdatedPage {
  const record = optionalRecord(value);
  const url =
    (record && pickOptionalString(record, "url")) ?? linkedPages(optionalString(value) ?? textOf(record))[0]?.url;
  return compactObject({
    url,
    async_task_id: asyncTaskId(record),
    warnings: Array.isArray(record?.warnings)
      ? record.warnings.flatMap((value) => {
          const warning = optionalRecord(value);
          return warning ? [warning] : [];
        })
      : undefined,
  });
}

/** The comment a notion-create-comment answer names: the comment record itself, or the first of a listed shape. */
export function parseNotionCreatedComment(value: unknown): { id?: string; discussion_id?: string } | undefined {
  const record = optionalRecord(value);
  const comment = record && (optionalRecord(record.comment) ?? record);
  const typed: { id?: string; discussion_id?: string } = compactObject({
    id: comment && pickOptionalString(comment, "id", "comment_id"),
    discussion_id: comment && pickOptionalString(comment, "discussion_id"),
  });
  if (Object.keys(typed).length > 0) return typed;
  const listed = parseNotionComments(value)[0];
  if (!listed) return undefined;
  const fromList: { id?: string; discussion_id?: string } = compactObject({
    id: listed.id,
    discussion_id: listed.discussion_id,
  });
  return Object.keys(fromList).length > 0 ? fromList : undefined;
}

function readCreatedPage(value: unknown): NotionMcpCreatedPage | undefined {
  const record = optionalRecord(value);
  if (!record) return undefined;
  const url = pickOptionalString(record, "url");
  const page: NotionMcpCreatedPage = compactObject({
    id: pickOptionalString(record, "id", "page_id") ?? (url && pageIdOf(url)),
    url,
    title: readTitle(record),
  });
  return page.id !== undefined || page.url !== undefined ? page : undefined;
}

/** The page links a prose answer carries, each with the id its link ends in, in order and without repeats. */
function linkedPages(text: string | undefined): NotionMcpCreatedPage[] {
  if (!text) return [];
  const seen = new Set<string>();
  return [...text.matchAll(notionLink)].flatMap((match) => {
    // A link at the end of a sentence carries its punctuation into the match.
    const url = match[0].replace(/[.,;:!?]+$/, "");
    if (seen.has(url)) return [];
    seen.add(url);
    return [compactObject({ id: pageIdOf(url), url })];
  });
}

function pageIdOf(url: string): string | undefined {
  return notionPageId.exec(url)?.[1]?.toLowerCase();
}

/** The text a tool answered under any of its names, for an answer that was JSON with the prose inside it. */
function textOf(record: Record<string, unknown> | undefined): string | undefined {
  return record ? pickOptionalString(record, "text", "message", "result") : undefined;
}

function asyncTaskId(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined;
  if (record.object === "async_task") return pickOptionalString(record, "id");
  const task = optionalRecord(record.async_task) ?? optionalRecord(record.task);
  return pickOptionalString(record, "async_task_id", "task_id") ?? (task && pickOptionalString(task, "id", "task_id"));
}

/** The first present list among keys of a decoded object, or the value itself when it is a list. */
function findList(value: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  const record = optionalRecord(value);
  if (!record) return [];
  for (const key of keys) {
    if (Array.isArray(record[key])) return looseArray(record[key]);
  }
  return [];
}

function readUser(value: unknown): NotionMcpUser | undefined {
  const record = optionalRecord(value);
  if (!record) return undefined;
  const user: NotionMcpUser = compactObject({
    id: pickOptionalString(record, "id", "user_id"),
    name: pickOptionalString(record, "name"),
    email: pickOptionalString(record, "email"),
    type: pickOptionalString(record, "type"),
  });
  return Object.keys(user).length > 0 ? user : undefined;
}

/** A result title as the server spells it: a plain string, or the API's rich-text array under properties. */
function readTitle(record: Record<string, unknown>): string | undefined {
  const plain = pickOptionalString(record, "title", "name");
  if (plain) return plain;
  const properties = optionalRecord(record.properties);
  if (!properties) return undefined;
  for (const key of ["title", "Name", "name"]) {
    const property = optionalRecord(properties[key]);
    if (!property) continue;
    const text = looseArray(property.title)
      .map((part) => optionalRawString(optionalRecord(part)?.plain_text) ?? "")
      .join("");
    if (text.trim()) return text.trim();
  }
  return undefined;
}

/** A notice is a sentence or an object naming a parameter; either way its text is kept, never interpreted. */
function readNotices(value: unknown): string[] {
  const single = optionalString(value);
  if (single) return [single];
  return looseArray(value).flatMap((item) => {
    const text = optionalString(item);
    if (text) return [text];
    const record = optionalRecord(item);
    if (!record) return [];
    return [
      pickOptionalString(record, "message", "parameter", "field", "name", "detail", "text") ?? JSON.stringify(record),
    ];
  });
}

function readComment(value: unknown, discussionId: string | undefined): NotionMcpComment[] {
  const record = optionalRecord(value);
  if (!record) return [];
  const author = optionalRecord(record.created_by);
  const createdBy: NotionMcpUser = author
    ? (readUser(author) ?? {})
    : compactObject({
        id: pickOptionalString(record, "author_id", "user_id"),
        name: pickOptionalString(record, "author", "author_name"),
        email: pickOptionalString(record, "author_email"),
      });
  const comment: NotionMcpComment = compactObject({
    id: pickOptionalString(record, "id", "comment_id"),
    discussion_id: pickOptionalString(record, "discussion_id") ?? discussionId,
    plain_text: pickOptionalString(record, "plain_text", "text", "content", "body"),
    created_time: pickOptionalString(record, "created_time", "created_at", "timestamp"),
    created_by: Object.keys(createdBy).length > 0 ? createdBy : undefined,
  });
  return comment.id !== undefined || comment.plain_text !== undefined ? [comment] : [];
}

function readXmlComments(text: string): NotionMcpComment[] {
  const comments: NotionMcpComment[] = [];
  let remainder = "";
  let last = 0;
  for (const block of xmlBlocks(text, "discussion")) {
    remainder += text.slice(last, block.start);
    last = block.end;
    const attributes = readAttributes(block.attributes);
    comments.push(...readXmlCommentTags(block.body, optionalString(attributes.id ?? attributes.discussion_id)));
  }
  remainder += text.slice(last);
  comments.push(...readXmlCommentTags(remainder, undefined));
  return comments;
}

function readXmlCommentTags(text: string, discussionId: string | undefined): NotionMcpComment[] {
  return xmlBlocks(text, "comment").flatMap((block) => {
    const attributes = readAttributes(block.attributes);
    const createdBy: NotionMcpUser = compactObject({
      id: optionalString(attributes.author_id ?? attributes.user_id ?? attributes.created_by_id),
      name: optionalString(attributes.author ?? attributes.author_name ?? attributes.created_by ?? attributes.user),
      email: optionalString(attributes.author_email ?? attributes.email),
    });
    const comment: NotionMcpComment = compactObject({
      id: optionalString(attributes.id ?? attributes.comment_id),
      discussion_id: optionalString(attributes.discussion_id) ?? discussionId,
      plain_text: optionalString(unescapeEntities(block.body.replace(anyTag, " ")).replace(/[ \t]{2,}/g, " ")),
      created_time: optionalString(
        attributes.created_time ?? attributes.created_at ?? attributes.timestamp ?? attributes.time ?? attributes.date,
      ),
      created_by: Object.keys(createdBy).length > 0 ? createdBy : undefined,
    });
    return comment.plain_text !== undefined ? [comment] : [];
  });
}

/** Every `<tag ...>body</tag>` element in order, each scan resuming after the previous element. */
function xmlBlocks(text: string, tag: string): XmlBlock[] {
  const blocks: XmlBlock[] = [];
  for (let block = nextXmlBlock(text, tag, 0); block; block = nextXmlBlock(text, tag, block.end)) {
    blocks.push(block);
  }
  return blocks;
}

/**
 * The first `<tag ...>body</tag>` element at or after `from`, ending at the first closing tag after its opening.
 * When that opening has no closing tag after it, no later opening can have one either, so the scan stops instead of
 * retrying every opening the way a lazy `[\s\S]*?` pattern does.
 */
function nextXmlBlock(text: string, tag: string, from: number): XmlBlock | undefined {
  const opening = new RegExp(`<${tag}\\b([^<>]*)>`, "gi");
  opening.lastIndex = from;
  const open = opening.exec(text);
  if (!open) return undefined;
  const closing = new RegExp(`</${tag}>`, "gi");
  closing.lastIndex = opening.lastIndex;
  const close = closing.exec(text);
  if (!close) return undefined;
  return {
    attributes: open[1]!,
    body: text.slice(opening.lastIndex, close.index),
    start: open.index,
    end: closing.lastIndex,
  };
}

/** The attributes of one tag's attribute text, names lower-cased and values entity-decoded. */
function readAttributes(attributes: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of attributes.matchAll(tagAttribute)) {
    found[match[1]!.toLowerCase()] = unescapeEntities(match[2]!);
  }
  return found;
}

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/** The XML entities Notion escapes inside its envelopes; the Markdown itself is left alone. */
function unescapeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      // A number past U+10FFFF names no character, and String.fromCodePoint throws on it; keep the entity as text.
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return namedEntities[body.toLowerCase()] ?? entity;
  });
}
