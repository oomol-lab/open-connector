import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wandb";

const entityName = s.nonWhitespaceString("The W&B entity or team name.");
const projectName = s.nonWhitespaceString("The W&B project name.");
const filterObject = s.looseObject("Optional provider-native filters.");
const jsonItems = (description: string): JsonSchema => s.array(description, s.looseObject("One returned item."));

const traceQueryOutput = s.looseObject("Matching Weave traces and query metadata.", {
  metadata: s.looseObject("Trace query counts, distributions, time range, and truncation metadata."),
  traces: jsonItems("Matching Weave traces."),
});

const artifactDiffOutput = s.looseObject("A comparison of two W&B artifact versions.", {
  artifact_a: s.string("The first artifact version name."),
  artifact_b: s.string("The second artifact version name."),
  metadata_diff: s.looseObject("Artifact metadata differences."),
  tags_diff: s.looseObject("Artifact tag differences."),
  aliases_diff: s.looseObject("Artifact alias differences."),
  size_diff: s.looseObject("Artifact size differences."),
  file_count_diff: s.looseObject("Artifact file-count differences."),
  lineage_diff: s.looseObject("Artifact lineage differences."),
  digest_match: s.boolean("Whether both artifact versions have the same digest."),
  file_diff: s.looseObject("Optional file-level differences."),
});

