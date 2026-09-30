export function feishuResourceKind(events: readonly string[]): "document" | "calendar" | "approval" | undefined {
  if (events.length == 0) return;
  if (events.every((event) => event.startsWith("drive.file."))) return "document";
  if (events.every((event) => event == "calendar.calendar.event.changed_v4")) return "calendar";
  if (events.every((event) => ["approval_instance", "approval_task", "approval_cc", "approval"].includes(event)))
    return "approval";
}
