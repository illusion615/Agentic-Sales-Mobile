import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Speech, Copy, Check, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, Loader2, Mic, Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast-utils';
import { getLocale, speechLang } from '@/lib/i18n';
import {
  runVoiceProbe, formatProbeReport, micWorks, type VoiceProbeResult,
} from '@/lib/speech-probe';
import { SalesCopilotSpeechService } from '@/generated/services/SalesCopilotSpeechService';

type Tone = 'good' | 'warn' | 'bad' | 'info';

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === 'good') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (tone === 'bad') return <XCircle className="w-4 h-4 text-red-500" />;
  if (tone === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <span className="w-4 h-4 inline-block rounded-full bg-muted-foreground/40" />;
}

function Row({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <ToneIcon tone={tone} />
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <span className="text-sm font-mono text-muted-foreground text-right break-all max-w-[55%]">{value}</span>
    </div>
  );
}

export default function VoiceProbePage() {
  const navigate = useNavigate();
  const locale = getLocale();
  const zh = locale === 'zh-Hans';
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [result, setResult] = useState<VoiceProbeResult | null>(null);
  const [copied, setCopied] = useState(false);

  const run = useCallback(async () => {
    setStatus('running');
    try {
      const r = await runVoiceProbe();
      setResult(r);
      setStatus('done');
    } catch {
      setStatus('idle');
      toast.error(zh ? '检测失败，请重试' : 'Probe failed, please retry');
    }
  }, [zh]);

  const copyReport = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(formatProbeReport(result));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success(zh ? '报告已复制' : 'Report copied');
    } catch {
      toast.error(zh ? '复制失败' : 'Copy failed');
    }
  }, [result, zh]);

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

  const micOk = result ? micWorks(result) : false;

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="shrink-0 bg-background/80 backdrop-blur-lg border-b border-border/40">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors"
            aria-label={zh ? '返回' : 'Back'}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Speech className="w-5 h-5 text-primary" />
            <h1 className="text-base font-semibold">
              {zh ? '语音能力自检' : 'Voice Capability Check'}
            </h1>
          </div>
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
            ? '在这台设备的 Power Apps 播放器里点击下方按钮，检测麦克风是否可用、以及本地语音识别与音色情况。请在弹出麦克风权限时选择「允许」，然后把报告复制发回。'
            : 'Tap the button below inside the Power Apps player on this device to check whether the microphone is usable, plus local speech recognition and voices. Choose "Allow" if a microphone prompt appears, then copy the report back.'}
        </p>

        <button
          onClick={run}
          disabled={status === 'running'}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl accent-gradient text-white font-medium disabled:opacity-60 transition-opacity"
        >
          {status === 'running'
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : status === 'done' ? <RefreshCw className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          {status === 'running'
            ? (zh ? '检测中…' : 'Checking…')
            : status === 'done'
              ? (zh ? '重新检测' : 'Run again')
              : (zh ? '开始检测' : 'Run check')}
        </button>

        {result && (
          <>
            {/* Verdict */}
            <div
              className={cn(
                'rounded-xl p-4 border',
                micOk
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-amber-500/10 border-amber-500/30'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                {micOk
                  ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                  : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                <span className="font-semibold text-sm">
                  {micOk
                    ? (zh ? '麦克风可用' : 'Microphone works')
                    : (zh ? '麦克风不可用' : 'Microphone unavailable')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {micOk
                  ? (zh
                    ? '这台设备允许应用采集麦克风，实时流式听写方案可行。'
                    : 'This device lets the app capture the microphone; real-time streaming dictation is viable.')
                  : (zh
                    ? `未能采集麦克风（${result.micCaptureResult}），需要「录音上传」兜底路径或修复权限。`
                    : `Microphone capture failed (${result.micCaptureResult}); a record-and-upload fallback or a permission fix is needed.`)}
              </p>
            </div>

            {/* Details */}
            <div className="glass-card rounded-xl p-4">
              <Row
                label={zh ? '安全上下文' : 'Secure context'}
                value={String(result.secureContext)}
                tone={result.secureContext ? 'good' : 'bad'}
              />
              <Row
                label={zh ? '运行于 iframe' : 'In iframe'}
                value={String(result.inIframe)}
                tone="info"
              />
              <Row
                label={zh ? '采麦接口存在' : 'getUserMedia present'}
                value={String(result.hasGetUserMedia)}
                tone={result.hasGetUserMedia ? 'good' : 'bad'}
              />
              <Row
                label={zh ? '麦克风权限状态' : 'Mic permission'}
                value={result.micPermissionState}
                tone={result.micPermissionState === 'granted' ? 'good' : result.micPermissionState === 'denied' ? 'bad' : 'info'}
              />
              <Row
                label={zh ? '采麦实测结果' : 'Mic capture result'}
                value={result.micCaptureResult}
                tone={micOk ? 'good' : 'bad'}
              />
              <Row
                label={zh ? '语音识别接口 (STT)' : 'SpeechRecognition (STT)'}
                value={String(result.hasSpeechRecognition)}
                tone={result.hasSpeechRecognition ? 'good' : 'warn'}
              />
              <Row
                label={zh ? '语音合成 (TTS)' : 'speechSynthesis (TTS)'}
                value={String(result.hasSpeechSynthesis)}
                tone={result.hasSpeechSynthesis ? 'good' : 'warn'}
              />
              <Row
                label={zh ? '本地音色数量' : 'Local voice count'}
                value={String(result.voiceCount)}
                tone={result.voiceCount > 0 ? 'good' : 'warn'}
              />
              <Row
                label={zh ? '当前语言有本地音色' : 'Locale voice available'}
                value={String(result.localeVoiceAvailable)}
                tone={result.localeVoiceAvailable ? 'good' : 'warn'}
              />
              <Row
                label={zh ? '音色语言' : 'Voice langs'}
                value={result.voiceLangs.join(', ') || '(none)'}
                tone="info"
              />
              <Row label="userAgent" value={result.userAgent} tone="info" />
            </div>

            <button
              onClick={copyReport}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border/60 hover:bg-muted/40 transition-colors text-sm"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              {copied ? (zh ? '已复制' : 'Copied') : (zh ? '复制报告' : 'Copy report')}
            </button>
          </>
        )}

        {/* TTS-via-connector check — proves the app reaches Azure Speech through the SDK connector (bypassing the connect-src sandbox) */}
        <div className="glass-card rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              {zh ? '语音合成（连接器）' : 'TTS via connector'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {zh
              ? '经 SDK 连接器请求服务端合成语音并播放——验证绕过沙箱的通道是否打通（密钥不进前端）。'
              : 'Request synthesis from the server through the SDK connector and play it — verifies the sandbox-bypassing path (the key never reaches the front end).'}
          </p>
          <button
            onClick={testTts}
            disabled={ttsState.status === 'running'}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border/60 hover:bg-muted/40 transition-colors text-sm disabled:opacity-60"
          >
            {ttsState.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
            {zh ? '测试语音合成' : 'Test TTS'}
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
      </motion.main>
      </div>
    </div>
  );
}
