import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "quickchart" as const;

const chartConfigSchema = s.looseObject("The Chart.js configuration object to render with QuickChart.");

const chartWidthSchema = s.integer("The chart image width in pixels.", {
  minimum: 1,
  maximum: 4000,
});

const chartHeightSchema = s.integer("The chart image height in pixels.", {
  minimum: 1,
  maximum: 4000,
});

const devicePixelRatioSchema = s.integer("The output device pixel ratio. QuickChart accepts 1 or 2.", {
  minimum: 1,
  maximum: 2,
});

const chartFormatSchema = s.stringEnum("The image format QuickChart should render.", [
  "png",
  "webp",
  "jpg",
  "svg",
  "pdf",
]);

const chartVersionSchema = s.string(
  "The Chart.js version to use, such as 2, 3, 4, or a valid Chart.js version string.",
  { minLength: 1 },
);

const backgroundColorSchema = s.string(
  "The chart canvas background color as a CSS color, such as transparent, white, or #ffffff.",
  { minLength: 1 },
);

const chartRequestFields = {
  chart: chartConfigSchema,
  width: chartWidthSchema,
  height: chartHeightSchema,
  devicePixelRatio: devicePixelRatioSchema,
  backgroundColor: backgroundColorSchema,
  version: chartVersionSchema,
  format: chartFormatSchema,
};

const chartRequestOptionalFields = [
  "width",
  "height",
  "devicePixelRatio",
  "backgroundColor",
  "version",
  "format",
] as const;

const chartUrlOutputSchema = s.object("The generated QuickChart chart URL.", {
  url: s.url("The QuickChart URL that renders the chart image."),
});

const shortUrlOutputSchema = s.object("The QuickChart short URL creation response.", {
  success: s.boolean("Whether QuickChart reported the short URL creation as successful."),
  url: s.nullable(s.url("The generated short URL for rendering the chart.")),
  raw: s.unknown("The raw JSON payload returned by QuickChart."),
});

const qrUrlOutputSchema = s.object("The generated QuickChart QR code URL.", {
  url: s.url("The QuickChart URL that renders the QR code image."),
});

export const quickchartActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "build_chart_url",
    description: "Build a QuickChart image URL from a Chart.js configuration without downloading the rendered image.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for building a QuickChart chart image URL.", chartRequestFields, {
      optional: chartRequestOptionalFields,
    }),
    outputSchema: chartUrlOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_chart_short_url",
    description:
      "Create a QuickChart short URL for a Chart.js configuration and return the URL plus creation metadata.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for creating a QuickChart chart short URL.",
      {
        ...chartRequestFields,
        key: s.string("An optional QuickChart API key for paid-account short URL retention.", {
          minLength: 1,
        }),
      },
      { optional: [...chartRequestOptionalFields, "key"] },
    ),
    outputSchema: shortUrlOutputSchema,
  }),
  defineProviderAction(service, {
    name: "build_qr_url",
    description: "Build a QuickChart QR code image URL for text, URLs, or other compact QR payloads.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for building a QuickChart QR code URL.",
      {
        text: s.string("The text or URL to encode in the QR code.", { minLength: 1 }),
        size: s.integer("The QR code width and height in pixels.", {
          minimum: 1,
          maximum: 4000,
        }),
        margin: s.integer("The QR code margin in modules.", {
          minimum: 0,
          maximum: 100,
        }),
        dark: s.string("The dark module color as a CSS color or hex color.", { minLength: 1 }),
        light: s.string("The light module color as a CSS color or hex color.", { minLength: 1 }),
        ecLevel: s.stringEnum("The QR code error correction level.", ["L", "M", "Q", "H"]),
        format: s.stringEnum("The QR code image format.", ["png", "svg"]),
      },
      { optional: ["size", "margin", "dark", "light", "ecLevel", "format"] },
    ),
    outputSchema: qrUrlOutputSchema,
  }),
];
