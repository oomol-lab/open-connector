import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gtmetrix";

const idSchema = (description: string) => s.nonEmptyString(description);
const timestampSchema = s.integer("A UNIX timestamp in seconds returned by the GTmetrix API.");
const pageSizeSchema = s.integer("The number of results to return per page.", { minimum: 1, maximum: 500 });
const pageNumberSchema = s.positiveInteger("The page number of results to return.");
const filterBooleanSchema = s.stringEnum("The boolean connector used between GTmetrix filters.", ["AND", "OR"]);

const locationIdSchema = idSchema("The GTmetrix location ID.");
const browserIdSchema = idSchema("The GTmetrix browser ID.");
const simulatedDeviceIdSchema = idSchema("The GTmetrix simulated device ID.");
const testIdSchema = idSchema("The GTmetrix test ID.");
const pageIdSchema = idSchema("The GTmetrix page slug identifier.");
const reportSlugSchema = idSchema("The GTmetrix report slug identifier.");

const testStateSchema = s.stringEnum("The lifecycle state of the GTmetrix test.", [
  "queued",
  "started",
  "error",
  "completed",
]);
const monitoredFilterSchema = s.stringEnum("A GTmetrix monitored filter value accepted by the pages endpoint.", [
  "no",
  "any",
  "hourly",
  "daily",
  "weekly",
  "monthly",
]);

const testSortSchema = s.stringEnum("A GTmetrix tests sort value.", [
  "created",
  "-created",
  "started",
  "-started",
  "finished",
  "-finished",
]);
const pageSortSchema = s.stringEnum("A GTmetrix pages sort value.", [
  "page_id",
  "-page_id",
  "created",
  "-created",
  "latest_report_time",
  "-latest_report_time",
]);
const reportSortSchema = s.stringEnum("A GTmetrix page reports sort value.", [
  "report_id",
  "-report_id",
  "gtmetrix_score",
  "-gtmetrix_score",
  "performance_score",
  "-performance_score",
  "structure_score",
  "-structure_score",
  "pagespeed_score",
  "-pagespeed_score",
  "yslow_score",
  "-yslow_score",
  "created",
  "-created",
  "expires",
  "-expires",
  "page_bytes",
  "-page_bytes",
  "html_bytes",
  "-html_bytes",
  "page_requests",
  "-page_requests",
  "connect_duration",
  "-connect_duration",
  "redirect_duration",
  "-redirect_duration",
  "backend_duration",
  "-backend_duration",
  "time_to_first_byte",
  "-time_to_first_byte",
  "first_paint_time",
  "-first_paint_time",
  "first_contentful_paint",
  "-first_contentful_paint",
  "largest_contentful_paint",
  "-largest_contentful_paint",
  "time_to_interactive",
  "-time_to_interactive",
  "total_blocking_time",
  "-total_blocking_time",
  "cumulative_layout_shift",
  "-cumulative_layout_shift",
  "speed_index",
  "-speed_index",
  "rum_speed_index",
  "-rum_speed_index",
  "dom_content_loaded_duration",
  "-dom_content_loaded_duration",
  "dom_content_loaded_time",
  "-dom_content_loaded_time",
  "dom_interactive_time",
  "-dom_interactive_time",
  "onload_time",
  "-onload_time",
  "onload_duration",
  "-onload_duration",
  "fully_loaded_time",
  "-fully_loaded_time",
  "cpu_time",
  "-cpu_time",
]);

const statusSchema = s.looseObject("The GTmetrix account status returned by the status endpoint.", {
  api_credits: s.number("The remaining GTmetrix API credits."),
  api_refill: timestampSchema,
  api_refill_amount: s.number("The number of API credits restored on the next refill."),
  account_type: s.string("The GTmetrix plan type."),
  account_pro_analysis_options_access: s.boolean("Whether the account can use PRO analysis options."),
  account_pro_locations_access: s.boolean("Whether the account can use PRO locations."),
  account_whitelabel_pdf_access: s.boolean("Whether the account can generate white-label PDF reports."),
  account_pro_team_role: s.string("The GTmetrix PRO team role returned for the account."),
});

