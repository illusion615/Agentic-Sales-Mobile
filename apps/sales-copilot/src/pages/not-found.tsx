import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { MobileLayout } from '@/components/mobile-layout';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/ui/button';
import { getLocale, t } from '@/lib/i18n';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const locale = getLocale();

  return (
    <MobileLayout title={t('notFound', locale)} hideVoiceButton>
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <GlassCard className="text-center max-w-xs">
            <div className="text-6xl mb-4">404</div>
            <h1 className="text-title text-foreground mb-2">{t('pageNotFound', locale)}</h1>
            <p className="text-body text-muted-foreground mb-6">
              {t('pageNotFoundDesc', locale)}
            </p>
            <Button
              onClick={() => navigate('/')}
              className="w-full accent-gradient border-0"
            >
              <Home className="w-4 h-4 mr-2" />
              {t('backToHome', locale)}
            </Button>
          </GlassCard>
        </motion.div>
      </div>
    </MobileLayout>
  );
}
