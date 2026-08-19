import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "telegram";
const telegramApiBaseUrl = "https://api.telegram.org";
const telegramDefaultRequestTimeoutMs = 30_000;

interface TelegramApiEnvelope<T> {
  ok?: boolean;
  result?: T;
  description?: unknown;
  error_code?: unknown;
  parameters?: {
    retry_after?: unknown;
  };
}

type TelegramActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const telegramActionHandlers: ProviderActionHandlers<"telegram", TelegramActionHandler> = {
  async get_me(_input, context): Promise<unknown> {
    return normalizeTelegramUser(
      await telegramRequest<Record<string, unknown>>({
        botToken: context.apiKey,
        method: "getMe",
        context,
        phase: "execute",
      }),
    );
  },
  async get_webhook_info(_input, context): Promise<unknown> {
    return normalizeWebhookInfo(
      await telegramRequest<Record<string, unknown>>({
        botToken: context.apiKey,
        method: "getWebhookInfo",
        context,
        phase: "execute",
      }),
    );
  },
  async get_updates(input, context): Promise<unknown> {
    const result = await telegramRequest<Array<Record<string, unknown>>>({
      botToken: context.apiKey,
      method: "getUpdates",
      body: compactTelegramBody({
        offset: input.offset,
        limit: input.limit,
        timeout: input.timeout,
        allowed_updates: input.allowedUpdates,
      }),
      context,
      phase: "execute",
    });
    return { updates: result.map((update) => normalizeUpdate(update)) };
  },
  async get_business_connection(input, context): Promise<unknown> {
    return telegramGetBusinessConnection(input, context);
  },
  async read_business_message(input, context): Promise<unknown> {
    return telegramReadBusinessMessage(input, context);
  },
  async delete_business_messages(input, context): Promise<unknown> {
    return telegramDeleteBusinessMessages(input, context);
  },
  async send_message(input, context): Promise<unknown> {
    const result = await telegramRequest<Record<string, unknown>>({
      botToken: context.apiKey,
      method: "sendMessage",
      body: compactTelegramBody({
        business_connection_id: input.businessConnectionId,
        chat_id: input.chatId,
        text: input.text,
        parse_mode: input.parseMode,
        disable_notification: input.disableNotification,
        protect_content: input.protectContent,
        message_thread_id: input.messageThreadId,
        reply_parameters: input.replyToMessageId != null ? { message_id: input.replyToMessageId } : undefined,
        link_preview_options: input.disableWebPagePreview === true ? { is_disabled: true } : undefined,
      }),
      context,
      phase: "execute",
    });
    return normalizeMessage(result);
  },
  async copy_message(input, context): Promise<unknown> {
    return telegramCopyMessage(input, context);
  },
  async copy_messages(input, context): Promise<unknown> {
    return telegramTransferMessages("copyMessages", input, context);
  },
  async forward_messages(input, context): Promise<unknown> {
    return telegramTransferMessages("forwardMessages", input, context);
  },
  async delete_messages(input, context): Promise<unknown> {
    return telegramBooleanAction(
      "deleteMessages",
      {
        chat_id: input.chatId,
        message_ids: input.messageIds,
      },
      context,
    );
  },
  async set_message_reaction(input, context): Promise<unknown> {
    return telegramBooleanAction(
      "setMessageReaction",
      compactTelegramBody({
        chat_id: input.chatId,
        message_id: input.messageId,
        reaction: input.reaction,
        is_big: input.isBig,
      }),
      context,
    );
  },
  async send_chat_action(input, context): Promise<unknown> {
    return telegramBooleanAction(
      "sendChatAction",
      compactTelegramBody({
        business_connection_id: input.businessConnectionId,
        chat_id: input.chatId,
        message_thread_id: input.messageThreadId,
        action: input.action,
      }),
      context,
    );
  },
  async send_video(input, context): Promise<unknown> {
    return telegramSendMedia("sendVideo", "video", input, context);
  },
  async send_audio(input, context): Promise<unknown> {
    return telegramSendMedia("sendAudio", "audio", input, context);
  },
  async send_voice(input, context): Promise<unknown> {
    return telegramSendMedia("sendVoice", "voice", input, context);
  },
  async send_animation(input, context): Promise<unknown> {
    return telegramSendMedia("sendAnimation", "animation", input, context);
  },
  async send_media_group(input, context): Promise<unknown> {
    return telegramSendMediaGroup(input, context);
  },
  async send_contact(input, context): Promise<unknown> {
    return telegramSendStructuredMessage(
      "sendContact",
      {
        phone_number: input.phoneNumber,
        first_name: input.firstName,
        last_name: input.lastName,
        vcard: input.vcard,
      },
      input,
      context,
    );
  },
  async send_venue(input, context): Promise<unknown> {
    return telegramSendStructuredMessage(
      "sendVenue",
      {
        latitude: input.latitude,
        longitude: input.longitude,
        title: input.title,
        address: input.address,
        foursquare_id: input.foursquareId,
        foursquare_type: input.foursquareType,
        google_place_id: input.googlePlaceId,
        google_place_type: input.googlePlaceType,
      },
      input,
      context,
    );
  },
  async send_dice(input, context): Promise<unknown> {
    return telegramSendStructuredMessage("sendDice", { emoji: input.emoji }, input, context);
  },
  async edit_message_text(input, context): Promise<unknown> {
    validateEditMessageTarget(input);
    const result = await telegramRequest<Record<string, unknown> | boolean>({
      botToken: context.apiKey,
      method: "editMessageText",
      body: compactTelegramBody({
        chat_id: input.chatId,
        message_id: input.messageId,
        inline_message_id: input.inlineMessageId,
        text: input.text,
        parse_mode: input.parseMode,
        link_preview_options: input.disableWebPagePreview === true ? { is_disabled: true } : undefined,
      }),
      context,
      phase: "execute",
    });
    if (result === true) {
      return {
        edited: true,
        message: null,
        inlineMessageId: optionalString(input.inlineMessageId) ?? null,
      };
    }
    return {
      edited: true,
      message: normalizeMessage(asRecord(result)),
      inlineMessageId: null,
    };
  },
  async send_photo(input, context): Promise<unknown> {
    const result = await telegramRequest<Record<string, unknown>>({
      botToken: context.apiKey,
      method: "sendPhoto",
      body: compactTelegramBody({
        chat_id: input.chatId,
        photo: validateTelegramUrlOrFileId(input.photo, "photo"),
        caption: input.caption,
        parse_mode: input.parseMode,
        disable_notification: input.disableNotification,
        protect_content: input.protectContent,
        message_thread_id: input.messageThreadId,
        reply_parameters: input.replyToMessageId != null ? { message_id: input.replyToMessageId } : undefined,
      }),
      context,
      phase: "execute",
    });
    return normalizeMessage(result);
  },
  async send_document(input, context): Promise<unknown> {
    const result = await telegramRequest<Record<string, unknown>>({
      botToken: context.apiKey,
      method: "sendDocument",
      body: compactTelegramBody({
        chat_id: input.chatId,
        document: validateTelegramUrlOrFileId(input.document, "document"),
        caption: input.caption,
        parse_mode: input.parseMode,
        thumbnail: validateTelegramUrlOrFileId(input.thumbnail, "thumbnail"),
        reply_markup: normalizeJsonLikeInput(input.replyMarkup),
        reply_to_message_id: input.replyToMessageId,
        disable_notification: input.disableNotification,
        disable_content_type_detection: input.disableContentTypeDetection,
      }),
      context,
      phase: "execute",
    });
    return normalizeMessage(result);
  },
  async send_poll(input, context): Promise<unknown> {
    if (input.openPeriod != null && input.closeDate != null) {
      throw new ProviderRequestError(400, "send_poll accepts only one of openPeriod or closeDate");
    }
    if (input.type === "quiz" && input.correctOptionId == null) {
      throw new ProviderRequestError(400, "send_poll quiz polls require correctOptionId");
    }
    const result = await telegramRequest<Record<string, unknown>>({
      botToken: context.apiKey,
      method: "sendPoll",
      body: compactTelegramBody({
        chat_id: input.chatId,
        question: input.question,
        options: input.options,
        type: input.type,
        is_anonymous: input.isAnonymous,
        allows_multiple_answers: input.allowsMultipleAnswers,
        correct_option_id: input.correctOptionId,
        explanation: input.explanation,
        explanation_parse_mode: input.explanationParseMode,
        open_period: input.openPeriod,
        close_date: input.closeDate,
        is_closed: input.isClosed,
        disable_notification: input.disableNotification,
        reply_to_message_id: input.replyToMessageId,
        reply_markup: normalizeJsonLikeInput(input.replyMarkup),
      }),
      context,
      phase: "execute",
    });
    return normalizeMessage(result);
  },
  async get_chat(input, context): Promise<unknown> {
    return normalizeTelegramChat(
      await telegramRequest<Record<string, unknown>>({
        botToken: context.apiKey,
        method: "getChat",
        body: { chat_id: input.chatId },
        context,
        phase: "execute",
      }),
    );
  },
  async get_chat_member(input, context): Promise<unknown> {
    return normalizeChatMember(
      await telegramRequest<Record<string, unknown>>({
        botToken: context.apiKey,
        method: "getChatMember",
        body: {
          chat_id: input.chatId,
          user_id: input.userId,
        },
        context,
        phase: "execute",
      }),
    );
  },
  async get_chat_administrators(input, context): Promise<unknown> {
    const result = await telegramRequest<Array<Record<string, unknown>>>({
      botToken: context.apiKey,
      method: "getChatAdministrators",
      body: { chat_id: input.chatId },
      context,
      phase: "execute",
    });
    return { administrators: result.map((member) => normalizeChatMember(member)) };
  },
  async get_chat_members_count(input, context): Promise<unknown> {
    const result = await telegramRequest<number>({
      botToken: context.apiKey,
      method: "getChatMemberCount",
      body: { chat_id: input.chatId },
      context,
      phase: "execute",
    });
    return { memberCount: result };
  },
  async ban_chat_member(input, context): Promise<unknown> {
    return telegramBooleanAction(
      "banChatMember",
      compactTelegramBody({
        chat_id: input.chatId,
        user_id: input.userId,
        until_date: input.untilDate,
        revoke_messages: input.revokeMessages,
      }),
      context,
    );
  },
  async unban_chat_member(input, context): Promise<unknown> {
    return telegramBooleanAction(
      "unbanChatMember",
      compactTelegramBody({
        chat_id: input.chatId,
        user_id: input.userId,
        only_if_banned: input.onlyIfBanned,
      }),
      context,
    );
  },
  async restrict_chat_member(input, context): Promise<unknown> {
    return telegramBooleanAction(
      "restrictChatMember",
      compactTelegramBody({
        chat_id: input.chatId,
        user_id: input.userId,
        permissions: normalizeChatPermissions(input.permissions),
        use_independent_chat_permissions: input.useIndependentChatPermissions,
        until_date: input.untilDate,
      }),
      context,
    );
  },
  async promote_chat_member(input, context): Promise<unknown> {
    return telegramBooleanAction(
      "promoteChatMember",
      compactTelegramBody({
        chat_id: input.chatId,
        user_id: input.userId,
        is_anonymous: input.isAnonymous,
        can_manage_chat: input.canManageChat,
        can_delete_messages: input.canDeleteMessages,
        can_manage_video_chats: input.canManageVideoChats,
        can_restrict_members: input.canRestrictMembers,
        can_promote_members: input.canPromoteMembers,
        can_change_info: input.canChangeInfo,
        can_invite_users: input.canInviteUsers,
        can_post_stories: input.canPostStories,
        can_edit_stories: input.canEditStories,
        can_delete_stories: input.canDeleteStories,
        can_post_messages: input.canPostMessages,
        can_edit_messages: input.canEditMessages,
        can_pin_messages: input.canPinMessages,
        can_manage_topics: input.canManageTopics,
        can_manage_direct_messages: input.canManageDirectMessages,
        can_manage_tags: input.canManageTags,
      }),
      context,
    );
  },
  async set_chat_permissions(input, context): Promise<unknown> {
    return telegramBooleanAction(
      "setChatPermissions",
      compactTelegramBody({
        chat_id: input.chatId,
        permissions: normalizeChatPermissions(input.permissions),
        use_independent_chat_permissions: input.useIndependentChatPermissions,
      }),
      context,
    );
  },
  async pin_chat_message(input, context): Promise<unknown> {
    return telegramBooleanAction(
      "pinChatMessage",
      compactTelegramBody({
        business_connection_id: input.businessConnectionId,
        chat_id: input.chatId,
        message_id: input.messageId,
        disable_notification: input.disableNotification,
      }),
      context,
    );
  },
  async unpin_chat_message(input, context): Promise<unknown> {
    return telegramBooleanAction(
      "unpinChatMessage",
      compactTelegramBody({
        business_connection_id: input.businessConnectionId,
        chat_id: input.chatId,
        message_id: input.messageId,
      }),
      context,
    );
  },
  async unpin_all_chat_messages(input, context): Promise<unknown> {
    return telegramBooleanAction("unpinAllChatMessages", { chat_id: input.chatId }, context);
  },
  async approve_chat_join_request(input, context): Promise<unknown> {
    return telegramChatJoinRequest("approveChatJoinRequest", input, context);
  },
  async decline_chat_join_request(input, context): Promise<unknown> {
    return telegramChatJoinRequest("declineChatJoinRequest", input, context);
  },
  async delete_message(input, context): Promise<unknown> {
    await telegramRequest<boolean>({
      botToken: context.apiKey,
      method: "deleteMessage",
      body: {
        chat_id: input.chatId,
        message_id: input.messageId,
      },
      context,
      phase: "execute",
    });
    return { success: true };
  },
  async forward_message(input, context): Promise<unknown> {
    const result = await telegramRequest<Record<string, unknown>>({
      botToken: context.apiKey,
      method: "forwardMessage",
      body: compactTelegramBody({
        chat_id: input.chatId,
        from_chat_id: input.fromChatId,
        message_id: input.messageId,
        disable_notification: input.disableNotification,
      }),
      context,
      phase: "execute",
    });
    return normalizeMessage(result);
  },
  async send_location(input, context): Promise<unknown> {
    const result = await telegramRequest<Record<string, unknown>>({
      botToken: context.apiKey,
      method: "sendLocation",
      body: compactTelegramBody({
        chat_id: input.chatId,
        latitude: input.latitude,
        longitude: input.longitude,
        horizontal_accuracy: input.horizontalAccuracy,
        live_period: input.livePeriod,
        heading: input.heading,
        proximity_alert_radius: input.proximityAlertRadius,
        disable_notification: input.disableNotification,
        reply_to_message_id: input.replyToMessageId,
        reply_markup: normalizeJsonLikeInput(input.replyMarkup),
      }),
      context,
      phase: "execute",
    });
    return normalizeMessage(result);
  },
  async export_chat_invite_link(input, context): Promise<unknown> {
    return telegramExportChatInviteLink(input, context);
  },
  async create_chat_invite_link(input, context): Promise<unknown> {
    return telegramMutateChatInviteLink("createChatInviteLink", input, context);
  },
  async edit_chat_invite_link(input, context): Promise<unknown> {
    return telegramMutateChatInviteLink("editChatInviteLink", input, context);
  },
  async revoke_chat_invite_link(input, context): Promise<unknown> {
    return telegramMutateChatInviteLink("revokeChatInviteLink", input, context);
  },
  async answer_callback_query(input, context): Promise<unknown> {
    await telegramRequest<boolean>({
      botToken: context.apiKey,
      method: "answerCallbackQuery",
      body: compactTelegramBody({
        callback_query_id: input.callbackQueryId,
        text: input.text,
        show_alert: input.showAlert,
        url: validateTelegramUrl(input.url, "url"),
        cache_time: input.cacheTime,
      }),
      context,
      phase: "execute",
    });
    return { success: true };
  },
  async set_my_commands(input, context): Promise<unknown> {
    await telegramRequest<boolean>({
      botToken: context.apiKey,
      method: "setMyCommands",
      body: compactTelegramBody({
        commands: input.commands,
        scope: normalizeJsonLikeInput(input.scope),
        language_code: input.languageCode,
      }),
      context,
      phase: "execute",
    });
    return { success: true };
  },
  async set_webhook(input, context): Promise<unknown> {
    await telegramRequest<boolean>({
      botToken: context.apiKey,
      method: "setWebhook",
      body: compactTelegramBody({
        url: validateTelegramUrl(input.url, "url"),
        secret_token: input.secretToken,
        max_connections: input.maxConnections,
        allowed_updates: input.allowedUpdates,
        drop_pending_updates: input.dropPendingUpdates,
      }),
      context,
      phase: "execute",
    });
    return { success: true };
  },
  async delete_webhook(input, context): Promise<unknown> {
    await telegramRequest<boolean>({
      botToken: context.apiKey,
      method: "deleteWebhook",
      body: compactTelegramBody({
        drop_pending_updates: input.dropPendingUpdates,
      }),
      context,
      phase: "execute",
    });
    return { success: true };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, telegramActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    assertValidTelegramBotToken(credential.apiKey);
    return `${telegramApiBaseUrl}/bot${credential.apiKey}`;
  },
  auth: { type: "none" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    assertValidTelegramBotToken(input.apiKey);
    const profile = await telegramRequest<Record<string, unknown>>({
      botToken: input.apiKey,
      method: "getMe",
      context: { fetcher, signal },
      phase: "validate",
    });
    const normalizedProfile = normalizeTelegramUser(profile);
    return {
      profile: {
        accountId: String(normalizedProfile.id),
        displayName: normalizedProfile.username ? `@${normalizedProfile.username}` : normalizedProfile.firstName,
      },
      grantedScopes: [],
      metadata: {
        botId: normalizedProfile.id,
        username: normalizedProfile.username,
        firstName: normalizedProfile.firstName,
        validationMethod: "getMe",
      },
    };
  },
};

