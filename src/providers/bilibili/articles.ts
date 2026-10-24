import type { ProviderActionHandlerSubset } from "../provider-executors.ts";
import type { BilibiliActionHandler } from "./runtime.ts";

import {
  compactObject,
  looseArray,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringArray,
  positiveInteger,
} from "../../core/cast.ts";
import { readTransitFileInput } from "../provider-files.ts";
import {
  providerInputError,
  providerResponseError,
  requiredInputNumber,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { assertAnyInputField, bilibiliApiRequest, bilibiliFormRequest, readBilibiliReplyIncrement } from "./runtime.ts";
import { uploadBilibiliArticleImage } from "./upload.ts";

export const bilibiliArticleActionHandlers: ProviderActionHandlerSubset<"bilibili", BilibiliActionHandler> = {
  async list_article_categories(_input, context) {
    const data = await bilibiliApiRequest(context, {
      path: "/article/categories",
      label: "Bilibili article category list",
    });
    return { categories: looseArray(data) };
  },

  async upload_article_image(input, context) {
    const image = await readTransitFileInput(input.file, context);
    return uploadBilibiliArticleImage(context, image.file, optionalBoolean(input.watermark));
  },

  async submit_article(input, context) {
    const data = requiredResponseRecord(
      await bilibiliFormRequest(context, {
        path: "/article/add",
        fields: readArticleFormFields(input),
        label: "Bilibili article submit",
      }),
      "Bilibili article submit",
    );
    return { articleId: positiveInteger(data.id, "id", providerResponseError) };
  },

  async edit_article(input, context) {
    const articleId = requiredInputNumber(input.articleId, "articleId");
    assertAnyInputField(input, [
      "title",
      "categoryId",
      "templateId",
      "summary",
      "content",
      "bannerUrl",
      "original",
      "imageUrls",
      "tags",
      "anthologyId",
      "upClosedReply",
      "topVideoBvid",
    ]);
    // Fail fast on an explicit mutually exclusive pair before reading anything.
    assertArticleCoverChoice(input);
    // Bilibili replaces every field on edit, so unchanged fields are refilled
    // from the current article before submitting.
    const current = requiredResponseRecord(
      await bilibiliApiRequest(context, {
        path: "/article/detail",
        query: { id: String(articleId) },
        label: "Bilibili article detail",
      }),
      "Bilibili article detail",
    );
    const currentCategory = optionalRecord(current.category);
    const currentAnthology = optionalRecord(current.list);
    await bilibiliFormRequest(context, {
      path: "/article/edit",
      fields: readArticleFormFields(input, {
        id: articleId,
        title: optionalString(current.title),
        category: optionalNumber(currentCategory?.id),
        template_id: optionalNumber(current.template_id),
        summary: optionalString(current.summary),
        content: optionalString(current.content),
        banner_url: optionalString(current.banner_url),
        original: optionalNumber(current.original),
        image_urls: optionalStringArray(current.image_urls)?.join(","),
        tags: readArticleTagNames(current.tags),
        list_id: optionalNumber(currentAnthology?.id),
        top_video_bvid: optionalString(current.top_video_bvid),
      }),
      label: "Bilibili article edit",
    });
    return { articleId };
  },

  async delete_articles(input, context) {
    const ids = readArticleIdList(input.articleIds);
    await bilibiliFormRequest(context, {
      path: "/article/delete",
      fields: { ids: ids.join(",") },
      label: "Bilibili article delete",
    });
    return { articleIds: ids, deleted: true };
  },

  async get_article(input, context) {
    const articleId = requiredInputNumber(input.articleId, "articleId");
    const data = await bilibiliApiRequest(context, {
      path: "/article/detail",
      query: { id: String(articleId) },
      label: "Bilibili article detail",
    });
    return normalizeBilibiliArticle(data);
  },

  async list_articles(input, context) {
    const sort = optionalNumber(input.sort);
    const group = optionalNumber(input.group);
    const category = optionalNumber(input.categoryId);
    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, {
        path: "/article/list",
        query: {
          pn: String(optionalNumber(input.pn) ?? 1),
          ps: String(optionalNumber(input.ps) ?? 10),
          sort: sort === undefined ? undefined : String(sort),
          group: group === undefined ? undefined : String(group),
          category: category === undefined ? undefined : String(category),
        },
        label: "Bilibili article list",
      }),
      "Bilibili article list",
    );
    const page = optionalRecord(data.artPage);
    const counts = optionalRecord(data.creationArtsType);
    return {
      articles: looseArray(data.articles).map(normalizeBilibiliArticle),
      page: compactObject({
        pn: optionalNumber(page?.pn),
        ps: optionalNumber(page?.ps),
        total: optionalNumber(page?.total),
      }),
      counts: compactObject({
        all: optionalNumber(counts?.all),
        audit: optionalNumber(counts?.audit),
        passed: optionalNumber(counts?.passed),
        notPassed: optionalNumber(counts?.notPassed),
      }),
    };
  },

  async get_article_card_snippet(input, context) {
    const resourceId = requiredInputString(input.resourceId, "resourceId");
    // The document's formal URL field says /article/card while its own curl
    // sample calls /article/cards; this follows the documented field.
    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, {
        path: "/article/card",
        query: { resource_id: resourceId },
        label: "Bilibili article card",
      }),
      "Bilibili article card",
    );
    return compactObject({ snippet: optionalString(data.snippet) });
  },

  async create_anthology(input, context) {
    const data = requiredResponseRecord(
      await bilibiliFormRequest(context, {
        path: "/article/anthology/add",
        fields: {
          name: requiredInputString(input.name, "name"),
          summary: optionalString(input.summary),
          image_url: optionalString(input.imageUrl),
        },
        label: "Bilibili anthology create",
      }),
      "Bilibili anthology create",
    );
    return compactObject({
      anthologyId: optionalNumber(data.id),
      name: optionalString(data.name),
    });
  },

  async edit_anthology(input, context) {
    const anthologyId = requiredInputNumber(input.anthologyId, "anthologyId");
    assertAnyInputField(input, ["name", "summary", "imageUrl"]);
    // Same full-field replacement semantics as article editing: unchanged
    // fields are refilled from the current anthology.
    const current = requiredResponseRecord(
      await bilibiliApiRequest(context, {
        path: "/article/anthology/detail",
        query: { id: String(anthologyId) },
        label: "Bilibili anthology detail",
      }),
      "Bilibili anthology detail",
    );
    const anthology = optionalRecord(current.list) ?? current;
    const name = optionalString(input.name) ?? optionalString(anthology.name);
    if (!name) {
      throw providerInputError("name is required when the current anthology does not provide it.");
    }
    await bilibiliFormRequest(context, {
      path: "/article/anthology/edit",
      fields: {
        list_id: String(anthologyId),
        name,
        summary: optionalString(input.summary) ?? optionalString(anthology.summary),
        image_url: optionalString(input.imageUrl) ?? optionalString(anthology.image_url),
      },
      label: "Bilibili anthology edit",
    });
    return { anthologyId };
  },

  async delete_anthology(input, context) {
    const anthologyId = requiredInputNumber(input.anthologyId, "anthologyId");
    await bilibiliFormRequest(context, {
      path: "/article/anthology/delete",
      fields: { id: String(anthologyId) },
      label: "Bilibili anthology delete",
    });
    return { anthologyId, deleted: true };
  },

  async list_anthologies(_input, context) {
    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, { path: "/article/anthology/list", label: "Bilibili anthology list" }),
      "Bilibili anthology list",
    );
    return {
      anthologies: looseArray(data.lists).map(normalizeBilibiliAnthology),
      total: optionalNumber(data.total),
    };
  },

  async get_anthology(input, context) {
    const anthologyId = requiredInputNumber(input.anthologyId, "anthologyId");
    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, {
        path: "/article/anthology/detail",
        query: { id: String(anthologyId) },
        label: "Bilibili anthology detail",
      }),
      "Bilibili anthology detail",
    );
    return {
      anthology: normalizeBilibiliAnthology(optionalRecord(data.list) ?? {}),
      articles: looseArray(data.articles).map((article) => {
        const record = optionalRecord(article) ?? {};
        return compactObject({
          articleId: optionalNumber(record.id),
          title: optionalString(record.title),
          state: optionalNumber(record.state),
          publishTime: optionalNumber(record.publish_time),
        });
      }),
      total: optionalNumber(data.total),
    };
  },

  async set_anthology_articles(input, context) {
    const anthologyId = requiredInputNumber(input.anthologyId, "anthologyId");
    // An empty list clears the anthology; otherwise the given list replaces the current one.
    const articleIds = readArticleIdList(input.articleIds, { allowEmpty: true });
    await bilibiliFormRequest(context, {
      path: "/article/belong",
      fields: { list_id: String(anthologyId), article_ids: articleIds.join(",") },
      label: "Bilibili anthology article update",
    });
    return { anthologyId, articleIds };
  },

  async get_article_stats(input, context) {
    const ids = readArticleIdList(input.articleIds);
    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, {
        path: "/data/art/stat",
        query: { ids: ids.join(",") },
        label: "Bilibili article stats",
      }),
      "Bilibili article stats",
    );
    return {
      articles: Object.entries(data).map(([id, article]) => ({
        articleId: Number(id),
        ...normalizeBilibiliArticle(article),
      })),
    };
  },

  async get_article_inc_stats(_input, context) {
    const data = requiredResponseRecord(
      await bilibiliApiRequest(context, { path: "/data/art/inc-stats", label: "Bilibili article incremental stats" }),
      "Bilibili article incremental stats",
    );
    return compactObject({
      incRead: optionalNumber(data.inc_read),
      incReply: readBilibiliReplyIncrement(data),
      incFavorite: optionalNumber(data.inc_fav),
      incLikes: optionalNumber(data.inc_likes),
      incShare: optionalNumber(data.inc_share),
      incCoin: optionalNumber(data.inc_coin),
    });
  },
};

