import { motion, AnimatePresence } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { getCopilotInAllScreens, getLLMConfig } from '@/lib/i18n';
import { getCopilotConfig } from '@/services/copilot-service';
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
 * Unified floating quick actions component.
 * Displays pill-shaped action buttons in a centered row above the bottom navigation.
 * Use this component across all screens for consistent bottom action styling.
 * Automatically detects if copilot chat bar is visible and adjusts position.
 */
export function FloatingQuickActions({ 
  actions, 
  visible = true,
  className 
}: FloatingQuickActionsProps) {
  const location = useLocation();
  
  // Check if copilot bar would be visible (same logic as GlobalCopilot)
  const copilotConfig = getCopilotConfig();
  const llmConfig = getLLMConfig();
  const isCopilotConfigured = !!copilotConfig?.tokenEndpoint || (!!llmConfig?.enabled && !!llmConfig?.endpoint);
  const isHomePage = location.pathname === '/' || location.pathname === '/home';
  const isSettingsPage = location.pathname === '/settings';
  const copilotEnabled = getCopilotInAllScreens();
  const isCopilotBarVisible = !isSettingsPage && isCopilotConfigured && (isHomePage || copilotEnabled);

  if (actions.length === 0) return null;

  return (
    <div 
      className={cn(
        'fixed left-0 right-0 z-40 safe-area-bottom pointer-events-none',
        isCopilotBarVisible ? 'bottom-20' : 'bottom-0',
        className
      )} 
      style={{ background: 'linear-gradient(to top, var(--scm-gradient-start) 40%, transparent)' }}
    >
      <div className="flex flex-col items-center px-4 pb-4 pointer-events-auto">
        <AnimatePresence mode="wait">
          {visible && (
            <motion.div
              key="quick-actions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: 'easeOut' as const }}
              className="flex items-center justify-center gap-2 flex-wrap"
            >
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={action.onClick}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5',
                      'rounded-full glass-card-hover',
                      'text-xs font-medium text-foreground',
                      'active:scale-95 transition-transform'
                    )}
                  >
                    <Icon className="w-4 h-4 text-primary" />
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}