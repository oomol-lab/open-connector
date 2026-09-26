import {
  compactObject,
  looseArray,
  optionalRawString,
  optionalRecord,
  optionalString,
  pickOptionalString,
} from "../../core/cast.ts";

/**
 * Readers for the text envelopes Notion's beta MCP tools answer in, as they were recorded live. Every reader is
 * defensive: a field the server omits is absent from the typed result, an unrecognized shape yields an empty
 * result, and nothing here throws, because the caller keeps the raw text beside the typed fields.
 */

export interface NotionMcpUser {
  id?: string;
  name?: string;
  email?: string;
  type?: string;
}

export interface NotionMcpSearchResult {
  id?: string;
  title?: string;
  url?: string;
  type?: string;
  timestamp?: string;
  path?: string;
}

export interface NotionMcpSearch {
  results: NotionMcpSearchResult[];
  notices: string[];
}

export interface NotionMcpPage {
  title?: string;
  url?: string;
  page_last_edited_at?: string;
  properties?: string;
  content?: string;
  truncated: boolean;
}

export interface NotionMcpComment {
  id?: string;
  discussion_id?: string;
  plain_text?: string;
  created_time?: string;
  created_by?: NotionMcpUser;
}

export interface NotionMcpToolAccess {
  tool: string;
  status?: string;
  restricted_parameters: string[];
}

const pageTag = /<page\b([^>]*)>/i;
const propertiesBlock = /<properties\b[^>]*>([\s\S]*?)<\/properties>/i;
const contentBlock = /<content\b([^>]*)>([\s\S]*?)<\/content>/i;
const contentOpening = /<content\b[^>]*>/i;
const discussionBlock = /<discussion\b([^>]*)>([\s\S]*?)<\/discussion>/gi;
const commentTag = /<comment\b([^>]*)>([\s\S]*?)<\/comment>/gi;
const tagAttribute = /([\w:-]+)\s*=\s*"([^"]*)"/g;
const anyTag = /<[^>]+>/g;
const namedEntities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

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

/** Users as notion-get-users lists them: `{results: [{type, id, name, email}], has_more}`. */
export function parseNotionUsers(value: unknown): NotionMcpUser[] {
  return findList(value, "results", "users").flatMap((item) => {
    const user = readUser(item);
    return user ? [user] : [];
  });
}

/** The connected user: the first listed user that carries an ID or an email. */
export function parseNotionSelf(value: unknown): NotionMcpUser | undefined {
  return parseNotionUsers(value).find((user) => user.id !== undefined || user.email !== undefined);
}

/** Search results plus the server's notices, such as a filter dropped on the connected plan. */
export function parseNotionSearch(value: unknown): NotionMcpSearch {
  const results = findList(value, "results", "pages", "items").flatMap((item) => {
    const record = optionalRecord(item);
    if (!record) return [];
    const result: NotionMcpSearchResult = compactObject({
      id: pickOptionalString(record, "id"),
      title: readTitle(record),
      url: pickOptionalString(record, "url"),
      type: pickOptionalString(record, "type"),
      timestamp: pickOptionalString(record, "timestamp", "last_edited_time"),
      path: pickOptionalString(record, "path"),
    });
    return [result];
  });
  return { results, notices: readNotices(optionalRecord(value)?.notices) };
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
  const properties = text === undefined ? null : propertiesBlock.exec(text);
  const content = text === undefined ? null : contentBlock.exec(text);
  let body: string | undefined;
  if (content) {
    body = content[2]!;
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
      properties: properties ? unescapeEntities(properties[1]!).trim() : undefined,
      content: body === undefined ? undefined : unescapeEntities(body).trim(),
    }),
    truncated:
      record?.truncated === true ||
      isTrue(attributes.truncated) ||
      (content !== null && isTrue(readAttributes(content[1]!).truncated)),
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
 * The plan report notion-get-tool-access answers: `{current_tool_access: [{tool, status, restricted_parameters}]}`,
 * or the same entries keyed by tool name.
 */
export function parseNotionToolAccess(value: unknown): NotionMcpToolAccess[] {
  const record = optionalRecord(value);
  const access = record?.current_tool_access ?? record?.tools ?? value;
  const listed = looseArray(access).flatMap((item) => {
    const entry = optionalRecord(item);
    const tool = entry ? pickOptionalString(entry, "tool", "name", "tool_name") : undefined;
    return entry && tool ? [readToolAccess(tool, entry)] : [];
  });
  if (listed.length > 0 || Array.isArray(access)) return listed;
  return Object.entries(optionalRecord(access) ?? {}).flatMap(([tool, item]) => {
    const entry = optionalRecord(item);
    return entry && "restricted_parameters" in entry ? [readToolAccess(tool, entry)] : [];
  });
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
  for (const block of text.matchAll(discussionBlock)) {
    remainder += text.slice(last, block.index);
    last = block.index + block[0].length;
    const discussionId = optionalString(readAttributes(block[1]!).id ?? readAttributes(block[1]!).discussion_id);
    comments.push(...readXmlCommentTags(block[2]!, discussionId));
  }
  remainder += text.slice(last);
  comments.push(...readXmlCommentTags(remainder, undefined));
  return comments;
}

function readXmlCommentTags(text: string, discussionId: string | undefined): NotionMcpComment[] {
  return [...text.matchAll(commentTag)].flatMap((match) => {
    const attributes = readAttributes(match[1]!);
    const createdBy: NotionMcpUser = compactObject({
      id: optionalString(attributes.author_id ?? attributes.user_id ?? attributes.created_by_id),
      name: optionalString(attributes.author ?? attributes.author_name ?? attributes.created_by ?? attributes.user),
      email: optionalString(attributes.author_email ?? attributes.email),
    });
    const comment: NotionMcpComment = compactObject({
      id: optionalString(attributes.id ?? attributes.comment_id),
      discussion_id: optionalString(attributes.discussion_id) ?? discussionId,
      plain_text: optionalString(unescapeEntities(match[2]!.replace(anyTag, " ")).replace(/[ \t]{2,}/g, " ")),
      created_time: optionalString(
        attributes.created_time ?? attributes.created_at ?? attributes.timestamp ?? attributes.time ?? attributes.date,
      ),
      created_by: Object.keys(createdBy).length > 0 ? createdBy : undefined,
    });
    return comment.plain_text !== undefined ? [comment] : [];
  });
}

function readToolAccess(tool: string, entry: Record<string, unknown>): NotionMcpToolAccess {
  const restricted = looseArray(entry.restricted_parameters).flatMap((item) => {
    const name = optionalString(item) ?? pickOptionalString(optionalRecord(item) ?? {}, "name", "parameter", "field");
    return name ? [name] : [];
  });
  return compactObject({
    tool,
    status: pickOptionalString(entry, "status"),
    restricted_parameters: restricted,
  }) as NotionMcpToolAccess;
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
    if (body.startsWith("#x") || body.startsWith("#X")) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return namedEntities[body.toLowerCase()] ?? entity;
  });
}
