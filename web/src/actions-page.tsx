import type { ActionDefinition, AppData, ExecutionResult, JsonSchema, RuntimeActionResponse } from "./model";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { useClipboard } from "foxact/use-clipboard";
import { Check, ChevronRight, Code2, Copy, ExternalLink, Loader2, Play, Search, TerminalSquare, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { buildActionExamples, exampleInput, filterActions, parameterSummaries } from "./model";
import { Badge, EmptyState, TagList } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface ActionsPageProps {
  data: AppData;
  onRefresh(): void;
}

interface ActionDetailProps {
  action: ActionDefinition;
  providerName: string;
  onRefresh(): void;
}

interface ExampleTabsProps {
  action: ActionDefinition;
  examples: { curl: string; typescript: string };
}

const actionPageSize = 120;
const allProvidersFilterValue = "__all_providers__";

export function ActionsPage(props: ActionsPageProps): ReactNode {
  const t = useTranslate();
  const params = useParams();
  const [query, setQuery] = useState("");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(actionPageSize);
  const selectedRowRef = useRef<HTMLAnchorElement | null>(null);
  const actions = useMemo(() => props.data.providers.flatMap((provider) => provider.actions), [props.data.providers]);
  const visibleActions = useMemo(
    () => filterActions(actions, query, selectedService),
    [actions, query, selectedService],
  );
  const renderedActions = useMemo(() => visibleActions.slice(0, visibleLimit), [visibleActions, visibleLimit]);
  const selectedAction = params.actionId ? actions.find((action) => action.id === params.actionId) : null;
  const providerNames = useMemo(
    () => new Map(props.data.providers.map((provider) => [provider.service, provider.displayName])),
    [props.data.providers],
  );
  const selectedProviderName = selectedService
    ? (providerNames.get(selectedService) ?? selectedService)
    : t("actions.allProviders");

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedAction?.id, renderedActions.length]);

  useEffect(() => {
    setVisibleLimit(actionPageSize);
  }, [query, selectedService]);

  const selectedInResults = selectedAction ? visibleActions.some((action) => action.id === selectedAction.id) : false;
  const selectedIsRendered = selectedAction ? renderedActions.some((action) => action.id === selectedAction.id) : false;
  const pinnedSelectedAction = selectedAction && selectedInResults && !selectedIsRendered ? selectedAction : null;
  const hasMoreActions = renderedActions.length < visibleActions.length;

  function clearFilters(): void {
    setQuery("");
    setSelectedService(null);
  }

  function selectService(value: string): void {
    setSelectedService(value === allProvidersFilterValue ? null : value);
  }

  function renderActionRow(action: ActionDefinition): ReactNode {
    const selected = selectedAction?.id === action.id;
    return (
      <Link
        key={action.id}
        ref={selected ? selectedRowRef : undefined}
        className={selected ? "action-row active" : "action-row"}
        to={`/actions/${action.id}`}
      >
        <span className="action-row-main">
          <strong>{action.name}</strong>
          <small>{action.id}</small>
          <small className="action-row-meta">
            {providerNames.get(action.service) ?? action.service} ·{" "}
            {action.execution.locallyExecutable ? t("common.local") : t("common.catalogOnly")} ·{" "}
            {action.execution.noAuthRunnable ? t("common.noAuth") : t("common.credential")}
          </small>
        </span>
        <ChevronRight size={16} />
      </Link>
    );
  }

  return (
    <div className="page-stack actions-page">
      <section className="page-toolbar actions-toolbar">
        <label className="relative flex min-w-56 flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("actions.searchPlaceholder")}
            aria-label={t("actions.searchPlaceholder")}
          />
        </label>
        <div className="select-filter">
          <span className="select-filter-label">{t("actions.provider")}</span>
          <Select value={selectedService ?? allProvidersFilterValue} onValueChange={selectService}>
            <SelectTrigger className="select-filter-trigger" size="sm" aria-label={t("actions.provider")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="select-filter-content" position="popper" align="start">
              <SelectItem value={allProvidersFilterValue}>{t("actions.allProviders")}</SelectItem>
              {props.data.providers.map((provider) => (
                <SelectItem key={provider.service} value={provider.service}>
                  {provider.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className="split-view actions-layout">
        <section className="list-panel actions-list" aria-label={t("nav.actions")}>
          <div className="list-panel-header">
            <div>
              <strong>{t("actions.actionsCount", { count: visibleActions.length })}</strong>
              <span>{selectedProviderName}</span>
            </div>
            {query || selectedService ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t("common.clear")}
              </Button>
            ) : null}
          </div>
          {visibleActions.length === 0 ? (
            <EmptyState title={t("actions.noActionsTitle")} description={t("actions.noActionsDescription")} />
          ) : (
            <>
              {pinnedSelectedAction ? (
                <div className="pinned-action">
                  <span>{t("common.currentSelection")}</span>
                  {renderActionRow(pinnedSelectedAction)}
                </div>
              ) : null}
              {renderedActions.map((action) => renderActionRow(action))}
              {hasMoreActions ? (
                <div className="list-panel-footer">
                  <span>{t("common.showing", { shown: renderedActions.length, total: visibleActions.length })}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleLimit((value) => value + actionPageSize)}
                  >
                    {t("common.showMore")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="detail-panel">
          {selectedAction ? (
            <ActionDetail
              action={selectedAction}
              providerName={providerNames.get(selectedAction.service) ?? selectedAction.service}
              onRefresh={props.onRefresh}
            />
          ) : (
            <EmptyState
              icon={<TerminalSquare size={20} />}
              title={params.actionId ? t("actions.actionNotFoundTitle") : t("actions.noActionSelectedTitle")}
              description={
                params.actionId ? t("actions.actionNotFoundDescription") : t("actions.selectActionDescription")
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ActionDetail(props: ActionDetailProps): ReactNode {
  const t = useTranslate();
  const [debugOpen, setDebugOpen] = useState(false);
  const examples = useMemo(() => buildActionExamples(props.action), [props.action]);

  return (
    <>
      <div className="action-detail-header">
        <div className="detail-heading">
          <div className="action-mark">
            <Code2 size={20} />
          </div>
          <div>
            <h2>{props.action.name}</h2>
            <p>{props.action.id}</p>
          </div>
        </div>
        <div className="button-row action-status-row">
          <Badge tone={props.action.execution.locallyExecutable ? "success" : undefined}>
            {props.action.execution.locallyExecutable ? t("actions.locallyExecutable") : t("common.catalogOnly")}
          </Badge>
          <Badge>{props.action.execution.noAuthRunnable ? t("common.noAuth") : t("actions.needsCredential")}</Badge>
          <Badge>{props.providerName}</Badge>
        </div>
      </div>
      <p className="detail-description">{props.action.description}</p>
      <div className="button-row action-command-row">
        <Button disabled={!props.action.execution.locallyExecutable} onClick={() => setDebugOpen(true)}>
          <Play size={16} />
          {t("actions.debugAction")}
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/actions/${props.action.id}/agent.md`} target="_blank" rel="noreferrer">
            <ExternalLink size={15} />
            Agent.md
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`/providers/${props.action.service}`}>{t("actions.provider")}</Link>
        </Button>
      </div>
      <div className="panel-section">
        <h3>{t("actions.requiredScopes")}</h3>
        <TagList values={props.action.requiredScopes} empty={t("providers.noScopes")} />
      </div>
      <ParameterList schema={props.action.inputSchema} />
      <ExampleTabs action={props.action} examples={examples} />
      {debugOpen ? (
        <RunActionModal action={props.action} onRefresh={props.onRefresh} onClose={() => setDebugOpen(false)} />
      ) : null}
    </>
  );
}

function ParameterList(props: { schema: JsonSchema }): ReactNode {
  const t = useTranslate();
  const parameters = parameterSummaries(props.schema);

  return (
    <details className="parameter-card">
      <summary>
        <span>{t("actions.parameters")}</span>
        <Badge>{t("actions.fieldsCount", { count: parameters.length })}</Badge>
      </summary>
      {parameters.length === 0 ? (
        <p className="muted-copy">{t("actions.noInputParameters")}</p>
      ) : (
        <div className="parameter-list">
          {parameters.map((parameter) => (
            <div key={parameter.name} className="parameter-row">
              <div>
                <strong>{parameter.name}</strong>
                {parameter.description ? <p>{parameter.description}</p> : null}
              </div>
              <span className="parameter-meta">
                {parameter.required ? t("actions.required") : t("actions.optional")} · {parameter.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function ExampleTabs(props: ExampleTabsProps): ReactNode {
  const t = useTranslate();
  const [active, setActive] = useState<"curl" | "typescript" | "agent">("curl");
  const { copy, copied } = useClipboard();
  const agent = buildAgentPrompt(props.action);
  const tabs = [
    { id: "curl", label: "cURL", code: props.examples.curl },
    { id: "typescript", label: "TypeScript", code: props.examples.typescript },
    { id: "agent", label: "Agent.md", code: agent.prompt },
  ] as const;
  const selected = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <section className="example-card">
      <Tabs value={active} onValueChange={(value) => setActive(value as typeof active)}>
        <div className="tab-row">
          <TabsList aria-label={t("actions.actionExamples")}>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="button-row tight">
            {active === "agent" ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/actions/${props.action.id}/agent.md`} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} />
                  {t("actions.open")}
                </a>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void copy(selected.code)}
              aria-label={
                copied
                  ? t("actions.copiedExample", { label: selected.label })
                  : t("actions.copyExample", { label: selected.label })
              }
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </Button>
          </div>
        </div>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id}>
            <pre>{tab.code}</pre>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function RunActionModal(props: { action: ActionDefinition; onRefresh(): void; onClose(): void }): ReactNode {
  const t = useTranslate();
  const [input, setInput] = useState(() => exampleInput(props.action.inputSchema));
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [running, setRunning] = useState(false);
  const [actionId, setActionId] = useState(props.action.id);

  useEffect(() => {
    if (!shouldResetRunActionModal(actionId, props.action.id)) {
      return;
    }

    setActionId(props.action.id);
    setInput(exampleInput(props.action.inputSchema));
    setResult(null);
  }, [actionId, props.action.id, props.action.inputSchema]);

  async function run(): Promise<void> {
    setRunning(true);
    setResult(null);
    try {
      const parsed = input.trim() ? (JSON.parse(input) as unknown) : {};
      const response = await fetch(`/v1/actions/${props.action.id}`, {
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        credentials: "same-origin",
        body: JSON.stringify({ input: parsed }),
      });
      const payload = (await response.json()) as RuntimeActionResponse;
      setResult(
        payload.success
          ? { ok: true, output: payload.data }
          : {
              ok: false,
              error: {
                code: payload.errorCode ?? `http_${response.status}`,
                message: payload.message ?? t("actions.actionFailed"),
                details: payload.data,
              },
            },
      );
      props.onRefresh();
    } catch (error) {
      setResult({
        ok: false,
        error: {
          code: "client_error",
          message: error instanceof Error ? error.message : t("actions.actionFailed"),
        },
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent
        className="run-action-dialog max-w-[min(920px,calc(100vw-2rem))] gap-0 overflow-hidden p-0 sm:max-w-[min(920px,calc(100vw-2rem))]"
        showCloseButton={false}
      >
        <DialogHeader className="run-action-dialog-header">
          <div>
            <DialogTitle>{t("actions.debugAction")}</DialogTitle>
            <DialogDescription className="font-mono text-xs">{props.action.id}</DialogDescription>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={props.onClose} aria-label={t("actions.closeDebugAction")}>
            <X size={16} />
          </Button>
        </DialogHeader>
        <div className={result ? "run-action-dialog-body has-result" : "run-action-dialog-body"}>
          <Label className="field">
            <span>{t("actions.input")}</span>
            <Textarea
              className="run-json-input font-mono text-xs leading-relaxed"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              spellCheck={false}
            />
          </Label>
          <div className="button-row">
            <Button type="button" onClick={() => void run()} disabled={running}>
              {running ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
              {running ? t("actions.running") : t("actions.run")}
            </Button>
          </div>
          {running ? (
            <div className="loading-panel">
              <Loader2 className="spin" size={16} />
              {t("actions.runningAction")}
            </div>
          ) : null}
          {result ? <ResultPanel actionId={props.action.id} result={result} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultPanel(props: { actionId: string; result: ExecutionResult }): ReactNode {
  const t = useTranslate();
  return (
    <div className={props.result.ok ? "result-panel ok" : "result-panel error"}>
      <div className="result-header">
        <Badge tone={props.result.ok ? "success" : "error"}>
          {props.result.ok ? t("common.success") : t("common.failed")}
        </Badge>
        <span>{props.actionId}</span>
      </div>
      <pre className="result-box">{JSON.stringify(props.result, null, 2)}</pre>
    </div>
  );
}

export function shouldResetRunActionModal(currentActionId: string, nextActionId: string): boolean {
  return currentActionId !== nextActionId;
}

function buildAgentPrompt(action: ActionDefinition): { prompt: string } {
  const markdownUrl = `${window.location.origin}/api/actions/${action.id}/agent.md`;
  const prompt = [
    `Read ${markdownUrl} to discover the local request contract for ${action.name}.`,
    `Then call ${window.location.origin}/v1/actions/${action.id} with JSON shaped as { "input": ... }.`,
    "Use the localhost runtime endpoint. Do not call the provider API directly unless I explicitly ask.",
  ].join("\n");

  return { prompt };
}
