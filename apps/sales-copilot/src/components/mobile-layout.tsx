import { ReactNode } from 'react';
import { MobileHeader } from './mobile-header';
import { VoiceMicButton } from './voice-mic-button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface MobileLayoutProps {
  title: string;
  children: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  onMore?: () => void;
  className?: string;
  hideVoiceButton?: boolean;
  headerRight?: ReactNode;
}

export function MobileLayout({
  title,
  children,
  showBack = true,
  onBack,
  onMore,
  className,
  hideVoiceButton = false,
  headerRight,
}: MobileLayoutProps) {
  const handleRecordStart = () => {
    toast.info('开始录音...', { duration: 1500 });
  };

  const handleRecordEnd = () => {
    toast.success('录音完成，正在处理...', { duration: 2000 });
  };

  const handleRecordCancel = () => {
    toast('录音已取消', { duration: 1500 });
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <MobileHeader
        title={title}
        showBack={showBack}
        onBack={onBack}
        onMore={onMore}
        headerRight={headerRight}
      />

      {/* Main content area with padding for header and mic button */}
      <main
        className={cn(
          'flex-1 pt-14 pb-24 px-4 overflow-y-auto scrollbar-hide',
          className
        )}
      >
        {children}
      </main>

      {/* Voice mic button */}
      {!hideVoiceButton && (
        <VoiceMicButton
          onRecordStart={handleRecordStart}
          onRecordEnd={handleRecordEnd}
          onRecordCancel={handleRecordCancel}
        />
      )}
    </div>
  );
}
