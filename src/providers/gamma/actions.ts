import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gamma";

const themeIdSchema = s.nonEmptyString(
  "The Gamma theme ID returned by the List Themes API or copied from the Gamma app.",
);

const folderIdsSchema = s.stringArray("The folder IDs where Gamma should place the generated content.", {
  minItems: 1,
  maxItems: 10,
  itemDescription: "One Gamma folder ID.",
});

const creditsSchema = s.object("Gamma credit usage returned for a generation.", {
  deducted: s.integer("The number of credits deducted for this generation."),
  remaining: s.integer("The number of credits remaining after this generation."),
});

const headerFooterContentSchema = s.oneOf(
  [
    s.object("Text content shown in a Gamma header or footer.", {
      type: s.literal("text", { description: "The header or footer content type." }),
      value: s.string("The text shown in the header or footer."),
    }),
    s.object(
      "Image content shown in a Gamma header or footer.",
      {
        type: s.literal("image", { description: "The header or footer content type." }),
        source: s.stringEnum("Whether Gamma should use the theme logo or a custom image URL.", ["themeLogo", "custom"]),
        src: s.nullable(s.url("The image URL used when source is custom.")),
        size: s.nullable(
          s.stringEnum("The image size Gamma should use in the header or footer.", ["sm", "md", "lg", "xl"]),
        ),
      },
      { required: ["type", "source"], optional: ["src", "size"] },
    ),
    s.object("Card number content shown in a Gamma header or footer.", {
      type: s.literal("cardNumber", { description: "The header or footer content type." }),
    }),
  ],
  { description: "A Gamma header or footer content block." },
);

const headerFooterSchema = s.looseObject("Header and footer settings for Gamma cards.", {
  topLeft: headerFooterContentSchema,
  topCenter: headerFooterContentSchema,
  topRight: headerFooterContentSchema,
  bottomLeft: headerFooterContentSchema,
  bottomCenter: headerFooterContentSchema,
  bottomRight: headerFooterContentSchema,
  hideFromFirstCard: s.boolean("Whether Gamma hides the header and footer on the first card."),
  hideFromLastCard: s.boolean("Whether Gamma hides the header and footer on the last card."),
});

const cardOptionsSchema = s.looseObject("Card layout settings forwarded to Gamma.", {
  dimensions: s.stringEnum("The card or page dimensions Gamma should use for this generation.", [
    "fluid",
    "16x9",
    "4x3",
    "1x1",
    "4x5",
    "9x16",
    "letter",
    "a4",
    "pageless",
  ]),
  headerFooter: headerFooterSchema,
});

const textOptionsSchema = s.looseObject("Text generation settings forwarded to Gamma.", {
  amount: s.stringEnum("How much text Gamma should generate for each card.", [
    "brief",
    "medium",
    "detailed",
    "extensive",
  ]),
  tone: s.nonEmptyString("The desired tone for generated text."),
  audience: s.nonEmptyString("The intended audience for the generated text."),
  language: s.nonEmptyString("The language Gamma should use in the generated text."),
});

const imageOptionsSchema = s.looseObject("Image generation settings forwarded to Gamma.", {
  source: s.stringEnum("Where Gamma should source images from for the generation.", [
    "aiGenerated",
    "pictographic",
    "pexels",
    "giphy",
    "webAllImages",
    "webFreeToUse",
    "webFreeToUseCommercially",
    "themeAccent",
    "placeholder",
    "noImages",
  ]),
  model: s.nonEmptyString("The image model Gamma should use for AI-generated images."),
  style: s.nonEmptyString("The image style prompt Gamma should use."),
  stylePreset: s.nonEmptyString("A named style preset Gamma should apply to AI-generated images."),
});

const emailOptionsSchema = s.object(
  "Email sharing settings forwarded to Gamma.",
  {
    recipients: s.stringArray("The email recipients Gamma should share the result with.", { minItems: 1 }),
    access: s.stringEnum("The access level Gamma should grant to shared email recipients.", [
      "view",
      "comment",
      "edit",
      "fullAccess",
    ]),
  },
  { additionalProperties: true },
);

