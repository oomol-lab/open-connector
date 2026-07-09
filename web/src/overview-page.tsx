import type { AppData, ProviderDefinition } from "./model";
import type { ChartConfig } from "@/components/ui/chart";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { Activity, ArrowRight, ArrowUpRight, Cable, RefreshCw, TerminalSquare } from "lucide-react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { createOverviewSummary, sortProviders } from "./model";
import { EmptyState, ProviderIcon } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

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
const recentCallLimit = 7;
const callTrendDayCount = 30;
const callTrendServiceLimit = 4;
const callTrendColors = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;

export function OverviewPage(props: OverviewPageProps): ReactNode {
  const t = useTranslate();
  const summary = createOverviewSummary(props.data);
  const callTrend = createCallTrend(props.data);
  const recentCalls = createRecentCalls(props.data);
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

      <section className="content-grid overview-activity-grid">
        <Card className="list-panel overview-call-trend-panel">
          <div className="table-panel-heading">
            <h2>{t("overview.callTrend")}</h2>
            <Button asChild variant="outline" size="sm">
              <Link to="/runs">
                {t("overview.viewRuns")}
                <ArrowUpRight size={15} />
              </Link>
            </Button>
          </div>
          {callTrend.series.length === 0 ? (
            <EmptyState
              title={t("overview.noCallTrendTitle")}
              description={t("overview.noCallTrendDescription")}
              icon={null}
              density="compact"
            />
          ) : (
            <div className="overview-call-trend-body">
              <ChartContainer config={callTrend.config} className="overview-call-trend-chart">
                <BarChart data={callTrend.days} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="tick" axisLine={false} tickLine={false} tickMargin={10} minTickGap={18} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tickMargin={10} width={32} />
                  <ChartTooltip
                    cursor={{ fill: "color-mix(in oklab, var(--muted) 56%, transparent)" }}
                    isAnimationActive={false}
                    useTranslate3d
                    content={
                      <ChartTooltipContent
                        hideZero
                        valueFormatter={(value) => {
                          const count = Number(value);
                          return count === 1
                            ? t("overview.callCountOne", { count })
                            : t("overview.callCountMany", { count });
                        }}
                      />
                    }
                  />
                  {callTrend.series.map((series) => (
                    <Bar
                      key={series.service}
                      dataKey={series.dataKey}
                      barSize={12}
                      fill={`var(--color-${series.dataKey})`}
                      activeBar={{ fillOpacity: 0.78 }}
                      isAnimationActive={false}
                      stackId="calls"
                    />
                  ))}
                </BarChart>
              </ChartContainer>
              <div className="overview-call-trend-legend" aria-label={t("overview.callTrendLegend")}>
                {callTrend.series.map((series) => (
                  <div key={series.service} className="overview-call-trend-legend-row">
                    <span className="overview-call-trend-swatch" style={{ backgroundColor: series.color }} />
                    <span>{series.name}</span>
                    <strong>
                      {series.total === 1
                        ? t("overview.callCountOne", { count: series.total })
                        : t("overview.callCountMany", { count: series.total })}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="list-panel overview-recent-calls-panel">
          <div className="table-panel-heading">
            <h2>{t("overview.recentCalls")}</h2>
            <Button asChild variant="outline" size="sm">
              <Link to="/runs">
                {t("overview.viewRuns")}
                <ArrowUpRight size={15} />
              </Link>
            </Button>
          </div>
          {recentCalls.length === 0 ? (
            <EmptyState
              title={t("overview.noRecentCallsTitle")}
              description={t("overview.noRecentCallsDescription")}
              icon={null}
              density="compact"
            />
          ) : (
            <div className="overview-recent-call-list">
              {recentCalls.map((call) => (
                <Link
                  key={call.service}
                  className="overview-recent-call-row"
                  to={`/runs?service=${encodeURIComponent(call.service)}`}
                >
                  <span className="overview-recent-call-provider">
                    {call.provider ? (
                      <ProviderIcon provider={call.provider} />
                    ) : (
                      <span className="overview-recent-call-fallback-icon" aria-hidden="true">
                        <Activity size={18} />
                      </span>
                    )}
                    <span className="overview-recent-call-copy">
                      <strong>{call.name}</strong>
                      <span>
                        {call.count === 1
                          ? t("overview.callCountOne", { count: call.count })
                          : t("overview.callCountMany", { count: call.count })}
                      </span>
                    </span>
                  </span>
                  <span className="overview-recent-call-count">{call.count}</span>
                  <span className="overview-recent-call-arrow" aria-hidden="true">
                    <ArrowRight size={18} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

interface CallTrend {
  days: CallTrendDay[];
  series: CallTrendSeries[];
  config: ChartConfig;
}

interface CallTrendDay {
  dateKey: string;
  tick: string;
  [seriesKey: string]: string | number;
}

interface CallTrendSeries {
  service: string;
  dataKey: string;
  name: string;
  total: number;
  color: string;
}

interface RecentCall {
  service: string;
  name: string;
  count: number;
  provider?: ProviderDefinition;
}

function createCallTrend(data: AppData): CallTrend {
  const providers = new Map(data.providers.map((provider) => [provider.service, provider]));
  const endDate = getCallTrendEndDate(data.runs);
  const startDate = addLocalDays(endDate, 1 - callTrendDayCount);
  const days: CallTrendDay[] = [];
  const serviceTotals = new Map<string, number>();
  const serviceDayCounts = new Map<string, Map<string, number>>();

  for (let index = 0; index < callTrendDayCount; index += 1) {
    const date = addLocalDays(startDate, index);
    days.push({
      dateKey: formatLocalDateKey(date),
      tick: formatCallTrendTick(date),
    });
  }

  const dayKeys = new Set(days.map((day) => day.dateKey));
  for (const run of data.runs) {
    const date = startOfLocalDay(new Date(run.startedAt));
    const dateKey = formatLocalDateKey(date);
    if (!dayKeys.has(dateKey)) continue;

    serviceTotals.set(run.service, (serviceTotals.get(run.service) ?? 0) + 1);

    let dayCounts = serviceDayCounts.get(run.service);
    if (!dayCounts) {
      dayCounts = new Map();
      serviceDayCounts.set(run.service, dayCounts);
    }
    dayCounts.set(dateKey, (dayCounts.get(dateKey) ?? 0) + 1);
  }

  const series = [...serviceTotals.entries()]
    .sort((left, right) => {
      const countDiff = right[1] - left[1];
      if (countDiff !== 0) return countDiff;
      return displayNameForService(providers, left[0]).localeCompare(displayNameForService(providers, right[0]));
    })
    .slice(0, callTrendServiceLimit)
    .map(([service, total], index): CallTrendSeries => {
      const dataKey = `series${index + 1}`;
      return {
        service,
        dataKey,
        name: displayNameForService(providers, service),
        total,
        color: callTrendColors[index] ?? "var(--chart-1)",
      };
    });

  for (const day of days) {
    for (const item of series) {
      day[item.dataKey] = serviceDayCounts.get(item.service)?.get(day.dateKey) ?? 0;
    }
  }

  return {
    days,
    series,
    config: Object.fromEntries(series.map((item) => [item.dataKey, { label: item.name, color: item.color }])),
  };
}

function createRecentCalls(data: AppData): RecentCall[] {
  const providers = new Map(data.providers.map((provider) => [provider.service, provider]));
  const calls = new Map<string, RecentCall>();

  for (const run of data.runs) {
    const service = run.service;
    const existing = calls.get(service);
    if (existing) {
      existing.count += 1;
      continue;
    }

    const provider = providers.get(service);
    calls.set(service, {
      service,
      name: provider?.displayName ?? service,
      count: 1,
      provider,
    });
  }

  return [...calls.values()].slice(0, recentCallLimit);
}

function getCallTrendEndDate(runs: AppData["runs"]): Date {
  let endDate = startOfLocalDay(new Date());
  for (const run of runs) {
    const date = startOfLocalDay(new Date(run.startedAt));
    if (date.getTime() > endDate.getTime()) {
      endDate = date;
    }
  }
  return endDate;
}

function displayNameForService(providers: Map<string, ProviderDefinition>, service: string): string {
  return providers.get(service)?.displayName ?? service;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function formatCallTrendTick(date: Date): string {
  return `${padDatePart(date.getMonth() + 1)}/${padDatePart(date.getDate())}`;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
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
