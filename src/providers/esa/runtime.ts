import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { BearerProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, encodePathSegment, readBoundedResponseBytes } from "../../core/request.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerFetch,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const esaApiBaseUrl = "https://api.esa.io";

const docsTeamName = "docs";
const searchOptionsHelpPostNumber = 104;
const markdownSyntaxHelpPostNumber = 49;
const fullPostBodyLimit = 10_000;
const listPostBodyLimit = 500;
const commentBodyLimit = 300;
const maxAttachmentImageBytes = 30 * 1024 * 1024;
const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const signedAttachmentHosts = new Set(["files.esa.io", "dl.esa.io"]);
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

type EsaActionContext = BearerProviderContext;
type EsaJson = Record<string, unknown>;
type EsaActionHandler = ProviderRuntimeHandler<EsaActionContext>;
type BodyOptions = { truncateBody?: number; omitBody?: boolean };

interface EsaRequestInput {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

export const esaActionHandlers: ProviderActionHandlers<"esa", EsaActionHandler> = {
  get_teams: getTeams,
  get_team_stats: getTeamStats,
  get_team_tags: getTeamTags,
  get_team_members: getTeamMembers,
  get_post: getPost,
  search_posts: searchPosts,
  create_post: createPost,
  update_post: updatePost,
  append_post: appendPost,
  prepend_post: prependPost,
  get_comment: getComment,
  create_comment: createComment,
  update_comment: updateComment,
  delete_comment: deleteComment,
  get_post_backlinks: getPostBacklinks,
  get_post_comments: getPostComments,
  get_team_comments: getTeamComments,
  get_categories: getCategories,
  get_top_categories: getTopCategories,
  get_all_category_paths: getAllCategoryPaths,
  archive_post: archivePost,
  ship_post: shipPost,
  duplicate_post: duplicatePost,
  rollback_post_revision: rollbackPostRevision,
  get_search_options_help: getSearchOptionsHelp,
  get_markdown_syntax_help: getMarkdownSyntaxHelp,
  search_help: searchHelp,
  get_attachment: getAttachment,
  list_recent_posts: listRecentPosts,
  get_post_summary_prompt: getPostSummaryPrompt,
};

export async function requestEsaJson<T>(context: EsaActionContext, input: EsaRequestInput): Promise<T> {
  const url = new URL(`${esaApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: esaHeaders(context.accessToken, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `esa request failed: ${error.message}` : "esa request failed",
    );
  }

  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "esa returned an invalid JSON response",
    invalidJsonStatus: response.ok ? 502 : response.status,
    invalidJsonFallback: (text) => ({ message: text }),
  });
  if (!response.ok) {
    const data = optionalRecord(payload);
    const message = optionalString(data?.message) ?? `esa request failed with HTTP ${response.status}`;
    throw new ProviderRequestError(response.status, message);
  }

  return payload as T;
}

function esaHeaders(accessToken: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
    "user-agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function getTeams(input: Record<string, unknown>, context: EsaActionContext) {
  const data = await requestEsaJson<EsaJson>(context, {
    path: "/v1/teams",
    query: { ...paginationQuery(input), role: readOptionalString(input, "role") },
  });
  const teams = records(data.teams, "esa teams").map((team) =>
    compactObject({
      url: optionalString(team.url),
      name: optionalString(team.name),
      description: optionalRawString(team.description),
    }),
  );
  return { ...data, teams };
}

async function getTeamStats(input: Record<string, unknown>, context: EsaActionContext) {
  return requestEsaJson<EsaJson>(context, {
    path: teamPath(readTeamName(input), "/stats"),
  });
}

async function getTeamTags(input: Record<string, unknown>, context: EsaActionContext) {
  return requestEsaJson<EsaJson>(context, {
    path: teamPath(readTeamName(input), "/tags"),
    query: paginationQuery(input),
  });
}

async function getTeamMembers(input: Record<string, unknown>, context: EsaActionContext) {
  return requestEsaJson<EsaJson>(context, {
    path: teamPath(readTeamName(input), "/members"),
    query: {
      ...paginationQuery(input),
      sort: readOptionalString(input, "sort"),
      order: readOptionalString(input, "order"),
    },
  });
}

async function getPost(input: Record<string, unknown>, context: EsaActionContext) {
  const raw = await getRawPost(context, readTeamName(input), readPositiveInteger(input, "postNumber"));
  return transformPost(raw, {
    truncateBody: readOptionalBoolean(input, "truncate") === false ? undefined : fullPostBodyLimit,
  });
}

async function searchPosts(input: Record<string, unknown>, context: EsaActionContext) {
  return searchPostsInTeam(context, readTeamName(input), {
    query: readRequiredRawString(input, "query"),
    sort: readOptionalString(input, "sort"),
    order: readOptionalString(input, "order"),
    ...paginationQuery(input),
  });
}

async function createPost(input: Record<string, unknown>, context: EsaActionContext) {
  return createPostInTeam(context, readTeamName(input), {
    name: readRequiredString(input, "name"),
    bodyMd: readOptionalRawString(input, "bodyMd"),
    tags: readOptionalStringArray(input, "tags"),
    category: readOptionalString(input, "category"),
    wip: readOptionalBoolean(input, "wip") ?? true,
    message: readOptionalRawString(input, "message"),
  });
}

async function updatePost(input: Record<string, unknown>, context: EsaActionContext) {
  return updatePostInTeam(context, readTeamName(input), readPositiveInteger(input, "postNumber"), {
    name: readOptionalRawString(input, "name"),
    bodyMd: readOptionalRawString(input, "bodyMd"),
    tags: readOptionalStringArray(input, "tags"),
    category: readOptionalRawString(input, "category"),
    wip: readOptionalBoolean(input, "wip"),
    message: readOptionalRawString(input, "message"),
    originalRevision: readOriginalRevision(input),
  });
}

async function appendPost(input: Record<string, unknown>, context: EsaActionContext) {
  return insertPostContent(context, input, "append");
}

async function prependPost(input: Record<string, unknown>, context: EsaActionContext) {
  return insertPostContent(context, input, "prepend");
}

async function getComment(input: Record<string, unknown>, context: EsaActionContext) {
  const data = await requestEsaJson<EsaJson>(context, {
    path: teamPath(readTeamName(input), `/comments/${readPositiveInteger(input, "commentId")}`),
    query: { include: readOptionalString(input, "include") },
  });
  return transformComment(data, { truncateBody: fullPostBodyLimit });
}

async function createComment(input: Record<string, unknown>, context: EsaActionContext) {
  const teamName = readTeamName(input);
  const post = readPositiveInteger(input, "postNumber");
  const data = await requestEsaJson<EsaJson>(context, {
    path: teamPath(teamName, `/posts/${post}/comments`),
    method: "POST",
    body: {
      comment: compactObject({
        body_md: readRequiredRawString(input, "bodyMd"),
        user: readOptionalString(input, "user"),
      }),
    },
  });
  return transformComment(data, { omitBody: true });
}

async function updateComment(input: Record<string, unknown>, context: EsaActionContext) {
  const data = await requestEsaJson<EsaJson>(context, {
    path: teamPath(readTeamName(input), `/comments/${readPositiveInteger(input, "commentId")}`),
    method: "PATCH",
    body: {
      comment: compactObject({
        body_md: readRequiredRawString(input, "bodyMd"),
        user: readOptionalString(input, "user"),
      }),
    },
  });
  return transformComment(data, { omitBody: true });
}

async function deleteComment(input: Record<string, unknown>, context: EsaActionContext) {
  await requestEsaJson<null>(context, {
    path: teamPath(readTeamName(input), `/comments/${readPositiveInteger(input, "commentId")}`),
    method: "DELETE",
  });
  return { success: true, message: "Comment deleted successfully" };
}

async function getPostBacklinks(input: Record<string, unknown>, context: EsaActionContext) {
  const data = await requestEsaJson<EsaJson>(context, {
    path: teamPath(readTeamName(input), `/posts/${readPositiveInteger(input, "postNumber")}/backlinks`),
    query: paginationQuery(input),
  });
  return { ...data, posts: records(data.posts, "esa post backlinks").map(transformPostSummary) };
}

async function getPostComments(input: Record<string, unknown>, context: EsaActionContext) {
  const data = await requestEsaJson<EsaJson>(context, {
    path: teamPath(readTeamName(input), `/posts/${readPositiveInteger(input, "postNumber")}/comments`),
    query: paginationQuery(input),
  });
  return {
    ...data,
    comments: records(data.comments, "esa post comments").map((comment) =>
      transformComment(comment, { truncateBody: commentBodyLimit }),
    ),
  };
}

async function getTeamComments(input: Record<string, unknown>, context: EsaActionContext) {
  const data = await requestEsaJson<EsaJson>(context, {
    path: teamPath(readTeamName(input), "/comments"),
    query: paginationQuery(input),
  });
  return {
    ...data,
    comments: records(data.comments, "esa team comments").map((comment) =>
      transformComment(comment, { truncateBody: commentBodyLimit }),
    ),
  };
}

async function getCategories(input: Record<string, unknown>, context: EsaActionContext) {
  const data = await requestEsaJson<EsaJson>(context, {
    path: teamPath(readTeamName(input), "/categories"),
    query: {
      select: readRequiredRawString(input, "select"),
      include: readOptionalString(input, "include"),
      descendant_posts: readOptionalBoolean(input, "descendantPosts"),
      ...paginationQuery(input),
    },
  });
  return transformCategoryList(data);
}

async function getTopCategories(input: Record<string, unknown>, context: EsaActionContext) {
  const data = await requestEsaJson<EsaJson>(context, {
    path: teamPath(readTeamName(input), "/categories/top"),
  });
  return transformCategoryList(data);
}

async function getAllCategoryPaths(input: Record<string, unknown>, context: EsaActionContext) {
  return requestEsaJson<EsaJson>(context, {
    path: teamPath(readTeamName(input), "/categories/paths"),
    query: {
      v: 2,
      ...paginationQuery(input),
      prefix: readOptionalRawString(input, "prefix"),
      suffix: readOptionalRawString(input, "suffix"),
      match: readOptionalRawString(input, "match"),
      exact_match: readOptionalRawString(input, "exactMatch"),
    },
  });
}

async function archivePost(input: Record<string, unknown>, context: EsaActionContext) {
  const teamName = readTeamName(input);
  const postNumber = readPositiveInteger(input, "postNumber");
  const post = await getRawPost(context, teamName, postNumber);
  const category = optionalRawString(post.category) ?? "";
  if (category === "Archived" || category.startsWith("Archived/")) {
    return { message: "Post is already archived", category };
  }

  return updatePostInTeam(context, teamName, postNumber, {
    category: category ? `Archived/${category}` : "Archived",
    message: readOptionalRawString(input, "message") ?? "Archive post",
  });
}

async function shipPost(input: Record<string, unknown>, context: EsaActionContext) {
  return updatePostInTeam(context, readTeamName(input), readPositiveInteger(input, "postNumber"), {
    wip: false,
    message: "Ship It!",
  });
}

async function duplicatePost(input: Record<string, unknown>, context: EsaActionContext) {
  const sourceTeamName = readTeamName(input);
  const postNumber = readPositiveInteger(input, "postNumber");
  const draft = await requestEsaJson<EsaJson>(context, {
    path: teamPath(sourceTeamName, "/posts/new"),
    query: { parent_post_id: postNumber },
  });
  const post = requireResponseRecord(draft.post, "esa duplicate source post");
  return createPostInTeam(context, normalizeTeamName(readOptionalString(input, "targetTeamName") ?? sourceTeamName), {
    name: readResponseString(post.name, "esa duplicate source post name"),
    bodyMd: optionalRawString(post.body_md),
    wip: true,
  });
}

async function rollbackPostRevision(input: Record<string, unknown>, context: EsaActionContext) {
  const teamName = readTeamName(input);
  const postNumber = readPositiveInteger(input, "postNumber");
  const revisionNumber = readPositiveInteger(input, "revisionNumber");
  const data = await requestEsaJson<EsaJson>(context, {
    path: teamPath(teamName, `/posts/${postNumber}/revisions/${revisionNumber}/rollback`),
    method: "POST",
    body: {
      post: compactObject({
        wip: readOptionalBoolean(input, "wip"),
        message: readOptionalRawString(input, "message"),
      }),
    },
  });
  return transformPost(data, { omitBody: true });
}

async function getSearchOptionsHelp(_input: Record<string, unknown>, context: EsaActionContext) {
  const post = await getRawPost(context, docsTeamName, searchOptionsHelpPostNumber);
  return transformPost(post, { truncateBody: fullPostBodyLimit });
}

async function getMarkdownSyntaxHelp(_input: Record<string, unknown>, context: EsaActionContext) {
  const post = await getRawPost(context, docsTeamName, markdownSyntaxHelpPostNumber);
  return transformPost(post, { truncateBody: fullPostBodyLimit });
}

async function searchHelp(input: Record<string, unknown>, context: EsaActionContext) {
  return searchPostsInTeam(context, docsTeamName, {
    query: readRequiredRawString(input, "query"),
    sort: "best_match",
    ...paginationQuery(input),
  });
}

async function getAttachment(input: Record<string, unknown>, context: EsaActionContext) {
  const attachment = readAttachmentInput(readRequiredRawString(input, "url"));
  const url = attachment.needsSigning
    ? await getSignedAttachmentUrl(context, readTeamName(input), attachment.path)
    : attachment.url;
  if (readOptionalBoolean(input, "forceSignedUrl") === true || !context.transitFiles) {
    return { url };
  }
  return downloadAttachmentImage(context, url);
}

async function listRecentPosts(input: Record<string, unknown>, context: EsaActionContext) {
  return searchPostsInTeam(context, readTeamName(input), {
    sort: "updated",
    order: "desc",
    ...paginationQuery(input),
  });
}

async function getPostSummaryPrompt(input: Record<string, unknown>, context: EsaActionContext) {
  const post = await getRawPost(context, readTeamName(input), readPositiveInteger(input, "postNumber"));
  return { prompt: createPostSummaryPrompt(post) };
}

async function getRawPost(context: EsaActionContext, teamName: string, postNumber: number): Promise<EsaJson> {
  return requestEsaJson<EsaJson>(context, {
    path: teamPath(teamName, `/posts/${postNumber}`),
  });
}

async function searchPostsInTeam(
  context: EsaActionContext,
  teamName: string,
  query: Record<string, string | number | boolean | undefined>,
) {
  const data = await requestEsaJson<EsaJson>(context, {
    path: teamPath(teamName, "/posts"),
    query: compactObject({
      q: query.query,
      sort: query.sort,
      order: query.order,
      page: query.page,
      per_page: query.per_page,
    }),
  });
  return {
    ...data,
    posts: records(data.posts, "esa posts").map((post) => transformPost(post, { truncateBody: listPostBodyLimit })),
  };
}

async function createPostInTeam(
  context: EsaActionContext,
  teamName: string,
  input: {
    name: string;
    bodyMd?: string;
    tags?: string[];
    category?: string;
    wip: boolean;
    message?: string;
  },
) {
  const nameAndCategory = normalizePostName(input.name, input.category);
  const data = await requestEsaJson<EsaJson>(context, {
    path: teamPath(teamName, "/posts"),
    method: "POST",
    body: {
      post: compactObject({
        name: nameAndCategory.name,
        body_md: input.bodyMd,
        tags: input.tags,
        category: nameAndCategory.category,
        wip: input.wip,
        message: input.message,
      }),
    },
  });
  return transformPost(data, { omitBody: true });
}

async function updatePostInTeam(
  context: EsaActionContext,
  teamName: string,
  postNumber: number,
  input: {
    name?: string;
    bodyMd?: string;
    tags?: string[];
    category?: string;
    wip?: boolean;
    message?: string;
    originalRevision?: Record<string, unknown>;
  },
) {
  const nameAndCategory = normalizePostName(input.name, input.category);
  const data = await requestEsaJson<EsaJson>(context, {
    path: teamPath(teamName, `/posts/${postNumber}`),
    method: "PATCH",
    body: {
      post: compactObject({
        name: nameAndCategory.name,
        body_md: input.bodyMd,
        tags: input.tags,
        category: nameAndCategory.category,
        wip: input.wip,
        message: input.message,
        original_revision: input.originalRevision,
      }),
    },
  });
  return transformPost(data, { omitBody: true });
}

async function insertPostContent(
  context: EsaActionContext,
  input: Record<string, unknown>,
  position: "append" | "prepend",
) {
  const teamName = readTeamName(input);
  const postNumber = readPositiveInteger(input, "postNumber");
  const data = await requestEsaJson<EsaJson>(context, {
    path: teamPath(teamName, `/posts/${postNumber}/${position}`),
    method: "POST",
    body: {
      post: compactObject({
        content: readRequiredRawString(input, "content"),
        wip: readOptionalBoolean(input, "wip"),
        message: readOptionalRawString(input, "message"),
      }),
    },
  });
  return transformPost(data, { omitBody: true });
}

function transformPost(post: EsaJson, options: BodyOptions = {}): EsaJson {
  const sourceBody = optionalRawString(post.body_md);
  const bodyMd = transformBody(sourceBody, options);
  const bodyMdStats = options.omitBody ? undefined : measureBody(sourceBody);
  const wip = optionalBoolean(post.wip);
  return compactObject({
    url: optionalString(post.url),
    revision_number: optionalInteger(post.revision_number),
    wip: wip === undefined ? undefined : wip ? "WIP" : "Shipped",
    kind: optionalString(post.kind),
    category_and_title_and_tags: optionalRawString(post.full_name),
    body_md: bodyMd,
    body_md_stats: bodyMdStats,
    created_at: optionalString(post.created_at),
    updated_at: optionalString(post.updated_at),
    created_by: post.created_by,
    updated_by: post.updated_by,
    stats: compactObject({
      tasks_count: optionalInteger(post.tasks_count),
      done_tasks_count: optionalInteger(post.done_tasks_count),
      comments_count: optionalInteger(post.comments_count),
      stargazers_count: optionalInteger(post.stargazers_count),
      watchers_count: optionalInteger(post.watchers_count),
    }),
    backlinks_count: optionalInteger(post.backlinks_count),
  });
}

function transformPostSummary(post: EsaJson): EsaJson {
  const wip = optionalBoolean(post.wip);
  return compactObject({
    number: optionalInteger(post.number),
    url: optionalString(post.url),
    category_and_title_and_tags: optionalRawString(post.full_name),
    wip: wip === undefined ? undefined : wip ? "WIP" : "Shipped",
    created_at: optionalString(post.created_at),
    updated_at: optionalString(post.updated_at),
  });
}

function transformComment(comment: EsaJson, options: BodyOptions = {}): EsaJson {
  return compactObject({
    id: optionalInteger(comment.id),
    post_number: optionalInteger(comment.post_number),
    url: optionalString(comment.url),
    body_md: transformBody(optionalRawString(comment.body_md), options),
    created_at: optionalString(comment.created_at),
    updated_at: optionalString(comment.updated_at),
    created_by: comment.created_by,
    stats: compactObject({
      stargazers_count: optionalInteger(comment.stargazers_count),
      star: optionalBoolean(comment.star),
    }),
    stargazers: comment.stargazers,
  });
}

function transformCategoryList(data: EsaJson): EsaJson {
  return compactObject({
    current_category: optionalRawString(data.current_category),
    categories: records(data.categories, "esa categories").map(transformCategory),
    parent_categories: records(data.parent_categories, "esa parent categories").map((parent) =>
      compactObject({
        current_category: optionalRawString(parent.current_category),
        categories: records(parent.categories, "esa parent categories").map(transformCategory),
      }),
    ),
    readme: optionalRecord(data.readme)
      ? transformPost(data.readme as EsaJson, { truncateBody: listPostBodyLimit })
      : undefined,
    no_category: optionalRecord(data.no_category) ? transformCategory(data.no_category as EsaJson) : undefined,
    descendant_posts: data.descendant_posts,
    posts: data.posts
      ? records(data.posts, "esa category posts").map((post) =>
          transformPost(post, { truncateBody: listPostBodyLimit }),
        )
      : undefined,
    total_count: optionalInteger(data.total_count),
    per_page: optionalInteger(data.per_page),
    page: optionalInteger(data.page),
    prev_page: data.prev_page,
    next_page: data.next_page,
    max_per_page: optionalInteger(data.max_per_page),
  });
}

function transformCategory(category: EsaJson): EsaJson {
  return compactObject({
    full_name: optionalRawString(category.full_name),
    count: optionalInteger(category.count),
    has_child: optionalBoolean(category.has_child) ?? false,
  });
}

function transformBody(bodyMd: string | undefined, options: BodyOptions): string | undefined {
  if (options.omitBody || bodyMd === undefined) {
    return undefined;
  }
  if (options.truncateBody !== undefined && bodyMd.length > options.truncateBody) {
    let truncateAt = 0;
    for (const segment of graphemeSegmenter.segment(bodyMd)) {
      const segmentEnd = segment.index + segment.segment.length;
      if (segmentEnd > options.truncateBody) {
        break;
      }
      truncateAt = segmentEnd;
    }
    return `${bodyMd.slice(0, truncateAt)}\n\n... (truncated)`;
  }
  return bodyMd;
}

function measureBody(bodyMd: string | undefined): EsaJson | undefined {
  if (bodyMd === undefined) {
    return undefined;
  }
  let characters = 0;
  for (const _segment of graphemeSegmenter.segment(bodyMd)) {
    characters++;
  }
  let lines = bodyMd === "" ? 0 : 1;
  for (let index = 0; index < bodyMd.length; index++) {
    if (bodyMd.charCodeAt(index) === 10) {
      lines++;
    }
  }
  return { characters, lines };
}

function normalizePostName(
  name: string | undefined,
  category: string | undefined,
): { name?: string; category?: string } {
  if (name === undefined || category !== undefined || !name.includes("/")) {
    return { name, category };
  }
  const parts = name.split("/");
  const postName = parts.pop();
  return { name: postName || undefined, category: parts.join("/") };
}

function normalizeTeamName(value: string): string {
  const dotIndex = value.indexOf(".");
  return dotIndex === -1 ? value : value.slice(0, dotIndex);
}

function teamPath(teamName: string, suffix: string): string {
  return `/v1/teams/${encodePathSegment(teamName)}${suffix}`;
}

function paginationQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  return {
    page: readOptionalPositiveInteger(input, "page"),
    per_page: readOptionalPageSize(input, "perPage"),
  };
}

function readTeamName(input: Record<string, unknown>): string {
  return normalizeTeamName(readRequiredString(input, "teamName"));
}

function readRequiredString(input: Record<string, unknown>, fieldName: string): string {
  const value = optionalString(input[fieldName]);
  if (!value) {
    throw providerInputError(`${fieldName} must be a non-empty string`);
  }
  return value;
}

function readRequiredRawString(input: Record<string, unknown>, fieldName: string): string {
  const value = optionalRawString(input[fieldName]);
  if (value === undefined) {
    throw providerInputError(`${fieldName} must be a string`);
  }
  return value;
}

function readOptionalString(input: Record<string, unknown>, fieldName: string): string | undefined {
  const value = input[fieldName];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw providerInputError(`${fieldName} must be a string`);
  }
  return value.trim() || undefined;
}

function readOptionalRawString(input: Record<string, unknown>, fieldName: string): string | undefined {
  const value = input[fieldName];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw providerInputError(`${fieldName} must be a string`);
  }
  return value;
}

function readPositiveInteger(input: Record<string, unknown>, fieldName: string): number {
  const value = input[fieldName];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw providerInputError(`${fieldName} must be a positive integer`);
  }
  return value;
}

function readOptionalPositiveInteger(input: Record<string, unknown>, fieldName: string): number | undefined {
  if (input[fieldName] === undefined) {
    return undefined;
  }
  return readPositiveInteger(input, fieldName);
}

function readOptionalPageSize(input: Record<string, unknown>, fieldName: string): number | undefined {
  const value = readOptionalPositiveInteger(input, fieldName);
  if (value !== undefined && value > 100) {
    throw providerInputError(`${fieldName} must not exceed 100`);
  }
  return value;
}

function readOptionalBoolean(input: Record<string, unknown>, fieldName: string): boolean | undefined {
  const value = input[fieldName];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw providerInputError(`${fieldName} must be a boolean`);
  }
  return value;
}

function readOptionalStringArray(input: Record<string, unknown>, fieldName: string): string[] | undefined {
  const value = input[fieldName];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw providerInputError(`${fieldName} must be an array of non-empty strings`);
  }
  return value;
}

function readOriginalRevision(input: Record<string, unknown>): EsaJson | undefined {
  const value = input.originalRevision;
  if (value === undefined) {
    return undefined;
  }
  const revision = optionalRecord(value);
  if (!revision) {
    throw providerInputError("originalRevision must be an object");
  }
  return {
    body_md: readRequiredRawString(revision, "bodyMd"),
    number: readPositiveInteger(revision, "number"),
    user: readRequiredString(revision, "user"),
  };
}

function records(value: unknown, fieldName: string): EsaJson[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} response field must be an array`);
  }
  return value.map((item) => requireResponseRecord(item, fieldName));
}

