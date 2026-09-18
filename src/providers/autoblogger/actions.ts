import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "autoblogger";

const yesNoSchema = s.stringEnum("Whether this Autoblogging.ai option is enabled.", ["yes", "no"]);

const articleLanguageSchema = s.stringEnum("The language for the generated article.", [
  "English",
  "EnglishUK",
  "Arabic",
  "Bulgarian",
  "Chinese",
  "Danish",
  "Dutch",
  "Estonian",
  "Finnish",
  "French",
  "German",
  "Greek",
  "Hindi",
  "Hungarian",
  "Indonesian",
  "Italian",
  "Japanese",
  "Korean",
  "Latvian",
  "Lithuanian",
  "Norwegian",
  "Polish",
  "Portuguese",
  "Portuguese_BR",
  "Romanian",
  "Russian",
  "Slovak",
  "Slovenian",
  "Spanish",
  "Swedish",
  "Turkish",
  "Vietnamese",
]);

const createArticleInputSchema = s.object(
  "Input parameters for creating an Autoblogging.ai article generation job.",
  {
    title: s.nonEmptyString("The meaningful and descriptive title for the article."),
    project_name: s.nonEmptyString("Optional Autoblogging.ai project name used for organization."),
    language: articleLanguageSchema,
    length: s.stringEnum("Desired article length.", ["short", "medium", "long"]),
    tone_of_voice: s.stringEnum("Narrative perspective for the article.", [
      "first-person",
      "second-person",
      "third-person",
    ]),
    writing_style: s.stringEnum("Writing style to use for the article.", [
      "premium_writing_style_1",
      "conversational",
      "professional",
      "witty",
      "snippet_optimizer",
      "less_ai_words",
    ]),
    type_of_article: s.stringEnum("Type of article to generate.", [
      "informative",
      "listicle",
      "places",
      "service_pages",
    ]),
    faqs: yesNoSchema,
    imagegeneration: s.stringEnum(
      "Whether to generate images for the article. This costs one extra credit when enabled.",
      ["yes", "no"],
    ),
    godlikemode: s.stringEnum("Whether to use enhanced article quality. This costs one extra credit when enabled.", [
      "yes",
      "no",
    ]),
    serp_location: s.string("Two-letter country code for SERP analysis, such as us, uk, or de.", {
      minLength: 2,
      maxLength: 2,
    }),
    outlinefromcompetition: yesNoSchema,
    keytakeaways: yesNoSchema,
    externallinks: yesNoSchema,
    videoembed: yesNoSchema,
    source_context: s.string("Additional context for article generation. Use na when no source context is needed.", {
      minLength: 1,
      maxLength: 300,
    }),
    wordpresspush: yesNoSchema,
    wp_siteurl: s.string("WordPress site URL when wordpresspush is yes."),
    wp_username: s.string("WordPress username when wordpresspush is yes."),
    wp_password: s.string("WordPress password when wordpresspush is yes."),
    wp_category: s.string("WordPress category name when wordpresspush is yes."),
    wp_status: s.stringEnum("WordPress post status when wordpresspush is yes.", ["publish", "draft"]),
    wp_customtext: s.string("Custom WordPress text, or na when unused."),
    applyautogenerateslugs: yesNoSchema,
    applyautogeneratetitles: yesNoSchema,
    combotpush: yesNoSchema,
    combot_triggerid: s.string("ComBot trigger ID, or na when unused."),
    intense_optimize: yesNoSchema,
    ai_proofreader: s.stringEnum("Whether to use AI proofreading. This costs one extra credit when enabled.", [
      "yes",
      "no",
    ]),
    proofreading_guidelines: s.string("Proofreading guidelines when ai_proofreader is yes, or na when unused.", {
      minLength: 1,
      maxLength: 3000,
    }),
    infographics: s.stringEnum("Whether to generate infographics. This costs one extra credit when enabled.", [
      "yes",
      "no",
    ]),
  },
  {
    optional: [
      "project_name",
      "language",
      "length",
      "tone_of_voice",
      "writing_style",
      "type_of_article",
      "faqs",
      "imagegeneration",
      "godlikemode",
      "serp_location",
      "outlinefromcompetition",
      "keytakeaways",
      "externallinks",
      "videoembed",
      "source_context",
      "wordpresspush",
      "wp_siteurl",
      "wp_username",
      "wp_password",
      "wp_category",
      "wp_status",
      "wp_customtext",
      "applyautogenerateslugs",
      "applyautogeneratetitles",
      "combotpush",
      "combot_triggerid",
      "intense_optimize",
      "ai_proofreader",
      "proofreading_guidelines",
      "infographics",
    ],
  },
);

const createArticleOutputSchema = s.object(
  "Autoblogging.ai article creation result.",
  {
    status: s.string("Autoblogging.ai creation status."),
    article_id: s.string("Article ID token to pass to fetch_article."),
    credits_used: s.number("Credits consumed by the creation request."),
    credits_remaining: s.number("Credits remaining after the creation request."),
  },
  { optional: ["credits_used", "credits_remaining"] },
);

const fetchArticleOutputSchema = s.object(
  "Autoblogging.ai article generation status and completed content when available.",
  {
    status: s.stringEnum("Current article generation status.", ["pending", "completed", "failed"]),
    message: s.string("Status message when the article is still being generated."),
    final_title: s.string("Final generated article title when the article is completed."),
    final_article: s.string("Final generated article content when the article is completed."),
    error_message: s.string("Failure reason when article generation failed."),
  },
  { optional: ["message", "final_title", "final_article", "error_message"] },
);

export const autobloggerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_article",
    operationType: "write",
    description: "Create an Autoblogging.ai article generation job and return the article ID plus credit metadata.",
    inputSchema: createArticleInputSchema,
    outputSchema: createArticleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "fetch_article",
    operationType: "read",
    description:
      "Fetch an Autoblogging.ai article generation job by article ID and return pending, completed, or failed status.",
    inputSchema: s.actionInput({
      url_token: s.nonEmptyString("Article ID token returned by create_article."),
    }),
    outputSchema: fetchArticleOutputSchema,
  }),
];
