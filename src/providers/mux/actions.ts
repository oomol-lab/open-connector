import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mux";
const videoReadPermission = "video:read";
const videoWritePermission = "video:write";

const assetId = s.nonEmptyString("The Mux asset ID.");
const playbackPolicy = s.stringEnum(["public", "signed", "drm"], {
  description: "The access policy for a Mux playback ID.",
});
const playbackId = s.looseObject("A Mux playback ID attached to an asset.", {
  id: s.nonEmptyString("The playback ID used in Mux streaming URLs."),
  policy: playbackPolicy,
  drm_configuration_id: s.nonEmptyString("The DRM configuration ID when the policy is drm."),
});
const asset = s.looseObject("A Mux video asset, including its current processing state and media details.", {
  id: assetId,
  status: s.stringEnum(["preparing", "ready", "errored"], {
    description: "The current asset processing status.",
  }),
  created_at: s.nonEmptyString("The Unix timestamp when Mux created the asset."),
  duration: s.number("The asset duration in seconds.", { minimum: 0 }),
  aspect_ratio: s.nonEmptyString("The source aspect ratio in width:height form."),
  resolution_tier: s.nonEmptyString("The highest resolution tier available for the asset."),
  video_quality: s.stringEnum(["basic", "plus", "premium"], {
    description: "The Mux video quality tier used to encode the asset.",
  }),
  passthrough: s.nullableString("User-supplied passthrough metadata."),
  playback_ids: s.array("Playback IDs currently attached to the asset.", playbackId),
  tracks: s.array("Audio, video, and text tracks in the asset.", s.looseObject("A Mux asset track.")),
  errors: s.looseObject("Processing errors reported by Mux when the asset is errored."),
  meta: s.looseObject("Customer-provided structured metadata for the asset."),
});
const assetOutput = s.actionOutput({ asset }, "A Mux asset response.");
const assetMeta = s.object(
  "Customer-provided metadata attached to a Mux asset. This may be exposed to video players; do not include PII.",
  {
    title: s.string("A human-readable asset title.", { maxLength: 512 }),
    creatorId: s.string("Your identifier for the asset creator.", { maxLength: 128 }),
    externalId: s.string("Your identifier linking the asset to an external record.", { maxLength: 128 }),
  },
  { optional: ["title", "creatorId", "externalId"] },
);
const directUploadAssetSettings = s.object(
  "Asset settings applied after a direct upload completes.",
  {
    playbackPolicies: s.array(
      "Playback policies to create for the resulting asset.",
      s.stringEnum(["public", "signed"], { description: "A non-DRM Mux playback policy." }),
      { minItems: 1, maxItems: 2 },
    ),
    videoQuality: s.stringEnum(["basic", "plus", "premium"], {
      description: "The cost and encoding-quality tier for the resulting asset.",
    }),
    maxResolutionTier: s.stringEnum(["1080p", "1440p", "2160p"], {
      description: "The maximum resolution tier Mux should produce.",
    }),
    passthrough: s.string("Opaque metadata returned in asset details and related webhooks.", { maxLength: 255 }),
    meta: assetMeta,
  },
  { optional: ["playbackPolicies", "videoQuality", "maxResolutionTier", "passthrough", "meta"] },
);
const upload = s.looseObject("A Mux Direct Upload and its current ingest status.", {
  id: s.nonEmptyString("The Direct Upload ID."),
  cors_origin: s.nonEmptyString("The browser origin allowed to use the signed upload URL."),
  status: s.stringEnum(["waiting", "asset_created", "errored", "cancelled", "timed_out"], {
    description: "The current Direct Upload status.",
  }),
  timeout: s.nonNegativeInteger("The signed upload URL validity period in seconds."),
  asset_id: s.nullableString("The resulting asset ID once the upload has been ingested."),
  error: s.looseObject("The ingest error reported for a failed Direct Upload."),
  new_asset_settings: s.looseObject("The asset settings used after ingest."),
  test: s.boolean("Whether this is a Mux test upload."),
  url: s.nullableString("The signed URL to which the source media should be uploaded."),
});
const uploadOutput = s.actionOutput({ upload }, "A Mux Direct Upload response.");
const playbackLookup = s.looseObject("The Mux object associated with a playback ID.", {
  id: s.nonEmptyString("The playback ID."),
  object: s.looseObject("The associated Mux object.", {
    id: s.nonEmptyString("The associated asset or live stream ID."),
    type: s.stringEnum(["asset", "live_stream"], { description: "The associated Mux object type." }),
  }),
  policy: playbackPolicy,
});
const assetLifecycle = {
  startActionId: "mux.create_asset",
  statusActionId: "mux.get_asset",
};

