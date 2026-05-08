import { useState, useCallback, useRef } from 'react';
import { Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

interface VoiceMicButtonProps {
  onRecordStart?: () => void;
  onRecordEnd?: () => void;
  onRecordCancel?: () => void;
  className?: string;
}

export function VoiceMicButton({
  onRecordStart,
  onRecordEnd,
  onRecordCancel,
  className,
}: VoiceMicButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const startYRef = useRef<number>(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsRecording(true);
      setIsCancelling(false);
      startYRef.current = e.clientY;
      onRecordStart?.();
    },
    [onRecordStart]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isRecording) return;
    const deltaY = startYRef.current - e.clientY;
    // Swipe up 50px to cancel
    setIsCancelling(deltaY > 50);
  }, [isRecording]);

  const handlePointerUp = useCallback(() => {
    if (!isRecording) return;
    setIsRecording(false);
    
    if (isCancelling) {
      onRecordCancel?.();
    } else {
      onRecordEnd?.();
    }
    setIsCancelling(false);
  }, [isRecording, isCancelling, onRecordEnd, onRecordCancel]);

  const handlePointerLeave = useCallback(() => {
    if (isRecording) {
      setIsRecording(false);
      onRecordCancel?.();
      setIsCancelling(false);
    }
  }, [isRecording, onRecordCancel]);

  // Pulse animation for recording state
  const pulseAnimation = {
    scale: [1, 1.15, 1],
    transition: {
      duration: 1.2,
      repeat: Infinity,
      ease: "easeInOut" as const,
    },
  };

  return (
    <div
      className={cn(
        'relative',
        className
      )}
    >
      {/* Cancel hint */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={cn(
              'absolute -top-16 left-1/2 -translate-x-1/2 whitespace-nowrap',
              'px-4 py-2 rounded-full text-helper',
              isCancelling
                ? 'bg-destructive/20 text-destructive'
                : 'glass-card text-foreground'
            )}
          >
            {isCancelling ? '松开取消' : '上滑取消 · 正在录音...'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording ripple effect */}
      <AnimatePresence>
        {isRecording && !isCancelling && (
          <>
            <motion.div
              initial={{ scale: 1, opacity: 0.4 }}
              animate={{ scale: 2.5, opacity: 0 }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut" as const,
              }}
              className="absolute inset-0 rounded-full bg-primary/30"
            />
            <motion.div
              initial={{ scale: 1, opacity: 0.3 }}
              animate={{ scale: 2, opacity: 0 }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut" as const,
                delay: 0.3,
              }}
              className="absolute inset-0 rounded-full bg-primary/20"
            />
          </>
        )}
      </AnimatePresence>

      {/* Main button */}
      <motion.button
        ref={buttonRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        animate={isRecording && !isCancelling ? pulseAnimation : { scale: 1 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'relative w-14 h-14 rounded-full flex items-center justify-center',
          'shadow-lg shadow-primary/30',
          'touch-none select-none cursor-pointer',
          'transition-colors duration-200',
          isCancelling
            ? 'bg-destructive'
            : 'accent-gradient'
        )}
        style={{ touchAction: 'none' }}
        aria-label="按住录音"
      >
        <Mic
          className={cn(
            'w-6 h-6 transition-transform duration-200',
            isRecording ? 'text-white scale-110' : 'text-white'
          )}
        />
      </motion.button>
    </div>
  );
}
