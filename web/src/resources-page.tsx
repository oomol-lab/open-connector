import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { useClipboard } from "foxact/use-clipboard";
import {
  ArrowRight,
  BookOpen,
  Check,
  Code2,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Plug,
  TerminalSquare,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import {
  buildCliClientSetup,
  buildMcpClientConfig,
  buildPowerShellClientSetup,
  buildSdkClientSetup,
  normalizeGatewayUrl,
} from "./client-onboarding";
import { Badge } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ResourcesPageProps {
  gatewayUrl: string;
  onGatewayUrlChange(value: string): void;
}

interface CodeBlockProps {
  title: string;
  code: string;
  disabled?: boolean;
}

interface DocCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
}

type ClientMethod = "mcp" | "cli" | "sdk";

export function ResourcesPage(props: ResourcesPageProps): ReactNode {
  const t = useTranslate();
  const [method, setMethod] = useState<ClientMethod>("mcp");
  const [authenticated, setAuthenticated] = useState(true);
  const [platform, setPlatform] = useState("unix");
  const baseUrl = normalizeGatewayUrl(props.gatewayUrl);
  const exampleUrl = baseUrl ?? "https://connect.example.com";
  const sdkCode = [
    buildSdkClientSetup(exampleUrl, authenticated),
    "",
    "await gateway.health();",
    'const matches = await gateway.catalog.search("top stories");',
    'const action = await gateway.catalog.action("hackernews.get_top_stories");',
    'const result = await gateway.execute("hackernews.get_top_stories", {});',
    "console.log(result);",
  ].join("\n");

  return (
    <div className="client-onboarding">
      <header className="onboarding-intro">
        <span className="onboarding-eyebrow">{t("resources.onboarding.eyebrow")}</span>
        <h2>{t("resources.onboarding.title")}</h2>
        <p>{t("resources.onboarding.description")}</p>
        <ol className="onboarding-journey">
          <li>
            <span>1</span>
            {t("resources.onboarding.stepAddress")}
          </li>
          <li>
            <span>2</span>
            {t("resources.onboarding.stepClient")}
          </li>
          <li>
            <span>3</span>
            {t("resources.onboarding.stepAction")}
          </li>
        </ol>
      </header>

      <section className="onboarding-panel" aria-labelledby="gateway-setup-title">
        <div className="onboarding-panel-heading">
          <span className="onboarding-step">1</span>
          <div>
            <h3 id="gateway-setup-title">{t("resources.onboarding.prepare")}</h3>
            <p>{t("resources.onboarding.prepareHelp")}</p>
          </div>
        </div>
        <div className="onboarding-connection-grid">
          <div className="onboarding-field">
            <Label htmlFor="client-gateway-url">{t("resources.onboarding.gatewayUrl")}</Label>
            <Input
              id="client-gateway-url"
              type="url"
              value={props.gatewayUrl}
              onChange={(event) => props.onGatewayUrlChange(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!baseUrl}
              aria-describedby="client-gateway-help"
            />
            <p id="client-gateway-help">
              {t(baseUrl ? "resources.onboarding.gatewayHelp" : "resources.onboarding.urlError")}
            </p>
          </div>
          <div className="onboarding-field">
            <Label>{t("resources.onboarding.authLabel")}</Label>
            <ToggleGroup
              type="single"
              value={authenticated ? "token" : "none"}
              onValueChange={(value) => {
                if (value) setAuthenticated(value === "token");
              }}
              aria-label={t("resources.onboarding.authLabel")}
            >
              <ToggleGroupItem value="token">{t("resources.onboarding.tokenAuth")}</ToggleGroupItem>
              <ToggleGroupItem value="none">{t("resources.onboarding.noAuth")}</ToggleGroupItem>
            </ToggleGroup>
            <p>{t("resources.onboarding.tokenHelp")}</p>
            {authenticated ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/access" target="_blank">
                  <KeyRound size={14} aria-hidden="true" />
                  {t("resources.onboarding.createToken")}
                  <ExternalLink size={13} aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
        <details className="onboarding-note">
          <summary>{t("resources.onboarding.tokenDifferenceTitle")}</summary>
          <p>{t("resources.onboarding.tokenDifference")}</p>
          <p>{t("resources.onboarding.localhostHelp")}</p>
        </details>
      </section>

      <section className="onboarding-panel onboarding-client-panel" aria-labelledby="client-method-title">
        <div className="onboarding-panel-heading">
          <span className="onboarding-step">2</span>
          <div>
            <h3 id="client-method-title">{t("resources.onboarding.clientTitle")}</h3>
            <p>{t("resources.onboarding.clientHelp")}</p>
          </div>
        </div>
        <Tabs value={method} onValueChange={(value) => setMethod(value as ClientMethod)}>
          <TabsList variant="line" className="onboarding-methods" aria-label={t("resources.onboarding.clientTitle")}>
            <TabsTrigger value="mcp">
              <Plug size={15} aria-hidden="true" />
              MCP<span>{t("resources.onboarding.mcpAudience")}</span>
            </TabsTrigger>
            <TabsTrigger value="cli">
              <TerminalSquare size={15} aria-hidden="true" />
              CLI<span>{t("resources.onboarding.cliAudience")}</span>
            </TabsTrigger>
            <TabsTrigger value="sdk">
              <Code2 size={15} aria-hidden="true" />
              SDK<span>{t("resources.onboarding.sdkAudience")}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="mcp" className="onboarding-method-content">
            <div className="onboarding-instructions">
              <Badge>MCP</Badge>
              <h4>{t("resources.onboarding.mcpTitle")}</h4>
              <p>{t("resources.onboarding.mcpHelp")}</p>
              <ol>
                <li>{t("resources.onboarding.mcpConfigure")}</li>
                <li>{t("resources.onboarding.mcpDiscover")}</li>
                <li>{t("resources.onboarding.mcpExecute")}</li>
              </ol>
              <code className="onboarding-endpoint">{exampleUrl}/mcp</code>
              <a
                href="https://github.com/oomol-lab/open-connector/blob/main/docs/runtime-api.md#mcp"
                target="_blank"
                rel="noreferrer"
              >
                {t("resources.onboarding.fullGuide")}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
            <div className="onboarding-snippets">
              <CodeBlock
                title={t("resources.onboarding.configure")}
                code={buildMcpClientConfig(exampleUrl, authenticated)}
                disabled={!baseUrl}
              />
              <CodeBlock
                title={t("resources.onboarding.firstAction")}
                code={JSON.stringify({ actionId: "hackernews.get_top_stories", input: {} }, null, 2)}
                disabled={!baseUrl}
              />
            </div>
          </TabsContent>
          <TabsContent value="cli" className="onboarding-method-content">
            <div className="onboarding-instructions">
              <Badge>oo CLI</Badge>
              <h4>{t("resources.onboarding.cliTitle")}</h4>
              <p>{t("resources.onboarding.cliHelp")}</p>
              <ol>
                <li>{t("resources.onboarding.cliInstall")}</li>
                <li>{t("resources.onboarding.cliConfigure")}</li>
                <li>{t("resources.onboarding.cliExecute")}</li>
              </ol>
              <a
                href="https://github.com/oomol-lab/oo-cli/blob/main/docs/self-hosted-connector.md"
                target="_blank"
                rel="noreferrer"
              >
                {t("resources.onboarding.fullGuide")}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
            <div className="onboarding-snippets">
              <ToggleGroup
                type="single"
                value={platform}
                onValueChange={(value) => {
                  if (value) setPlatform(value);
                }}
                aria-label={t("resources.onboarding.platform")}
              >
                <ToggleGroupItem value="unix">macOS / Linux</ToggleGroupItem>
                <ToggleGroupItem value="windows">Windows PowerShell</ToggleGroupItem>
              </ToggleGroup>
              <CodeBlock
                title={t("resources.onboarding.install")}
                code={
                  platform === "unix"
                    ? "curl -fsSL https://cli.oomol.com/install.sh | bash"
                    : "irm https://cli.oomol.com/install.ps1 | iex"
                }
              />
              <CodeBlock
                title={t("resources.onboarding.configure")}
                code={
                  platform === "unix"
                    ? buildCliClientSetup(exampleUrl, authenticated)
                    : buildPowerShellClientSetup(exampleUrl, authenticated)
                }
                disabled={!baseUrl}
              />
              <CodeBlock
                title={t("resources.onboarding.firstAction")}
                code={
                  "oo connector search \"top stories\"\noo connector schema hackernews.get_top_stories\noo connector run hackernews --action get_top_stories --data '{}'"
                }
                disabled={!baseUrl}
              />
            </div>
          </TabsContent>
          <TabsContent value="sdk" className="onboarding-method-content">
            <div className="onboarding-instructions">
              <Badge>TypeScript</Badge>
              <h4>{t("resources.onboarding.sdkTitle")}</h4>
              <p>{t("resources.onboarding.sdkHelp")}</p>
              <ol>
                <li>{t("resources.onboarding.sdkInstall")}</li>
                <li>{t("resources.onboarding.sdkConfigure")}</li>
                <li>{t("resources.onboarding.sdkExecute")}</li>
              </ol>
              <a href="https://github.com/oomol-lab/connector-sdk#self-hosted-runtime" target="_blank" rel="noreferrer">
                {t("resources.onboarding.fullGuide")}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
            <div className="onboarding-snippets">
              <CodeBlock title={t("resources.onboarding.install")} code="npm install @oomol-lab/connector" />
              {authenticated ? (
                <ToggleGroup
                  type="single"
                  value={platform}
                  onValueChange={(value) => {
                    if (value) setPlatform(value);
                  }}
                  aria-label={t("resources.onboarding.platform")}
                >
                  <ToggleGroupItem value="unix">macOS / Linux</ToggleGroupItem>
                  <ToggleGroupItem value="windows">Windows PowerShell</ToggleGroupItem>
                </ToggleGroup>
              ) : null}
              {authenticated ? (
                <CodeBlock
                  title={t("resources.onboarding.tokenEnv")}
                  code={
                    platform === "unix"
                      ? "export OOMOL_CONNECT_RUNTIME_TOKEN='<RUNTIME_TOKEN>'"
                      : '$env:OOMOL_CONNECT_RUNTIME_TOKEN = "<RUNTIME_TOKEN>"'
                  }
                />
              ) : null}
              <CodeBlock title={t("resources.onboarding.firstAction")} code={sdkCode} disabled={!baseUrl} />
              <p className="onboarding-run-help">{t("resources.onboarding.sdkRunHelp")}</p>
              <CodeBlock title={t("resources.onboarding.runExample")} code="node client.mjs" disabled={!baseUrl} />
            </div>
          </TabsContent>
        </Tabs>
      </section>

      <section className="onboarding-next">
        <div className="onboarding-panel-heading">
          <span className="onboarding-step">3</span>
          <div>
            <h3>{t("resources.onboarding.nextTitle")}</h3>
            <p>{t("resources.onboarding.nextHelp")}</p>
          </div>
        </div>
        <div className="onboarding-next-actions">
          <Button asChild>
            <Link to="/actions">
              {t("resources.onboarding.browseActions")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/actions/hackernews.get_top_stories">{t("resources.onboarding.actionDetails")}</Link>
          </Button>
        </div>
      </section>
      <h3 className="onboarding-reference-title">{t("resources.onboarding.moreTitle")}</h3>
      <div className="docs-grid">
        <DocCard
          icon={<BookOpen size={19} />}
          title={t("resources.apiReference.title")}
          description={t("resources.apiReference.description")}
          href="/docs"
        />
        <DocCard
          icon={<Link2 size={19} />}
          title={t("resources.openapi.title")}
          description={t("resources.openapi.description")}
          href="/openapi.json"
        />
      </div>
    </div>
  );
}

function CodeBlock(props: CodeBlockProps): ReactNode {
  const t = useTranslate();
  const { copy, copied } = useClipboard();
  return (
    <section className="onboarding-code">
      <div>
        <strong>{props.title}</strong>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={props.disabled}
          aria-label={`${t(copied ? "resources.onboarding.copied" : "resources.onboarding.copy")} · ${props.title}`}
          onClick={() => void copy(props.code)}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </Button>
      </div>
      <pre>
        <code>{props.code}</code>
      </pre>
    </section>
  );
}

function DocCard(props: DocCardProps): ReactNode {
  return (
    <a className="doc-card" href={props.href} target="_blank" rel="noreferrer">
      <span className="doc-icon">{props.icon}</span>
      <div>
        <strong>{props.title}</strong>
        <p>{props.description}</p>
      </div>
      <ExternalLink size={15} aria-hidden="true" />
    </a>
  );
}
