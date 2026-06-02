import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Building2, ExternalLink, FileText, Sparkles, Target } from 'lucide-react';
import { MobileLayout } from '@/components/mobile-layout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useProductList, useAccountList, useOpportunityList, useActivityList } from '@/generated/hooks';
import type { Product } from '@/generated/models/product-model';import type { Account } from '@/generated/models/account-model';import type { Opportunity } from '@/generated/models/opportunity-model';import type { Activity } from '@/generated/models/activity-model';import { imageFallbackByCategory, type ImageFallbackCategory } from '@/lib/product-images';
import { useCopilot } from '@/contexts/copilot-context';
import { getLocale } from '@/lib/i18n';
import { useFirstMount } from '@/hooks/use-first-mount';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
} as const;

function getProductImage(product: Product): string {
  const category = product.category as ImageFallbackCategory;
  return product.imageURL.startsWith('https://example.com/')
    ? imageFallbackByCategory[category] ?? imageFallbackByCategory.default
    : product.imageURL;
}

function parseBulletLines(text: string): string[] {
  return text
    .split('\n')
    .map((line: string) => line.replace(/^•\s*/, '').trim())
    .filter((line: string) => line.length > 0);
}

function getStageLabel(stage: string): string {
  const stageMap: Record<string, string> = {
    StageKey0: 'Prospecting',
    StageKey1: 'Qualification',
    StageKey2: 'Proposal',
    StageKey3: 'Negotiation',
    StageKey4: 'Won',
    StageKey5: 'Lost',
  };
  return stageMap[stage] || stage;
}

function getActivityTypeLabel(type: string): string {
  return type;
}

