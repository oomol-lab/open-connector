import type { ProviderRuntimeHandler } from "../provider-executors.ts";
import type { MetaContext } from "./request.ts";

import { objectArray, optionalRecord, rawStringOrNull, requiredString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { metaFields, metaId, metaRequest, normalizePaging } from "./request.ts";

const pageFields = "id,name,category,link,tasks";
const postFields = "id,message,created_time,permalink_url,is_published";

export const metaPageHandlers: Record<string, ProviderRuntimeHandler<MetaContext>> = {
  async list_pages(input: Record<string, unknown>, context: MetaContext) {
    const payload = await metaRequest("me/accounts", context, {
      query: listQuery(input, pageFields),
    });

    return {
      pages: objectArray(payload.data, "Meta Pages", providerResponseError).map(normalizePage),
      paging: normalizePaging(payload.paging),
    };
  },
  async get_page(input: Record<string, unknown>, context: MetaContext) {
    const pageId = requiredInputString(input.pageId, "pageId");
    const pageContext = await resolvePageContext(pageId, context);
    const page = await metaRequest(metaId(pageId), pageContext, {
      query: { fields: metaFields(input.fields, "id,name,category,link") },
    });

    return { page: normalizePage(page) };
  },
  async list_page_posts(input: Record<string, unknown>, context: MetaContext) {
    const pageId = requiredInputString(input.pageId, "pageId");
    const pageContext = await resolvePageContext(pageId, context);
    const payload = await metaRequest(`${metaId(pageId)}/feed`, pageContext, {
      query: { ...listQuery(input, postFields), since: input.since, until: input.until },
    });

    return {
      posts: objectArray(payload.data, "Meta Page posts", providerResponseError).map(normalizePost),
      paging: normalizePaging(payload.paging),
    };
  },
  async get_page_post(input: Record<string, unknown>, context: MetaContext) {
    const pageContext = await resolvePageContext(requiredInputString(input.pageId, "pageId"), context);
    const post = await metaRequest(metaId(requiredInputString(input.postId, "postId")), pageContext, {
      query: { fields: metaFields(input.fields, postFields) },
    });

    return { post: normalizePost(post) };
  },
  async create_page_post(input: Record<string, unknown>, context: MetaContext) {
    const body = postBody(input, false);
    const hasAttachments = Array.isArray(body.attached_media) && body.attached_media.length > 0;
    if (!body.message && !body.link && !hasAttachments) {
      throw new ProviderRequestError(
        400,
        "Provide message, link, or attachedMedia for a Page post",
        undefined,
        "invalid_input",
      );
    }

    const pageId = requiredInputString(input.pageId, "pageId");
    const pageContext = await resolvePageContext(pageId, context);
    const result = await metaRequest(`${metaId(pageId)}/feed`, pageContext, {
      method: "POST",
      body,
    });

    return { postId: requiredString(result.id, "Meta post ID", providerResponseError) };
  },
  async update_page_post(input: Record<string, unknown>, context: MetaContext) {
    const body = postBody(input, true);
    if (Object.keys(body).length === 0) {
      throw new ProviderRequestError(400, "Provide at least one Page post update", undefined, "invalid_input");
    }

    const pageContext = await resolvePageContext(requiredInputString(input.pageId, "pageId"), context);
    return metaRequest(metaId(requiredInputString(input.postId, "postId")), pageContext, {
      method: "POST",
      body,
    });
  },
  async delete_page_post(input: Record<string, unknown>, context: MetaContext) {
    const pageContext = await resolvePageContext(requiredInputString(input.pageId, "pageId"), context);
    return metaRequest(metaId(requiredInputString(input.postId, "postId")), pageContext, {
      method: "DELETE",
    });
  },
  async publish_page_photo(input: Record<string, unknown>, context: MetaContext) {
    const body = parameters(input.additionalParameters, {
      url: input.imageUrl,
      caption: input.caption,
      published: input.published,
      scheduled_publish_time: input.scheduledPublishTime,
    });
    applyPublishingDefault(body, false);
    const pageId = requiredInputString(input.pageId, "pageId");
    const pageContext = await resolvePageContext(pageId, context);
    const result = await metaRequest(`${metaId(pageId)}/photos`, pageContext, {
      method: "POST",
      body,
    });

    return {
      photoId: requiredString(result.id, "Meta photo ID", providerResponseError),
      postId: rawStringOrNull(result.post_id),
    };
  },
};

async function resolvePageContext(pageId: string, context: MetaContext): Promise<MetaContext> {
  let profileId = context.profileId;
  if (!profileId) {
    const profile = await metaRequest("me", context, { query: { fields: "id" } });
    profileId = requiredString(profile.id, "Meta token owner ID", providerResponseError);
  }

  if (profileId === pageId) return context;
  const page = await metaRequest(metaId(pageId), context, { query: { fields: "id,access_token" } });
  return {
    ...context,
    accessToken: requiredString(page.access_token, "Meta Page access token", providerResponseError),
  };
}

function listQuery(input: Record<string, unknown>, defaults: string) {
  return {
    fields: metaFields(input.fields, defaults),
    limit: input.limit,
    before: input.before,
    after: input.after,
  };
}

function normalizePage(raw: Record<string, unknown>) {
  return { id: requiredString(raw.id, "Meta Page ID", providerResponseError), name: rawStringOrNull(raw.name), raw };
}

function normalizePost(raw: Record<string, unknown>) {
  return {
    id: requiredString(raw.id, "Meta post ID", providerResponseError),
    message: rawStringOrNull(raw.message),
    permalinkUrl: rawStringOrNull(raw.permalink_url),
    createdTime: rawStringOrNull(raw.created_time),
    raw,
  };
}

function postBody(input: Record<string, unknown>, update: boolean) {
  const publishField = update ? "is_published" : "published";
  const attachedMedia = Array.isArray(input.attachedMedia)
    ? input.attachedMedia.map((item) => ({
        media_fbid: requiredResponseRecord(item, "Photo attachment").mediaFbid,
      }))
    : undefined;
  const body = parameters(input.additionalParameters, {
    message: input.message,
    link: input.link,
    [publishField]: input.published,
    scheduled_publish_time: input.scheduledPublishTime,
    attached_media: attachedMedia,
    targeting: input.targeting,
    feed_targeting: input.feedTargeting,
  });
  applyPublishingDefault(body, update, publishField);
  return body;
}

function applyPublishingDefault(body: Record<string, unknown>, update: boolean, publishField = "published") {
  if (body.scheduled_publish_time != null && body[publishField] === true) {
    throw new ProviderRequestError(400, "A scheduled Page post must use published=false", undefined, "invalid_input");
  }

  if (body[publishField] === undefined && (body.scheduled_publish_time != null || !update)) {
    body[publishField] = body.scheduled_publish_time == null;
  }
}

function parameters(extra: unknown, explicit: Record<string, unknown>) {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(optionalRecord(extra) ?? {})) {
    if (
      [
        "access_token",
        "appsecret_proof",
        "client_secret",
        "client_id",
        "method",
        "batch",
        "relative_url",
        "ids",
      ].includes(key)
    ) {
      throw new ProviderRequestError(400, `additionalParameters cannot set ${key}`, undefined, "invalid_input");
    }

    if (explicit[key] !== undefined) {
      throw new ProviderRequestError(400, `additionalParameters duplicates ${key}`, undefined, "invalid_input");
    }

    body[key] = value;
  }

  for (const [key, value] of Object.entries(explicit)) {
    if (value !== undefined) body[key] = value;
  }

  return body;
}
