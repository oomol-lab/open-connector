import type { TransitFileUpload } from "../../core/types.ts";
import type { ITransitFileService } from "../files/transit-file-store.ts";
import type { Context } from "hono";

import { Hono } from "hono";
import { TransitFileError } from "../files/transit-file-store.ts";
import { jsonError } from "./http-utils.ts";

export interface TransitFileRoutesOptions {
  transitFiles: ITransitFileService;
  uploadTransitFile?: (request: Request) => Promise<TransitFileUpload>;
}

function handleTransitFileError(context: Context, error: unknown): Response {
  if (error instanceof TransitFileError) {
    return jsonError(context, error.status, error.code, error.message);
  }
  throw error;
}

/** Transit file upload, retrieval and deletion routes. */
export function createTransitFileRoutes({ transitFiles, uploadTransitFile }: TransitFileRoutesOptions): Hono {
  const app = new Hono();

  app.post("/files", async (context) => {
    try {
      if (uploadTransitFile) {
        return context.json(await uploadTransitFile(context.req.raw));
      }

      const form = await context.req.raw.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return jsonError(context, 400, "invalid_input", "file is required.");
      }
      const upload = await transitFiles.create(file);
      return context.json(upload);
    } catch (error) {
      return handleTransitFileError(context, error);
    }
  });

  app.get("/files/:fileId", async (context) => {
    try {
      return await transitFiles.response(context.req.param("fileId"));
    } catch (error) {
      return handleTransitFileError(context, error);
    }
  });

  app.delete("/files/:fileId", async (context) => {
    try {
      const fileId = context.req.param("fileId");
      const deleted = await transitFiles.delete(fileId);
      return context.json({ fileId, deleted });
    } catch (error) {
      return handleTransitFileError(context, error);
    }
  });

  return app;
}
