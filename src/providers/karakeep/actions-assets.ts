import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { karakeepIdField, signedAssetUrlSchema, transitFileFields, uploadedAssetSchema } from "./schemas.ts";

const service = "karakeep";
const assetReadScopes = ["assets:read"] as const;
const assetWriteScopes = ["assets:readwrite"] as const;

const uploadAssetInputSchema = s.requiredObject("Input parameters for uploading a file to Karakeep as a new asset.", {
  file: s.transitFile(
    "A file previously uploaded to the local transit file API. Optional name and mimeType overrides are forwarded to Karakeep.",
  ),
});

const getAssetInputSchema = s.requiredObject("Input parameters for downloading a Karakeep asset.", {
  assetId: karakeepIdField(
    "The id of the asset to download, as returned by upload_asset or by the assets array of a bookmark.",
  ),
});

const getAssetOutputSchema = s.looseRequiredObject(
  "The downloaded Karakeep asset stored in local transit storage.",
  transitFileFields,
);

export const karakeepAssetActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "upload_asset",
    operationType: "write",
    description:
      "Upload a local transit file to Karakeep as a new standalone asset. Karakeep accepts GIF, JPEG, PNG, WebP, MP4, WebM, Matroska video, HTML, and PDF files, subject to the instance asset-size limit. The asset is initially detached; use attach_asset_to_bookmark to associate it with a bookmark.",
    requiredScopes: assetWriteScopes,
    inputSchema: uploadAssetInputSchema,
    outputSchema: uploadedAssetSchema,
  }),
  defineProviderAction(service, {
    name: "get_asset",
    operationType: "read",
    description:
      "Download the binary content of a Karakeep asset into local transit storage. Karakeep normally sends no file name, so the stored name falls back to the asset id plus an extension inferred from the content type.",
    requiredScopes: assetReadScopes,
    inputSchema: getAssetInputSchema,
    outputSchema: getAssetOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_asset_signed_url",
    operationType: "read",
    description:
      "Create a short lived signed download URL for a Karakeep asset. The URL carries its own token, so anyone holding it can fetch the asset without an API key, and it expires between 15 and 75 minutes after it was issued. Karakeep builds the URL from the public URL configured on the instance itself rather than from the instance URL stored on this connection, so a misconfigured self-hosted instance can return a host that is unreachable from the outside.",
    requiredScopes: assetReadScopes,
    inputSchema: s.requiredObject("Input parameters for signing a Karakeep asset URL.", {
      assetId: karakeepIdField(
        "The id of the asset to sign, as returned by upload_asset or by the assets array of a bookmark.",
      ),
    }),
    outputSchema: signedAssetUrlSchema,
  }),
];
