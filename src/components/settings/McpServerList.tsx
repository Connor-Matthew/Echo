import { useRef, useState, type ChangeEvent } from "react";
import { Check, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import type { UserMcpServer } from "../../shared/contracts";
import { Button } from "../ui/button";

type McpServerListProps = {
  servers: UserMcpServer[];
  onChange: (servers: UserMcpServer[]) => void;
};

type McpServerFormState = {
  id: string;
  name: string;
  transportType: "stdio" | "streamable_http";
  endpoint: string;
  enabled: boolean;
};

const emptyForm = (): McpServerFormState => ({
  id: crypto.randomUUID(),
  name: "",
  transportType: "stdio",
  endpoint: "",
  enabled: true
});

const parseMcpJson = (raw: unknown): UserMcpServer[] => {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const map = (obj["mcpServers"] ?? obj) as Record<string, unknown>;
  if (!map || typeof map !== "object") return [];
  const results: UserMcpServer[] = [];
  for (const [name, value] of Object.entries(map)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    let endpoint = "";
    let transportType: "stdio" | "streamable_http" = "stdio";
    if (typeof entry["url"] === "string" && entry["url"]) {
      endpoint = entry["url"];
      transportType = "streamable_http";
    } else if (typeof entry["command"] === "string" && entry["command"]) {
      const args = Array.isArray(entry["args"]) ? (entry["args"] as unknown[]).map(String) : [];
      endpoint = [entry["command"], ...args].join(" ");
      transportType = "stdio";
    } else if (typeof entry["endpoint"] === "string" && entry["endpoint"]) {
      endpoint = entry["endpoint"];
      transportType = (entry["transportType"] as "stdio" | "streamable_http") ?? "stdio";
    }
    if (!endpoint) continue;
    results.push({ id: crypto.randomUUID(), name, transportType, endpoint, enabled: true });
  }
  return results;
};

export const McpServerList = ({ servers, onChange }: McpServerListProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<McpServerFormState>(emptyForm());
  const [isAdding, setIsAdding] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const imported = parseMcpJson(parsed);
        if (!imported.length) {
          setImportError("未找到有效的 MCP 服务器配置");
          return;
        }
        const existingNames = new Set(servers.map((server) => server.name));
        const fresh = imported.filter((server) => !existingNames.has(server.name));
        onChange([...servers, ...fresh]);
        setImportError(
          fresh.length < imported.length
            ? `已导入 ${fresh.length} 个（${imported.length - fresh.length} 个名称重复已跳过）`
            : null
        );
      } catch {
        setImportError("JSON 解析失败，请检查文件格式");
      }
    };
    reader.readAsText(file);
  };

  const startAdd = () => {
    setForm(emptyForm());
    setEditingId(null);
    setIsAdding(true);
  };

  const startEdit = (server: UserMcpServer) => {
    setForm({ ...server });
    setEditingId(server.id);
    setIsAdding(false);
  };

  const cancelForm = () => {
    setIsAdding(false);
    setEditingId(null);
  };

  const commitForm = () => {
    const name = form.name.trim();
    const endpoint = form.endpoint.trim();
    if (!name || !endpoint) return;
    const next: UserMcpServer = {
      id: form.id,
      name,
      transportType: form.transportType,
      endpoint,
      enabled: form.enabled
    };
    if (isAdding) {
      onChange([...servers, next]);
    } else {
      onChange(servers.map((server) => (server.id === form.id ? next : server)));
    }
    cancelForm();
  };

  const remove = (id: string) => {
    onChange(servers.filter((server) => server.id !== id));
    if (editingId === id) cancelForm();
  };

  const toggleEnabled = (id: string) => {
    onChange(
      servers.map((server) => (server.id === id ? { ...server, enabled: !server.enabled } : server))
    );
  };

  const showForm = isAdding || editingId !== null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">服务器列表</p>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImport}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setImportError(null);
              importInputRef.current?.click();
            }}
            disabled={showForm}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            导入 JSON
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={startAdd} disabled={showForm}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            添加
          </Button>
        </div>
      </div>

      {importError ? <p className="text-xs text-muted-foreground">{importError}</p> : null}

      {showForm ? (
        <div className="space-y-3 rounded-xl border border-border/70 bg-accent/20 p-3">
          <p className="text-xs font-medium text-foreground">{isAdding ? "添加服务器" : "编辑服务器"}</p>
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">名称</label>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="my-mcp-server"
                className="h-8 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">传输类型</label>
              <select
                value={form.transportType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    transportType: event.target.value as "stdio" | "streamable_http"
                  }))
                }
                className="h-8 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="stdio">stdio（本地命令）</option>
                <option value="streamable_http">HTTP（远程服务）</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                {form.transportType === "stdio" ? "命令（含参数）" : "URL"}
              </label>
              <input
                type="text"
                value={form.endpoint}
                onChange={(event) => setForm((current) => ({ ...current, endpoint: event.target.value }))}
                placeholder={
                  form.transportType === "stdio"
                    ? "npx -y @modelcontextprotocol/server-filesystem /path"
                    : "https://mcp.example.com/sse"
                }
                className="h-8 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={commitForm}
              disabled={!form.name.trim() || !form.endpoint.trim()}
            >
              {isAdding ? "添加" : "保存"}
            </Button>
          </div>
        </div>
      ) : null}

      {servers.length ? (
        <div className="space-y-2">
          {servers.map((server) => (
            <div
              key={server.id}
              className={[
                "rounded-xl border bg-card px-3 py-2.5 transition-opacity",
                server.enabled ? "border-border/70" : "border-border/40 opacity-60"
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{server.name}</p>
                    <span className="shrink-0 rounded-[3px] border border-border/60 px-1 py-px text-[10px] text-muted-foreground">
                      {server.transportType === "stdio" ? "stdio" : "http"}
                    </span>
                    {!server.enabled ? (
                      <span className="shrink-0 rounded-[3px] border border-border/60 px-1 py-px text-[10px] text-muted-foreground">
                        已禁用
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{server.endpoint}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title={server.enabled ? "禁用" : "启用"}
                    onClick={() => toggleEnabled(server.id)}
                  >
                    {server.enabled ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="编辑"
                    onClick={() => startEdit(server)}
                    disabled={showForm}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="删除"
                    onClick={() => remove(server.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border/70 bg-card/70 px-2.5 py-3 text-center text-xs text-muted-foreground">
          还没有 MCP 服务器，点击「添加」开始配置
        </p>
      )}
    </div>
  );
};
