import { useRegisterDockChips } from '@/contexts/action-dock-context';
import type { LucideIcon } from 'lucide-react';

export interface QuickAction {
  id: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

interface FloatingQuickActionsProps {
  actions: QuickAction[];
  visible?: boolean;
  className?: string;
}

/**
 * Registers page-scoped quick actions into the global ActionDock and renders nothing.
 * The dock (in CopilotPanel) renders the chips when the panel is collapsed.
 * `className` is accepted for backward compatibility but ignored.
 */
export function FloatingQuickActions({ actions, visible = true }: FloatingQuickActionsProps) {
  useRegisterDockChips(visible ? actions : []);
  return null;
}
