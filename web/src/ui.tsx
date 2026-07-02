import { useClipboard } from "foxact/use-clipboard";
import {
  Activity,
  AppWindow,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Play,
  PlugZap,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

type AuthDefinition =
  | { type: "no_auth" }
  | {
      type: "api_key";
      label?: string;
      placeholder?: string;
      description?: string;
      extraFields?: CredentialField[];
    }
  | { type: "custom_credential"; fields: CredentialField[] }
  | {
      type: "oauth2";
      scopes: string[];
      clientConfigFields?: CredentialField[];
    };

interface CredentialField {
  key: string;
  label: string;
  inputType: "text" | "password" | "textarea" | "json";
  required: boolean;
  secret: boolean;
  placeholder?: string;
  description?: string;
}

type JsonSchema = Record<string, unknown>;

interface ActionDefinition {
  id: string;
  service: string;
  name: string;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  execution: {
    locallyExecutable: boolean;
    catalogOnly: boolean;
    requiredAuthTypes: string[];
    noAuthRunnable: boolean;
    needsCredential: boolean;
  };
}

interface ProviderDefinition {
  service: string;
  displayName: string;
  categories: string[];
  authTypes: string[];
  auth: AuthDefinition[];
  homepageUrl?: string;
  actions: ActionDefinition[];
}

interface ConnectionRecord {
  service: string;
  authType: string;
  metadata: Record<string, unknown>;
}

interface OAuthConfig {
  service: string;
  clientId: string;
  extra: Record<string, string>;
}

interface RuntimeTokenSummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

interface RuntimeTokenCreation {
  token: string;
  record: RuntimeTokenSummary;
}

interface RunLog {
  id: string;
  actionId: string;
  caller: "http" | "mcp" | "web";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  ok: boolean;
  inputSummary?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

interface RunLogPage {
  items: RunLog[];
  nextCursor?: string;
}

interface ExecutionResult {
  ok: boolean;
  output?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface RuntimeActionResponse {
  success: boolean;
  message?: string;
  data?: unknown;
  errorCode?: string;
}

interface AppData {
  providers: ProviderDefinition[];
  connections: ConnectionRecord[];
  oauthConfigs: OAuthConfig[];
  runtimeTokens: RuntimeTokenSummary[];
  runs: RunLog[];
  runsNextCursor?: string;
}

interface ProvidersViewProps {
  providers: ProviderDefinition[];
  connectionsByService: Map<string, ConnectionRecord>;
  oauthConfigServices: Set<string>;
  selectedService?: string;
  onSelect(service: string): void;
  onRefresh(): void;
}

interface ProviderDetailProps {
  provider: ProviderDefinition;
  connection?: ConnectionRecord;
  hasOAuthConfig: boolean;
  onRefresh(): void;
}

interface ConnectionFormProps {
  provider: ProviderDefinition;
  auth: AuthDefinition;
  onRefresh(): void;
}

interface OAuthConfigFormProps {
  provider: ProviderDefinition;
  hasConfig: boolean;
  onRefresh(): void;
}

interface ActionsViewProps {
  providers: ProviderDefinition[];
  actions: ActionDefinition[];
  selectedService: string | null;
  selectedAction?: ActionDefinition;
  onSelectService(service: string | null): void;
  onSelectAction(actionId: string): void;
  onRefresh(): void;
}

interface DocCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
}

interface RuntimeTokensViewProps {
  tokens: RuntimeTokenSummary[];
  onRefresh(): void;
}

interface ExampleTabsProps {
  action: ActionDefinition;
  examples: { curl: string; typescript: string };
}

const emptyData: AppData = {
  providers: [],
  connections: [],
  oauthConfigs: [],
  runtimeTokens: [],
  runs: [],
};

const tabs = [
  { id: "providers", label: "Providers", icon: AppWindow },
  { id: "actions", label: "Actions", icon: TerminalSquare },
  { id: "access", label: "Access", icon: KeyRound },
  { id: "runs", label: "Runs", icon: Activity },
  { id: "docs", label: "Docs", icon: BookOpen },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function App(): ReactNode {
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("providers");
  const [query, setQuery] = useState("");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [loadingMoreRuns, setLoadingMoreRuns] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRunsError(null);
    Promise.all([
      apiGet<ProviderDefinition[]>("/api/providers"),
      apiGet<ConnectionRecord[]>("/api/connections"),
      apiGet<OAuthConfig[]>("/api/oauth/configs"),
      apiGet<RuntimeTokenSummary[]>("/api/runtime-tokens"),
      apiGet<RunLogPage>("/api/runs"),
    ])
      .then(([providers, connections, oauthConfigs, runtimeTokens, runPage]) => {
        if (!cancelled) {
          setData({
            providers,
            connections,
            oauthConfigs,
            runtimeTokens,
            runs: runPage.items,
            runsNextCursor: runPage.nextCursor,
          });
          const firstProvider = firstProviderByConnectionStatus(providers, connections);
          setSelectedService((current) => current ?? firstProvider?.service ?? null);
          setSelectedActionId((current) => current ?? firstProvider?.actions[0]?.id ?? null);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Failed to load runtime data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  async function loadMoreRuns(): Promise<void> {
    if (!data.runsNextCursor || loadingMoreRuns) {
      return;
    }

    setLoadingMoreRuns(true);
    setRunsError(null);
    try {
      const query = new URLSearchParams({ limit: "50", cursor: data.runsNextCursor });
      const page = await apiGet<RunLogPage>(`/api/runs?${query}`);
      setData((current) => ({
        ...current,
        runs: [...current.runs, ...page.items],
        runsNextCursor: page.nextCursor,
      }));
    } catch (caught) {
      setRunsError(caught instanceof Error ? caught.message : "Failed to load more runs.");
    } finally {
      setLoadingMoreRuns(false);
    }
  }

  const connectionsByService = useMemo(
    () => new Map(data.connections.map((connection) => [connection.service, connection])),
    [data.connections],
  );
  const oauthConfigServices = useMemo(
    () => new Set(data.oauthConfigs.map((config) => config.service)),
    [data.oauthConfigs],
  );
  const actions = useMemo(() => data.providers.flatMap((provider) => provider.actions), [data.providers]);
  const sortedProviders = useMemo(
    () => sortProviders(data.providers, connectionsByService),
    [data.providers, connectionsByService],
  );
  const selectedProvider =
    sortedProviders.find((provider) => provider.service === selectedService) ?? sortedProviders[0];
  const selectedAction =
    actions.find((action) => action.id === selectedActionId) ?? selectedProvider?.actions[0] ?? actions[0];
  const filteredProviders = filterProviders(sortedProviders, query);
  const filteredActions = filterActions(actions, query, selectedService);

  function refresh(): void {
    setRefreshToken((value) => value + 1);
  }

  return (
    <div className="app-shell">
      <header className="global-header">
        <div className="brand">
          <div className="brand-mark">OC</div>
          <div>
            <div className="brand-name">OOMOL Connect</div>
            <div className="brand-subtitle">Open Source Runtime</div>
          </div>
        </div>
        <nav className="nav-list" aria-label="Primary">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={activeTab === tab.id ? "nav-item active" : "nav-item"}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="runtime-status">
          <StatusDot ok={!error} />
          <span>{error ? "API unavailable" : "Runtime ready"}</span>
          <button className="icon-button compact" onClick={refresh} aria-label="Refresh data">
            {loading ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
          </button>
        </div>
      </header>

      <main className="main">
        <section className="page-header">
          <div>
            <h1>{headingFor(activeTab)}</h1>
            <p>{subtitleFor(activeTab)}</p>
          </div>
          {activeTab === "providers" || activeTab === "actions" ? (
            <div className="topbar-actions">
              <label className="search-box">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search providers or actions"
                />
              </label>
            </div>
          ) : null}
        </section>

        {error ? <InlineError message={error} /> : null}

        <section className="metrics">
          <Metric label="Providers" value={data.providers.length} />
          <Metric label="Actions" value={actions.length} />
          <Metric label="Connected" value={data.connections.length} />
          <Metric label="Tokens" value={data.runtimeTokens.filter((token) => !token.revokedAt).length} />
        </section>

        {activeTab === "providers" ? (
          <ProvidersView
            providers={filteredProviders}
            connectionsByService={connectionsByService}
            oauthConfigServices={oauthConfigServices}
            selectedService={selectedProvider?.service}
            onSelect={(service) => {
              setSelectedService(service);
              setSelectedActionId(
                data.providers.find((provider) => provider.service === service)?.actions[0]?.id ?? null,
              );
            }}
            onRefresh={refresh}
          />
        ) : null}

        {activeTab === "actions" ? (
          <ActionsView
            providers={data.providers}
            actions={filteredActions}
            selectedService={selectedService}
            selectedAction={selectedAction}
            onSelectService={setSelectedService}
            onSelectAction={setSelectedActionId}
            onRefresh={refresh}
          />
        ) : null}

        {activeTab === "runs" ? (
          <RunsView
            runs={data.runs}
            nextCursor={data.runsNextCursor}
            loadingMore={loadingMoreRuns}
            error={runsError}
            onLoadMore={loadMoreRuns}
          />
        ) : null}

        {activeTab === "access" ? <RuntimeTokensView tokens={data.runtimeTokens} onRefresh={refresh} /> : null}

        {activeTab === "docs" ? <DocsView actions={actions} /> : null}
      </main>
    </div>
  );
}

function ProvidersView(props: ProvidersViewProps): ReactNode {
  const providers = sortProviders(props.providers, props.connectionsByService);
  const selectedProvider = providers.find((provider) => provider.service === props.selectedService) ?? providers[0];

  return (
    <div className="split-view">
      <section className="list-panel">
        {providers.map((provider) => {
          const connected = props.connectionsByService.has(provider.service);
          return (
            <button
              key={provider.service}
              className={selectedProvider?.service === provider.service ? "provider-row active" : "provider-row"}
              onClick={() => props.onSelect(provider.service)}
            >
              <ProviderIcon provider={provider} />
              <span className="row-main">
                <span>{provider.displayName}</span>
                <small>{provider.actions.length} actions</small>
              </span>
              {connected ? <Badge tone="success">Connected</Badge> : <Badge>Not connected</Badge>}
            </button>
          );
        })}
      </section>

      <section className="detail-panel">
        {selectedProvider ? (
          <ProviderDetail
            provider={selectedProvider}
            connection={props.connectionsByService.get(selectedProvider.service)}
            hasOAuthConfig={props.oauthConfigServices.has(selectedProvider.service)}
            onRefresh={props.onRefresh}
          />
        ) : (
          <EmptyState title="No providers found" description="Try a different search." />
        )}
      </section>
    </div>
  );
}

function ProviderDetail(props: ProviderDetailProps): ReactNode {
  const preferredAuth = props.provider.auth.find((auth) => auth.type === "api_key") ?? props.provider.auth[0];
  const oauthAuth = props.provider.auth.find((auth) => auth.type === "oauth2");

  return (
    <>
      <div className="detail-heading">
        <ProviderIcon provider={props.provider} large />
        <div>
          <h2>{props.provider.displayName}</h2>
          <p>{props.provider.service}</p>
        </div>
        <div className="detail-spacer" />
        {props.connection ? (
          <Badge tone="success">Connected by {props.connection.authType}</Badge>
        ) : (
          <Badge>Not connected</Badge>
        )}
      </div>

      <div className="section-grid">
        <InfoBlock icon={<PlugZap size={18} />} label="Actions" value={String(props.provider.actions.length)} />
        <InfoBlock icon={<ShieldCheck size={18} />} label="Auth" value={props.provider.authTypes.join(", ")} />
        <InfoBlock
          icon={<KeyRound size={18} />}
          label="OAuth config"
          value={oauthAuth ? (props.hasOAuthConfig ? "Configured" : "Required") : "Not used"}
        />
      </div>

      <div className="panel-section">
        <h3>Connection</h3>
        {preferredAuth ? (
          <ConnectionForm provider={props.provider} auth={preferredAuth} onRefresh={props.onRefresh} />
        ) : (
          <EmptyState title="No connection method" description="This provider does not need local credentials." />
        )}
      </div>

      {oauthAuth ? (
        <div className="panel-section">
          <h3>OAuth Client</h3>
          <OAuthConfigForm provider={props.provider} hasConfig={props.hasOAuthConfig} onRefresh={props.onRefresh} />
        </div>
      ) : null}

      <div className="panel-section">
        <h3>Scopes</h3>
        <TagList
          values={[...new Set(props.provider.actions.flatMap((action) => action.requiredScopes))]}
          empty="No scopes"
        />
      </div>
    </>
  );
}

function ConnectionForm(props: ConnectionFormProps): ReactNode {
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const fields = credentialFieldsFor(props.auth);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus("Saving connection...");
    try {
      if (props.auth.type === "no_auth") {
        await apiPut(`/api/connections/${props.provider.service}`, { authType: "no_auth" });
      } else if (props.auth.type === "api_key") {
        await apiPut(`/api/connections/${props.provider.service}`, { authType: "api_key", values });
      } else if (props.auth.type === "custom_credential") {
        await apiPut(`/api/connections/${props.provider.service}`, { authType: "custom_credential", values });
      } else {
        await apiPost(`/api/oauth/authorizations`, { service: props.provider.service });
      }
      setStatus("Connection updated.");
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Connection failed.");
    }
  }

  async function disconnect(): Promise<void> {
    setStatus("Disconnecting...");
    try {
      await apiDelete(`/api/connections/${props.provider.service}`);
      setStatus("Disconnected.");
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Disconnect failed.");
    }
  }

  return (
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      {props.auth.type === "oauth2" ? (
        <p className="muted-copy">Start OAuth after saving the local OAuth client configuration.</p>
      ) : null}
      {fields.map((field) => (
        <label key={field.key} className="field">
          <span>{field.label}</span>
          <input
            type={field.secret ? "password" : "text"}
            placeholder={field.placeholder}
            value={values[field.key] ?? ""}
            onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
          />
          {field.description ? <small>{field.description}</small> : null}
        </label>
      ))}
      <div className="button-row">
        <button className="primary-button" type="submit">
          {props.auth.type === "oauth2" ? <ExternalLink size={16} /> : <Check size={16} />}
          {props.auth.type === "oauth2" ? "Start OAuth" : "Save Connection"}
        </button>
        <button className="secondary-button" type="button" onClick={() => void disconnect()}>
          <Trash2 size={16} />
          Disconnect
        </button>
      </div>
      {status ? <p className="form-status">{status}</p> : null}
    </form>
  );
}

function OAuthConfigForm(props: OAuthConfigFormProps): ReactNode {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus("Saving OAuth client...");
    try {
      await apiPut(`/api/oauth/configs/${props.provider.service}`, {
        clientId,
        clientSecret,
        extra: {},
      });
      setStatus("OAuth client saved.");
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save OAuth client.");
    }
  }

  return (
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span>Client ID</span>
        <input value={clientId} onChange={(event) => setClientId(event.target.value)} />
      </label>
      <label className="field">
        <span>Client Secret</span>
        <input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} />
      </label>
      <div className="button-row">
        <button className="primary-button" type="submit">
          <Settings size={16} />
          {props.hasConfig ? "Update OAuth Client" : "Save OAuth Client"}
        </button>
      </div>
      {status ? <p className="form-status">{status}</p> : null}
    </form>
  );
}

function ActionsView(props: ActionsViewProps): ReactNode {
  return (
    <div className="split-view actions-layout">
      <section className="list-panel">
        <div className="filter-strip">
          <button
            className={!props.selectedService ? "chip active" : "chip"}
            onClick={() => props.onSelectService(null)}
          >
            All
          </button>
          {props.providers.map((provider) => (
            <button
              key={provider.service}
              className={props.selectedService === provider.service ? "chip active" : "chip"}
              onClick={() => props.onSelectService(provider.service)}
            >
              {provider.displayName}
            </button>
          ))}
        </div>
        {props.actions.map((action) => (
          <button
            key={action.id}
            className={props.selectedAction?.id === action.id ? "action-row active" : "action-row"}
            onClick={() => props.onSelectAction(action.id)}
          >
            <span>
              <strong>{action.name}</strong>
              <small>
                {action.service} · {action.execution.locallyExecutable ? "Executable" : "Catalog only"}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </section>
      <section className="detail-panel">
        {props.selectedAction ? (
          <ActionDetail action={props.selectedAction} />
        ) : (
          <EmptyState title="No action selected" description="Select an action to inspect and run it." />
        )}
      </section>
    </div>
  );
}

function ActionDetail(props: { action: ActionDefinition }): ReactNode {
  const [debugOpen, setDebugOpen] = useState(false);
  const examples = useMemo(() => buildActionExamples(props.action), [props.action]);

  return (
    <>
      <div className="detail-heading">
        <div className="action-mark">
          <Code2 size={20} />
        </div>
        <div>
          <h2>{props.action.name}</h2>
          <p>{props.action.id}</p>
        </div>
      </div>
      <p className="detail-description">{props.action.description}</p>
      <div className="button-row">
        <Badge tone={props.action.execution.locallyExecutable ? "success" : undefined}>
          {props.action.execution.locallyExecutable ? "Locally executable" : "Catalog only"}
        </Badge>
        <Badge>{props.action.execution.noAuthRunnable ? "No auth" : "Needs credential"}</Badge>
      </div>
      <div className="button-row">
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
      </div>
      <div className="panel-section">
        <h3>Required Scopes</h3>
        <TagList values={props.action.requiredScopes} empty="No scopes" />
      </div>
      <ParameterList schema={props.action.inputSchema} />
      <ExampleTabs action={props.action} examples={examples} />
      {debugOpen ? <RunActionModal action={props.action} onClose={() => setDebugOpen(false)} /> : null}
    </>
  );
}

function RunsView(props: {
  runs: RunLog[];
  nextCursor?: string;
  loadingMore: boolean;
  error: string | null;
  onLoadMore(): Promise<void>;
}): ReactNode {
  if (props.runs.length === 0) {
    return <EmptyState title="No runs yet" description="Run an action to see recent execution history." />;
  }

  return (
    <>
      <section className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Caller</th>
              <th>Status</th>
              <th>Started</th>
              <th>Duration</th>
              <th>Input</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {props.runs.map((run) => (
              <tr key={run.id}>
                <td className="mono">{run.actionId}</td>
                <td className="mono">{run.caller}</td>
                <td>{run.ok ? <Badge tone="success">Success</Badge> : <Badge tone="error">Failed</Badge>}</td>
                <td>{formatDate(run.startedAt)}</td>
                <td>{formatDuration(run)}</td>
                <td className="mono">{compactJson(run.inputSummary)}</td>
                <td>{run.errorMessage ?? run.errorCode ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {props.error ? <InlineError message={props.error} /> : null}
      {props.nextCursor ? (
        <div className="table-footer">
          <button
            className="secondary-button compact"
            onClick={() => void props.onLoadMore()}
            disabled={props.loadingMore}
          >
            {props.loadingMore ? <Loader2 size={14} className="spin" /> : null}
            Load more
          </button>
        </div>
      ) : null}
    </>
  );
}

function RuntimeTokensView(props: RuntimeTokensViewProps): ReactNode {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<RuntimeTokenCreation | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { copy, copied } = useClipboard();

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus("Creating token...");
    setCreated(null);
    try {
      const result = await apiPost<RuntimeTokenCreation>("/api/runtime-tokens", { name });
      setCreated(result);
      setName("");
      setStatus("Token created.");
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create token.");
    }
  }

  async function revoke(id: string): Promise<void> {
    setStatus("Revoking token...");
    try {
      await apiDelete(`/api/runtime-tokens/${id}`);
      setStatus("Token revoked.");
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to revoke token.");
    }
  }

  return (
    <section className="detail-panel access-panel">
      <div className="access-panel-header">
        <div className="detail-heading">
          <div className="action-mark">
            <KeyRound size={20} />
          </div>
          <div>
            <h2>Runtime Tokens</h2>
            <p>Issue bearer tokens for /v1 and MCP clients. New tokens are shown once.</p>
          </div>
        </div>

        <form className="token-create-form" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Local MCP client" />
          </label>
          <button className="primary-button" type="submit" disabled={!name.trim()}>
            <KeyRound size={16} />
            Create Token
          </button>
        </form>
      </div>

      {status ? <p className="form-status">{status}</p> : null}

      {created ? (
        <section className="example-card token-result">
          <div className="tab-row">
            <strong>New token</strong>
            <button
              className="icon-button subtle"
              onClick={() => void copy(created.token)}
              aria-label={copied ? "Copied runtime token" : "Copy runtime token"}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
          <pre>{created.token}</pre>
        </section>
      ) : null}

      <section className="table-panel">
        {props.tokens.length === 0 ? (
          <EmptyState
            icon={<KeyRound size={20} />}
            title="No runtime tokens yet"
            description="Create one before connecting an MCP client or local script. The token is shown once."
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {props.tokens.map((token) => (
                <tr key={token.id}>
                  <td>
                    <strong>{token.name}</strong>
                  </td>
                  <td>{token.revokedAt ? <Badge>Revoked</Badge> : <Badge tone="success">Active</Badge>}</td>
                  <td>{formatDate(token.createdAt)}</td>
                  <td>{token.lastUsedAt ? formatDate(token.lastUsedAt) : ""}</td>
                  <td className="table-actions">
                    {!token.revokedAt ? (
                      <button className="secondary-button compact" onClick={() => void revoke(token.id)}>
                        <Trash2 size={15} />
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}

function DocsView(props: { actions: ActionDefinition[] }): ReactNode {
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

function RunActionModal(props: { action: ActionDefinition; onClose(): void }): ReactNode {
  const [input, setInput] = useState(() => exampleInput(props.action.inputSchema));
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setInput(exampleInput(props.action.inputSchema));
    setResult(null);
  }, [props.action.id, props.action.inputSchema]);

  async function run(): Promise<void> {
    setRunning(true);
    setResult(null);
    try {
      const parsed = input.trim() ? (JSON.parse(input) as unknown) : {};
      const response = await fetch(`/v1/actions/${props.action.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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
        <div className="modal-body">
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

function buildAgentPrompt(action: ActionDefinition): { prompt: string } {
  const markdownUrl = `${window.location.origin}/api/actions/${action.id}/agent.md`;
  const prompt = [
    `Read ${markdownUrl} to discover the local request contract for ${action.name}.`,
    `Then call ${window.location.origin}/v1/actions/${action.id} with JSON shaped as { "input": ... }.`,
    "Use the localhost runtime endpoint. Do not call the provider API directly unless I explicitly ask.",
  ].join("\n");

  return { prompt };
}

function Metric(props: { label: string; value: number }): ReactNode {
  return (
    <div className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function InfoBlock(props: { icon: ReactNode; label: string; value: string }): ReactNode {
  return (
    <div className="info-block">
      {props.icon}
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function Badge(props: { children: ReactNode; tone?: "success" | "error" }): ReactNode {
  return <span className={props.tone ? `badge ${props.tone}` : "badge"}>{props.children}</span>;
}

function TagList(props: { values: string[]; empty: string }): ReactNode {
  const values = props.values.filter(Boolean);
  if (values.length === 0) return <p className="muted-copy">{props.empty}</p>;
  return (
    <div className="tag-list">
      {values.map((value) => (
        <span key={value} className="tag">
          {value}
        </span>
      ))}
    </div>
  );
}

function ProviderIcon(props: { provider: ProviderDefinition; large?: boolean }): ReactNode {
  const letters = props.provider.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return <span className={props.large ? "provider-icon large" : "provider-icon"}>{letters}</span>;
}

function EmptyState(props: { title: string; description: string; icon?: ReactNode }): ReactNode {
  return (
    <div className="empty-state">
      {props.icon ?? <X size={20} />}
      <strong>{props.title}</strong>
      <p>{props.description}</p>
    </div>
  );
}

function InlineError(props: { message: string }): ReactNode {
  return (
    <div className="inline-error">
      <X size={16} />
      {props.message}
    </div>
  );
}

function StatusDot(props: { ok: boolean }): ReactNode {
  return <span className={props.ok ? "status-dot ok" : "status-dot error"} />;
}

function headingFor(tab: TabId): string {
  if (tab === "actions") return "Actions";
  if (tab === "access") return "Access";
  if (tab === "runs") return "Runs";
  if (tab === "docs") return "Docs";
  return "Providers";
}

function subtitleFor(tab: TabId): string {
  if (tab === "actions") return "Generate examples and run local provider actions.";
  if (tab === "access") return "Manage runtime API tokens for agents and clients.";
  if (tab === "runs") return "Recent local action executions.";
  if (tab === "docs") return "Generated API and tool metadata.";
  return "Connect providers and review capabilities.";
}

function credentialFieldsFor(auth: AuthDefinition): CredentialField[] {
  if (auth.type === "api_key") {
    return [
      {
        key: "apiKey",
        label: auth.label ?? "API key",
        inputType: "password",
        required: true,
        secret: true,
        placeholder: auth.placeholder,
        description: auth.description,
      },
      ...(auth.extraFields ?? []),
    ];
  }
  if (auth.type === "custom_credential") return auth.fields;
  return [];
}

function filterProviders(providers: ProviderDefinition[], query: string): ProviderDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return providers;
  return providers.filter((provider) =>
    [provider.displayName, provider.service, provider.categories.join(" "), provider.authTypes.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

function sortProviders(
  providers: ProviderDefinition[],
  connectionsByService: Map<string, ConnectionRecord>,
): ProviderDefinition[] {
  return [...providers].sort((left, right) => {
    const leftConnected = connectionsByService.has(left.service);
    const rightConnected = connectionsByService.has(right.service);
    if (leftConnected !== rightConnected) {
      return leftConnected ? -1 : 1;
    }

    return left.displayName.localeCompare(right.displayName);
  });
}

function firstProviderByConnectionStatus(
  providers: ProviderDefinition[],
  connections: ConnectionRecord[],
): ProviderDefinition | undefined {
  return sortProviders(providers, new Map(connections.map((connection) => [connection.service, connection])))[0];
}

function filterActions(actions: ActionDefinition[], query: string, service: string | null): ActionDefinition[] {
  const normalized = query.trim().toLowerCase();
  return actions.filter((action) => {
    if (service && action.service !== service) return false;
    if (!normalized) return true;
    return [action.id, action.name, action.description, action.requiredScopes.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}

function exampleInput(schema: JsonSchema): string {
  const properties = readProperties(schema);
  const required = readRequired(schema);
  const value: Record<string, unknown> = {};
  for (const key of required) {
    value[key] = exampleValue(properties[key]);
  }
  return JSON.stringify(value, null, 2);
}

function parameterSummaries(
  schema: JsonSchema,
): Array<{ name: string; required: boolean; type: string; description: string }> {
  const required = new Set(readRequired(schema));
  return Object.entries(readProperties(schema)).map(([name, property]) => ({
    name,
    required: required.has(name),
    type: describeSchemaType(property),
    description: typeof property.description === "string" ? property.description : "",
  }));
}

function readProperties(schema: JsonSchema): Record<string, JsonSchema> {
  return schema.properties && typeof schema.properties === "object"
    ? (schema.properties as Record<string, JsonSchema>)
    : {};
}

function readRequired(schema: JsonSchema): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === "string")
    : [];
}

function describeSchemaType(schema: JsonSchema | undefined): string {
  if (!schema) return "unknown";
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (Array.isArray(schema.anyOf))
    return schema.anyOf.map((value) => describeSchemaType(value as JsonSchema)).join(" | ");
  return typeof schema.type === "string" ? schema.type : "unknown";
}

function buildActionExamples(action: ActionDefinition): { curl: string; typescript: string } {
  const body = { input: JSON.parse(exampleInput(action.inputSchema)) as unknown };
  const bodyText = JSON.stringify(body, null, 2);
  return {
    curl: [
      `curl -s http://localhost:3000/v1/actions/${action.id} \\`,
      "  -H 'content-type: application/json' \\",
      `  -d '${JSON.stringify(body)}'`,
    ].join("\n"),
    typescript: [
      `const response = await fetch("http://localhost:3000/v1/actions/${action.id}", {`,
      `  method: "POST",`,
      `  headers: { "content-type": "application/json" },`,
      `  body: JSON.stringify(${bodyText}),`,
      `});`,
      `const result = await response.json();`,
    ].join("\n"),
  };
}

function exampleValue(schema: JsonSchema | undefined): unknown {
  if (!schema) return "";
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum)) return schema.enum[0];
  if (schema.type === "integer" || schema.type === "number") return 1;
  if (schema.type === "boolean") return false;
  if (schema.type === "array") return [];
  if (schema.type === "object") return {};
  return "";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatDuration(run: RunLog): string {
  const ms =
    typeof run.durationMs === "number"
      ? run.durationMs
      : Math.max(0, new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime());
  return `${ms} ms`;
}

function compactJson(value: unknown): string {
  if (value == null) {
    return "";
  }

  const text = JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

async function apiGet<T>(path: string): Promise<T> {
  return readJson<T>(await fetch(path));
}

async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return readJson<T>(
    await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function apiPut<T = unknown>(path: string, body: unknown): Promise<T> {
  return readJson<T>(
    await fetch(path, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function apiDelete<T = unknown>(path: string): Promise<T> {
  return readJson<T>(await fetch(path, { method: "DELETE" }));
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | { errorMessage?: string } | null;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "errorMessage" in payload
        ? payload.errorMessage
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}
