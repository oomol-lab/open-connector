import type { ActionDefinition } from "./model";
import type { ReactNode } from "react";

import { BookOpen, ExternalLink, Link2, TerminalSquare } from "lucide-react";

interface ResourcesPageProps {
  actions: ActionDefinition[];
}

interface DocCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
}

export function ResourcesPage(props: ResourcesPageProps): ReactNode {
  return (
    <div className="docs-grid">
      <DocCard
        icon={<BookOpen size={20} />}
        title="API Reference"
        description="Browse the local runtime routes in Scalar."
        href="/docs"
      />
      <DocCard
        icon={<TerminalSquare size={20} />}
        title="MCP Tools"
        description={`${props.actions.length} actions exposed as local tools.`}
        href="/mcp/tools"
      />
      <DocCard
        icon={<Link2 size={20} />}
        title="OpenAPI JSON"
        description="Use the generated spec from scripts or tool importers."
        href="/openapi.json"
      />
    </div>
  );
}

function DocCard(props: DocCardProps): ReactNode {
  return (
    <a className="doc-card" href={props.href} target="_blank" rel="noreferrer">
      <span className="doc-icon">{props.icon}</span>
      <strong>{props.title}</strong>
      <p>{props.description}</p>
      <ExternalLink size={16} />
    </a>
  );
}
