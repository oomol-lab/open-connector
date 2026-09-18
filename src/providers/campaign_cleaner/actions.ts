import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "campaign_cleaner";

const campaignLifecycleStatusSchema = s.stringEnum("The Campaign Cleaner campaign lifecycle status.", [
  "processing",
  "completed",
  "paused",
]);

const campaignListItemSchema = s.object("A Campaign Cleaner campaign summary.", {
  id: s.string("The Campaign Cleaner campaign identifier."),
  campaign_name: s.string("The saved campaign name."),
  status: campaignLifecycleStatusSchema,
  date_added: s.string("The timestamp when the campaign was saved or submitted."),
});

const surroundingDivInputSchema = s.object(
  "Optional surrounding div settings applied to the submitted campaign.",
  {
    max_width: s.positiveInteger("The surrounding div max width in pixels."),
    text_align: s.stringEnum("The text alignment applied inside the surrounding div.", ["left", "center", "right"]),
    font_size: s.positiveInteger("The default surrounding div font size in pixels."),
    center_to_parent: s.boolean("Whether the surrounding div should be centered within its parent."),
  },
  { optional: ["max_width", "text_align", "font_size", "center_to_parent"] },
);

const sendCampaignInputSchema = s.object(
  "The input payload for submitting a campaign to Campaign Cleaner.",
  {
    campaign_html: s.nonEmptyString("The full HTML content of the email campaign."),
    campaign_name: s.nonEmptyString("The saved name of the email campaign."),
    adjust_font_colors: s.boolean("Whether Campaign Cleaner should normalize spam-triggering font colors."),
    adjust_font_size: s.boolean("Whether Campaign Cleaner should enforce the configured font size bounds."),
    convert_h_to_p_tags: s.boolean("Whether header tags should be converted into paragraph tags."),
    custom_info: s.string("Custom caller metadata returned later by get_campaign.", { maxLength: 500 }),
    host_extensionless_images: s.boolean(
      "Whether extensionless images should be hosted when resize-and-host is enabled.",
    ),
    inline_css: s.boolean("Whether CSS should be inlined into each HTML element."),
    inline_css_important: s.boolean("Whether inlined CSS should include the !important flag."),
    media_queries_important: s.boolean("Whether media query rules should be marked as !important."),
    image_max_width: s.positiveInteger("The maximum width in pixels applied to all images."),
    min_font_size_allowed: s.integer("The minimum allowed font size in pixels.", { minimum: 1, maximum: 99 }),
    max_font_size_allowed: s.integer("The maximum allowed font size in pixels.", { minimum: 1, maximum: 99 }),
    preserve_media_queries: s.boolean("Whether media queries should be preserved in the returned HTML."),
    relative_links_base_url: s.url("The absolute base URL used to expand relative links in the campaign."),
    remove_classes_and_ids: s.boolean("Whether class and ID attributes should be removed after CSS inlining."),
    remove_comments: s.boolean("Whether HTML and CSS comments should be removed."),
    remove_control_non_printable: s.boolean("Whether control and non-printable characters should be removed."),
    remove_css_inheritance: s.boolean("Whether inherited CSS should be removed after inlining."),
    remove_image_height: s.boolean("Whether fixed image heights should be removed."),
    remove_successive_punctuation: s.boolean("Whether repeated punctuation should be collapsed to a single character."),
    replace_diacritics: s.boolean("Whether diacritic characters should be replaced with ASCII equivalents."),
    replace_non_ascii_characters: s.boolean("Whether non-ASCII characters should be replaced with ASCII equivalents."),
    resize_and_host: s.boolean("Whether eligible images should be resized, converted, and hosted by Campaign Cleaner."),
    surrounding_div: surroundingDivInputSchema,
    webhook_url: s.url("An absolute webhook URL that receives the finished campaign analysis."),
  },
  {
    optional: [
      "adjust_font_colors",
      "adjust_font_size",
      "convert_h_to_p_tags",
      "custom_info",
      "host_extensionless_images",
      "inline_css",
      "inline_css_important",
      "media_queries_important",
      "image_max_width",
      "min_font_size_allowed",
      "max_font_size_allowed",
      "preserve_media_queries",
      "relative_links_base_url",
      "remove_classes_and_ids",
      "remove_comments",
      "remove_control_non_printable",
      "remove_css_inheritance",
      "remove_image_height",
      "remove_successive_punctuation",
      "replace_diacritics",
      "replace_non_ascii_characters",
      "resize_and_host",
      "surrounding_div",
      "webhook_url",
    ],
  },
);

