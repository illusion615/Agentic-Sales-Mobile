import { ReactNode } from 'react';
import { motion, HTMLMotionProps } from 'motion/react';
import { cn } from '@/lib/utils';

interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
  variant?: 'default' | 'hover' | 'surface';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

const variantClasses = {
  default: 'glass-card',
  hover: 'glass-card-hover',
  surface: 'glass-surface rounded-xl',
};

export function GlassCard({
  children,
  variant = 'default',
  padding = 'md',
  className,
  ...props
}: GlassCardProps) {
  return (
    <motion.div
      className={cn(
        variantClasses[variant],
        paddingClasses[padding],
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// Convenience wrapper for list items
interface GlassListItemProps extends GlassCardProps {
  onClick?: () => void;
}

export function GlassListItem({
  children,
  onClick,
  className,
  ...props
}: GlassListItemProps) {
  return (
    <GlassCard
      variant="hover"
      padding="md"
      onClick={onClick}
      className={cn(
        'cursor-pointer active:scale-[0.98] transition-transform',
        className
      )}
      whileTap={{ scale: 0.98 }}
      {...props}
    >
      {children}
    </GlassCard>
  );
}