async function telegramCopyMessage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const result = await telegramRequest<Record<string, unknown>>({
    botToken: context.apiKey,
    method: "copyMessage",
    body: compactTelegramBody({
      chat_id: input.chatId,
      from_chat_id: input.fromChatId,
      message_id: input.messageId,
      message_thread_id: input.messageThreadId,
      caption: input.caption,
      parse_mode: input.parseMode,
      show_caption_above_media: input.showCaptionAboveMedia,
      disable_notification: input.disableNotification,
      protect_content: input.protectContent,
    }),
    context,
    phase: "execute",
  });
  return { messageId: Number(result.message_id) };
}

async function telegramTransferMessages(
  method: "copyMessages" | "forwardMessages",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  validateIncreasingMessageIds(input.messageIds);
  const result = await telegramRequest<Array<Record<string, unknown>>>({
    botToken: context.apiKey,
    method,
    body: compactTelegramBody({
      chat_id: input.chatId,
      from_chat_id: input.fromChatId,
      message_ids: input.messageIds,
      message_thread_id: input.messageThreadId,
      disable_notification: input.disableNotification,
      protect_content: input.protectContent,
      remove_caption: method === "copyMessages" ? input.removeCaption : undefined,
    }),
    context,
    phase: "execute",
  });
  return { messageIds: result.map((message) => Number(message.message_id)) };
}

