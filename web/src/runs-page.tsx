import type { RunLog, RunLogPage } from "./model";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { apiGet } from "./api";
import { compactJson, formatDate, formatDuration } from "./model";
import { Badge, EmptyState, InlineError } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface RunsPageProps {
  initialRuns: RunLog[];
  nextCursor?: string;
}

interface RunServiceOption {
  service: string;
  count: number;
}

const allServicesFilterValue = "__all_services__";
const runPageLimit = 50;

export function RunsPage(props: RunsPageProps): ReactNode {
  const t = useTranslate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryService = runServiceFromSearchParams(searchParams);
  const [runs, setRuns] = useState(props.initialRuns);
  const [nextCursor, setNextCursor] = useState(props.nextCursor);
  const [selectedService, setSelectedService] = useState<string | null>(queryService);
  const [loadingMore, setLoadingMore] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const serviceLoadRequestId = useRef(0);
  const serviceOptions = useMemo(
    () => runServiceOptions(selectedService ? props.initialRuns : runs),
    [props.initialRuns, runs, selectedService],
  );

  useEffect(() => {
    setRuns(props.initialRuns);
    setNextCursor(props.nextCursor);
    setSelectedService(queryService);
    setRunsError(null);
    if (queryService) {
      void loadRunsForService(queryService, ++serviceLoadRequestId.current);
    } else {
      serviceLoadRequestId.current += 1;
      setLoadingMore(false);
    }
  }, [props.initialRuns, props.nextCursor, queryService]);

  async function loadMoreRuns(): Promise<void> {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setRunsError(null);
    try {
      const page = await apiGet<RunLogPage>(runListPath({ cursor: nextCursor, service: selectedService }));
      setRuns((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setRunsError(caught instanceof Error ? caught.message : t("runs.loadMoreFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadRunsForService(service: string, requestId: number): Promise<void> {
    setLoadingMore(true);
    try {
      const page = await apiGet<RunLogPage>(runListPath({ service }));
      if (requestId !== serviceLoadRequestId.current) return;
      setRuns(page.items);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      if (requestId !== serviceLoadRequestId.current) return;
      setRunsError(caught instanceof Error ? caught.message : t("runs.loadMoreFailed"));
    } finally {
      if (requestId === serviceLoadRequestId.current) {
        setLoadingMore(false);
      }
    }
  }

  function selectService(value: string): void {
    const service = value === allServicesFilterValue ? null : value;
    setSelectedService(service);
    setRunsError(null);
    const nextSearchParams = new URLSearchParams(searchParams);

    if (!service) {
      serviceLoadRequestId.current += 1;
      nextSearchParams.delete("service");
      setSearchParams(nextSearchParams);
      setRuns(props.initialRuns);
      setNextCursor(props.nextCursor);
      setLoadingMore(false);
      return;
    }

    nextSearchParams.set("service", service);
    setSearchParams(nextSearchParams);
  }

  if (props.initialRuns.length === 0) {
    return <EmptyState title={t("runs.noRunsTitle")} description={t("runs.noRunsDescription")} icon={null} />;
  }

  return (
    <>
      <section className="page-toolbar runs-toolbar">
        <div className="select-filter">
          <span className="select-filter-label">{t("runs.service")}</span>
          <Select
            value={selectedService ?? allServicesFilterValue}
            onValueChange={selectService}
            disabled={loadingMore}
          >
            <SelectTrigger className="select-filter-trigger" size="sm" aria-label={t("runs.service")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="select-filter-content" position="popper" align="start">
              <SelectItem value={allServicesFilterValue}>{t("runs.allServices")}</SelectItem>
              {serviceOptions.map((option) => (
                <SelectItem key={option.service} value={option.service}>
                  {option.service} ({option.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>
      <section className="table-panel">
        {runs.length === 0 ? (
          <EmptyState title={t("runs.noRunsTitle")} description={t("runs.noRunsDescription")} icon={null} />
        ) : (
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
        )}
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

export function runServiceOptions(runs: RunLog[]): RunServiceOption[] {
  const counts = new Map<string, number>();

  for (const run of runs) {
    const service = runService(run);
    counts.set(service, (counts.get(service) ?? 0) + 1);
  }

  return [...counts.entries()].map(([service, count]) => ({ service, count }));
}

export function runListPath(input: { cursor?: string; service?: string | null }): string {
  const query = new URLSearchParams({ limit: String(runPageLimit) });
  if (input.cursor) {
    query.set("cursor", input.cursor);
  }
  if (input.service) {
    query.set("service", input.service);
  }
  return `/api/runs?${query}`;
}

export function runServiceFromSearchParams(searchParams: URLSearchParams): string | null {
  return searchParams.get("service")?.trim() || null;
}

function runService(run: RunLog): string {
  return run.service;
}