const linksSchema = s.looseObject("Pagination or resource links returned by GTmetrix.", {
  prev: s.url("The URL of the previous page, when available."),
  next: s.url("The URL of the next page, when available."),
  self: s.url("The API URL for this resource."),
});
const metaSchema = s.looseObject("Metadata returned by GTmetrix.", {
  curr_page: s.integer("The current GTmetrix page number returned by the collection endpoint."),
  credits_left: s.number("The GTmetrix API credits remaining after a test submission."),
  credits_used: s.number("The GTmetrix API credits consumed by a test submission."),
});

const resourceSchema = (description: string) =>
  s.looseObject(description, {
    type: s.string("The GTmetrix resource type."),
    id: s.string("The GTmetrix resource identifier."),
    attributes: s.looseObject("The GTmetrix resource attributes."),
    links: s.looseObject("The GTmetrix resource links."),
  });

const locationSchema = resourceSchema("A GTmetrix location resource.");
const browserSchema = resourceSchema("A GTmetrix browser resource.");
const simulatedDeviceSchema = resourceSchema("A GTmetrix simulated device resource.");
const testSchema = resourceSchema("A GTmetrix test resource.");
const pageSchema = resourceSchema("A GTmetrix page resource.");
const reportSchema = resourceSchema("A GTmetrix report resource.");

const listTestsInputSchema = s.actionInput(
  {
    page_size: pageSizeSchema,
    page_number: pageNumberSchema,
    sort: s.array("The GTmetrix test sort directives to apply.", testSortSchema, { minItems: 1 }),
    filter_bool: filterBooleanSchema,
    sources: s.array(
      "The GTmetrix test source filters to apply.",
      s.stringEnum("A GTmetrix test source filter value.", ["api", "on-demand", "monitored", "any"]),
      { minItems: 1 },
    ),
    states: s.array("The GTmetrix test states to include.", testStateSchema, { minItems: 1 }),
    location_ids: s.array("The GTmetrix location IDs to include in the test list.", locationIdSchema, {
      minItems: 1,
    }),
    browser_ids: s.array("The GTmetrix browser IDs to include in the test list.", browserIdSchema, {
      minItems: 1,
    }),
    created_eq: timestampSchema,
    created_gt: timestampSchema,
    created_gte: timestampSchema,
    created_lt: timestampSchema,
    created_lte: timestampSchema,
    started_eq: timestampSchema,
    started_gt: timestampSchema,
    started_gte: timestampSchema,
    started_lt: timestampSchema,
    started_lte: timestampSchema,
    finished_eq: timestampSchema,
    finished_gt: timestampSchema,
    finished_gte: timestampSchema,
    finished_lt: timestampSchema,
    finished_lte: timestampSchema,
  },
  [],
  "Input payload for listing GTmetrix tests.",
);

const listPagesInputSchema = s.actionInput(
  {
    page_size: pageSizeSchema,
    page_number: pageNumberSchema,
    sort: s.array("The GTmetrix page sort directives to apply.", pageSortSchema, { minItems: 1 }),
    filter_bool: filterBooleanSchema,
    location_ids: s.array("The GTmetrix location IDs to include in the page list.", locationIdSchema, {
      minItems: 1,
    }),
    browser_ids: s.array("The GTmetrix browser IDs to include in the page list.", browserIdSchema, {
      minItems: 1,
    }),
    monitored: s.array("The GTmetrix monitored frequency filters to apply.", monitoredFilterSchema, {
      minItems: 1,
    }),
    urls: s.array("The GTmetrix page URLs to filter by.", s.nonEmptyString("A page URL filter value."), {
      minItems: 1,
    }),
    created_eq: timestampSchema,
    created_gt: timestampSchema,
    created_gte: timestampSchema,
    created_lt: timestampSchema,
    created_lte: timestampSchema,
    latest_report_time_eq: timestampSchema,
    latest_report_time_gt: timestampSchema,
    latest_report_time_gte: timestampSchema,
    latest_report_time_lt: timestampSchema,
    latest_report_time_lte: timestampSchema,
  },
  [],
  "Input payload for listing GTmetrix pages.",
);

const listPageReportsInputSchema = s.actionInput(
  {
    page_id: pageIdSchema,
    page_size: pageSizeSchema,
    page_number: pageNumberSchema,
    sort: s.array("The GTmetrix page report sort directives to apply.", reportSortSchema, { minItems: 1 }),
  },
  ["page_id"],
  "Input payload for listing reports for a GTmetrix page.",
);