async function telegramSendMedia(
  method: "sendVideo" | "sendAudio" | "sendVoice" | "sendAnimation",
  mediaField: "video" | "audio" | "voice" | "animation",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const result = await telegramRequest<Record<string, unknown>>({
    botToken: context.apiKey,
    method,
    body: compactTelegramBody({
      business_connection_id: input.businessConnectionId,
      chat_id: input.chatId,
      message_thread_id: input.messageThreadId,
      [mediaField]: validateTelegramUrlOrFileId(input[mediaField], mediaField),
      caption: input.caption,
      parse_mode: input.parseMode,
      duration: input.duration,
      width: input.width,
      height: input.height,
      performer: input.performer,
      title: input.title,
      cover: validateTelegramUrlOrFileId(input.cover, "cover"),
      start_timestamp: input.startTimestamp,
      show_caption_above_media: input.showCaptionAboveMedia,
      has_spoiler: input.hasSpoiler,
      supports_streaming: input.supportsStreaming,
      disable_notification: input.disableNotification,
      protect_content: input.protectContent,
    }),
    context,
    phase: "execute",
  });
  return normalizeMessage(result);
}

async function telegramSendMediaGroup(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const result = await telegramRequest<Array<Record<string, unknown>>>({
    botToken: context.apiKey,
    method: "sendMediaGroup",
    body: compactTelegramBody({
      business_connection_id: input.businessConnectionId,
      chat_id: input.chatId,
      message_thread_id: input.messageThreadId,
      media: input.media,
      disable_notification: input.disableNotification,
      protect_content: input.protectContent,
    }),
    context,
    phase: "execute",
  });
  return { messages: result.map(normalizeMessage) };
}

