import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pixellab";

const jobStatusSchema = s.stringEnum("The current PixelLab background job status.", [
  "queued",
  "processing",
  "completed",
  "failed",
]);

const transitFileOutputSchema = s.requiredObject("A generated image stored in the local transit file service.", {
  fileId: s.nonEmptyString("The local transit file identifier."),
  downloadUrl: s.url("The local URL used to download the generated image."),
  sizeBytes: s.nonNegativeInteger("The generated image size in bytes."),
  name: s.nonEmptyString("The generated image filename."),
  mimeType: s.nonEmptyString("The generated image MIME type."),
});

const usageSchema = s.object(
  "PixelLab usage charged for the operation.",
  {
    type: s.stringEnum("The unit used for this charge.", ["usd", "generations"]),
    usd: s.number("The amount charged in US dollars."),
    generations: s.number("The number of subscription generations charged."),
  },
  { optional: ["usd", "generations"] },
);

const skeletonLabels = [
  "NOSE",
  "NECK",
  "RIGHT SHOULDER",
  "RIGHT ELBOW",
  "RIGHT ARM",
  "LEFT SHOULDER",
  "LEFT ELBOW",
  "LEFT ARM",
  "RIGHT HIP",
  "RIGHT KNEE",
  "RIGHT LEG",
  "LEFT HIP",
  "LEFT KNEE",
  "LEFT LEG",
  "RIGHT EYE",
  "LEFT EYE",
  "RIGHT EAR",
  "LEFT EAR",
];

const skeletonPointProperties = {
  x: s.number("Horizontal point coordinate."),
  y: s.number("Vertical point coordinate."),
  label: s.stringEnum("PixelLab skeleton joint label.", skeletonLabels),
  zIndex: s.number("Layer order used when skeleton joints overlap.", { default: 0 }),
};

const estimatedKeypointSchema = s.requiredObject(
  "One skeleton keypoint estimated by PixelLab.",
  skeletonPointProperties,
);

const animationPointSchema = s.object("One skeleton point used to guide an animation frame.", skeletonPointProperties, {
  optional: ["zIndex"],
});

const imageSizeSchema = s.requiredObject("Output frame dimensions in pixels.", {
  width: s.integer("Output frame width from 16 to 256 pixels.", { minimum: 16, maximum: 256 }),
  height: s.integer("Output frame height from 16 to 256 pixels.", { minimum: 16, maximum: 256 }),
});

const animationFramesSchema = s.array("Generated animation frames in playback order.", transitFileOutputSchema);
const generatedImagesSchema = s.array("Generated images in provider order.", transitFileOutputSchema);
const optionalUrlValueSchema = s.nullable(s.url("A public image URL when the resource is available."));

const createImageSizeSchema = (description: string, minimum: number, maximum: number) =>
  s.requiredObject(description, {
    width: s.integer(`Image width from ${minimum} to ${maximum} pixels.`, {
      minimum,
      maximum,
    }),
    height: s.integer(`Image height from ${minimum} to ${maximum} pixels.`, {
      minimum,
      maximum,
    }),
  });

const proImageSizeSchema = s.requiredObject("Generated image dimensions.", {
  width: s.integer("Image width from 16 to 792 pixels.", { minimum: 16, maximum: 792 }),
  height: s.integer("Image height from 16 to 688 pixels.", { minimum: 16, maximum: 688 }),
});
const styleImageSizeSchema = createImageSizeSchema("Generated image dimensions.", 16, 512);
const uiImageSizeSchema = s.object(
  "Generated UI image dimensions.",
  {
    width: s.integer("Image width from 16 to 792 pixels.", { minimum: 16, maximum: 792, default: 256 }),
    height: s.integer("Image height from 16 to 688 pixels.", {
      minimum: 16,
      maximum: 688,
      default: 256,
    }),
  },
  { optional: ["width", "height"] },
);
const pixfluxImageSizeSchema = createImageSizeSchema("Pixflux output dimensions.", 16, 400);
const pixenImageSizeSchema = createImageSizeSchema(
  "Pixen output dimensions. Width and height must be divisible by 4.",
  16,
  768,
);
const sourceImageSizeSchema = createImageSizeSchema("Source image dimensions.", 16, 1280);
const pixelArtOutputSizeSchema = createImageSizeSchema("Pixel-art output dimensions.", 16, 320);
const resizeImageSizeSchema = createImageSizeSchema("Pixel-art image dimensions.", 16, 200);
const removeBackgroundImageSizeSchema = createImageSizeSchema("Source image dimensions.", 1, 400);
const editImageSizeSchema = createImageSizeSchema("Edited image output dimensions.", 32, 512);
const inpaintImageSizeSchema = s.requiredObject("Inpainting image dimensions.", {
  width: s.integer("Image width from 32 to 512 pixels.", { minimum: 32, maximum: 512 }),
  height: s.integer("Image height from 32 to 512 pixels.", { minimum: 32, maximum: 512 }),
});
const characterImageSizeSchema = createImageSizeSchema("Character frame dimensions.", 32, 256);

const cameraViewSchema = s.stringEnum("Camera view angle.", ["side", "low top-down", "high top-down"]);
const directionSchema = s.stringEnum("Direction the subject faces.", [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
]);
const outlineSchema = s.stringEnum("Pixel-art outline style.", [
  "single color black outline",
  "single color outline",
  "selective outline",
  "lineless",
]);
const detailSchema = s.stringEnum("Pixel-art detail level.", ["low detail", "medium detail", "highly detailed"]);
const pixenDetailSchema = s.stringEnum(["low detail", "medium detail", "highly detailed"], {
  description: "Pixel-art detail level.",
  default: "highly detailed",
});
const shadingSchema = s.stringEnum("Pixel-art shading style.", [
  "flat shading",
  "basic shading",
  "medium shading",
  "detailed shading",
  "highly detailed shading",
]);
const backgroundRemovalTaskSchema = s.stringEnum(["remove_simple_background", "remove_complex_background"], {
  description: "Background removal mode. Complex mode is slower but handles detailed edges better.",
  default: "remove_simple_background",
});

const sizedTransitImageSchema = s.requiredObject("A PNG or JPEG transit image with its pixel dimensions.", {
  file: s.transitFile("The PNG or JPEG image file."),
  width: s.positiveInteger("Image width in pixels."),
  height: s.positiveInteger("Image height in pixels."),
});

const boundedSizedTransitImageSchema = s.requiredObject("A PNG or JPEG transit image up to 512 by 512 pixels.", {
  file: s.transitFile("The PNG or JPEG image file."),
  width: s.integer("Image width from 1 to 512 pixels.", { minimum: 1, maximum: 512 }),
  height: s.integer("Image height from 1 to 512 pixels.", { minimum: 1, maximum: 512 }),
});

const generateReferenceImageSchema = s.object(
  "A subject reference image and instructions for how PixelLab should use it.",
  {
    file: s.transitFile("The PNG or JPEG reference image."),
    width: s.positiveInteger("Reference image width in pixels."),
    height: s.positiveInteger("Reference image height in pixels."),
    usageDescription: s.string("Optional instructions for how to use this reference.", { maxLength: 500 }),
  },
  { optional: ["usageDescription"] },
);

const styleOptionsSchema = s.object(
  "Features to copy from the style image.",
  {
    colorPalette: s.boolean({ description: "Whether to copy the color palette.", default: true }),
    outline: s.boolean({ description: "Whether to copy the outline style.", default: true }),
    detail: s.boolean({ description: "Whether to copy the detail level.", default: true }),
    shading: s.boolean({ description: "Whether to copy the shading style.", default: true }),
  },
  { optional: ["colorPalette", "outline", "detail", "shading"] },
);

const startedJobOutputSchema = s.actionOutput(
  {
    jobId: s.nonEmptyString("The background job identifier used for polling."),
    status: jobStatusSchema,
    usage: usageSchema,
  },
  "An accepted PixelLab background job.",
  ["jobId", "status"],
);

const singleImageOutputSchema = s.actionOutput(
  {
    image: transitFileOutputSchema,
    usage: usageSchema,
  },
  "A PixelLab image stored in the local transit file service.",
  ["image"],
);

const promptOutputSchema = s.actionOutput(
  {
    enhancedPrompt: s.nonEmptyString("The model-ready prompt returned by PixelLab."),
    usage: usageSchema,
  },
  "A PixelLab prompt enhancement result.",
  ["enhancedPrompt"],
);

