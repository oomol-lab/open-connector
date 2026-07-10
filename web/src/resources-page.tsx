import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { useClipboard } from "foxact/use-clipboard";
import { BookOpen, Check, Copy, ExternalLink, KeyRound, Link2, TerminalSquare } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

interface DocCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
}

export function ResourcesPage(): ReactNode {
  const t = useTranslate();
  const endpointClipboard = useClipboard();
  const configClipboard = useClipboard();
  const endpoint = `${window.location.origin}/mcp`;
  const config = JSON.stringify(
    {
      mcpServers: {
        "open-connector": {
          url: endpoint,
          headers: { Authorization: "Bearer <RUNTIME_TOKEN>" },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="resources-layout">
      <section className="mcp-config-card">
        <div className="mcp-config-summary">
          <div className="mcp-config-heading">
            <span className="doc-icon">
              <TerminalSquare size={20} />
            </span>
            <div>
              <h2>{t("resources.mcp.title")}</h2>
              <p>{t("resources.mcp.description")}</p>
            </div>
          </div>

          <div className="mcp-config-field">
            <span>{t("resources.mcp.endpoint")}</span>
            <div className="mcp-endpoint">
              <code>{endpoint}</code>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void endpointClipboard.copy(endpoint)}
                aria-label={
                  endpointClipboard.copied ? t("resources.mcp.copiedEndpoint") : t("resources.mcp.copyEndpoint")
                }
              >
                {endpointClipboard.copied ? <Check /> : <Copy />}
              </Button>
            </div>
          </div>

          <Button variant="outline" size="sm" asChild>
            <Link to="/access">
              <KeyRound />
              {t("resources.mcp.createToken")}
            </Link>
          </Button>
        </div>

        <div className="mcp-config-code">
          <div className="mcp-config-code-header">
            <strong>{t("resources.mcp.configTitle")}</strong>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void configClipboard.copy(config)}
              aria-label={configClipboard.copied ? t("resources.mcp.copiedConfig") : t("resources.mcp.copyConfig")}
            >
              {configClipboard.copied ? <Check /> : <Copy />}
            </Button>
          </div>
          <pre>{config}</pre>
        </div>
      </section>

      <div className="docs-grid">
        <DocCard
          icon={<BookOpen size={20} />}
          title={t("resources.apiReference.title")}
          description={t("resources.apiReference.description")}
          href="/docs"
        />
        <DocCard
          icon={<Link2 size={20} />}
          title={t("resources.openapi.title")}
          description={t("resources.openapi.description")}
          href="/openapi.json"
        />
      </div>
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
