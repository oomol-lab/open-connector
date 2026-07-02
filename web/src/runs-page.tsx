import type { RunLog, RunLogPage } from "./model";
import type { ReactNode } from "react";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { compactJson, formatDate, formatDuration } from "./model";
import { Badge, EmptyState, InlineError } from "./shared-ui";

interface RunsPageProps {
  initialRuns: RunLog[];
  nextCursor?: string;
  adminToken?: string;
}

export function RunsPage(props: RunsPageProps): ReactNode {
  const [runs, setRuns] = useState(props.initialRuns);
  const [nextCursor, setNextCursor] = useState(props.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);

  useEffect(() => {
    setRuns(props.initialRuns);
    setNextCursor(props.nextCursor);
    setRunsError(null);
  }, [props.initialRuns, props.nextCursor]);

  async function loadMoreRuns(): Promise<void> {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setRunsError(null);
    try {
      const query = new URLSearchParams({ limit: "50", cursor: nextCursor });
      const page = await apiGet<RunLogPage>(`/api/runs?${query}`, { adminToken: props.adminToken });
      setRuns((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setRunsError(caught instanceof Error ? caught.message : "Failed to load more runs.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (runs.length === 0) {
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
            {runs.map((run) => (
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
      {runsError ? <InlineError message={runsError} /> : null}
      {nextCursor ? (
        <div className="table-footer">
          <button className="secondary-button compact" onClick={() => void loadMoreRuns()} disabled={loadingMore}>
            {loadingMore ? <Loader2 size={14} className="spin" /> : null}
            Load more
          </button>
        </div>
      ) : null}
    </>
  );
}
