import type { TaskTemplate } from "@/types/template";
import type { TaskCreate, TaskStatus } from "@/types/task";

const API_BASE = "http://localhost:18721";

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function getTemplates(): Promise<TaskTemplate[]> {
  return request<TaskTemplate[]>("/api/templates");
}

export function getTemplate(id: string): Promise<TaskTemplate> {
  // Template IDs contain slashes (e.g. "embodiment/run_embodiment").
  // The backend uses a {template_id:path} parameter, so we must NOT
  // encode slashes — only encode individual path segments.
  const safePath = id
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return request<TaskTemplate>(`/api/templates/${safePath}`);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function createTask(data: TaskCreate): Promise<TaskStatus> {
  return request<TaskStatus>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getTasks(): Promise<TaskStatus[]> {
  return request<TaskStatus[]>("/api/tasks");
}

export function getTask(id: string): Promise<TaskStatus> {
  return request<TaskStatus>(`/api/tasks/${encodeURIComponent(id)}`);
}

export function stopTask(id: string): Promise<TaskStatus> {
  return request<TaskStatus>(
    `/api/tasks/${encodeURIComponent(id)}/stop`,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// Config tree & editor
// ---------------------------------------------------------------------------

export interface ConfigTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: ConfigTreeNode[];
}

export function getConfigTree(): Promise<ConfigTreeNode[]> {
  return request<ConfigTreeNode[]>("/api/configs/tree");
}

export function getConfigFile(
  path: string,
): Promise<{ path: string; content: string }> {
  return request<{ path: string; content: string }>(
    `/api/configs/file?path=${encodeURIComponent(path)}`,
  );
}

export function validateConfig(
  path: string,
  content: string,
): Promise<{ valid: boolean; errors: string[] }> {
  return request<{ valid: boolean; errors: string[] }>(
    "/api/configs/validate",
    {
      method: "POST",
      body: JSON.stringify({ path, content }),
    },
  );
}
