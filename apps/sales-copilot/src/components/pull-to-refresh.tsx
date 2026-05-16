import { useState, useRef, useCallback, type ReactNode } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { Loader2, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  className?: string;
  /** Threshold in pixels to trigger refresh */
  threshold?: number;
  /** Whether refresh is currently happening (controlled externally) */
  isRefreshing?: boolean;
}

export function PullToRefresh({
  children,
  onRefresh,
  className,
  threshold = 80,
  isRefreshing: externalIsRefreshing,
}: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  
  const pullDistance = useMotionValue(0);
  const pullProgress = useTransform(pullDistance, [0, threshold], [0, 1]);
  const indicatorOpacity = useTransform(pullDistance, [0, threshold * 0.3], [0, 1]);
  const indicatorScale = useTransform(pullDistance, [0, threshold], [0.5, 1]);
  const indicatorRotation = useTransform(pullDistance, [0, threshold], [0, 180]);
  
  const refreshing = externalIsRefreshing ?? isRefreshing;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    const container = containerRef.current;
    if (!container) return;
    
    // Only enable pull-to-refresh when scrolled to top
    if (container.scrollTop > 0) return;
    
    startY.current = e.touches[0].clientY;
    setIsPulling(true);
  }, [refreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || refreshing) return;
    const container = containerRef.current;
    if (!container) return;
    
    // Only allow pull when at top
    if (container.scrollTop > 0) {
      setIsPulling(false);
      pullDistance.set(0);
      return;
    }
    
    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;
    
    if (diff > 0) {
      // Apply resistance - the further you pull, the harder it gets
      const resistance = 0.5;
      const distance = Math.min(diff * resistance, threshold * 1.5);
      pullDistance.set(distance);
      
      // Prevent default scroll behavior when pulling down
      if (diff > 10) {
        e.preventDefault();
      }
    }
  }, [isPulling, refreshing, threshold, pullDistance]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;
    setIsPulling(false);
    
    const distance = pullDistance.get();
    
    if (distance >= threshold && !refreshing) {
      // Trigger refresh
      setIsRefreshing(true);
      animate(pullDistance, threshold * 0.6, { duration: 0.2 });
      
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        animate(pullDistance, 0, { duration: 0.3 });
      }
    } else {
      // Snap back
      animate(pullDistance, 0, { duration: 0.3 });
    }
  }, [isPulling, pullDistance, threshold, refreshing, onRefresh]);

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-y-auto', className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 z-10 flex items-center justify-center"
        style={{
          top: 8,
          opacity: indicatorOpacity,
          scale: indicatorScale,
        }}
      >
        <div className="w-10 h-10 rounded-full bg-background border border-border shadow-lg flex items-center justify-center">
          {refreshing ? (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          ) : (
            <motion.div style={{ rotate: indicatorRotation }}>
              <ArrowDown className="w-5 h-5 text-muted-foreground" />
            </motion.div>
          )}
        </div>
      </motion.div>
      
      {/* Content with pull offset */}
      <motion.div
        style={{
          y: useTransform(pullDistance, (v: number) => Math.min(v * 0.5, threshold * 0.4)),
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
