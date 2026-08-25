import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "heygen";

const emptyInputSchema = s.object("The input payload for this action.", {});
const rawObjectSchema = s.looseObject("The raw object returned by the HeyGen API.");
const rawObjectArraySchema = s.array("The list of raw objects returned by the HeyGen API.", rawObjectSchema);
const nullableRawObjectSchema = s.nullable(rawObjectSchema);
const nullableStringSchema = s.nullableString("The value returned by HeyGen, or null when unavailable.");

const dimensionSchema = s.looseRequiredObject(
  "The optional video dimension configuration.",
  {
    width: s.positiveInteger("The output video width in pixels."),
    height: s.positiveInteger("The output video height in pixels."),
  },
  { optional: ["width", "height"] },
);

const videoCharacterSchema = s.looseRequiredObject(
  "The character configuration for a HeyGen video scene.",
  {
    type: s.stringEnum("The character type, either avatar or talking_photo.", ["avatar", "talking_photo"]),
    avatarId: s.nonEmptyString("The HeyGen avatar ID to use for this scene."),
    avatarStyle: s.nonEmptyString("The avatar rendering style, such as normal."),
    talkingPhotoId: s.nonEmptyString("The HeyGen talking photo ID to use for this scene."),
    scale: s.number("The optional character scale for this scene."),
  },
  { optional: ["type", "avatarId", "avatarStyle", "talkingPhotoId", "scale"] },
);

const videoVoiceSchema = s.looseRequiredObject(
  "The voice or audio configuration for a HeyGen video scene.",
  {
    type: s.stringEnum("The voice input type, either text or audio.", ["text", "audio"]),
    voiceId: s.nonEmptyString("The HeyGen voice ID to use for narration."),
    inputText: s.nonEmptyString("The text that HeyGen should synthesize."),
    audioUrl: s.nonEmptyString("The audio URL to use when the voice type is audio."),
    audioAssetId: s.nonEmptyString("The uploaded audio asset ID to use when the voice type is audio."),
    speed: s.number("The optional speech speed multiplier."),
    pitch: s.number("The optional voice pitch adjustment."),
  },
  { optional: ["type", "voiceId", "inputText", "audioUrl", "audioAssetId", "speed", "pitch"] },
);

const backgroundSchema = s.looseRequiredObject(
  "The optional background configuration for a HeyGen video scene.",
  {
    type: s.stringEnum("The background type: color, image, or video.", ["color", "image", "video"]),
    value: s.nonEmptyString("The hex color value when the background type is color."),
    url: s.nonEmptyString("The background image or video URL."),
    imageAssetId: s.nonEmptyString("The uploaded image asset ID for image backgrounds."),
    videoAssetId: s.nonEmptyString("The uploaded video asset ID for video backgrounds."),
    fit: s.stringEnum("How the background media should fit the scene.", ["crop", "cover", "contain", "none"]),
    playStyle: s.stringEnum("The video background playback style.", ["freeze", "loop", "fit_to_scene", "full_video"]),
  },
  { optional: ["value", "url", "imageAssetId", "videoAssetId", "fit", "playStyle"] },
);

const videoInputSchema = s.looseRequiredObject(
  "One scene input for HeyGen video generation.",
  {
    character: videoCharacterSchema,
    voice: videoVoiceSchema,
    background: backgroundSchema,
  },
  { optional: ["background"] },
);

const templateVariablesSchema = s.record(
  "Template variables keyed by the exact variable names returned by the template detail endpoint.",
  rawObjectSchema,
);

const getByTemplateIdInputSchema = s.actionInput(
  {
    templateId: s.nonEmptyString("The unique HeyGen template ID to retrieve."),
  },
  ["templateId"],
  "Input parameters for retrieving a HeyGen template.",
);

const getByAvatarIdInputSchema = s.actionInput(
  {
    avatarId: s.nonEmptyString("The unique HeyGen avatar ID to retrieve."),
  },
  ["avatarId"],
  "Input parameters for retrieving a HeyGen avatar.",
);

const getByVideoIdInputSchema = s.actionInput(
  {
    videoId: s.nonEmptyString("The HeyGen video ID returned by a generation request."),
  },
  ["videoId"],
  "Input parameters for retrieving a HeyGen video resource.",
);