function requireResponseRecord(value: unknown, fieldName: string): EsaJson {
  const result = optionalRecord(value);
  if (!result) {
    throw new ProviderRequestError(502, `${fieldName} response must be an object`);
  }
  return result;
}

function readResponseString(value: unknown, fieldName: string): string {
  const result = optionalRawString(value);
  if (result === undefined) {
    throw new ProviderRequestError(502, `${fieldName} response field must be a string`);
  }
  return result;
}

function createPostSummaryPrompt(post: EsaJson): string {
  const author = optionalRecord(post.created_by);
  const lines = [
    "Please summarize the following post:",
    "",
    `Title: ${optionalRawString(post.name) ?? ""}`,
    `URL: ${optionalRawString(post.url) ?? ""}`,
    `Author: ${optionalRawString(author?.name) ?? ""}`,
    `Created: ${optionalRawString(post.created_at) ?? ""}`,
    `Updated: ${optionalRawString(post.updated_at) ?? ""}`,
  ];
  const category = optionalRawString(post.category);
  if (category) {
    lines.push(`Category: ${category}`);
  }
  const tags = post.tags;
  if (Array.isArray(tags) && tags.length > 0 && tags.every((tag) => typeof tag === "string")) {
    lines.push(`Tags: ${tags.join(", ")}`);
  }
  lines.push("", "---", "");
  const bodyMd = optionalRawString(post.body_md);
  if (bodyMd !== undefined) {
    lines.push(`Content:\n${bodyMd}`);
  }
  return lines.join("\n");
}

