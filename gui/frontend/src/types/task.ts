/** Payload sent to POST /api/tasks to create a new task. */
export interface TaskCreate {
  name: string;
  description?: string;
  tags?: string[];
  template_id?: string;
  config_preset?: string;
  config_overrides?: Record<string, string>;
  env_vars?: Record<string, string>;
}

/** Task status returned by GET /api/tasks and GET /api/tasks/:id. */
export interface TaskStatus {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "stopped";
  template_id?: string;
  pid?: number;
  /** The resolved launch command that was or will be executed. */
  command?: string;
  /** ISO-8601 timestamp when the task was started. */
  started_at?: string;
  /** ISO-8601 timestamp when the task finished (if applicable). */
  finished_at?: string;
  /** Path to the log file on disk. */
  log_path?: string;
  /** Process exit code (if completed or failed). */
  exit_code?: number;
}
