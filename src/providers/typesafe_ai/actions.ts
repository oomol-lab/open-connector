import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { typesafeAiDefaultModel } from "./constants.ts";

const service = "typesafe_ai";

const stateSchema: JsonSchema = {
  type: ["string", "object", "array"],
  description: "Text or structured JSON state for TypeSafe to evaluate.",
};

const entrySchema: JsonSchema = {
  type: ["string", "object", "array", "null"],
  description: "Text or structured JSON content, or null when the API permits no description.",
};

const nonNullEntrySchema: JsonSchema = {
  ...entrySchema,
  type: ["string", "object", "array"],
  description: "Text or structured JSON content.",
};

const noulQuestionSchema: JsonSchema = {
  ...s.object(
    "A yes-or-no question that returns the probability of a yes answer.",
    {
      type: s.literal("noul", { description: "The TypeSafe question type." }),
      instructions: entrySchema,
      criteria: s.nullable(
        s.object(
          "Optional descriptions of the true and false outcomes.",
          {
            true: entrySchema,
            false: entrySchema,
          },
          { optional: ["true", "false"] },
        ),
      ),
    },
    { optional: ["instructions", "criteria"] },
  ),
  anyOf: [
    {
      required: ["instructions"],
      properties: { instructions: nonNullEntrySchema },
    },
    {
      required: ["criteria"],
      properties: {
        criteria: {
          type: "object",
          anyOf: [
            { required: ["true"], properties: { true: nonNullEntrySchema } },
            { required: ["false"], properties: { false: nonNullEntrySchema } },
          ],
        },
      },
    },
  ],
};

const choiceQuestionSchema = s.object(
  "A categorical question that selects one named option.",
  {
    type: s.literal("choice", { description: "The TypeSafe question type." }),
    instructions: entrySchema,
    criteria: {
      ...s.record("Candidate option names mapped to optional descriptions.", entrySchema),
      minProperties: 1,
      maxProperties: 255,
    },
  },
  { optional: ["instructions"] },
);

const scoreQuestionSchema = s.object(
  "An ordinal question that scores the state against ordered rubric levels.",
  {
    type: s.literal("score", { description: "The TypeSafe question type." }),
    instructions: entrySchema,
    criteria: s.array("Ordered rubric levels from the lowest to the highest score.", entrySchema, {
      minItems: 2,
      maxItems: 10,
    }),
  },
  { optional: ["instructions"] },
);

const probabilitySchema = s.number("A probability from 0 to 1.", {
  minimum: 0,
  maximum: 1,
});

const answerSchema = s.oneOf(
  [
    s.object("A binary Noul answer.", {
      type: s.literal("noul", { description: "The TypeSafe answer type." }),
      noul: probabilitySchema,
    }),
    s.object("A categorical Choice answer.", {
      type: s.literal("choice", { description: "The TypeSafe answer type." }),
      choice: s.string("The selected option name."),
      confidence: probabilitySchema,
      probabilities: s.record("Probabilities keyed by option name.", probabilitySchema),
    }),
    s.object("An ordinal Score answer.", {
      type: s.literal("score", { description: "The TypeSafe answer type." }),
      score: s.number("The probability-weighted score across the rubric levels."),
      confidence: probabilitySchema,
      legend: s.record("Score indices mapped to their rubric descriptions.", entrySchema),
      probabilities: s.record("Probabilities keyed by score index.", probabilitySchema),
    }),
  ],
  { description: "A typed TypeSafe answer." },
);

/** Named Noul, Choice, and Score questions, shared with gateways that serve System One models. */
export const typesafeQuestionsSchema: JsonSchema = {
  ...s.record(
    "Named questions evaluated independently against the shared state.",
    s.oneOf([noulQuestionSchema, choiceQuestionSchema, scoreQuestionSchema], {
      description: "A Noul, Choice, or Score question.",
    }),
  ),
  minProperties: 1,
  propertyNames: s.nonEmptyString("A non-empty question ID used to key the matching answer."),
};

/** The System One evaluation result, shared with gateways that serve System One models. */
export const typesafeEvaluationOutputSchema: JsonSchema = s.object("The structured TypeSafe evaluation result.", {
  model: s.nonEmptyString("The versioned TypeSafe model that produced the answers."),
  answers: s.record("Typed answers keyed by the input question names.", answerSchema),
  usage: s.object("Token usage reported by TypeSafe.", {
    input_tokens: s.nonNegativeInteger("The number of input tokens processed."),
    output_tokens: s.nonNegativeInteger("The number of output tokens reported."),
  }),
});

const modelSchema = s.object("A TypeSafe model available to the connected account.", {
  name: s.nonEmptyString("The model ID or alias accepted by the evaluation endpoint."),
  description: s.string("A description of the model's intended use."),
  releaseDate: s.string("The release date reported by TypeSafe."),
});

function action(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType: "read",
    description,
    inputSchema,
    outputSchema,
  });
}

export const typesafeAiActions: ActionDefinition[] = [
  action(
    "list_models",
    "List the TypeSafe models available to the connected account.",
    s.object("The input payload for listing TypeSafe models.", {}),
    s.object("The models available to the connected TypeSafe account.", {
      models: s.array("The available TypeSafe models and aliases.", modelSchema),
    }),
  ),
  action(
    "evaluate",
    "Evaluate text or structured JSON with TypeSafe Choice, Score, and Noul questions.",
    s.object(
      "The state, model, and typed questions for a TypeSafe evaluation.",
      {
        state: stateSchema,
        model: s.nonWhitespaceString(`The TypeSafe model ID or alias to use. Defaults to ${typesafeAiDefaultModel}.`),
        questions: typesafeQuestionsSchema,
      },
      { optional: ["model"] },
    ),
    typesafeEvaluationOutputSchema,
  ),
];
