import { useCallback, useEffect, useReducer, useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Activity, Copy, Check, RefreshCw, Bug,
  CheckCircle2, XCircle, AlertTriangle, Speech, Mic, Volume2, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast-utils';
import { getLocale, getDebugMode, setDebugMode, speechLang, type Locale } from '@/lib/i18n';
import { getCopilotConfig } from '@/services/copilot-service';
import { useUser } from '@/hooks/use-user';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useCopilotConfigured } from '@/hooks/use-copilot-configured';
import { getPromptResolutionStatus, PROMPT_RESOLUTION_EVENT } from '@/services/prompt-resolver';
import { Switch } from '@/components/ui/switch';
import {
  collectDiagnostics, formatDiagnostics, type DiagTone, type BiLabel, type DiagSection,
} from '@/lib/diagnostics';
import { runVoiceProbe, formatProbeReport, micWorks, type VoiceProbeResult } from '@/lib/speech-probe';
import { SalesCopilotSpeechService } from '@/generated/services/SalesCopilotSpeechService';

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

  // Voice capability self-check (moved here from the standalone Voice probe page).
  // getUserMedia needs a user gesture, so the probe runs from the button below.
  const [probeStatus, setProbeStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [probeResult, setProbeResult] = useState<VoiceProbeResult | null>(null);
  const runProbe = useCallback(async () => {
    setProbeStatus('running');
    try {
      const r = await runVoiceProbe();
      setProbeResult(r);
      setProbeStatus('done');
    } catch {
      setProbeStatus('idle');
      toast.error(zh ? '检测失败，请重试' : 'Probe failed, please retry');
    }
  }, [zh]);

  const [ttsState, setTtsState] = useState<{ status: 'idle' | 'running' | 'ok' | 'err'; detail?: string }>({ status: 'idle' });
  const testTts = useCallback(async () => {
    setTtsState({ status: 'running' });
    const t0 = performance.now();
    try {
      const res = await SalesCopilotSpeechService.Synthesize({
        text: zh ? '你好，这是语音合成测试。' : 'Hello, this is a speech synthesis test.',
        locale: speechLang(getLocale()),
      });
      const ms = Math.round(performance.now() - t0);
      if (res.success && res.data && res.data.audio) {
        try { await new Audio('data:audio/mpeg;base64,' + res.data.audio).play(); } catch { /* autoplay may be blocked; the returned audio still proves the connector */ }
        setTtsState({ status: 'ok', detail: `voice ${res.data.voice} · audio ${res.data.audio.length} chars · ${ms}ms` });
      } else {
        setTtsState({ status: 'err', detail: (res.error && res.error.message) || 'no audio returned' });
      }
    } catch (e) {
      setTtsState({ status: 'err', detail: (e as Error)?.message || String(e) });
    }
  }, [zh]);

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
      const report = probeResult
        ? `${formatDiagnostics(sections)}\n\n${formatProbeReport(probeResult)}`
        : formatDiagnostics(sections);
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success(zh ? '诊断信息已复制' : 'Diagnostics copied');
    } catch {
      toast.error(zh ? '复制失败' : 'Copy failed');
    }
  }, [sections, zh, probeResult]);

  const micOk = probeResult ? micWorks(probeResult) : false;
  const voiceRows: { label: BiLabel; value: string; tone: DiagTone }[] = probeResult ? [
    { label: { zh: '安全上下文', en: 'Secure context' }, value: String(probeResult.secureContext), tone: probeResult.secureContext ? 'good' : 'bad' },
    { label: { zh: '运行于 iframe', en: 'In iframe' }, value: String(probeResult.inIframe), tone: 'info' },
    { label: { zh: '采麦接口存在', en: 'getUserMedia present' }, value: String(probeResult.hasGetUserMedia), tone: probeResult.hasGetUserMedia ? 'good' : 'bad' },
    { label: { zh: '麦克风权限状态', en: 'Mic permission' }, value: probeResult.micPermissionState, tone: probeResult.micPermissionState === 'granted' ? 'good' : probeResult.micPermissionState === 'denied' ? 'bad' : 'info' },
    { label: { zh: '采麦实测结果', en: 'Mic capture result' }, value: probeResult.micCaptureResult, tone: micOk ? 'good' : 'bad' },
    { label: { zh: '语音识别接口 (STT)', en: 'SpeechRecognition (STT)' }, value: String(probeResult.hasSpeechRecognition), tone: probeResult.hasSpeechRecognition ? 'good' : 'warn' },
    { label: { zh: '语音合成 (TTS)', en: 'speechSynthesis (TTS)' }, value: String(probeResult.hasSpeechSynthesis), tone: probeResult.hasSpeechSynthesis ? 'good' : 'warn' },
    { label: { zh: '本地音色数量', en: 'Local voice count' }, value: String(probeResult.voiceCount), tone: probeResult.voiceCount > 0 ? 'good' : 'warn' },
    { label: { zh: '当前语言有本地音色', en: 'Locale voice available' }, value: String(probeResult.localeVoiceAvailable), tone: probeResult.localeVoiceAvailable ? 'good' : 'warn' },
    { label: { zh: '音色语言', en: 'Voice langs' }, value: probeResult.voiceLangs.join(', ') || '(none)', tone: 'info' },
    { label: { zh: 'userAgent', en: 'userAgent' }, value: probeResult.userAgent, tone: 'info' },
  ] : [];

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

          {/* Voice capability self-check — mic / STT / voices probe + TTS-via-connector
              test. getUserMedia needs a user gesture, so it runs from the button. */}
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Speech className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-sm font-medium text-foreground">
                {zh ? '语音能力自检' : 'Voice capability'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {zh
                ? '检测麦克风、本地语音识别与音色。请在弹出麦克风权限时选择「允许」。'
                : 'Checks the microphone, local speech recognition and voices. Choose “Allow” if a mic prompt appears.'}
            </p>
            <button
              onClick={runProbe}
              disabled={probeStatus === 'running'}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl accent-gradient text-white font-medium disabled:opacity-60 transition-opacity text-sm"
            >
              {probeStatus === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : probeStatus === 'done' ? <RefreshCw className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {probeStatus === 'running' ? (zh ? '检测中…' : 'Checking…') : probeStatus === 'done' ? (zh ? '重新检测' : 'Run again') : (zh ? '开始检测' : 'Run check')}
            </button>

            {probeResult && (
              <>
                <div className={cn('rounded-xl p-3 border', micOk ? 'bg-green-500/10 border-green-500/30' : 'bg-amber-500/10 border-amber-500/30')}>
                  <div className="flex items-center gap-2">
                    {micOk ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    <span className="font-semibold text-sm">
                      {micOk ? (zh ? '麦克风可用' : 'Microphone works') : (zh ? '麦克风不可用' : 'Microphone unavailable')}
                    </span>
                  </div>
                </div>
                <div>
                  {voiceRows.map((row, i) => (
                    <Row key={`${row.label.en}-${i}`} label={row.label} value={row.value} tone={row.tone} locale={locale} />
                  ))}
                </div>
              </>
            )}

            {/* TTS via connector — proves the app reaches Azure Speech through the SDK connector. */}
            <button
              onClick={testTts}
              disabled={ttsState.status === 'running'}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border/60 hover:bg-muted/40 transition-colors text-sm disabled:opacity-60"
            >
              {ttsState.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
              {zh ? '测试语音合成（连接器）' : 'Test TTS (connector)'}
            </button>
            {ttsState.status === 'ok' && (
              <div className="flex items-start gap-2 text-xs text-green-600 dark:text-green-500">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-mono break-all">{ttsState.detail}</span>
              </div>
            )}
            {ttsState.status === 'err' && (
              <div className="flex items-start gap-2 text-xs text-red-500">
                <XCircle className="w-4 h-4 shrink-0" />
                <span className="font-mono break-all">{ttsState.detail}</span>
              </div>
            )}
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
