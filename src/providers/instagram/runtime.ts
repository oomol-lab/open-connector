import type { CredentialValidationResult, ResolvedCredential } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalObjectArray,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredRawString,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  setSearchParams,
} from "../provider-runtime.ts";

const instagramApiBaseUrl = "https://graph.instagram.com";
const instagramApiVersion = "v25.0";

const currentUserFields =
  "id,user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count";
const mediaFields =
  "id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp,username,comments_count,like_count,children{id,media_type,media_url,permalink,thumbnail_url,timestamp}";
const commentFields = "id,text,timestamp,username,from{id,username},parent_id";
const pollIntervalMs = 60_000;
const maxPollWaits = 5;
const maxPollDurationMs = maxPollWaits * pollIntervalMs;
const instagramErrorTextMaxLength = 2000;
const instagramRateLimitErrorCodes = new Set([4, 17, 32, 613]);
const professionalAccountRequiredMessage = "Instagram connections require a Business or Creator professional account.";

type OAuthCredential = Extract<ResolvedCredential, { authType: "oauth2" }>;
type InstagramActionHandler = (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>;
interface InstagramRequest {
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | undefined>;
  form?: Record<string, string | undefined>;
  json?: Record<string, unknown>;
  timeoutMs?: number;
}

interface InstagramPaging {
  before?: string;
  after?: string;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

interface ContainerStatus {
  statusCode: string;
  publishedMediaId?: string;
}

interface CarouselChildContainer {
  kind: "image" | "video";
  form: Record<string, string | undefined>;
}

interface ContainerRecoveryDetails {
  containerRole: "publishable" | "carousel_child";
  resumable: boolean;
}

interface InstagramPublishingContext {
  context: OAuthProviderContext;
  deadline: number;
}

/** Build the complete Instagram handler map. */
function createInstagramActionHandlers(): ProviderActionHandlers<"instagram", InstagramActionHandler> {
  return {
    get_current_user(_input, context) {
      return getCurrentUser(context);
    },
    list_media: listMedia,
    get_media: getMedia,
    list_media_comments: listMediaComments,
    get_media_insights: getMediaInsights,
    publish_media(input, context) {
      return publishMedia(input, {
        context,
        deadline: Date.now() + maxPollDurationMs,
      });
    },
    create_comment: createComment,
    reply_to_comment: replyToComment,
    send_message: sendMessage,
  };
}

export const instagramActionHandlers: ProviderActionHandlers<"instagram", InstagramActionHandler> =
  createInstagramActionHandlers();

/** Verify an OAuth token and normalize the connected professional account profile. */
export async function validateInstagramCredential(
  credential: OAuthCredential,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: OAuthProviderContext = {
    accessToken: credential.accessToken,
    tokenType: credential.tokenType,
    accountId: credential.profile.accountId,
    fetcher,
    signal,
  };
  const payload = await instagramRequestJson({ path: "/me", query: { fields: currentUserFields } }, context);
  const rawUser = unwrapDirectOrFirstDataItem(payload);
  const user = normalizeCurrentUser(rawUser);
  assertProfessionalAccount(user);

  const accountId = optionalString(user.userId) ?? requiredString(user.id, "Instagram account ID", providerInputError);
  const displayName = optionalString(user.username) ?? optionalString(user.name) ?? accountId;
  const grantedScopes = parsePermissions(credential.metadata.permissions);
  return {
    profile: { accountId, displayName, grantedScopes },
    grantedScopes,
  };
}

async function getCurrentUser(context: OAuthProviderContext): Promise<Record<string, unknown>> {
  const payload = await instagramRequestJson({ path: "/me", query: { fields: currentUserFields } }, context);
  const user = normalizeCurrentUser(unwrapDirectOrFirstDataItem(payload));
  assertProfessionalAccount(user);
  return { user };
}

async function listMedia(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<Record<string, unknown>> {
  assertExclusiveCursors(input);
  const payload = requiredRecord(
    await instagramRequestJson(
      {
        path: `/${encodePathSegment(requireInstagramAccountId(context))}/media`,
        query: {
          fields: mediaFields,
          after: optionalString(input.after),
          before: optionalString(input.before),
          limit: stringifyInteger(input.limit),
        },
      },
      context,
    ),
    "Instagram media response",
    providerResponseError,
  );
  return {
    media: objectArray(payload.data, "Instagram media", providerResponseError).map(normalizeMedia),
    paging: normalizePaging(payload.paging),
  };
}

async function getMedia(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<Record<string, unknown>> {
  const mediaId = requiredString(input.mediaId, "mediaId", providerInputError);
  const payload = await instagramRequestJson(
    { path: `/${encodePathSegment(mediaId)}`, query: { fields: mediaFields } },
    context,
  );
  return { media: normalizeMedia(requiredRecord(payload, "Instagram media", providerResponseError)) };
}

async function listMediaComments(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<Record<string, unknown>> {
  assertExclusiveCursors(input);
  const mediaId = requiredString(input.mediaId, "mediaId", providerInputError);
  const payload = requiredRecord(
    await instagramRequestJson(
      {
        path: `/${encodePathSegment(mediaId)}/comments`,
        query: {
          fields: commentFields,
          after: optionalString(input.after),
          before: optionalString(input.before),
          limit: stringifyInteger(input.limit),
        },
      },
      context,
    ),
    "Instagram comments response",
    providerResponseError,
  );
  return {
    comments: objectArray(payload.data, "Instagram comments", providerResponseError).map(normalizeComment),
    paging: normalizePaging(payload.paging),
  };
}

async function getMediaInsights(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<Record<string, unknown>> {
  const mediaId = requiredString(input.mediaId, "mediaId", providerInputError);
  const metrics = requiredStringArray(input.metrics, "metrics", providerInputError);
  if (metrics.length === 0) throw providerInputError("metrics must contain at least one item");
  const payload = requiredRecord(
    await instagramRequestJson(
      {
        path: `/${encodePathSegment(mediaId)}/insights`,
        query: {
          metric: metrics.join(","),
          period: optionalString(input.period),
          breakdown: optionalString(input.breakdown),
        },
      },
      context,
    ),
    "Instagram insights response",
    providerResponseError,
  );
  return {
    insights: objectArray(payload.data, "Instagram insights", providerResponseError).map(normalizeInsight),
    paging: normalizePaging(payload.paging),
  };
}

async function publishMedia(
  input: Record<string, unknown>,
  publishing: InstagramPublishingContext,
): Promise<Record<string, unknown>> {
  const { context } = publishing;
  const kind = requiredString(input.kind, "kind", providerInputError);
  const accountId = requireInstagramAccountId(context);
  let containerId: string;

  if (kind === "container") {
    containerId = requiredString(input.containerId, "containerId", providerInputError);
  } else if (kind === "carousel") {
    containerId = await createCarouselContainer(input, accountId, publishing);
  } else {
    containerId = await createSingleContainer(input, kind, accountId, context);
  }

  const containerStatus = await waitForContainer(containerId, publishing);
  const publishedMediaId = containerStatus.publishedMediaId;
  const mediaId = publishedMediaId ?? (await publishContainer(accountId, containerId, context));
  const result: Record<string, unknown> = {
    mediaId,
    containerId,
    status: "PUBLISHED",
  };
  try {
    const media = (await getMedia({ mediaId }, context)).media as Record<string, unknown>;
    return {
      ...result,
      ...compactObject({
        permalink: media.permalink,
        mediaType: media.mediaType,
        mediaProductType: media.mediaProductType,
      }),
    };
  } catch {
    return result;
  }
}

async function createSingleContainer(
  input: Record<string, unknown>,
  kind: string,
  accountId: string,
  context: OAuthProviderContext,
): Promise<string> {
  const form: Record<string, string | undefined> = {
    caption: optionalRawString(input.caption),
  };
  if (kind === "image") {
    form.image_url = validatePublishingUrl(input.imageUrl, "imageUrl");
    form.alt_text = optionalRawString(input.altText);
  } else if (kind === "video" || kind === "reel") {
    form.video_url = validatePublishingUrl(input.videoUrl, "videoUrl");
    form.media_type = kind === "reel" ? "REELS" : "VIDEO";
    form.cover_url = validateOptionalPublishingUrl(input.coverUrl, "coverUrl");
    form.thumb_offset = stringifyInteger(input.thumbOffsetMilliseconds);
    if (kind === "reel" && optionalBoolean(input.shareToFeed) !== undefined) {
      form.share_to_feed = optionalBoolean(input.shareToFeed) ? "true" : "false";
    }
  } else {
    throw providerInputError("kind must be image, video, reel, carousel, or container");
  }
  return createContainer(accountId, form, context);
}

async function createCarouselContainer(
  input: Record<string, unknown>,
  accountId: string,
  publishing: InstagramPublishingContext,
): Promise<string> {
  const { context } = publishing;
  const children = objectArray(input.children, "children", providerInputError);
  if (children.length < 2 || children.length > 10) {
    throw providerInputError("children must contain between 2 and 10 items");
  }

  const preparedChildren: CarouselChildContainer[] = children.map((child, index) => {
    const kind = requiredString(child.kind, `children[${index}].kind`, providerInputError);
    const form: Record<string, string | undefined> = { is_carousel_item: "true" };
    if (kind === "image") {
      form.image_url = validatePublishingUrl(child.imageUrl, `children[${index}].imageUrl`);
      form.alt_text = optionalRawString(child.altText);
      return { kind: "image", form };
    } else if (kind === "video") {
      form.video_url = validatePublishingUrl(child.videoUrl, `children[${index}].videoUrl`);
      form.media_type = "VIDEO";
      return { kind: "video", form };
    } else {
      throw providerInputError(`children[${index}].kind must be image or video`);
    }
  });

  const childIds: string[] = [];
  const videoChildIds: string[] = [];
  for (const child of preparedChildren) {
    const childId = await createContainer(accountId, child.form, context);
    childIds.push(childId);
    if (child.kind === "video") {
      videoChildIds.push(childId);
    }
  }
  const videoStatuses = await Promise.allSettled(
    videoChildIds.map((childId) =>
      waitForContainer(childId, publishing, {
        containerRole: "carousel_child",
        resumable: false,
      }),
    ),
  );
  const failedVideo = videoStatuses.find((status): status is PromiseRejectedResult => status.status === "rejected");
  if (failedVideo) throw failedVideo.reason;

  return createContainer(
    accountId,
    {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption: optionalRawString(input.caption),
    },
    context,
  );
}

async function createContainer(
  accountId: string,
  form: Record<string, string | undefined>,
  context: OAuthProviderContext,
): Promise<string> {
  const payload = requiredRecord(
    await instagramRequestJson({ path: `/${encodePathSegment(accountId)}/media`, method: "POST", form }, context),
    "Instagram container response",
    providerResponseError,
  );
  return requiredString(payload.id, "Instagram container ID", providerResponseError);
}

async function waitForContainer(
  containerId: string,
  publishing: InstagramPublishingContext,
  recovery: ContainerRecoveryDetails = { containerRole: "publishable", resumable: true },
): Promise<ContainerStatus> {
  try {
    return await pollContainer(containerId, publishing);
  } catch (error) {
    throw withContainerId(error, containerId, recovery);
  }
}

async function pollContainer(containerId: string, publishing: InstagramPublishingContext): Promise<ContainerStatus> {
  const { context, deadline } = publishing;
  const startedAt = Date.now();
  let lastStatus = "IN_PROGRESS";
  for (let pollIndex = 0; pollIndex <= maxPollWaits; pollIndex += 1) {
    if (pollIndex > 0) {
      const delay = Math.min(startedAt + pollIndex * pollIntervalMs, deadline) - Date.now();
      if (delay > 0) await sleepWithSignal(delay, context.signal);
    }
    if (pollIndex > 0 && Date.now() > deadline) break;
    const statusResponse = await instagramRequestJson(
      {
        path: `/${encodePathSegment(containerId)}`,
        query: { fields: "id,status_code,status" },
        timeoutMs: Math.max(1, deadline - Date.now()),
      },
      context,
    );
    const payload = requiredRecord(statusResponse, "Instagram container status response", providerResponseError);
    const statusCode = optionalString(payload.status_code) ?? optionalString(payload.status) ?? "IN_PROGRESS";
    lastStatus = statusCode;
    if (statusCode === "FINISHED") return { statusCode };
    if (statusCode === "PUBLISHED") {
      const publishedMediaId = optionalString(payload.media_id);
      if (publishedMediaId) return { statusCode, publishedMediaId };
      throw new ProviderRequestError(
        502,
        "Instagram reports that this container is published but does not expose the final media ID.",
        { containerId, statusCode, resumable: false },
      );
    }
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new ProviderRequestError(
        400,
        optionalString(payload.status) ?? `Instagram media container ended with ${statusCode}.`,
        { containerId, statusCode },
      );
    }
    if (Date.now() >= deadline) break;
  }
  throw new ProviderRequestError(
    504,
    "Instagram media container did not finish within five minutes. Check the recovery details before retrying.",
    { containerId, statusCode: lastStatus },
  );
}

async function publishContainer(
  accountId: string,
  containerId: string,
  context: OAuthProviderContext,
): Promise<string> {
  try {
    const response = await instagramRequestJson(
      {
        path: `/${encodePathSegment(accountId)}/media_publish`,
        method: "POST",
        query: { creation_id: containerId },
      },
      context,
    );
    const payload = requiredRecord(response, "Instagram publish response", providerResponseError);
    return requiredString(payload.id, "Published Instagram media ID", providerResponseError);
  } catch (error) {
    throw withContainerId(error, containerId, { containerRole: "publishable", resumable: false });
  }
}

function withContainerId(
  error: unknown,
  containerId: string,
  recovery: ContainerRecoveryDetails,
): ProviderRequestError {
  if (!(error instanceof ProviderRequestError)) throw error;
  return new ProviderRequestError(
    error.status,
    error.message,
    { containerId, ...recovery, ...(optionalRecord(error.details) ?? {}) },
    error.code,
  );
}

async function createComment(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<Record<string, unknown>> {
  const mediaId = requiredString(input.mediaId, "mediaId", providerInputError);
  const message = requiredUserText(input.message, "message");
  const payload = requiredRecord(
    await instagramRequestJson(
      { path: `/${encodePathSegment(mediaId)}/comments`, method: "POST", form: { message } },
      context,
    ),
    "Instagram comment response",
    providerResponseError,
  );
  return { commentId: requiredString(payload.id, "Instagram comment ID", providerResponseError), mediaId };
}

async function replyToComment(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<Record<string, unknown>> {
  const parentCommentId = requiredString(input.commentId, "commentId", providerInputError);
  const message = requiredUserText(input.message, "message");
  const payload = requiredRecord(
    await instagramRequestJson(
      { path: `/${encodePathSegment(parentCommentId)}/replies`, method: "POST", form: { message } },
      context,
    ),
    "Instagram comment reply response",
    providerResponseError,
  );
  return {
    commentId: requiredString(payload.id, "Instagram reply ID", providerResponseError),
    parentCommentId,
  };
}

async function sendMessage(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<Record<string, unknown>> {
  const recipientId = requiredString(input.recipientId, "recipientId", providerInputError);
  const text = requiredUserText(input.text, "text");
  if (new TextEncoder().encode(text).byteLength > 1000) {
    throw providerInputError("text must be at most 1,000 bytes when encoded as UTF-8");
  }
  const payload = requiredRecord(
    await instagramRequestJson(
      {
        path: `/${encodePathSegment(requireInstagramAccountId(context))}/messages`,
        method: "POST",
        json: { recipient: { id: recipientId }, message: { text } },
      },
      context,
    ),
    "Instagram message response",
    providerResponseError,
  );
  return compactObject({
    recipientId: optionalString(payload.recipient_id) ?? recipientId,
    messageId: requiredString(payload.message_id, "Instagram message ID", providerResponseError),
    threadId: optionalString(payload.thread_id) ?? optionalString(payload.conversation_id),
  });
}

async function instagramRequestJson(request: InstagramRequest, context: OAuthProviderContext): Promise<unknown> {
  const url = new URL(`/${instagramApiVersion}${request.path}`, instagramApiBaseUrl);
  setSearchParams(url, request.query ?? {});
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${context.accessToken}`,
    "user-agent": providerUserAgent,
  };
  let body: BodyInit | undefined;
  if (request.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(
      Object.fromEntries(
        Object.entries(request.form).filter((entry): entry is [string, string] => entry[1] !== undefined),
      ),
    );
  } else if (request.json) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(request.json);
  }

  let response: Response;
  const requestTimeout = createProviderTimeout(context.signal);
  const deadlineTimeout =
    request.timeoutMs === undefined ? undefined : createProviderTimeout(requestTimeout.signal, request.timeoutMs);
  const requestSignal = deadlineTimeout?.signal ?? requestTimeout.signal;
  try {
    try {
      response = await context.fetcher(url, {
        method: request.method ?? "GET",
        headers,
        body,
        signal: requestSignal,
      });
    } catch (error) {
      if (isAbortSignalError(context.signal, error)) {
        throw new ProviderRequestError(499, "Instagram request was cancelled.");
      }
      if (requestTimeout.didTimeout() || deadlineTimeout?.didTimeout()) {
        throw new ProviderRequestError(504, "Instagram request timed out.");
      }
      if (error instanceof ProviderRequestError) throw error;
      throw new ProviderRequestError(502, "Instagram request failed without an HTTP response.");
    }

    let payload: unknown;
    try {
      payload = await readProviderJsonBody(response, {
        emptyBody: {},
        invalidJsonMessage: "Instagram returned an invalid JSON response.",
      });
    } catch (error) {
      if (requestTimeout.didTimeout() || deadlineTimeout?.didTimeout()) {
        throw new ProviderRequestError(504, "Instagram request timed out.");
      }
      if (!response.ok) throw createInstagramError(response.status, undefined, context.accessToken);
      throw error;
    }
    const error = optionalRecord(optionalRecord(payload)?.error);
    if (!response.ok || error) {
      throw createInstagramError(response.status, error, context.accessToken);
    }
    return payload;
  } finally {
    deadlineTimeout?.cleanup();
    requestTimeout.cleanup();
  }
}

function createInstagramError(
  status: number,
  error: Record<string, unknown> | undefined,
  accessToken: string,
): ProviderRequestError {
  const code = optionalInteger(error?.code);
  const rateLimited = status === 429 || (code !== undefined && instagramRateLimitErrorCodes.has(code));
  const details = compactObject({
    type: safeInstagramErrorText(error?.type, accessToken),
    code,
    errorSubcode: optionalInteger(error?.error_subcode),
    isTransient: optionalBoolean(error?.is_transient),
    userTitle: safeInstagramErrorText(error?.error_user_title, accessToken),
    userMessage: safeInstagramErrorText(error?.error_user_msg, accessToken),
    traceId: safeInstagramErrorText(error?.fbtrace_id, accessToken),
  });
  return new ProviderRequestError(
    rateLimited ? 429 : status || 500,
    safeInstagramErrorText(error?.message, accessToken) ?? `Instagram request failed with HTTP ${status}.`,
    details,
    rateLimited ? "rate_limited" : undefined,
  );
}

function safeInstagramErrorText(value: unknown, accessToken: string): string | undefined {
  const text = optionalString(value);
  return text && !text.includes(accessToken) ? text.slice(0, instagramErrorTextMaxLength) : undefined;
}

function normalizeCurrentUser(payload: Record<string, unknown>): Record<string, unknown> {
  const id = requiredString(payload.id, "Instagram account ID", providerResponseError);
  const username = optionalString(payload.username) ?? optionalString(payload.name) ?? id;
  return compactObject({
    id,
    userId: optionalString(payload.user_id),
    username,
    name: optionalString(payload.name),
    accountType: normalizeAccountType(payload.account_type),
    profilePictureUrl: optionalString(payload.profile_picture_url),
    followersCount: optionalInteger(payload.followers_count),
    followsCount: optionalInteger(payload.follows_count),
    mediaCount: optionalInteger(payload.media_count),
  });
}

function normalizeMedia(payload: Record<string, unknown>): Record<string, unknown> {
  const mediaType = requiredString(payload.media_type, "Instagram media type", providerResponseError).toUpperCase();
  if (mediaType !== "IMAGE" && mediaType !== "VIDEO" && mediaType !== "CAROUSEL_ALBUM") {
    throw providerResponseError(`Unsupported Instagram media type: ${mediaType}`);
  }
  return compactObject({
    id: requiredString(payload.id, "Instagram media ID", providerResponseError),
    mediaType,
    caption: optionalString(payload.caption),
    mediaProductType: optionalString(payload.media_product_type)?.toUpperCase(),
    mediaUrl: optionalString(payload.media_url),
    permalink: optionalString(payload.permalink),
    thumbnailUrl: optionalString(payload.thumbnail_url),
    timestamp: optionalString(payload.timestamp),
    username: optionalString(payload.username),
    commentsCount: optionalInteger(payload.comments_count),
    likeCount: optionalInteger(payload.like_count),
    children: normalizeMediaChildren(payload.children),
  });
}

function normalizeMediaChildren(value: unknown): Record<string, unknown>[] | undefined {
  const wrapper = optionalRecord(value);
  if (!wrapper) return undefined;
  const children = optionalObjectArray(wrapper.data, "Instagram carousel child", providerResponseError);
  return children.map((child) => {
    const mediaType = requiredString(
      child.media_type,
      "Instagram child media type",
      providerResponseError,
    ).toUpperCase();
    if (mediaType !== "IMAGE" && mediaType !== "VIDEO") {
      throw providerResponseError(`Unsupported Instagram child media type: ${mediaType}`);
    }
    return compactObject({
      id: requiredString(child.id, "Instagram child media ID", providerResponseError),
      mediaType,
      mediaUrl: optionalString(child.media_url),
      permalink: optionalString(child.permalink),
      thumbnailUrl: optionalString(child.thumbnail_url),
      timestamp: optionalString(child.timestamp),
    });
  });
}

function normalizeComment(payload: Record<string, unknown>): Record<string, unknown> {
  const from = optionalRecord(payload.from);
  return compactObject({
    id: requiredString(payload.id, "Instagram comment ID", providerResponseError),
    text: optionalRawString(payload.text) ?? "",
    timestamp: optionalString(payload.timestamp),
    username: optionalString(payload.username),
    from: from ? compactObject({ id: optionalString(from.id), username: optionalString(from.username) }) : undefined,
    parentId: optionalString(payload.parent_id),
  });
}

function normalizeInsight(payload: Record<string, unknown>): Record<string, unknown> {
  const values =
    payload.values === undefined
      ? undefined
      : objectArray(payload.values, "Instagram insight values", providerResponseError);
  return compactObject({
    id: optionalString(payload.id),
    name: requiredString(payload.name, "Instagram insight name", providerResponseError),
    period: optionalString(payload.period),
    title: optionalString(payload.title),
    description: optionalString(payload.description),
    values,
    totalValue: optionalRecord(payload.total_value),
  });
}

function normalizePaging(value: unknown): InstagramPaging {
  const paging = optionalRecord(value);
  const cursors = optionalRecord(paging?.cursors);
  return compactObject({
    before: optionalString(cursors?.before),
    after: optionalString(cursors?.after),
    hasPreviousPage: optionalString(paging?.previous) !== undefined,
    hasNextPage: optionalString(paging?.next) !== undefined,
  }) as InstagramPaging;
}

function unwrapDirectOrFirstDataItem(value: unknown): Record<string, unknown> {
  const payload = requiredRecord(value, "Instagram current-user response", providerResponseError);
  if (!Array.isArray(payload.data)) return payload;
  return requiredRecord(payload.data[0], "Instagram current-user response data[0]", providerResponseError);
}

function requireInstagramAccountId(context: OAuthProviderContext): string {
  return requiredString(context.accountId, "connected Instagram account ID", providerResponseError);
}

function parsePermissions(value: unknown): string[] {
  const permissions = optionalString(value);
  return permissions
    ? [
        ...new Set(
          permissions
            .split(",")
            .map((scope) => scope.trim())
            .filter(Boolean),
        ),
      ]
    : [];
}

function normalizeAccountType(value: unknown): string | undefined {
  const type = optionalString(value)?.toUpperCase();
  if (type === "BUSINESS") return "Business";
  if (type === "MEDIA_CREATOR") return "Media_Creator";
  return optionalString(value);
}

function assertProfessionalAccount(user: Record<string, unknown>): void {
  const accountType = optionalString(user.accountType);
  if (accountType && !isProfessionalAccountType(accountType)) {
    throw new ProviderRequestError(400, professionalAccountRequiredMessage, { accountType });
  }
}

function isProfessionalAccountType(value: string): boolean {
  return value === "Business" || value === "Media_Creator";
}

function assertExclusiveCursors(input: Record<string, unknown>): void {
  if (optionalString(input.after) && optionalString(input.before)) {
    throw providerInputError("after and before are mutually exclusive");
  }
}

function validatePublishingUrl(value: unknown, fieldName: string): string {
  const text = requiredString(value, fieldName, providerInputError);
  return assertPublicHttpUrl(text, { fieldName, createError: providerInputError }).toString();
}

function validateOptionalPublishingUrl(value: unknown, fieldName: string): string | undefined {
  const text = optionalString(value);
  return text ? assertPublicHttpUrl(text, { fieldName, createError: providerInputError }).toString() : undefined;
}

function requiredUserText(value: unknown, fieldName: string): string {
  const text = requiredRawString(value, fieldName, providerInputError);
  if (!/\S/.test(text)) throw providerInputError(`${fieldName} must contain non-whitespace text`);
  return text;
}

function stringifyInteger(value: unknown): string | undefined {
  const number = optionalInteger(value);
  return number === undefined ? undefined : String(number);
}

async function sleepWithSignal(milliseconds: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ProviderRequestError(499, "Instagram request was cancelled."));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(new ProviderRequestError(499, "Instagram request was cancelled."));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
