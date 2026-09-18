import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "linguapop";

export type LinguapopActionName = "list_available_languages" | "send_invitation";

const language = s.object("A language supported by Linguapop placement tests.", {
  name: s.string("Human-readable name of the language supported by Linguapop."),
  code: s.string("Stable Linguapop language code to use when creating placement test invitations."),
});

const invitationOutput = s.object("The Linguapop placement test invitation result.", {
  invitationId: s.integer("Unique Linguapop invitation identifier for tracking the placement test."),
  externalIdentifier: s.nullable(
    s.string("The external identifier echoed by Linguapop, or null when none was supplied."),
  ),
  url: s.url("Direct URL to the Linguapop placement test invitation."),
  emailSent: s.boolean("Whether Linguapop successfully sent the invitation email."),
  kioskCode: s.nullable(s.string("Generated kiosk code for the candidate, or null when no kiosk code was requested.")),
});

function action(input: {
  name: LinguapopActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: ActionDefinition["inputSchema"];
  outputSchema: ActionDefinition["outputSchema"];
}): ActionDefinition {
  return defineProviderAction(service, input);
}

export const linguapopActions: ActionDefinition[] = [
  action({
    name: "list_available_languages",
    operationType: "read",
    description: "Fetch the available Linguapop placement test languages and their stable language codes.",
    inputSchema: s.object({}, { description: "No parameters are required to fetch Linguapop languages." }),
    outputSchema: s.object(
      {
        languages: s.array(language, {
          description: "The list of available placement test languages returned by Linguapop.",
        }),
      },
      { required: ["languages"], description: "The normalized Linguapop language list." },
    ),
  }),
  action({
    name: "send_invitation",
    operationType: "write",
    description:
      "Create a Linguapop placement test invitation for a candidate, optionally send an email, generate a kiosk code, and configure callback or return URLs.",
    inputSchema: s.object(
      "Parameters for creating a Linguapop placement test invitation.",
      {
        externalIdentifier: s.string({
          minLength: 1,
          maxLength: 500,
          description: "Optional CRM, LMS, or website identifier used to track the candidate.",
        }),
        name: s.nonEmptyString("Optional candidate name to include on the invitation."),
        email: s.email("Candidate email address for the placement test."),
        languageCode: s.nonEmptyString(
          "Linguapop language code for the placement test, such as eng, ita, spa, ger, or fra.",
        ),
        sendEmail: s.boolean("Whether Linguapop should send an invitation email to the candidate."),
        generateKioskCode: s.boolean("Whether Linguapop should generate and return a kiosk code for the candidate."),
        testReading: s.boolean("Whether the placement test should include a reading section."),
        testListening: s.boolean("Whether the placement test should include a listening section."),
        callbackUrl: s.string({
          format: "uri",
          maxLength: 1000,
          description: "Callback URL where Linguapop should POST placement test results when the test is completed.",
        }),
        returnUrl: s.string({
          format: "uri",
          maxLength: 1000,
          description: "URL where the candidate should be redirected after completing the placement test.",
        }),
      },
      {
        required: ["email", "languageCode", "sendEmail"],
        optional: [
          "externalIdentifier",
          "name",
          "generateKioskCode",
          "testReading",
          "testListening",
          "callbackUrl",
          "returnUrl",
        ],
      },
    ),
    outputSchema: invitationOutput,
  }),
];