const uploadAssetInputSchema = s.actionInput(
  {
    contentBase64: s.nonEmptyString("The media file content encoded as a Base64 string."),
    mimeType: s.stringEnum("The MIME type of the media file to upload.", [
      "image/png",
      "image/jpeg",
      "video/mp4",
      "video/webm",
      "audio/mpeg",
    ]),
  },
  ["contentBase64", "mimeType"],
  "Input parameters for uploading a HeyGen media asset.",
);

const listAssetsInputSchema = s.actionInput(
  {
    limit: s.integer(
      "The maximum number of assets to return, from 0 to 100. Use 0 to request no assets, or omit this field to use HeyGen's server default.",
      { minimum: 0, maximum: 100 },
    ),
    token: s.nonEmptyString("The pagination token returned by a previous request."),
    fileType: s.stringEnum("The asset type to list: image, video, or audio.", ["image", "video", "audio"]),
    folderId: s.nonEmptyString("The HeyGen folder ID to list assets from."),
  },
  [],
  "Input parameters for listing HeyGen assets.",
);

const getByAssetIdInputSchema = s.actionInput(
  {
    assetId: s.nonEmptyString("The HeyGen asset ID to delete."),
  },
  ["assetId"],
  "Input parameters for deleting a HeyGen asset.",
);

const listVideosInputSchema = s.actionInput(
  {
    limit: s.integer("The maximum number of videos to return, from 0 to 100.", { minimum: 0, maximum: 100 }),
    token: s.nonEmptyString("The pagination token returned by a previous request."),
    folderId: s.nonEmptyString("The HeyGen folder ID to list videos from."),
    title: s.nonEmptyString("The video title to search for."),
  },
  [],
  "Input parameters for listing HeyGen videos.",
);

const deleteVideoInputSchema = s.actionInput(
  {
    videoId: s.nonEmptyString("The HeyGen video ID to delete."),
    type: s.stringEnum("The video category, either heygen_video or video_translate.", [
      "heygen_video",
      "video_translate",
    ]),
  },
  ["videoId"],
  "Input parameters for deleting a HeyGen video.",
);

const listFoldersInputSchema = s.actionInput(
  {
    limit: s.integer("The maximum number of folders to return, from 0 to 100.", { minimum: 0, maximum: 100 }),
    parentId: s.nonEmptyString("The parent folder ID to filter by."),
    nameFilter: s.nonEmptyString("The full or partial folder name to search for."),
    isTrash: s.boolean("Whether to list folders in the trash."),
    token: s.nonEmptyString("The pagination token returned by a previous request."),
  },
  [],
  "Input parameters for listing HeyGen folders.",
);

const generateVideoInputSchema = s.actionInput(
  {
    videoInputs: s.array("The scenes to generate into a video.", videoInputSchema, { minItems: 1 }),
    title: s.nonEmptyString("The optional title for the generated video."),
    test: s.boolean("Whether HeyGen should run the request in test mode."),
    caption: s.boolean("Whether HeyGen should add captions to the video."),
    callbackId: s.nonEmptyString("An optional callback identifier returned in webhooks."),
    callbackUrl: s.nonEmptyString("The URL HeyGen should notify when video rendering is complete."),
    aspectRatio: s.nonEmptyString("The target aspect ratio, such as 16:9 or 9:16."),
    dimension: dimensionSchema,
    folderId: s.nonEmptyString("The HeyGen folder ID where the video should be stored."),
  },
  ["videoInputs"],
  "Input parameters for generating a HeyGen video.",
);

const generateTemplateVideoInputSchema = s.actionInput(
  {
    templateId: s.nonEmptyString("The HeyGen template ID to generate from."),
    variables: templateVariablesSchema,
    title: s.nonEmptyString("The optional title for the generated video."),
    test: s.boolean("Whether HeyGen should run the request in test mode."),
    caption: s.boolean("Whether HeyGen should add captions to the video."),
    dimension: dimensionSchema,
    includeGif: s.boolean("Whether to include a GIF preview URL in the webhook response."),
    enableSharing: s.boolean("Whether to make the video publicly shareable immediately after creation."),
    folderId: s.nonEmptyString("The HeyGen folder ID where the video should be stored."),
    brandVoiceId: s.nonEmptyString("The Brand Glossary ID used for translation and pronunciation rules."),
    callbackUrl: s.nonEmptyString("The URL HeyGen should notify when video rendering is complete."),
    keepTextVerticallyCentered: s.boolean("Whether replaced text elements should be vertically centered."),
  },
  ["templateId", "variables"],
  "Input parameters for generating a HeyGen video from a template.",
);

