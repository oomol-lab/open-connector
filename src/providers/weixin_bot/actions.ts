import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "weixin_bot";

const messageSchema = s.looseObject("A Weixin iLink message, including its sender, content items, and reply context.", {
  message_id: s.string("The message identifier returned by Weixin."),
  from_user_id: s.string("The Weixin user that sent the message."),
  to_user_id: s.string("The message recipient."),
  create_time_ms: s.number("The message creation time in milliseconds."),
  message_type: s.integer("The message sender type reported by Weixin."),
  message_state: s.integer("The message lifecycle state reported by Weixin."),
  context_token: s.string("The conversation token to pass back when replying."),
  item_list: s.array("The text or media items carried by the message.", s.looseObject("A Weixin message item.")),
});

const transitFileInput = s.requiredObject("A file already uploaded to local transit storage.", {
  fileId: s.nonEmptyString("The transit file identifier."),
});

const transitFileOutput = s.requiredObject("Decrypted media stored in local transit storage.", {
  fileId: s.nonEmptyString("The new transit file identifier."),
  downloadUrl: s.url("The local download URL."),
  sizeBytes: s.nonNegativeInteger("The decrypted file size in bytes."),
  name: s.nonEmptyString("The stored file name."),
  mimeType: s.nonEmptyString("The media MIME type."),
});

export const weixinBotActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_updates",
    description:
      "Long-poll for inbound Weixin bot messages. Pass the returned cursor to the next call to avoid receiving the same updates again.",
    inputSchema: s.object(
      {
        cursor: s.nonEmptyString("The cursor returned by the previous get_updates call."),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.requiredObject("Inbound messages and the state needed for the next long-poll.", {
      messages: s.array("Messages received during this poll.", messageSchema),
      nextCursor: s.nullableString("The cursor to pass to the next get_updates call."),
      longPollingTimeoutMs: s.nullableInteger("The next long-poll duration suggested by Weixin."),
    }),
    providerPermissions: ["Receive messages sent to the connected Weixin bot"],
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a text reply from the connected Weixin bot to a user or conversation.",
    inputSchema: s.requiredObject("A text message and its Weixin reply context.", {
      toUserId: s.nonEmptyString("The target user ID from an inbound Weixin message."),
      text: s.nonEmptyString("The text to send."),
      contextToken: s.nonEmptyString("The context_token from the inbound message being answered."),
    }),
    outputSchema: s.requiredObject("The accepted Weixin message.", {
      messageId: s.nullableString("The server-assigned message identifier when returned."),
    }),
    providerPermissions: ["Send messages as the connected Weixin bot"],
    followUpActions: ["weixin_bot.get_updates"],
  }),
  defineProviderAction(service, {
    name: "send_media",
    description: "Encrypt, upload, and send an image, video, or file from local transit storage.",
    inputSchema: s.object(
      "A transit file and its Weixin reply context.",
      {
        toUserId: s.nonEmptyString("The target user ID from an inbound Weixin message."),
        contextToken: s.nonEmptyString("The context_token from the inbound message being answered."),
        mediaType: s.stringEnum("How Weixin should present the file.", ["image", "video", "file"]),
        file: transitFileInput,
        caption: s.nonEmptyString("Optional text sent as a separate message before the media."),
      },
      { optional: ["caption"] },
    ),
    outputSchema: s.requiredObject("The accepted Weixin media message.", {
      messageId: s.nullableString("The server-assigned message identifier when returned."),
    }),
    providerPermissions: ["Upload and send media as the connected Weixin bot"],
  }),
  defineProviderAction(service, {
    name: "download_media",
    description: "Download and decrypt one image, voice, video, or file item returned by get_updates.",
    inputSchema: s.object(
      "A media item returned inside a Weixin message item_list.",
      {
        item: s.looseObject("The complete Weixin media item."),
        name: s.nonEmptyString("Optional output file name."),
      },
      { optional: ["name"] },
    ),
    outputSchema: s.requiredObject("The locally stored decrypted media.", { file: transitFileOutput }),
    providerPermissions: ["Download media received by the connected Weixin bot"],
  }),
  defineProviderAction(service, {
    name: "send_typing",
    description: "Start or stop the typing indicator for a Weixin conversation.",
    inputSchema: s.requiredObject("A conversation and typing state.", {
      userId: s.nonEmptyString("The Weixin user ID from an inbound message."),
      contextToken: s.nonEmptyString("The context_token from the inbound message."),
      status: s.stringEnum("Whether to start or stop the typing indicator.", ["typing", "cancel"]),
    }),
    outputSchema: s.requiredObject("The typing state accepted by Weixin.", {
      status: s.stringEnum("The typing state sent to Weixin.", ["typing", "cancel"]),
    }),
    providerPermissions: ["Update typing status as the connected Weixin bot"],
  }),
];
