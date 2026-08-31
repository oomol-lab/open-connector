import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zip_archive_api" as const;

const transitFileSchema = s.requiredObject("A file uploaded to connector transit storage.", {
  fileId: s.nonEmptyString("The local transit file identifier."),
  name: s.nonEmptyString("The file name."),
  mimeType: s.nonEmptyString("The file MIME type returned by ArchiveAPI."),
  downloadUrl: s.url("The local transit URL for downloading the file."),
  sizeBytes: s.nonNegativeInteger("The file size in bytes."),
});

export const zipArchiveApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "compress_files",
    description: "Compress one or more publicly accessible files into a ZIP archive and return a transit download URL.",
    inputSchema: s.object(
      "Public file URLs and ZIP options.",
      {
        fileUrls: s.array(
          "The publicly accessible file URLs that ArchiveAPI should compress.",
          s.url("One publicly accessible file URL."),
          { minItems: 1 },
        ),
        archiveName: s.nonEmptyString("The requested archive filename, including the .zip extension."),
        password: s.nonEmptyString("An optional password used to protect the ZIP archive."),
        compressionLevel: s.integer("The ZIP compression level from 1 through 9.", {
          minimum: 1,
          maximum: 9,
        }),
      },
      { optional: ["archiveName", "password", "compressionLevel"] },
    ),
    outputSchema: s.requiredObject("The compressed ZIP archive in connector transit storage.", {
      file: transitFileSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "extract_archive",
    description: "Extract a publicly accessible archive and return each extracted file through transit storage.",
    inputSchema: s.object(
      "A public archive URL and optional password.",
      {
        fileUrl: s.url("The publicly accessible archive URL that ArchiveAPI should extract."),
        password: s.nonEmptyString("The password used to open a protected archive."),
      },
      { optional: ["password"] },
    ),
    outputSchema: s.requiredObject("The extracted files uploaded to connector transit storage.", {
      files: s.array("The files extracted from the source archive.", transitFileSchema, {
        minItems: 1,
      }),
    }),
  }),
];
