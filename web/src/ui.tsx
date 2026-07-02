import type {
  AppData,
  ConnectionRecord,
  OAuthConfig,
  ProviderDefinition,
  RunLogPage,
  RuntimeTokenSummary,
} from "./model";
import type { FormEvent, ReactNode } from "react";

import { Activity, AppWindow, BookOpen, KeyRound, Loader2, RefreshCw, TerminalSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router";
import { AccessPage } from "./access-page";
import { ActionsPage } from "./actions-page";
import { ApiError, apiGet } from "./api";
import { emptyData } from "./model";
import { OverviewPage } from "./overview-page";
import { ProvidersPage } from "./providers-page";
import { ResourcesPage } from "./resources-page";
import { RunsPage } from "./runs-page";
import { InlineError, StatusDot } from "./shared-ui";

const navItems = [
  { path: "/overview", label: "Overview", icon: Activity },
  { path: "/providers", label: "Providers", icon: AppWindow },
  { path: "/actions", label: "Actions", icon: TerminalSquare },
  { path: "/runs", label: "Runs", icon: Activity },
  { path: "/access", label: "Access", icon: KeyRound },
  { path: "/resources", label: "Docs", icon: BookOpen },
] as const;

export function App(): ReactNode {
  const [data, setData] = useState<AppData>(emptyData);
  const [adminToken, setAdminToken] = useState("");
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiGet<ProviderDefinition[]>("/api/providers", { adminToken }),
      apiGet<ConnectionRecord[]>("/api/connections", { adminToken }),
      apiGet<OAuthConfig[]>("/api/oauth/configs", { adminToken }),
      apiGet<RuntimeTokenSummary[]>("/api/runtime-tokens", { adminToken }),
      apiGet<RunLogPage>("/api/runs", { adminToken }),
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
          setLocked(false);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        if (caught instanceof ApiError && caught.status === 401) {
          setData(emptyData);
          setLocked(true);
          setError(adminToken.trim() ? "Admin token is invalid or missing." : null);
          return;
        }
        setError(caught instanceof Error ? caught.message : "Failed to load runtime data.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [adminToken, refreshToken]);

  function refresh(): void {
    setRefreshToken((value) => value + 1);
  }

  function unlock(token: string): void {
    setAdminToken(token);
    setLocked(false);
    setError(null);
    refresh();
  }

  function clearClientToken(): void {
    setAdminToken("");
    refresh();
  }

  if (locked) {
    return <UnlockView loading={loading} message={error} onUnlock={unlock} />;
  }

  return (
    <AppShell
      data={data}
      adminToken={adminToken}
      loading={loading}
      error={error}
      onRefresh={refresh}
      onClearClientToken={clearClientToken}
    />
  );
}

function AppShell(props: {
  data: AppData;
  adminToken: string;
  loading: boolean;
  error: string | null;
  onRefresh(): void;
  onClearClientToken(): void;
}): ReactNode {
  const location = useLocation();
  const actions = useMemo(() => props.data.providers.flatMap((provider) => provider.actions), [props.data.providers]);
  const heading = headingForPath(location.pathname);
  const section = location.pathname.split("/").filter(Boolean)[0];
  const isBrowserPage = section === "actions" || section === "providers";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">OC</div>
          <div>
            <div className="brand-name">OOMOL Connect</div>
            <div className="brand-subtitle">Local runtime console</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
                to={item.path}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="runtime-status">
            <StatusDot ok={!props.error} />
            <span>{props.error ? "API unavailable" : "Runtime ready"}</span>
          </div>
          <div className="button-row tight">
            <button className="icon-button compact" onClick={props.onRefresh} aria-label="Refresh data">
              {props.loading ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
            </button>
            {props.adminToken ? (
              <button className="secondary-button compact" onClick={props.onClearClientToken}>
                Clear typed token
              </button>
            ) : null}
          </div>
        </div>
      </aside>

      <main className={isBrowserPage ? "main main-browser" : "main"}>
        <section className="page-header">
          <div>
            <h1>{heading.title}</h1>
            <p>{heading.subtitle}</p>
          </div>
          {props.loading ? (
            <div className="loading-panel page-loading">
              <Loader2 className="spin" size={16} />
              Loading runtime data...
            </div>
          ) : null}
        </section>

        {props.error ? <InlineError message={props.error} /> : null}

        <Routes>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage data={props.data} onRefresh={props.onRefresh} />} />
          <Route
            path="/providers"
            element={<ProvidersPage data={props.data} adminToken={props.adminToken} onRefresh={props.onRefresh} />}
          />
          <Route
            path="/providers/:service"
            element={<ProvidersPage data={props.data} adminToken={props.adminToken} onRefresh={props.onRefresh} />}
          />
          <Route
            path="/actions"
            element={<ActionsPage data={props.data} adminToken={props.adminToken} onRefresh={props.onRefresh} />}
          />
          <Route
            path="/actions/:actionId"
            element={<ActionsPage data={props.data} adminToken={props.adminToken} onRefresh={props.onRefresh} />}
          />
          <Route
            path="/runs"
            element={
              <RunsPage
                initialRuns={props.data.runs}
                nextCursor={props.data.runsNextCursor}
                adminToken={props.adminToken}
              />
            }
          />
          <Route
            path="/access"
            element={
              <AccessPage tokens={props.data.runtimeTokens} adminToken={props.adminToken} onRefresh={props.onRefresh} />
            }
          />
          <Route path="/resources" element={<ResourcesPage actions={actions} />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function UnlockView(props: { loading: boolean; message: string | null; onUnlock(token: string): void }): ReactNode {
  const [token, setToken] = useState("");

  function submit(event: FormEvent): void {
    event.preventDefault();
    props.onUnlock(token.trim());
  }

  return (
    <main className="unlock-screen">
      <section className="unlock-panel">
        <div className="brand">
          <div className="brand-mark">OC</div>
          <div>
            <div className="brand-name">OOMOL Connect</div>
            <div className="brand-subtitle">Admin access</div>
          </div>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label className="field">
            <span>Admin token</span>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </label>
          <button className="primary-button" type="submit" disabled={!token.trim() || props.loading}>
            {props.loading ? <Loader2 className="spin" size={16} /> : null}
            Unlock console
          </button>
        </form>
        {props.message ? <InlineError message={props.message} /> : null}
      </section>
    </main>
  );
}

function headingForPath(pathname: string): { title: string; subtitle: string } {
  const section = pathname.split("/").filter(Boolean)[0];
  if (section === "providers") {
    return { title: "Providers", subtitle: "Connect providers and review provider capabilities." };
  }
  if (section === "actions") {
    return { title: "Actions", subtitle: "Search, inspect, and debug local runtime actions." };
  }
  if (section === "runs") {
    return { title: "Runs", subtitle: "Recent local action executions." };
  }
  if (section === "access") {
    return { title: "Access", subtitle: "Manage runtime API tokens for agents and clients." };
  }
  if (section === "resources") {
    return { title: "Resources", subtitle: "Generated API references and tool metadata." };
  }
  return { title: "Overview", subtitle: "Runtime status, health, and common operations." };
}
