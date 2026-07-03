/**
 * Skill loader — reads Business-skill SOPs from the Dataverse `skill` table at runtime.
 *
 * Background: the official Dataverse Business skills are stored in the standard `skill`
 * table (entitySet `skills`, added as a data source via the Power Apps npm CLI). Each row
 * carries the SOP as data:
 *   - `name`        — unique skill name (e.g. "log-sales-activity")
 *   - `description` — routing signal (when to use this skill)
 *   - `body`        — full Markdown SOP / Instructions
 *   - `statecode`   — 0 = Active, 1 = Inactive (deactivated skills are skipped)
 * Design rationale: docs/05-engineering/business-skills-sop-storage.md (§4 read path).
 *
 * This module is the runtime-read half of the "harmony" design: the local pipeline reads
 * the same `skill` table the Copilot Studio agent consumes via MCP, so a business edit in
 * the maker propagates to both without a front-end rebuild.
 */
import { SkillsService } from '@/generated/services/SkillsService';

/** A parsed, ready-to-route Business-skill SOP. */
export interface SkillSop {
  /** Unique skill name. */
  name: string;
  /** Routing signal — fed to Frame/Orchestrator for skill selection. */
  description: string;
  /** Full Markdown SOP (Instructions). */
  body: string;
}

let cache: SkillSop[] | null = null;

/** Clear the in-memory cache so the next load re-reads the table (e.g. after admin edits). */
export function invalidateSkillCache(): void {
  cache = null;
}

/**
 * Load all active skill SOPs. Inactive skills (`statecode` 1) and bad rows (missing name
 * or body) are skipped with a warning and never abort the load. Results are cached until
 * {@link invalidateSkillCache}.
 *
 * @param force re-read even if cached.
 */
export async function loadSkills(force = false): Promise<SkillSop[]> {
  if (cache && !force) return cache;

  const result = await SkillsService.getAll({
    select: ['skillid', 'name', 'description', 'body', 'statecode'],
  });

  if (!result.success || !Array.isArray(result.data)) {
    console.warn('[skill-loader] failed to read skills table:', result.error);
    return cache ?? [];
  }

  const skills: SkillSop[] = [];
  for (const row of result.data) {
    if (row.statecode !== 0) continue; // 0 = Active
    const name = row.name?.trim();
    const body = row.body?.trim();
    if (!name || !body) {
      console.warn('[skill-loader] skipping skill row missing name/body:', row.skillid ?? '(no id)');
      continue;
    }
    skills.push({ name, description: row.description?.trim() ?? '', body });
  }

  cache = skills;
  return skills;
}
