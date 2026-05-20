import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, MoreHorizontal, FileText, Play, Pause, Mic, WifiOff, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { useBriefingList, useUpdateBriefing } from '@/generated/hooks/use-briefing';
import { getLocale, getSelectedVoice, findMatchingSystemVoice, voiceOptions, type Locale, type VoiceOption } from '@/lib/i18n';
import {
  parseBriefingPayload,
  priorityColors,
  type BriefingItem,
  type BriefingPayload,
} from '@/lib/briefing-types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

// Speed options
const SPEED_OPTIONS = [1.0, 1.25, 1.5, 2.0] as const;
type SpeedOption = typeof SPEED_OPTIONS[number];

// Format time mm:ss
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Get text for locale
function getText(obj: { zh: string; en: string }, locale: Locale): string {
  return locale === 'zh-Hans' ? obj.zh : obj.en;
}

export default function BriefMePage() {
  const navigate = useNavigate();
  const { data: user } = useUser();
  const locale: Locale = getLocale();
  
  // Briefing data
  const { data: briefings = [] } = useBriefingList();
  const updateBriefing = useUpdateBriefing();
  
  // State
  const [isOffline] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(160000); // 2:40 = 160s - will be recalculated
  const [playbackRate, setPlaybackRate] = useState<SpeedOption>(() => {
    const stored = localStorage.getItem('briefMeRate');
    return stored ? (parseFloat(stored) as SpeedOption) : 1.0;
  });
  const [followMode, setFollowMode] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voicesReady, setVoicesReady] = useState(false);
  
  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const followTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recordStartRef = useRef<number>(0);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const chapterStartTimeRef = useRef<number>(0);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  // Per-chapter speech-segment queue. Incremented on every cancel/new chapter
  // so an old chained onend cannot resume after the user paused or skipped.
  const chapterRunIdRef = useRef<number>(0);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Get today's briefing
  const briefing = useMemo(() => {
    const userId = user?.objectId;
    if (!userId) return undefined;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find today's briefing for current user
    let todayBriefing = briefings.find((b) => {
      const genDate = new Date(b.generatedon);
      genDate.setHours(0, 0, 0, 0);
      return b.ownerid === userId && genDate.getTime() === today.getTime();
    });
    
    // Offline fallback: use yesterday's
    if (!todayBriefing && isOffline) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      todayBriefing = briefings.find((b) => {
        const genDate = new Date(b.generatedon);
        genDate.setHours(0, 0, 0, 0);
        return b.ownerid === userId && genDate.getTime() === yesterday.getTime();
      });
    }
    
    // Fallback to any briefing for user
    if (!todayBriefing && briefings.length > 0) {
      todayBriefing = briefings.find((b) => b.ownerid === userId) || briefings[0];
    }
    
    return todayBriefing;
  }, [briefings, user, isOffline]);
  
  // Parse payload
  const payload: BriefingPayload | null = useMemo(() => {
    if (briefing?.payloadjson) {
      const parsed = parseBriefingPayload(briefing.payloadjson);
      if (parsed && parsed.items && parsed.items.length > 0) {
        return parsed;
      }
    }
    return null;
  }, [briefing]);
  
  const items = payload?.items || [];
  const currentItem = items[currentIndex];
  const totalChapters = items.length;
  
  // Load system TTS voices
  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setVoicesReady(false);
      return;
    }
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setVoicesReady(true);
      }
    };
    
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, []);
  
  // Get the matching system voice for TTS
  const getSystemVoice = useCallback(() => {
    const selectedVoiceId = getSelectedVoice();
    return findMatchingSystemVoice(selectedVoiceId, locale);
  }, [locale]);
  
  // Build paragraph-level segments for the current chapter so TTS has real
  // breathing room between thoughts. Browser SpeechSynthesis treats one
  // utterance as one breath; splitting + queuing gives ~paragraph rhythm.
  const buildSegments = useCallback((item: BriefingItem): string[] => {
    const out: string[] = [];
    const push = (s: string) => {
      const t = s.trim();
      if (t) out.push(t);
    };

    if (item.script) {
      const raw = getText(item.script, locale);
      // 1) split on hard newlines first (authored paragraph breaks)
      const paragraphs = raw.split(/\n+/).map((p) => p.trim()).filter(Boolean);
      paragraphs.forEach((p) => {
        // 2) for very long paragraphs (> 90 chars), further split on
        //    sentence terminators so listener still gets pauses
        if (p.length <= 90) {
          push(p);
          return;
        }
        const sentences = p.split(/(?<=[。！？.!?])\s+/).filter(Boolean);
        // group every 2 sentences into one segment to avoid being too choppy
        for (let i = 0; i < sentences.length; i += 2) {
          push(sentences.slice(i, i + 2).join(' '));
        }
      });
    } else {
      push(getText(item.headline, locale));
      push(getText(item.summary, locale));
      if (item.bullets && item.bullets.length > 0) {
        item.bullets.forEach((b) => push(getText(b, locale)));
      }
      if (item.context) push(getText(item.context, locale));
    }
    return out.length > 0 ? out : [getText(item.headline, locale)];
  }, [locale]);

  // Pause between paragraphs (ms). Stays at ~350ms even at higher rates so
  // the listener actually hears the break.
  const SEGMENT_PAUSE_MS = 350;

  // Speak one segment, then schedule the next. Aborts cleanly when
  // chapterRunIdRef changes (cancel/new chapter/rate change).
  const speakSegment = useCallback((segments: string[], index: number, runId: number) => {
    if (runId !== chapterRunIdRef.current) return;
    if (index >= segments.length) {
      // Whole chapter finished
      setIsSpeaking(false);
      utteranceRef.current = null;
      if (isPlaying && currentIndex < items.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else if (currentIndex === items.length - 1) {
        setIsPlaying(false);
      }
      return;
    }

    const utterance = new SpeechSynthesisUtterance(segments[index]);
    utterance.lang = locale === 'zh-Hans' ? 'zh-CN' : 'en-US';
    utterance.rate = playbackRate;
    utterance.pitch = 1;
    const voice = getSystemVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      if (runId !== chapterRunIdRef.current) return;
      setIsSpeaking(true);
    };
    utterance.onend = () => {
      if (runId !== chapterRunIdRef.current) return;
      // Insert a real pause between paragraphs before the next utterance.
      pauseTimerRef.current = setTimeout(() => {
        speakSegment(segments, index + 1, runId);
      }, SEGMENT_PAUSE_MS);
    };
    utterance.onerror = (e) => {
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      console.error('Speech error:', e);
      setIsSpeaking(false);
      utteranceRef.current = null;
      toast.error(locale === 'zh-Hans' ? '语音播放失败' : 'Speech playback failed');
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [locale, playbackRate, getSystemVoice, isPlaying, currentIndex, items.length]);

  // Speak current chapter content using TTS, paragraph by paragraph.
  const speakChapter = useCallback((item: BriefingItem) => {
    // Abort anything currently queued, then start a fresh run.
    window.speechSynthesis.cancel();
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    chapterRunIdRef.current += 1;
    const runId = chapterRunIdRef.current;

    if (!voicesReady) {
      toast.error(locale === 'zh-Hans' ? '语音引擎正在加载...' : 'Voice engine loading...');
      return;
    }

    const segments = buildSegments(item);
    chapterStartTimeRef.current = Date.now();
    speakSegment(segments, 0, runId);
  }, [voicesReady, locale, buildSegments, speakSegment]);
  
  // Auto-play on mount when data is ready
  const hasAutoPlayed = useRef(false);
  useEffect(() => {
    if (!hasAutoPlayed.current && voicesReady && currentItem && items.length > 0) {
      hasAutoPlayed.current = true;
      // Small delay to let page settle
      const timer = setTimeout(() => {
        setIsPlaying(true);
        speakChapter(currentItem);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [voicesReady, currentItem, items.length, speakChapter]);
  
  // Start/stop playback
  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      // Pause: bump the run id so any queued segment-chain aborts, then cancel.
      chapterRunIdRef.current += 1;
      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setIsSpeaking(false);
    } else {
      // Play
      setIsPlaying(true);
      if (currentItem) {
        speakChapter(currentItem);
      }
    }
  }, [isPlaying, currentItem, speakChapter]);
  
  // When currentIndex changes while playing, speak the new chapter
  useEffect(() => {
    if (isPlaying && currentItem && !isSpeaking) {
      speakChapter(currentItem);
    }
  }, [currentIndex]);
  
  // Update playback rate when it changes
  useEffect(() => {
    // If currently speaking, we need to restart with new rate
    if (isSpeaking && currentItem) {
      window.speechSynthesis.cancel();
      setTimeout(() => {
        if (isPlaying) {
          speakChapter(currentItem);
        }
      }, 100);
    }
  }, [playbackRate]);
  
  // Simulate time progress for visual feedback
  useEffect(() => {
    if (!isSpeaking || items.length === 0) return;
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - chapterStartTimeRef.current;
      const chapterDuration = currentItem ? (currentItem.time_range.end_ms - currentItem.time_range.start_ms) : 25000;
      const progress = Math.min(elapsed / (chapterDuration / playbackRate), 1);
      setCurrentTime(currentItem ? currentItem.time_range.start_ms + progress * chapterDuration : 0);
    }, 100);
    
    return () => clearInterval(interval);
  }, [isSpeaking, currentItem, playbackRate, items.length]);
  
  // Auto-advance chapters based on time
  useEffect(() => {
    if (!followMode || items.length === 0) return;
    
    const itemIndex = items.findIndex((item) => 
      currentTime >= item.time_range.start_ms && currentTime < item.time_range.end_ms
    );
    
    if (itemIndex !== -1 && itemIndex !== currentIndex) {
      setCurrentIndex(itemIndex);
    }
  }, [currentTime, items, followMode, currentIndex]);
  
  // Save position on unmount
  useEffect(() => {
    return () => {
      if (briefing && currentTime > 0) {
        updateBriefing.mutate({
          id: briefing.id,
          changedFields: { lastposition: currentTime / 1000 },
        });
      }
    };
  }, [briefing, currentTime]);
  
  // Speed toggle
  const cycleSpeed = useCallback(() => {
    const idx = SPEED_OPTIONS.indexOf(playbackRate);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setPlaybackRate(next);
    localStorage.setItem('briefMeRate', String(next));
    // No toast notification for speed change
  }, [playbackRate, locale]);
  
  // Chapter navigation
  const goToChapter = useCallback((index: number) => {
    if (index < 0 || index >= items.length) return;
    
    // Cancel current speech
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    
    // Pause follow mode temporarily
    setFollowMode(false);
    setCurrentIndex(index);
    setCurrentTime(items[index].time_range.start_ms);
    
    // If playing, start speaking the new chapter
    if (isPlaying) {
      setTimeout(() => {
        speakChapter(items[index]);
      }, 100);
    }
    
    // Resume follow after 30s
    if (followTimeoutRef.current) clearTimeout(followTimeoutRef.current);
    followTimeoutRef.current = setTimeout(() => {
      setFollowMode(true);
    }, 30000);
  }, [items, isPlaying, speakChapter]);
  
  // Double tap to resume follow
  const handleCardDoubleClick = useCallback(() => {
    setFollowMode(true);
    if (followTimeoutRef.current) {
      clearTimeout(followTimeoutRef.current);
      followTimeoutRef.current = null;
    }
  }, []);
  
  // Swipe handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!swipeStartRef.current) return;
    
    const dx = e.clientX - swipeStartRef.current.x;
    const dy = e.clientY - swipeStartRef.current.y;
    
    // Horizontal swipe detection
    if (Math.abs(dx) >= 60 && Math.abs(dx) >= 1.5 * Math.abs(dy)) {
      if (dx > 0 && currentIndex > 0) {
        goToChapter(currentIndex - 1);
      } else if (dx < 0 && currentIndex < items.length - 1) {
        goToChapter(currentIndex + 1);
      }
    }
    
    swipeStartRef.current = null;
  }, [currentIndex, items.length, goToChapter]);
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToChapter(currentIndex - 1);
      if (e.key === 'ArrowRight') goToChapter(currentIndex + 1);
      if (e.key === ' ') {
        e.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, goToChapter, togglePlayback]);
  
  // Mic handlers
  const handleMicDown = useCallback(() => {
    if (isOffline) {
      toast.error(locale === 'zh-Hans' ? '离线无法提问' : 'Cannot ask while offline');
      return;
    }
    recordStartRef.current = Date.now();
  }, [isOffline, locale]);
  
  const handleMicUp = useCallback(() => {
    const held = Date.now() - recordStartRef.current;
    if (held >= 300) {
      setIsRecording(false);
      setIsPlaying(false);
      // Navigate to copilot with context
      navigate('/copilot-chat', { 
        state: { 
          briefItemId: currentItem?.id,
          context: currentItem?.headline 
        } 
      });
    }
  }, [currentItem, navigate]);
  

  
  // Waveform bars (simulated)
  const waveformBars = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => {
      const base = 0.3 + Math.random() * 0.7;
      return { height: base * (isPlaying ? (0.5 + Math.sin(i + currentTime / 200) * 0.5) : 0.3) };
    });
  }, [isPlaying, Math.floor(currentTime / 500)]);
  
  // Header title
  const headerTitle = locale === 'zh-Hans' 
    ? `今日简报 · ${totalChapters} 章节 ${formatTime(duration)}`
    : `Daily Briefing · ${totalChapters} chapters ${formatTime(duration)}`;
  
  if (!payload || items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
        <p className="text-muted-foreground text-base">
          {locale === 'zh-Hans' ? '暂无播报内容' : 'No briefing available'}
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {locale === 'zh-Hans' ? '返回首页' : 'Back to Home'}
        </button>
      </div>
    );
  }
  
  const prioColors = currentItem?.priority ? priorityColors[currentItem.priority] : priorityColors.info;
  
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Offline Banner */}
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-500/90 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium safe-area-top"
          >
            <WifiOff className="w-4 h-4" />
            <span>{locale === 'zh-Hans' ? '离线 · 显示最近一次缓存' : 'Offline · showing cached data'}</span>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 glass-surface border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-base font-semibold text-foreground text-center flex-1 mx-2 truncate">
            {headerTitle}
          </h1>
          <Sheet open={transcriptOpen} onOpenChange={setTranscriptOpen}>
            <SheetTrigger asChild>
              <button
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
                aria-label="Transcript"
              >
                <FileText className="w-5 h-5 text-foreground" />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[70vh] bg-background border-t border-border">
              <SheetHeader>
                <SheetTitle className="text-foreground">
                  {locale === 'zh-Hans' ? '文字稿' : 'Transcript'}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 overflow-y-auto scrollbar-hide max-h-[calc(70vh-80px)]">
                {items.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      goToChapter(idx);
                      setTranscriptOpen(false);
                    }}
                    className={cn(
                      'w-full text-left p-3 rounded-xl transition-colors',
                      idx === currentIndex 
                        ? 'bg-primary/20 border border-primary/30' 
                        : 'bg-muted hover:bg-muted/80'
                    )}
                  >
                    <p className="text-sm text-muted-foreground mb-1">
                      {String(idx + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')} · {formatTime(item.time_range.start_ms)}
                    </p>
                    <p className="text-base text-foreground">
                      {getText(item.headline, locale)}
                    </p>
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      
      {/* Main Content */}
      <main 
        ref={containerRef}
        className="flex-1 pt-16 pb-40 px-5 flex flex-col overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {/* BriefCard */}
        <AnimatePresence mode="wait">
          <motion.article
            key={currentIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            onDoubleClick={handleCardDoubleClick}
            role="article"
            aria-roledescription={locale === 'zh-Hans' ? '播报章节' : 'briefing chapter'}
            className="flex-1 flex flex-col glass-card overflow-hidden"
            style={{
              background: `linear-gradient(180deg, ${prioColors.bg} 0%, rgba(255,255,255,0.03) 100%)`,
              borderColor: prioColors.border,
            }}
          >
            {/* Card Header */}
            <div className="p-5 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <span 
                  className="px-3 py-1 rounded-full text-sm font-medium"
                  style={{ background: prioColors.bg, color: prioColors.text, border: `1px solid ${prioColors.border}` }}
                >
                  {currentItem.priority.toUpperCase()}
                </span>
                <span className="text-sm text-muted-foreground font-mono">
                  {String(currentItem.pos.index).padStart(2, '0')} / {String(currentItem.pos.total).padStart(2, '0')} · {formatTime(currentItem.time_range.start_ms)}–{formatTime(currentItem.time_range.end_ms)}
                </span>
              </div>
              
              {/* Headline */}
              <h2 className="text-lg font-semibold text-foreground leading-snug mb-3">
                {getText(currentItem.headline, locale)}
              </h2>
              
              {/* Summary */}
              <p className="text-base text-muted-foreground leading-relaxed">
                {getText(currentItem.summary, locale)}
              </p>
            </div>
            
            {/* Bullets */}
            {currentItem.bullets && currentItem.bullets.length > 0 && (
              <div className="px-5 pb-4 space-y-2">
                {currentItem.bullets.slice(0, 2).map((bullet, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div 
                      className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                      style={{ background: prioColors.dot }}
                    />
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {getText(bullet, locale)}
                    </p>
                  </div>
                ))}
              </div>
            )}
            
            {/* Metrics */}
            {currentItem.metrics && currentItem.metrics.length > 0 && (
              <div className="px-5 pb-4 flex flex-wrap gap-2">
                {currentItem.metrics.slice(0, 4).map((metric, idx) => (
                  <div 
                    key={idx}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm font-medium',
                      'flex items-center gap-1.5',
                      metric.dir === 'up' && 'bg-[#0D8F8C]/15 text-[#14B8B4]',
                      metric.dir === 'down' && 'bg-red-500/15 text-red-400',
                      metric.dir === 'flat' && 'bg-white/5 text-foreground/70'
                    )}
                  >
                    <span>{getText(metric.label, locale)}</span>
                    <span className="font-semibold">{metric.value}</span>
                    {metric.dir === 'up' && <span>↑</span>}
                    {metric.dir === 'down' && <span>↓</span>}
                  </div>
                ))}
              </div>
            )}
            
            {/* Context + CTA */}
            {(currentItem.context || currentItem.cta) && (
              <div className="px-5 pb-4">
                {currentItem.context && (
                  <p className="text-sm text-muted-foreground mb-3">
                    ↳ {getText(currentItem.context, locale)}
                  </p>
                )}
                {currentItem.cta && (
                  <button
                    onClick={() => {
                      toast.info(getText(currentItem.cta!.label, locale));
                    }}
                    className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    {getText(currentItem.cta.label, locale)} →
                  </button>
                )}
              </div>
            )}
            
            {/* Spacer */}
            <div className="flex-1" />
            

          </motion.article>
        </AnimatePresence>
        
        {/* Stage Dots */}
        <div 
          className="flex justify-center gap-2 mt-4"
          role="tablist"
          aria-label={locale === 'zh-Hans' ? '章节导航' : 'Chapter navigation'}
        >
          {items.map((_, idx) => (
            <button
              key={idx}
              role="tab"
              aria-selected={idx === currentIndex}
              onClick={() => goToChapter(idx)}
              className={cn(
                'transition-all duration-200',
                idx === currentIndex
                  ? 'w-6 h-2 rounded-full bg-primary'
                  : 'w-2 h-2 rounded-full bg-foreground/20 hover:bg-foreground/30'
              )}
              aria-label={`${locale === 'zh-Hans' ? '章节' : 'Chapter'} ${idx + 1}`}
            />
          ))}
        </div>
        
        {/* Swipe Hint */}
        <p className="text-center text-sm text-muted-foreground mt-4">
          {locale === 'zh-Hans' ? '左右滑动 · 切换章节' : 'Swipe left/right · switch chapters'}
        </p>
      </main>
      
      {/* Bottom Mic Row */}
      {/* Bottom Controls */}
      <div className="fixed bottom-0 left-0 right-0 z-40 glass-surface border-t border-border safe-area-bottom">
        <div className="flex flex-col items-center px-4 pt-4 pb-2">
          {/* Control Row: Speed | Button | Duration */}
          <div className="grid grid-cols-3 items-center w-full max-w-[280px]">
            {/* Speed - left aligned */}
            <div className="flex justify-start">
              <button
                onClick={cycleSpeed}
                className="px-4 py-2 rounded-full bg-muted text-sm text-foreground font-medium hover:bg-muted/80 transition-colors"
              >
                {playbackRate}×
              </button>
            </div>
            
            {/* Center Button with Breathing Glow */}
            <div className="flex justify-center">
              <div className="relative flex items-center justify-center">
                {/* Breathing Glow */}
                <AnimatePresence>
                  {isRecording && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ 
                        opacity: [0.4, 0.8, 0.4], 
                        scale: [1, 1.25, 1],
                      }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ 
                        duration: 1.5, 
                        repeat: Infinity, 
                        ease: "easeInOut" as const 
                      }}
                      className="absolute w-14 h-14 rounded-full accent-gradient"
                      style={{ filter: 'blur(10px)' }}
                    />
                  )}
                </AnimatePresence>
                
                <motion.button
                  onPointerDown={(e: React.PointerEvent) => {
                    recordStartRef.current = Date.now();
                    const checkLongPress = setInterval(() => {
                      if (Date.now() - recordStartRef.current >= 500) {
                        setIsRecording(true);
                        window.speechSynthesis.cancel();
                        setIsPlaying(false);
                        setIsSpeaking(false);
                        clearInterval(checkLongPress);
                      }
                    }, 50);
                    (e.currentTarget as HTMLButtonElement).dataset.checkInterval = String(checkLongPress);
                  }}
                  onPointerUp={(e: React.PointerEvent) => {
                    const checkInterval = (e.currentTarget as HTMLButtonElement).dataset.checkInterval;
                    if (checkInterval) clearInterval(Number(checkInterval));
                    
                    const held = Date.now() - recordStartRef.current;
                    if (held >= 500 && isRecording) {
                      setIsRecording(false);
                      navigate('/copilot-chat', { 
                        state: { 
                          briefItemId: currentItem?.id,
                          context: currentItem?.headline 
                        } 
                      });
                    } else if (!isRecording) {
                      togglePlayback();
                    }
                  }}
                  onPointerLeave={(e: React.PointerEvent) => {
                    const checkInterval = (e.currentTarget as HTMLButtonElement).dataset.checkInterval;
                    if (checkInterval) clearInterval(Number(checkInterval));
                    setIsRecording(false);
                  }}
                  whileTap={{ scale: 0.95 }}
                  className="relative w-14 h-14 rounded-full flex items-center justify-center accent-gradient shadow-lg shadow-primary/30"
                  style={{ touchAction: 'none' }}
                  aria-label={isRecording ? (locale === 'zh-Hans' ? '录音中' : 'Recording') : (isPlaying ? 'Pause' : 'Play')}
                >
                  {isRecording ? (
                    <Mic className="w-6 h-6 text-white" />
                  ) : isSpeaking ? (
                    <Pause className="w-6 h-6 text-white" />
                  ) : isPlaying ? (
                    <Volume2 className="w-6 h-6 text-white animate-pulse" />
                  ) : (
                    <Play className="w-6 h-6 text-white ml-0.5" />
                  )}
                </motion.button>
              </div>
            </div>
            
            {/* Duration - right aligned */}
            <div className="flex justify-end">
              <span className="text-sm text-muted-foreground font-mono">
                {formatTime(currentTime)}/{formatTime(duration)}
              </span>
            </div>
          </div>
          
          {/* Hint */}
          <p className="text-sm text-muted-foreground mt-3">
            {isRecording 
              ? (locale === 'zh-Hans' ? '松开发送' : 'Release to send')
              : (locale === 'zh-Hans' ? '长按向Copilot提问' : 'Long press to ask Copilot')
            }
          </p>
          
          {/* Home Indicator */}
          <div className="w-[110px] h-1 rounded-full bg-muted mt-3" />
        </div>
      </div>
    </div>
  );
}
