import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "harpa_ai";

const nodeSchema = s.anyOf("The HARPA browser nodes to use.", [
  s.string("One node ID or a space-separated list of node IDs."),
  s.positiveInteger("The number of available nodes to use."),
]);
const timeoutSchema = s.integer("The synchronous execution timeout in milliseconds.", {
  minimum: 1,
  maximum: 300_000,
});
const connectionSchema = s.string(
  "The title or ID of the HARPA AI connection to use; the default connection is used when omitted or not found.",
);
const urlSchema = s.string("The complete web page URL to open in the HARPA browser node.", {
  format: "uri",
});
const resultOutputSchema = s.object("The HARPA GRID action result.", {
  result: s.unknown("The JSON result returned by HARPA GRID; its shape depends on the selected nodes and action."),
});

const grabItemSchema = s.object(
  "A page element selector and the value to extract from matching elements.",
  {
    selector: s.nonEmptyString("A CSS, XPath, or text selector for the target element."),
    selectorType: s.stringEnum("How HARPA should interpret selector.", ["auto", "css", "xpath", "text"]),
    at: s.anyOf("Which matching element or elements to capture.", [
      s.stringEnum("A named element position.", ["all", "first", "last"]),
      s.integer("A zero-based or negative element index."),
    ]),
    take: s.string("The element property, attribute, or style value to extract."),
    label: s.string("The key to use for this extracted value in the result."),
  },
  { optional: ["selectorType", "at", "take", "label"] },
);

export const harpaAiActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_web",
    operationType: "read",
    description: "Search the web through a connected HARPA browser node.",
    inputSchema: s.object(
      "The web search to run through HARPA GRID.",
      {
        query: s.nonEmptyString(
          "The search query, including optional operators such as site:example.com or intitle:keyword.",
        ),
        node: nodeSchema,
        timeout: timeoutSchema,
      },
      { optional: ["node", "timeout"] },
    ),
    outputSchema: resultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "scrape_web_page",
    operationType: "read",
    description: "Scrape a web page as Markdown or extract selected elements through a connected HARPA browser node.",
    inputSchema: s.object(
      "The web page and optional element selectors to scrape through HARPA GRID.",
      {
        url: urlSchema,
        grab: s.array("The page elements to extract; omit this field to return page Markdown.", grabItemSchema),
        node: nodeSchema,
        timeout: timeoutSchema,
      },
      { optional: ["grab", "node", "timeout"] },
    ),
    outputSchema: resultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "run_ai_command",
    operationType: "destructive",
    description: "Run a built-in or custom HARPA AI command in a connected browser node and return its result.",
    inputSchema: s.object(
      "The HARPA AI command to run in a browser node.",
      {
        url: urlSchema,
        name: s.string("The built-in or custom HARPA command name to execute."),
        inputs: s.array(
          "Values supplied to successive user-input steps in the HARPA command.",
          s.string("One command input value."),
        ),
        resultParam: s.string(
          "The HARPA parameter to return, using dot notation when needed; defaults to the last message.",
        ),
        node: nodeSchema,
        timeout: timeoutSchema,
        connection: connectionSchema,
      },
      { optional: ["url", "name", "inputs", "resultParam", "node", "timeout", "connection"] },
    ),
    outputSchema: resultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "run_ai_prompt",
    operationType: "read",
    description: "Run an AI prompt, optionally with a web page as context, in a connected HARPA browser node.",
    inputSchema: s.object(
      "The AI prompt and optional browser context to run through HARPA GRID.",
      {
        prompt: s.nonEmptyString("The AI prompt to execute."),
        url: urlSchema,
        node: nodeSchema,
        timeout: timeoutSchema,
        connection: connectionSchema,
      },
      { optional: ["url", "node", "timeout", "connection"] },
    ),
    outputSchema: resultOutputSchema,
  }),
];
