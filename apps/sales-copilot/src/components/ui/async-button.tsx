import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ButtonProps = React.ComponentProps<typeof Button>;

export interface AsyncButtonProps extends Omit<ButtonProps, 'onClick'> {
  /**
   * Async (or sync) click handler. While the returned promise is pending the
   * button is disabled, shows a spinner, and swaps to `loadingText` (if given) —
   * and re-entry is blocked so a second tap during the in-flight call is a no-op.
   */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  /**
   * External pending flag (e.g. a react-query `mutation.isPending`). When true,
   * the button shows the busy state even if the click handler isn't mid-flight.
   * Combine with `onClick` returning a promise for the most robust behaviour.
   */
  loading?: boolean;
  /** Text shown while busy. Falls back to the normal children when omitted. */
  loadingText?: React.ReactNode;
}

/**
 * A Button that owns the "async action" UX contract so individual call sites
 * don't each re-implement it (and forget a piece):
 *   1. re-entry guard — a second tap while busy is ignored;
 *   2. disabled while busy — also respects the caller's own `disabled`;
 *   3. visual feedback — a spinning Loader2 plus optional `loadingText`.
 *
 * Use for any button that fires a mutation / network write the user taps
 * interactively (Save / Complete / Delete / Submit / Confirm / Import).
 */
export const AsyncButton = React.forwardRef<HTMLButtonElement, AsyncButtonProps>(
  ({ onClick, loading, loadingText, disabled, children, className, ...rest }, ref) => {
    const [internalBusy, setInternalBusy] = React.useState(false);
    const busy = loading || internalBusy;

    const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
      if (busy || disabled || !onClick) return; // re-entry guard
      const result = onClick(e);
      if (result instanceof Promise) {
        setInternalBusy(true);
        try {
          await result;
        } finally {
          setInternalBusy(false);
        }
      }
    };

    return (
      <Button
        ref={ref}
        onClick={handleClick}
        disabled={disabled || busy}
        className={cn(className)}
        {...rest}
      >
        {busy ? (
          <>
            <Loader2 className="animate-spin" />
            {loadingText ?? children}
          </>
        ) : (
          children
        )}
      </Button>
    );
  },
);
AsyncButton.displayName = 'AsyncButton';
