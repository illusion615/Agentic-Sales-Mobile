import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { MobileLayout } from '@/components/mobile-layout';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <MobileLayout title="未找到" hideVoiceButton>
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <GlassCard className="text-center max-w-xs">
            <div className="text-6xl mb-4">404</div>
            <h1 className="text-title text-foreground mb-2">页面未找到</h1>
            <p className="text-body text-muted-foreground mb-6">
              您访问的页面不存在或已被移除
            </p>
            <Button
              onClick={() => navigate('/')}
              className="w-full accent-gradient border-0"
            >
              <Home className="w-4 h-4 mr-2" />
              返回首页
            </Button>
          </GlassCard>
        </motion.div>
      </div>
    </MobileLayout>
  );
}
