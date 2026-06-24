/**
 * ThinkingIndicator — respects the user's "Thinking Animation" setting.
 *
 * Renders a small inline animation used for:
 * - Active thinking steps in copilot conversations
 * - Task announce "in progress" indicators
 * - Any AI-processing spinner
 *
 * Styles: bounce | pulse | wave | fade | orbit (from settings)
 */
import { getThinkingDotStyle, type ThinkingDotStyle } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface ThinkingIndicatorProps {
  className?: string;
  /** Override the user's setting. */
  style?: ThinkingDotStyle;
}

export function ThinkingIndicator({ className, style: styleProp }: ThinkingIndicatorProps) {
  const dotStyle = styleProp ?? getThinkingDotStyle();

  switch (dotStyle) {
    case 'bounce':
      return (
        <span className={cn('inline-flex items-end gap-0.5 h-3', className)}>
          <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      );
    case 'pulse':
      return (
        <span className={cn('inline-block w-3 h-3 rounded-full bg-primary animate-pulse', className)} />
      );
    case 'wave':
      return (
        <span className={cn('inline-flex items-end gap-0.5 h-3', className)}>
          <span className="w-0.5 rounded-full bg-primary animate-pulse" style={{ height: '40%', animationDelay: '0ms' }} />
          <span className="w-0.5 rounded-full bg-primary animate-pulse" style={{ height: '70%', animationDelay: '100ms' }} />
          <span className="w-0.5 rounded-full bg-primary animate-pulse" style={{ height: '100%', animationDelay: '200ms' }} />
          <span className="w-0.5 rounded-full bg-primary animate-pulse" style={{ height: '70%', animationDelay: '300ms' }} />
          <span className="w-0.5 rounded-full bg-primary animate-pulse" style={{ height: '40%', animationDelay: '400ms' }} />
        </span>
      );
    case 'fade':
      return (
        <span className={cn('inline-flex items-center gap-1 h-3', className)}>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDuration: '1.4s', animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDuration: '1.4s', animationDelay: '200ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDuration: '1.4s', animationDelay: '400ms' }} />
        </span>
      );
    case 'orbit':
    default:
      return (
        <span className={cn('inline-block w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin', className)} />
      );
  }
}
