import type { AppData } from "./model";
import type { ReactNode } from "react";

import { Activity, AppWindow, FileText, KeyRound, PlugZap, RefreshCw, TerminalSquare } from "lucide-react";
import { Link } from "react-router";
import { compactJson, createOverviewSummary, formatDate, formatDuration } from "./model";
import { Badge, EmptyState, InfoBlock, Metric } from "./shared-ui";

interface OverviewPageProps {
  data: AppData;
  onRefresh(): void;
}

export function OverviewPage(props: OverviewPageProps): ReactNode {
  const summary = createOverviewSummary(props.data);
  const recentRuns = props.data.runs.slice(0, 6);

  return (
    <div className="page-stack">
      <section className="runtime-strip">
        <div>
          <strong>Runtime ready</strong>
          <span>{summary.connectedCount} connected providers</span>
        </div>
        <button className="secondary-button compact" onClick={props.onRefresh}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </section>

      <section className="metrics">
        <Metric label="Providers" value={summary.providerCount} />
        <Metric label="Actions" value={summary.actionCount} />
        <Metric label="Connected" value={summary.connectedCount} />
        <Metric label="Tokens" value={summary.activeTokenCount} />
      </section>

      <section className="content-grid">
        <div className="detail-panel">
          <div className="section-heading-row">
            <h2>Connection Health</h2>
            <Link className="secondary-link" to="/providers">
              <PlugZap size={15} />
              Providers
            </Link>
          </div>
          <div className="section-grid">
            <InfoBlock icon={<AppWindow size={18} />} label="Catalog" value={`${summary.providerCount} providers`} />
            <InfoBlock icon={<PlugZap size={18} />} label="Connected" value={`${summary.connectedCount} active`} />
            <InfoBlock
              icon={<TerminalSquare size={18} />}
              label="Executable"
              value={`${props.data.providers.flatMap((provider) => provider.actions).filter((action) => action.execution.locallyExecutable).length} actions`}
            />
          </div>
        </div>

        <div className="detail-panel">
          <div className="section-heading-row">
            <h2>Common Entries</h2>
          </div>
          <div className="quick-link-grid">
            <Link className="quick-link" to="/providers">
              <PlugZap size={16} />
              Connect provider
            </Link>
            <Link className="quick-link" to="/actions">
              <TerminalSquare size={16} />
              Search actions
            </Link>
            <Link className="quick-link" to="/access">
              <KeyRound size={16} />
              Create token
            </Link>
            <Link className="quick-link" to="/resources">
              <FileText size={16} />
              Open docs
            </Link>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="table-panel">
          <div className="table-panel-heading">
            <h2>Recent Failures</h2>
            <Badge tone={summary.failedRuns.length ? "error" : "success"}>{summary.failedRuns.length}</Badge>
          </div>
          {summary.failedRuns.length === 0 ? (
            <EmptyState title="No failed runs" description="Recent action runs are clean." />
          ) : (
            <RunSummaryTable runs={summary.failedRuns} />
          )}
        </div>

        <div className="table-panel">
          <div className="table-panel-heading">
            <h2>Recent Runs</h2>
            <Link className="secondary-link" to="/runs">
              <Activity size={15} />
              Runs
            </Link>
          </div>
          {recentRuns.length === 0 ? (
            <EmptyState title="No runs yet" description="Run an action to see execution history." />
          ) : (
            <RunSummaryTable runs={recentRuns} />
          )}
        </div>
      </section>
    </div>
  );
}

function RunSummaryTable(props: { runs: AppData["runs"] }): ReactNode {
  return (
    <table>
      <thead>
        <tr>
          <th>Action</th>
          <th>Status</th>
          <th>Started</th>
          <th>Duration</th>
          <th>Input</th>
        </tr>
      </thead>
      <tbody>
        {props.runs.map((run) => (
          <tr key={run.id}>
            <td className="mono">{run.actionId}</td>
            <td>{run.ok ? <Badge tone="success">Success</Badge> : <Badge tone="error">Failed</Badge>}</td>
            <td>{formatDate(run.startedAt)}</td>
            <td>{formatDuration(run)}</td>
            <td className="mono">{compactJson(run.inputSummary)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
