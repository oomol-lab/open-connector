import type { OomolRagContext } from "./request.ts";

import {
  optionalNumber,
  optionalRawString,
  requiredRawString,
  requiredNumber,
  objectArray,
  requiredStringArray,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { requiredInputString, requiredResponseRecord, providerResponseError } from "../provider-runtime.ts";
import { requestOomolRag } from "./request.ts";

export async function executeOomolRagAction(
  name: string,
  input: Record<string, unknown>,
  context: OomolRagContext,
): Promise<unknown> {
  if (name === "retrieve") {
    const payload = requiredResponseRecord(
      await requestOomolRag(context, {
        path: "/v1/retrieve",
        method: "POST",
        body: { query: input.query, top_k: input.topK, enable_reranking: input.enableReranking },
      }),
      "retrieval response",
    );
    return {
      requestId: requiredRawString(payload.request_id, "request_id", providerResponseError),
      items: objectArray(payload.items, "retrieval items", providerResponseError).map((hit) => ({
        articleId: optionalRawString(hit.article_id),
        fileId: requiredRawString(hit.file_id, "file_id", providerResponseError),
        filename: requiredRawString(hit.filename, "filename", providerResponseError),
        text: requiredRawString(hit.text, "text", providerResponseError),
        score: requiredNumber(hit.score, "score", providerResponseError),
      })),
    };
  }
  if (name === "create_article") {
    return {
      article: parseArticle(
        await requestOomolRag(context, {
          path: "/v1/articles",
          method: "POST",
          body: { id: input.articleId, title: input.title },
        }),
      ),
    };
  }
  if (name === "list_articles") {
    const page = requiredResponseRecord(
      await requestOomolRag(context, {
        path: "/v1/articles",
        query: { after: optionalRawString(input.cursor), limit: optionalNumber(input.limit) },
      }),
      "article page",
    );
    return {
      articles: objectArray(page.items, "article items", providerResponseError).map((item) => parseArticle(item)),
      nextCursor: optionalRawString(page.next_cursor) ?? "",
    };
  }
  const articleId = requiredInputString(input.articleId, "articleId");
  const path = `/v1/articles/${encodePathSegment(articleId)}`;
  if (name === "delete_article") {
    await requestOomolRag(context, { path, method: "DELETE" });
    return { articleId, deleted: true };
  }
  if (name === "save_article_draft") {
    return {
      article: parseArticle(
        await requestOomolRag(context, {
          path: `${path}/draft`,
          method: "POST",
          body: {
            revision: input.revision,
            save_id: input.saveId,
            format_version: 3,
            title: input.title,
            content: input.content,
          },
        }),
      ),
    };
  }
  if (name === "publish_article") {
    return {
      article: parseArticle(
        await requestOomolRag(context, {
          path: `${path}/publish`,
          method: "POST",
          body: { revision: input.revision, publish_id: input.publishId },
        }),
      ),
    };
  }
  return { article: parseArticle(await requestOomolRag(context, { path }), name !== "wait_for_article_ready") };
}

function parseArticle(value: unknown, includeContent = true) {
  const a = requiredResponseRecord(value, "article");
  return {
    id: requiredRawString(a.id, "article id", providerResponseError),
    title: requiredRawString(a.title, "article title", providerResponseError),
    formatVersion: requiredNumber(a.format_version, "article format_version", providerResponseError),
    content:
      includeContent && a.content !== undefined ? requiredResponseRecord(a.content, "article content") : undefined,
    revision: requiredNumber(a.revision, "article revision", providerResponseError),
    indexedRevision: requiredNumber(a.indexed_revision, "article indexed_revision", providerResponseError),
    syncRevision: requiredNumber(a.sync_revision, "article sync_revision", providerResponseError),
    syncStatus: requiredRawString(a.sync_status, "article sync_status", providerResponseError),
    syncError: optionalRawString(a.sync_error),
    sourceFileId: optionalRawString(a.source_file_id),
    sourceFilename: optionalRawString(a.source_filename),
    conversionWarnings:
      a.conversion_warnings === undefined
        ? undefined
        : requiredStringArray(a.conversion_warnings, "article conversion_warnings", providerResponseError),
    createdAt: requiredRawString(a.created_at, "article created_at", providerResponseError),
    updatedAt: requiredRawString(a.updated_at, "article updated_at", providerResponseError),
  };
}
