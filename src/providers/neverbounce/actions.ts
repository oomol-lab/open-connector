import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "neverbounce";

const jobIdField = s.positiveInteger("The NeverBounce job identifier returned by the jobs API.");
const emptyInputSchema = s.object({}, { description: "This action does not require any input." });
const creditsInfoSchema = s.object(
  "The credit summary returned by NeverBounce.",
  {
    paid_credits_used: s.nonNegativeInteger("Paid credits already consumed."),
    free_credits_used: s.nonNegativeInteger("Free credits already consumed."),
    paid_credits_remaining: s.nonNegativeInteger("Paid credits currently remaining."),
    free_credits_remaining: s.nonNegativeInteger("Free credits currently remaining."),
  },
  {
    optional: ["paid_credits_used", "free_credits_used", "paid_credits_remaining", "free_credits_remaining"],
  },
);
const jobCountsSchema = s.object(
  "The job counters returned by the account info endpoint.",
  {
    completed: s.nonNegativeInteger("The number of completed bulk jobs."),
    under_review: s.nonNegativeInteger("The number of jobs currently under manual review."),
    queued: s.nonNegativeInteger("The number of jobs currently queued."),
    processing: s.nonNegativeInteger("The number of jobs currently processing."),
  },
  { optional: ["completed", "under_review", "queued", "processing"] },
);
const accountInfoOutputSchema = s.requiredObject("The NeverBounce account information response.", {
  status: s.string("The request status returned by NeverBounce."),
  credits_info: creditsInfoSchema,
  job_counts: jobCountsSchema,
  execution_time: s.nonNegativeInteger("The server execution time in milliseconds."),
});
const addressInfoSchema = s.object(
  "The optional address_info object returned by NeverBounce.",
  {
    original_email: s.string("The original email address submitted to NeverBounce."),
    normalized_email: s.string("The normalized email address returned by NeverBounce."),
    addr: s.string("The local part of the email address."),
    alias: s.string("The alias part detected in the email address."),
    host: s.string("The full host portion of the email address."),
    fqdn: s.string("The fully qualified domain name."),
    domain: s.string("The registrable domain name."),
    subdomain: s.string("The subdomain portion of the email address."),
    tld: s.string("The top-level domain."),
  },
  {
    optional: ["original_email", "normalized_email", "addr", "alias", "host", "fqdn", "domain", "subdomain", "tld"],
  },
);
const singleCheckOutputSchema = s.object(
  "The NeverBounce single check response.",
  {
    status: s.string("The request status returned by NeverBounce."),
    result: s.stringEnum("The NeverBounce verification result code.", [
      "valid",
      "invalid",
      "disposable",
      "catchall",
      "unknown",
    ]),
    flags: s.stringArray("Verification flags returned by NeverBounce."),
    suggested_correction: s.string("The typo correction suggested by NeverBounce when applicable."),
    address_info: addressInfoSchema,
    credits_info: creditsInfoSchema,
    execution_time: s.nonNegativeInteger("The server execution time in milliseconds."),
  },
  { optional: ["address_info", "credits_info"] },
);
const primitiveCellSchema = s.union(
  [
    s.string("A string cell value."),
    s.number("A numeric cell value."),
    s.boolean("A boolean cell value."),
    { type: "null" },
  ],
  { description: "One primitive cell value supplied to NeverBounce." },
);
const suppliedInputRowSchema = s.record("One supplied input row as a flat object.", primitiveCellSchema);
const createJobInputSchema = {
  oneOf: [
    s.object(
      "Create a NeverBounce job from a remote CSV URL.",
      {
        input_location: s.literal("remote_url", {
          description: "The bulk input is a remote URL.",
        }),
        input: s.url("The remote URL to the CSV file."),
        auto_parse: s.boolean("Whether NeverBounce should parse the job immediately."),
        auto_start: s.boolean("Whether NeverBounce should start verification immediately after parsing."),
        run_sample: s.boolean("Whether NeverBounce should run the job as a sample."),
        filename: s.nonEmptyString("The display filename shown for the job."),
        request_meta_data: s.object(
          "Additional metadata that influences verification behavior.",
          {
            leverage_historical_data: s.boolean("Whether to leverage historical data during verification."),
          },
          { optional: ["leverage_historical_data"] },
        ),
        allow_manual_review: s.boolean("Whether the job is allowed to enter manual review."),
        callback_url: s.url("The optional callback URL for job lifecycle events."),
        callback_headers: s.record("Optional headers appended to callback requests.", s.string("Header value.")),
      },
      {
        required: ["input_location", "input"],
        optional: [
          "auto_parse",
          "auto_start",
          "run_sample",
          "filename",
          "request_meta_data",
          "allow_manual_review",
          "callback_url",
          "callback_headers",
        ],
      },
    ),
    s.object(
      "Create a NeverBounce job from supplied rows.",
      {
        input_location: s.literal("supplied", {
          description: "The bulk input is supplied inline.",
        }),
        input: s.array("Supplied rows to verify.", suppliedInputRowSchema, { minItems: 1 }),
        auto_parse: s.boolean("Whether NeverBounce should parse the job immediately."),
        auto_start: s.boolean("Whether NeverBounce should start verification immediately after parsing."),
        run_sample: s.boolean("Whether NeverBounce should run the job as a sample."),
        filename: s.nonEmptyString("The display filename shown for the job."),
        request_meta_data: s.object(
          "Additional metadata that influences verification behavior.",
          {
            leverage_historical_data: s.boolean("Whether to leverage historical data during verification."),
          },
          { optional: ["leverage_historical_data"] },
        ),
        allow_manual_review: s.boolean("Whether the job is allowed to enter manual review."),
        callback_url: s.url("The optional callback URL for job lifecycle events."),
        callback_headers: s.record("Optional headers appended to callback requests.", s.string("Header value.")),
      },
      {
        required: ["input_location", "input"],
        optional: [
          "auto_parse",
          "auto_start",
          "run_sample",
          "filename",
          "request_meta_data",
          "allow_manual_review",
          "callback_url",
          "callback_headers",
        ],
      },
    ),
  ],
  description: "The input payload for creating a NeverBounce bulk verification job.",
} satisfies JsonSchema;
const createJobOutputSchema = s.requiredObject("The response returned after NeverBounce creates a bulk job.", {
  status: s.string("The request status returned by NeverBounce."),
  job_id: jobIdField,
  execution_time: s.nonNegativeInteger("The server execution time in milliseconds."),
});
const parseJobOutputSchema = s.object(
  "The response returned after NeverBounce parses a bulk job.",
  {
    status: s.string("The request status returned by NeverBounce."),
    queue_id: s.nonEmptyString("The queue identifier returned when the parse request succeeds."),
    execution_time: s.nonNegativeInteger("The server execution time in milliseconds."),
  },
  { required: ["status", "execution_time"], optional: ["queue_id"] },
);
const startJobOutputSchema = s.object(
  "The response returned after NeverBounce starts a bulk job.",
  {
    status: s.string("The request status returned by NeverBounce."),
    queue_id: s.nonEmptyString("The queue identifier returned when the start request succeeds."),
    message: s.string("An optional message returned by NeverBounce."),
    execution_time: s.nonNegativeInteger("The server execution time in milliseconds."),
  },
  { required: ["status", "execution_time"], optional: ["queue_id", "message"] },
);
const jobTotalsSchema = s.object(
  "The aggregate counters returned by NeverBounce for a bulk job.",
  {
    records: s.nonNegativeInteger("The total number of submitted records."),
    billable: s.nonNegativeInteger("The number of billable records."),
    processed: s.nonNegativeInteger("The number of processed records."),
    valid: s.nonNegativeInteger("The number of valid email results."),
    invalid: s.nonNegativeInteger("The number of invalid email results."),
    catchall: s.nonNegativeInteger("The number of catchall email results."),
    disposable: s.nonNegativeInteger("The number of disposable email results."),
    unknown: s.nonNegativeInteger("The number of unknown email results."),
    duplicates: s.nonNegativeInteger("The number of duplicate rows."),
    bad_syntax: s.nonNegativeInteger("Rows rejected for bad email syntax."),
  },
  {
    optional: [
      "records",
      "billable",
      "processed",
      "valid",
      "invalid",
      "catchall",
      "disposable",
      "unknown",
      "duplicates",
      "bad_syntax",
    ],
  },
);
const jobStatusOutputSchema = s.requiredObject("The NeverBounce bulk job status response.", {
  status: s.string("The request status returned by NeverBounce."),
  id: jobIdField,
  filename: s.string("The filename shown for the job."),
  created_at: s.string("The timestamp when the job was created."),
  total: jobTotalsSchema,
  bounce_estimate: s.integer("The estimated bounce rate percentage."),
  percent_complete: s.integer("The percent completion reported by NeverBounce.", { minimum: 0, maximum: 100 }),
  job_status: s.string("The current NeverBounce bulk job status."),
  execution_time: s.nonNegativeInteger("The server execution time in milliseconds."),
});
const jobResultsRowSchema = s.requiredObject("One row returned by the NeverBounce job results endpoint.", {
  data: s.record("The original row data submitted for this result.", true),
  verification: s.looseObject("The verification object returned for the result row."),
});
const jobResultsOutputSchema = s.requiredObject("The NeverBounce paginated job results response.", {
  status: s.string("The request status returned by NeverBounce."),
  total_results: s.nonNegativeInteger("The total number of matching result rows."),
  total_pages: s.nonNegativeInteger("The total number of result pages."),
  query: s.looseObject("The query echo returned by NeverBounce."),
  results: s.array("Paginated NeverBounce result rows.", jobResultsRowSchema),
  execution_time: s.nonNegativeInteger("The server execution time in milliseconds."),
});

