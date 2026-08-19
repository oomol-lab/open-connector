import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "html_to_image";

const sharedSynchronousInputShape: Record<string, JsonSchema> = {
  css: s.string("Additional CSS to inject before the image is rendered."),
  width: s.integer("The viewport width in pixels from 1 to 5000.", { minimum: 1, maximum: 5000 }),
  height: s.integer("The viewport height in pixels from 1 to 5000.", { minimum: 1, maximum: 5000 }),
  fullpage: s.boolean("Whether to capture the full page height instead of only the viewport height."),
  dpi: s.integer("The device pixel ratio from 1 to 4. When fullpage is true, HTML to Image forces this to 1.", {
    minimum: 1,
    maximum: 4,
  }),
  wait_for_selector: s.nonEmptyString("A CSS selector that must appear in the DOM before capture starts."),
  ms_delay: s.integer("A fixed delay in milliseconds before capture, from 0 to 5000.", {
    minimum: 0,
    maximum: 5000,
  }),
};

const sharedSynchronousOptionalFields = ["css", "width", "height", "fullpage", "dpi", "wait_for_selector", "ms_delay"];

const synchronousImageOutputSchema = s.object(
  "The synchronous HTML to Image result returned by the connector.",
  {
    success: s.boolean("Whether HTML to Image reported the request as successful."),
    credits_remaining: s.integer("The remaining image credits after the request."),
    id: s.string("The HTML to Image image identifier."),
    url: s.url("The generated image URL."),
  },
  { optional: ["credits_remaining"] },
);

export const htmlToImageActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "convert_html_to_image",
    description: "Convert raw HTML and optional CSS to an image with HTML to Image and return the generated image URL.",
    inputSchema: s.object(
      "Input parameters for synchronously converting raw HTML and CSS into an image.",
      {
        html: s.nonEmptyString("The HTML content to render. This can include inline CSS and JavaScript."),
        ...sharedSynchronousInputShape,
      },
      { optional: sharedSynchronousOptionalFields },
    ),
    outputSchema: synchronousImageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "capture_website_screenshot",
    description: "Capture a public webpage with HTML to Image and return the generated screenshot URL.",
    inputSchema: s.object(
      "Input parameters for synchronously capturing a website screenshot.",
      {
        url: s.url("The public webpage URL to capture, including the protocol."),
        selector: s.nonEmptyString("A CSS selector for capturing a specific element on the target page."),
        ...sharedSynchronousInputShape,
      },
      { optional: [...sharedSynchronousOptionalFields, "selector"] },
    ),
    outputSchema: synchronousImageOutputSchema,
  }),
];
