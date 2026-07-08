import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/utils";

export interface ChartConfig {
  [key: string]: {
    label?: React.ReactNode;
    color?: string;
  };
}

interface ChartContextValue {
  config: ChartConfig;
}

export interface ChartContainerProps extends React.ComponentProps<"div"> {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}

const ChartContext = React.createContext<ChartContextValue | null>(null);
const ChartTooltip = RechartsPrimitive.Tooltip;

interface ChartTooltipPayloadItem {
  dataKey?: unknown;
  name?: unknown;
  value?: unknown;
  color?: string;
  fill?: string;
  hide?: boolean;
}

interface ChartTooltipContentProps {
  active?: boolean;
  label?: React.ReactNode;
  payload?: readonly ChartTooltipPayloadItem[];
  className?: string;
  config?: ChartConfig;
  hideZero?: boolean;
  valueFormatter?: (value: unknown) => React.ReactNode;
}

export function useChart(): ChartContextValue {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within a ChartContainer");
  }

  return context;
}

export function ChartContainer({ id, className, children, config, ...props }: ChartContainerProps): React.ReactElement {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div data-slot="chart" data-chart={chartId} className={cn("w-full", className)} {...props}>
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export function ChartTooltipContent({
  active,
  label,
  payload,
  className,
  config,
  hideZero,
  valueFormatter,
}: ChartTooltipContentProps): React.ReactElement | null {
  const context = React.useContext(ChartContext);
  const chartConfig = config ?? context?.config ?? {};
  const visiblePayload =
    payload?.filter((item) => item.value != null && item.hide !== true && (!hideZero || !isZeroValue(item.value))) ??
    [];

  if (!active || visiblePayload.length === 0) return null;

  return (
    <div
      className={cn(
        "grid min-w-32 gap-2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-console-md",
        className,
      )}
    >
      {label ? <div className="font-medium">{label}</div> : null}
      <div className="grid gap-1.5">
        {visiblePayload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "");
          const itemLabel = chartConfig[key]?.label ?? (item.name == null ? key : String(item.name));
          return (
            <div key={key} className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: chartConfig[key]?.color ?? item.color ?? item.fill }}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{itemLabel}</span>
              <span className="font-medium tabular-nums">
                {valueFormatter ? valueFormatter(item.value) : String(item.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isZeroValue(value: unknown): boolean {
  if (typeof value === "number") return value === 0;
  if (typeof value === "string" && value.trim() !== "") return Number(value) === 0;
  return false;
}

function ChartStyle(props: { id: string; config: ChartConfig }): React.ReactElement | null {
  const colorEntries = Object.entries(props.config).filter((entry): entry is [string, { color: string }] =>
    Boolean(entry[1].color),
  );

  if (colorEntries.length === 0) return null;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
[data-chart=${props.id}] {
${colorEntries.map(([key, item]) => `  --color-${key}: ${item.color};`).join("\n")}
}`,
      }}
    />
  );
}

export { ChartTooltip };
