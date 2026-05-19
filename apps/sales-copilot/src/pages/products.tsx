import { useMemo, useState, useEffect, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ChevronRight, Search } from 'lucide-react';
import { MobileLayout } from '@/components/mobile-layout';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { InMemoryDataBanner } from '@/generated/components/in-memory-data-banner';
import { HAS_IN_MEMORY_TABLES, useProductList } from '@/generated/hooks';
import type { Product } from '@/generated/models/product-model';
import { imageFallbackByCategory, type ImageFallbackCategory } from '@/lib/product-images';
import { useCopilot } from '@/contexts/copilot-context';
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

export default function ProductsPage() {
  const navigate = useNavigate();
  const firstMount = useFirstMount('products');
  const { data: products = [], isLoading } = useProductList({
    orderBy: ['sortOrder asc'],
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Carousel state for featured products gallery
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [carouselIndex, setCarouselIndex] = useState(0);

  const categories = useMemo(() => {
    return Array.from(new Set(products.map((product: Product) => product.category))).sort((a: string, b: string) => a.localeCompare(b));
  }, [products]);

  // Featured products for the gallery (top 5 by sort order)
  const featuredProducts = useMemo(() => {
    return [...products].slice(0, 5);
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product: Product) => {
      const normalizedQuery = searchQuery.trim().toLowerCase();
      const matchesSearch =
        normalizedQuery.length === 0 ||
        product.productName.toLowerCase().includes(normalizedQuery) ||
        product.summary.toLowerCase().includes(normalizedQuery) ||
        product.featureHighlight.toLowerCase().includes(normalizedQuery) ||
        product.specification.toLowerCase().includes(normalizedQuery);

      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [categoryFilter, products, searchQuery]);

  // Carousel auto-play and index tracking
  useEffect(() => {
    if (!carouselApi) return;

    const updateIndex = () => {
      setCarouselIndex(carouselApi.selectedScrollSnap());
    };

    updateIndex();
    carouselApi.on('select', updateIndex);
    carouselApi.on('reInit', updateIndex);

    // Auto-play: rotate products every 4 seconds
    const autoPlayInterval = setInterval(() => {
      if (!carouselApi) return;
      const totalCount = carouselApi.scrollSnapList().length;
      if (totalCount <= 1) return;
      const currentIndex = carouselApi.selectedScrollSnap();
      const nextIndex = (currentIndex + 1) % totalCount;
      carouselApi.scrollTo(nextIndex);
    }, 4000);

    return () => {
      carouselApi.off('select', updateIndex);
      carouselApi.off('reInit', updateIndex);
      clearInterval(autoPlayInterval);
    };
  }, [carouselApi]);

  // Copilot context
  const copilot = useCopilot();

  // Set page context for Copilot
  useEffect(() => {
    const categoryList = categories.join(', ') || 'None';
    copilot.setPageContext({
      currentPage: 'Product Center',
      summary: `Viewing product catalog with ${products.length} products across categories: ${categoryList}. Currently ${filteredProducts.length} products shown${categoryFilter !== 'all' ? ` (filtered by ${categoryFilter})` : ''}${searchQuery ? ` (searching: "${searchQuery}")` : ''}.`,
      pageData: {
        totalProducts: products.length,
        filteredProducts: filteredProducts.length,
        categories,
        currentCategoryFilter: categoryFilter,
        searchQuery: searchQuery || null,
        featuredProductNames: featuredProducts.map((p: Product) => p.productName),
      },
    });

    return () => {
      copilot.setPageContext(null);
    };
  }, [products.length, filteredProducts.length, categories, categoryFilter, searchQuery, featuredProducts, copilot.setPageContext]);

  if (isLoading) {
    return (
      <MobileLayout title="Product Center">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="Product Center" hideVoiceButton>
      <div className="flex-1 overflow-y-auto pb-24">


        {/* Product Gallery Carousel */}
        {featuredProducts.length > 0 && (
          <motion.section variants={itemVariants} className="mb-4 mt-4">
            <div className="glass-card overflow-hidden relative rounded-2xl h-48">
              <Carousel setApi={setCarouselApi} className="w-full h-full [&>div]:!m-0 [&>div]:h-full">
                <CarouselContent className="-ml-0 h-full">
                  {featuredProducts.map((product: Product) => (
                    <CarouselItem key={product.id} className="pl-0 basis-full h-full">
                      <button
                        type="button"
                        onClick={() => navigate(`/products/${product.id}`)}
                        className="w-full h-full text-left cursor-pointer"
                      >
                        <div className="relative w-full h-full overflow-hidden">
                          <img
                            src={getProductImage(product)}
                            alt={product.productName}
                            className="w-full h-full object-cover"
                            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                              e.currentTarget.src = imageFallbackByCategory.default;
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                          <div className="absolute bottom-8 left-3 right-3">
                            <span className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-medium">
                              {product.category}
                            </span>
                            <h3 className="text-sm font-semibold text-white truncate mt-1">{product.productName}</h3>
                            <p className="text-xs text-white/80 mt-0.5 line-clamp-1">{product.summary}</p>
                          </div>
                        </div>
                      </button>
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                {featuredProducts.map((_: Product, idx: number) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => carouselApi?.scrollTo(idx)}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-colors",
                      idx === carouselIndex ? "bg-white" : "bg-white/40"
                    )}
                    aria-label={`Go to product ${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          </motion.section>
        )}

        <motion.div
          variants={containerVariants}
          initial={firstMount ? 'hidden' : false}
          animate="show"
          className="space-y-4">



          <motion.section variants={itemVariants} className="flex gap-2 px-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="pl-9 h-10 bg-card/80 border-border/60"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-10 w-36 bg-card/80 border-border/60">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.filter((category: string) => category).map((category: string) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </motion.section>

          {filteredProducts.length === 0 ? (
            <motion.section variants={itemVariants}>
              <Empty className="py-16">
                <EmptyHeader>
                  <EmptyTitle>No products found</EmptyTitle>
                  <EmptyDescription>Adjust the search or category filter to see product references.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </motion.section>
          ) : (
            <motion.section variants={itemVariants} className="space-y-2">
              {filteredProducts.map((product: Product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => navigate(`/products/${product.id}`)}
                  className="w-full text-left glass-card p-3 transition-colors cursor-pointer hover:bg-card/90"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={getProductImage(product)}
                      alt={product.productName}
                      className="w-16 h-16 rounded-2xl object-cover border border-border/60 flex-shrink-0"
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                        e.currentTarget.src = imageFallbackByCategory.default;
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-[10px] font-medium">
                          {product.category}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-foreground truncate">{product.productName}</h3>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.summary}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </button>
              ))}
            </motion.section>
          )}
        </motion.div>
      </div>
    </MobileLayout>
  );
}
