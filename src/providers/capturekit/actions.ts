import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "capturekit";

const transitFileSchema = s.requiredObject("The screenshot stored in local transit storage.", {
  fileId: s.nonEmptyString("The local transit file identifier."),
  downloadUrl: s.url("The local URL used to download the screenshot."),
  sizeBytes: s.nonNegativeInteger("The screenshot size in bytes."),
  name: s.nonEmptyString("The screenshot filename."),
  mimeType: s.nonEmptyString("The screenshot MIME type, such as image/png or application/pdf."),
});
const captureKitPageMetadataSchema = s.looseObject(
  "Page metadata.",
  {
    title: s.nullableString("Page title."),
    description: s.nullableString("Meta description."),
    favicon: s.nullableString("Favicon URL."),
    ogImage: s.nullableString("Open Graph image URL."),
  },
  { optional: ["title", "description", "favicon", "ogImage"] },
);

const captureKitPageLinksSchema = s.looseObject(
  "Links found on the page.",
  {
    internal: s.array("Links to the same site.", s.string()),
    external: s.array("Links to other sites.", s.string()),
    social: s.array("Links to social profiles.", s.string()),
  },
  { optional: ["internal", "external", "social"] },
);

export const capturekitActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "screenshot",
    operationType: "read",
    description:
      "Capture a public web page as a PNG, JPEG, WebP image or a PDF, by viewport, full page or CSS selector, and store it as a file.",
    inputSchema: s.actionInput(
      {
        url: s.nonEmptyString('URL of the page (e.g., "https://example.com").'),
        format: s.stringEnum('Output format: png, jpeg, webp or pdf (defaults to "png").', [
          "png",
          "jpeg",
          "webp",
          "pdf",
        ]),
        fullPage: s.boolean("Capture the entire page instead of the visible viewport."),
        device: s.stringEnum('Device to emulate (e.g., "iphone_14_pro").', [
          "iphone_14_pro",
          "iphone_14_pro_max",
          "iphone_13_pro_max",
          "iphone_13_mini",
          "iphone_12",
          "iphone_x",
          "ipad",
          "pixel_7_pro",
          "pixel_6a",
          "pixel_5",
          "galaxy_s23_ultra",
          "galaxy_s23",
          "galaxy_s8",
          "galaxy_fold4",
          "huawei_mate_50_pro",
          "huawei_p60_pro",
          "redmi_note_12_pro",
          "redmi_note_11",
        ]),
        selector: s.nonEmptyString('CSS selector of one element to capture (e.g., "#pricing").'),
        viewportWidth: s.integer("Width of the browser viewport in pixels (defaults to 1280).", { minimum: 1 }),
        viewportHeight: s.integer("Height of the browser viewport in pixels (defaults to 1024).", { minimum: 1 }),
        delay: s.number("Seconds to wait before capturing (defaults to 0).", { minimum: 0 }),
        removeCookieBanners: s.boolean("Remove cookie banners before capturing."),
        removeAds: s.boolean("Remove ads before capturing."),
      },
      ["url"],
      "Input for Take Screenshot.",
    ),
    outputSchema: s.actionOutput({ file: transitFileSchema }, "The screenshot stored in local transit storage."),
  }),
  defineProviderAction(service, {
    name: "extract_content",
    operationType: "read",
    description:
      "Render a web page and get its title, description, favicon, Open Graph image, internal, external and social links, and optionally its Markdown.",
    inputSchema: s.actionInput(
      {
        url: s.nonEmptyString('URL of the page (e.g., "https://example.com").'),
        includeMarkdown: s.boolean("Include the page content as Markdown."),
        removeCookieBanners: s.boolean("Remove cookie banners before capturing."),
        removeAds: s.boolean("Remove ads before capturing."),
      },
      ["url"],
      "Input for Extract Content.",
    ),
    outputSchema: s.looseObject(
      "The CaptureKit response for Extract Content.",
      {
        data: s.looseObject(
          "Data returned by CaptureKit.",
          {
            metadata: captureKitPageMetadataSchema,
            links: captureKitPageLinksSchema,
            markdown: s.nullableString("Page content as Markdown, when requested."),
          },
          { optional: ["metadata", "links", "markdown"] },
        ),
      },
      { optional: ["data"] },
    ),
  }),
  defineProviderAction(service, {
    name: "fetch_html",
    operationType: "read",
    description: "Fetch the raw HTML of a public page over plain HTTP, without a browser.",
    inputSchema: s.actionInput(
      {
        url: s.nonEmptyString('URL of the page, with http or https (e.g., "https://example.com").'),
      },
      ["url"],
      "Input for Fetch HTML.",
    ),
    outputSchema: s.actionOutput({ html: s.string("Raw HTML of the page.") }, "The page HTML returned by CaptureKit."),
  }),
  defineProviderAction(service, {
    name: "analyze_website",
    operationType: "read",
    description:
      "Read a website and get an AI summary of its value proposition, business type, key features, categories, use cases, audience and contact details.",
    inputSchema: s.actionInput(
      {
        url: s.nonEmptyString('URL of the page (e.g., "https://example.com").'),
        customPrompt: s.nonEmptyString('Extra instructions for the analysis (e.g., "Focus on pricing").'),
      },
      ["url"],
      "Input for Analyze Website.",
    ),
    outputSchema: s.looseObject(
      "The CaptureKit response for Analyze Website.",
      {
        data: s.looseObject(
          "Data returned by CaptureKit.",
          {
            summary: s.nullableString("Summary of what the website offers."),
            valueProposition: s.nullableString("Value proposition of the website."),
            businessType: s.nullableString("Type of business."),
            targetAudience: s.nullableString("Audience the website addresses."),
            callToAction: s.nullableString("Main call to action of the website."),
            keyFeatures: s.array("Key features of the product or service.", s.string()),
            categories: s.array("Categories of the website.", s.string()),
            useCases: s.array("Use cases the website describes.", s.string()),
            emails: s.array("Email addresses found on the website.", s.string()),
            phoneNumbers: s.array("Phone numbers found on the website.", s.string()),
          },
          {
            optional: [
              "summary",
              "valueProposition",
              "businessType",
              "targetAudience",
              "callToAction",
              "keyFeatures",
              "categories",
              "useCases",
              "emails",
              "phoneNumbers",
            ],
          },
        ),
      },
      { optional: ["data"] },
    ),
  }),
];
