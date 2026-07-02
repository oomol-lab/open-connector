import type { AppData, AuthDefinition, CredentialField, ProviderDefinition } from "./model";
import type { FormEvent, ReactNode } from "react";

import { Check, ExternalLink, KeyRound, PlugZap, Search, Settings, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { apiDelete, apiPost, apiPut } from "./api";
import { credentialFieldsFor, filterProviders, sortProviders } from "./model";
import { Badge, EmptyState, InfoBlock, ProviderIcon, TagList } from "./shared-ui";

interface ProvidersPageProps {
  data: AppData;
  adminToken?: string;
  onRefresh(): void;
}

interface ProviderDetailProps {
  provider: ProviderDefinition;
  connection?: AppData["connections"][number];
  hasOAuthConfig: boolean;
  adminToken?: string;
  onRefresh(): void;
}

interface ConnectionFormProps {
  provider: ProviderDefinition;
  auth: AuthDefinition;
  adminToken?: string;
  onRefresh(): void;
}

interface OAuthConfigFormProps {
  provider: ProviderDefinition;
  hasConfig: boolean;
  adminToken?: string;
  onRefresh(): void;
}

type ProviderStatusFilter = "all" | "connected" | "not_connected" | "oauth_needs_config";

const providerPageSize = 120;

export function ProvidersPage(props: ProvidersPageProps): ReactNode {
  const params = useParams();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProviderStatusFilter>("all");
  const [visibleLimit, setVisibleLimit] = useState(providerPageSize);
  const connectionsByService = useMemo(
    () => new Map(props.data.connections.map((connection) => [connection.service, connection])),
    [props.data.connections],
  );
  const oauthConfigServices = useMemo(
    () => new Set(props.data.oauthConfigs.map((config) => config.service)),
    [props.data.oauthConfigs],
  );
  const sortedProviders = useMemo(
    () => sortProviders(props.data.providers, connectionsByService),
    [props.data.providers, connectionsByService],
  );
  const searchedProviders = filterProviders(sortedProviders, query);
  const visibleProviders = filterProvidersByStatus(
    searchedProviders,
    statusFilter,
    connectionsByService,
    oauthConfigServices,
  );
  const renderedProviders = visibleProviders.slice(0, visibleLimit);
  const routeProvider = params.service
    ? props.data.providers.find((provider) => provider.service === params.service)
    : undefined;
  const selectedProvider = params.service ? routeProvider : (visibleProviders[0] ?? null);
  const selectedInResults = selectedProvider
    ? visibleProviders.some((provider) => provider.service === selectedProvider.service)
    : false;
  const selectedIsRendered = selectedProvider
    ? renderedProviders.some((provider) => provider.service === selectedProvider.service)
    : false;
  const pinnedSelectedProvider = selectedProvider && selectedInResults && !selectedIsRendered ? selectedProvider : null;
  const hasMoreProviders = renderedProviders.length < visibleProviders.length;

  useEffect(() => {
    setVisibleLimit(providerPageSize);
  }, [query, statusFilter]);

  function renderProviderRow(provider: ProviderDefinition): ReactNode {
    const connected = connectionsByService.has(provider.service);
    const needsOAuthConfig = providerNeedsOAuthConfig(provider, oauthConfigServices);
    return (
      <Link
        key={provider.service}
        className={selectedProvider?.service === provider.service ? "provider-row active" : "provider-row"}
        to={`/providers/${provider.service}`}
      >
        <ProviderIcon provider={provider} />
        <span className="row-main">
          <span>{provider.displayName}</span>
          <small>
            {provider.service} · {provider.authTypes.join(", ") || "no auth"} · {provider.actions.length} actions
          </small>
        </span>
        {connected ? <Badge tone="success">Connected</Badge> : <Badge>Not connected</Badge>}
        {needsOAuthConfig ? <Badge tone="warning">OAuth config</Badge> : null}
      </Link>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search providers" />
        </label>
        <div className="segmented-control" role="tablist" aria-label="Provider status">
          {providerStatusOptions.map((option) => (
            <button
              key={option.id}
              className={statusFilter === option.id ? "segment active" : "segment"}
              onClick={() => setStatusFilter(option.id)}
              role="tab"
              aria-selected={statusFilter === option.id}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <div className="split-view">
        <section className="list-panel">
          {visibleProviders.length === 0 ? (
            <EmptyState title="No providers found" description="Try a different search or status filter." />
          ) : (
            <>
              {pinnedSelectedProvider ? (
                <div className="pinned-action">
                  <span>Current selection</span>
                  {renderProviderRow(pinnedSelectedProvider)}
                </div>
              ) : null}
              {renderedProviders.map((provider) => renderProviderRow(provider))}
              {hasMoreProviders ? (
                <div className="list-panel-footer">
                  <span>
                    Showing {renderedProviders.length} of {visibleProviders.length}
                  </span>
                  <button
                    className="secondary-button compact"
                    onClick={() => setVisibleLimit((value) => value + providerPageSize)}
                  >
                    Show more
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="detail-panel">
          {selectedProvider ? (
            <ProviderDetail
              provider={selectedProvider}
              connection={connectionsByService.get(selectedProvider.service)}
              hasOAuthConfig={oauthConfigServices.has(selectedProvider.service)}
              adminToken={props.adminToken}
              onRefresh={props.onRefresh}
            />
          ) : (
            <EmptyState
              title={params.service ? "Provider not found" : "Select a provider"}
              description={
                params.service
                  ? "The provider route does not match the current catalog."
                  : "Choose a provider to inspect connection settings."
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ProviderDetail(props: ProviderDetailProps): ReactNode {
  const [selectedAuthType, setSelectedAuthType] = useState(() => initialAuthType(props.provider, props.connection));
  const selectedAuth = props.provider.auth.find((auth) => auth.type === selectedAuthType) ?? props.provider.auth[0];
  const oauthAuth = props.provider.auth.find((auth) => auth.type === "oauth2");
  const hasMultipleAuthMethods = props.provider.auth.length > 1;

  useEffect(() => {
    setSelectedAuthType(initialAuthType(props.provider, props.connection));
  }, [props.provider.service, props.connection?.authType]);

  return (
    <>
      <div className="provider-detail-header">
        <div className="detail-heading">
          <ProviderIcon provider={props.provider} large />
          <div>
            <h2>{props.provider.displayName}</h2>
            <p>{props.provider.service}</p>
          </div>
        </div>
        {props.connection ? (
          <Badge tone="success">Connected by {props.connection.authType}</Badge>
        ) : (
          <Badge>Not connected</Badge>
        )}
      </div>

      <div className="section-grid provider-summary-grid">
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
        {hasMultipleAuthMethods ? (
          <div className="segmented-control auth-method-control" role="tablist" aria-label="Connection method">
            {props.provider.auth.map((auth) => (
              <button
                key={auth.type}
                className={selectedAuth?.type === auth.type ? "segment active" : "segment"}
                onClick={() => setSelectedAuthType(auth.type)}
                role="tab"
                aria-selected={selectedAuth?.type === auth.type}
              >
                {authLabel(auth)}
              </button>
            ))}
          </div>
        ) : null}
        {selectedAuth ? (
          <ConnectionForm
            key={selectedAuth.type}
            provider={props.provider}
            auth={selectedAuth}
            adminToken={props.adminToken}
            onRefresh={props.onRefresh}
          />
        ) : (
          <EmptyState title="No connection method" description="This provider does not need local credentials." />
        )}
      </div>

      {oauthAuth && shouldShowOAuthClientForm(selectedAuth) ? (
        <div className="panel-section">
          <h3>OAuth Client</h3>
          <OAuthConfigForm
            provider={props.provider}
            hasConfig={props.hasOAuthConfig}
            adminToken={props.adminToken}
            onRefresh={props.onRefresh}
          />
        </div>
      ) : null}

      <div className="panel-section">
        <h3>Scopes</h3>
        <TagList
          values={[...new Set(props.provider.actions.flatMap((action) => action.requiredScopes))]}
          empty="No scopes"
        />
      </div>

      <div className="panel-section">
        <h3>Actions</h3>
        {props.provider.actions.length === 0 ? (
          <p className="muted-copy">No actions.</p>
        ) : (
          <div className="linked-list">
            {props.provider.actions.map((action) => (
              <Link key={action.id} className="linked-row" to={`/actions/${action.id}`}>
                <span>
                  <strong>{action.name}</strong>
                  <small>{action.id}</small>
                </span>
                <Badge tone={action.execution.locallyExecutable ? "success" : undefined}>
                  {action.execution.locallyExecutable ? "Executable" : "Catalog only"}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function shouldShowOAuthClientForm(auth: AuthDefinition | undefined): boolean {
  return auth?.type === "oauth2";
}

export function shouldShowConnectionActions(auth: AuthDefinition): boolean {
  return auth.type !== "no_auth";
}

function initialAuthType(
  provider: ProviderDefinition,
  connection: AppData["connections"][number] | undefined,
): AuthDefinition["type"] | undefined {
  const connectedAuth = provider.auth.find((auth) => auth.type === connection?.authType);
  return (connectedAuth ?? provider.auth.find((auth) => auth.type === "api_key") ?? provider.auth[0])?.type;
}

function authLabel(auth: AuthDefinition): string {
  if (auth.type === "api_key") return "API key";
  if (auth.type === "oauth2") return "OAuth";
  if (auth.type === "custom_credential") return "Custom";
  return "No auth";
}

function ConnectionForm(props: ConnectionFormProps): ReactNode {
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const fields = credentialFieldsFor(props.auth);
  const showActions = shouldShowConnectionActions(props.auth);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus("Saving connection...");
    try {
      if (props.auth.type === "no_auth") {
        await apiPut(
          `/api/connections/${props.provider.service}`,
          { authType: "no_auth" },
          { adminToken: props.adminToken },
        );
      } else if (props.auth.type === "api_key") {
        await apiPut(
          `/api/connections/${props.provider.service}`,
          { authType: "api_key", values },
          { adminToken: props.adminToken },
        );
      } else if (props.auth.type === "custom_credential") {
        await apiPut(
          `/api/connections/${props.provider.service}`,
          { authType: "custom_credential", values },
          { adminToken: props.adminToken },
        );
      } else {
        const result = await apiPost<{ authorizationUrl?: string }>(
          `/api/oauth/authorizations`,
          { service: props.provider.service },
          { adminToken: props.adminToken },
        );
        if (result.authorizationUrl) {
          window.open(result.authorizationUrl, "_blank", "noopener,noreferrer");
        }
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
      await apiDelete(`/api/connections/${props.provider.service}`, { adminToken: props.adminToken });
      setStatus("Disconnected.");
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Disconnect failed.");
    }
  }

  return (
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      {props.auth.type === "no_auth" ? (
        <p className="muted-copy">This provider runs without local credentials.</p>
      ) : null}
      {props.auth.type === "oauth2" ? (
        <p className="muted-copy">Start OAuth after saving the local OAuth client configuration.</p>
      ) : null}
      {fields.map((field) => (
        <CredentialInput
          key={field.key}
          field={field}
          value={values[field.key] ?? ""}
          onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
        />
      ))}
      {showActions ? (
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
      ) : null}
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
      await apiPut(
        `/api/oauth/configs/${props.provider.service}`,
        {
          clientId,
          clientSecret,
          extra: {},
        },
        { adminToken: props.adminToken },
      );
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

function CredentialInput(props: { field: CredentialField; value: string; onChange(value: string): void }): ReactNode {
  return (
    <label className="field">
      <span>{props.field.label}</span>
      {props.field.inputType === "textarea" || props.field.inputType === "json" ? (
        <textarea
          className="json-input compact"
          value={props.value}
          placeholder={props.field.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
          spellCheck={false}
        />
      ) : (
        <input
          type={props.field.secret ? "password" : "text"}
          placeholder={props.field.placeholder}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
      {props.field.description ? <small>{props.field.description}</small> : null}
    </label>
  );
}

function filterProvidersByStatus(
  providers: ProviderDefinition[],
  status: ProviderStatusFilter,
  connectionsByService: Map<string, AppData["connections"][number]>,
  oauthConfigServices: Set<string>,
): ProviderDefinition[] {
  if (status === "all") return providers;
  return providers.filter((provider) => {
    const connected = connectionsByService.has(provider.service);
    if (status === "connected") return connected;
    if (status === "not_connected") return !connected;
    return providerNeedsOAuthConfig(provider, oauthConfigServices);
  });
}

function providerNeedsOAuthConfig(provider: ProviderDefinition, oauthConfigServices: Set<string>): boolean {
  return provider.auth.some((auth) => auth.type === "oauth2") && !oauthConfigServices.has(provider.service);
}

const providerStatusOptions: Array<{ id: ProviderStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "connected", label: "Connected" },
  { id: "not_connected", label: "Not connected" },
  { id: "oauth_needs_config", label: "OAuth needs config" },
];
