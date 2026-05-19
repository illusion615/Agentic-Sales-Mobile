import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { MobileLayout } from '@/components/mobile-layout';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/ui/button';
import { getLocale } from '@/lib/i18n';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const locale = getLocale();
  const isZh = locale === 'zh-Hans';

  return (
    <MobileLayout title={isZh ? '未找到' : 'Not Found'} hideVoiceButton>
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <GlassCard className="text-center max-w-xs">
            <div className="text-6xl mb-4">404</div>
            <h1 className="text-title text-foreground mb-2">{isZh ? '页面未找到' : 'Page not found'}</h1>
            <p className="text-body text-muted-foreground mb-6">
              {isZh ? '您访问的页面不存在或已被移除' : 'The page you requested does not exist or was removed'}
            </p>
            <Button
              onClick={() => navigate('/')}
              className="w-full accent-gradient border-0"
            >
              <Home className="w-4 h-4 mr-2" />
              {isZh ? '返回首页' : 'Back to Home'}
            </Button>
          </GlassCard>
        </motion.div>
      </div>
    </MobileLayout>
  );
}
