import { useEffect, useState } from 'react';
import { PartyPopper, Sparkles, TrendingUp, Wrench, type LucideIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CURRENT_RELEASE, CURRENT_VERSION, type ChangeKind } from '@/data/changelog';
import { fireFeedback } from '@/lib/feedback';
import { getOnboardingDone } from '@/lib/onboarding';
import { getLocale, pickLabel, t } from '@/lib/i18n';

const SEEN_KEY = 'whatsNewSeenVersion';
const WHATS_NEW_OPEN_EVENT = 'whats-new-open';

/** Open the What's New dialog on demand (e.g. from Help & Feedback). */
export function openWhatsNew(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(WHATS_NEW_OPEN_EVENT));
  }
}

const KIND_META: Record<ChangeKind, { Icon: LucideIcon; color: string }> = {
  feature: { Icon: Sparkles, color: 'text-primary' },
  improvement: { Icon: TrendingUp, color: 'text-emerald-500' },
  fix: { Icon: Wrench, color: 'text-amber-500' },
};

/**
 * "What's New" — shown once after an app update, listing the current release's
 * user-facing highlights and celebrating with the milestone feedback animation.
 *
 * Brand-new users (onboarding not yet completed) are shown the onboarding tour
 * instead; this release is marked seen silently for them so they only meet
 * What's New on the NEXT update.
 */
export function WhatsNew() {
  const [open, setOpen] = useState(false);
  const locale = getLocale();

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      /* ignore */
    }
    if (seen === CURRENT_VERSION) return; // already seen this release

    // First-time users get onboarding, not a changelog they have no context for.
    if (!getOnboardingDone()) {
      try {
        localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
      } catch {
        /* ignore */
      }
      return;
    }

    // Let the app paint first, then reveal + celebrate.
    const timer = setTimeout(() => {
      setOpen(true);
      fireFeedback('milestone');
    }, 900);
    return () => clearTimeout(timer);
  }, []);

  // Manual open (e.g. from Help & Feedback) — always shows, no gating/confetti.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(WHATS_NEW_OPEN_EVENT, handler);
    return () => window.removeEventListener(WHATS_NEW_OPEN_EVENT, handler);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full accent-gradient flex items-center justify-center shrink-0">
              <PartyPopper className="w-5 h-5 text-white" />
            </div>
            <div className="text-left min-w-0">
              <DialogTitle className="text-base">{t('whatsNewTitle', locale)}</DialogTitle>
              <DialogDescription className="text-xs truncate">
                v{CURRENT_RELEASE.version} · {pickLabel(CURRENT_RELEASE.title, locale)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2.5 max-h-[50vh] overflow-y-auto py-1">
          {CURRENT_RELEASE.items.map((item, i) => {
            const { Icon, color } = KIND_META[item.kind];
            return (
              <div key={i} className="flex items-start gap-2.5">
                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', color)} />
                <p className="text-sm text-foreground/90 leading-snug">{pickLabel(item, locale)}</p>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button onClick={dismiss} className="w-full">{t('whatsNewGotIt', locale)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