const animationFrameInputSchema = s.requiredObject("An animation frame with its source dimensions.", {
  file: s.transitFile("The PNG or JPEG animation frame."),
  width: s.integer("Frame width from 1 to 512 pixels.", { minimum: 1, maximum: 512 }),
  height: s.integer("Frame height from 1 to 512 pixels.", { minimum: 1, maximum: 512 }),
});
const proAnimationSizeSchema = createImageSizeSchema("Animation output dimensions.", 32, 256);
const legacyAnimationSizeSchema = createImageSizeSchema("Animation output dimensions.", 16, 256);
const rotationsProSizeSchema = createImageSizeSchema("Rotation frame dimensions.", 32, 168);
const rotationReferenceSchema = s.requiredObject("A rotation reference image with its dimensions.", {
  file: s.transitFile("The PNG or JPEG reference image."),
  width: s.integer("Reference width from 1 to 1024 pixels.", { minimum: 1, maximum: 1024 }),
  height: s.integer("Reference height from 1 to 1024 pixels.", { minimum: 1, maximum: 1024 }),
});
const legacyImageSizeSchema = createImageSizeSchema("Image dimensions.", 16, 200);
const editCanvasSizeSchema = createImageSizeSchema("Image dimensions.", 16, 400);
const portraitResultSizeSchema = s.oneOf(
  [16, 32, 48, 64, 128, 160].map((value) => s.literal(value)),
  { description: "Output sprite size in pixels.", default: 64 },
);
const uiAssetSizeSchema = s.requiredObject("UI asset dimensions.", {
  width: s.integer("Image width in pixels."),
  height: s.integer("Image height in pixels."),
});
const uiAssetSchema = s.looseRequiredObject(
  "A saved PixelLab UI asset.",
  {
    id: s.nonEmptyString("UI asset identifier."),
    name: s.nonEmptyString("Friendly UI asset name."),
    prompt: s.nonEmptyString("Prompt used to generate the asset."),
    size: uiAssetSizeSchema,
    imageUrl: s.url("Public image URL when generation is complete."),
    status: s.nonEmptyString("Current UI asset status."),
    createdAt: s.dateTime("When the UI asset was created."),
    progressPercent: s.integer("Current generation progress percentage."),
    etaSeconds: s.integer("Estimated seconds remaining."),
  },
  { optional: ["name", "imageUrl", "status", "progressPercent", "etaSeconds"] },
);
const uiPieceSchema = s.oneOf(
  [
    s.object(
      {
        id: s.nonEmptyString("Unique piece identifier."),
        kind: s.literal("rounded_rect"),
        label: s.string("Optional piece label."),
        x: s.number("Left coordinate in the virtual canvas."),
        y: s.number("Top coordinate in the virtual canvas."),
        w: s.number("Rectangle width in the virtual canvas."),
        h: s.number("Rectangle height in the virtual canvas."),
        radius: s.number("Corner radius.", { default: 0 }),
      },
      { required: ["id", "kind", "x", "y", "w", "h"] },
    ),
    s.object(
      {
        id: s.nonEmptyString("Unique piece identifier."),
        kind: s.literal("circle"),
        label: s.string("Optional piece label."),
        x: s.number("Center X coordinate in the virtual canvas."),
        y: s.number("Center Y coordinate in the virtual canvas."),
        r: s.number("Circle radius."),
      },
      { required: ["id", "kind", "x", "y", "r"] },
    ),
    s.object(
      {
        id: s.nonEmptyString("Unique piece identifier."),
        kind: s.literal("polygon"),
        label: s.string("Optional piece label."),
        x: s.number("Center X coordinate in the virtual canvas."),
        y: s.number("Center Y coordinate in the virtual canvas."),
        r: s.number("Polygon radius."),
        sides: s.integer("Number of polygon sides.", { minimum: 3 }),
        phase: s.number("Starting angle in radians.", { default: 0 }),
      },
      { required: ["id", "kind", "x", "y", "r", "sides"] },
    ),
  ],
  { description: "A rounded rectangle, circle, or regular polygon in the virtual UI canvas." },
);

const characterSizeSchema = s.requiredObject("Character sprite dimensions.", {
  width: s.integer("Sprite width in pixels."),
  height: s.integer("Sprite height in pixels."),
});
const characterSchema = s.looseRequiredObject(
  "A persisted PixelLab character.",
  {
    id: s.nonEmptyString("Character identifier."),
    name: s.nonEmptyString("Character name."),
    prompt: s.nonEmptyString("Character creation prompt."),
    size: characterSizeSchema,
    directions: s.integer("Number of directional rotations."),
    createdAt: s.dateTime("When the character was created."),
    animationCount: s.nonNegativeInteger("Number of stored character animations."),
    templateId: s.nonEmptyString("Template used to create the character."),
    view: s.nonEmptyString("Camera view used for the character."),
    previewUrl: s.url("Public character preview URL."),
    tags: s.stringArray("User-defined character tags."),
    groupId: s.nonEmptyString("Identifier grouping sibling character states."),
    rotationUrls: s.record("Rotation image URLs keyed by direction.", optionalUrlValueSchema),
    animations: s.array("Stored animation metadata.", s.looseObject("A character animation group.")),
  },
  { optional: ["view", "previewUrl", "tags", "groupId", "rotationUrls", "animations"] },
);
const characterCreateSizeSchema = createImageSizeSchema("Character generation dimensions.", 16, 128);
const characterProSizeSchema = createImageSizeSchema("Pro character frame dimensions.", 32, 168);
const characterJobOutputSchema = s.actionOutput(
  {
    jobId: s.nonEmptyString("Background job identifier used for polling."),
    characterId: s.nonEmptyString("Character identifier available immediately."),
    status: jobStatusSchema,
    enhancedPrompt: s.nonEmptyString("Enhanced character prompt when requested."),
    usage: usageSchema,
    enhanceUsage: usageSchema,
  },
  "An accepted PixelLab character creation job.",
  ["jobId", "characterId", "status"],
);
const characterStyleFields = {
  textGuidanceScale: s.number("How closely to follow the character description.", {
    minimum: 1,
    maximum: 20,
    default: 8,
  }),
  outline: outlineSchema,
  shading: shadingSchema,
  detail: detailSchema,
  view: s.stringEnum(["low top-down", "high top-down", "side"], {
    description: "Character camera view.",
    default: "low top-down",
  }),
  isometric: s.boolean({ description: "Whether to generate an isometric character.", default: false }),
  colorImage: s.transitFile("Optional PNG or JPEG palette image."),
  forceColors: s.boolean({ description: "Whether to force colors from colorImage.", default: false }),
  templateId: s.nonEmptyString("Body template identifier, such as mannequin, bear, cat, dog, horse, or lion."),
  seed: s.nonNegativeInteger("Seed for reproducible generation."),
};

const objectSizeSchema = s.requiredObject("Object sprite dimensions.", {
  width: s.positiveInteger("Sprite width in pixels."),
  height: s.positiveInteger("Sprite height in pixels."),
});
const objectSchema = s.looseRequiredObject(
  "A persisted PixelLab object.",
  {
    id: s.nonEmptyString("Object identifier."),
    name: s.nonEmptyString("Friendly object name."),
    prompt: s.nonEmptyString("Prompt used to create the object."),
    size: objectSizeSchema,
    directions: s.integer("Number of object directions."),
    createdAt: s.dateTime("When the object was created."),
    view: s.nonEmptyString("Camera view used for the object."),
    previewUrl: s.url("Public object preview URL."),
    rotationUrls: s.record("Rotation image URLs keyed by direction.", optionalUrlValueSchema),
    storageUrls: s.record("Stored image URLs keyed by provider field.", s.string("A stored image URL or value.")),
    frameUrls: s.stringArray("Candidate image URLs while the object awaits review."),
    styleSettings: s.looseObject("Style settings used during generation."),
    tags: s.stringArray("User-defined object tags."),
    status: s.nonEmptyString("Current object status."),
    groupId: s.nonEmptyString("Identifier grouping sibling object states."),
    progressPercent: s.integer("Current generation progress percentage."),
    etaSeconds: s.integer("Estimated seconds remaining."),
    animations: s.array("Stored object animation groups.", s.looseObject("An object animation group.")),
  },
  {
    optional: [
      "name",
      "view",
      "previewUrl",
      "rotationUrls",
      "storageUrls",
      "frameUrls",
      "styleSettings",
      "tags",
      "status",
      "groupId",
      "progressPercent",
      "etaSeconds",
      "animations",
    ],
  },
);
const objectJobOutputSchema = s.actionOutput(
  {
    jobId: s.nonEmptyString("Background job identifier used for polling."),
    objectId: s.nonEmptyString("Object identifier available immediately."),
    status: jobStatusSchema,
    usage: usageSchema,
  },
  "An accepted PixelLab object job.",
  ["jobId", "objectId", "status"],
);
const objectDirectionSubmissionSchema = s.object(
  "One submitted object animation direction.",
  {
    direction: s.nonEmptyString("Direction being animated."),
    status: s.stringEnum("Submission status.", ["queued", "rate_limited"]),
    jobId: s.nonEmptyString("Background job identifier when the direction was queued."),
    animationId: s.nonEmptyString("Stored animation identifier when available."),
  },
  { required: ["direction", "status"] },
);

