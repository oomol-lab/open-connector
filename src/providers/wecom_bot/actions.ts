import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wecom_bot";

const mentionUserIdSchema = s.nonEmptyString("One WeCom user ID to mention, or `@all` to mention everyone.");
const mentionMobileSchema = s.nonEmptyString("One phone number to mention, or `@all` to mention everyone.");
const newsArticleSchema = s.object(
  "One WeCom news article payload.",
  {
    title: s.nonEmptyString("The article title. Titles longer than 128 bytes are truncated by WeCom."),
    description: s.string(
      "The optional article description. Descriptions longer than 512 bytes are truncated by WeCom.",
    ),
    url: s.nonEmptyString("The URL opened after the user clicks the article."),
    picurl: s.nonEmptyString("The optional JPG or PNG image URL shown for the article."),
  },
  { optional: ["description", "picurl"] },
);
const sendResultSchema = s.actionOutput(
  {
    errcode: s.integer("The WeCom response code. `0` means success."),
    errmsg: s.string("The WeCom response message."),
  },
  "The normalized WeCom bot send result.",
);

export const wecomBotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_text_message",
    description: "Send a text message through the WeCom bot webhook.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        content: s.nonEmptyString("The text content. The value can include WeCom `<@userid>` mention syntax."),
        mentionedList: s.array("Optional user IDs to mention explicitly.", mentionUserIdSchema, { minItems: 1 }),
        mentionedMobileList: s.array("Optional mobile numbers to mention explicitly.", mentionMobileSchema, {
          minItems: 1,
        }),
      },
      ["content"],
      "Input for sending a WeCom text message.",
    ),
    outputSchema: sendResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_markdown_message",
    description: "Send a markdown message through the WeCom bot webhook.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { content: s.nonEmptyString("The markdown content encoded as UTF-8.") },
      ["content"],
      "Input for sending a WeCom markdown message.",
    ),
    outputSchema: sendResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_markdown_v2_message",
    description: "Send a markdown_v2 message through the WeCom bot webhook.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        content: s.nonEmptyString(
          "The markdown_v2 content encoded as UTF-8. WeCom markdown_v2 does not support `@` mentions.",
        ),
      },
      ["content"],
      "Input for sending a WeCom markdown_v2 message.",
    ),
    outputSchema: sendResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_image_message",
    description: "Send an image message through the WeCom bot webhook.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        base64: s.nonEmptyString(
          "The base64-encoded image bytes. The raw image must be a JPG or PNG no larger than 2 MB.",
        ),
        md5: s.stringPattern("^[a-fA-F0-9]{32}$", {
          description: "The MD5 digest of the raw image bytes before base64 encoding.",
        }),
      },
      ["base64", "md5"],
      "Input for sending a WeCom image message.",
    ),
    outputSchema: sendResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_news_message",
    description: "Send a news message through the WeCom bot webhook.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        articles: s.array("The news articles to send. WeCom supports 1 to 8 articles per message.", newsArticleSchema, {
          minItems: 1,
          maxItems: 8,
        }),
      },
      ["articles"],
      "Input for sending a WeCom news message.",
    ),
    outputSchema: sendResultSchema,
  }),
];

export type WecomBotActionName =
  | "send_text_message"
  | "send_markdown_message"
  | "send_markdown_v2_message"
  | "send_image_message"
  | "send_news_message";