export const muxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_asset",
    description:
      "Create a Mux on-demand video asset from a publicly accessible media URL and return its initial processing state.",
    providerPermissions: [videoWritePermission],
    followUpActions: ["mux.get_asset", "mux.create_playback_id"],
    asyncLifecycle: assetLifecycle,
    inputSchema: s.actionInput(
      {
        sourceUrl: s.url("A publicly accessible HTTP(S) URL that Mux can download as the primary media input."),
        playbackPolicies: s.array(
          "Playback policies to create with the asset. Omit this field to create an asset without a playback ID.",
          s.stringEnum(["public", "signed"], { description: "A non-DRM Mux playback policy." }),
          { minItems: 1, maxItems: 2 },
        ),
        videoQuality: s.stringEnum(["basic", "plus", "premium"], {
          description: "The cost and encoding-quality tier. Mux uses the environment default when omitted.",
        }),
        maxResolutionTier: s.stringEnum(["1080p", "1440p", "2160p"], {
          description: "The maximum resolution tier Mux should produce.",
        }),
        passthrough: s.string({
          minLength: 1,
          maxLength: 255,
          description: "Opaque metadata returned in asset details and related webhooks.",
        }),
        test: s.boolean("Whether to create a free, watermarked test asset limited to 10 seconds and 24 hours."),
        meta: s.object(
          "Structured asset metadata. Do not include sensitive or personally identifiable information.",
          {
            title: s.string("A human-readable asset title.", { maxLength: 512 }),
            creatorId: s.string("Your identifier for the asset creator.", { maxLength: 128 }),
            externalId: s.string("Your identifier linking the asset to an external record.", { maxLength: 128 }),
          },
          { optional: ["title", "creatorId", "externalId"] },
        ),
      },
      ["sourceUrl"],
      "Settings for creating a Mux asset from a remote media file.",
    ),
    outputSchema: assetOutput,
  }),
  defineProviderAction(service, {
    name: "list_assets",
    description: "List Mux video assets with cursor or page-based pagination and optional source filters.",
    providerPermissions: [videoReadPermission],
    followUpActions: ["mux.get_asset"],
    inputSchema: s.object(
      "Filters and pagination for Mux assets.",
      {
        limit: s.integer("The maximum number of assets to return.", { minimum: 1, default: 25 }),
        page: s.positiveInteger("The one-based page number. Do not combine this with cursor."),
        cursor: s.nonEmptyString("The next_cursor value from a previous list_assets response."),
        liveStreamId: s.nonEmptyString("Return only assets created by this Mux live stream."),
        uploadId: s.nonEmptyString("Return only the asset created by this Mux direct upload."),
      },
      { optional: ["limit", "page", "cursor", "liveStreamId", "uploadId"] },
    ),
    outputSchema: s.actionOutput(
      {
        assets: s.array("Mux assets in this page.", asset),
        nextCursor: s.nullableString("The cursor for the next page, or null when no cursor was returned."),
      },
      "A page of Mux assets.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_asset",
    description: "Retrieve the latest processing state and media details for one Mux video asset.",
    providerPermissions: [videoReadPermission],
    followUpActions: ["mux.create_playback_id", "mux.delete_asset"],
    asyncLifecycle: assetLifecycle,
    inputSchema: s.actionInput({ assetId }, ["assetId"], "The Mux asset to retrieve."),
    outputSchema: assetOutput,
  }),
  defineProviderAction(service, {
    name: "update_asset",
    description: "Update the passthrough value or customer metadata for an existing Mux video asset.",
    providerPermissions: [videoWritePermission],
    followUpActions: ["mux.get_asset"],
    inputSchema: s.actionInput(
      {
        assetId,
        passthrough: s.string(
          "Opaque metadata to include in asset details and related webhooks. Pass an empty string to clear it.",
          { maxLength: 255 },
        ),
        meta: assetMeta,
      },
      ["assetId"],
      "The metadata changes to apply to a Mux asset.",
    ),
    outputSchema: assetOutput,
  }),
  defineProviderAction(service, {
    name: "delete_asset",
    description: "Permanently delete a Mux video asset and all of its data.",
    providerPermissions: [videoWritePermission],
    inputSchema: s.actionInput({ assetId }, ["assetId"], "The Mux asset to delete."),
    outputSchema: s.actionOutput(
      {
        deleted: s.literal(true, { description: "Whether Mux accepted the deletion." }),
        assetId,
      },
      "Confirmation that a Mux asset was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_playback_id",
    description: "Create a public, signed, or DRM playback ID for an existing Mux video asset.",
    providerPermissions: [videoWritePermission],
    inputSchema: s.oneOf(
      [
        s.object(
          {
            assetId,
            policy: s.stringEnum(["public", "signed"], {
              description: "The playback policy for a non-DRM playback ID.",
            }),
          },
          { required: ["assetId", "policy"] },
        ),
        s.object(
          {
            assetId,
            policy: s.literal("drm", { description: "Create a DRM-protected playback ID." }),
            drmConfigurationId: s.nonEmptyString("The Mux DRM configuration to apply."),
          },
          { required: ["assetId", "policy", "drmConfigurationId"] },
        ),
      ],
      { description: "The asset and access policy for a new Mux playback ID." },
    ),
    outputSchema: s.actionOutput({ playbackId }, "The playback ID created by Mux."),
  }),
  defineProviderAction(service, {
    name: "create_direct_upload",
    description:
      "Create a signed Mux Direct Upload URL for client-side or server-side media ingest without proxying video bytes through the connector.",
    providerPermissions: [videoWritePermission],
    followUpActions: ["mux.get_direct_upload", "mux.list_assets"],
    inputSchema: s.actionInput(
      {
        corsOrigin: s.nonEmptyString("The browser origin that will use the signed upload URL, or * for any origin."),
        newAssetSettings: directUploadAssetSettings,
        test: s.boolean("Whether to create a free, watermarked test upload."),
        timeout: s.integer("How long the signed upload URL remains valid, in seconds.", {
          minimum: 60,
          maximum: 604800,
        }),
      },
      ["corsOrigin"],
      "Settings for creating a Mux Direct Upload.",
    ),
    outputSchema: uploadOutput,
  }),
  defineProviderAction(service, {
    name: "get_direct_upload",
    description: "Retrieve the status, signed URL, and resulting asset ID for a Mux Direct Upload.",
    providerPermissions: [videoReadPermission],
    followUpActions: ["mux.get_asset"],
    inputSchema: s.actionInput(
      { uploadId: s.nonEmptyString("The Mux Direct Upload ID.") },
      ["uploadId"],
      "The Direct Upload to retrieve.",
    ),
    outputSchema: uploadOutput,
  }),
  defineProviderAction(service, {
    name: "list_direct_uploads",
    description: "List Mux Direct Uploads in the current environment, including waiting and completed uploads.",
    providerPermissions: [videoReadPermission],
    followUpActions: ["mux.get_direct_upload", "mux.get_asset"],
    inputSchema: s.object(
      "Pagination for Mux Direct Uploads.",
      {
        limit: s.integer("The maximum number of Direct Uploads to return.", { minimum: 1, maximum: 100 }),
        page: s.positiveInteger("The one-based page number."),
      },
      { optional: ["limit", "page"] },
    ),
    outputSchema: s.actionOutput(
      {
        uploads: s.array("Mux Direct Uploads in this page.", upload),
        page: s.nullableInteger("The current page number returned by Mux."),
        limit: s.nullableInteger("The page size returned by Mux."),
        total: s.nullableInteger("The total number of Direct Uploads reported by Mux."),
      },
      "A page of Mux Direct Uploads.",
    ),
  }),
  defineProviderAction(service, {
    name: "cancel_direct_upload",
    description: "Cancel a waiting Mux Direct Upload so that a later upload cannot create an asset.",
    providerPermissions: [videoWritePermission],
    inputSchema: s.actionInput(
      { uploadId: s.nonEmptyString("The Mux Direct Upload ID.") },
      ["uploadId"],
      "The Direct Upload to cancel.",
    ),
    outputSchema: uploadOutput,
  }),
  defineProviderAction(service, {
    name: "get_playback_id",
    description: "Resolve a Mux playback ID to the asset or live stream it belongs to and its access policy.",
    providerPermissions: [videoReadPermission],
    inputSchema: s.actionInput(
      { playbackId: s.nonEmptyString("The Mux playback ID to resolve.") },
      ["playbackId"],
      "The playback ID to resolve.",
    ),
    outputSchema: s.actionOutput({ playbackId: playbackLookup }, "The Mux playback ID association."),
  }),
];
