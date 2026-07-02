import type { ProviderDefinition } from "./model";
import type { ReactNode } from "react";

import { X } from "lucide-react";

export function Metric(props: { label: string; value: number }): ReactNode {
  return (
    <div className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function InfoBlock(props: { icon: ReactNode; label: string; value: string }): ReactNode {
  return (
    <div className="info-block">
      {props.icon}
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function Badge(props: { children: ReactNode; tone?: "success" | "warning" | "error" }): ReactNode {
  return <span className={props.tone ? `badge ${props.tone}` : "badge"}>{props.children}</span>;
}

export function TagList(props: { values: string[]; empty: string }): ReactNode {
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

export function ProviderIcon(props: { provider: ProviderDefinition; large?: boolean }): ReactNode {
  const letters = props.provider.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return <span className={props.large ? "provider-icon large" : "provider-icon"}>{letters}</span>;
}

export function EmptyState(props: { title: string; description: string; icon?: ReactNode }): ReactNode {
  return (
    <div className="empty-state">
      {props.icon ?? <X size={20} />}
      <strong>{props.title}</strong>
      <p>{props.description}</p>
    </div>
  );
}

export function InlineError(props: { message: string }): ReactNode {
  return (
    <div className="inline-error">
      <X size={16} />
      {props.message}
    </div>
  );
}

export function StatusDot(props: { ok: boolean }): ReactNode {
  return <span className={props.ok ? "status-dot ok" : "status-dot error"} />;
}
