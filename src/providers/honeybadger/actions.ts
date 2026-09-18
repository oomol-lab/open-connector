import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "honeybadger";

const arbitraryObjectSchema = s.looseObject("An arbitrary JSON object accepted by Honeybadger.");
const sourceContextSchema = s.record(
  "Source context lines keyed by line number.",
  s.string("A source line captured around the stack frame."),
);

const backtraceFrameSchema = s.object("A Honeybadger exception backtrace frame.", {
  number: s.nonNegativeInteger("The zero-based frame number within the backtrace."),
  file: s.nonEmptyString("The source filename for the stack frame."),
  method: s.nonEmptyString("The method or function name for the stack frame."),
  source: sourceContextSchema,
});

const exceptionCauseSchema = s.looseRequiredObject(
  "A nested Honeybadger exception cause.",
  {
    class: s.nonEmptyString("The exception class name for the nested cause."),
    message: s.nonEmptyString("The exception message for the nested cause."),
    backtrace: s.array("The stack frames attached to the nested cause.", backtraceFrameSchema, { minItems: 1 }),
    causes: s.array("Additional nested causes attached to this cause.", s.looseObject("A nested cause.")),
  },
  { optional: ["causes"] },
);

const exceptionSchema = s.object("The exception payload sent to the Honeybadger notices endpoint.", {
  class: s.nonEmptyString("The exception class name, such as RuntimeError."),
  message: s.nonEmptyString("The exception message."),
  backtrace: s.array("The stack frames used by Honeybadger to group the exception.", backtraceFrameSchema, {
    minItems: 1,
  }),
  tags: s.stringArray("Optional tags used to annotate the exception notice."),
  causes: s.array("Optional nested causes associated with the exception.", exceptionCauseSchema),
  fingerprint: s.nonEmptyString("An optional fingerprint used to override Honeybadger grouping."),
});

const serverContextSchema = s.object("Server metadata attached to a Honeybadger notice.", {
  project_root: s.nonEmptyString("The application project root on the server."),
  environment_name: s.nonEmptyString("The runtime environment name, such as production."),
  hostname: s.nonEmptyString("The hostname where the exception occurred."),
  pid: s.integer("The process id where the exception occurred."),
  revision: s.nonEmptyString("The deployed revision identifier, such as a Git SHA."),
});

const requestContextSchema = s.object("Request metadata attached to a Honeybadger notice.", {
  component: s.nonEmptyString("The controller or component handling the request."),
  action: s.nonEmptyString("The action or method handling the request."),
  url: s.nonEmptyString("The request URL where the exception occurred."),
  params: arbitraryObjectSchema,
  cgi_data: arbitraryObjectSchema,
  session: arbitraryObjectSchema,
  context: arbitraryObjectSchema,
});

const reportExceptionInputSchema = s.actionInput(
  {
    error: exceptionSchema,
    server: serverContextSchema,
    request: requestContextSchema,
  },
  ["error"],
  "The input payload for reporting an exception notice to Honeybadger.",
);

const reportExceptionOutputSchema = s.actionOutput(
  {
    notice: s.object("The created Honeybadger notice summary.", {
      id: s.nonEmptyString("The UUID returned by Honeybadger for the created notice."),
    }),
  },
  "The output payload for a Honeybadger exception notice request.",
);

const reportEventInputSchema = s.actionInput(
  {
    events: s.array("The event objects to serialize into the Honeybadger NDJSON event stream.", arbitraryObjectSchema, {
      minItems: 1,
    }),
  },
  ["events"],
  "The input payload for reporting Honeybadger Insights events.",
);

const reportEventOutputSchema = s.actionOutput(
  {
    batch: s.object("The Honeybadger event batch response.", {
      id: s.nonEmptyString("The Honeybadger batch identifier."),
      errors: s.boolean("Whether Honeybadger reported event-level errors in the batch response."),
      events: s.array(
        "The per-event statuses returned by Honeybadger.",
        s.object("The status metadata for one reported Honeybadger event.", {
          id: s.nonEmptyString("The Honeybadger event identifier."),
          status: s.integer("The per-event HTTP status returned by Honeybadger."),
        }),
      ),
    }),
  },
  "The output payload for a Honeybadger event reporting request.",
);