const sharingOptionsSchema = s.looseObject("Sharing and access settings forwarded to Gamma.", {
  workspaceAccess: s.stringEnum("The access level Gamma should grant to workspace members.", [
    "noAccess",
    "view",
    "comment",
    "edit",
    "fullAccess",
  ]),
  externalAccess: s.stringEnum("The access level Gamma should grant to users outside the workspace.", [
    "noAccess",
    "view",
    "comment",
    "edit",
  ]),
  emailOptions: emailOptionsSchema,
});

const generationSchema = s.object(
  "A Gamma generation job or completed generation result.",
  {
    generationId: s.string("The Gamma generation job identifier."),
    status: s.stringEnum("The current status of the Gamma generation.", ["pending", "completed", "failed"]),
    gammaId: s.string("The Gamma document ID returned when available."),
    gammaUrl: s.url("The Gamma document URL returned when complete."),
    exportUrl: s.url("The temporary export download URL returned when complete."),
    warnings: s.string("Warnings Gamma returned because some generation settings were ignored."),
    error: s.object("The error payload Gamma returned for a failed generation.", {
      message: s.string("The error message Gamma returned for a failed generation."),
      statusCode: s.integer("The HTTP-like status code Gamma returned for a failed generation."),
    }),
    credits: creditsSchema,
  },
  { optional: ["status", "gammaId", "gammaUrl", "exportUrl", "warnings", "error", "credits"] },
);

const themeSchema = s.object("A Gamma theme.", {
  id: s.string("The Gamma theme identifier."),
  name: s.string("The display name of the Gamma theme."),
  type: s.string("The theme type returned by Gamma."),
  toneKeywords: s.stringArray("The descriptive tone keywords associated with the theme."),
  colorKeywords: s.stringArray("The descriptive color keywords associated with the theme."),
});

const folderSchema = s.object("A Gamma folder.", {
  id: s.string("The Gamma folder identifier."),
  name: s.string("The display name of the Gamma folder."),
});

const pageInfoSchema = s.object("Cursor pagination information returned by Gamma.", {
  hasMore: s.boolean("Whether more pages are available from Gamma."),
  nextCursor: s.nullableString("The cursor value to pass as after when requesting the next page."),
});

const waitOptionProperties = {
  timeoutSeconds: s.number("The maximum number of seconds to wait before returning a timed-out result.", {
    minimum: 0,
  }),
  pollIntervalSeconds: s.number("The number of seconds to wait between polling attempts.", {
    minimum: 0,
  }),
};

function createGenerationInputSchema(description: string, includeWaitOptions: boolean): JsonSchema {
  return s.object(
    description,
    {
      inputText: s.nonEmptyString("The text and image URLs Gamma should use for generation."),
      additionalInstructions: s.string("Additional instructions or context for the Gamma generation.", {
        maxLength: 5000,
      }),
      textMode: s.stringEnum("How Gamma should interpret the input text.", ["generate", "condense", "preserve"]),
      format: s.stringEnum("The output format Gamma should generate.", [
        "presentation",
        "document",
        "social",
        "webpage",
      ]),
      numCards: s.integer("The target number of cards Gamma should generate.", { minimum: 1, maximum: 75 }),
      cardSplit: s.stringEnum("How Gamma should split the input across cards.", ["auto", "inputTextBreaks"]),
      themeId: themeIdSchema,
      textOptions: textOptionsSchema,
      imageOptions: imageOptionsSchema,
      cardOptions: cardOptionsSchema,
      sharingOptions: sharingOptionsSchema,
      folderIds: folderIdsSchema,
      exportAs: s.stringEnum("The export format Gamma should prepare when generation completes.", [
        "pdf",
        "pptx",
        "png",
      ]),
      ...(includeWaitOptions ? waitOptionProperties : {}),
    },
    {
      required: ["inputText", "textMode"],
    },
  );
}

