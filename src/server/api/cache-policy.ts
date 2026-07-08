export interface ResponseCachePolicy {
  cacheControl: string;
  cloudflareCdnCacheControl?: string;
  vary?: string;
}

const catalogBrowserCacheControl = "public, max-age=0, must-revalidate";
const catalogEdgeCacheControl = "public, max-age=31536000, stale-while-revalidate=86400";

export function getResponseCachePolicy(method: string, path: string, status: number): ResponseCachePolicy | undefined {
  if (isCatalogResponse(method, path) && status >= 200 && status < 300) {
    return {
      cacheControl: catalogBrowserCacheControl,
      cloudflareCdnCacheControl: catalogEdgeCacheControl,
      vary: "Authorization, Cookie",
    };
  }

  if (isRuntimeResponsePath(path)) {
    return { cacheControl: "no-store" };
  }

  return undefined;
}

function isCatalogResponse(method: string, path: string): boolean {
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  return (
    path === "/api/providers" ||
    /^\/api\/providers\/[^/]+$/.test(path) ||
    path === "/api/actions" ||
    (path !== "/api/actions/search" && /^\/api\/actions\/[^/]+$/.test(path)) ||
    path === "/v1/providers" ||
    path === "/v1/actions" ||
    (path !== "/v1/actions/search" && /^\/v1\/actions\/[^/]+$/.test(path))
  );
}

function isRuntimeResponsePath(path: string): boolean {
  return (
    path === "/health" ||
    path === "/openapi.json" ||
    path === "/docs" ||
    path.startsWith("/docs/") ||
    path === "/api" ||
    path.startsWith("/api/") ||
    path === "/v1" ||
    path.startsWith("/v1/") ||
    path === "/mcp" ||
    path.startsWith("/mcp/") ||
    path === "/oauth" ||
    path.startsWith("/oauth/")
  );
}
