import type { JsonSchema } from "../../../core/types.ts";
import type { UnifapiOperationDefinition } from "../operations.ts";

const browserUrlField: JsonSchema = {
  type: "string",
  minLength: 1,
  description: "Absolute http(s) URL of the page to render.",
};

const waitUntilField: JsonSchema = {
  type: "string",
  enum: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
  description:
    "When navigation is considered complete. `networkidle0` waits for the network to go idle (best for JavaScript-heavy pages); `load` is fastest.",
};

const timeoutMsField: JsonSchema = {
  type: "integer",
  minimum: 1000,
  maximum: 60000,
  description: "Navigation timeout in milliseconds (1000-60000).",
};

export const browserOperations: readonly UnifapiOperationDefinition[] = [
  {
    name: "render_html",
    operationId: "postBrowserHtml",
    description: "Render a page to HTML.",
    method: "POST",
    path: "/browser/html",
    pathFields: [],
    queryFields: [],
    bodyFields: ["url", "wait_until", "timeout_ms"],
    inputSchema: {
      type: "object",
      properties: {
        url: browserUrlField,
        wait_until: waitUntilField,
        timeout_ms: timeoutMsField,
      },
      additionalProperties: false,
      description: "The input payload for Render a page to HTML.",
      required: ["url"],
    },
    paginated: false,
  },
  {
    name: "extract_links",
    operationId: "postBrowserLinks",
    description: "Extract links from a page.",
    method: "POST",
    path: "/browser/links",
    pathFields: [],
    queryFields: [],
    bodyFields: ["url", "wait_until", "timeout_ms", "visible_links_only", "exclude_external_links"],
    inputSchema: {
      type: "object",
      properties: {
        url: browserUrlField,
        wait_until: waitUntilField,
        timeout_ms: timeoutMsField,
        visible_links_only: {
          type: "boolean",
          description: "Only return links visible in the rendered viewport.",
        },
        exclude_external_links: {
          type: "boolean",
          description: "Drop links that point to a different domain than the page.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Extract links from a page.",
      required: ["url"],
    },
    paginated: false,
  },
  {
    name: "render_markdown",
    operationId: "postBrowserMarkdown",
    description: "Render a page to Markdown.",
    method: "POST",
    path: "/browser/markdown",
    pathFields: [],
    queryFields: [],
    bodyFields: ["url", "wait_until", "timeout_ms"],
    inputSchema: {
      type: "object",
      properties: {
        url: browserUrlField,
        wait_until: waitUntilField,
        timeout_ms: timeoutMsField,
      },
      additionalProperties: false,
      description: "The input payload for Render a page to Markdown.",
      required: ["url"],
    },
    paginated: false,
  },
  {
    name: "capture_screenshot",
    operationId: "postBrowserScreenshot",
    description: "Capture a page screenshot.",
    method: "POST",
    path: "/browser/screenshot",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "url",
      "wait_until",
      "timeout_ms",
      "viewport",
      "full_page",
      "format",
      "quality",
      "selector",
      "omit_background",
    ],
    inputSchema: {
      type: "object",
      properties: {
        url: browserUrlField,
        wait_until: waitUntilField,
        timeout_ms: timeoutMsField,
        viewport: {
          type: "object",
          properties: {
            width: {
              type: "integer",
              minimum: 1,
              maximum: 3840,
              description: "Viewport width in CSS pixels.",
            },
            height: {
              type: "integer",
              minimum: 1,
              maximum: 3840,
              description: "Viewport height in CSS pixels.",
            },
          },
          required: ["width", "height"],
          description: "Browser viewport. Defaults to a standard desktop size.",
        },
        full_page: {
          type: "boolean",
          description: "Capture the full scrollable page instead of just the viewport.",
        },
        format: {
          type: "string",
          enum: ["png", "jpeg", "webp"],
          default: "png",
          description: "Output image format.",
        },
        quality: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "Compression quality (0-100). Only valid for `jpeg` and `webp`.",
        },
        selector: {
          type: "string",
          description: "Capture only the first element matching this CSS selector.",
        },
        omit_background: {
          type: "boolean",
          description: "Render a transparent background (ignored for `jpeg`).",
        },
      },
      additionalProperties: false,
      description: "The input payload for Capture a page screenshot.",
      required: ["url"],
    },
    paginated: false,
  },
];
