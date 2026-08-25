import type { IStagedTransitFileService, StagedTransitFile, TransitFileUpload } from "./transit-file-store.ts";

import Busboy from "busboy";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { TransitFileError } from "./transit-file-store.ts";

export interface NodeTransitFileUploadOptions {
  transitFiles: IStagedTransitFileService;
  tempDir: string;
}

export function createNodeTransitFileUpload(
  options: NodeTransitFileUploadOptions,
): (request: Request) => Promise<TransitFileUpload> {
  return async (request) => {
    await mkdir(options.tempDir, { recursive: true });
    const path = join(options.tempDir, `${randomBytes(16).toString("hex")}.tmp`);
    try {
      return await options.transitFiles.createFromPath(
        await stageMultipartFile(request, path, options.transitFiles.maxBytes),
      );
    } finally {
      await unlink(path).catch(() => undefined);
    }
  };
}

export async function cleanupStagedTransitFiles(tempDir: string, maxAgeMs: number): Promise<void> {
  const cutoff = Date.now() - maxAgeMs;
  const entries = await readdir(tempDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile() || !/^[a-f0-9]{32}\.tmp$/.test(entry.name)) {
        return;
      }
      const path = join(tempDir, entry.name);
      const stats = await stat(path).catch(() => undefined);
      if (stats && stats.mtimeMs < cutoff) {
        await unlink(path).catch(() => undefined);
      }
    }),
  );
}

async function stageMultipartFile(request: Request, path: string, maxBytes: number): Promise<StagedTransitFile> {
  const contentType = request.headers.get("content-type");
  if (!contentType || !request.body) {
    throw invalidInput();
  }

  let parser: ReturnType<typeof Busboy>;
  try {
    parser = Busboy({
      headers: { "content-type": contentType },
      defParamCharset: "utf8",
      limits: { fields: 0, files: 1, parts: 2, fileSize: maxBytes },
    });
  } catch {
    throw invalidInput();
  }

  let limitError: TransitFileError | undefined;
  const rejectExtraPart = () => {
    limitError ??= invalidInput();
  };
  parser.on("fieldsLimit", rejectExtraPart);
  parser.on("filesLimit", rejectExtraPart);
  parser.on("partsLimit", rejectExtraPart);

  let staged: Promise<StagedTransitFile> | undefined;
  parser.on("file", (field, stream, info) => {
    if (field !== "file" || staged) {
      stream.resume();
      return;
    }

    const writer = createWriteStream(path, { flags: "wx" });
    staged = pipeline(stream, writer).then(() => {
      if (stream.truncated) {
        throw new TransitFileError(413, "file_too_large", `Transit file must be ${maxBytes} bytes or smaller.`);
      }
      return {
        path,
        sizeBytes: writer.bytesWritten,
        name: info.filename,
        mimeType: info.mimeType,
      };
    });
    void staged.catch(() => undefined);
  });

  try {
    await pipeline(Readable.from(request.body), parser);
  } catch (error) {
    throw limitError ?? error;
  }
  const file = staged ? await staged : undefined;
  if (limitError) {
    throw limitError;
  }
  if (!file) {
    throw invalidInput();
  }
  return file;
}

function invalidInput(): TransitFileError {
  return new TransitFileError(400, "invalid_input", "file is required.");
}