async function telegramSendStructuredMessage(
  method: string,
  fields: Record<string, unknown>,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const result = await telegramRequest<Record<string, unknown>>({
    botToken: context.apiKey,
    method,
    body: compactTelegramBody({
      business_connection_id: input.businessConnectionId,
      chat_id: input.chatId,
      message_thread_id: input.messageThreadId,
      ...fields,
      disable_notification: input.disableNotification,
      protect_content: input.protectContent,
    }),
    context,
    phase: "execute",
  });
  return normalizeMessage(result);
}

async function telegramGetBusinessConnection(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const result = await telegramRequest<Record<string, unknown>>({
    botToken: context.apiKey,
    method: "getBusinessConnection",
    body: {
      business_connection_id: input.businessConnectionId,
    },
    context,
    phase: "execute",
  });
  return normalizeBusinessConnection(result);
}

async function telegramReadBusinessMessage(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  await telegramRequest<boolean>({
    botToken: context.apiKey,
    method: "readBusinessMessage",
    body: {
      business_connection_id: input.businessConnectionId,
      chat_id: input.chatId,
      message_id: input.messageId,
    },
    context,
    phase: "execute",
  });
  return { success: true };
}

async function telegramDeleteBusinessMessages(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  await telegramRequest<boolean>({
    botToken: context.apiKey,
    method: "deleteBusinessMessages",
    body: {
      business_connection_id: input.businessConnectionId,
      message_ids: input.messageIds,
    },
    context,
    phase: "execute",
  });
  return { success: true };
}

