/**
 * Shapes exchanged between the server and ProjectClient. Not part of the `.design/` file contract:
 * these can change without a schemaVersion bump.
 */

/** A project folder as the picker and shell see it. */
export interface ProjectSummary {
  /** Absolute, normalised path to the project folder. */
  path: string;
  /** The `config.json` name when it parses, otherwise the folder name. */
  name: string;
  /** Whether `.design/` exists with all three files. */
  initialised: boolean;
}

/** Body of every non-validation error response (validation errors use `DesignError`). */
export interface ApiErrorBody {
  message: string;
}