const deploySchema = s.object("The deployment payload sent to Honeybadger.", {
  environment: s.nonEmptyString("The deployment environment, such as production."),
  revision: s.nonEmptyString("The revision, Git SHA, or version identifier that was deployed."),
  repository: s.nonEmptyString("The repository URL associated with the deployment."),
  local_username: s.nonEmptyString("The local username or automation actor that performed the deployment."),
});

const reportDeploymentInputSchema = s.actionInput(
  { deploy: deploySchema },
  ["deploy"],
  "The input payload for reporting a deployment to Honeybadger.",
);

const reportDeploymentOutputSchema = s.actionOutput(
  {
    deployment: s.object("The Honeybadger deployment acknowledgement.", {
      status: s.nonEmptyString("The deployment acknowledgement returned by Honeybadger."),
    }),
  },
  "The output payload for a Honeybadger deployment report request.",
);

const reportCheckInInputSchema = s.actionInput(
  {
    id: s.nonEmptyString("The Honeybadger check-in id or capability token."),
    slug: s.nonEmptyString("The Honeybadger check-in slug to report by project API key."),
  },
  [],
  "The input payload for reporting a Honeybadger check-in. Provide either id or slug, but not both.",
);

const checkInResultSchema = s.object("The Honeybadger check-in acknowledgement.", {
  success: s.boolean("Whether Honeybadger accepted the check-in request."),
});

const reportCheckInOutputSchema = s.actionOutput(
  { checkIn: checkInResultSchema },
  "The output payload for a Honeybadger check-in request.",
);

const checkInPayloadSchema = s.object("The payload body sent to a Honeybadger check-in endpoint.", {
  status: s.stringEnum("The execution status associated with the check-in payload.", ["success", "error"]),
  duration: s.nonNegativeInteger("The execution duration in milliseconds."),
  stdout: s.string("Captured standard output attached to the check-in payload."),
  stderr: s.string("Captured standard error attached to the check-in payload."),
  exitCode: s.integer("The process exit code attached to the check-in payload."),
});

const reportCheckInWithPayloadInputSchema = s.actionInput(
  {
    checkInId: s.nonEmptyString("The Honeybadger check-in id or capability token used in the request path."),
    checkIn: checkInPayloadSchema,
  },
  ["checkInId", "checkIn"],
  "The input payload for reporting a Honeybadger check-in with payload data.",
);

export const honeybadgerActions: ActionDefinition[] = [
  action(
    "report_exception",
    "write",
    "Report an exception notice to Honeybadger.",
    reportExceptionInputSchema,
    reportExceptionOutputSchema,
  ),
  action(
    "report_event",
    "write",
    "Report one or more Honeybadger Insights events.",
    reportEventInputSchema,
    reportEventOutputSchema,
  ),
  action(
    "report_deployment",
    "write",
    "Report a deployment to Honeybadger.",
    reportDeploymentInputSchema,
    reportDeploymentOutputSchema,
  ),
  action(
    "report_check_in",
    "write",
    "Report a Honeybadger check-in by id or slug.",
    reportCheckInInputSchema,
    reportCheckInOutputSchema,
  ),
  action(
    "report_check_in_with_payload",
    "write",
    "Report a Honeybadger check-in with payload data.",
    reportCheckInWithPayloadInputSchema,
    reportCheckInOutputSchema,
  ),
];

export type HoneybadgerActionName =
  | "report_exception"
  | "report_event"
  | "report_deployment"
  | "report_check_in"
  | "report_check_in_with_payload";

function action(
  name: HoneybadgerActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    inputSchema,
    outputSchema,
  });
}
