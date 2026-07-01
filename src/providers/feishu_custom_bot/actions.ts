import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "feishu_custom_bot";

const rawObjectSchema = s.looseObject({}, { description: "A raw Feishu object payload." });
const richTextTagSchema = s.looseObject({}, { description: "One Feishu rich-text tag object." });
const richTextParagraphSchema = s.array("One paragraph of Feishu rich-text tag objects.", richTextTagSchema, {
  minItems: 1,
});
const richTextLocaleSchema = s.looseRequiredObject(
  "One language block inside the Feishu post payload.",
  {
    title: s.string("The rich-text title."),
    content: s.array("The rich-text paragraphs grouped by line.", richTextParagraphSchema, { minItems: 1 }),
  },
  { optional: ["title"] },
);
const postPayloadBaseSchema = s.object(
  "The Feishu post payload sent as content.post. Include at least one of zh_cn or en_us.",
  {
    zh_cn: richTextLocaleSchema,
    en_us: richTextLocaleSchema,
  },
  { optional: ["zh_cn", "en_us"] },
);
const postPayloadSchema = {
  ...postPayloadBaseSchema,
  anyOf: [{ required: ["zh_cn"] }, { required: ["en_us"] }],
};
const sendResultSchema = s.object(
  "The normalized Feishu custom bot send result.",
  {
    code: s.integer("The Feishu response code. 0 means success."),
    msg: s.string("The Feishu response message."),
    data: rawObjectSchema,
    statusCode: s.integer("The legacy response code returned for backward compatibility."),
    statusMessage: s.string("The legacy response message returned for backward compatibility."),
  },
  { required: ["code", "msg", "data"], optional: ["statusCode", "statusMessage"] },
);

export const feishuCustomBotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_text_message",
    description: "Send a text message through the Feishu/Lark custom bot webhook.",
    inputSchema: s.requiredObject("Input for sending a Feishu text message.", {
      text: s.string("The text message content. You can include Feishu <at ...> tags inline.", {
        minLength: 1,
      }),
    }),
    outputSchema: sendResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_post_message",
    description: "Send a post rich-text message through the Feishu/Lark custom bot webhook.",
    inputSchema: s.requiredObject("Input for sending a Feishu post rich-text message.", {
      post: postPayloadSchema,
    }),
    outputSchema: sendResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_image_message",
    description: "Send an image message through the Feishu/Lark custom bot webhook.",
    inputSchema: s.requiredObject("Input for sending a Feishu image message.", {
      imageKey: s.string("The Feishu image_key obtained from the image upload API.", { minLength: 1 }),
    }),
    outputSchema: sendResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_share_chat_message",
    description: "Send a shared-chat card through the Feishu/Lark custom bot webhook.",
    inputSchema: s.requiredObject("Input for sending a Feishu shared-chat message.", {
      shareChatId: s.string("The Feishu chat ID used in the share_chat message payload.", { minLength: 1 }),
    }),
    outputSchema: sendResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_interactive_message",
    description: "Send an interactive card message through the Feishu/Lark custom bot webhook.",
    inputSchema: s.requiredObject("Input for sending a Feishu interactive card message.", {
      card: s.looseObject(
        {},
        { description: "The Feishu interactive card payload sent as the top-level card object." },
      ),
    }),
    outputSchema: sendResultSchema,
  }),
];

export type FeishuCustomBotActionName =
  | "send_text_message"
  | "send_post_message"
  | "send_image_message"
  | "send_share_chat_message"
  | "send_interactive_message";
