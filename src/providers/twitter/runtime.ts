import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { TwitterActionName } from "./actions.ts";

import { base64Bytes } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export const twitterApiBaseUrl: string = "https://api.x.com/2";
const twitterMediaUploadUrl = "https://api.x.com/2/media/upload";
const twitterMediaUploadInitializeUrl = `${twitterMediaUploadUrl}/initialize`;
const twitterRequiredAuthorizationScopes = "tweet.read, users.read, offline.access";
const defaultTwitterMediaChunkSizeBytes = 4 * 1024 * 1024;
const maxTwitterMediaChunkSizeBytes = 5 * 1024 * 1024;
const maxTwitterMediaSegmentCount = 1000;

export interface TwitterActionContext {
  userAccessToken: string;
  appBearerToken?: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type TwitterActionHandler = ProviderRuntimeHandler<TwitterActionContext>;
type TwitterMediaChunk = Uint8Array<ArrayBuffer>;

export async function fetchTwitterCurrentAccount(
  accessToken: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
    grantedScopes: string[];
  };
  metadata: Record<string, unknown>;
}> {
  const url = new URL(`${twitterApiBaseUrl}/users/me`);
  url.searchParams.set("user.fields", "id,name,username,profile_image_url");
  const payload = await twitterRequestJson(url.toString(), {
    accessToken,
    fetcher,
    signal,
  });
  const account = asObject(payload.data);
  const id = typeof account.id === "string" ? account.id : "";
  const username = typeof account.username === "string" ? account.username : "";
  if (!id || !username) {
    throw new ProviderRequestError(502, "twitter current user response is missing id or username");
  }

  return {
    profile: {
      accountId: id,
      displayName: normalizeOptionalString(account.name) || username,
      grantedScopes: [],
    },
    metadata: {
      id,
      name: typeof account.name === "string" ? account.name : null,
      username,
      profileImageUrl: typeof account.profile_image_url === "string" ? account.profile_image_url : null,
    },
  };
}

