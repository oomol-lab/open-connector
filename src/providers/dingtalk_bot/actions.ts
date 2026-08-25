import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dingtalk_bot";

const sendResultSchema = s.requiredObject("The normalized DingTalk custom bot send result.", {
  errcode: s.integer("The DingTalk response code. 0 means success."),
  errmsg: s.string("The DingTalk response message."),
});
const msgUuidSchema = s.string("Optional idempotency key used to deduplicate retries.", { minLength: 1 });
const atFields = {
  atMobiles: s.stringArray("Optional mobile numbers to mention in the group.", { minItems: 1 }),
  atUserIds: s.stringArray("Optional DingTalk user IDs to mention in the group.", { minItems: 1 }),
  isAtAll: s.boolean("Whether to mention everyone in the group."),
};
const buttonOrientationSchema = s.stringEnum(["vertical", "horizontal"], {
  description: "How to arrange actionCard buttons. vertical maps to DingTalk 0, horizontal maps to 1.",
});
const actionCardButtonSchema = s.requiredObject("One actionCard button.", {
  title: s.string("The button title.", { minLength: 1 }),
  actionUrl: s.string("The URL opened after clicking the button.", { minLength: 1 }),
});
const feedCardLinkSchema = s.requiredObject("One feedCard link item.", {
  title: s.string("The link title.", { minLength: 1 }),
  messageUrl: s.string("The URL opened after clicking the link.", { minLength: 1 }),
  picUrl: s.string("The image URL shown for the link.", { minLength: 1 }),
});

export const dingtalkBotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_text_message",
    description: "Send a text message through the DingTalk custom bot webhook.",
    inputSchema: s.object(
      "Input for sending a DingTalk text message.",
      {
        msgUuid: msgUuidSchema,
        content: s.string("The text message content.", { minLength: 1 }),
        ...atFields,
      },
      { required: ["content"], optional: ["msgUuid", "atMobiles", "atUserIds", "isAtAll"] },
    ),
    outputSchema: sendResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_link_message",
    description: "Send a link message through the DingTalk custom bot webhook.",
    inputSchema: s.object(
      "Input for sending a DingTalk link message.",
      {
        msgUuid: msgUuidSchema,
        title: s.string("The message title.", { minLength: 1 }),
        text: s.string("The message text shown in the card.", { minLength: 1 }),
        messageUrl: s.string("The URL opened after clicking the message.", { minLength: 1 }),
        picUrl: s.string("The optional image URL shown in the message.", { minLength: 1 }),
      },
      { required: ["title", "text", "messageUrl"], optional: ["msgUuid", "picUrl"] },
    ),
    outputSchema: sendResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_markdown_message",
    description: "Send a markdown message through the DingTalk custom bot webhook.",
    inputSchema: s.object(
      "Input for sending a DingTalk markdown message.",
      {
        msgUuid: msgUuidSchema,
        title: s.string("The title shown in the conversation preview.", { minLength: 1 }),
        text: s.string("The markdown message body.", { minLength: 1 }),
        ...atFields,
      },
      { required: ["title", "text"], optional: ["msgUuid", "atMobiles", "atUserIds", "isAtAll"] },
    ),
    outputSchema: sendResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_action_card_message",
    description: "Send an actionCard message through the DingTalk custom bot webhook.",
    inputSchema: s.oneOf(
      [
        s.object(
          "Input for sending a single-action DingTalk actionCard message.",
          {
            cardMode: s.literal("single", { description: "Use one overall action button." }),
            msgUuid: msgUuidSchema,
            title: s.string("The actionCard title.", { minLength: 1 }),
            text: s.string("The markdown actionCard body.", { minLength: 1 }),
            singleTitle: s.string("The single action button title.", { minLength: 1 }),
            singleUrl: s.string("The URL opened after clicking the single action.", { minLength: 1 }),
            buttonOrientation: buttonOrientationSchema,
          },
          {
            required: ["cardMode", "title", "text", "singleTitle", "singleUrl"],
            optional: ["msgUuid", "buttonOrientation"],
          },
        ),
        s.object(
          "Input for sending a multi-button DingTalk actionCard message.",
          {
            cardMode: s.literal("buttons", { description: "Use multiple independent action buttons." }),
            msgUuid: msgUuidSchema,
            title: s.string("The actionCard title.", { minLength: 1 }),
            text: s.string("The markdown actionCard body.", { minLength: 1 }),
            buttons: s.array("The action buttons shown on the card.", actionCardButtonSchema, { minItems: 1 }),
            buttonOrientation: buttonOrientationSchema,
          },
          { required: ["cardMode", "title", "text", "buttons"], optional: ["msgUuid", "buttonOrientation"] },
        ),
      ],
      { description: "Input for sending a DingTalk actionCard message." },
    ),
    outputSchema: sendResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_feed_card_message",
    description: "Send a feedCard message through the DingTalk custom bot webhook.",
    inputSchema: s.object(
      "Input for sending a DingTalk feedCard message.",
      {
        msgUuid: msgUuidSchema,
        links: s.array("The links included in the feedCard.", feedCardLinkSchema, { minItems: 1 }),
      },
      { required: ["links"], optional: ["msgUuid"] },
    ),
    outputSchema: sendResultSchema,
  }),
];