/** Reject an explicit bannerUrl+topVideoBvid pair; the document makes them mutually exclusive. */
function assertArticleCoverChoice(input: Record<string, unknown>): void {
  if (optionalString(input.bannerUrl) && optionalString(input.topVideoBvid)) {
    throw providerInputError("bannerUrl and topVideoBvid are mutually exclusive.");
  }
}

/** Build the multipart form fields of an article add/edit request, merging over `current` when editing. */
function readArticleFormFields(
  input: Record<string, unknown>,
  current: Record<string, string | number | undefined> = {},
): Record<string, string | undefined> {
  const original = optionalBoolean(input.original);
  const upClosedReply = optionalBoolean(input.upClosedReply);
  const anthologyId = optionalNumber(input.anthologyId);
  const imageUrls = input.imageUrls === undefined ? undefined : readArticleImageUrls(input.imageUrls);
  assertArticleCoverChoice(input);
  // An explicit input replaces the inherited counterpart so editing can switch.
  const inputBannerUrl = optionalString(input.bannerUrl);
  const inputTopVideoBvid = optionalString(input.topVideoBvid);
  const bannerUrl = inputBannerUrl ?? (inputTopVideoBvid ? undefined : current.banner_url?.toString());
  const topVideoBvid = inputTopVideoBvid ?? (inputBannerUrl ? undefined : current.top_video_bvid?.toString());
  return {
    id: current.id === undefined ? undefined : String(current.id),
    title: optionalString(input.title) ?? requiredInputString(current.title, "title"),
    category: String(optionalNumber(input.categoryId) ?? requiredInputNumber(current.category, "category")),
    template_id: String(optionalNumber(input.templateId) ?? requiredInputNumber(current.template_id, "templateId")),
    summary: optionalString(input.summary) ?? requiredInputString(current.summary, "summary"),
    content: optionalString(input.content) ?? requiredInputString(current.content, "content"),
    banner_url: bannerUrl,
    original: original === undefined ? current.original?.toString() : original ? "1" : "0",
    image_urls: imageUrls ?? current.image_urls?.toString(),
    tags: optionalString(input.tags) ?? current.tags?.toString(),
    list_id: anthologyId === undefined ? current.list_id?.toString() : String(anthologyId),
    up_closed_reply: upClosedReply === undefined ? undefined : upClosedReply ? "1" : "0",
    top_video_bvid: topVideoBvid,
  };
}

