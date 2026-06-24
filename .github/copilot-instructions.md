# Agentic Sales Mobile — Copilot Instructions

## Build & Push Discipline (MANDATORY)

### NEVER kill `tsc -b` or `vite build` processes
- `pnpm build` = `tsc -b && vite build`. Cold compilation (no `.tsbuildinfo` cache) takes **50–90 minutes** with ZERO terminal output and 0% CPU — this is normal I/O-bound type resolution, NOT a hang.
- Killing the process mid-compilation **corrupts `.tsbuildinfo`** incremental cache → forces another 50–90 min cold rebuild → vicious cycle.
- Set terminal timeout to **≥5400 seconds** (90 min) for any `pnpm build` command. If the agent tool times out, let the process continue in the background — do NOT kill it.
- To check progress: `lsof -p $(pgrep -f "tsc -b") 2>/dev/null | grep "11r"` — if the file path is changing, tsc is working.

### Build command pattern
```bash
# Run build in background with output capture (preferred for agent use)
cd apps/sales-copilot
pnpm build > /tmp/build.log 2>&1 &
# Check periodically: cat /tmp/build.log
# When done, verify: stat dist/index.html
```

### Push requires fresh dist
- `pac code push` / `npx power-apps push` does NOT rebuild. Always `pnpm build` first.
- Verify `dist/index.html` timestamp matches current time before pushing.
- After push, open browser and verify: (1) app loads, (2) send message → get response, (3) no console errors.

### Protecting .tsbuildinfo cache
- NEVER delete `tsconfig.*.tsbuildinfo` unless you are prepared to wait 50–90 min for cold rebuild.
- Do NOT run `pnpm install` with `--force` or delete `node_modules` without understanding this will trigger cold rebuild.
- If cache is corrupted (tsc errors on files that exist), delete `.tsbuildinfo` files and rebuild with patience.

### Node.js version
- This project requires **Node.js LTS (22.x or 20.x)**. Node 23+ (Current) causes esbuild/fsevents hangs.
- `.nvmrc` is set to `22`. Use `nvm use` or `PATH="/opt/homebrew/opt/node@22/bin:$PATH"`.

## Dependencies with large type surface
- **date-fns v4**: 1,230 `.d.ts` files (532 locales). Always use subpath imports (`from 'date-fns/format'`, `from 'date-fns/locale/zh-CN'`). NEVER `from 'date-fns'` barrel.
- **lucide-react**: 1,742 icon files. Currently uses barrel import; future optimization: subpath `from 'lucide-react/icons/X'`.

## Data Layer
- Adapter services in `src/generated/services/` use `mapOptions()` with `FIELD_MAP` for field name translation.
- Owner filtering uses `_ownerid_value` (Dataverse systemuserid), resolved via `useUser` hook from `systemusers` table.
- `pac code add-data-source` is BROKEN for Dataverse — use `npx power-apps add-data-source` instead.
