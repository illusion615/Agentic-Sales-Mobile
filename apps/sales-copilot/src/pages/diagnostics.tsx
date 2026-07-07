import { useCallback, useEffect, useReducer, useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Activity, Copy, Check, RefreshCw, Bug,
  CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast-utils';
import { getLocale, getDebugMode, setDebugMode, type Locale } from '@/lib/i18n';
import { getCopilotConfig } from '@/services/copilot-service';
import { useUser } from '@/hooks/use-user';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useCopilotConfigured } from '@/hooks/use-copilot-configured';
import { getPromptResolutionStatus, PROMPT_RESOLUTION_EVENT } from '@/services/prompt-resolver';
import { Switch } from '@/components/ui/switch';
import {
  collectDiagnostics, formatDiagnostics, type DiagTone, type BiLabel, type DiagSection,
} from '@/lib/diagnostics';

function ToneIcon({ tone }: { tone: DiagTone }) {
  if (tone === 'good') return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />;
  if (tone === 'bad') return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
  if (tone === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
  return <span className="w-4 h-4 inline-block rounded-full bg-muted-foreground/40 flex-shrink-0" />;
}

function pick(label: BiLabel, locale: Locale): string {
  return locale === 'zh-Hans' ? label.zh : label.en;
}

function Row({ label, value, tone, locale }: { label: BiLabel; value: string; tone: DiagTone; locale: Locale }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
        <ToneIcon tone={tone} />
        <span className="text-sm text-foreground">{pick(label, locale)}</span>
      </div>
      <span className="text-sm font-mono text-muted-foreground text-right break-all max-w-[62%]">{value}</span>
    </div>
  );
}

export default function DiagnosticsPage() {
  const navigate = useNavigate();
  const locale = getLocale();
  const zh = locale === 'zh-Hans';
  const { data: user } = useUser();
  const [copied, setCopied] = useState(false);
  // Bump to re-read live globals (viewport, network, voices) on demand.
  const [tick, refresh] = useReducer((x: number) => x + 1, 0);
  void tick;

  // Debug mode — interactive control moved here from Settings › Help & Feedback.
  const [debugMode, setDebugModeState] = useState(() => getDebugMode());
  const handleDebugModeChange = (enabled: boolean) => {
    setDebugModeState(enabled);
    setDebugMode(enabled);
  };

  // Connection & AI status — moved here from Settings › Help & Feedback.
  const { settings: appSettings, isFetched: isSettingsFetched } = useAppSettings();
  const isCopilotConfigured = useCopilotConfigured();
  const resolvedAgentName = appSettings.copilotStudioAgentName || getCopilotConfig().agentName;
  const agentFromSettingTable = !!appSettings.copilotStudioAgentName;
  const hasAgent = !!resolvedAgentName;
  const [promptStatus, setPromptStatus] = useState(getPromptResolutionStatus);
  useEffect(() => {
    const update = () => setPromptStatus(getPromptResolutionStatus());
    window.addEventListener(PROMPT_RESOLUTION_EVENT, update);
    return () => window.removeEventListener(PROMPT_RESOLUTION_EVENT, update);
  }, []);

  const copilotStatus = !isSettingsFetched
    ? 'checking'
    : (isCopilotConfigured && hasAgent) ? 'connected' : 'not configured';
  const promptLabel = promptStatus.state === 'resolved'
    ? 'ready'
    : promptStatus.state === 'cached'
      ? 'ready (cached)'
      : promptStatus.state === 'fallback'
        ? 'fallback (default)'
        : 'checking';

  const connectionSection: DiagSection = {
    title: { zh: '连接与 AI', en: 'Connection & AI' },
    rows: [
      {
        label: { zh: 'Copilot 连接', en: 'Copilot connection' },
        value: copilotStatus,
        tone: copilotStatus === 'connected' ? 'good' : copilotStatus === 'checking' ? 'info' : 'warn',
      },
      {
        label: { zh: '当前 Agent', en: 'Current agent' },
        value: hasAgent ? `${resolvedAgentName} (${agentFromSettingTable ? 'setting table' : 'cached'})` : 'not configured',
        tone: hasAgent ? 'good' : 'warn',
      },
      {
        label: { zh: 'AI Prompt 状态', en: 'AI prompt' },
        value: promptLabel,
        tone: promptStatus.state === 'fallback' ? 'warn' : promptStatus.state === 'checking' ? 'info' : 'good',
      },
      {
        label: { zh: 'AI 模型', en: 'AI model' },
        value: promptStatus.modelName || '—',
        tone: 'info',
      },
    ],
  };

  // Base snapshot + the connection section placed right after "Connectors".
  const base = collectDiagnostics({ user, locale });
  const sections = [...base];
  const connIdx = sections.findIndex((s) => s.title.en === 'Connectors');
  sections.splice(connIdx >= 0 ? connIdx + 1 : sections.length, 0, connectionSection);

  const copyReport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatDiagnostics(sections));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success(zh ? '诊断信息已复制' : 'Diagnostics copied');
    } catch {
      toast.error(zh ? '复制失败' : 'Copy failed');
    }
  }, [sections, zh]);

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="shrink-0 bg-background/80 backdrop-blur-lg border-b border-border/40">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors flex-shrink-0"
            aria-label={zh ? '返回' : 'Back'}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Activity className="w-5 h-5 text-primary flex-shrink-0" />
            <h1 className="text-base font-semibold truncate">
              {zh ? '诊断信息' : 'Diagnostics'}
            </h1>
          </div>
          <button
            onClick={refresh}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors flex-shrink-0"
            aria-label={zh ? '刷新' : 'Refresh'}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={copyReport}
            className={cn(
              'h-9 px-3 flex items-center gap-1.5 rounded-full text-sm font-medium transition-colors flex-shrink-0',
              copied ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-primary/10 text-primary hover:bg-primary/20'
            )}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? (zh ? '已复制' : 'Copied') : (zh ? '复制' : 'Copy')}</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl mx-auto px-4 py-5 space-y-4 pb-24"
        >
          <p className="text-sm text-muted-foreground leading-relaxed">
            {zh
              ? '这里汇总了当前的运行环境信息，便于排查问题。点右上角「复制」把完整报告发回。'
              : 'A snapshot of the current environment for troubleshooting. Tap Copy (top-right) to send the full report back.'}
          </p>

          {/* Debug mode — interactive control */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Bug className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium text-foreground">
                  {zh ? '调试模式' : 'Debug mode'}
                </span>
              </div>
              <Switch
                checked={debugMode}
                onCheckedChange={handleDebugModeChange}
                className="data-[state=checked]:bg-primary"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {zh
                ? '开启后在 Copilot 面板显示 Frame 思考记录图标'
                : 'Shows the Frame reasoning-log icon on the Copilot panel when enabled'}
            </p>
          </div>

          {sections.map((section) => (
            <div key={section.title.en} className="glass-card p-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                {pick(section.title, locale)}
              </h2>
              <div>
                {section.rows.map((row, i) => (
                  <Row key={`${row.label.en}-${i}`} label={row.label} value={row.value} tone={row.tone} locale={locale} />
                ))}
              </div>
            </div>
          ))}
        </motion.main>
      </div>
    </div>
  );
}
