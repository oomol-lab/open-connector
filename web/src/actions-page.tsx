import type { ActionDefinition, AppData, ExecutionResult, JsonSchema, RuntimeActionResponse } from "./model";
import type { ReactNode } from "react";

import { useClipboard } from "foxact/use-clipboard";
import { Check, ChevronRight, Code2, Copy, ExternalLink, Loader2, Play, Search, TerminalSquare, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { buildActionExamples, exampleInput, filterActions, parameterSummaries } from "./model";
import { Badge, EmptyState, TagList } from "./shared-ui";

interface ActionsPageProps {
  data: AppData;
  adminToken?: string;
  onRefresh(): void;
}

interface ActionDetailProps {
  action: ActionDefinition;
  providerName: string;
  adminToken?: string;
  onRefresh(): void;
}

interface ExampleTabsProps {
  action: ActionDefinition;
  examples: { curl: string; typescript: string };
}

const actionPageSize = 120;

export function ActionsPage(props: ActionsPageProps): ReactNode {
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
    : "All providers";

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
            {action.execution.locallyExecutable ? "Local" : "Catalog"} ·{" "}
            {action.execution.noAuthRunnable ? "No auth" : "Credential"}
          </small>
        </span>
        <ChevronRight size={16} />
      </Link>
    );
  }

  return (
    <div className="page-stack actions-page">
      <section className="page-toolbar actions-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actions by name, id, or provider"
          />
        </label>
        <label className="select-filter">
          <span>Provider</span>
          <select value={selectedService ?? ""} onChange={(event) => setSelectedService(event.target.value || null)}>
            <option value="">All providers</option>
            {props.data.providers.map((provider) => (
              <option key={provider.service} value={provider.service}>
                {provider.displayName}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="split-view actions-layout">
        <section className="list-panel actions-list" aria-label="Actions">
          <div className="list-panel-header">
            <div>
              <strong>{visibleActions.length} actions</strong>
              <span>{selectedProviderName}</span>
            </div>
            {query || selectedService ? (
              <button className="secondary-button compact" onClick={clearFilters}>
                Clear
              </button>
            ) : null}
          </div>
          {visibleActions.length === 0 ? (
            <EmptyState title="No actions found" description="Try a different search or provider filter." />
          ) : (
            <>
              {pinnedSelectedAction ? (
                <div className="pinned-action">
                  <span>Current selection</span>
                  {renderActionRow(pinnedSelectedAction)}
                </div>
              ) : null}
              {renderedActions.map((action) => renderActionRow(action))}
              {hasMoreActions ? (
                <div className="list-panel-footer">
                  <span>
                    Showing {renderedActions.length} of {visibleActions.length}
                  </span>
                  <button
                    className="secondary-button compact"
                    onClick={() => setVisibleLimit((value) => value + actionPageSize)}
                  >
                    Show more
                  </button>
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
              adminToken={props.adminToken}
              onRefresh={props.onRefresh}
            />
          ) : (
            <EmptyState
              icon={<TerminalSquare size={20} />}
              title={params.actionId ? "Action not found" : "No action selected"}
              description={
                params.actionId
                  ? "The action route does not match the current catalog."
                  : "Select an action to inspect and run it."
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ActionDetail(props: ActionDetailProps): ReactNode {
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
            {props.action.execution.locallyExecutable ? "Locally executable" : "Catalog only"}
          </Badge>
          <Badge>{props.action.execution.noAuthRunnable ? "No auth" : "Needs credential"}</Badge>
          <Badge>{props.providerName}</Badge>
        </div>
      </div>
      <p className="detail-description">{props.action.description}</p>
      <div className="button-row action-command-row">
        <button
          className="primary-button"
          disabled={!props.action.execution.locallyExecutable}
          onClick={() => setDebugOpen(true)}
        >
          <Play size={16} />
          Debug Action
        </button>
        <a
          className="secondary-link"
          href={`/api/actions/${props.action.id}/agent.md`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={15} />
          Agent.md
        </a>
        <Link className="secondary-link" to={`/providers/${props.action.service}`}>
          Provider
        </Link>
      </div>
      <div className="panel-section">
        <h3>Required Scopes</h3>
        <TagList values={props.action.requiredScopes} empty="No scopes" />
      </div>
      <ParameterList schema={props.action.inputSchema} />
      <ExampleTabs action={props.action} examples={examples} />
      {debugOpen ? (
        <RunActionModal
          action={props.action}
          adminToken={props.adminToken}
          onRefresh={props.onRefresh}
          onClose={() => setDebugOpen(false)}
        />
      ) : null}
    </>
  );
}

function ParameterList(props: { schema: JsonSchema }): ReactNode {
  const parameters = parameterSummaries(props.schema);

  return (
    <details className="parameter-card">
      <summary>
        <span>Parameters</span>
        <Badge>{parameters.length} fields</Badge>
      </summary>
      {parameters.length === 0 ? (
        <p className="muted-copy">No input parameters.</p>
      ) : (
        <div className="parameter-list">
          {parameters.map((parameter) => (
            <div key={parameter.name} className="parameter-row">
              <div>
                <strong>{parameter.name}</strong>
                {parameter.description ? <p>{parameter.description}</p> : null}
              </div>
              <span className="parameter-meta">
                {parameter.required ? "Required" : "Optional"} · {parameter.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function ExampleTabs(props: ExampleTabsProps): ReactNode {
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
      <div className="tab-row">
        <div className="segmented-control" role="tablist" aria-label="Action examples">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={active === tab.id ? "segment active" : "segment"}
              onClick={() => setActive(tab.id)}
              role="tab"
              aria-selected={active === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="button-row tight">
          {active === "agent" ? (
            <a
              className="secondary-link"
              href={`/api/actions/${props.action.id}/agent.md`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={15} />
              Open
            </a>
          ) : null}
          <button
            className="icon-button subtle"
            onClick={() => void copy(selected.code)}
            aria-label={copied ? `Copied ${selected.label}` : `Copy ${selected.label}`}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
      </div>
      <pre>{selected.code}</pre>
    </section>
  );
}

function RunActionModal(props: {
  action: ActionDefinition;
  adminToken?: string;
  onRefresh(): void;
  onClose(): void;
}): ReactNode {
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
        headers: actionRunHeaders(props.adminToken),
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
                message: payload.message ?? "Action failed.",
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
          message: error instanceof Error ? error.message : "Action failed.",
        },
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="run-action-title">
        <div className="modal-header">
          <div>
            <h3 id="run-action-title">Debug Action</h3>
            <p>{props.action.id}</p>
          </div>
          <button className="icon-button subtle" onClick={props.onClose} aria-label="Close debug action">
            <X size={16} />
          </button>
        </div>
        <div className={result ? "modal-body has-result" : "modal-body"}>
          <label className="field">
            <span>Input</span>
            <textarea
              className="json-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              spellCheck={false}
            />
          </label>
          <div className="button-row">
            <button className="primary-button" onClick={() => void run()} disabled={running}>
              {running ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
              {running ? "Running" : "Run"}
            </button>
          </div>
          {running ? (
            <div className="loading-panel">
              <Loader2 className="spin" size={16} />
              Running action...
            </div>
          ) : null}
          {result ? <ResultPanel actionId={props.action.id} result={result} /> : null}
        </div>
      </section>
    </div>
  );
}

function ResultPanel(props: { actionId: string; result: ExecutionResult }): ReactNode {
  return (
    <div className={props.result.ok ? "result-panel ok" : "result-panel error"}>
      <div className="result-header">
        <Badge tone={props.result.ok ? "success" : "error"}>{props.result.ok ? "Success" : "Failed"}</Badge>
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

function actionRunHeaders(adminToken: string | undefined): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  const token = adminToken?.trim();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return headers;
}