export const twitterActionHandlers: Record<TwitterActionName, TwitterActionHandler> = {
  async user_lookup_me(input, context) {
    const url = new URL(`${twitterApiBaseUrl}/users/me`);
    appendTwitterUserFields(url, input);
    return buildSingleUserResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async user_lookup_by_username(input, context) {
    const username = normalizeUsername(input.username);
    if (!username) {
      throw twitterError("invalid_input", "username is required", 400);
    }

    const url = new URL(`${twitterApiBaseUrl}/users/by/username/${encodeURIComponent(username)}`);
    appendTwitterUserFields(url, input);
    return buildSingleUserResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_user_by_id(input, context) {
    const id = requireNonEmptyString(input.id, "id");
    const url = new URL(`${twitterApiBaseUrl}/users/${encodeURIComponent(id)}`);
    appendTwitterUserFields(url, input);
    return buildSingleUserResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_users_by_ids(input, context) {
    const url = new URL(`${twitterApiBaseUrl}/users`);
    setTwitterArrayQueryParam(url, "ids", input.ids);
    appendTwitterUserFields(url, input);
    return buildUsersResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async user_lookup_by_usernames(input, context) {
    const url = new URL(`${twitterApiBaseUrl}/users/by`);
    setTwitterArrayQueryParam(url, "usernames", normalizeUsernames(input.usernames));
    appendTwitterUserFields(url, input);
    return buildUsersResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async recent_search(input, context) {
    const url = new URL(`${twitterApiBaseUrl}/tweets/search/recent`);
    appendTwitterSearchQuery(url, input);
    return buildPostsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async search_recent_counts(input, context) {
    const url = new URL(`${twitterApiBaseUrl}/tweets/counts/recent`);
    setTwitterQueryParam(url, "query", input.query);
    setTwitterQueryParam(url, "start_time", input.startTime);
    setTwitterQueryParam(url, "end_time", input.endTime);
    setTwitterQueryParam(url, "since_id", input.sinceId);
    setTwitterQueryParam(url, "until_id", input.untilId);
    setTwitterQueryParam(url, "next_token", input.nextToken);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    setTwitterQueryParam(url, "granularity", input.granularity);
    setTwitterArrayQueryParam(url, "search_count.fields", input.searchCountFields);

    const payload = await twitterRequestJson(url.toString(), {
      accessToken: context.userAccessToken,
      fetcher: context.fetcher,
    });

    return {
      counts: Array.isArray(payload.data) ? payload.data.map(normalizeSearchCount) : [],
      ...(payload.meta ? { meta: payload.meta } : {}),
    };
  },

  async post_lookup_by_post_id(input, context) {
    const id = requireNonEmptyString(input.id, "id");
    const url = new URL(`${twitterApiBaseUrl}/tweets/${encodeURIComponent(id)}`);
    appendTwitterTweetFields(url, input);
    return buildSinglePostResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async post_lookup_by_post_ids(input, context) {
    const url = new URL(`${twitterApiBaseUrl}/tweets`);
    setTwitterArrayQueryParam(url, "ids", input.ids);
    appendTwitterTweetFields(url, input);
    return buildPostsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async user_home_timeline_by_user_id(input, context) {
    const userId = requireNonEmptyString(input.userId, "userId");
    const url = new URL(`${twitterApiBaseUrl}/users/${encodeURIComponent(userId)}/timelines/reverse_chronological`);
    setTwitterQueryParam(url, "since_id", input.sinceId);
    setTwitterQueryParam(url, "until_id", input.untilId);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterTweetFields(url, input);
    return buildPostsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async retrieve_posts_that_quote_a_post(input, context) {
    const id = requireNonEmptyString(input.id, "id");
    const url = new URL(`${twitterApiBaseUrl}/tweets/${encodeURIComponent(id)}/quote_tweets`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterTweetFields(url, input);
    return buildPostsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_post_retweets(input, context) {
    const id = requireNonEmptyString(input.id, "id");
    const url = new URL(`${twitterApiBaseUrl}/tweets/${encodeURIComponent(id)}/retweets`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterTweetFields(url, input);
    return buildPostsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_space_posts(input, context) {
    const spaceId = requireNonEmptyString(input.spaceId, "spaceId");
    const url = new URL(`${twitterApiBaseUrl}/spaces/${encodeURIComponent(spaceId)}/tweets`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    appendTwitterTweetFields(url, input);
    return buildPostsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async bookmarks_by_user(input, context) {
    const userId = requireNonEmptyString(input.userId, "userId");
    const url = new URL(`${twitterApiBaseUrl}/users/${encodeURIComponent(userId)}/bookmarks`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterTweetFields(url, input);
    return buildPostsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async returns_post_objects_liked_by_the_provided_user_id(input, context) {
    const userId = requireNonEmptyString(input.userId, "userId");
    const url = new URL(`${twitterApiBaseUrl}/users/${encodeURIComponent(userId)}/liked_tweets`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterTweetFields(url, input);
    return buildPostsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async creation_of_a_post(input, context) {
    const payload = await twitterRequestJson(`${twitterApiBaseUrl}/tweets`, {
      method: "POST",
      accessToken: context.userAccessToken,
      fetcher: context.fetcher,
      body: buildCreatePostBody(input),
    });

    const data = asObject(payload.data);
    return {
      id: String(data.id ?? ""),
      text: String(data.text ?? ""),
      ...(Array.isArray(data.edit_history_tweet_ids)
        ? { editHistoryTweetIds: data.edit_history_tweet_ids.map(String) }
        : {}),
      raw: payload,
    };
  },

  async post_delete_by_post_id(input, context) {
    const id = requireNonEmptyString(input.id, "id");
    const payload = await twitterRequestJson(`${twitterApiBaseUrl}/tweets/${encodeURIComponent(id)}`, {
      method: "DELETE",
      accessToken: context.userAccessToken,
      fetcher: context.fetcher,
    });

    return {
      deleted: Boolean(asObject(payload.data).deleted),
      raw: payload,
    };
  },

  async hide_replies(input, context) {
    const id = requireNonEmptyString(input.id, "id");
    const payload = await twitterRequestJson(`${twitterApiBaseUrl}/tweets/${encodeURIComponent(id)}/hidden`, {
      method: "PUT",
      accessToken: context.userAccessToken,
      fetcher: context.fetcher,
      body: JSON.stringify({
        hidden: Boolean(input.hidden),
      }),
    });

    return {
      hidden: Boolean(asObject(payload.data).hidden),
      raw: payload,
    };
  },

  async upload_media(input, context) {
    const mediaBase64 = requireNonEmptyString(input.mediaBase64, "mediaBase64");
    const mimeType = requireNonEmptyString(input.mimeType, "mimeType");

    const formData = new FormData();
    const binary = decodeBase64(mediaBase64);
    const fileName = normalizeOptionalString(input.fileName) || "upload";
    formData.append("media", new Blob([binary], { type: mimeType }), fileName);
    if (typeof input.mediaCategory === "string" && input.mediaCategory.trim()) {
      formData.append("media_category", input.mediaCategory.trim());
    }

    const payload = await twitterRequestJson(twitterMediaUploadUrl, {
      method: "POST",
      accessToken: context.userAccessToken,
      fetcher: context.fetcher,
      body: formData,
      contentType: null,
    });

    const data = asObject(payload.data);
    return {
      id: String(data.id ?? ""),
      mediaKey: String(data.media_key ?? ""),
      expiresAfterSecs: Number(data.expires_after_secs ?? 0),
      size: Number(data.size ?? 0),
      raw: payload,
    };
  },

  async upload_large_media(input, context) {
    const mediaUrl = assertPublicHttpUrl(requireNonEmptyString(input.mediaUrl, "mediaUrl"), {
      fieldName: "mediaUrl",
      createError: (message) => new ProviderRequestError(400, message),
    }).toString();
    const mimeType = requireNonEmptyString(input.mimeType, "mimeType");
    const totalBytes = requirePositiveInteger(input.totalBytes, "totalBytes");
    const mediaCategory = requireNonEmptyString(input.mediaCategory, "mediaCategory");
    const chunkSizeBytes = readTwitterMediaChunkSize(input.chunkSizeBytes);
    const segmentCount = Math.ceil(totalBytes / chunkSizeBytes);
    if (segmentCount > maxTwitterMediaSegmentCount) {
      throw twitterError(
        "invalid_input",
        `totalBytes requires ${segmentCount} chunks with the selected chunkSizeBytes, but X accepts at most ${maxTwitterMediaSegmentCount} chunks`,
        400,
      );
    }

    const initializePayload = await twitterRequestJson(twitterMediaUploadInitializeUrl, {
      method: "POST",
      accessToken: context.userAccessToken,
      fetcher: context.fetcher,
      body: JSON.stringify({
        total_bytes: totalBytes,
        media_type: mimeType,
        media_category: mediaCategory,
      }),
    });
    const initialized = normalizeTwitterMediaUploadResult(initializePayload, "pending");
    const mediaId = requireNonEmptyString(initialized.mediaId, "mediaId");

    const mediaResponse = await context.fetcher(mediaUrl);
    if (!mediaResponse.ok) {
      throw twitterError(
        "provider_error",
        `twitter media source download failed with status ${mediaResponse.status}`,
        mediaResponse.status,
      );
    }
    if (!mediaResponse.body) {
      throw twitterError("provider_error", "twitter media source response has no body");
    }

    const uploadedBytes = await appendTwitterMediaUploadChunks({
      accessToken: context.userAccessToken,
      chunkSizeBytes,
      fetcher: context.fetcher,
      mediaId,
      stream: mediaResponse.body,
    });
    if (uploadedBytes !== totalBytes) {
      throw twitterError(
        "invalid_input",
        `mediaUrl yielded ${uploadedBytes} bytes, expected totalBytes ${totalBytes}`,
        400,
      );
    }

    const finalizePayload = await twitterRequestJson(buildTwitterMediaUploadFinalizeUrl(mediaId), {
      method: "POST",
      accessToken: context.userAccessToken,
      fetcher: context.fetcher,
    });

    return normalizeTwitterMediaUploadResult(finalizePayload, "succeeded", {
      fallbackExpiresAfterSecs: initialized.expiresAfterSecs,
      fallbackMediaId: mediaId,
      fallbackMediaKey: initialized.mediaKey,
      fallbackSize: uploadedBytes,
    });
  },

  async get_media_upload_status(input, context) {
    const mediaId = requireNonEmptyString(input.mediaId, "mediaId");
    const url = new URL(twitterMediaUploadUrl);
    url.searchParams.set("command", "STATUS");
    url.searchParams.set("media_id", mediaId);

    return normalizeTwitterMediaUploadResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
      "succeeded",
      { fallbackMediaId: mediaId },
    );
  },

  async followers_by_user_id(input, context) {
    const userId = requireNonEmptyString(input.userId, "userId");
    const url = new URL(`${twitterApiBaseUrl}/users/${encodeURIComponent(userId)}/followers`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterUserFields(url, input);
    return buildUsersResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async following_by_user_id(input, context) {
    const userId = requireNonEmptyString(input.userId, "userId");
    const url = new URL(`${twitterApiBaseUrl}/users/${encodeURIComponent(userId)}/following`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterUserFields(url, input);
    return buildUsersResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_post_retweeters_action(input, context) {
    const id = requireNonEmptyString(input.id, "id");
    const url = new URL(`${twitterApiBaseUrl}/tweets/${encodeURIComponent(id)}/retweeted_by`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterUserFields(url, input);
    return buildUsersResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async list_post_likers(input, context) {
    const id = requireNonEmptyString(input.id, "id");
    const url = new URL(`${twitterApiBaseUrl}/tweets/${encodeURIComponent(id)}/liking_users`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterUserFields(url, input);
    return buildUsersResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_muted_users(input, context) {
    const userId = requireNonEmptyString(input.userId, "userId");
    const url = new URL(`${twitterApiBaseUrl}/users/${encodeURIComponent(userId)}/muting`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterUserFields(url, input);
    return buildUsersResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_list_followers(input, context) {
    const listId = requireNonEmptyString(input.listId, "listId");
    const url = new URL(`${twitterApiBaseUrl}/lists/${encodeURIComponent(listId)}/followers`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterUserFields(url, input);
    return buildUsersResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_list_members(input, context) {
    const listId = requireNonEmptyString(input.listId, "listId");
    const url = new URL(`${twitterApiBaseUrl}/lists/${encodeURIComponent(listId)}/members`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterUserFields(url, input);
    return buildUsersResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_space_ticket_buyers(input, context) {
    const spaceId = requireNonEmptyString(input.spaceId, "spaceId");
    const url = new URL(`${twitterApiBaseUrl}/spaces/${encodeURIComponent(spaceId)}/buyers`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterUserFields(url, input);
    return buildUsersResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async follow_user(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/following`,
      method: "POST",
      responseKey: "following",
      outputKey: "following",
      body: JSON.stringify({
        target_user_id: requireNonEmptyString(input.targetUserId, "targetUserId"),
      }),
    });
  },

  async unfollow_user(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/following/${encodeURIComponent(requireNonEmptyString(input.targetUserId, "targetUserId"))}`,
      method: "DELETE",
      responseKey: "following",
      outputKey: "following",
    });
  },

  async user_like_post(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/likes`,
      method: "POST",
      responseKey: "liked",
      outputKey: "liked",
      body: JSON.stringify({
        tweet_id: requireNonEmptyString(input.tweetId, "tweetId"),
      }),
    });
  },

  async unlike_post(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/likes/${encodeURIComponent(requireNonEmptyString(input.tweetId, "tweetId"))}`,
      method: "DELETE",
      responseKey: "liked",
      outputKey: "liked",
    });
  },

  async add_post_to_bookmarks(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/bookmarks`,
      method: "POST",
      responseKey: "bookmarked",
      outputKey: "bookmarked",
      body: JSON.stringify({
        tweet_id: requireNonEmptyString(input.tweetId, "tweetId"),
      }),
    });
  },

  async remove_post_from_bookmarks(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/bookmarks/${encodeURIComponent(requireNonEmptyString(input.tweetId, "tweetId"))}`,
      method: "DELETE",
      responseKey: "bookmarked",
      outputKey: "bookmarked",
    });
  },

  async retweet_post(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/retweets`,
      method: "POST",
      responseKey: "retweeted",
      outputKey: "retweeted",
      body: JSON.stringify({
        tweet_id: requireNonEmptyString(input.tweetId, "tweetId"),
      }),
    });
  },

  async unretweet_post(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/retweets/${encodeURIComponent(requireNonEmptyString(input.tweetId, "tweetId"))}`,
      method: "DELETE",
      responseKey: "retweeted",
      outputKey: "retweeted",
    });
  },

  async mute_user(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/muting`,
      method: "POST",
      responseKey: "muted",
      outputKey: "muted",
      body: JSON.stringify({
        target_user_id: requireNonEmptyString(input.targetUserId, "targetUserId"),
      }),
    });
  },

  async unmute_user(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/muting/${encodeURIComponent(requireNonEmptyString(input.targetUserId, "targetUserId"))}`,
      method: "DELETE",
      responseKey: "muted",
      outputKey: "muted",
    });
  },

  async create_list(input, context) {
    const payload = await twitterRequestJson(`${twitterApiBaseUrl}/lists`, {
      method: "POST",
      accessToken: context.userAccessToken,
      fetcher: context.fetcher,
      body: JSON.stringify({
        name: requireNonEmptyString(input.name, "name"),
        ...(input.description != null ? { description: String(input.description) } : {}),
        ...(typeof input.private === "boolean" ? { private: input.private } : {}),
      }),
    });

    return buildSingleListResult(payload);
  },

  async get_list(input, context) {
    const id = requireNonEmptyString(input.id, "id");
    const url = new URL(`${twitterApiBaseUrl}/lists/${encodeURIComponent(id)}`);
    appendTwitterListFields(url, input);
    return buildSingleListResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_user_followed_lists(input, context) {
    const userId = requireNonEmptyString(input.userId, "userId");
    const url = new URL(`${twitterApiBaseUrl}/users/${encodeURIComponent(userId)}/followed_lists`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterListFields(url, input);
    return buildListsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_user_list_memberships(input, context) {
    const userId = requireNonEmptyString(input.userId, "userId");
    const url = new URL(`${twitterApiBaseUrl}/users/${encodeURIComponent(userId)}/list_memberships`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterListFields(url, input);
    return buildListsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_user_owned_lists(input, context) {
    const userId = requireNonEmptyString(input.userId, "userId");
    const url = new URL(`${twitterApiBaseUrl}/users/${encodeURIComponent(userId)}/owned_lists`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterListFields(url, input);
    return buildListsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_user_pinned_lists(input, context) {
    const userId = requireNonEmptyString(input.userId, "userId");
    const url = new URL(`${twitterApiBaseUrl}/users/${encodeURIComponent(userId)}/pinned_lists`);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterListFields(url, input);
    return buildListsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async list_posts_timeline_by_list_id(input, context) {
    const listId = requireNonEmptyString(input.listId, "listId");
    const url = new URL(`${twitterApiBaseUrl}/lists/${encodeURIComponent(listId)}/tweets`);
    setTwitterQueryParam(url, "since_id", input.sinceId);
    setTwitterQueryParam(url, "until_id", input.untilId);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    appendTwitterTweetFields(url, input);
    return buildPostsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async delete_list(input, context) {
    const id = requireNonEmptyString(input.id, "id");
    return executeBooleanMutation(input, context, {
      url: () => `${twitterApiBaseUrl}/lists/${encodeURIComponent(id)}`,
      method: "DELETE",
      responseKey: "deleted",
      outputKey: "deleted",
    });
  },

  async update_list(input, context) {
    const id = requireNonEmptyString(input.id, "id");
    const body = {
      ...(typeof input.name === "string" ? { name: input.name } : {}),
      ...(typeof input.description === "string" ? { description: input.description } : {}),
      ...(typeof input.private === "boolean" ? { private: input.private } : {}),
    };

    return executeBooleanMutation(input, context, {
      url: () => `${twitterApiBaseUrl}/lists/${encodeURIComponent(id)}`,
      method: "PUT",
      responseKey: "updated",
      outputKey: "updated",
      body: JSON.stringify(body),
    });
  },

  async add_list_member(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/lists/${encodeURIComponent(requireNonEmptyString(input.listId, "listId"))}/members`,
      method: "POST",
      responseKey: "is_member",
      outputKey: "isMember",
      body: JSON.stringify({
        user_id: requireNonEmptyString(input.userId, "userId"),
      }),
    });
  },

  async remove_list_member(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/lists/${encodeURIComponent(requireNonEmptyString(input.listId, "listId"))}/members/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}`,
      method: "DELETE",
      responseKey: "is_member",
      outputKey: "isMember",
    });
  },

  async follow_list(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/followed_lists`,
      method: "POST",
      responseKey: "following",
      outputKey: "following",
      body: JSON.stringify({
        list_id: requireNonEmptyString(input.listId, "listId"),
      }),
    });
  },

  async unfollow_list(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/followed_lists/${encodeURIComponent(requireNonEmptyString(input.listId, "listId"))}`,
      method: "DELETE",
      responseKey: "following",
      outputKey: "following",
    });
  },

  async pin_list(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/pinned_lists`,
      method: "POST",
      responseKey: "pinned",
      outputKey: "pinned",
      body: JSON.stringify({
        list_id: requireNonEmptyString(input.listId, "listId"),
      }),
    });
  },

  async unpin_list(input, context) {
    return executeBooleanMutation(input, context, {
      url: () =>
        `${twitterApiBaseUrl}/users/${encodeURIComponent(requireNonEmptyString(input.userId, "userId"))}/pinned_lists/${encodeURIComponent(requireNonEmptyString(input.listId, "listId"))}`,
      method: "DELETE",
      responseKey: "pinned",
      outputKey: "pinned",
    });
  },

  async search_spaces(input, context) {
    const url = new URL(`${twitterApiBaseUrl}/spaces/search`);
    setTwitterQueryParam(url, "query", input.query);
    setTwitterQueryParam(url, "state", input.state);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    appendTwitterSpaceFields(url, input);
    return buildSpacesResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_space_by_id(input, context) {
    const id = requireNonEmptyString(input.id, "id");
    const url = new URL(`${twitterApiBaseUrl}/spaces/${encodeURIComponent(id)}`);
    appendTwitterSpaceFields(url, input);
    return buildSingleSpaceResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_spaces_by_ids(input, context) {
    const url = new URL(`${twitterApiBaseUrl}/spaces`);
    setTwitterArrayQueryParam(url, "ids", input.ids);
    appendTwitterSpaceFields(url, input);
    return buildSpacesResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_spaces_by_creators(input, context) {
    const url = new URL(`${twitterApiBaseUrl}/spaces/by/creator_ids`);
    setTwitterArrayQueryParam(url, "user_ids", input.userIds);
    appendTwitterSpaceFields(url, input);
    return buildSpacesResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_recent_dm_events(input, context) {
    const url = new URL(`${twitterApiBaseUrl}/dm_events`);
    appendTwitterDmFields(url, input);
    setTwitterArrayQueryParam(url, "event_types", input.eventTypes);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    return buildDmEventsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_dm_event(input, context) {
    const eventId = requireNonEmptyString(input.eventId, "eventId");
    const url = new URL(`${twitterApiBaseUrl}/dm_events/${encodeURIComponent(eventId)}`);
    appendTwitterDmFields(url, input);
    return buildSingleDmEventResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_dm_conversation_events(input, context) {
    const participantId = requireNonEmptyString(input.participantId, "participantId");
    const url = new URL(`${twitterApiBaseUrl}/dm_conversations/with/${encodeURIComponent(participantId)}/dm_events`);
    appendTwitterDmFields(url, input);
    setTwitterArrayQueryParam(url, "event_types", input.eventTypes);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    return buildDmEventsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async retrieve_dm_conversation_events(input, context) {
    const dmConversationId = requireNonEmptyString(input.dmConversationId, "dmConversationId");
    const url = new URL(`${twitterApiBaseUrl}/dm_conversations/${encodeURIComponent(dmConversationId)}/dm_events`);
    appendTwitterDmFields(url, input);
    setTwitterArrayQueryParam(url, "event_types", input.eventTypes);
    setTwitterQueryParam(url, "max_results", input.maxResults);
    setTwitterQueryParam(url, "pagination_token", input.paginationToken);
    return buildDmEventsResult(
      await twitterRequestJson(url.toString(), {
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async send_a_new_message_to_a_user(input, context) {
    const participantId = requireNonEmptyString(input.participantId, "participantId");
    const payload = await twitterRequestJson(
      `${twitterApiBaseUrl}/dm_conversations/with/${encodeURIComponent(participantId)}/messages`,
      {
        method: "POST",
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
        body: buildDmMessageBody(input),
      },
    );

    return buildDmMutationResult(payload);
  },

  async send_dm_to_conversation(input, context) {
    const dmConversationId = requireNonEmptyString(input.dmConversationId, "dmConversationId");
    const payload = await twitterRequestJson(
      `${twitterApiBaseUrl}/dm_conversations/${encodeURIComponent(dmConversationId)}/messages`,
      {
        method: "POST",
        accessToken: context.userAccessToken,
        fetcher: context.fetcher,
        body: buildDmMessageBody(input),
      },
    );

    return buildDmMutationResult(payload);
  },

  async create_dm_conversation(input, context) {
    const payload = await twitterRequestJson(`${twitterApiBaseUrl}/dm_conversations`, {
      method: "POST",
      accessToken: context.userAccessToken,
      fetcher: context.fetcher,
      body: buildCreateDmConversationBody(input),
    });

    return buildDmMutationResult(payload);
  },

  async delete_dm(input, context) {
    const eventId = requireNonEmptyString(input.eventId, "eventId");
    return executeBooleanMutation(input, context, {
      url: () => `${twitterApiBaseUrl}/dm_events/${encodeURIComponent(eventId)}`,
      method: "DELETE",
      responseKey: "deleted",
      outputKey: "deleted",
    });
  },

  async full_archive_search(input, context) {
    const appBearerToken = requireTwitterAppBearerToken(context);
    const url = new URL(`${twitterApiBaseUrl}/tweets/search/all`);
    appendTwitterArchiveSearchQuery(url, input);
    return buildPostsResult(
      await twitterRequestJson(url.toString(), {
        bearerToken: appBearerToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async search_full_archive_counts(input, context) {
    const appBearerToken = requireTwitterAppBearerToken(context);
    const url = new URL(`${twitterApiBaseUrl}/tweets/counts/all`);
    setTwitterQueryParam(url, "query", input.query);
    setTwitterQueryParam(url, "start_time", input.startTime);
    setTwitterQueryParam(url, "end_time", input.endTime);
    setTwitterQueryParam(url, "next_token", input.nextToken);
    setTwitterQueryParam(url, "granularity", input.granularity);

    const payload = await twitterRequestJson(url.toString(), {
      bearerToken: appBearerToken,
      fetcher: context.fetcher,
    });

    return {
      counts: Array.isArray(payload.data) ? payload.data.map(normalizeSearchCount) : [],
      ...(payload.meta ? { meta: payload.meta } : {}),
    };
  },

  async create_compliance_job(input, context) {
    const appBearerToken = requireTwitterAppBearerToken(context);
    const payload = await twitterRequestJson(`${twitterApiBaseUrl}/compliance/jobs`, {
      method: "POST",
      bearerToken: appBearerToken,
      fetcher: context.fetcher,
      body: JSON.stringify({
        type: requireNonEmptyString(input.type, "type"),
        ...(typeof input.name === "string" && input.name.trim() ? { name: input.name.trim() } : {}),
        ...(typeof input.resumable === "boolean" ? { resumable: input.resumable } : {}),
      }),
    });

    return buildSingleJobResult(payload);
  },

  async get_compliance_job(input, context) {
    const appBearerToken = requireTwitterAppBearerToken(context);
    const id = requireNonEmptyString(input.id, "id");
    const url = new URL(`${twitterApiBaseUrl}/compliance/jobs/${encodeURIComponent(id)}`);
    setTwitterArrayQueryParam(url, "compliance_job.fields", input.complianceJobFields);
    return buildSingleJobResult(
      await twitterRequestJson(url.toString(), {
        bearerToken: appBearerToken,
        fetcher: context.fetcher,
      }),
    );
  },

  async get_compliance_jobs(input, context) {
    const appBearerToken = requireTwitterAppBearerToken(context);
    const url = new URL(`${twitterApiBaseUrl}/compliance/jobs`);
    setTwitterQueryParam(url, "type", input.type);
    setTwitterQueryParam(url, "status", input.status);
    setTwitterArrayQueryParam(url, "compliance_job.fields", input.complianceJobFields);
    return buildJobsResult(
      await twitterRequestJson(url.toString(), {
        bearerToken: appBearerToken,
        fetcher: context.fetcher,
      }),
    );
  },
};

function twitterError(
  code: string,
  message: string,
  status?: number,
  _cause?: unknown,
  details?: unknown,
): ProviderRequestError {
  const resolvedStatus =
    status ??
    (code === "invalid_input" ? 400 : code === "credential_expired" ? 401 : code === "rate_limited" ? 429 : 502);
  return new ProviderRequestError(resolvedStatus, message, details);
}

async function twitterRequestJson(
  url: string,
  input: {
    accessToken?: string;
    bearerToken?: string;
    fetcher: ProviderFetch;
    method?: string;
    body?: BodyInit;
    contentType?: string | null;
    signal?: AbortSignal;
  },
) {
  const token = input.accessToken ?? input.bearerToken;
  if (!token) {
    throw twitterError("provider_error", "twitter request token is missing", 401);
  }

  const headers = new Headers({
    authorization: `Bearer ${token}`,
  });
  if (input.contentType !== null && input.body != null) {
    headers.set("content-type", input.contentType ?? "application/json");
  }

  const response = await input.fetcher(url, {
    method: input.method ?? "GET",
    headers,
    signal: input.signal,
    ...(input.body != null ? { body: input.body } : {}),
  });

  if (!response.ok) {
    throw await normalizeTwitterRuntimeError(response);
  }

  const responseText = await response.text();
  if (!responseText.trim()) {
    return {};
  }

  try {
    return JSON.parse(responseText) as Record<string, unknown>;
  } catch (error) {
    const details = error instanceof Error ? `: ${error.message}` : "";
    throw twitterError("provider_error", `twitter returned invalid JSON response${details}`, 502);
  }
}

function appendTwitterSearchQuery(url: URL, input: Record<string, unknown>) {
  setTwitterQueryParam(url, "query", input.query);
  setTwitterQueryParam(url, "start_time", input.startTime);
  setTwitterQueryParam(url, "end_time", input.endTime);
  setTwitterQueryParam(url, "since_id", input.sinceId);
  setTwitterQueryParam(url, "until_id", input.untilId);
  setTwitterQueryParam(url, "max_results", input.maxResults);
  setTwitterQueryParam(url, "next_token", input.nextToken);
  setTwitterQueryParam(url, "pagination_token", input.paginationToken);
  setTwitterQueryParam(url, "sort_order", input.sortOrder);
  appendTwitterTweetFields(url, input);
}

function appendTwitterArchiveSearchQuery(url: URL, input: Record<string, unknown>) {
  setTwitterQueryParam(url, "query", input.query);
  setTwitterQueryParam(url, "start_time", input.startTime);
  setTwitterQueryParam(url, "end_time", input.endTime);
  setTwitterQueryParam(url, "since_id", input.sinceId);
  setTwitterQueryParam(url, "until_id", input.untilId);
  setTwitterQueryParam(url, "max_results", input.maxResults);
  setTwitterQueryParam(url, "next_token", input.nextToken);
  setTwitterQueryParam(url, "sort_order", input.sortOrder);
  appendTwitterTweetFields(url, input);
}

function appendTwitterUserFields(url: URL, input: Record<string, unknown>) {
  setTwitterArrayQueryParam(url, "expansions", input.expansions);
  setTwitterArrayQueryParam(url, "user.fields", input.userFields);
  setTwitterArrayQueryParam(url, "tweet.fields", input.tweetFields);
}

function appendTwitterTweetFields(url: URL, input: Record<string, unknown>) {
  setTwitterArrayQueryParam(url, "expansions", input.expansions);
  setTwitterArrayQueryParam(url, "poll.fields", input.pollFields);
  setTwitterArrayQueryParam(url, "user.fields", input.userFields);
  setTwitterArrayQueryParam(url, "media.fields", input.mediaFields);
  setTwitterArrayQueryParam(url, "place.fields", input.placeFields);
  setTwitterArrayQueryParam(url, "tweet.fields", input.tweetFields);
}

function appendTwitterListFields(url: URL, input: Record<string, unknown>) {
  setTwitterArrayQueryParam(url, "expansions", input.expansions);
  setTwitterArrayQueryParam(url, "list.fields", input.listFields);
  setTwitterArrayQueryParam(url, "user.fields", input.userFields);
}

function appendTwitterSpaceFields(url: URL, input: Record<string, unknown>) {
  setTwitterArrayQueryParam(url, "expansions", input.expansions);
  setTwitterArrayQueryParam(url, "user.fields", input.userFields);
  setTwitterArrayQueryParam(url, "space.fields", input.spaceFields);
  setTwitterArrayQueryParam(url, "topic.fields", input.topicFields);
}

function appendTwitterDmFields(url: URL, input: Record<string, unknown>) {
  setTwitterArrayQueryParam(url, "expansions", input.expansions);
  setTwitterArrayQueryParam(url, "user.fields", input.userFields);
  setTwitterArrayQueryParam(url, "media.fields", input.mediaFields);
  setTwitterArrayQueryParam(url, "tweet.fields", input.tweetFields);
  setTwitterArrayQueryParam(url, "dm_event.fields", input.dmEventFields);
}

function requireTwitterAppBearerToken(context: TwitterActionContext): string {
  const appBearerToken = context.appBearerToken?.trim();
  if (!appBearerToken) {
    throw twitterError("provider_error", "twitter app bearer token is required", 401);
  }
  return appBearerToken;
}

function buildSingleUserResult(payload: Record<string, unknown>) {
  return {
    user: normalizeTwitterUser(payload.data),
    ...(payload.includes ? { includes: payload.includes } : {}),
  };
}

function buildUsersResult(payload: Record<string, unknown>) {
  return {
    users: Array.isArray(payload.data) ? payload.data.map(normalizeTwitterUser) : [],
    ...(payload.includes ? { includes: payload.includes } : {}),
    ...(payload.meta ? { meta: normalizeTwitterPaginationMeta(payload.meta) } : {}),
  };
}

function buildSinglePostResult(payload: Record<string, unknown>) {
  return {
    post: normalizeTwitterPost(payload.data),
    ...(payload.includes ? { includes: payload.includes } : {}),
  };
}

function buildPostsResult(payload: Record<string, unknown>) {
  return {
    posts: Array.isArray(payload.data) ? payload.data.map(normalizeTwitterPost) : [],
    ...(payload.includes ? { includes: payload.includes } : {}),
    ...(payload.meta ? { meta: normalizeTwitterPaginationMeta(payload.meta) } : {}),
  };
}

function buildSingleListResult(payload: Record<string, unknown>) {
  return {
    list: normalizeTwitterList(payload.data),
    ...(payload.includes ? { includes: payload.includes } : {}),
    raw: payload,
  };
}

function buildListsResult(payload: Record<string, unknown>) {
  return {
    lists: Array.isArray(payload.data) ? payload.data.map(normalizeTwitterList) : [],
    ...(payload.includes ? { includes: payload.includes } : {}),
    ...(payload.meta ? { meta: normalizeTwitterPaginationMeta(payload.meta) } : {}),
  };
}

function buildSingleSpaceResult(payload: Record<string, unknown>) {
  return {
    space: normalizeTwitterSpace(payload.data),
    ...(payload.includes ? { includes: payload.includes } : {}),
  };
}

function buildSpacesResult(payload: Record<string, unknown>) {
  return {
    spaces: Array.isArray(payload.data) ? payload.data.map(normalizeTwitterSpace) : [],
    ...(payload.includes ? { includes: payload.includes } : {}),
    ...(payload.meta ? { meta: normalizeTwitterPaginationMeta(payload.meta) } : {}),
  };
}

function buildSingleDmEventResult(payload: Record<string, unknown>) {
  return {
    event: normalizeTwitterDmEvent(payload.data),
    ...(payload.includes ? { includes: payload.includes } : {}),
  };
}

function buildDmEventsResult(payload: Record<string, unknown>) {
  return {
    events: Array.isArray(payload.data) ? payload.data.map(normalizeTwitterDmEvent) : [],
    ...(payload.includes ? { includes: payload.includes } : {}),
    ...(payload.meta ? { meta: normalizeTwitterPaginationMeta(payload.meta) } : {}),
  };
}

function buildSingleJobResult(payload: Record<string, unknown>) {
  return {
    job: normalizeTwitterComplianceJob(payload.data),
    raw: payload,
  };
}

function buildJobsResult(payload: Record<string, unknown>) {
  return {
    jobs: Array.isArray(payload.data) ? payload.data.map(normalizeTwitterComplianceJob) : [],
    ...(payload.meta ? { meta: payload.meta } : {}),
  };
}

function buildDmMutationResult(payload: Record<string, unknown>) {
  const data = asObject(payload.data);
  return {
    dmConversationId: String(data.dm_conversation_id ?? ""),
    dmEventId: String(data.dm_event_id ?? ""),
    raw: payload,
  };
}

async function executeBooleanMutation(
  _input: Record<string, unknown>,
  context: TwitterActionContext,
  config: {
    url: () => string;
    method: string;
    responseKey: string;
    outputKey: string;
    body?: BodyInit;
  },
) {
  const payload = await twitterRequestJson(config.url(), {
    method: config.method,
    accessToken: context.userAccessToken,
    fetcher: context.fetcher,
    ...(config.body != null ? { body: config.body } : {}),
  });

  return {
    [config.outputKey]: Boolean(asObject(payload.data)[config.responseKey]),
    raw: payload,
  };
}

async function normalizeTwitterRuntimeError(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    detail?: unknown;
    errors?: unknown;
    title?: unknown;
    error?: unknown;
    message?: unknown;
  } | null;
  const errorDetails = normalizeTwitterErrorDetails(payload?.errors);

  const message =
    (typeof payload?.detail === "string" && payload.detail) ||
    (typeof payload?.error === "string" && payload.error) ||
    (typeof payload?.message === "string" && payload.message) ||
    (typeof payload?.title === "string" && payload.title) ||
    `twitter request failed with status ${response.status}`;
  const detailedMessage = errorDetails ? `${message}: ${errorDetails}` : message;

  if (response.status === 401) {
    return twitterError("credential_expired", detailedMessage);
  }
  if (response.status === 403) {
    return twitterError(
      "scope_missing",
      `${detailedMessage}. Check that the Twitter OAuth grant includes these scopes: ${twitterRequiredAuthorizationScopes}.`,
      403,
    );
  }
  if (response.status === 429) {
    return twitterError("rate_limited", detailedMessage);
  }

  return twitterError("provider_error", detailedMessage);
}

function normalizeTwitterErrorDetails(errors: unknown) {
  if (!Array.isArray(errors)) {
    return "";
  }

  const details: string[] = [];
  for (const error of errors) {
    const record = asObject(error);
    const detail =
      normalizeOptionalString(record.detail) ||
      normalizeOptionalString(record.message) ||
      normalizeOptionalString(record.title);
    if (detail) {
      details.push(detail);
    }
  }

  return details.join("; ");
}

function normalizeTwitterUser(value: unknown) {
  const record = asObject(value);
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    username: String(record.username ?? ""),
    ...(record.description != null ? { description: nullableText(record.description) } : {}),
    ...(record.location != null ? { location: nullableText(record.location) } : {}),
    ...(record.url != null ? { url: nullableText(record.url) } : {}),
    ...(record.profile_image_url != null ? { profileImageUrl: nullableText(record.profile_image_url) } : {}),
    ...(record.profile_banner_url != null ? { profileBannerUrl: nullableText(record.profile_banner_url) } : {}),
    ...(record.created_at != null ? { createdAt: nullableText(record.created_at) } : {}),
    ...(typeof record.verified === "boolean" ? { verified: record.verified } : {}),
    ...(record.verified_type != null ? { verifiedType: nullableText(record.verified_type) } : {}),
    ...(typeof record.protected === "boolean" ? { protected: record.protected } : {}),
    ...(record.public_metrics != null ? { publicMetrics: asObject(record.public_metrics) } : {}),
    raw: record,
  };
}

function normalizeTwitterPost(value: unknown) {
  const record = asObject(value);
  return {
    id: String(record.id ?? ""),
    text: String(record.text ?? ""),
    ...(record.author_id != null ? { authorId: nullableText(record.author_id) } : {}),
    ...(record.created_at != null ? { createdAt: nullableText(record.created_at) } : {}),
    ...(record.lang != null ? { lang: nullableText(record.lang) } : {}),
    ...(record.public_metrics != null ? { publicMetrics: asObject(record.public_metrics) } : {}),
    raw: record,
  };
}

function normalizeTwitterPaginationMeta(value: unknown) {
  const record = asObject(value);
  return {
    resultCount: Number(record.result_count ?? 0),
    ...(record.next_token != null ? { nextToken: nullableText(record.next_token) } : {}),
    ...(record.previous_token != null ? { previousToken: nullableText(record.previous_token) } : {}),
    ...(record.newest_id != null ? { newestId: nullableText(record.newest_id) } : {}),
    ...(record.oldest_id != null ? { oldestId: nullableText(record.oldest_id) } : {}),
    raw: record,
  };
}

function normalizeSearchCount(value: unknown) {
  const record = asObject(value);
  return {
    start: String(record.start ?? ""),
    end: String(record.end ?? ""),
    tweetCount: Number(record.tweet_count ?? 0),
    raw: record,
  };
}

function normalizeTwitterList(value: unknown) {
  const record = asObject(value);
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    ...(record.description != null ? { description: nullableText(record.description) } : {}),
    ...(typeof record.private === "boolean" ? { private: record.private } : {}),
    ...(record.follower_count != null ? { followerCount: Number(record.follower_count) } : {}),
    ...(record.member_count != null ? { memberCount: Number(record.member_count) } : {}),
    ...(record.owner_id != null ? { ownerId: nullableText(record.owner_id) } : {}),
    ...(record.created_at != null ? { createdAt: nullableText(record.created_at) } : {}),
    raw: record,
  };
}

function normalizeTwitterSpace(value: unknown) {
  const record = asObject(value);
  return {
    id: String(record.id ?? ""),
    ...(record.title != null ? { title: nullableText(record.title) } : {}),
    ...(record.state != null ? { state: nullableText(record.state) } : {}),
    ...(record.creator_id != null ? { creatorId: nullableText(record.creator_id) } : {}),
    ...(Array.isArray(record.host_ids) ? { hostIds: record.host_ids.map(String) } : {}),
    ...(Array.isArray(record.speaker_ids) ? { speakerIds: record.speaker_ids.map(String) } : {}),
    ...(record.participant_count != null ? { participantCount: Number(record.participant_count) } : {}),
    ...(record.subscriber_count != null ? { subscriberCount: Number(record.subscriber_count) } : {}),
    ...(record.scheduled_start != null ? { scheduledStart: nullableText(record.scheduled_start) } : {}),
    ...(record.started_at != null ? { startedAt: nullableText(record.started_at) } : {}),
    ...(record.ended_at != null ? { endedAt: nullableText(record.ended_at) } : {}),
    ...(typeof record.is_ticketed === "boolean" ? { isTicketed: record.is_ticketed } : {}),
    ...(Array.isArray(record.topic_ids) ? { topicIds: record.topic_ids.map(String) } : {}),
    raw: record,
  };
}

function normalizeTwitterDmEvent(value: unknown) {
  const record = asObject(value);
  return {
    id: String(record.id ?? ""),
    ...(record.event_type != null
      ? { eventType: nullableText(record.event_type) }
      : record.type != null
        ? { eventType: nullableText(record.type) }
        : {}),
    ...(record.dm_conversation_id != null ? { dmConversationId: nullableText(record.dm_conversation_id) } : {}),
    ...(record.sender_id != null ? { senderId: nullableText(record.sender_id) } : {}),
    ...(record.text != null ? { text: nullableText(record.text) } : {}),
    ...(record.created_at != null
      ? { createdAt: nullableText(record.created_at) }
      : record.created_timestamp != null
        ? { createdAt: nullableText(record.created_timestamp) }
        : {}),
    ...(Array.isArray(record.participant_ids) ? { participantIds: record.participant_ids.map(String) } : {}),
    ...(record.attachments != null ? { attachments: asObject(record.attachments) } : {}),
    ...(record.referenced_tweets != null ? { referencedTweets: asObject(record.referenced_tweets) } : {}),
    raw: record,
  };
}

function normalizeTwitterComplianceJob(value: unknown) {
  const record = asObject(value);
  return {
    id: String(record.id ?? ""),
    type: String(record.type ?? ""),
    status: String(record.status ?? ""),
    ...(record.name != null ? { name: nullableText(record.name) } : {}),
    ...(typeof record.resumable === "boolean" ? { resumable: record.resumable } : {}),
    ...(record.created_at != null ? { createdAt: nullableText(record.created_at) } : {}),
    ...(record.upload_url != null ? { uploadUrl: nullableText(record.upload_url) } : {}),
    ...(record.download_url != null ? { downloadUrl: nullableText(record.download_url) } : {}),
    ...(record.upload_expires_at != null ? { uploadExpiresAt: nullableText(record.upload_expires_at) } : {}),
    ...(record.download_expires_at != null ? { downloadExpiresAt: nullableText(record.download_expires_at) } : {}),
    raw: record,
  };
}

function buildCreatePostBody(input: Record<string, unknown>) {
  const body: Record<string, unknown> = {};

  assignString(body, "text", input.text);
  assignString(body, "card_uri", input.cardUri);
  assignBoolean(body, "nullcast", input.nullcast);
  assignString(body, "quote_tweet_id", input.quoteTweetId);
  assignString(body, "reply_settings", input.replySettings);
  assignString(body, "direct_message_deep_link", input.directMessageDeepLink);
  assignBoolean(body, "for_super_followers_only", input.forSuperFollowersOnly);

  if (typeof input.geoPlaceId === "string" && input.geoPlaceId.trim()) {
    body.geo = {
      place_id: input.geoPlaceId.trim(),
    };
  }

  const mediaIds = normalizeStringArray(input.mediaMediaIds);
  const taggedUserIds = normalizeStringArray(input.mediaTaggedUserIds);
  if (mediaIds.length > 0 || taggedUserIds.length > 0) {
    body.media = {
      ...(mediaIds.length > 0 ? { media_ids: mediaIds } : {}),
      ...(taggedUserIds.length > 0 ? { tagged_user_ids: taggedUserIds } : {}),
    };
  }

  const pollOptions = normalizeStringArray(input.pollOptions);
  if (pollOptions.length > 0 || input.pollDurationMinutes != null || input.pollReplySettings != null) {
    body.poll = {
      ...(pollOptions.length > 0 ? { options: pollOptions } : {}),
      ...(typeof input.pollDurationMinutes === "number" ? { duration_minutes: input.pollDurationMinutes } : {}),
      ...(typeof input.pollReplySettings === "string" && input.pollReplySettings.trim()
        ? { reply_settings: input.pollReplySettings.trim() }
        : {}),
    };
  }

  if (
    (typeof input.replyInReplyToTweetId === "string" && input.replyInReplyToTweetId.trim()) ||
    Array.isArray(input.replyExcludeReplyUserIds)
  ) {
    body.reply = {
      ...(typeof input.replyInReplyToTweetId === "string" && input.replyInReplyToTweetId.trim()
        ? { in_reply_to_tweet_id: input.replyInReplyToTweetId.trim() }
        : {}),
      ...(normalizeStringArray(input.replyExcludeReplyUserIds).length > 0
        ? { exclude_reply_user_ids: normalizeStringArray(input.replyExcludeReplyUserIds) }
        : {}),
    };
  }

  return JSON.stringify(body);
}

function buildDmMessageBody(input: Record<string, unknown>) {
  const body: Record<string, unknown> = {};
  assignString(body, "text", input.text);

  const attachmentMediaIds = normalizeStringArray(input.attachmentMediaIds);
  if (attachmentMediaIds.length > 0) {
    body.attachments = attachmentMediaIds.map((mediaId) => ({
      media_id: mediaId,
    }));
  }

  return JSON.stringify(body);
}

function buildCreateDmConversationBody(input: Record<string, unknown>) {
  const body: Record<string, unknown> = {
    conversation_type: requireNonEmptyString(input.conversationType, "conversationType"),
    participant_ids: normalizeStringArray(input.participantIds),
    message: JSON.parse(buildDmMessageBody(input)),
  };

  return JSON.stringify(body);
}

function normalizeUsername(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return "";
  }

  let start = 0;
  while (start < text.length && text[start] === "@") {
    start += 1;
  }
  return text.slice(start).trim();
}

function normalizeUsernames(value: unknown) {
  return normalizeStringArray(value)
    .map((item) => normalizeUsername(item))
    .filter(Boolean);
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function setTwitterQueryParam(url: URL, key: string, value: unknown) {
  if (value == null) {
    return;
  }

  const text = String(value).trim();
  if (!text) {
    return;
  }

  url.searchParams.set(key, text);
}

function setTwitterArrayQueryParam(url: URL, key: string, value: unknown) {
  if (!Array.isArray(value)) {
    return;
  }

  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) {
    return;
  }

  url.searchParams.set(key, items.join(","));
}

function assignString(target: Record<string, unknown>, key: string, value: unknown) {
  if (typeof value === "string" && value.trim()) {
    target[key] = value.trim();
  }
}

function assignBoolean(target: Record<string, unknown>, key: string, value: unknown) {
  if (typeof value === "boolean") {
    target[key] = value;
  }
}

function requireNonEmptyString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw twitterError("invalid_input", `${fieldName} is required`, 400);
  }

  return value.trim();
}

function requirePositiveInteger(value: unknown, fieldName: string) {
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    throw twitterError("invalid_input", `${fieldName} must be a positive integer`, 400);
  }

  return value;
}

function readTwitterMediaChunkSize(value: unknown) {
  if (value == null) {
    return defaultTwitterMediaChunkSizeBytes;
  }

  const size = requirePositiveInteger(value, "chunkSizeBytes");
  if (size > maxTwitterMediaChunkSizeBytes) {
    throw twitterError(
      "invalid_input",
      `chunkSizeBytes must be less than or equal to ${maxTwitterMediaChunkSizeBytes}`,
      400,
    );
  }

  return size;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function asObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function nullableText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function decodeBase64(value: string) {
  return base64Bytes(value, "mediaBase64", (message) => twitterError("invalid_input", message, 400));
}

async function appendTwitterMediaUploadChunks(input: {
  accessToken: string;
  chunkSizeBytes: number;
  fetcher: ProviderFetch;
  mediaId: string;
  stream: ReadableStream<Uint8Array>;
}) {
  const reader = input.stream.getReader();
  let pending: TwitterMediaChunk = new Uint8Array(0);
  let segmentIndex = 0;
  let uploadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value || value.byteLength === 0) {
      continue;
    }

    pending = concatUint8Arrays(pending, normalizeTwitterMediaChunk(value));
    while (pending.byteLength >= input.chunkSizeBytes) {
      const chunk = pending.slice(0, input.chunkSizeBytes);
      pending = pending.slice(input.chunkSizeBytes);
      await appendTwitterMediaUploadChunk({ ...input, chunk, segmentIndex });
      segmentIndex += 1;
      uploadedBytes += chunk.byteLength;
    }
  }

  if (pending.byteLength > 0) {
    await appendTwitterMediaUploadChunk({ ...input, chunk: pending, segmentIndex });
    uploadedBytes += pending.byteLength;
  }

  return uploadedBytes;
}

async function appendTwitterMediaUploadChunk(input: {
  accessToken: string;
  chunk: TwitterMediaChunk;
  fetcher: ProviderFetch;
  mediaId: string;
  segmentIndex: number;
}) {
  if (input.segmentIndex >= maxTwitterMediaSegmentCount) {
    throw twitterError(
      "invalid_input",
      `media upload exceeded the X limit of ${maxTwitterMediaSegmentCount} chunks`,
      400,
    );
  }

  const formData = new FormData();
  formData.append("segment_index", String(input.segmentIndex));
  formData.append("media", new Blob([input.chunk]), "chunk");

  await twitterRequestJson(buildTwitterMediaUploadAppendUrl(input.mediaId), {
    method: "POST",
    accessToken: input.accessToken,
    fetcher: input.fetcher,
    body: formData,
    contentType: null,
  });
}

function concatUint8Arrays(first: TwitterMediaChunk, second: TwitterMediaChunk): TwitterMediaChunk {
  if (first.byteLength === 0) {
    return second;
  }
  if (second.byteLength === 0) {
    return first;
  }

  const combined = new Uint8Array(first.byteLength + second.byteLength);
  combined.set(first);
  combined.set(second, first.byteLength);
  return combined;
}

function normalizeTwitterMediaChunk(value: Uint8Array): TwitterMediaChunk {
  return value as TwitterMediaChunk;
}

function buildTwitterMediaUploadAppendUrl(mediaId: string) {
  return `${twitterMediaUploadUrl}/${encodeURIComponent(mediaId)}/append`;
}

function buildTwitterMediaUploadFinalizeUrl(mediaId: string) {
  return `${twitterMediaUploadUrl}/${encodeURIComponent(mediaId)}/finalize`;
}

function normalizeTwitterMediaUploadResult(
  payload: Record<string, unknown>,
  fallbackState: "pending" | "in_progress" | "succeeded" | "failed",
  fallbacks: {
    fallbackExpiresAfterSecs?: unknown;
    fallbackMediaId?: unknown;
    fallbackMediaKey?: unknown;
    fallbackSize?: unknown;
  } = {},
) {
  const data = asObject(payload.data ?? payload);
  const processingInfo = asObject(data.processing_info);
  const result: Record<string, unknown> = {
    mediaId: String(data.id ?? data.media_id ?? fallbacks.fallbackMediaId ?? ""),
    state: normalizeTwitterMediaProcessingState(processingInfo.state, fallbackState),
    raw: payload,
  };

  assignNumber(result, "expiresAfterSecs", data.expires_after_secs ?? fallbacks.fallbackExpiresAfterSecs);
  assignNumber(result, "size", data.size ?? fallbacks.fallbackSize);
  assignNumber(result, "progressPercent", processingInfo.progress_percent);
  assignNumber(result, "checkAfterSecs", processingInfo.check_after_secs);

  const mediaKey = data.media_key ?? fallbacks.fallbackMediaKey;
  if (typeof mediaKey === "string" && mediaKey.trim()) {
    result.mediaKey = mediaKey.trim();
  }
  if (Object.keys(processingInfo).length > 0) {
    result.processingInfo = processingInfo;
  }

  return result;
}

function normalizeTwitterMediaProcessingState(
  value: unknown,
  fallback: "pending" | "in_progress" | "succeeded" | "failed",
) {
  if (value === "pending" || value === "in_progress" || value === "succeeded" || value === "failed") {
    return value;
  }
  if (value === "success" || value === "complete" || value === "completed") {
    return "succeeded";
  }
  if (value === "error") {
    return "failed";
  }

  return fallback;
}

function assignNumber(target: Record<string, unknown>, key: string, value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    target[key] = value;
  }
}