async function telegramBooleanAction(
  method: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  await telegramRequest<boolean>({
    botToken: context.apiKey,
    method,
    body,
    context,
    phase: "execute",
  });
  return { success: true };
}

function telegramChatJoinRequest(
  method: "approveChatJoinRequest" | "declineChatJoinRequest",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return telegramBooleanAction(
    method,
    {
      chat_id: input.chatId,
      user_id: input.userId,
    },
    context,
  );
}

async function telegramExportChatInviteLink(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const result = await telegramRequest<string>({
    botToken: context.apiKey,
    method: "exportChatInviteLink",
    body: {
      chat_id: input.chatId,
    },
    context,
    phase: "execute",
  });
  return { inviteLink: result };
}

async function telegramMutateChatInviteLink(
  method: "createChatInviteLink" | "editChatInviteLink" | "revokeChatInviteLink",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  validateChatInviteLinkInput(input);
  const result = await telegramRequest<Record<string, unknown>>({
    botToken: context.apiKey,
    method,
    body: compactTelegramBody({
      chat_id: input.chatId,
      invite_link: input.inviteLink,
      name: input.name,
      expire_date: input.expireDate,
      member_limit: input.memberLimit,
      creates_join_request: input.createsJoinRequest,
    }),
    context,
    phase: "execute",
  });
  return normalizeChatInviteLink(result);
}

async function telegramRequest<TResult>(input: {
  botToken: string;
  method: string;
  body?: Record<string, unknown>;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: "validate" | "execute";
}): Promise<TResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, telegramDefaultRequestTimeoutMs);
  const abortFromContext = (): void => controller.abort();
  input.context.signal?.addEventListener("abort", abortFromContext, { once: true });

  let response: Response;
  try {
    response = await input.context.fetcher(buildTelegramMethodUrl(input.botToken, input.method), {
      method: input.body == null ? "GET" : "POST",
      headers: input.body == null ? undefined : { "content-type": "application/json" },
      body: input.body == null ? undefined : JSON.stringify(input.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut && isAbortLikeError(error)) {
      throw new ProviderRequestError(
        502,
        `telegram ${input.method} request timed out after ${Math.ceil(telegramDefaultRequestTimeoutMs / 1000)} seconds`,
      );
    }
    const message = error instanceof Error && error.message.trim() !== "" ? error.message : "request failed";
    throw new ProviderRequestError(502, `telegram ${input.method} request failed: ${message}`);
  } finally {
    clearTimeout(timeoutHandle);
    input.context.signal?.removeEventListener("abort", abortFromContext);
  }

  const payload = (await parseTelegramPayload(response)) as TelegramApiEnvelope<TResult>;
  if (!response.ok || payload.ok !== true) {
    throw buildTelegramError({
      response,
      payload,
      phase: input.phase,
      method: input.method,
    });
  }
  if (payload.result === undefined) {
    throw new ProviderRequestError(502, `telegram ${input.method} response did not include result`);
  }
  return payload.result;
}

function buildTelegramMethodUrl(botToken: string, method: string): string {
  assertValidTelegramBotToken(botToken);
  return `${telegramApiBaseUrl}/bot${botToken}/${method}`;
}

async function parseTelegramPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => ({}));
  }
  const text = await response.text().catch(() => "");
  return {
    ok: false,
    description: text || `telegram request failed with ${response.status}`,
    error_code: response.status,
  };
}

function buildTelegramError(input: {
  response: Response;
  payload: TelegramApiEnvelope<unknown>;
  phase: "validate" | "execute";
  method: string;
}): ProviderRequestError {
  const status = Number(input.payload.error_code) || input.response.status;
  const description =
    typeof input.payload.description === "string" && input.payload.description.trim() !== ""
      ? input.payload.description
      : `telegram ${input.method} request failed with ${status}`;
  const retryAfter = optionalNumber(input.payload.parameters?.retry_after);

  if (status === 429) {
    const message = retryAfter != null ? `${description} Retry after ${retryAfter} seconds.` : description;
    return new ProviderRequestError(429, message);
  }
  if (input.phase === "validate" && status === 401) {
    return new ProviderRequestError(400, description);
  }
  if (status === 400 || status === 404 || status === 409) {
    return new ProviderRequestError(400, description);
  }
  return new ProviderRequestError(status || 500, description);
}

function normalizeTelegramUser(value: Record<string, unknown>): Record<string, unknown> & {
  id: number;
  firstName: string;
  username?: string;
} {
  return {
    id: Number(value.id),
    isBot: Boolean(value.is_bot),
    firstName: String(value.first_name ?? ""),
    username: optionalString(value.username),
    languageCode: optionalString(value.language_code),
    canJoinGroups: optionalBoolean(value.can_join_groups),
    canReadAllGroupMessages: optionalBoolean(value.can_read_all_group_messages),
    supportsInlineQueries: optionalBoolean(value.supports_inline_queries),
    canConnectToBusiness: optionalBoolean(value.can_connect_to_business),
    hasMainWebApp: optionalBoolean(value.has_main_web_app),
  };
}

function normalizeTelegramChat(value: Record<string, unknown>): Record<string, unknown> & {
  id: number;
  username?: string;
} {
  return {
    id: Number(value.id),
    type: String(value.type ?? ""),
    title: optionalString(value.title),
    username: optionalString(value.username),
    firstName: optionalString(value.first_name),
    lastName: optionalString(value.last_name),
    isForum: optionalBoolean(value.is_forum),
  };
}

