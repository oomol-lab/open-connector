import type { CatalogLocale } from "../../catalog-localization/localization.ts";
import type { Context } from "hono";

import { resolveCatalogLocale } from "../../catalog-localization/localization.ts";

/** Selects one display language for all metadata in a catalog response. */
export function catalogLocale(context: Context): CatalogLocale {
  const locale = resolveCatalogLocale(context.req.query("locale"), context.req.header("Accept-Language"));
  context.header("Content-Language", locale);
  return locale;
}
