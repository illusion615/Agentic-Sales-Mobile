import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ActionDockChip {
  id: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

interface ActionDockState {
  chips: ActionDockChip[];
  slot: ReactNode | null;
  setChips: (chips: ActionDockChip[] | null) => void;
  setSlot: (node: ReactNode | null) => void;
}

const ActionDockContext = createContext<ActionDockState | null>(null);

export function ActionDockProvider({ children }: { children: ReactNode }) {
  const [chips, setChipsState] = useState<ActionDockChip[]>([]);
  const [slot, setSlotState] = useState<ReactNode | null>(null);

  const setChips = useCallback((next: ActionDockChip[] | null) => {
    setChipsState(next ?? []);
  }, []);

  const setSlot = useCallback((node: ReactNode | null) => {
    setSlotState(node);
  }, []);

  return (
    <ActionDockContext.Provider value={{ chips, slot, setChips, setSlot }}>
      {children}
    </ActionDockContext.Provider>
  );
}

export function useActionDock(): ActionDockState {
  const ctx = useContext(ActionDockContext);
  if (!ctx) {
    return {
      chips: [],
      slot: null,
      setChips: () => {},
      setSlot: () => {},
    };
  }
  return ctx;
}

/**
 * Register page-level chips into the ActionDock for the lifetime of the calling component.
 * Stable across renders: only re-fires when the chip id/label signature changes,
 * so callers don't need to memoize. The latest onClick closures are always used.
 */
export function useRegisterDockChips(chips: ActionDockChip[]): void {
  const { setChips } = useActionDock();
  const signature = chips.map((c) => `${c.id}|${c.label}`).join('||');
  const chipsRef = useRef(chips);
  chipsRef.current = chips;
  useEffect(() => {
    setChips(chipsRef.current);
    return () => setChips([]);
  }, [signature, setChips]);
}

export function useRegisterDockSlot(node: ReactNode | null, active: boolean): void {
  const { setSlot } = useActionDock();
  useEffect(() => {
    if (active) {
      setSlot(node);
      return () => setSlot(null);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
