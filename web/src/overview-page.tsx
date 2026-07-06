import type { AppData, ProviderDefinition } from "./model";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { Activity, Cable, RefreshCw, TerminalSquare } from "lucide-react";
import { Link } from "react-router";
import { compactJson, createOverviewSummary, formatDate, formatDuration, sortProviders } from "./model";
import { Badge, EmptyState, ProviderIcon } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface OverviewPageProps {
  data: AppData;
  onRefresh(): void;
}

interface CapabilityStatusCellProps {
  icon: LucideIcon;
  providerIcons?: ProviderDefinition[];
  label: string;
  value: string;
  meta: string;
  badgeLabel: string;
  badgeTone: CapabilityStatusBadgeTone;
  to: string;
}

type CapabilityStatusBadgeTone = "success" | "warning";

const capabilityProviderIconLimit = 4;

export function OverviewPage(props: OverviewPageProps): ReactNode {
  const t = useTranslate();
  const summary = createOverviewSummary(props.data);
  const recentRuns = props.data.runs.slice(0, 6);
  const connectionsByService = new Map(props.data.connections.map((connection) => [connection.service, connection]));
  const providerIconSources = sortProviders(props.data.providers, connectionsByService).slice(
    0,
    capabilityProviderIconLimit,
  );
  const capabilityCells: CapabilityStatusCellProps[] = [
    {
      icon: Cable,
      providerIcons: providerIconSources,
      label: t("overview.metrics.providers"),
      value: String(summary.providerCount),
      meta: t("overview.availableServices"),
      badgeLabel: summary.providerCount > 0 ? t("overview.ready") : t("overview.unavailable"),
      badgeTone: summary.providerCount > 0 ? "success" : "warning",
      to: "/providers",
    },
    {
      icon: TerminalSquare,
      label: t("overview.metrics.executable"),
      value: String(summary.locallyExecutableActionCount),
      meta: t("overview.localActions"),
      badgeLabel: summary.locallyExecutableActionCount > 0 ? t("overview.ready") : t("overview.unavailable"),
      badgeTone: summary.locallyExecutableActionCount > 0 ? "success" : "warning",
      to: "/actions",
    },
    {
      icon: Activity,
      label: t("overview.metrics.runHealth"),
      value: String(summary.failedRunCount),
      meta: t("overview.recentFailuresMeta"),
      badgeLabel: summary.failedRunCount === 0 ? t("overview.ready") : t("overview.needsAttention"),
      badgeTone: summary.failedRunCount === 0 ? "success" : "warning",
      to: "/runs",
    },
  ];

  return (
    <div className="page-stack overview-page">
      <Card className="runtime-strip">
        <div>
          <strong>{t("overview.runtimeReady")}</strong>
          <span>{t("overview.connectedProviders", { count: summary.connectedCount })}</span>
        </div>
        <Button variant="outline" size="sm" onClick={props.onRefresh}>
          <RefreshCw size={15} />
          {t("common.refresh")}
        </Button>
      </Card>

      <section className="content-grid">
        <Card className="detail-panel overview-capability-panel">
          <div className="section-heading-row">
            <h2>{t("overview.capabilityStatus")}</h2>
          </div>
          <div className="overview-capability-grid">
            {capabilityCells.map((cell) => (
              <CapabilityStatusCell
                key={cell.to}
                icon={cell.icon}
                providerIcons={cell.providerIcons}
                label={cell.label}
                value={cell.value}
                meta={cell.meta}
                badgeLabel={cell.badgeLabel}
                badgeTone={cell.badgeTone}
                to={cell.to}
              />
            ))}
          </div>
        </Card>
      </section>

      <section className="content-grid overview-recent-runs-section">
        <Card className="table-panel overview-recent-runs-panel">
          <div className="table-panel-heading">
            <h2>{t("overview.recentRuns")}</h2>
            <Button asChild variant="outline" size="sm">
              <Link to="/runs">
                <Activity size={15} />
                {t("nav.runs")}
              </Link>
            </Button>
          </div>
          {recentRuns.length === 0 ? (
            <EmptyState
              title={t("overview.noRunsTitle")}
              description={t("overview.noRunsDescription")}
              icon={null}
              density="compact"
            />
          ) : (
            <RunSummaryTable runs={recentRuns} />
          )}
        </Card>
      </section>
    </div>
  );
}

function CapabilityStatusCell(props: CapabilityStatusCellProps): ReactNode {
  return (
    <Link className="overview-capability-cell" to={props.to}>
      <div className="overview-capability-cell-header">
        <CapabilityStatusIcon icon={props.icon} providers={props.providerIcons} />
        <span className={`overview-capability-badge ${props.badgeTone}`}>{props.badgeLabel}</span>
      </div>
      <div className="overview-capability-cell-body">
        <span className="overview-capability-label">{props.label}</span>
        <strong className="overview-capability-value">{props.value}</strong>
        <span className="overview-capability-meta">{props.meta}</span>
      </div>
    </Link>
  );
}

function CapabilityStatusIcon(props: { icon: LucideIcon; providers?: ProviderDefinition[] }): ReactNode {
  const Icon = props.icon;
  const providers = props.providers?.slice(0, capabilityProviderIconLimit) ?? [];

  if (providers.length === 0) {
    return (
      <span className="overview-capability-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
    );
  }

  return (
    <span className="overview-capability-icon-shell" aria-hidden="true">
      <span className="overview-capability-icon overview-capability-static-icon">
        <Icon size={18} />
      </span>
      <span className="overview-capability-provider-icons">
        {providers.map((provider) => (
          <span key={provider.service} className="overview-capability-provider-icon">
            <ProviderIcon provider={provider} />
          </span>
        ))}
      </span>
    </span>
  );
}

function RunSummaryTable(props: { runs: AppData["runs"] }): ReactNode {
  const t = useTranslate();
  return (
    <Table className="summary-table">
      <TableHeader>
        <TableRow>
          <TableHead>{t("overview.table.action")}</TableHead>
          <TableHead>{t("overview.table.status")}</TableHead>
          <TableHead>{t("overview.table.started")}</TableHead>
          <TableHead>{t("overview.table.duration")}</TableHead>
          <TableHead>{t("overview.table.input")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.runs.map((run) => (
          <TableRow key={run.id}>
            <TableCell className="mono">{run.actionId}</TableCell>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
