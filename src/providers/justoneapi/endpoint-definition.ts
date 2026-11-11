import type { JsonSchema } from "../../core/types.ts";

export interface JustoneapiEndpoint {
  name: string;
  method: "GET" | "POST";
  path: string;
  bodyEncoding?: "json";
  authLocation: "query" | "form";
  description: string;
  inputSchema: JsonSchema;
}