export const wandbActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_weave_traces",
    description:
      "Query classic Weave traces with filters, ordering, selected columns, cost data, feedback, and detail-level controls.",
    inputSchema: s.object(
      "Input for querying Weave traces.",
      {
        entity_name: entityName,
        project_name: projectName,
        filters: filterObject,
        sort_by: s.nonWhitespaceString("The trace field used for sorting.", { default: "started_at" }),
        sort_direction: s.stringEnum("The sort direction.", ["asc", "desc"]),
        limit: s.positiveInteger("The maximum number of traces to return."),
        include_costs: s.boolean({ description: "Whether to include calculated trace costs.", default: true }),
        include_feedback: s.boolean({ description: "Whether to include trace feedback.", default: true }),
        columns: s.stringArray("Trace columns to return."),
        expand_columns: s.stringArray("Nested trace columns to expand."),
        truncate_length: s.positiveInteger("Maximum string length before truncation.", { default: 1000 }),
        return_full_data: s.boolean({ description: "Whether to return untruncated trace data.", default: false }),
        metadata_only: s.boolean({
          description: "Whether to return query metadata without trace rows.",
          default: false,
        }),
        detail_level: s.stringEnum("The trace detail level.", ["schema", "summary", "full"]),
      },
      { required: ["entity_name", "project_name"] },
    ),
    outputSchema: traceQueryOutput,
  }),
  defineProviderAction(service, {
    name: "count_weave_traces",
    description: "Count matching classic Weave traces and root traces without returning trace payloads.",
    inputSchema: s.object(
      "Input for counting Weave traces.",
      { entity_name: entityName, project_name: projectName, filters: filterObject },
      { required: ["entity_name", "project_name"] },
    ),
    outputSchema: s.actionOutput(
      {
        total_count: s.nonNegativeInteger("The number of matching traces."),
        root_traces_count: s.nonNegativeInteger("The number of matching root traces."),
      },
      "Weave trace counts.",
    ),
  }),
  defineProviderAction(service, {
    name: "resolve_trace_roots",
    description: "Resolve the root spans for a batch of classic Weave trace IDs.",
    inputSchema: s.requiredObject("Input for resolving Weave trace roots.", {
      entity_name: entityName,
      project_name: projectName,
      trace_ids: s.stringArray("Child trace IDs to resolve.", { minItems: 1 }),
    }),
    outputSchema: s.looseObject("Resolved Weave trace roots.", {
      roots: s.record("Root span details keyed by requested trace ID.", s.looseObject("One resolved root span.")),
      resolved: s.nonNegativeInteger("The number of resolved trace IDs."),
      total_requested: s.nonNegativeInteger("The number of requested trace IDs."),
    }),
  }),
  defineProviderAction(service, {
    name: "query_wandb",
    description: "Run a read-only GraphQL query against W&B experiment data with bounded pagination.",
    inputSchema: s.object(
      "Input for querying W&B GraphQL data.",
      {
        query: s.nonWhitespaceString("A read-only W&B GraphQL query."),
        variables: s.looseObject("GraphQL variables."),
        max_items: s.positiveInteger("Maximum total items returned across pages.", { default: 100 }),
        items_per_page: s.positiveInteger("Items requested per GraphQL page.", { default: 20 }),
      },
      { required: ["query"] },
    ),
    outputSchema: s.unknown("The W&B GraphQL response selected by the query."),
  }),
  defineProviderAction(service, {
    name: "create_report",
    description: "Create a W&B report with narrative text, plots, and configurable panels.",
    inputSchema: s.object(
      "Input for creating a W&B report.",
      {
        entity_name: entityName,
        project_name: projectName,
        title: s.nonWhitespaceString("The report title."),
        description: s.string("Optional report description."),
        markdown_report_text: s.string({ description: "Markdown narrative for the report.", default: "" }),
        plots_html: s.anyOf("Plotly HTML supplied as one string or a name-to-HTML map.", [
          s.string("A Plotly HTML document."),
          s.record("Plotly HTML documents keyed by plot name.", s.string("One Plotly HTML document.")),
        ]),
        panels: s.array("W&B report panel definitions.", s.looseObject("One report panel definition.")),
      },
      { required: ["entity_name", "project_name", "title"] },
    ),
    outputSchema: s.string("A confirmation containing the saved W&B report URL."),
  }),
  defineProviderAction(service, {
    name: "log_analysis",
    description: "Log analysis rows, charts, and scalar metrics to W&B as a new run.",
    inputSchema: s.object(
      "Input for logging an analysis run to W&B.",
      {
        entity_name: entityName,
        project_name: projectName,
        analysis_name: s.nonWhitespaceString("The analysis run name."),
        data: s.array("Tabular analysis rows to log.", s.looseObject("One analysis row."), { minItems: 1 }),
        charts: s.array("Chart definitions to log.", s.looseObject("One chart definition.")),
        scalars: s.record("Scalar metrics keyed by metric name.", s.number("One scalar metric value.")),
      },
      { required: ["entity_name", "project_name", "analysis_name", "data"] },
    ),
    outputSchema: s.looseObject("The W&B run created for the analysis.", {
      run_id: s.string("The created W&B run ID."),
      run_url: s.url("The created W&B run URL."),
      logged_keys: s.stringArray("The logged metric and data keys."),
      table_columns: s.stringArray("The logged table columns."),
      row_count: s.nonNegativeInteger("The number of logged analysis rows."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_entities",
    description: "List W&B user and team entities accessible with the configured API key.",
    inputSchema: s.actionInput({}, [], "No input is required."),
    outputSchema: s.looseObject("Accessible W&B entities.", {
      entities: s.array(
        "Accessible W&B entities.",
        s.looseObject("One W&B entity.", {
          name: s.string("The entity name."),
          type: s.string("The entity type."),
        }),
      ),
      count: s.nonNegativeInteger("The number of returned entities."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List W&B projects for one entity or for all entities accessible with the configured API key.",
    inputSchema: s.object(
      "Input for listing W&B projects.",
      {
        entity: s.nonWhitespaceString("Optional W&B entity name."),
        max_projects: s.positiveInteger("Maximum projects returned per entity.", { default: 50 }),
      },
      { required: [] },
    ),
    outputSchema: s.looseObject("W&B projects grouped by entity.", {
      projects: s.record("Projects keyed by W&B entity.", s.array(s.looseObject("One W&B project."))),
      truncated: s.boolean("Whether project results were truncated."),
      max_projects_per_entity: s.positiveInteger("The per-entity project limit."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_automations",
    description: "List W&B Automations that trigger on artifact, run-state, or run-metric events.",
    inputSchema: s.object(
      "Input for listing W&B Automations.",
      {
        entity: s.nonWhitespaceString("Optional W&B entity name."),
        name: s.nonWhitespaceString("Optional automation name filter."),
        max_items: s.positiveInteger("Maximum automations to return.", { default: 50 }),
      },
      { required: [] },
    ),
    outputSchema: s.looseObject("Matching W&B Automations.", {
      automations: jsonItems("Matching W&B Automations."),
      count: s.nonNegativeInteger("The number of returned automations."),
      entity: s.nullableString("The filtered W&B entity."),
      truncated: s.boolean("Whether results were truncated."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_integrations",
    description: "List Slack and webhook integrations available as W&B Automation targets.",
    inputSchema: s.object(
      "Input for listing W&B integrations.",
      {
        entity: s.nonWhitespaceString("Optional W&B entity name."),
        kind: s.stringEnum("Optional integration kind.", ["slack", "webhook"]),
        max_items: s.positiveInteger("Maximum integrations to return.", { default: 50 }),
      },
      { required: [] },
    ),
    outputSchema: s.looseObject("Matching W&B integrations.", {
      integrations: jsonItems("Matching W&B integrations."),
      count: s.nonNegativeInteger("The number of returned integrations."),
      entity: s.nullableString("The filtered W&B entity."),
      kind: s.nullableString("The filtered integration kind."),
      truncated: s.boolean("Whether results were truncated."),
    }),
  }),
  defineProviderAction(service, {
    name: "infer_trace_schema",
    description: "Sample classic Weave traces to discover field paths, types, and frequent values.",
    inputSchema: s.object(
      "Input for inferring a Weave trace schema.",
      {
        entity_name: entityName,
        project_name: projectName,
        sample_size: s.positiveInteger("Number of traces to sample.", { default: 20 }),
        top_n_values: s.positiveInteger("Frequent values retained per field.", { default: 5 }),
      },
      { required: ["entity_name", "project_name"] },
    ),
    outputSchema: s.looseObject("The inferred Weave trace schema.", {
      fields: jsonItems("Discovered trace fields."),
      total_traces: s.nonNegativeInteger("The total matching traces."),
      root_traces: s.nonNegativeInteger("The total root traces."),
      sample_size: s.nonNegativeInteger("The number of sampled traces."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_docs",
    description: "Search the official W&B documentation for relevant guidance and examples.",
    inputSchema: s.requiredObject("Input for searching W&B documentation.", {
      query: s.nonWhitespaceString("The W&B documentation search query."),
    }),
    outputSchema: s.string("Relevant excerpts from the official W&B documentation."),
  }),
  defineProviderAction(service, {
    name: "get_run_history",
    description: "Retrieve sampled time-series metric history for a W&B run.",
    inputSchema: s.object(
      "Input for retrieving W&B run history.",
      {
        entity_name: entityName,
        project_name: projectName,
        run_id: s.nonWhitespaceString("The W&B run ID."),
        keys: s.stringArray("Metric keys to return."),
        samples: s.positiveInteger("Maximum sampled history points.", { default: 500 }),
        min_step: s.nonNegativeInteger("Optional minimum training step."),
        max_step: s.nonNegativeInteger("Optional maximum training step."),
      },
      { required: ["entity_name", "project_name", "run_id"] },
    ),
    outputSchema: s.looseObject("Sampled W&B run history.", {
      history: s.array("Sampled metric history rows.", s.looseObject("One sampled history row.")),
      run_id: s.string("The W&B run ID."),
      run_name: s.string("The W&B run name."),
      total_steps: s.nonNegativeInteger("The total available run steps."),
      sampled_points: s.nonNegativeInteger("The number of returned points."),
      keys_returned: s.stringArray("Metric keys present in the result."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_registries",
    description: "List W&B model registries for an organization.",
    inputSchema: s.object(
      "Input for listing W&B registries.",
      {
        organization: s.nonWhitespaceString("Optional W&B organization name."),
        filter: filterObject,
        max_items: s.positiveInteger("Maximum registries to return.", { default: 50 }),
      },
      { required: [] },
    ),
    outputSchema: s.looseObject("Matching W&B registries.", {
      registries: jsonItems("Matching W&B registries."),
      count: s.nonNegativeInteger("The number of returned registries."),
      truncated: s.boolean("Whether results were truncated."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_registry_collections",
    description: "List artifact collections within a W&B model registry.",
    inputSchema: s.object(
      "Input for listing W&B registry collections.",
      {
        registry_name: s.nonWhitespaceString("The W&B registry name."),
        organization: s.nonWhitespaceString("Optional W&B organization name."),
        filter: filterObject,
        max_items: s.positiveInteger("Maximum collections to return.", { default: 50 }),
      },
      { required: ["registry_name"] },
    ),
    outputSchema: s.looseObject("Collections in a W&B registry.", {
      registry: s.string("The selected W&B registry name."),
      collections: jsonItems("Collections in the registry."),
      count: s.nonNegativeInteger("The number of returned collections."),
      truncated: s.boolean("Whether results were truncated."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_artifact_versions",
    description: "List versions of a W&B project artifact or registry collection.",
    inputSchema: s.object(
      "Input for listing W&B artifact versions.",
      {
        collection_name: s.nonWhitespaceString("The artifact collection name."),
        entity_name: entityName,
        project_name: projectName,
        registry_name: s.nonWhitespaceString("Optional W&B registry name."),
        organization: s.nonWhitespaceString("Optional W&B organization name."),
        type_name: s.nonWhitespaceString("Optional artifact type name."),
        source: s.stringEnum("Whether the collection belongs to a project or registry.", ["project", "registry"]),
        max_items: s.positiveInteger("Maximum artifact versions to return.", { default: 50 }),
      },
      { required: ["collection_name"] },
    ),
    outputSchema: s.looseObject("Versions in a W&B artifact collection.", {
      collection: s.string("The selected artifact collection name."),
      source: s.string("The artifact source type."),
      versions: jsonItems("Artifact versions in the collection."),
      count: s.nonNegativeInteger("The number of returned versions."),
      truncated: s.boolean("Whether results were truncated."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_artifact_details",
    description: "Get metadata, lineage, and optionally files for a W&B artifact version.",
    inputSchema: s.object(
      "Input for reading a W&B artifact version.",
      {
        artifact_name: s.nonWhitespaceString("The fully qualified artifact version name."),
        type_name: s.nonWhitespaceString("Optional artifact type name."),
        include_files: s.boolean({ description: "Whether to include artifact file entries.", default: false }),
        max_files: s.positiveInteger("Maximum files to return when file entries are included.", { default: 50 }),
      },
      { required: ["artifact_name"] },
    ),
    outputSchema: s.looseObject("W&B artifact version details.", {
      artifact: s.looseObject("Artifact metadata."),
      lineage: s.looseObject("Artifact lineage information."),
      files: jsonItems("Optional artifact file entries."),
    }),
  }),
  defineProviderAction(service, {
    name: "compare_artifact_versions",
    description: "Compare metadata, aliases, tags, lineage, sizes, and optionally files for two W&B artifact versions.",
    inputSchema: s.object(
      "Input for comparing W&B artifact versions.",
      {
        artifact_name_a: s.nonWhitespaceString("The first fully qualified artifact version name."),
        artifact_name_b: s.nonWhitespaceString("The second fully qualified artifact version name."),
        type_name: s.nonWhitespaceString("Optional artifact type name."),
        include_file_diff: s.boolean({ description: "Whether to include file-level differences.", default: true }),
        max_file_diff_entries: s.positiveInteger("Maximum file-difference entries to return.", { default: 50 }),
      },
      { required: ["artifact_name_a", "artifact_name_b"] },
    ),
    outputSchema: artifactDiffOutput,
  }),
  defineProviderAction(service, {
    name: "compare_runs",
    description: "Compare configuration, summary metrics, metadata, and optionally metric history for two W&B runs.",
    inputSchema: s.object(
      "Input for comparing W&B runs.",
      {
        entity_name: entityName,
        project_name: projectName,
        run_id_a: s.nonWhitespaceString("The first W&B run ID."),
        run_id_b: s.nonWhitespaceString("The second W&B run ID."),
        include_history_overlap: s.boolean({
          description: "Whether to compare overlapping sampled metric history.",
          default: false,
        }),
        history_keys: s.stringArray("Metric keys used for history comparison."),
        history_samples: s.positiveInteger("Maximum history samples per run.", { default: 50 }),
      },
      { required: ["entity_name", "project_name", "run_id_a", "run_id_b"] },
    ),
    outputSchema: s.looseObject("A structured comparison of two W&B runs.", {
      run_a: s.looseObject("Details for the first W&B run."),
      run_b: s.looseObject("Details for the second W&B run."),
      config_diff: s.looseObject("Run configuration differences."),
      summary_diff: s.looseObject("Run summary metric differences."),
      metadata_diff: s.looseObject("Run metadata differences."),
      history_comparison: s.looseObject("Optional sampled history comparison."),
    }),
  }),
  defineProviderAction(service, {
    name: "summarize_evaluation",
    description: "Aggregate classic Weave evaluation results for a project or named evaluation.",
    inputSchema: s.object(
      "Input for summarizing Weave evaluations.",
      {
        entity_name: entityName,
        project_name: projectName,
        eval_name: s.nonWhitespaceString("Optional evaluation name filter."),
        max_evals: s.positiveInteger("Maximum evaluations to aggregate.", { default: 5 }),
        include_per_task: s.boolean({ description: "Whether to include per-task aggregates.", default: false }),
      },
      { required: ["entity_name", "project_name"] },
    ),
    outputSchema: s.looseObject("Aggregated Weave evaluation results.", {
      evaluations: jsonItems("Matching evaluation summaries."),
      count: s.nonNegativeInteger("The number of summarized evaluations."),
      project: s.string("The W&B project name."),
    }),
  }),
  defineProviderAction(service, {
    name: "diagnose_run",
    description: "Inspect loss metrics and run state to diagnose the training health of a W&B run.",
    inputSchema: s.object(
      "Input for diagnosing a W&B run.",
      {
        entity_name: entityName,
        project_name: projectName,
        run_id: s.nonWhitespaceString("The W&B run ID."),
        loss_key: s.nonWhitespaceString("Optional training-loss metric key."),
        val_loss_key: s.nonWhitespaceString("Optional validation-loss metric key."),
      },
      { required: ["entity_name", "project_name", "run_id"] },
    ),
    outputSchema: s.looseObject("The W&B run health diagnosis.", {
      run_id: s.string("The diagnosed W&B run ID."),
      run_name: s.string("The W&B run name."),
      run_state: s.string("The W&B run state."),
      diagnosis: s.unknown("Training-health findings and recommendations."),
      loss_stats: s.looseObject("Calculated loss statistics."),
    }),
  }),
  defineProviderAction(service, {
    name: "probe_project",
    description: "Sample W&B runs to discover a project's metrics, configuration keys, tags, groups, and structure.",
    inputSchema: s.object(
      "Input for probing a W&B project.",
      {
        entity_name: entityName,
        project_name: projectName,
        sample_runs: s.positiveInteger("Maximum runs to sample.", { default: 5 }),
      },
      { required: ["entity_name", "project_name"] },
    ),
    outputSchema: s.looseObject("The discovered W&B project structure.", {
      entity: s.string("The W&B entity name."),
      project: s.string("The W&B project name."),
      run_count: s.nonNegativeInteger("The project run count."),
      sampled_runs: jsonItems("Sampled W&B runs."),
      metric_keys: s.stringArray("Discovered metric keys."),
      config_keys: s.stringArray("Discovered configuration keys."),
      tags: s.stringArray("Discovered run tags."),
      groups: s.stringArray("Discovered run groups."),
      recommendations: s.stringArray("Suggested follow-up actions."),
    }),
  }),
];