function readArticleImageUrls(value: unknown): string {
  const urls = optionalStringArray(value);
  if (!urls || urls.length === 0) {
    throw providerInputError("imageUrls must be a non-empty array of Bilibili-hosted image URLs.");
  }
  return urls.join(",");
}

function readArticleIdList(value: unknown, options: { allowEmpty?: boolean } = {}): number[] {
  const ids = Array.isArray(value) ? value.map((id) => positiveInteger(id, "articleIds", providerInputError)) : [];
  if (ids.length === 0 && !options.allowEmpty) {
    throw providerInputError("articleIds must be a non-empty array of article ids.");
  }
  return ids;
}

function readArticleTagNames(value: unknown): string | undefined {
  const tags = looseArray(value)
    .map((tag) => optionalString(optionalRecord(tag)?.name))
    .filter((name): name is string => name !== undefined);
  return tags.length > 0 ? tags.join(",") : undefined;
}

function normalizeBilibiliArticle(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  const category = optionalRecord(record.category);
  const stats = optionalRecord(record.stats);
  const anthology = optionalRecord(record.list);
  return compactObject({
    articleId: optionalNumber(record.id),
    title: optionalString(record.title),
    summary: optionalString(record.summary),
    content: optionalString(record.content),
    bannerUrl: optionalString(record.banner_url),
    templateId: optionalNumber(record.template_id),
    state: optionalNumber(record.state),
    reason: optionalString(record.reason),
    imageUrls: optionalStringArray(record.image_urls),
    publishTime: optionalNumber(record.publish_time),
    ctime: optionalNumber(record.ctime),
    words: optionalNumber(record.words),
    original: optionalNumber(record.original),
    topVideoBvid: optionalString(record.top_video_bvid),
    type: optionalNumber(record.type),
    category:
      category === undefined
        ? undefined
        : compactObject({
            id: optionalNumber(category.id),
            parentId: optionalNumber(category.parent_id),
            name: optionalString(category.name),
          }),
    stats:
      stats === undefined
        ? undefined
        : compactObject({
            view: optionalNumber(stats.view),
            favorite: optionalNumber(stats.favorite),
            like: optionalNumber(stats.like),
            dislike: optionalNumber(stats.dislike),
            reply: optionalNumber(stats.reply),
            share: optionalNumber(stats.share),
            coin: optionalNumber(stats.coin),
          }),
    tags: looseArray(record.tags).map((tag) => {
      const item = optionalRecord(tag) ?? {};
      return compactObject({ tid: optionalNumber(item.tid), name: optionalString(item.name) });
    }),
    anthology:
      anthology === undefined
        ? undefined
        : compactObject({ anthologyId: optionalNumber(anthology.id), name: optionalString(anthology.name) }),
  });
}

function normalizeBilibiliAnthology(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return compactObject({
    anthologyId: optionalNumber(record.id),
    name: optionalString(record.name),
    imageUrl: optionalString(record.image_url),
    summary: optionalString(record.summary),
    words: optionalNumber(record.words),
    read: optionalNumber(record.read),
    state: optionalNumber(record.state),
    reason: optionalString(record.reason),
    total: optionalNumber(record.total),
    ctime: optionalNumber(record.ctime),
    publishTime: optionalNumber(record.publish_time),
    updateTime: optionalNumber(record.update_time),
    applyTime: optionalString(record.apply_time),
    checkTime: optionalString(record.check_time),
  });
}