function readAttachmentInput(
  value: string,
): { needsSigning: true; path: string } | { needsSigning: false; url: string } {
  if (value.startsWith("/")) {
    if (!value.startsWith("/uploads/")) {
      throw providerInputError("url path must start with /uploads/");
    }
    return { needsSigning: true, path: value };
  }

  const url = assertPublicHttpUrl(value, { fieldName: "url", createError: providerInputError });
  if (url.protocol !== "https:") {
    throw providerInputError("url must use HTTPS");
  }
  if (signedAttachmentHosts.has(url.hostname)) {
    return { needsSigning: true, path: url.pathname };
  }
  return { needsSigning: false, url: url.toString() };
}

async function getSignedAttachmentUrl(context: EsaActionContext, teamName: string, path: string): Promise<string> {
  const response = await requestEsaJson<EsaJson>(context, {
    path: teamPath(teamName, "/signed_urls"),
    query: { urls: path, v: 2, expires_in: 300 },
  });
  const signedUrls = response.signed_urls;
  if (!Array.isArray(signedUrls) || signedUrls.length === 0 || !Array.isArray(signedUrls[0])) {
    throw new ProviderRequestError(502, "esa did not return a signed attachment URL");
  }
  const [originalUrl, signedUrl] = signedUrls[0] as unknown[];
  if (signedUrl === null) {
    throw new ProviderRequestError(404, `esa attachment not found: ${String(originalUrl)}`);
  }
  if (typeof signedUrl !== "string") {
    throw new ProviderRequestError(502, "esa returned an invalid signed attachment URL");
  }
  return signedUrl;
}