const listAvatarsOutputSchema = s.actionOutput(
  {
    avatars: rawObjectArraySchema,
    talkingPhotos: rawObjectArraySchema,
    raw: rawObjectSchema,
  },
  "The normalized output for listing HeyGen avatars.",
);

const listVoicesOutputSchema = s.actionOutput(
  {
    voices: rawObjectArraySchema,
    totalCount: s.nullableInteger("The total voice count when HeyGen includes it, otherwise null."),
    raw: rawObjectSchema,
  },
  "The normalized output for listing HeyGen voices.",
);

const listTemplatesOutputSchema = s.actionOutput(
  {
    templates: rawObjectArraySchema,
    raw: rawObjectSchema,
  },
  "The normalized output for listing HeyGen templates.",
);

const videoIdOutputSchema = s.actionOutput(
  {
    videoId: s.nonEmptyString("The generated HeyGen video ID."),
    raw: rawObjectSchema,
  },
  "The normalized output for a HeyGen video generation request.",
);

const videoStatusOutputSchema = s.actionOutput(
  {
    videoId: s.nullableString("The HeyGen video ID when returned by the API."),
    status: s.nullableString("The current processing status of the video."),
    videoUrl: s.nullableString("The rendered video URL when available."),
    thumbnailUrl: s.nullableString("The rendered video thumbnail URL when available."),
    duration: s.nullableNumber("The rendered video duration when available."),
    raw: rawObjectSchema,
  },
  "The normalized output for retrieving HeyGen video status.",
);

const shareableUrlOutputSchema = s.actionOutput(
  {
    shareableUrl: s.nullableString("The public HeyGen share URL when available."),
    raw: s.unknown("The raw HeyGen response data value."),
  },
  "The normalized output for retrieving a HeyGen shareable video URL.",
);

const uploadedAssetOutputSchema = s.actionOutput(
  {
    assetId: s.nonEmptyString("The uploaded HeyGen asset ID."),
    url: nullableStringSchema,
    asset: rawObjectSchema,
    raw: rawObjectSchema,
  },
  "The normalized output for uploading a HeyGen asset.",
);

const listAssetsOutputSchema = listPagedResourceOutput("assets", "asset");
const listVideosOutputSchema = listPagedResourceOutput("videos", "video");
const listFoldersOutputSchema = listPagedResourceOutput("folders", "folder");

const deleteAssetOutputSchema = s.actionOutput(
  {
    assetId: s.nonEmptyString("The deleted HeyGen asset ID."),
    deleted: s.boolean("Whether HeyGen accepted the asset deletion request."),
    asset: nullableRawObjectSchema,
    raw: rawObjectSchema,
  },
  "The normalized output for deleting a HeyGen asset.",
);

const deleteVideoOutputSchema = s.actionOutput(
  {
    videoId: s.nonEmptyString("The HeyGen video ID requested for deletion."),
    deleted: s.boolean("Whether HeyGen reported the video as deleted."),
    deletedVideoIds: s.stringArray("The video IDs HeyGen reported as successfully deleted."),
    failedVideoIds: s.stringArray("The video IDs HeyGen reported as failed."),
    raw: rawObjectSchema,
  },
  "The normalized output for deleting a HeyGen video.",
);

