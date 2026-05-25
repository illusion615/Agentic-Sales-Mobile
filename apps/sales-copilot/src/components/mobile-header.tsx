import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface MobileHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  onMore?: () => void;
  className?: string;
  headerRight?: ReactNode;
}

export function MobileHeader({
  title,
  showBack = true,
  onBack,
  onMore,
  className,
  headerRight,
}: MobileHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  
  const isHomePage = location.pathname === '/';
  const shouldShowBack = showBack && !isHomePage;

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (window.history.state && window.history.state.idx > 0) {
      // Has navigation history, go back
      navigate(-1);
    } else {
      // No history, go to home
      navigate('/');
    }
  };

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 safe-area-top',
        'h-14 px-4 flex items-center justify-between',
        'bg-background/80 backdrop-blur-md border-b border-border/50',
        className
      )}
    >
      {/* Left: Back button */}
      <div className="w-10 flex items-center justify-start">
        {shouldShowBack && (
          <button
            type="button"
            onClick={handleBack}
            className="w-10 h-10 flex items-center justify-center transition-all cursor-pointer hover:brightness-150"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
        )}
      </div>

      {/* Center: Title */}
      <h1 className="text-title text-foreground text-center flex-1 truncate px-2">
        {title}
      </h1>

      {/* Right: Custom header right or More button */}
      <div className="min-w-10 flex items-center justify-end">
        {headerRight ? (
          headerRight
        ) : (
          <button
            onClick={onMore}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
            aria-label="More"
          >
            <MoreHorizontal className="w-5 h-5 text-foreground" />
          </button>
        )}
      </div>
    </header>
  );
}
