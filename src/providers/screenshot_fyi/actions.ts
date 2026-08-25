import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "screenshot_fyi";

const positiveIntegerSchema = (description: string) => s.integer(description, { minimum: 1 });

export const screenshotFyiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "take_screenshot",
    description: "Capture a website screenshot with screenshot.fyi and return the generated URL.",
    inputSchema: s.object(
      "The input payload for capturing a website screenshot with screenshot.fyi.",
      {
        url: s.url("The complete website URL to capture, including the protocol."),
        width: positiveIntegerSchema("The viewport width in pixels."),
        height: positiveIntegerSchema("The viewport height in pixels."),
        fullPage: s.boolean("Whether to capture the full scrollable page instead of only the viewport."),
        darkMode: s.boolean("Whether to render the target page with dark mode enabled."),
        disableCookieBanners: s.boolean("Whether screenshot.fyi should hide cookie banners before capture."),
      },
      { optional: ["width", "height", "fullPage", "darkMode", "disableCookieBanners"] },
    ),
    outputSchema: s.object("The output payload for a screenshot.fyi screenshot capture.", {
      url: s.url("The generated screenshot URL returned by screenshot.fyi."),
    }),
  }),
];
