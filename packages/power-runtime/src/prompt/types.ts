/**
 * Prompt authoring contract.
 *
 * A prompt is CONTENT (instructions, policy, examples) plus a declared set of
 * placeholders the caller must fill. Runtime data — dates, catalogues, page
 * context, user text — is never baked into the body; it arrives as variables.
 * That split is what lets the body be edited outside the code base later
 * without any call site changing.
 */

export type PromptResponseFormat = 'text' | 'json' | 'dag' | 'json-generic';

/** A prompt shipped with the build. This is the fallback and the contract. */
export interface PromptDefinition {
  /** Stable logical id. Call sites reference this and nothing else. */
  key: string;
  /** Template body. Placeholders are `{{name}}`. */
  body: string;
  /**
   * Bumped whenever the OUTPUT shape changes, i.e. whenever the app-side parser
   * must change with it. An external body may only replace a builtin body of
   * the same contract version.
   */
  contractVersion: number;
  responseFormat?: PromptResponseFormat;
  /** Execution hint — which model tier this prompt should run on. */
  modelTier?: string;
  /** Maintainer-facing note. Never sent to the model. */
  description?: string;
}

/** A prompt as the registry serves it, after any override has been applied. */
export interface ResolvedPrompt extends PromptDefinition {
  /** Placeholder names declared by the BUILTIN body — the caller's contract. */
  variables: string[];
  source: 'builtin' | 'external';
  /** Content revision of an external body, for diagnostics. */
  version?: number;
}

/** An externally authored body proposed as a replacement for a builtin one. */
export interface PromptOverride {
  key: string;
  body: string;
  contractVersion: number;
  responseFormat?: PromptResponseFormat;
  modelTier?: string;
  version?: number;
  /** Which app owns the row. Rows from another app are refused. */
  app?: string;
}

export interface PromptOverrideReport {
  applied: string[];
  rejected: Array<{ key: string; reason: string }>;
}

export type PromptVariableValue = string | number;
export type PromptVariables = Record<string, PromptVariableValue | undefined>;