export const neverbounceActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_info",
    description: "Get the current NeverBounce account credit summary and bulk job counters.",
    inputSchema: emptyInputSchema,
    outputSchema: accountInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "single_check",
    description: "Verify a single email address with NeverBounce and return the verification result.",
    inputSchema: s.object(
      "Input parameters for verifying a single email with NeverBounce.",
      {
        email: s.email("The email address to verify."),
        address_info: s.boolean("Whether to include the optional address_info object."),
        credits_info: s.boolean("Whether to include current credit counters."),
        timeout: s.positiveInteger("The maximum verification time in seconds."),
      },
      { required: ["email"], optional: ["address_info", "credits_info", "timeout"] },
    ),
    outputSchema: singleCheckOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_job",
    description: "Create a NeverBounce bulk verification job from a remote file or supplied rows.",
    inputSchema: createJobInputSchema,
    outputSchema: createJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "parse_job",
    description: "Parse a NeverBounce bulk job created without auto_parse enabled.",
    inputSchema: s.object(
      "Input parameters for parsing a NeverBounce bulk job.",
      {
        job_id: jobIdField,
        auto_start: s.boolean("Whether NeverBounce should start verification after parsing."),
      },
      { required: ["job_id"], optional: ["auto_start"] },
    ),
    outputSchema: parseJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_job",
    description: "Start a parsed NeverBounce bulk job.",
    inputSchema: s.object(
      "Input parameters for starting a parsed NeverBounce bulk job.",
      {
        job_id: jobIdField,
        run_sample: s.boolean("Whether NeverBounce should run the job as a sample."),
      },
      { required: ["job_id"], optional: ["run_sample"] },
    ),
    outputSchema: startJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_job_status",
    description: "Retrieve the current processing status and aggregate counts for a NeverBounce job.",
    inputSchema: s.requiredObject("Input parameters for retrieving a NeverBounce job status.", {
      job_id: jobIdField,
    }),
    outputSchema: jobStatusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_job_results",
    description: "Retrieve paginated NeverBounce verification results for a completed bulk job.",
    inputSchema: s.object(
      "Input parameters for retrieving paginated NeverBounce job results.",
      {
        job_id: jobIdField,
        page: s.positiveInteger("The results page to fetch."),
        items_per_page: s.integer("The number of results per page.", { minimum: 1, maximum: 1000 }),
      },
      { required: ["job_id"], optional: ["page", "items_per_page"] },
    ),
    outputSchema: jobResultsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "download_job_results",
    description: "Download a NeverBounce bulk job as CSV with optional result filters and extra columns.",
    inputSchema: s.object(
      "Input parameters for downloading NeverBounce job results as CSV.",
      {
        job_id: jobIdField,
        valids: s.boolean("Whether valid email results should be included."),
        invalids: s.boolean("Whether invalid email results should be included."),
        catchalls: s.boolean("Whether catchall email results should be included."),
        unknowns: s.boolean("Whether unknown email results should be included."),
        disposables: s.boolean("Whether disposable email results should be included."),
        include_duplicates: s.boolean("Whether duplicate rows should be included."),
        only_duplicates: s.boolean("Whether only duplicate rows should be returned."),
        only_bad_syntax: s.boolean("Whether only bad-syntax rows should be returned."),
        email_status: s.boolean("Whether the CSV should include the email_status column."),
        email_status_int: s.boolean("Whether the CSV should include the integer email_status column."),
        has_dns_info: s.boolean("Whether the CSV should include has_dns_info."),
        has_mail_server: s.boolean("Whether the CSV should include has_mail_server."),
        mail_server_reachable: s.boolean("Whether the CSV should include mail_server_reachable."),
        free_email_host: s.boolean("Whether the CSV should include free_email_host."),
        role_account: s.boolean("Whether the CSV should include role_account."),
        addr: s.boolean("Whether the CSV should include addr."),
        alias: s.boolean("Whether the CSV should include alias."),
        host: s.boolean("Whether the CSV should include host."),
        fqdn: s.boolean("Whether the CSV should include fqdn."),
        subdomain: s.boolean("Whether the CSV should include subdomain."),
        domain: s.boolean("Whether the CSV should include domain."),
        tld: s.boolean("Whether the CSV should include tld."),
        network: s.boolean("Whether the CSV should include network."),
        bad_syntax: s.boolean("Whether the CSV should include bad_syntax."),
        binary_operators_type: s.stringEnum("The representation used for binary flags.", [
          "BIN_1_0",
          "BIN_Y_N",
          "BIN_y_n",
          "BIN_yes_no",
          "BIN_Yes_No",
          "BIN_true_false",
        ]),
        line_feed_type: s.stringEnum("The line feed style used in the downloaded CSV.", [
          "LINEFEED_0A0D",
          "LINEFEED_0D0A",
          "LINEFEED_0A",
          "LINEFEED_0D",
        ]),
      },
      {
        required: ["job_id"],
        optional: [
          "valids",
          "invalids",
          "catchalls",
          "unknowns",
          "disposables",
          "include_duplicates",
          "only_duplicates",
          "only_bad_syntax",
          "email_status",
          "email_status_int",
          "has_dns_info",
          "has_mail_server",
          "mail_server_reachable",
          "free_email_host",
          "role_account",
          "addr",
          "alias",
          "host",
          "fqdn",
          "subdomain",
          "domain",
          "tld",
          "network",
          "bad_syntax",
          "binary_operators_type",
          "line_feed_type",
        ],
      },
    ),
    outputSchema: s.object(
      "The normalized CSV download returned by NeverBounce.",
      {
        filename: s.nonEmptyString("The filename inferred from the NeverBounce response."),
        content_type: s.nonEmptyString("The CSV response content type."),
        csv: s.string("The raw CSV body returned by NeverBounce."),
      },
      { required: ["content_type", "csv"], optional: ["filename"] },
    ),
  }),
];