export const heygenActions: ActionDefinition[] = [
  action(
    "get_current_user",
    "Retrieve profile information for the HeyGen account associated with the API key.",
    emptyInputSchema,
    singleObjectOutputSchema("user", "The current HeyGen user object."),
  ),
  action(
    "get_remaining_quota",
    "Retrieve the remaining generation quota for the authenticated HeyGen account.",
    emptyInputSchema,
    singleObjectOutputSchema("quota", "The HeyGen quota object."),
  ),
  action(
    "list_avatars",
    "List HeyGen avatars and talking photos available for video generation.",
    emptyInputSchema,
    listAvatarsOutputSchema,
  ),
  action(
    "get_avatar",
    "Retrieve details for a single HeyGen avatar by avatar ID.",
    getByAvatarIdInputSchema,
    singleObjectOutputSchema("avatar", "The HeyGen avatar detail object."),
  ),
  action("list_voices", "List HeyGen voices available for video narration.", emptyInputSchema, listVoicesOutputSchema),
  action(
    "list_templates",
    "List HeyGen templates created under the authenticated account.",
    emptyInputSchema,
    listTemplatesOutputSchema,
  ),
  action(
    "get_template",
    "Retrieve variable definitions and metadata for a single HeyGen template.",
    getByTemplateIdInputSchema,
    singleObjectOutputSchema("template", "The HeyGen template detail object."),
  ),
  defineProviderAction(service, {
    name: "generate_video",
    description: "Start an asynchronous HeyGen avatar video generation job and return the generated video ID.",
    followUpActions: ["heygen.get_video_status"],
    asyncLifecycle: {
      startActionId: "heygen.generate_video",
      statusActionId: "heygen.get_video_status",
    },
    inputSchema: generateVideoInputSchema,
    outputSchema: videoIdOutputSchema,
  }),
  defineProviderAction(service, {
    name: "generate_template_video",
    description: "Start an asynchronous HeyGen template video generation job with explicit template variables.",
    followUpActions: ["heygen.get_video_status"],
    asyncLifecycle: {
      startActionId: "heygen.generate_template_video",
      statusActionId: "heygen.get_video_status",
    },
    inputSchema: generateTemplateVideoInputSchema,
    outputSchema: videoIdOutputSchema,
  }),
  action(
    "get_video_status",
    "Retrieve processing status and download URLs for a HeyGen video by video ID.",
    getByVideoIdInputSchema,
    videoStatusOutputSchema,
  ),
  action(
    "get_shareable_video_url",
    "Retrieve a public share URL for a rendered HeyGen video by video ID.",
    getByVideoIdInputSchema,
    shareableUrlOutputSchema,
  ),
  action(
    "upload_asset",
    "Upload an image, video, or audio file to HeyGen and return an asset ID usable in video generation.",
    uploadAssetInputSchema,
    uploadedAssetOutputSchema,
  ),
  action(
    "list_assets",
    "List uploaded HeyGen image, video, and audio assets so they can be reused in video generation.",
    listAssetsInputSchema,
    listAssetsOutputSchema,
  ),
  action(
    "delete_asset",
    "Delete a HeyGen asset that is no longer needed.",
    getByAssetIdInputSchema,
    deleteAssetOutputSchema,
  ),
  action(
    "list_videos",
    "List generated HeyGen videos for historical result management.",
    listVideosInputSchema,
    listVideosOutputSchema,
  ),
  action(
    "delete_video",
    "Delete a generated or translated HeyGen video that is no longer needed.",
    deleteVideoInputSchema,
    deleteVideoOutputSchema,
  ),
  action(
    "list_folders",
    "List HeyGen folders and folder IDs that can be used with HeyGen video generation inputs.",
    listFoldersInputSchema,
    listFoldersOutputSchema,
  ),
];

function action(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    description,
    inputSchema,
    outputSchema,
  });
}

function singleObjectOutputSchema(name: string, description: string): JsonSchema {
  return s.actionOutput(
    {
      [name]: s.looseObject(description),
      raw: rawObjectSchema,
    },
    `The normalized output for this HeyGen ${name} action.`,
  );
}

function listPagedResourceOutput(fieldName: string, itemName: string): JsonSchema {
  return s.actionOutput(
    {
      [fieldName]: rawObjectArraySchema,
      totalCount: s.nullableInteger(`The total ${itemName} count when HeyGen includes it, otherwise null.`),
      nextToken: s.nullableString("The pagination token for the next page, or null when there is no next page."),
      raw: rawObjectSchema,
    },
    `The normalized output for listing HeyGen ${itemName}s.`,
  );
}