const startTestInputSchema = s.actionInput(
  {
    url: s.url("The URL to test with GTmetrix."),
    location_id: locationIdSchema,
    browser_id: browserIdSchema,
    report: s.stringEnum("The GTmetrix report type to generate.", [
      "lighthouse",
      "legacy",
      "none",
      "lighthouse,legacy",
    ]),
    retention: s.oneOf([s.literal(1), s.literal(6), s.literal(12), s.literal(24)], {
      description: "The number of months GTmetrix should retain the report.",
    }),
    httpauth_username: s.nonEmptyString("The HTTP access authentication username."),
    httpauth_password: s.nonEmptyString("The HTTP access authentication password."),
    adblock: s.boolean("Whether to enable AdBlock during analysis."),
    cookies: s.stringArray("The cookies GTmetrix should send with the test request.", { minItems: 1 }),
    video: s.boolean("Whether GTmetrix should generate a video."),
    stop_onload: s.boolean("Whether GTmetrix should stop the test at window.onload."),
    throttle: s.nonEmptyString("The GTmetrix throttle profile or custom throttle string."),
    allow_url: s.stringArray("The GTmetrix allow-list URL patterns to apply.", { minItems: 1 }),
    block_url: s.stringArray("The GTmetrix block-list URL patterns to apply.", { minItems: 1 }),
    dns: s.stringArray("The GTmetrix custom DNS mappings to apply.", { minItems: 1 }),
    simulate_device_id: simulatedDeviceIdSchema,
    anonymize_user_agent: s.boolean("Whether GTmetrix should strip the trailing GTmetrix user agent tag."),
    user_agent: s.nonEmptyString("The custom user agent string to send."),
    browser_width: s.positiveInteger("The browser viewport width in pixels."),
    browser_height: s.positiveInteger("The browser viewport height in pixels."),
    browser_dppx: s.number("The browser device pixel ratio.", { minimum: 1, maximum: 5 }),
    browser_rotate: s.boolean("Whether GTmetrix should swap the browser viewport width and height."),
  },
  ["url"],
  "Input payload for starting a GTmetrix test.",
);

const collectionOutput = (key: string, itemSchema = resourceSchema(`A GTmetrix ${key} item.`)) =>
  s.actionOutput(
    {
      [key]: s.array(`The GTmetrix ${key} returned by the API.`, itemSchema),
      links: s.nullable(linksSchema),
      meta: s.nullable(metaSchema),
    },
    `The GTmetrix ${key} collection response.`,
    [key],
  );