function normalizeMessage(value: Record<string, unknown>): Record<string, unknown> {
  return {
    messageId: Number(value.message_id),
    date: Number(value.date),
    chat: normalizeTelegramChat(asRecord(value.chat)),
    from: value.from ? normalizeTelegramUser(asRecord(value.from)) : undefined,
    senderChat: value.sender_chat ? normalizeTelegramChat(asRecord(value.sender_chat)) : undefined,
    text: optionalString(value.text),
    caption: optionalString(value.caption),
    photo: Array.isArray(value.photo) ? value.photo.map((item) => normalizePhotoSize(asRecord(item))) : undefined,
    document: value.document ? normalizeDocument(asRecord(value.document)) : undefined,
    location: value.location ? normalizeLocation(asRecord(value.location)) : undefined,
    poll: value.poll ? normalizePoll(asRecord(value.poll)) : undefined,
    entities: Array.isArray(value.entities) ? value.entities.map(asRecord) : undefined,
    captionEntities: Array.isArray(value.caption_entities) ? value.caption_entities.map(asRecord) : undefined,
    forwardDate: optionalNumber(value.forward_date),
    forwardFrom: value.forward_from ? normalizeTelegramUser(asRecord(value.forward_from)) : undefined,
    forwardFromChat: value.forward_from_chat ? normalizeTelegramChat(asRecord(value.forward_from_chat)) : undefined,
    forwardFromMessageId: optionalNumber(value.forward_from_message_id),
    forwardSignature: optionalString(value.forward_signature),
    forwardSenderName: optionalString(value.forward_sender_name),
    linkPreviewOptions: value.link_preview_options ? asRecord(value.link_preview_options) : undefined,
    businessConnectionId: optionalString(value.business_connection_id),
    video: value.video ? normalizeVideo(asRecord(value.video)) : undefined,
    audio: value.audio ? normalizeAudio(asRecord(value.audio)) : undefined,
    voice: value.voice ? normalizeVoice(asRecord(value.voice)) : undefined,
    animation: value.animation ? normalizeAnimation(asRecord(value.animation)) : undefined,
    contact: value.contact ? normalizeContact(asRecord(value.contact)) : undefined,
    venue: value.venue ? normalizeVenue(asRecord(value.venue)) : undefined,
    dice: value.dice ? normalizeDice(asRecord(value.dice)) : undefined,
  };
}

function normalizePhotoSize(value: Record<string, unknown>): Record<string, unknown> {
  return {
    fileId: String(value.file_id ?? ""),
    fileUniqueId: String(value.file_unique_id ?? ""),
    width: Number(value.width),
    height: Number(value.height),
    fileSize: optionalNumber(value.file_size),
  };
}

function normalizeDocument(value: Record<string, unknown>): Record<string, unknown> {
  return {
    fileId: String(value.file_id ?? ""),
    fileUniqueId: String(value.file_unique_id ?? ""),
    fileName: optionalString(value.file_name),
    mimeType: optionalString(value.mime_type),
    fileSize: optionalNumber(value.file_size),
  };
}

function normalizeVideo(value: Record<string, unknown>): Record<string, unknown> {
  return {
    fileId: String(value.file_id ?? ""),
    fileUniqueId: String(value.file_unique_id ?? ""),
    width: Number(value.width),
    height: Number(value.height),
    duration: Number(value.duration),
    thumbnail: value.thumbnail ? normalizePhotoSize(asRecord(value.thumbnail)) : undefined,
    cover: Array.isArray(value.cover) ? value.cover.map((item) => normalizePhotoSize(asRecord(item))) : undefined,
    startTimestamp: optionalNumber(value.start_timestamp),
    qualities: Array.isArray(value.qualities)
      ? value.qualities.map((item) => normalizeVideoQuality(asRecord(item)))
      : undefined,
    fileName: optionalString(value.file_name),
    mimeType: optionalString(value.mime_type),
    fileSize: optionalNumber(value.file_size),
  };
}

function normalizeVideoQuality(value: Record<string, unknown>): Record<string, unknown> {
  return {
    fileId: String(value.file_id ?? ""),
    fileUniqueId: String(value.file_unique_id ?? ""),
    width: Number(value.width),
    height: Number(value.height),
    codec: String(value.codec ?? ""),
    fileSize: optionalNumber(value.file_size),
  };
}

function normalizeAudio(value: Record<string, unknown>): Record<string, unknown> {
  return {
    fileId: String(value.file_id ?? ""),
    fileUniqueId: String(value.file_unique_id ?? ""),
    duration: Number(value.duration),
    performer: optionalString(value.performer),
    title: optionalString(value.title),
    fileName: optionalString(value.file_name),
    mimeType: optionalString(value.mime_type),
    fileSize: optionalNumber(value.file_size),
    thumbnail: value.thumbnail ? normalizePhotoSize(asRecord(value.thumbnail)) : undefined,
  };
}

function normalizeVoice(value: Record<string, unknown>): Record<string, unknown> {
  return {
    fileId: String(value.file_id ?? ""),
    fileUniqueId: String(value.file_unique_id ?? ""),
    duration: Number(value.duration),
    mimeType: optionalString(value.mime_type),
    fileSize: optionalNumber(value.file_size),
  };
}

function normalizeAnimation(value: Record<string, unknown>): Record<string, unknown> {
  return {
    fileId: String(value.file_id ?? ""),
    fileUniqueId: String(value.file_unique_id ?? ""),
    width: Number(value.width),
    height: Number(value.height),
    duration: Number(value.duration),
    thumbnail: value.thumbnail ? normalizePhotoSize(asRecord(value.thumbnail)) : undefined,
    fileName: optionalString(value.file_name),
    mimeType: optionalString(value.mime_type),
    fileSize: optionalNumber(value.file_size),
  };
}

