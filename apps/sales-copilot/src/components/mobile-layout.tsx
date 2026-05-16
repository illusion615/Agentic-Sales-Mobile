import { ReactNode } from 'react';
import { MobileHeader } from './mobile-header';
import { cn } from '@/lib/utils';

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
  headerRight,
}: MobileLayoutProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <MobileHeader
        title={title}
        showBack={showBack}
        onBack={onBack}
        onMore={onMore}
        headerRight={headerRight}
      />

      {/* Main content area with padding for header */}
      <main
        className={cn(
          'flex-1 pt-14 pb-24 px-4 overflow-y-auto scrollbar-hide',
          className
        )}
      >
        {children}
      </main>
    </div>
  );
}