function createTemplateInputSchema(description: string, includeWaitOptions: boolean): JsonSchema {
  return s.object(
    description,
    {
      prompt: s.nonEmptyString("The prompt Gamma should use to adapt the template."),
      gammaId: s.nonEmptyString("The Gamma template identifier to use as the base template."),
      themeId: themeIdSchema,
      imageOptions: imageOptionsSchema,
      sharingOptions: sharingOptionsSchema,
      folderIds: folderIdsSchema,
      exportAs: s.stringEnum("The export format Gamma should prepare when generation completes.", [
        "pdf",
        "pptx",
        "png",
      ]),
      ...(includeWaitOptions ? waitOptionProperties : {}),
    },
    {
      required: ["prompt", "gammaId"],
    },
  );
}

const generationOutputSchema = s.actionOutput(
  {
    generation: generationSchema,
  },
  "The Gamma generation status and result payload.",
);

const generationWaitOutputSchema = s.actionOutput(
  {
    generation: generationSchema,
    timedOut: s.boolean("Whether the polling loop stopped because the timeout was reached."),
  },
  "The Gamma generation returned by a polling helper.",
);

function listInputSchema(description: string, itemName: string): JsonSchema {
  return s.object(
    description,
    {
      query: s.nonEmptyString(`An optional search query for filtering ${itemName} by name.`),
      limit: s.integer(`The maximum number of ${itemName} Gamma should return.`, { minimum: 1, maximum: 50 }),
      after: s.nonEmptyString(`The cursor for loading the next page of ${itemName}.`),
    },
    { optional: ["query", "limit", "after"] },
  );
}

export const gammaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_generation",
    description: "Create an asynchronous Gamma generation from text input.",
    inputSchema: createGenerationInputSchema("Input for creating a Gamma generation from text.", false),
    outputSchema: generationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_generation",
    description: "Get the status and result URLs for a specific Gamma generation job.",
    inputSchema: s.requiredObject("Input for fetching a Gamma generation result.", {
      generationId: s.nonEmptyString("The Gamma generation job identifier."),
    }),
    outputSchema: generationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_generation_and_wait",
    description: "Create a Gamma generation from text input and keep polling until it completes, fails, or times out.",
    inputSchema: createGenerationInputSchema(
      "Input for creating a Gamma generation from text and waiting for the result.",
      true,
    ),
    outputSchema: generationWaitOutputSchema,
  }),
  defineProviderAction(service, {
    name: "wait_for_generation",
    description: "Poll a Gamma generation job until it completes, fails, or the polling timeout is reached.",
    inputSchema: s.object(
      "Input for waiting on a Gamma generation result.",
      {
        generationId: s.nonEmptyString("The Gamma generation job identifier."),
        ...waitOptionProperties,
      },
      { required: ["generationId"], optional: ["timeoutSeconds", "pollIntervalSeconds"] },
    ),
    outputSchema: generationWaitOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_generation_from_template",
    description: "Create an asynchronous Gamma generation from an existing Gamma template.",
    inputSchema: createTemplateInputSchema("Input for creating a Gamma generation from a template.", false),
    outputSchema: generationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_generation_from_template_and_wait",
    description: "Create a Gamma generation from a template and keep polling until it completes, fails, or times out.",
    inputSchema: createTemplateInputSchema(
      "Input for creating a template-based Gamma generation and waiting for the result.",
      true,
    ),
    outputSchema: generationWaitOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_themes",
    description: "List the Gamma themes available in the current workspace.",
    inputSchema: listInputSchema("Filters for listing Gamma themes.", "themes"),
    outputSchema: s.actionOutput(
      {
        themes: s.array("The Gamma themes returned by the API.", themeSchema),
        pageInfo: pageInfoSchema,
      },
      "The Gamma theme list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_folders",
    description: "List the Gamma folders available in the current workspace.",
    inputSchema: listInputSchema("Filters for listing Gamma folders.", "folders"),
    outputSchema: s.actionOutput(
      {
        folders: s.array("The Gamma folders returned by the API.", folderSchema),
        pageInfo: pageInfoSchema,
      },
      "The Gamma folder list response.",
    ),
  }),
];
