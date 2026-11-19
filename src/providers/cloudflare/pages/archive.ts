import { blake3 } from "@noble/hashes/blake3.js";
import { unzipSync, Unzip, UnzipInflate } from "fflate";
import { getMimeType } from "hono/utils/mime";
import { extname } from "node:path";
import { isCloudflareWorkerRuntime } from "../../../core/runtime-execution.ts";
import { providerInputError } from "../../provider-runtime.ts";

// Leave room for expanded assets, base64 and JSON copies in the Workers isolate.
export const archiveMaximumBytes: number = (isCloudflareWorkerRuntime() ? 4 : 512) * 1024 * 1024;

const specialNames = new Set([
  "_headers",
  "_redirects",
  "_routes.json",
  "_worker.js",
  "_worker.bundle",
  "functions-filepath-routing-config.json",
]);

export interface PagesAsset {
  name: string;
  bytes: Uint8Array;
  hash: string;
  contentType: string;
}

export function readPagesArchive(bytes: Uint8Array): { assets: PagesAsset[]; special: Record<string, Uint8Array> } {
  let total = 0;
  let count = 0;
  const sizes = new Map<string, number>();
  const entries: Record<string, Uint8Array> = Object.create(null);
  try {
    unzipSync(bytes, {
      filter(file) {
        const name = file.name;
        if (name.endsWith("/")) return false;
        if (
          !name ||
          name.startsWith("/") ||
          name.includes("\\") ||
          name.includes("\0") ||
          name.split("/").some((part) => part === ".." || part === "." || part === "") ||
          sizes.has(name)
        )
          throw new Error("ZIP contains an unsafe or duplicate file path");
        if (file.compression === 0 && file.size !== file.originalSize)
          throw new Error("Stored ZIP entry has inconsistent size metadata");
        sizes.set(name, file.originalSize);
        total += file.originalSize;
        count++;
        if (count > 20_000 || total > archiveMaximumBytes || file.originalSize > 25 * 1024 * 1024)
          throw new Error("ZIP exceeds the file count, expanded size, or per-file limit");
        if (name.startsWith("functions/") || name.startsWith("_worker.js/"))
          throw new Error("Compile Pages Functions into _worker.js or _worker.bundle before deployment");
        return false;
      },
    });
    const started = new Set<string>();
    const unzip = new Unzip((file) => {
      if (file.name.endsWith("/")) return;
      const expectedSize = sizes.get(file.name);
      if (expectedSize === undefined || started.has(file.name))
        throw new Error("ZIP local entries do not match the central directory");
      started.add(file.name);
      let actualSize = 0;
      const chunks: Uint8Array[] = [];
      file.ondata = (error, chunk, final) => {
        if (error) throw error;
        actualSize += chunk.length;
        if (actualSize > expectedSize) throw new Error("ZIP expanded content exceeds its declared size");
        chunks.push(chunk);
        if (final) {
          if (actualSize !== expectedSize) throw new Error("ZIP expanded content does not match its declared size");
          entries[file.name] = Buffer.concat(chunks, actualSize);
        }
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    // Feed compressed chunks incrementally to enforce limits before expanding a whole file.
    const chunkSize = 16 * 1024;
    for (let offset = 0; offset < bytes.length; offset += chunkSize)
      unzip.push(bytes.subarray(offset, offset + chunkSize), offset + chunkSize >= bytes.length);
    if (Object.keys(entries).length !== sizes.size) throw new Error("ZIP contains incomplete entries");
  } catch (error) {
    throw providerInputError(
      `Invalid Pages ZIP archive: ${error instanceof Error ? error.message : "cannot decode ZIP"}`,
    );
  }
  if (!count) throw providerInputError("The Pages ZIP archive is empty");
  if (entries["_worker.js"] && entries["_worker.bundle"])
    throw providerInputError("Provide either _worker.js or _worker.bundle, not both");
  const assets: PagesAsset[] = [];
  const special: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(entries)) {
    if (specialNames.has(name)) {
      special[name] = content;
      continue;
    }
    // Match Wrangler: hash base64 content followed by the extension without its dot.
    const hash = Buffer.from(blake3(Buffer.from(Buffer.from(content).toString("base64") + extname(name).slice(1))))
      .toString("hex")
      .slice(0, 32);
    assets.push({
      name,
      bytes: content,
      hash,
      contentType: getMimeType(name) || "application/octet-stream",
    });
  }
  return { assets, special };
}
