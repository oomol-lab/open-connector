export function isConsoleShellPath(path: string): boolean {
  return (
    !path.startsWith("/api") &&
    !path.startsWith("/v1") &&
    !path.startsWith("/mcp") &&
    !path.startsWith("/oauth") &&
    path !== "/docs" &&
    !path.startsWith("/docs/") &&
    path !== "/openapi.json"
  );
}

export function isConsoleShellRequest(path: string, method: string): boolean {
  return (method === "GET" || method === "HEAD") && isConsoleShellPath(path);
}