function getDraftStatusLabel(status: string): string {
  return status;
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const firstMount = useFirstMount(`product-detail:${id ?? ''}`);

  const { data: products = [], isLoading: productsLoading } = useProductList();
  const { data: accounts = [] } = useAccountList();
  const locale = getLocale();

  // Copilot context for agent awareness
  const copilot = useCopilot();
  const { data: opportunities = [] } = useOpportunityList();
  const { data: activities = [] } = useActivityList();

  const product = useMemo(() => {
    return products.find((p: Product) => p.id === id) ?? null;
  }, [products, id]);

  // Find opportunities that mention this product in their name or account
  const relatedOpportunities = useMemo(() => {
    if (!product) return [];
    return opportunities.filter((opp: Opportunity) =>
      opp.name1?.toLowerCase().includes(product.productName.toLowerCase()) ||
      opp.name1?.toLowerCase().includes(product.category.toLowerCase())
    );
  }, [opportunities, product]);

  // Find accounts linked to related opportunities
  const relatedAccounts = useMemo(() => {
    const accountIds = new Set(relatedOpportunities.map((opp: Opportunity) => opp.account?.id).filter(Boolean));
    return accounts.filter((acc: Account) => accountIds.has(acc.id));
  }, [accounts, relatedOpportunities]);

  // Find activities linked to related accounts
  const relatedActivities = useMemo(() => {
    const accountIds = new Set(relatedAccounts.map((acc: Account) => acc.id));
    return activities.filter((act: Activity) => act.account?.id && accountIds.has(act.account.id)).slice(0, 5);
  }, [activities, relatedAccounts]);

  // Set page context for Copilot agent awareness
  useEffect(() => {
    if (!product) return;
    
    copilot.setPageContext({
      currentPage: locale === 'zh-Hans' ? '产品详情' : 'Product Detail',
      summary: locale === 'zh-Hans'
        ? `查看产品: ${product.productName}，类别: ${product.category}，关联客户: ${relatedAccounts.length}个，关联商机: ${relatedOpportunities.length}个`
        : `Viewing product: ${product.productName}, Category: ${product.category}, Related accounts: ${relatedAccounts.length}, Related opportunities: ${relatedOpportunities.length}`,
      pageData: {
        productId: product.id,
        productName: product.productName,
        category: product.category,
        summary: product.summary,
        featureHighlight: product.featureHighlight,
        specification: product.specification,
        productURL: product.productURL,
        relatedAccountsCount: relatedAccounts.length,
        relatedOpportunitiesCount: relatedOpportunities.length,
        relatedActivitiesCount: relatedActivities.length,
      },
    });
    
    return () => {
      copilot.setPageContext(null);
    };
  }, [product, relatedAccounts.length, relatedOpportunities.length, relatedActivities.length, locale, copilot.setPageContext]);


  const featureItems = product ? parseBulletLines(product.featureHighlight) : [];
  const specificationItems = product ? parseBulletLines(product.specification) : [];

  if (productsLoading) {
    return (
      <MobileLayout title="Product">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </MobileLayout>
    );
  }

  if (!product) {
    return (
      <MobileLayout title="Product">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="text-muted-foreground">Product not found</div>
          <Button variant="outline" onClick={() => navigate('/products')}>
            Back to Products
          </Button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout
      title={product.productName}
      hideVoiceButton
      headerRight={
        <button
          type="button"
          onClick={() => window.open(product.productURL, '_blank', 'noopener,noreferrer')}
          className="w-10 h-10 flex items-center justify-center transition-all cursor-pointer hover:brightness-150"
          aria-label="Open product reference"
        >
          <ExternalLink className="w-5 h-5 text-foreground" />
        </button>
      }
    >
      <div className="flex-1 overflow-y-auto pb-24">
        <motion.div
          variants={containerVariants}
          initial={firstMount ? 'hidden' : false}
          animate="show"
          className="space-y-4 py-4"
        >
          {/* Product Detail Card */}
          <motion.section variants={itemVariants} className="glass-card overflow-hidden">
            <div className="relative">
              <img
                src={getProductImage(product)}
                alt={product.productName}
                className="w-full h-48 object-cover"
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  e.currentTarget.src = imageFallbackByCategory.default;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-3 right-3">
                <span className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-2.5 py-1 text-[10px] font-medium">
                  {product.category}
                </span>
                <h2 className="text-lg font-semibold text-white mt-1">{product.productName}</h2>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-muted-foreground">{product.summary}</p>

              <div className="rounded-2xl bg-card border border-border/60 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-card-foreground">Feature highlights</h3>
                </div>
                <div className="space-y-2">
                  {featureItems.map((item: string, index: number) => (
                    <div key={`feature-${index}`} className="flex gap-2 text-sm text-card-foreground">
                      <span className="mt-1 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-card border border-border/60 p-4">
                <h3 className="text-sm font-semibold text-card-foreground mb-3">Specifications</h3>
                <div className="space-y-2">
                  {specificationItems.map((item: string, index: number) => (
                    <div key={`spec-${index}`} className="flex gap-2 text-sm text-card-foreground">
                      <span className="mt-1 h-2 w-2 rounded-full bg-accent flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.section>

          {/* Related Items Tabs */}
          <motion.section variants={itemVariants} className="space-y-3">
            <Tabs defaultValue="accounts" className="w-full">
              <TabsList className="w-full grid grid-cols-3 bg-card/60 backdrop-blur-sm">
                <TabsTrigger value="accounts" className="text-xs">
                  <Building2 className="w-3.5 h-3.5 mr-1.5" />
                  Accounts ({relatedAccounts.length})
                </TabsTrigger>
                <TabsTrigger value="opportunities" className="text-xs">
                  <Target className="w-3.5 h-3.5 mr-1.5" />
                  Opps ({relatedOpportunities.length})
                </TabsTrigger>
                <TabsTrigger value="activities" className="text-xs">
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  Activities ({relatedActivities.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="accounts" className="mt-3 space-y-2">
                {relatedAccounts.length > 0 ? (
                  relatedAccounts.map((account: Account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => navigate(`/accounts/${account.id}`)}
                      className="w-full text-left glass-card p-3 transition-colors cursor-pointer hover:bg-card/90"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">{account.name1}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {account.industry || 'No industry'}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">{account.industry}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="glass-card p-6 text-center">
                    <p className="text-sm text-muted-foreground">No related accounts found</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="opportunities" className="mt-3 space-y-2">
                {relatedOpportunities.length > 0 ? (
                  relatedOpportunities.map((opp: Opportunity) => (
                    <button
                      key={opp.id}
                      type="button"
                      onClick={() => navigate(`/opportunities/${opp.id}`)}
                      className="w-full text-left glass-card p-3 transition-colors cursor-pointer hover:bg-card/90"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-foreground truncate">{opp.name1}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {getStageLabel(opp.stage)} • ${(opp.totalamount / 1000).toFixed(0)}K
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">{opp.confidence ?? 0}%</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="glass-card p-6 text-center">
                    <p className="text-sm text-muted-foreground">No related opportunities found</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="activities" className="mt-3 space-y-2">
                {relatedActivities.length > 0 ? (
                  relatedActivities.map((activity: Activity) => (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => navigate(`/activities/${activity.id}`)}
                      className="w-full text-left glass-card p-3 transition-colors cursor-pointer hover:bg-card/90"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-foreground truncate">{activity.title}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {getActivityTypeLabel(activity.type)} • {new Date(activity.scheduleddate).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">{getDraftStatusLabel(activity.status)}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="glass-card p-6 text-center">
                    <p className="text-sm text-muted-foreground">No related activities found</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </motion.section>
        </motion.div>
      </div>
    </MobileLayout>
  );
}
