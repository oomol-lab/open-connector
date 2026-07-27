import type { AsanaActionHandler } from "./runtime.ts";

import {
  compactObject,
  nullableString,
  optionalBoolean,
  optionalRawString,
  optionalString,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import {
  asanaInvalidInputError,
  asanaPathGid,
  buildAsanaFieldsQuery,
  buildAsanaPaginationQuery,
  deleteAsanaResource,
  getAsanaResource,
  listAsanaResources,
  requireNonEmptyAsanaBody,
  writeAsanaResource,
} from "./runtime.ts";
import { storyStickerNames } from "./schemas.ts";

const defaultStoryFields = [
  "created_at",
  "created_by",
  "created_by.name",
  "resource_subtype",
  "text",
  "html_text",
  "is_pinned",
  "sticker_name",
  "type",
  "is_editable",
  "is_edited",
  "liked",
  "likes",
  "likes.user",
  "likes.user.name",
  "num_likes",
  "reaction_summary",
  "target",
  "target.name",
];
const defaultTagFields = [
  "name",
  "color",
  "notes",
  "created_at",
  "followers",
  "followers.name",
  "workspace",
  "workspace.name",
  "permalink_url",
];

export const storyTagActionHandlers: Record<string, AsanaActionHandler> = {
  get_story(input, context) {
    return getAsanaResource(
      `/stories/${asanaPathGid(input.storyId, "storyId")}`,
      buildAsanaFieldsQuery(input, defaultStoryFields),
      "story",
      context,
    );
  },

  list_task_stories(input, context) {
    return listAsanaResources(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/stories`,
      buildAsanaPaginationQuery(input, defaultStoryFields),
      "stories",
      context,
    );
  },

  create_task_story(input, context) {
    return writeAsanaResource(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/stories`,
      buildStoryBody(input, true),
      "story",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultStoryFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  update_story(input, context) {
    return writeAsanaResource(
      `/stories/${asanaPathGid(input.storyId, "storyId")}`,
      buildStoryBody(input, false),
      "story",
      context,
      {
        method: "PUT",
        query: buildAsanaFieldsQuery(input, defaultStoryFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  delete_story(input, context) {
    return deleteAsanaResource(`/stories/${asanaPathGid(input.storyId, "storyId")}`, context, true);
  },

  list_tags(input, context) {
    return listAsanaResources(
      "/tags",
      {
        workspace: optionalString(input.workspaceId),
        ...buildAsanaPaginationQuery(input, defaultTagFields),
      },
      "tags",
      context,
    );
  },

  create_tag(input, context) {
    return writeAsanaResource("/tags", buildTagCreateBody(input, true), "tag", context, {
      method: "POST",
      query: buildAsanaFieldsQuery(input, defaultTagFields),
    });
  },

  get_tag(input, context) {
    return getAsanaResource(
      `/tags/${asanaPathGid(input.tagId, "tagId")}`,
      buildAsanaFieldsQuery(input, defaultTagFields),
      "tag",
      context,
    );
  },

  update_tag(input, context) {
    return writeAsanaResource(
      `/tags/${asanaPathGid(input.tagId, "tagId")}`,
      buildTagUpdateBody(input),
      "tag",
      context,
      {
        method: "PUT",
        query: buildAsanaFieldsQuery(input, defaultTagFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  delete_tag(input, context) {
    return deleteAsanaResource(`/tags/${asanaPathGid(input.tagId, "tagId")}`, context, true);
  },

  list_workspace_tags(input, context) {
    return listAsanaResources(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/tags`,
      buildAsanaPaginationQuery(input, defaultTagFields),
      "tags",
      context,
    );
  },

  create_workspace_tag(input, context) {
    return writeAsanaResource(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/tags`,
      buildTagCreateBody(input, false),
      "tag",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultTagFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  list_task_tags(input, context) {
    return listAsanaResources(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/tags`,
      buildAsanaPaginationQuery(input, defaultTagFields),
      "tags",
      context,
    );
  },
};

function buildStoryBody(input: Record<string, unknown>, requireText: boolean): Record<string, unknown> {
  const hasText = Object.hasOwn(input, "text");
  const hasHtmlText = Object.hasOwn(input, "htmlText");
  if (hasText && hasHtmlText) {
    throw asanaInvalidInputError("text and htmlText cannot both be provided.");
  }
  if (requireText && !hasText && !hasHtmlText) {
    throw asanaInvalidInputError("Exactly one of text or htmlText must be provided.");
  }
  if (hasText && typeof input.text !== "string") {
    throw asanaInvalidInputError("text must be a string.");
  }
  if (hasHtmlText && typeof input.htmlText !== "string") {
    throw asanaInvalidInputError("htmlText must be a string.");
  }
  if (Object.hasOwn(input, "isPinned") && typeof input.isPinned !== "boolean") {
    throw asanaInvalidInputError("isPinned must be a boolean.");
  }
  if (!requireText && Object.hasOwn(input, "stickerName")) {
    throw asanaInvalidInputError("stickerName can only be provided when creating a comment story.");
  }

  const body = compactObject({
    text: optionalRawString(input.text),
    html_text: optionalRawString(input.htmlText),
    is_pinned: optionalBoolean(input.isPinned),
    sticker_name: requireText ? readOptionalStorySticker(input.stickerName) : undefined,
  });
  if (!requireText) {
    requireNonEmptyAsanaBody(body, "At least one of text, htmlText, or isPinned must be provided.");
  }
  return body;
}

function readOptionalStorySticker(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const stickerName = requiredString(value, "stickerName", asanaInvalidInputError);
  if (!storyStickerNames.includes(stickerName)) {
    throw asanaInvalidInputError("stickerName must be an official Asana story sticker name.");
  }
  return stickerName;
}

function buildTagCreateBody(input: Record<string, unknown>, includeWorkspace: boolean): Record<string, unknown> {
  return compactObject({
    workspace: includeWorkspace ? requiredString(input.workspaceId, "workspaceId", asanaInvalidInputError) : undefined,
    name: requiredString(input.name, "name", asanaInvalidInputError),
    color: nullableString(input.color),
    notes: optionalRawString(input.notes),
    followers: readOptionalTagFollowers(input.followerIds),
  });
}

function buildTagUpdateBody(input: Record<string, unknown>): Record<string, unknown> {
  const body = compactObject({
    name: input.name === undefined ? undefined : requiredString(input.name, "name", asanaInvalidInputError),
    color: nullableString(input.color),
    notes: optionalRawString(input.notes),
  });
  requireNonEmptyAsanaBody(body, "At least one tag field must be provided.");
  return body;
}

function readOptionalTagFollowers(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const values = requiredStringArray(value, "followerIds", asanaInvalidInputError);
  if (values.length === 0 || values.some((item) => item.trim().length === 0)) {
    throw asanaInvalidInputError("followerIds must contain at least one non-empty string.");
  }
  return values;
}
