import type { TransitFileAccess, TransitFileUpload } from "../../core/types.ts";
import type { ITransitFileService } from "../files/transit-file-store.ts";
import type { Context } from "hono";

import { Hono } from "hono";
import { isScope, scopeMessage } from "../../core/scope.ts";
import { TransitFileError } from "../files/transit-file-store.ts";
import { hasAdminBearer, readRuntimeGrant } from "./auth.ts";
import { jsonError } from "./http-utils.ts";

export interface TransitFileRoutesOptions {
  transitFiles: ITransitFileService;
  uploadTransitFile?: (request: Request, options?: TransitFileAccess) => Promise<TransitFileUpload>;
}

function handleTransitFileError(context: Context, error: unknown): Response {
  if (error instanceof TransitFileError) {
    return jsonError(context, error.status, error.code, error.message);
  }
  throw error;
}

/**
 * What the caller may see. An administrator sees every file; a scoped runtime token sees only files of its scope;
 * anyone else (including an unauthenticated download) sees only files that belong to no scope.
 */
function readFileAccess(context: Context): TransitFileAccess | undefined {
  if (hasAdminBearer(context)) return undefined;
  const scope = readRuntimeGrant(context)?.scope;
  return scope === undefined ? {} : { scope };
}

/** Transit file upload, retrieval and deletion routes. */
export function createTransitFileRoutes({ transitFiles, uploadTransitFile }: TransitFileRoutesOptions): Hono {
  const app = new Hono();

  app.post("/files", async (context) => {
    try {
      const scope = context.req.query("scope");
      if (scope !== undefined && !isScope(scope)) {
        return jsonError(context, 400, "invalid_input", scopeMessage);
      }
      const createOptions = scope === undefined ? undefined : { scope };
      if (uploadTransitFile) {
        return context.json(await uploadTransitFile(context.req.raw, createOptions));
      }

      const form = await context.req.raw.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return jsonError(context, 400, "invalid_input", "file is required.");
      }
      const upload = await transitFiles.create(file, createOptions);
      return context.json(upload);
    } catch (error) {
      return handleTransitFileError(context, error);
    }
  });

  app.get("/files/:fileId", async (context) => {
    try {
      return await transitFiles.response(context.req.param("fileId"), readFileAccess(context));
    } catch (error) {
      return handleTransitFileError(context, error);
    }
  });

  app.delete("/files/:fileId", async (context) => {
    try {
      const fileId = context.req.param("fileId");
      const deleted = await transitFiles.delete(fileId, readFileAccess(context));
      return context.json({ fileId, deleted });
    } catch (error) {
      return handleTransitFileError(context, error);
    }
  });

  return app;
}
