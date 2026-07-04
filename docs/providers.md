# Provider Coverage

This repository currently contains:

- 842 providers
- 8,310 prebuilt Actions

These numbers are counted from `src/providers` in this repository. Recount them with:

```bash
node --input-type=module <<'NODE'
import { readdir } from "node:fs/promises";

const entries = await readdir("src/providers", { withFileTypes: true });
const services = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

let actions = 0;
for (const service of services) {
  const module = await import(`./src/providers/${service}/definition.ts`);
  actions += module.provider.actions.length;
}

console.log(`${services.length} providers, ${actions} Actions`);
NODE
```

Representative providers include GitHub, Gmail, Notion, Google BigQuery, Google Analytics,
Supabase, Airtable, Slack, Google Drive, Google Sheets, Google Calendar, Postman, GitLab, and many
more.

---

# Provider 覆盖

当前仓库包含：

- 842 个 provider
- 8,310 个预置 Action

这些数字来自本仓库的 `src/providers`。可以使用上面的命令重新统计。

代表性 provider 包括 GitHub、Gmail、Notion、Google BigQuery、Google Analytics、Supabase、Airtable、
Slack、Google Drive、Google Sheets、Google Calendar、Postman、GitLab 等。
