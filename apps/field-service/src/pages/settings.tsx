import { Link } from 'react-router-dom';
import { AppearanceSettings } from '@agentic/app-shell/react';

export function SettingsPage() {
  return (
    <div className="app-shell min-h-full overflow-y-auto">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur-md safe-area-top">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted">
            ←
          </Link>
          <h1 className="text-title">设置</h1>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-5 p-4 pb-12">
        <AppearanceSettings />

        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">关于</h2>
          <div className="as-settings-group">
            <div className="as-settings-item">
              <span className="flex-1 text-body">数据源</span>
              <span className="text-helper">本地开发数据</span>
            </div>
            <div className="as-settings-item">
              <span className="flex-1 text-body">应用</span>
              <span className="text-helper">Field Service Mobile · 0.1.0</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
