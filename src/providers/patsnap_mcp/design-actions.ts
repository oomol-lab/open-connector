import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { patsnapResultSchema } from "./schemas.ts";

// Sourced from the official MCP service page. JSON arrays with undocumented element shapes remain permissive.
const submitInput = s.requiredObject("Patsnap MCP tool arguments.", {
  country: s.optional(
    s.array('Country code list (optional), e.g. ["CN", "US", "EP"]', s.string("One item in this list.")),
  ),
  main_field: s.optional(
    s.string(
      "Text description or search keywords for the image (optional). Describe the product/form/usage in a sentence or keywords (e.g. 'wireless charger'). The system auto-parses it into search syntax. Not a LOC code",
    ),
  ),
  loc_items: s.optional(
    s.array(
      "LOC classification items (optional), each with id and desc",
      s.object("One item in this list.", {
        id: s.string("LOC classification code"),
        desc: s.optional(s.string("LOC classification description")),
      }),
    ),
  ),
  apply_end_time: s.optional(s.string("Application end date (optional), format YYYYMMDD")),
  apply_start_time: s.optional(s.string("Application start date (optional), format YYYYMMDD")),
  title: s.optional(s.string("Task title (optional)")),
  simple_legal_status: s.optional(
    s.string(
      "Simple legal status filter (optional), comma-separated (0=expired, 1=active, 2=pending). Defaults to '1,2' if not provided. Pass '0,1,2' to include expired patents",
    ),
  ),
  url: s.url("Target product image URL (required)"),
});

const statusInput = s.requiredObject("Patsnap MCP tool arguments.", {
  task_id: s.string("Task ID (required)"),
});

const stageInput = s.requiredObject("Patsnap MCP tool arguments.", {
  stage: s.stringEnum(
    "Stage name (required). Valid values: convert_lineart / image_search / rerank / rrf_fusion / feature_comparison / generate_report",
    ["convert_lineart", "image_search", "rerank", "rrf_fusion", "feature_comparison", "generate_report"],
  ),
  task_id: s.string("Task ID (required)"),
});

const uploadInput = s.requiredObject("Patsnap MCP tool arguments.", {
  content_type: s.optional(
    s.string(
      "Image MIME type, such as image/jpeg, image/png, image/webp, image/gif, image/bmp or image/tiff. Convert HEIC/HEIF/SVG/PDF to JPEG or PNG first.",
    ),
  ),
  file_extension: s.optional(s.string("Optional image file extension; inferred from content_type when omitted.")),
  expire_seconds: s.optional(
    s.integer("Upload URL lifetime in seconds, from 60 to 3600.", { minimum: 60, maximum: 3600 }),
  ),
});

export const patsnapDesignActions: ProviderActionDefinition[] = [
  defineProviderAction("patsnap_mcp", {
    name: "design_submit_workflow",
    operationType: "write",
    description:
      "Submit FTO workflow task \u2014 triggers the full pipeline (lineart conversion \u2192 search \u2192 rerank \u2192 RRF fusion \u2192 feature comparison \u2192 report generation) in one shot. Returns a task_id for polling via design_get_task_status and fetching results via design_get_stage_result",
    inputSchema: submitInput,
    outputSchema: patsnapResultSchema,
    followUpActions: ["patsnap_mcp.design_get_task_status", "patsnap_mcp.design_get_stage_result"],
  }),
  defineProviderAction("patsnap_mcp", {
    name: "design_get_task_status",
    operationType: "read",
    description:
      "Query workflow task status \u2014 returns lightweight task overview and per-stage summaries (status/duration/retry count/error message) without large result_data, suitable for high-frequency polling",
    inputSchema: statusInput,
    outputSchema: patsnapResultSchema,
    followUpActions: ["patsnap_mcp.design_get_stage_result"],
  }),
  defineProviderAction("patsnap_mcp", {
    name: "design_get_stage_result",
    operationType: "read",
    description:
      "Get execution result of a specific stage \u2014 returns the full business data (result_data) of a stage, which may be large. To get final results, typically use stage='feature_comparison' or 'generate_report'",
    inputSchema: stageInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "design_create_image_upload_url",
    operationType: "write",
    description:
      "Returns a temporary PUT upload URL. Upload the image binary to this URL using HTTP PUT, then pass the returned image URL to design_submit_workflow. This tool only creates the upload URL and does not accept image binaries or large base64 payloads.",
    inputSchema: uploadInput,
    outputSchema: patsnapResultSchema,
    followUpActions: ["patsnap_mcp.design_submit_workflow"],
  }),
];