function normalizeContact(value: Record<string, unknown>): Record<string, unknown> {
  return {
    phoneNumber: String(value.phone_number ?? ""),
    firstName: String(value.first_name ?? ""),
    lastName: optionalString(value.last_name),
    userId: optionalNumber(value.user_id),
    vcard: optionalString(value.vcard),
  };
}

function normalizeLocation(value: Record<string, unknown>): Record<string, unknown> {
  return {
    latitude: Number(value.latitude),
    longitude: Number(value.longitude),
    horizontalAccuracy: optionalNumber(value.horizontal_accuracy),
    livePeriod: optionalNumber(value.live_period),
    heading: optionalNumber(value.heading),
    proximityAlertRadius: optionalNumber(value.proximity_alert_radius),
  };
}

function normalizeVenue(value: Record<string, unknown>): Record<string, unknown> {
  return {
    location: normalizeLocation(asRecord(value.location)),
    title: String(value.title ?? ""),
    address: String(value.address ?? ""),
    foursquareId: optionalString(value.foursquare_id),
    foursquareType: optionalString(value.foursquare_type),
    googlePlaceId: optionalString(value.google_place_id),
    googlePlaceType: optionalString(value.google_place_type),
  };
}

function normalizeDice(value: Record<string, unknown>): Record<string, unknown> {
  return {
    emoji: String(value.emoji ?? ""),
    value: Number(value.value),
  };
}

function normalizePoll(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(value.id ?? ""),
    question: String(value.question ?? ""),
    options: Array.isArray(value.options)
      ? value.options.map((option) => ({
          text: String(asRecord(option).text ?? ""),
          voterCount: Number(asRecord(option).voter_count ?? 0),
        }))
      : [],
    totalVoterCount: Number(value.total_voter_count ?? 0),
    isClosed: Boolean(value.is_closed),
    isAnonymous: Boolean(value.is_anonymous),
    type: value.type === "quiz" ? "quiz" : "regular",
    allowsMultipleAnswers: Boolean(value.allows_multiple_answers),
    closeDate: optionalNumber(value.close_date),
    openPeriod: optionalNumber(value.open_period),
    explanation: optionalString(value.explanation),
    correctOptionId: optionalNumber(value.correct_option_id),
  };
}

function normalizeUpdate(value: Record<string, unknown>): Record<string, unknown> {
  return {
    updateId: Number(value.update_id),
    message: value.message ? normalizeMessage(asRecord(value.message)) : undefined,
    editedMessage: value.edited_message ? normalizeMessage(asRecord(value.edited_message)) : undefined,
    channelPost: value.channel_post ? normalizeMessage(asRecord(value.channel_post)) : undefined,
    editedChannelPost: value.edited_channel_post ? normalizeMessage(asRecord(value.edited_channel_post)) : undefined,
    callbackQuery: value.callback_query ? asRecord(value.callback_query) : undefined,
    businessConnection: value.business_connection
      ? normalizeBusinessConnection(asRecord(value.business_connection))
      : undefined,
    businessMessage: value.business_message ? normalizeMessage(asRecord(value.business_message)) : undefined,
    editedBusinessMessage: value.edited_business_message
      ? normalizeMessage(asRecord(value.edited_business_message))
      : undefined,
    deletedBusinessMessages: value.deleted_business_messages
      ? normalizeBusinessMessagesDeleted(asRecord(value.deleted_business_messages))
      : undefined,
  };
}

function normalizeBusinessConnection(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(value.id ?? ""),
    user: normalizeTelegramUser(asRecord(value.user)),
    userChatId: Number(value.user_chat_id),
    date: Number(value.date),
    rights: value.rights ? normalizeBusinessBotRights(asRecord(value.rights)) : undefined,
    isEnabled: Boolean(value.is_enabled),
  };
}

function normalizeBusinessBotRights(value: Record<string, unknown>): Record<string, unknown> {
  return {
    canReply: optionalBoolean(value.can_reply),
    canReadMessages: optionalBoolean(value.can_read_messages),
    canDeleteSentMessages: optionalBoolean(value.can_delete_sent_messages),
    canDeleteAllMessages: optionalBoolean(value.can_delete_all_messages),
    canEditName: optionalBoolean(value.can_edit_name),
    canEditBio: optionalBoolean(value.can_edit_bio),
    canEditProfilePhoto: optionalBoolean(value.can_edit_profile_photo),
    canEditUsername: optionalBoolean(value.can_edit_username),
    canChangeGiftSettings: optionalBoolean(value.can_change_gift_settings),
    canViewGiftsAndStars: optionalBoolean(value.can_view_gifts_and_stars),
    canConvertGiftsToStars: optionalBoolean(value.can_convert_gifts_to_stars),
    canTransferAndUpgradeGifts: optionalBoolean(value.can_transfer_and_upgrade_gifts),
    canTransferStars: optionalBoolean(value.can_transfer_stars),
    canManageStories: optionalBoolean(value.can_manage_stories),
  };
}

function normalizeBusinessMessagesDeleted(value: Record<string, unknown>): Record<string, unknown> {
  return {
    businessConnectionId: String(value.business_connection_id ?? ""),
    chat: normalizeTelegramChat(asRecord(value.chat)),
    messageIds: Array.isArray(value.message_ids) ? value.message_ids.map((messageId) => Number(messageId)) : [],
  };
}