const campaignIdInputSchema = s.object("The input payload for referencing one Campaign Cleaner campaign.", {
  campaign_id: s.nonEmptyString("The Campaign Cleaner campaign identifier."),
});

const getCampaignInputSchema = s.object(
  "The input payload for retrieving one Campaign Cleaner campaign.",
  {
    campaign_id: s.nonEmptyString("The Campaign Cleaner campaign identifier."),
    minimize_html: s.boolean("Whether the returned campaign HTML should be minimized."),
  },
  { optional: ["minimize_html"] },
);

const emptyInputSchema = s.object("This action does not require any input.", {});

export const campaignCleanerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_campaign",
    operationType: "write",
    description: "Submit an email campaign HTML payload for Campaign Cleaner analysis and processing.",
    inputSchema: sendCampaignInputSchema,
    outputSchema: s.object("The output payload returned after submitting a campaign.", {
      campaign: s.object("The created campaign reference.", {
        id: s.string("The Campaign Cleaner campaign identifier."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_campaign_status",
    operationType: "read",
    description: "Fetch the current processing status of one submitted Campaign Cleaner campaign.",
    inputSchema: campaignIdInputSchema,
    outputSchema: s.object("The current processing status returned by Campaign Cleaner.", {
      campaign_status: campaignListItemSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    operationType: "read",
    description: "Retrieve the full Campaign Cleaner analysis payload for one saved campaign.",
    inputSchema: getCampaignInputSchema,
    outputSchema: s.object("The full campaign analysis returned by Campaign Cleaner.", {
      campaign: s.looseObject("The full Campaign Cleaner campaign analysis object."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_campaign_pdf_analysis",
    operationType: "read",
    description: "Download a Campaign Cleaner PDF analysis report and return it as a transit file.",
    inputSchema: campaignIdInputSchema,
    outputSchema: s.object("The downloaded Campaign Cleaner PDF analysis report.", {
      content: s.object("The downloadable Campaign Cleaner PDF report.", {
        fileId: s.string("The local transit file identifier for the PDF report."),
        downloadUrl: s.string("The local transit file download URL for the PDF report."),
        sizeBytes: s.number("The PDF report size in bytes."),
        name: s.string("The filename of the downloaded PDF report."),
        mimeType: s.string("The MIME type of the downloaded PDF report."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_campaigns",
    operationType: "read",
    description: "List saved Campaign Cleaner campaigns together with their current processing status.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The list of saved Campaign Cleaner campaigns.", {
      campaigns: s.array("The saved campaigns visible to the current API key.", campaignListItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_credits",
    operationType: "read",
    description: "Get the remaining Campaign Cleaner credits available to the current API key.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The Campaign Cleaner credit balance.", {
      credits: s.number("The remaining Campaign Cleaner credits."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_campaign",
    operationType: "destructive",
    description: "Delete one saved Campaign Cleaner campaign by campaign ID.",
    inputSchema: campaignIdInputSchema,
    outputSchema: s.object(
      "The delete result returned by Campaign Cleaner.",
      {
        status: s.stringEnum("Whether Campaign Cleaner deleted the campaign successfully.", ["success", "failure"]),
        error: s.string("The upstream failure reason when the delete request is unsuccessful."),
      },
      { optional: ["error"] },
    ),
  }),
];