const textAnimationLifecycle = {
  startActionId: "pixellab.start_text_animation",
  statusActionId: "pixellab.get_background_job",
};

export const pixellabActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "start_text_animation",
    description:
      "Start an asynchronous PixelLab animation from a first frame and a text description of the character motion.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: textAnimationLifecycle,
    inputSchema: s.actionInput(
      {
        firstFrame: s.transitFile("The PNG or JPEG first frame to animate, up to 256 by 256 pixels."),
        action: s.string("The motion to animate, such as walking, jumping, or attacking.", {
          minLength: 1,
          maxLength: 1000,
        }),
        lastFrame: s.transitFile(
          "An optional PNG or JPEG final frame used to guide interpolation, up to 256 by 256 pixels.",
        ),
        frameCount: s.integer("Number of frames to generate. The value must be even.", {
          minimum: 4,
          maximum: 16,
          default: 8,
        }),
        seed: s.nonNegativeInteger("Seed for reproducible generation. Use 0 for a random seed.", { default: 0 }),
        noBackground: s.boolean("Whether PixelLab should remove the background from generated frames."),
        enhancePrompt: s.boolean({
          description: "Whether PixelLab should expand the action into a richer motion description.",
          default: false,
        }),
      },
      ["firstFrame", "action"],
      "A PixelLab text-guided animation request.",
    ),
    outputSchema: s.actionOutput(
      {
        jobId: s.nonEmptyString("The background job identifier used for polling."),
        status: jobStatusSchema,
        enhancedPrompt: s.nonEmptyString("The expanded motion description when prompt enhancement was requested."),
        usage: usageSchema,
        enhanceUsage: usageSchema,
      },
      "The accepted PixelLab background animation job.",
      ["jobId", "status"],
    ),
  }),
  defineProviderAction(service, {
    name: "get_background_job",
    description:
      "Poll a PixelLab background animation job and store completed image frames in the local transit file service.",
    asyncLifecycle: textAnimationLifecycle,
    inputSchema: s.actionInput(
      { jobId: s.nonEmptyString("The PixelLab background job identifier returned when the animation started.") },
      ["jobId"],
      "A PixelLab background job lookup.",
    ),
    outputSchema: s.actionOutput(
      {
        jobId: s.nonEmptyString("The PixelLab background job identifier."),
        status: jobStatusSchema,
        createdAt: s.dateTime("When PixelLab created the background job."),
        images: generatedImagesSchema,
        imageCount: s.nonNegativeInteger("The number of completed generated images."),
        result: s.looseObject("Non-image result metadata returned by the completed background job."),
        error: s.nonEmptyString("The PixelLab failure message when the job failed."),
        usage: usageSchema,
      },
      "The normalized PixelLab background job state.",
      ["jobId", "status", "createdAt", "images"],
    ),
  }),
  defineProviderAction(service, {
    name: "estimate_skeleton",
    description: "Estimate PixelLab skeleton keypoints from a PNG or JPEG character image.",
    followUpActions: ["pixellab.animate_with_skeleton"],
    inputSchema: s.actionInput(
      { image: s.transitFile("The PNG or JPEG character image from which to estimate skeleton keypoints.") },
      ["image"],
      "A PixelLab skeleton estimation request.",
    ),
    outputSchema: s.actionOutput(
      {
        keypoints: s.array("Skeleton keypoints estimated from the character image.", estimatedKeypointSchema),
        usage: usageSchema,
      },
      "The normalized PixelLab skeleton estimation result.",
      ["keypoints"],
    ),
  }),
  defineProviderAction(service, {
    name: "animate_with_skeleton",
    description:
      "Generate synchronous PixelLab animation frames from a reference character image and per-frame skeleton keypoints.",
    inputSchema: s.actionInput(
      {
        imageSize: imageSizeSchema,
        referenceImage: s.transitFile("The PNG or JPEG character image whose appearance should be preserved."),
        skeletonKeypoints: s.array(
          "Skeleton keypoints for each animation frame, in playback order.",
          s.array("Skeleton points for one animation frame.", animationPointSchema, { minItems: 1 }),
          { minItems: 1 },
        ),
        guidanceScale: s.number("How closely to follow the reference image and skeleton keypoints.", {
          minimum: 1,
          maximum: 20,
          default: 4,
        }),
        view: s.stringEnum(["side", "low top-down", "high top-down"], {
          description: "Camera view angle.",
          default: "side",
        }),
        direction: s.stringEnum(
          ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"],
          { description: "Direction the character faces.", default: "east" },
        ),
        isometric: s.boolean({ description: "Whether to generate an isometric view.", default: false }),
        obliqueProjection: s.boolean({ description: "Whether to use oblique projection.", default: false }),
        seed: s.nonNegativeInteger("Seed used to make generation reproducible."),
      },
      ["imageSize", "referenceImage", "skeletonKeypoints"],
      "A PixelLab skeleton-guided animation request.",
    ),
    outputSchema: s.actionOutput(
      {
        frames: animationFramesSchema,
        frameCount: s.nonNegativeInteger("The number of generated animation frames."),
        usage: usageSchema,
      },
      "The PixelLab skeleton-guided animation result.",
      ["frames", "frameCount"],
    ),
  }),
  defineProviderAction(service, {
    name: "get_balance",
    description: "Retrieve the current PixelLab USD credit and subscription generation balances.",
    inputSchema: s.actionInput({}, [], "No input parameters are required."),
    outputSchema: s.actionOutput(
      {
        creditsUsd: s.number("Remaining PixelLab USD credits."),
        subscriptionStatus: s.nonEmptyString("Current subscription status."),
        subscriptionPlan: s.nonEmptyString("Current subscription plan name."),
        generationsRemaining: s.number("Remaining subscription generations in this billing period."),
        generationsTotal: s.number("Total subscription generations in this billing period."),
      },
      "The normalized PixelLab account balance.",
      ["creditsUsd", "subscriptionStatus", "generationsRemaining", "generationsTotal"],
    ),
  }),
  defineProviderAction(service, {
    name: "start_generate_image",
    description: "Start Pro text-to-pixel-art generation with optional subject and style reference images.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_generate_image",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        description: s.string("Description of the image to generate.", { minLength: 1, maxLength: 2000 }),
        imageSize: proImageSizeSchema,
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        noBackground: s.boolean({ description: "Whether to remove the image background.", default: true }),
        referenceImages: s.array("Subject reference images, up to four.", generateReferenceImageSchema, {
          minItems: 1,
          maxItems: 4,
        }),
        styleImage: generateReferenceImageSchema,
        styleOptions: styleOptionsSchema,
      },
      ["description", "imageSize"],
      "A PixelLab Pro image generation request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_generate_with_style",
    description: "Start Pro pixel-art generation that matches one to four supplied style images.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_generate_with_style",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        styleImages: s.array("Style reference images to match.", boundedSizedTransitImageSchema, {
          minItems: 1,
          maxItems: 4,
        }),
        description: s.string("Description of what to generate.", { minLength: 1, maxLength: 2000 }),
        imageSize: styleImageSizeSchema,
        styleDescription: s.string("Optional description of the style to match.", { maxLength: 500 }),
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        noBackground: s.boolean({ description: "Whether to remove the image background.", default: true }),
      },
      ["styleImages", "description", "imageSize"],
      "A PixelLab style-matched generation request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_generate_ui",
    description: "Start Pro generation of a pixel-art game UI element.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_generate_ui",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        description: s.string("Description of the UI element to generate.", { minLength: 1, maxLength: 2000 }),
        imageSize: uiImageSizeSchema,
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        noBackground: s.boolean({ description: "Whether to remove the UI element background.", default: true }),
        conceptImage: sizedTransitImageSchema,
        colorPalette: s.string("Optional color palette specification.", { maxLength: 200 }),
      },
      ["description"],
      "A PixelLab Pro UI generation request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_pixflux_image",
    description: "Generate one pixel-art image synchronously with the PixelLab Pixflux model.",
    inputSchema: s.actionInput(
      {
        description: s.nonEmptyString("Description of the image to generate."),
        imageSize: pixfluxImageSizeSchema,
        textGuidanceScale: s.number("How closely to follow the text description.", {
          minimum: 1,
          maximum: 20,
          default: 8,
        }),
        outline: outlineSchema,
        shading: shadingSchema,
        detail: detailSchema,
        view: cameraViewSchema,
        direction: directionSchema,
        isometric: s.boolean({ description: "Whether to generate an isometric view.", default: false }),
        noBackground: s.boolean({ description: "Whether to generate a transparent background.", default: false }),
        backgroundRemovalTask: backgroundRemovalTaskSchema,
        initImage: s.transitFile("Optional PNG or JPEG initial image."),
        initImageStrength: s.integer("Strength of the initial image influence.", {
          minimum: 1,
          maximum: 999,
          default: 300,
        }),
        colorImage: s.transitFile("Optional PNG or JPEG palette image."),
        seed: s.integer("Seed for reproducible generation."),
      },
      ["description", "imageSize"],
      "A PixelLab Pixflux image generation request.",
    ),
    outputSchema: singleImageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_pixen_image",
    description: "Generate one pixel-art image synchronously with the PixelLab Pixen model.",
    inputSchema: s.actionInput(
      {
        description: s.nonEmptyString("Description of the image to generate."),
        imageSize: pixenImageSizeSchema,
        outline: outlineSchema,
        detail: pixenDetailSchema,
        view: cameraViewSchema,
        direction: directionSchema,
        noBackground: s.boolean({ description: "Whether to generate a transparent background.", default: false }),
        backgroundRemovalTask: backgroundRemovalTaskSchema,
        seed: s.integer("Seed for reproducible generation."),
        enhancePrompt: s.boolean({ description: "Whether PixelLab should enhance the prompt first.", default: false }),
      },
      ["description", "imageSize"],
      "A PixelLab Pixen image generation request.",
    ),
    outputSchema: s.actionOutput(
      {
        image: transitFileOutputSchema,
        enhancedPrompt: s.nonEmptyString("The expanded prompt when enhancement was requested."),
        usage: usageSchema,
        enhanceUsage: usageSchema,
      },
      "A PixelLab Pixen image generation result.",
      ["image"],
    ),
  }),
  defineProviderAction(service, {
    name: "convert_to_pixel_art",
    description: "Convert a PNG or JPEG image to pixel art synchronously.",
    inputSchema: s.actionInput(
      {
        image: s.transitFile("The PNG or JPEG source image."),
        imageSize: sourceImageSizeSchema,
        outputSize: pixelArtOutputSizeSchema,
        textGuidanceScale: s.number("How closely to follow the pixel-art style.", {
          minimum: 1,
          maximum: 20,
          default: 8,
        }),
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
      },
      ["image", "imageSize", "outputSize"],
      "A PixelLab image-to-pixel-art conversion request.",
    ),
    outputSchema: singleImageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_convert_to_pixel_art_pro",
    description: "Start Pro conversion of a PNG or JPEG image to automatically scaled pixel art.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_convert_to_pixel_art_pro",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        image: s.transitFile("The PNG or JPEG source image."),
        description: s.string("Optional pixel-art style instructions.", { minLength: 1, maxLength: 2000 }),
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
      },
      ["image"],
      "A PixelLab Pro image-to-pixel-art conversion request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "resize_image",
    description: "Resize pixel art synchronously while preserving its pixel-art appearance.",
    inputSchema: s.actionInput(
      {
        description: s.string("Description of the depicted character or object.", {
          minLength: 1,
          maxLength: 2000,
        }),
        referenceImage: s.transitFile("The PNG or JPEG pixel-art image to resize."),
        referenceImageSize: resizeImageSizeSchema,
        targetSize: resizeImageSizeSchema,
        view: cameraViewSchema,
        direction: directionSchema,
        isometric: s.boolean({ description: "Whether the image uses isometric perspective.", default: false }),
        obliqueProjection: s.boolean({ description: "Whether the image uses oblique projection.", default: false }),
        noBackground: s.boolean({ description: "Whether to remove the output background.", default: false }),
        colorImage: s.transitFile("Optional PNG or JPEG palette image."),
        initImage: s.transitFile("Optional PNG or JPEG initial output guide."),
        initImageStrength: s.number("Strength of the initial image influence.", {
          minimum: 0,
          maximum: 999,
          default: 150,
        }),
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
      },
      ["description", "referenceImage", "referenceImageSize", "targetSize"],
      "A PixelLab pixel-art resize request.",
    ),
    outputSchema: singleImageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_background",
    description: "Remove a pixel-art image background synchronously and return a transparent PNG.",
    inputSchema: s.actionInput(
      {
        image: s.transitFile("The PNG or JPEG source image."),
        imageSize: removeBackgroundImageSizeSchema,
        backgroundRemovalTask: backgroundRemovalTaskSchema,
        text: s.string("Optional description of the foreground object.", { maxLength: 500 }),
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
      },
      ["image", "imageSize"],
      "A PixelLab background removal request.",
    ),
    outputSchema: singleImageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_edit_images",
    description: "Start a consistent Pro edit across one or more pixel-art images.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_edit_images",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        method: s.stringEnum(["edit_with_text", "edit_with_reference"], {
          description: "Whether to guide the edit with text or a reference image.",
          default: "edit_with_text",
        }),
        editImages: s.array("Images to edit consistently.", boundedSizedTransitImageSchema, {
          minItems: 1,
          maxItems: 16,
        }),
        imageSize: editImageSizeSchema,
        description: s.string("Edit instructions required by edit_with_text.", {
          minLength: 1,
          maxLength: 2000,
        }),
        referenceImage: boundedSizedTransitImageSchema,
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        noBackground: s.boolean({ description: "Whether to remove edited image backgrounds.", default: false }),
      },
      ["editImages", "imageSize"],
      "A PixelLab Pro multi-image edit request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_inpaint",
    description: "Start Pro mask-guided inpainting of a pixel-art image.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_inpaint",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        description: s.string("Description of what to generate in the masked area.", {
          minLength: 1,
          maxLength: 2000,
        }),
        image: s.transitFile("The PNG or JPEG image to edit."),
        maskImage: s.transitFile("A PNG or JPEG mask where white is generated and black is preserved."),
        imageSize: inpaintImageSizeSchema,
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        noBackground: s.boolean({ description: "Whether to remove the generated background.", default: false }),
        cropToMask: s.boolean({
          description: "Whether to crop generated content to the mask boundary.",
          default: true,
        }),
      },
      ["description", "image", "maskImage", "imageSize"],
      "A PixelLab Pro inpainting request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_generate_rotations",
    description: "Start generation of eight directional rotations from one reference character frame.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_generate_rotations",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        firstFrame: s.transitFile("The PNG or JPEG reference frame, up to 256 by 256 pixels."),
        noBackground: s.boolean("Whether to remove generated frame backgrounds."),
        seed: s.nonNegativeInteger("Seed for reproducible generation. Use 0 for random.", { default: 0 }),
      },
      ["firstFrame"],
      "A PixelLab eight-rotation generation request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "enhance_pixen_prompt",
    description: "Expand a short description into a model-ready PixelLab Pixen image prompt.",
    followUpActions: ["pixellab.create_pixen_image"],
    inputSchema: s.actionInput(
      {
        description: s.string("Image description to enhance.", { minLength: 1, maxLength: 2000 }),
        imageSize: pixenImageSizeSchema,
        outline: outlineSchema,
        detail: pixenDetailSchema,
        view: cameraViewSchema,
        direction: directionSchema,
        noBackground: s.boolean({ description: "Whether the prompt should omit a scene background.", default: false }),
      },
      ["description", "imageSize"],
      "A PixelLab Pixen prompt enhancement request.",
    ),
    outputSchema: promptOutputSchema,
  }),
  defineProviderAction(service, {
    name: "enhance_character_prompt",
    description: "Expand a short description into a model-ready PixelLab v3 character prompt.",
    inputSchema: s.actionInput(
      {
        description: s.string("Character description to enhance.", { minLength: 1, maxLength: 2000 }),
        imageSize: characterImageSizeSchema,
        view: s.stringEnum(["low top-down", "high top-down", "side"], {
          description: "Camera view or tilt.",
          default: "low top-down",
        }),
        outline: s.nonEmptyString("Optional outline style guidance."),
        detail: s.nonEmptyString("Optional detail level guidance."),
      },
      ["description", "imageSize"],
      "A PixelLab v3 character prompt enhancement request.",
    ),
    outputSchema: promptOutputSchema,
  }),
  defineProviderAction(service, {
    name: "enhance_animation_prompt",
    description: "Expand a motion description using the visible content of one or two animation frames.",
    followUpActions: ["pixellab.start_text_animation"],
    inputSchema: s.actionInput(
      {
        firstFrame: s.transitFile("The PNG or JPEG first animation frame."),
        lastFrame: s.transitFile("Optional PNG or JPEG final frame for interpolation guidance."),
        action: s.string("Motion description to enhance.", { minLength: 1, maxLength: 500 }),
      },
      ["firstFrame", "action"],
      "A PixelLab animation prompt enhancement request.",
    ),
    outputSchema: promptOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_pixflux_background",
    description: "Start asynchronous Pixflux pixel-art image generation.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_pixflux_background",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        description: s.nonEmptyString("Description of the image to generate."),
        imageSize: pixfluxImageSizeSchema,
        textGuidanceScale: s.number("How closely to follow the text description.", {
          minimum: 1,
          maximum: 20,
          default: 8,
        }),
        outline: outlineSchema,
        shading: shadingSchema,
        detail: detailSchema,
        view: cameraViewSchema,
        direction: directionSchema,
        isometric: s.boolean({ description: "Whether to generate an isometric view.", default: false }),
        noBackground: s.boolean({ description: "Whether to generate a transparent background.", default: false }),
        backgroundRemovalTask: backgroundRemovalTaskSchema,
        initImage: s.transitFile("Optional PNG or JPEG initial image."),
        initImageStrength: s.integer("Strength of the initial image influence.", {
          minimum: 1,
          maximum: 999,
          default: 300,
        }),
        colorImage: s.transitFile("Optional PNG or JPEG palette image."),
        seed: s.integer("Seed for reproducible generation."),
      },
      ["description", "imageSize"],
      "An asynchronous PixelLab Pixflux image request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_edit_animation",
    description: "Start a consistent Pro text-guided edit across animation frames.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_edit_animation",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        description: s.string("Edit instructions applied to every frame.", { minLength: 1, maxLength: 2000 }),
        frames: s.array("Animation frames to edit.", animationFrameInputSchema, {
          minItems: 2,
          maxItems: 16,
        }),
        imageSize: legacyAnimationSizeSchema,
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        noBackground: s.boolean({ description: "Whether to remove frame backgrounds.", default: false }),
      },
      ["description", "frames", "imageSize"],
      "A PixelLab Pro animation edit request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_interpolation",
    description: "Start Pro interpolation between two pixel-art keyframes.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_interpolation",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        startImage: animationFrameInputSchema,
        endImage: animationFrameInputSchema,
        action: s.string("Description of the transition between keyframes.", { minLength: 1, maxLength: 500 }),
        imageSize: proAnimationSizeSchema,
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        noBackground: s.boolean({ description: "Whether to remove frame backgrounds.", default: true }),
      },
      ["startImage", "endImage", "action", "imageSize"],
      "A PixelLab Pro keyframe interpolation request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_transfer_outfit",
    description: "Start Pro transfer of an outfit or appearance across animation frames.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_transfer_outfit",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        referenceImage: animationFrameInputSchema,
        frames: s.array("Animation frames that should receive the outfit.", animationFrameInputSchema, {
          minItems: 2,
          maxItems: 16,
        }),
        imageSize: proAnimationSizeSchema,
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        noBackground: s.boolean({ description: "Whether to remove frame backgrounds.", default: false }),
        additionalInstructions: s.string("Optional view, direction, or transfer guidance.", { maxLength: 2000 }),
      },
      ["referenceImage", "frames", "imageSize"],
      "A PixelLab Pro outfit transfer request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_portrait_character_conversion",
    description: "Start Pro conversion between a bust portrait and a full-body character sprite.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_portrait_character_conversion",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        direction: s.stringEnum(["portrait_to_character", "character_to_portrait"], {
          description: "Direction of the conversion.",
          default: "portrait_to_character",
        }),
        image: s.transitFile("The PNG or JPEG portrait or character image."),
        view: s.stringEnum(["low top-down", "high top-down", "side"], {
          description: "Character camera view.",
          default: "low top-down",
        }),
        resultSize: portraitResultSizeSchema,
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
      },
      ["image"],
      "A PixelLab portrait and character conversion request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "animate_with_text_legacy",
    description: "Generate four animation frames synchronously with PixelLab's original text animation model.",
    inputSchema: s.actionInput(
      {
        imageSize: legacyAnimationSizeSchema,
        description: s.nonEmptyString("Description of the character."),
        action: s.nonEmptyString("Description of the action to animate."),
        referenceImage: s.transitFile("The PNG or JPEG character reference image."),
        textGuidanceScale: s.number("How closely to follow the text description.", {
          minimum: 1,
          maximum: 20,
          default: 8,
        }),
        imageGuidanceScale: s.number("How closely to follow the reference image.", {
          minimum: 1,
          maximum: 20,
          default: 1.4,
        }),
        frameCount: s.integer("Length of the conceptual animation; the model returns four frames.", {
          minimum: 2,
          maximum: 20,
          default: 4,
        }),
        startFrameIndex: s.integer("Starting index in the conceptual animation.", {
          minimum: 0,
          maximum: 20,
          default: 0,
        }),
        view: cameraViewSchema,
        direction: directionSchema,
        colorImage: s.transitFile("Optional PNG or JPEG palette image."),
        seed: s.integer("Seed for reproducible generation. Use 0 for random.", { default: 0 }),
      },
      ["imageSize", "description", "action", "referenceImage"],
      "A PixelLab original text animation request.",
    ),
    outputSchema: s.actionOutput(
      {
        frames: animationFramesSchema,
        frameCount: s.nonNegativeInteger("Number of generated frames."),
        usage: usageSchema,
      },
      "A synchronous PixelLab animation result.",
      ["frames", "frameCount"],
    ),
  }),
  defineProviderAction(service, {
    name: "start_text_animation_pro",
    description: "Start Pro text-guided animation from a reference character image.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_text_animation_pro",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        referenceImage: s.transitFile("The PNG or JPEG character reference image."),
        referenceImageSize: proAnimationSizeSchema,
        action: s.string("Description of the action to animate.", { minLength: 1, maxLength: 500 }),
        imageSize: proAnimationSizeSchema,
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        noBackground: s.boolean({ description: "Whether to remove frame backgrounds.", default: true }),
        view: s.stringEnum(["none", "low top-down", "high top-down", "side"], {
          description: "Character camera view.",
          default: "none",
        }),
        direction: s.stringEnum(
          ["none", "south", "east", "west", "north", "south-east", "south-west", "north-east", "north-west"],
          { description: "Direction the character faces.", default: "none" },
        ),
      },
      ["referenceImage", "referenceImageSize", "action", "imageSize"],
      "A PixelLab Pro text animation request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_generate_rotations_pro",
    description: "Start Pro generation of eight directional rotations using a reference, style, or concept image.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_generate_rotations_pro",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        method: s.stringEnum(["rotate_character", "create_with_style", "create_from_concept"], {
          description: "Rotation generation method.",
          default: "rotate_character",
        }),
        imageSize: rotationsProSizeSchema,
        referenceImage: rotationReferenceSchema,
        conceptImage: rotationReferenceSchema,
        description: s.string("Description of the character or object.", { maxLength: 2000 }),
        styleDescription: s.string("Description of the desired visual style.", { maxLength: 500 }),
        view: s.stringEnum(["low top-down", "high top-down", "side"], {
          description: "Camera perspective.",
          default: "low top-down",
        }),
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        noBackground: s.boolean({ description: "Whether to remove image backgrounds.", default: true }),
      },
      ["imageSize"],
      "A PixelLab Pro eight-rotation request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "rotate_image",
    description: "Rotate or tilt a pixel-art character or object synchronously.",
    inputSchema: s.actionInput(
      {
        imageSize: legacyImageSizeSchema,
        fromImage: s.transitFile("The PNG or JPEG reference image to rotate."),
        imageGuidanceScale: s.number("How closely to follow the source image.", {
          minimum: 1,
          maximum: 20,
          default: 3,
        }),
        viewChange: s.integer("Tilt change in degrees.", { minimum: -90, maximum: 90 }),
        directionChange: s.integer("Direction change in degrees.", { minimum: -180, maximum: 180 }),
        fromView: cameraViewSchema,
        toView: cameraViewSchema,
        fromDirection: directionSchema,
        toDirection: directionSchema,
        isometric: s.boolean({ description: "Whether to generate an isometric view.", default: false }),
        obliqueProjection: s.boolean({ description: "Whether to use oblique projection.", default: false }),
        initImage: s.transitFile("Optional PNG or JPEG initial image."),
        initImageStrength: s.integer("Strength of the initial image influence.", {
          minimum: 1,
          maximum: 999,
          default: 300,
        }),
        maskImage: s.transitFile("Optional black-and-white inpainting mask."),
        colorImage: s.transitFile("Optional PNG or JPEG palette image."),
        seed: s.integer("Seed for reproducible generation."),
      },
      ["imageSize", "fromImage"],
      "A PixelLab rotation request.",
    ),
    outputSchema: singleImageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "inpaint_image_legacy",
    description: "Inpaint a masked area synchronously with PixelLab's original image model.",
    inputSchema: s.actionInput(
      {
        description: s.nonEmptyString("Description of what to generate in the masked area."),
        imageSize: legacyImageSizeSchema,
        inpaintingImage: s.transitFile("The PNG or JPEG image to edit."),
        maskImage: s.transitFile("A mask where white is generated and black is preserved."),
        textGuidanceScale: s.number("How closely to follow the description.", {
          minimum: 1,
          maximum: 10,
          default: 3,
        }),
        outline: outlineSchema,
        shading: shadingSchema,
        detail: detailSchema,
        view: cameraViewSchema,
        direction: directionSchema,
        isometric: s.boolean({ description: "Whether to generate an isometric view.", default: false }),
        obliqueProjection: s.boolean({ description: "Whether to use oblique projection.", default: false }),
        noBackground: s.boolean({ description: "Whether to generate a transparent background.", default: false }),
        initImage: s.transitFile("Optional PNG or JPEG initial image."),
        initImageStrength: s.integer("Strength of the initial image influence.", {
          minimum: 1,
          maximum: 999,
          default: 300,
        }),
        colorImage: s.transitFile("Optional PNG or JPEG palette image."),
        seed: s.integer("Seed for reproducible generation."),
      },
      ["description", "imageSize", "inpaintingImage", "maskImage"],
      "A PixelLab original inpainting request.",
    ),
    outputSchema: singleImageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_edit_image_legacy",
    description: "Start PixelLab's original text-guided image editing operation.",
    followUpActions: ["pixellab.get_background_job"],
    asyncLifecycle: {
      startActionId: "pixellab.start_edit_image_legacy",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        image: s.transitFile("The PNG or JPEG image to edit."),
        imageSize: editCanvasSizeSchema,
        description: s.string("Description of the edit to apply.", { minLength: 1, maxLength: 500 }),
        width: s.integer("Target canvas width from 16 to 400 pixels.", { minimum: 16, maximum: 400 }),
        height: s.integer("Target canvas height from 16 to 400 pixels.", { minimum: 16, maximum: 400 }),
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        noBackground: s.boolean({ description: "Whether to generate a transparent background.", default: true }),
        textGuidanceScale: s.number("How closely to follow the edit description.", {
          minimum: 1,
          maximum: 10,
          default: 8,
        }),
        colorImage: s.transitFile("Optional color reference image."),
      },
      ["image", "imageSize", "description", "width", "height"],
      "A PixelLab original image edit request.",
    ),
    outputSchema: startedJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_create_ui_asset",
    description: "Start creation of a saved PixelLab Pro UI panel asset.",
    followUpActions: ["pixellab.get_background_job", "pixellab.get_ui_asset"],
    asyncLifecycle: {
      startActionId: "pixellab.start_create_ui_asset",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        description: s.string("Style description for the UI panel.", { minLength: 1, maxLength: 2000 }),
        imageSize: s.object(
          "UI panel dimensions.",
          {
            width: s.integer("Width from 192 to 688 pixels.", { minimum: 192, maximum: 688, default: 256 }),
            height: s.integer("Height from 192 to 688 pixels.", { minimum: 192, maximum: 688, default: 256 }),
          },
          { optional: ["width", "height"] },
        ),
        pieces: s.array("Custom shapes placed on the virtual UI canvas.", uiPieceSchema),
        elements: s.array(
          "Named UI elements to scaffold automatically.",
          s.stringEnum("A supported UI element type.", [
            "button",
            "icon_button",
            "toolbar",
            "tab",
            "panel",
            "window",
            "health_bar",
            "avatar",
            "triangle",
            "pentagon",
            "hexagon",
            "octagon",
          ]),
        ),
        styleImage: s.transitFile("Optional PNG or JPEG style reference image."),
        colorPalette: s.string("Optional palette specification.", { maxLength: 200 }),
        noBackground: s.boolean({ description: "Whether to remove the panel background.", default: true }),
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        name: s.nonEmptyString("Friendly name for the saved UI asset."),
        projectId: s.nonEmptyString("Optional PixelLab project identifier."),
      },
      ["description"],
      "A PixelLab saved UI asset creation request.",
    ),
    outputSchema: s.actionOutput(
      {
        jobId: s.nonEmptyString("Background job identifier used for polling."),
        uiAssetId: s.nonEmptyString("UI asset identifier available immediately."),
        status: jobStatusSchema,
        usage: usageSchema,
      },
      "An accepted PixelLab UI asset creation job.",
      ["jobId", "uiAssetId", "status"],
    ),
  }),
  defineProviderAction(service, {
    name: "list_ui_assets",
    description: "List saved PixelLab UI assets with offset pagination.",
    followUpActions: ["pixellab.get_ui_asset"],
    inputSchema: s.actionInput(
      {
        limit: s.integer("Maximum assets to return.", { minimum: 1, maximum: 100, default: 50 }),
        offset: s.nonNegativeInteger("Number of assets to skip.", { default: 0 }),
      },
      [],
      "PixelLab UI asset list parameters.",
    ),
    outputSchema: s.actionOutput(
      {
        assets: s.array("Saved UI assets.", uiAssetSchema),
        total: s.nonNegativeInteger("Total saved UI assets."),
        usage: usageSchema,
      },
      "A page of PixelLab UI assets.",
      ["assets", "total"],
    ),
  }),
  defineProviderAction(service, {
    name: "get_ui_asset",
    description: "Retrieve one saved PixelLab UI asset and its generation status.",
    inputSchema: s.actionInput(
      { uiAssetId: s.uuid("The PixelLab UI asset identifier.") },
      ["uiAssetId"],
      "A PixelLab UI asset lookup.",
    ),
    outputSchema: s.actionOutput({ asset: uiAssetSchema }, "A PixelLab UI asset."),
  }),
  defineProviderAction(service, {
    name: "delete_ui_asset",
    description: "Delete one saved PixelLab UI asset.",
    inputSchema: s.actionInput(
      { uiAssetId: s.uuid("The PixelLab UI asset identifier to delete.") },
      ["uiAssetId"],
      "A PixelLab UI asset deletion request.",
    ),
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether PixelLab deleted the UI asset."),
        usage: usageSchema,
      },
      "The PixelLab UI asset deletion result.",
      ["success"],
    ),
  }),
  defineProviderAction(service, {
    name: "start_create_character_4_directions",
    description: "Start creation of a persisted PixelLab character with four directional rotations.",
    followUpActions: ["pixellab.get_background_job", "pixellab.get_character"],
    asyncLifecycle: {
      startActionId: "pixellab.start_create_character_4_directions",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        description: s.string("Character description and display prompt.", { minLength: 1, maxLength: 2000 }),
        imageSize: characterCreateSizeSchema,
        ...characterStyleFields,
      },
      ["description", "imageSize"],
      "A four-direction PixelLab character creation request.",
    ),
    outputSchema: characterJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_create_character_8_directions",
    description: "Start creation of a persisted PixelLab character with eight directional rotations.",
    followUpActions: ["pixellab.get_background_job", "pixellab.get_character"],
    asyncLifecycle: {
      startActionId: "pixellab.start_create_character_8_directions",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        description: s.string("Character description and display prompt.", { minLength: 1, maxLength: 2000 }),
        imageSize: characterCreateSizeSchema,
        mode: s.stringEnum(["standard", "pro"], {
          description: "Standard template generation or higher-quality Pro generation.",
          default: "standard",
        }),
        ...characterStyleFields,
      },
      ["description", "imageSize"],
      "An eight-direction PixelLab character creation request.",
    ),
    outputSchema: characterJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_create_character_pro",
    description: "Start Pro creation of a persisted eight-direction PixelLab character.",
    followUpActions: ["pixellab.get_background_job", "pixellab.get_character"],
    asyncLifecycle: {
      startActionId: "pixellab.start_create_character_pro",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        description: s.string("Description of the character to generate.", { minLength: 1, maxLength: 2000 }),
        imageSize: characterProSizeSchema,
        method: s.stringEnum(["create_with_style", "create_from_concept", "rotate_character"], {
          description: "How PixelLab should use the supplied images.",
          default: "create_with_style",
        }),
        view: s.stringEnum(["low top-down", "high top-down", "side"], {
          description: "Character camera view.",
          default: "low top-down",
        }),
        templateId: s.nonEmptyString("Body template identifier."),
        conceptImage: s.transitFile("Optional concept image, up to 1024 by 1024 pixels."),
        referenceImage: s.transitFile("Optional style or character reference image."),
        styleDescription: s.string("Additional style guidance.", { maxLength: 2000 }),
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        noBackground: s.boolean({ description: "Whether to generate transparent frames.", default: true }),
      },
      ["description", "imageSize"],
      "A PixelLab Pro character creation request.",
    ),
    outputSchema: characterJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_create_character_v3",
    description: "Start v3 creation or rotation of a persisted eight-direction PixelLab character.",
    followUpActions: ["pixellab.get_background_job", "pixellab.get_character"],
    asyncLifecycle: {
      startActionId: "pixellab.start_create_character_v3",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        description: s.string("Character description and default display name.", { minLength: 1, maxLength: 2000 }),
        referenceImage: s.transitFile("Optional south-facing reference image, up to 256 by 256 pixels."),
        imageSize: characterImageSizeSchema,
        view: s.stringEnum(["low top-down", "high top-down", "side"], {
          description: "Character camera view.",
          default: "low top-down",
        }),
        templateId: s.nonEmptyString("Body template identifier."),
        name: s.nonEmptyString("Friendly character name."),
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        noBackground: s.boolean({ description: "Whether to generate transparent frames.", default: true }),
        outline: s.nonEmptyString("Outline guidance for from-scratch mode."),
        detail: s.nonEmptyString("Detail guidance for from-scratch mode."),
        enhancePrompt: s.boolean({ description: "Whether to enhance the prompt first.", default: false }),
      },
      ["description"],
      "A PixelLab v3 character creation request.",
    ),
    outputSchema: characterJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_create_character_animation",
    description: "Start one or more background jobs that add an animation to a persisted character.",
    followUpActions: ["pixellab.get_background_job", "pixellab.get_character"],
    inputSchema: s.actionInput(
      {
        characterId: s.nonEmptyString("Existing PixelLab character identifier."),
        animationName: s.nonEmptyString("Friendly name for the animation."),
        description: s.string("Optional character description override.", { minLength: 1, maxLength: 2000 }),
        actionDescription: s.nonEmptyString("Description of the custom action to animate."),
        mode: s.stringEnum("Animation mode.", ["template", "v3", "pro"]),
        templateAnimationId: s.nonEmptyString("Template animation identifier for template mode."),
        frameCount: s.integer("Number of v3 animation frames; must be even.", {
          minimum: 4,
          maximum: 16,
          default: 8,
        }),
        customStartFrame: s.transitFile("Optional custom start frame for single-direction v3 mode."),
        endFrame: s.transitFile("Optional interpolation target frame for single-direction v3 mode."),
        keepFirstFrame: s.boolean({ description: "Whether to store the reference as frame zero.", default: true }),
        directions: s.stringArray("Directions to animate.", { minItems: 1 }),
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        enhancePrompt: s.boolean({ description: "Whether to enhance a v3 action prompt first.", default: false }),
      },
      ["characterId"],
      "A PixelLab persisted character animation request.",
    ),
    outputSchema: s.actionOutput(
      {
        jobIds: s.stringArray("Background job identifiers, one per direction."),
        directions: s.stringArray("Directions being animated."),
        status: jobStatusSchema,
        enhancedPrompt: s.nonEmptyString("Enhanced action description when requested."),
        enhanceUsage: usageSchema,
      },
      "Accepted PixelLab character animation jobs.",
      ["jobIds", "directions", "status"],
    ),
  }),
  defineProviderAction(service, {
    name: "start_create_character_state",
    description: "Start creation of an edited state for an existing persisted character.",
    followUpActions: ["pixellab.get_background_job", "pixellab.get_character"],
    asyncLifecycle: {
      startActionId: "pixellab.start_create_character_state",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        characterId: s.nonEmptyString("Existing PixelLab character identifier."),
        editDescription: s.string("Description of the new character state.", { minLength: 1, maxLength: 1000 }),
        noBackground: s.boolean({ description: "Whether to generate transparent frames.", default: true }),
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
        useColorPaletteFromReference: s.boolean({
          description: "Whether to preserve the source character palette.",
          default: false,
        }),
      },
      ["characterId", "editDescription"],
      "A PixelLab character state creation request.",
    ),
    outputSchema: characterJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_characters",
    description: "List persisted PixelLab characters with offset pagination.",
    followUpActions: ["pixellab.get_character"],
    inputSchema: s.actionInput(
      {
        limit: s.integer("Maximum characters to return.", { minimum: 1, maximum: 100, default: 50 }),
        offset: s.nonNegativeInteger("Number of characters to skip.", { default: 0 }),
      },
      [],
      "PixelLab character list parameters.",
    ),
    outputSchema: s.actionOutput(
      {
        characters: s.array("Persisted PixelLab characters.", characterSchema),
        total: s.nonNegativeInteger("Total persisted characters."),
        usage: usageSchema,
      },
      "A page of PixelLab characters.",
      ["characters", "total"],
    ),
  }),
  defineProviderAction(service, {
    name: "get_character",
    description: "Retrieve one persisted PixelLab character with rotations and animations.",
    inputSchema: s.actionInput(
      { characterId: s.nonEmptyString("The PixelLab character identifier.") },
      ["characterId"],
      "A PixelLab character lookup.",
    ),
    outputSchema: s.actionOutput({ character: characterSchema }, "A persisted PixelLab character."),
  }),
  defineProviderAction(service, {
    name: "delete_character",
    description: "Delete a persisted PixelLab character and its associated animations.",
    inputSchema: s.actionInput(
      { characterId: s.nonEmptyString("The PixelLab character identifier to delete.") },
      ["characterId"],
      "A PixelLab character deletion request.",
    ),
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether the character was deleted."),
        characterId: s.nonEmptyString("Deleted character identifier."),
        filesDeleted: s.nonNegativeInteger("Number of files deleted."),
        animationsDeleted: s.nonNegativeInteger("Number of animations deleted."),
        error: s.nonEmptyString("Deletion error when unsuccessful."),
        usage: usageSchema,
      },
      "The PixelLab character deletion result.",
      ["success"],
    ),
  }),
  defineProviderAction(service, {
    name: "download_character_zip",
    description: "Export one persisted PixelLab character as a ZIP transit file.",
    inputSchema: s.actionInput(
      { characterId: s.nonEmptyString("The PixelLab character identifier to export.") },
      ["characterId"],
      "A PixelLab character ZIP export request.",
    ),
    outputSchema: s.actionOutput({ file: transitFileOutputSchema }, "The exported PixelLab character ZIP file."),
  }),
  defineProviderAction(service, {
    name: "update_character_tags",
    description: "Replace the user-defined tags on a persisted PixelLab character.",
    inputSchema: s.actionInput(
      {
        characterId: s.nonEmptyString("The PixelLab character identifier."),
        tags: s.stringArray("Replacement character tags, up to 20.", { maxItems: 20 }),
      },
      ["characterId", "tags"],
      "A PixelLab character tag update.",
    ),
    outputSchema: s.actionOutput(
      { tags: s.stringArray("Updated character tags."), usage: usageSchema },
      "Updated PixelLab character tags.",
      ["tags"],
    ),
  }),
  defineProviderAction(service, {
    name: "start_create_object_1_direction",
    description: "Start creation of a persisted one-direction PixelLab object.",
    followUpActions: ["pixellab.get_background_job", "pixellab.get_object", "pixellab.select_object_frames"],
    asyncLifecycle: {
      startActionId: "pixellab.start_create_object_1_direction",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        description: s.string("Description of the object or object set to generate.", {
          minLength: 1,
          maxLength: 2000,
        }),
        size: s.integer("Square output size. Smaller sizes can produce several candidates for review.", {
          minimum: 32,
          maximum: 256,
        }),
        view: s.stringEnum(["top-down", "sidescroller"], {
          description: "Object camera view.",
          default: "top-down",
        }),
        styleImages: s.array(
          "PNG or JPEG style references. Their dimensions determine output size, so omit size when using them.",
          s.transitFile("A PNG or JPEG style reference, up to 256 by 256 pixels."),
        ),
        itemDescriptions: s.stringArray("Descriptions for individual candidates in a multi-object result."),
      },
      ["description"],
      "A one-direction PixelLab object creation request.",
    ),
    outputSchema: s.actionOutput(
      {
        jobId: s.nonEmptyString("Background job identifier used for polling."),
        objectId: s.nonEmptyString("Object identifier available immediately."),
        status: jobStatusSchema,
        candidateFrameCount: s.positiveInteger("Number of candidate object frames being generated."),
        usage: usageSchema,
      },
      "An accepted one-direction PixelLab object job.",
      ["jobId", "objectId", "status", "candidateFrameCount"],
    ),
  }),
  defineProviderAction(service, {
    name: "start_create_object_8_directions",
    description: "Start creation of a persisted PixelLab object with eight directional rotations.",
    followUpActions: ["pixellab.get_background_job", "pixellab.get_object"],
    asyncLifecycle: {
      startActionId: "pixellab.start_create_object_8_directions",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        description: s.string("Description of the object to generate.", { minLength: 1, maxLength: 2000 }),
        size: s.integer("Square output size when no image reference is supplied.", {
          minimum: 32,
          maximum: 168,
        }),
        view: s.stringEnum(["low top-down", "high top-down", "side"], {
          description: "Object camera view.",
          default: "low top-down",
        }),
        referenceImage: s.transitFile("Exact object image to rotate into eight directions."),
        styleImage: s.transitFile("Style image for a newly generated eight-direction object."),
      },
      ["description"],
      "An eight-direction PixelLab object creation request. Supply at most one of size, referenceImage, or styleImage.",
    ),
    outputSchema: objectJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_animate_object",
    description: "Submit one or more directional animation jobs for an existing PixelLab object.",
    followUpActions: ["pixellab.get_background_job", "pixellab.get_object"],
    inputSchema: s.actionInput(
      {
        objectId: s.nonEmptyString("Existing PixelLab object identifier."),
        mode: s.stringEnum(["pro", "v3"], {
          description: "Animation model. v3 is the recommended default.",
          default: "v3",
        }),
        animationDescription: s.string("Motion to animate. May be omitted when extending an existing group.", {
          minLength: 1,
          maxLength: 1000,
        }),
        directions: s.array("Directions to animate for an eight-direction object.", directionSchema),
        animationGroupId: s.uuid("Existing animation group to extend with additional directions."),
        displayName: s.nonEmptyString("Friendly animation name used in exports."),
        frameCount: s.positiveInteger("Frames per direction. In v3 mode this must be even and between 4 and 16."),
        replaceExisting: s.boolean({
          description: "Whether to regenerate directions already present in the animation group.",
          default: false,
        }),
        customStartFrame: s.transitFile("Custom starting pose for one direction in v3 mode."),
        endFrame: s.transitFile("Interpolation target pose for one direction in v3 mode."),
        keepFirstFrame: s.boolean({
          description: "Whether to store the input reference as frame zero in v3 mode.",
          default: true,
        }),
        enhancePrompt: s.boolean({
          description: "Whether to expand animationDescription before v3 generation.",
          default: false,
        }),
      },
      ["objectId"],
      "A PixelLab object animation request. Omit directions for one-direction objects.",
    ),
    outputSchema: s.actionOutput(
      {
        animationGroupId: s.uuid("Animation group identifier used to add more directions later."),
        mode: s.stringEnum("Animation model used.", ["pro", "v3"]),
        frameCount: s.positiveInteger("Frames generated for each submitted direction."),
        displayName: s.nonEmptyString("Friendly animation name."),
        description: s.nonEmptyString("Motion description used for generation."),
        objectId: s.nonEmptyString("Animated object identifier."),
        submissions: s.array("Per-direction background job submissions.", objectDirectionSubmissionSchema),
        enhancedPrompt: s.nonEmptyString("Expanded motion description when prompt enhancement was requested."),
        usage: usageSchema,
        enhanceUsage: usageSchema,
      },
      "Submitted PixelLab object animation jobs.",
      ["animationGroupId", "mode", "frameCount", "description", "objectId", "submissions"],
    ),
  }),
  defineProviderAction(service, {
    name: "start_create_object_state",
    description: "Start creation of an edited state for an existing PixelLab object.",
    followUpActions: ["pixellab.get_background_job", "pixellab.get_object"],
    asyncLifecycle: {
      startActionId: "pixellab.start_create_object_state",
      statusActionId: "pixellab.get_background_job",
    },
    inputSchema: s.actionInput(
      {
        objectId: s.nonEmptyString("Existing PixelLab object identifier."),
        editDescription: s.string("Description of the new object state.", { minLength: 1, maxLength: 1000 }),
        seed: s.nonNegativeInteger("Seed for reproducible generation."),
      },
      ["objectId", "editDescription"],
      "A PixelLab object state creation request.",
    ),
    outputSchema: objectJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "select_object_frames",
    description: "Keep selected candidate frames from a one-direction object review as individual objects.",
    followUpActions: ["pixellab.get_object"],
    inputSchema: s.actionInput(
      {
        objectId: s.nonEmptyString("Review-status PixelLab object identifier."),
        indices: s.array("Zero-based candidate frame indices to keep.", s.nonNegativeInteger("A frame index."), {
          minItems: 1,
        }),
        commonTag: s.nonEmptyString("Optional tag applied to every created object."),
      },
      ["objectId", "indices"],
      "A PixelLab object frame selection request.",
    ),
    outputSchema: s.actionOutput(
      {
        createdObjectIds: s.stringArray("Identifiers of objects created from the selected frames."),
        usage: usageSchema,
      },
      "Objects created from selected candidate frames.",
      ["createdObjectIds"],
    ),
  }),
  defineProviderAction(service, {
    name: "dismiss_object_review",
    description: "Discard all candidate frames for a one-direction object awaiting review.",
    inputSchema: s.actionInput(
      { objectId: s.nonEmptyString("Review-status PixelLab object identifier.") },
      ["objectId"],
      "A PixelLab object review dismissal request.",
    ),
    outputSchema: s.actionOutput(
      { dismissed: s.boolean("Whether the review candidates were dismissed."), usage: usageSchema },
      "The PixelLab object review dismissal result.",
      ["dismissed"],
    ),
  }),
  defineProviderAction(service, {
    name: "list_objects",
    description: "List persisted PixelLab objects with offset pagination.",
    followUpActions: ["pixellab.get_object"],
    inputSchema: s.actionInput(
      {
        limit: s.integer("Maximum objects to return.", { minimum: 1, maximum: 100, default: 50 }),
        offset: s.nonNegativeInteger("Number of objects to skip.", { default: 0 }),
      },
      [],
      "PixelLab object list parameters.",
    ),
    outputSchema: s.actionOutput(
      {
        objects: s.array("Persisted PixelLab objects.", objectSchema),
        total: s.nonNegativeInteger("Total persisted objects."),
        usage: usageSchema,
      },
      "A page of PixelLab objects.",
      ["objects", "total"],
    ),
  }),
  defineProviderAction(service, {
    name: "get_object",
    description: "Retrieve one persisted PixelLab object with rotations, review frames, and animations.",
    inputSchema: s.actionInput(
      { objectId: s.nonEmptyString("The PixelLab object identifier.") },
      ["objectId"],
      "A PixelLab object lookup.",
    ),
    outputSchema: s.actionOutput({ object: objectSchema }, "A persisted PixelLab object."),
  }),
  defineProviderAction(service, {
    name: "delete_object",
    description: "Delete one persisted PixelLab object.",
    inputSchema: s.actionInput(
      { objectId: s.nonEmptyString("The PixelLab object identifier to delete.") },
      ["objectId"],
      "A PixelLab object deletion request.",
    ),
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether the object was deleted."),
        objectId: s.nonEmptyString("Deleted object identifier."),
        error: s.nonEmptyString("Deletion error when unsuccessful."),
        usage: usageSchema,
      },
      "The PixelLab object deletion result.",
      ["success"],
    ),
  }),
  defineProviderAction(service, {
    name: "update_object_tags",
    description: "Replace the user-defined tags on a persisted PixelLab object.",
    inputSchema: s.actionInput(
      {
        objectId: s.nonEmptyString("The PixelLab object identifier."),
        tags: s.stringArray("Replacement object tags, up to 20.", { maxItems: 20 }),
      },
      ["objectId", "tags"],
      "A PixelLab object tag update.",
    ),
    outputSchema: s.actionOutput(
      { tags: s.stringArray("Updated object tags."), usage: usageSchema },
      "Updated PixelLab object tags.",
      ["tags"],
    ),
  }),
];