export const gtmetrixActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_status",
    description: "Get the current GTmetrix account status, credits, and plan capabilities.",
    inputSchema: s.actionInput({}, [], "Input payload for reading GTmetrix account status."),
    outputSchema: s.actionOutput({ status: statusSchema }, "The GTmetrix account status result."),
  }),
  defineProviderAction(service, {
    name: "list_locations",
    description: "List GTmetrix test locations available to the connected account.",
    inputSchema: s.actionInput({}, [], "Input payload for listing GTmetrix locations."),
    outputSchema: s.actionOutput(
      { locations: s.array("The GTmetrix locations returned by the API.", locationSchema) },
      "The GTmetrix location list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_location",
    description: "Get a single GTmetrix test location by ID.",
    inputSchema: s.actionInput({ location_id: locationIdSchema }, ["location_id"], "Input payload for a location."),
    outputSchema: s.actionOutput({ location: locationSchema }, "The GTmetrix location lookup result."),
  }),
  defineProviderAction(service, {
    name: "list_browsers",
    description: "List GTmetrix browsers that can be used for tests.",
    inputSchema: s.actionInput({}, [], "Input payload for listing GTmetrix browsers."),
    outputSchema: s.actionOutput(
      { browsers: s.array("The GTmetrix browsers returned by the API.", browserSchema) },
      "The GTmetrix browser list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_browser",
    description: "Get a single GTmetrix browser by ID.",
    inputSchema: s.actionInput({ browser_id: browserIdSchema }, ["browser_id"], "Input payload for a browser."),
    outputSchema: s.actionOutput({ browser: browserSchema }, "The GTmetrix browser lookup result."),
  }),
  defineProviderAction(service, {
    name: "list_simulated_devices",
    description: "List GTmetrix simulated devices that can be used for tests.",
    inputSchema: s.actionInput({}, [], "Input payload for listing GTmetrix simulated devices."),
    outputSchema: s.actionOutput(
      {
        simulated_devices: s.array("The GTmetrix simulated devices returned by the API.", simulatedDeviceSchema),
      },
      "The GTmetrix simulated device list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_simulated_device",
    description: "Get a single GTmetrix simulated device by ID.",
    inputSchema: s.actionInput(
      { simulated_device_id: simulatedDeviceIdSchema },
      ["simulated_device_id"],
      "Input payload for a simulated device.",
    ),
    outputSchema: s.actionOutput(
      { simulated_device: simulatedDeviceSchema },
      "The GTmetrix simulated device lookup result.",
    ),
  }),
  defineProviderAction(service, {
    name: "start_test",
    description: "Start a new GTmetrix performance test for a URL.",
    followUpActions: ["gtmetrix.get_test"],
    asyncLifecycle: {
      startActionId: "gtmetrix.start_test",
      statusActionId: "gtmetrix.get_test",
      jobIdOutputPath: "test.id",
      jobIdInputField: "test_id",
      completionPath: "is_complete",
      completionValues: { done: [true] },
    },
    inputSchema: startTestInputSchema,
    outputSchema: s.actionOutput(
      {
        test: testSchema,
        meta: metaSchema,
        links: linksSchema,
      },
      "The GTmetrix test submission result.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tests",
    description: "List GTmetrix tests for the connected account.",
    inputSchema: listTestsInputSchema,
    outputSchema: collectionOutput("tests", testSchema),
  }),
  defineProviderAction(service, {
    name: "get_test",
    description: "Get the current state of a GTmetrix test and detect when it has completed.",
    followUpActions: ["gtmetrix.get_report"],
    asyncLifecycle: {
      startActionId: "gtmetrix.start_test",
      statusActionId: "gtmetrix.get_test",
      jobIdOutputPath: "test.id",
      jobIdInputField: "test_id",
      completionPath: "is_complete",
      completionValues: { done: [true] },
    },
    inputSchema: s.actionInput({ test_id: testIdSchema }, ["test_id"], "Input payload for a GTmetrix test."),
    outputSchema: s.object(
      "The GTmetrix test status result.",
      {
        test: testSchema,
        is_complete: s.boolean("Whether GTmetrix has completed the test."),
        report_url: s.url("The GTmetrix report URL returned when the test has completed."),
        retry_after_seconds: s.integer("The GTmetrix retry delay returned while the test is pending."),
      },
      { optional: ["report_url", "retry_after_seconds"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_pages",
    description: "List GTmetrix pages associated with the connected account.",
    inputSchema: listPagesInputSchema,
    outputSchema: collectionOutput("pages", pageSchema),
  }),
  defineProviderAction(service, {
    name: "get_page",
    description: "Get a single GTmetrix page by slug.",
    followUpActions: ["gtmetrix.get_latest_page_report", "gtmetrix.list_page_reports"],
    inputSchema: s.actionInput({ page_id: pageIdSchema }, ["page_id"], "Input payload for a GTmetrix page."),
    outputSchema: s.actionOutput({ page: pageSchema }, "The GTmetrix page lookup result."),
  }),
  defineProviderAction(service, {
    name: "list_page_reports",
    description: "List GTmetrix reports associated with a single page.",
    inputSchema: listPageReportsInputSchema,
    outputSchema: collectionOutput("reports", reportSchema),
  }),
  defineProviderAction(service, {
    name: "get_latest_page_report",
    description: "Get the latest GTmetrix report associated with a page.",
    inputSchema: s.actionInput({ page_id: pageIdSchema }, ["page_id"], "Input payload for the latest page report."),
    outputSchema: s.actionOutput({ report: reportSchema }, "The latest GTmetrix page report result."),
  }),
  defineProviderAction(service, {
    name: "get_report",
    description: "Get a single GTmetrix report by slug.",
    inputSchema: s.actionInput({ report_slug: reportSlugSchema }, ["report_slug"], "Input payload for a report."),
    outputSchema: s.actionOutput({ report: reportSchema }, "The GTmetrix report lookup result."),
  }),
];

export type GtmetrixActionName =
  | "get_account_status"
  | "list_locations"
  | "get_location"
  | "list_browsers"
  | "get_browser"
  | "list_simulated_devices"
  | "get_simulated_device"
  | "start_test"
  | "list_tests"
  | "get_test"
  | "list_pages"
  | "get_page"
  | "list_page_reports"
  | "get_latest_page_report"
  | "get_report";
