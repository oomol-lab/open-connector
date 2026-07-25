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
];
