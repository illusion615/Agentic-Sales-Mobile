import { motion } from 'motion/react';
import { Building2, Phone, Mail, ChevronRight } from 'lucide-react';
import { MobileLayout } from '@/components/mobile-layout';
import { GlassListItem } from '@/components/glass-card';

// Placeholder data - will be replaced with Dataverse data
const accounts = [
  {
    id: '1',
    name: '华为技术有限公司',
    industry: '信息技术',
    phone: '+86 755-2878-0000',
    email: 'contact@huawei.com',
    status: 'active',
  },
  {
    id: '2',
    name: '阿里巴巴集团',
    industry: '电子商务',
    phone: '+86 571-8502-2088',
    email: 'contact@alibaba.com',
    status: 'active',
  },
  {
    id: '3',
    name: '腾讯科技',
    industry: '互联网',
    phone: '+86 755-8601-3388',
    email: 'contact@tencent.com',
    status: 'prospect',
  },
  {
    id: '4',
    name: '字节跳动',
    industry: '互联网',
    phone: '+86 10-5765-8888',
    email: 'contact@bytedance.com',
    status: 'active',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  show: { opacity: 1, x: 0 },
} as const;

export default function AccountsPage() {
  return (
    <MobileLayout title="客户管理">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-3 py-4"
      >
        {/* Stats bar */}
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-between text-helper text-muted-foreground mb-2"
        >
          <span>共 {accounts.length} 个客户</span>
          <span className="text-[#0D8F8C]">语音查询可用</span>
        </motion.div>

        {/* Account list */}
        {accounts.map((account, index: number) => (
          <motion.div key={account.id} variants={itemVariants}>
            <GlassListItem>
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0D8F8C] to-[#14B8B4] flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-6 h-6 text-white" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-title text-foreground truncate">
                    {account.name}
                  </h3>
                  <p className="text-helper text-muted-foreground">
                    {account.industry}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-helper text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      <span className="truncate max-w-[100px]">
                        {account.phone}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Status & Arrow */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      account.status === 'active'
                        ? 'bg-[#0D8F8C]'
                        : 'bg-primary'
                    }`}
                  />
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </GlassListItem>
          </motion.div>
        ))}

        {/* Voice hint */}
        <motion.div
          variants={itemVariants}
          className="text-center text-helper text-muted-foreground pt-6"
        >
          <p>说 "查找华为" 快速搜索客户</p>
        </motion.div>
      </motion.div>
    </MobileLayout>
  );
}