function normalizeWebhookInfo(value: Record<string, unknown>): Record<string, unknown> {
  return {
    url: String(value.url ?? ""),
    hasCustomCertificate: Boolean(value.has_custom_certificate),
    pendingUpdateCount: Number(value.pending_update_count ?? 0),
    ipAddress: optionalString(value.ip_address),
    lastErrorDate: optionalNumber(value.last_error_date),
    lastErrorMessage: optionalString(value.last_error_message),
    lastSynchronizationErrorDate: optionalNumber(value.last_synchronization_error_date),
    maxConnections: optionalNumber(value.max_connections),
    allowedUpdates: Array.isArray(value.allowed_updates)
      ? value.allowed_updates.map((item) => String(item))
      : undefined,
  };
}

function normalizeChatMember(value: Record<string, unknown>): Record<string, unknown> {
  return {
    status: String(value.status ?? ""),
    user: normalizeTelegramUser(asRecord(value.user)),
    customTitle: optionalString(value.custom_title),
    isAnonymous: optionalBoolean(value.is_anonymous),
    untilDate: optionalNumber(value.until_date),
    canBeEdited: optionalBoolean(value.can_be_edited),
    canChangeInfo: optionalBoolean(value.can_change_info),
    canManageChat: optionalBoolean(value.can_manage_chat),
    canInviteUsers: optionalBoolean(value.can_invite_users),
    canPinMessages: optionalBoolean(value.can_pin_messages),
    canEditMessages: optionalBoolean(value.can_edit_messages),
    canPostMessages: optionalBoolean(value.can_post_messages),
    canDeleteMessages: optionalBoolean(value.can_delete_messages),
    canPromoteMembers: optionalBoolean(value.can_promote_members),
    canRestrictMembers: optionalBoolean(value.can_restrict_members),
    canManageVideoChats: optionalBoolean(value.can_manage_video_chats),
    canManageTopics: optionalBoolean(value.can_manage_topics),
  };
}

function normalizeChatPermissions(value: unknown): Record<string, unknown> {
  const permissions = asRecord(value);
  return compactTelegramBody({
    can_send_messages: permissions.canSendMessages,
    can_send_audios: permissions.canSendAudios,
    can_send_documents: permissions.canSendDocuments,
    can_send_photos: permissions.canSendPhotos,
    can_send_videos: permissions.canSendVideos,
    can_send_video_notes: permissions.canSendVideoNotes,
    can_send_voice_notes: permissions.canSendVoiceNotes,
    can_send_polls: permissions.canSendPolls,
    can_send_other_messages: permissions.canSendOtherMessages,
    can_add_web_page_previews: permissions.canAddWebPagePreviews,
    can_change_info: permissions.canChangeInfo,
    can_invite_users: permissions.canInviteUsers,
    can_pin_messages: permissions.canPinMessages,
    can_manage_topics: permissions.canManageTopics,
  });
}

function normalizeChatInviteLink(value: Record<string, unknown>): Record<string, unknown> {
  return {
    inviteLink: String(value.invite_link ?? ""),
    creator: normalizeTelegramUser(asRecord(value.creator)),
    createsJoinRequest: Boolean(value.creates_join_request),
    isPrimary: Boolean(value.is_primary),
    isRevoked: Boolean(value.is_revoked),
    name: optionalString(value.name),
    expireDate: optionalNumber(value.expire_date),
    memberLimit: optionalNumber(value.member_limit),
    pendingJoinRequestCount: optionalNumber(value.pending_join_request_count),
    subscriptionPeriod: optionalNumber(value.subscription_period),
    subscriptionPrice: optionalNumber(value.subscription_price),
  };
}

function compactTelegramBody(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined));
}

function asRecord(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "telegram returned an unexpected object payload");
  }
  return record;
}

function normalizeJsonLikeInput(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value) as unknown);
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        throw new ProviderRequestError(400, "JSON string input must decode to an object");
      }
      throw new ProviderRequestError(400, "invalid JSON string input");
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return asRecord(value);
  }
  return undefined;
}

function validateTelegramUrlOrFileId(value: unknown, fieldName: string): unknown {
  const text = optionalString(value);
  if (!text || !/^https?:\/\//iu.test(text)) {
    return value;
  }
  return validateTelegramUrl(text, fieldName);
}

function validateTelegramUrl(value: unknown, fieldName: string): string | undefined {
  const text = optionalString(value);
  if (!text) {
    return undefined;
  }
  return assertPublicHttpUrl(text, {
    fieldName,
    createError: (message) => new ProviderRequestError(400, message),
  }).toString();
}

function validateEditMessageTarget(input: Record<string, unknown>): void {
  const hasInlineTarget = input.inlineMessageId != null;
  const hasChatTarget = input.chatId != null || input.messageId != null;
  if (hasInlineTarget && hasChatTarget) {
    throw new ProviderRequestError(400, "edit_message_text accepts either inlineMessageId or chatId/messageId");
  }
  if (!hasInlineTarget && !(input.chatId != null && input.messageId != null)) {
    throw new ProviderRequestError(400, "edit_message_text requires inlineMessageId or chatId with messageId");
  }
}

function validateIncreasingMessageIds(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "messageIds must be an array");
  }
  const isIncreasing = value.every((messageId, index) => index === 0 || Number(value[index - 1]) < Number(messageId));
  if (!isIncreasing) {
    throw new ProviderRequestError(400, "messageIds must be in strictly increasing order");
  }
}

function validateChatInviteLinkInput(input: Record<string, unknown>): void {
  if (input.memberLimit != null && input.createsJoinRequest === true) {
    throw new ProviderRequestError(400, "memberLimit cannot be combined with createsJoinRequest");
  }
}

function assertValidTelegramBotToken(botToken: string): void {
  if (botToken.length === 0 || /[/?#\s]/u.test(botToken)) {
    throw new ProviderRequestError(400, "telegram bot token is malformed");
  }
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
