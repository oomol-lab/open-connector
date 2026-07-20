import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "latchshot";

const planSchema = s.nonEmptyString(
  "The current Latchshot plan identifier. Known values are trial, launch, build, and scale; newer tiers are passed through unchanged.",
);

const transitFileSchema = s.requiredObject("The rendered artifact stored in local transit storage.", {
  fileId: s.nonEmptyString("The local transit file identifier."),
  downloadUrl: s.url("The local URL used to download the rendered artifact."),
  sizeBytes: s.nonNegativeInteger("The artifact size in bytes."),
  name: s.nonEmptyString("The artifact filename."),
  mimeType: s.stringEnum("The artifact MIME type.", ["image/png", "image/jpeg", "application/pdf"]),
});

const diagnosticsSchema = s.object(
  "Bounded render diagnostics returned in Latchshot response headers.",
  {
    renderMs: s.nonNegativeInteger("The server-side render duration in milliseconds."),
    navigation: s.stringEnum("Whether browser navigation completed before capture.", ["complete", "timed-out"]),
    fonts: s.stringEnum("Whether the page used its original fonts or a fallback state.", ["original", "fallback"]),
    scripts: s.stringEnum("Whether page scripts stayed active or were paused by the fallback path.", [
      "active",
      "paused",
    ]),
  },
  { optional: ["renderMs", "navigation", "fonts", "scripts"] },
);

const quotaSchema = s.object(
  "The successful-render quota snapshot returned with the artifact.",
  {
    limit: s.nonNegativeInteger("The successful-render allowance for the current UTC calendar month."),
    remaining: s.nonNegativeInteger("The successful renders remaining in the current month."),
    resetAt: s.dateTime("The start of the next UTC calendar month."),
  },
  { optional: ["limit", "remaining", "resetAt"] },
);

const captureInputSchema = s.object(
  "Input parameters for one bounded public-page screenshot or PDF render.",
  {
    url: s.url(
      "The public HTTP or HTTPS page URL. Private, loopback, link-local, credential-bearing, and non-web-port targets are rejected.",
    ),
    kind: s.stringEnum(["screenshot", "pdf"], {
      default: "screenshot",
      description: "The artifact family to render.",
    }),
    format: s.stringEnum(["png", "jpeg"], {
      default: "png",
      description: "The image format for screenshots. PDF renders always return PDF.",
    }),
    width: s.integer({
      minimum: 320,
      maximum: 2560,
      default: 1440,
      description: "The browser viewport width in CSS pixels.",
    }),
    height: s.integer({
      minimum: 240,
      maximum: 1440,
      default: 900,
      description: "The browser viewport height in CSS pixels.",
    }),
    scale: s.integer({
      minimum: 1,
      maximum: 2,
      default: 1,
      description: "The device scale factor for screenshot output.",
    }),
    fullPage: s.boolean({
      default: false,
      description: "Whether a screenshot should include the bounded full document height.",
    }),
    waitUntil: s.stringEnum(["load", "domcontentloaded", "networkidle"], {
      default: "domcontentloaded",
      description: "The browser lifecycle event awaited before the optional delay.",
    }),
    delay: s.integer({
      minimum: 0,
      maximum: 3000,
      default: 0,
      description: "Additional wait in milliseconds after the lifecycle event.",
    }),
    timeout: s.integer({
      minimum: 3000,
      maximum: 30000,
      default: 15000,
      description: "The browser navigation timeout in milliseconds.",
    }),
    darkMode: s.boolean({ default: false, description: "Whether to emulate a dark color-scheme preference." }),
    reducedMotion: s.boolean({
      default: true,
      description: "Whether to emulate reduced motion for a more stable capture.",
    }),
    paper: s.stringEnum(["A4", "Letter", "Legal"], {
      default: "A4",
      description: "The paper size for PDF rendering.",
    }),
    landscape: s.boolean({ default: false, description: "Whether PDF output should use landscape orientation." }),
  },
  { required: ["url"] },
);

const captureOutputSchema = s.object(
  "A rendered artifact in local transit storage with render and quota diagnostics.",
  {
    file: transitFileSchema,
    diagnostics: diagnosticsSchema,
    quota: quotaSchema,
  },
  { required: ["file"], optional: ["diagnostics", "quota"] },
);

const usageSchema = s.requiredObject("Current successful-render usage for the UTC calendar month.", {
  period: s.string({ pattern: "^[0-9]{4}-[0-9]{2}$", description: "The current UTC calendar month." }),
  plan: planSchema,
  limit: s.nonNegativeInteger("The successful-render allowance for the current month."),
  remaining: s.nonNegativeInteger("The successful renders remaining in the current month."),
  resetAt: s.dateTime("The start of the next UTC calendar month."),
  successful: s.nonNegativeInteger("The successful renders completed in the current month."),
  failed: s.nonNegativeInteger("The failed reserved renders, which do not consume successful-render quota."),
  reserved: s.nonNegativeInteger("The render slots currently reserved for in-flight work."),
  outputBytes: s.nonNegativeInteger("The total successful output bytes in the current month."),
  renderMs: s.nonNegativeInteger("The aggregate successful render duration in the current month."),
  updatedAt: s.nullable(s.dateTime("The last usage update time, or null before the first render.")),
});

const upgradeRequestSchema = s.object(
  "The latest paid-plan request attached to the key.",
  {
    id: s.positiveInteger("The request identifier."),
    keyId: s.positiveInteger("The API key record identifier."),
    requestedPlan: s.nonEmptyString(
      "The requested paid plan. Known values are launch, build, and scale; newer tiers are passed through unchanged.",
    ),
    note: s.nullable(s.string("The optional request note.")),
    status: s.nonEmptyString(
      "The request review status. Known values are new, contacted, fulfilled, and declined; newer statuses are passed through unchanged.",
    ),
    createdAt: s.dateTime("When the request was created."),
    updatedAt: s.dateTime("When the request was last updated."),
  },
  { required: ["id", "keyId", "requestedPlan", "note", "status", "createdAt", "updatedAt"] },
);

const usageOutputSchema = s.requiredObject("The current Latchshot plan and quota snapshot.", {
  customer: s.requiredObject("The display identity attached to the API key.", {
    name: s.nonEmptyString("The display name attached to the API key."),
    plan: planSchema,
  }),
  usage: usageSchema,
  upgradeRequest: s.nullable(upgradeRequestSchema),
});

export const latchshotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "capture_page",
    description:
      "Render a public web page as a PNG, JPEG, or PDF and store the bounded artifact in local transit storage.",
    inputSchema: captureInputSchema,
    outputSchema: captureOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_usage",
    description: "Read the current Latchshot plan, successful-render quota, reset time, and upgrade-request status.",
    inputSchema: s.object("No input is required to read usage for the configured API key.", {}),
    outputSchema: usageOutputSchema,
  }),
];