async function downloadAttachmentImage(context: EsaActionContext, url: string) {
  const transitFiles = context.transitFiles;
  if (!transitFiles) {
    return { url };
  }

  let response: Response;
  try {
    response = await providerFetch(url, {
      headers: { accept: "image/*", "user-agent": providerUserAgent },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `esa attachment download failed: ${error.message}` : "esa attachment download failed",
    );
  }
  if (!response.ok) {
    throw new ProviderRequestError(response.status, `esa attachment download failed with HTTP ${response.status}`);
  }

  const mimeType = (response.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
  const contentLength = Number(response.headers.get("content-length"));
  const maxBytes = Math.min(maxAttachmentImageBytes, transitFiles.maxBytes);
  if (!imageMimeTypes.has(mimeType) || (Number.isFinite(contentLength) && contentLength > maxBytes)) {
    return { url };
  }

  const bytes = await readBoundedResponseBytes(response, {
    maxBytes,
    fieldName: "esa attachment image",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const name = attachmentFileName(url);
  const upload = await transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: mimeType }));
  return {
    url,
    file: {
      fileId: upload.fileId,
      downloadUrl: upload.downloadUrl,
      sizeBytes: upload.sizeBytes,
      name,
      mimeType,
    },
  };
}

function attachmentFileName(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.slice(pathname.lastIndexOf("/") + 1);
    return decodeURIComponent(name) || "esa-attachment";
  } catch {
    return "esa-attachment";
  }
}
