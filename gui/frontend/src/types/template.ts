/** A named configuration preset shipped with a template. */
export interface ConfigPreset {
  id: string;
  name: string;
  description: string;
  /** Repo-relative path to the YAML config file. */
  config_path: string;
}

/** Mirrors the backend Pydantic model for a task template. */
export interface TaskTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Path to the entry script (relative to repo root). */
  entry_script: string;
  /** Config directory path (relative to repo root), if any. */
  config_path: string | null;
  /** List of config presets discovered for this template. */
  presets: ConfigPreset[];
  /** Environment variables set by the template. */
  env_vars?: Record<string, string>;
}
