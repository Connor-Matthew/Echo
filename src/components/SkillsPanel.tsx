import { useState } from "react";
import { Download, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { Button } from "./ui/button";
import type { Skill, SkillParam } from "../shared/contracts";
import { BUILTIN_SKILLS } from "../lib/skills-builtin";
import { getMuApi } from "../lib/mu-api";

type SkillsPanelProps = {
  userSkills: Skill[];
  onSave: (skills: Skill[]) => void;
  onClose: () => void;
};

const createId = () => `skill-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

const EMPTY_SKILL: Omit<Skill, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  command: "",
  description: "",
  icon: "⚡",
  userPromptTemplate: "{{input}}",
  systemPromptOverride: "",
  params: [],
  isBuiltin: false
};

type EditState = Omit<Skill, "id" | "createdAt" | "updatedAt" | "isBuiltin">;

export const SkillsPanel = ({ userSkills, onSave, onClose }: SkillsPanelProps) => {
  const [editing, setEditing] = useState<{ id: string | null; state: EditState } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const startCreate = () =>
    setEditing({ id: null, state: { ...EMPTY_SKILL } });

  const startEdit = (skill: Skill) =>
    setEditing({
      id: skill.id,
      state: {
        name: skill.name,
        command: skill.command,
        description: skill.description,
        icon: skill.icon,
        userPromptTemplate: skill.userPromptTemplate,
        systemPromptOverride: skill.systemPromptOverride ?? "",
        params: skill.params.map((p) => ({ ...p }))
      }
    });

  const cancelEdit = () => setEditing(null);

  const saveEdit = () => {
    if (!editing) return;
    const { id, state } = editing;
    const now = nowIso();
    if (id) {
      onSave(userSkills.map((s) => s.id === id ? { ...s, ...state, updatedAt: now } : s));
    } else {
      onSave([...userSkills, { ...state, id: createId(), isBuiltin: false, createdAt: now, updatedAt: now }]);
    }
    setEditing(null);
  };

  const deleteSkill = (id: string) => onSave(userSkills.filter((s) => s.id !== id));

  const updateField = <K extends keyof EditState>(key: K, value: EditState[K]) =>
    setEditing((prev) => prev ? { ...prev, state: { ...prev.state, [key]: value } } : prev);

  const addParam = () =>
    updateField("params", [...(editing?.state.params ?? []), { key: "", label: "", defaultValue: "" }]);

  const updateParam = (i: number, field: keyof SkillParam, value: string) =>
    updateField("params", (editing?.state.params ?? []).map((p, idx) => idx === i ? { ...p, [field]: value } : p));

  const removeParam = (i: number) =>
    updateField("params", (editing?.state.params ?? []).filter((_, idx) => idx !== i));

  const isValid = editing
    ? Boolean(editing.state.name.trim() && editing.state.command.trim() && editing.state.userPromptTemplate.trim())
    : false;

  const scanClaudeSkills = async () => {
    setIsScanning(true);
    setScanMessage(null);
    try {
      const found = await getMuApi().skills.scanClaude();
      if (!found.length) {
        setScanMessage("未找到本地 Claude Skills");
        return;
      }
      const now = nowIso();
      const existingCommands = new Set(userSkills.map((s) => s.command));
      const newSkills: Skill[] = found
        .filter((f) => !existingCommands.has(f.command))
        .map((f) => ({
          id: createId(),
          name: f.name,
          command: f.command,
          description: f.description,
          icon: "⚡",
          userPromptTemplate: "{{input}}",
          systemPromptOverride: f.content || "",
          params: [],
          isBuiltin: false,
          createdAt: now,
          updatedAt: now
        }));
      if (!newSkills.length) {
        setScanMessage("所有 Claude Skills 已导入");
        return;
      }
      onSave([...userSkills, ...newSkills]);
      setScanMessage(`已导入 ${newSkills.length} 个 Skills`);
    } catch {
      setScanMessage("扫描失败");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-medium">Skills</p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={scanClaudeSkills}
            disabled={isScanning}
          >
            <Download className="h-3 w-3" />
            {isScanning ? "扫描中..." : "导入 Claude Skills"}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {scanMessage ? (
        <p className="border-b border-border px-4 py-1.5 text-[11px] text-muted-foreground">{scanMessage}</p>
      ) : null}

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Built-in skills */}
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">内置</p>
          <div className="space-y-1">
            {BUILTIN_SKILLS.map((skill) => (
              <SkillRow key={skill.id} skill={skill} readonly />
            ))}
          </div>
        </div>

        {/* User skills */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">自定义</p>
            {!editing && (
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={startCreate}>
                <Plus className="h-3 w-3" />
                添加
              </Button>
            )}
          </div>

          {userSkills.length === 0 && !editing && (
            <p className="text-xs text-muted-foreground">暂无自定义 Skills</p>
          )}

          <div className="space-y-1">
            {userSkills.map((skill) =>
              editing?.id === skill.id ? (
                <SkillEditor
                  key={skill.id}
                  state={editing.state}
                  isValid={isValid}
                  onUpdate={updateField}
                  onAddParam={addParam}
                  onUpdateParam={updateParam}
                  onRemoveParam={removeParam}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                />
              ) : (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  onEdit={() => startEdit(skill)}
                  onDelete={() => deleteSkill(skill.id)}
                />
              )
            )}
            {editing?.id === null && (
              <SkillEditor
                state={editing.state}
                isValid={isValid}
                onUpdate={updateField}
                onAddParam={addParam}
                onUpdateParam={updateParam}
                onRemoveParam={removeParam}
                onSave={saveEdit}
                onCancel={cancelEdit}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

type SkillRowProps = {
  skill: Skill;
  readonly?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
};

const SkillRow = ({ skill, readonly, onEdit, onDelete }: SkillRowProps) => (
  <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
    <span className="text-sm">{skill.icon}</span>
    <div className="min-w-0 flex-1">
      <span className="text-xs font-medium text-foreground/80">{skill.name}</span>
      <span className="ml-1.5 text-[11px] text-muted-foreground">/{skill.command}</span>
    </div>
    {!readonly && (
      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
        <Button variant="ghost" size="icon" className="h-5 w-5 rounded" onClick={onEdit}>
          <Pencil className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-5 w-5 rounded text-destructive/70 hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    )}
  </div>
);

type SkillEditorProps = {
  state: EditState;
  isValid: boolean;
  onUpdate: <K extends keyof EditState>(key: K, value: EditState[K]) => void;
  onAddParam: () => void;
  onUpdateParam: (i: number, field: keyof SkillParam, value: string) => void;
  onRemoveParam: (i: number) => void;
  onSave: () => void;
  onCancel: () => void;
};

const SkillEditor = ({
  state, isValid, onUpdate, onAddParam, onUpdateParam, onRemoveParam, onSave, onCancel
}: SkillEditorProps) => (
  <div className="rounded-md border border-border bg-accent/30 p-3 space-y-2.5">
    <div className="flex gap-2">
      <input
        className="w-10 rounded border border-border bg-background px-2 py-1 text-center text-sm"
        value={state.icon}
        onChange={(e) => onUpdate("icon", e.target.value)}
        placeholder="🔧"
        maxLength={2}
      />
      <input
        className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
        value={state.name}
        onChange={(e) => onUpdate("name", e.target.value)}
        placeholder="名称"
      />
      <input
        className="w-28 rounded border border-border bg-background px-2 py-1 text-xs font-mono"
        value={state.command}
        onChange={(e) => onUpdate("command", e.target.value.replace(/\s/g, ""))}
        placeholder="command"
      />
    </div>

    <input
      className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
      value={state.description}
      onChange={(e) => onUpdate("description", e.target.value)}
      placeholder="描述（可选）"
    />

    <div>
      <p className="mb-1 text-[11px] text-muted-foreground">
        用户 Prompt 模板（支持 {"{{"} input {"}}"}  和参数占位符）
      </p>
      <textarea
        className="w-full resize-none rounded border border-border bg-background px-2 py-1 text-xs font-mono"
        rows={3}
        value={state.userPromptTemplate}
        onChange={(e) => onUpdate("userPromptTemplate", e.target.value)}
        placeholder={"请将以下内容翻译成{{language}}：\n\n{{input}}"}
      />
    </div>

    <div>
      <p className="mb-1 text-[11px] text-muted-foreground">System Prompt 覆盖（可选，临时替换）</p>
      <textarea
        className="w-full resize-none rounded border border-border bg-background px-2 py-1 text-xs font-mono"
        rows={2}
        value={state.systemPromptOverride}
        onChange={(e) => onUpdate("systemPromptOverride", e.target.value)}
        placeholder="You are a helpful assistant..."
      />
    </div>

    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">参数</p>
        <Button variant="ghost" size="sm" className="h-5 gap-1 px-1.5 text-[11px]" onClick={onAddParam}>
          <Plus className="h-2.5 w-2.5" />
          添加参数
        </Button>
      </div>
      {state.params.map((param, i) => (
        <div key={i} className="mb-1.5 flex gap-1.5">
          <input
            className="w-20 rounded border border-border bg-background px-2 py-1 text-[11px] font-mono"
            value={param.key}
            onChange={(e) => onUpdateParam(i, "key", e.target.value.replace(/\s/g, ""))}
            placeholder="key"
          />
          <input
            className="flex-1 rounded border border-border bg-background px-2 py-1 text-[11px]"
            value={param.label}
            onChange={(e) => onUpdateParam(i, "label", e.target.value)}
            placeholder="显示名"
          />
          <input
            className="flex-1 rounded border border-border bg-background px-2 py-1 text-[11px]"
            value={param.defaultValue}
            onChange={(e) => onUpdateParam(i, "defaultValue", e.target.value)}
            placeholder="默认值"
          />
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 rounded text-destructive/60 hover:text-destructive"
            onClick={() => onRemoveParam(i)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>

    <div className="flex justify-end gap-2">
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onCancel}>取消</Button>
      <Button size="sm" className="h-6 px-2 text-xs" disabled={!isValid} onClick={onSave}>
        <Check className="mr-1 h-3 w-3" />
        保存
      </Button>
    </div>
  </div>
);
