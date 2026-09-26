import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "drawio_mcp";

const createDiagramInputSchema = s.requireExactlyOneProperty(
  s.actionInput(
    {
      mermaid: s.nonWhitespaceString(
        "Mermaid diagram source, such as `flowchart TD\n  A --> B`. Prefer Mermaid for flowcharts, sequence, class, state, ER, Gantt, mind map, timeline, and other diagram types Mermaid supports. For a layered layout of a large or branching flowchart, start the source with the frontmatter `---\nconfig:\n  layout: elk\n---`.",
      ),
      xml: s.nonWhitespaceString(
        "draw.io diagram XML with an `<mxGraphModel>` or `<mxfile>` root. Use it for layouts Mermaid cannot express, such as cloud architecture with vendor shapes, network topology, floor plans, or UI mockups. It must be well-formed and must not contain XML comments.",
      ),
    },
    [],
    "Provide exactly one of mermaid or xml.",
  ),
  ["mermaid", "xml"],
);

const createDiagramOutputSchema = s.actionOutput(
  {
    editorUrl: s.url(
      "A link that opens the diagram in the draw.io web editor. The diagram source is compressed into the URL fragment.",
    ),
    errors: s.stringArray(
      "Problems draw.io expects to break rendering, such as XML comments. Fix them and create the diagram again. draw.io only checks XML; Mermaid is converted when the link is opened, so an empty list does not mean the Mermaid source is valid.",
    ),
    warnings: s.stringArray(
      "Problems draw.io expects may affect rendering of XML, such as edges that reference missing cells. Always empty for Mermaid.",
    ),
  },
  "The draw.io diagram.",
);

const searchShapesInputSchema = s.actionInput(
  {
    query: s.nonWhitespaceString(
      "Space-separated keywords, such as `aws lambda`, `cisco router`, `kubernetes pod`, or `pid globe valve`.",
    ),
    limit: s.positiveInteger("Maximum number of shapes to return.", { maximum: 50, default: 10 }),
  },
  ["query"],
  "Input for searching the draw.io shape library.",
);

const searchShapesOutputSchema = s.actionOutput(
  {
    shapes: s.array(
      "Matching shapes, best match first. Empty when nothing matched.",
      s.requiredObject("A draw.io shape.", {
        title: s.string("The shape name."),
        style: s.string("The draw.io style string to use as the style attribute of an mxCell."),
        width: s.number("The default shape width in pixels."),
        height: s.number("The default shape height in pixels."),
      }),
    ),
  },
  "Shapes matching the search.",
);

export const drawioMcpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_diagram",
    operationType: "read",
    description:
      "Build a draw.io diagram from Mermaid or draw.io XML and return a link that opens it in the draw.io editor. Nothing is saved on the draw.io side; share the link with the user to view or edit the diagram.",
    requiredScopes: [],
    inputSchema: createDiagramInputSchema,
    outputSchema: createDiagramOutputSchema,
    followUpActions: ["drawio_mcp.search_shapes"],
  }),
  defineProviderAction(service, {
    name: "search_shapes",
    operationType: "read",
    description:
      "Search the draw.io shape library for vendor, industry, and icon shapes, such as cloud services, network devices, P&ID symbols, and product logos, and return the style strings to use in draw.io XML. Basic shapes such as rectangles, diamonds, and cylinders do not need a search.",
    requiredScopes: [],
    inputSchema: searchShapesInputSchema,
    outputSchema: searchShapesOutputSchema,
    followUpActions: ["drawio_mcp.create_diagram"],
  }),
];
