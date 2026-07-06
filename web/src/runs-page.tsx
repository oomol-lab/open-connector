import type { RunLog, RunLogPage } from "./model";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { compactJson, formatDate, formatDuration } from "./model";
import { Badge, EmptyState, InlineError } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface RunsPageProps {
  initialRuns: RunLog[];
  nextCursor?: string;
}

export function RunsPage(props: RunsPageProps): ReactNode {
  const t = useTranslate();
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
      const page = await apiGet<RunLogPage>(`/api/runs?${query}`);
      setRuns((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setRunsError(caught instanceof Error ? caught.message : t("runs.loadMoreFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  if (runs.length === 0) {
    return <EmptyState title={t("runs.noRunsTitle")} description={t("runs.noRunsDescription")} icon={null} />;
  }

  return (
    <>
      <section className="table-panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("runs.table.action")}</TableHead>
              <TableHead>{t("runs.table.caller")}</TableHead>
              <TableHead>{t("runs.table.status")}</TableHead>
              <TableHead>{t("runs.table.started")}</TableHead>
              <TableHead>{t("runs.table.duration")}</TableHead>
              <TableHead>{t("runs.table.input")}</TableHead>
              <TableHead>{t("runs.table.error")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="mono">{run.actionId}</TableCell>
                <TableCell className="mono">{run.caller}</TableCell>
                <TableCell>
                  {run.ok ? (
                    <Badge tone="success">{t("common.success")}</Badge>
                  ) : (
                    <Badge tone="error">{t("common.failed")}</Badge>
                  )}
                </TableCell>
                <TableCell>{formatDate(run.startedAt)}</TableCell>
                <TableCell>{formatDuration(run)}</TableCell>
                <TableCell className="mono">{compactJson(run.inputSummary)}</TableCell>
                <TableCell>{run.errorMessage ?? run.errorCode ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      {runsError ? <InlineError message={runsError} /> : null}
      {nextCursor ? (
        <div className="table-footer">
          <Button variant="outline" size="sm" onClick={() => void loadMoreRuns()} disabled={loadingMore}>
            {loadingMore ? <Loader2 size={14} className="spin" /> : null}
            {t("runs.loadMore")}
          </Button>
        </div>
      ) : null}
    </>
  );
}
