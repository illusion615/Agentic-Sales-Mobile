import { useEffect, useState } from 'react';
import { Speech } from 'lucide-react';
import {
  getSpeechInputMode,
  getSpeechInputModeOptions,
  normalizeSpeechInputMode,
  setSpeechInputMode,
  type SpeechInputMode,
} from '@agentic/power-runtime';
import { getSpeechProxyConfig } from '@/data/speech-config';

const LABELS: Record<SpeechInputMode, string> = {
  auto: '自动选择',
  'web-speech': '浏览器语音',
  'device-ime': '系统键盘语音',
  azure: 'Azure 语音',
};

export function SpeechInputSettings() {
  const [mode, setMode] = useState<SpeechInputMode>(getSpeechInputMode);
  const [azureReady, setAzureReady] = useState(false);

  useEffect(() => {
    let canceled = false;
    void getSpeechProxyConfig().then((config) => {
      if (canceled) return;
      setAzureReady(config.ready);
      const normalized = normalizeSpeechInputMode(getSpeechInputMode(), config.ready);
      if (normalized !== mode) {
        setMode(normalized);
        setSpeechInputMode(normalized);
      }
    });
    return () => {
      canceled = true;
    };
  }, [mode]);

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        语音
      </h2>
      <div className="as-settings-group">
        <div className="as-settings-item gap-3">
          <Speech className="h-4 w-4 shrink-0 text-muted-foreground" />
          <label htmlFor="speech-input-mode" className="min-w-0 flex-1 text-body">
            语音识别方式
          </label>
          <select
            id="speech-input-mode"
            value={mode}
            onChange={(event) => {
              const next = event.target.value as SpeechInputMode;
              setMode(next);
              setSpeechInputMode(next);
            }}
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground"
          >
            {getSpeechInputModeOptions(azureReady).map((option) => (
              <option key={option} value={option}>{LABELS[option]}</option>
            ))}
          </select>
        </div>
        <p className="px-4 pb-3 text-helper">
          自动模式优先使用浏览器语音；移动设备也可选择系统键盘的麦克风。
        </p>
      </div>
    </section>
  );
}
