/** Whether MCP text includes the complete result or a notice for structured-content clients. */
export type McpOutputMode = "compatible" | "compact";

/** Parse the explicit deployment setting without inferring client capabilities. */
export function parseMcpOutputMode(value: string | undefined): McpOutputMode {
  if (value === undefined || value === "") return "compatible";
  if (value === "compatible" || value === "compact") return value;
  throw new Error("OOMOL_CONNECT_MCP_OUTPUT_MODE must be one of: compatible, compact.");
}
