import { searchEbay } from '../providers/ebayProvider';
import { searchEtsy } from '../providers/etsyProvider';
import type { DealRating, Product } from '../types/product';
import { detectClothingCategory } from '../utils/clothingCategories';
import { uniqueProductsByListingIdentity } from '../utils/productIdentity';

export type RatingMarketplace = 'ebay' | 'etsy';

export type DealRatingOptions = {
  marketplaces: RatingMarketplace[];
  minPrice?: number;
  maxPrice?: number;
  sort?: 'bestMatch' | 'priceLowest';
};

type BrandMatcher = {
  brand: string;
  terms: string[];
};

type ComparisonGroup = {
  key: string;
  brand: string;
  typeGroup: string;
};

type GroupStats = {
  count: number;
  prices: number[];
  medianComparablePrice: number;
  lowestComparablePrice: number;
  highestComparablePrice: number;
};

type CacheEntry = {
  products: Product[];
  fetched: boolean;
};

type ComparisonSearchResponse =
  | Awaited<ReturnType<typeof searchEbay>>
  | Awaited<ReturnType<typeof searchEtsy>>;

const MIN_COMPARABLE_COUNT = 5;
const COMPARISON_SEARCH_LIMIT = 24;
const COMPARISON_PROVIDER_TIMEOUT_MS = 8000;
const RATING_EXTRA_SEARCH_BUDGET_MS = 10_000;

const NEUTRAL_RATING: DealRating = {
  score: 5,
  confidence: 'low',
  priceRank: 50,
  medianComparablePrice: 0,
  lowestComparablePrice: 0,
  highestComparablePrice: 0,
  explanation: 'Not enough comparable listings to rate this deal confidently.',
};

const BRANDS = [
  'Nike',
  'Jordan',
  'Adidas',
  'Puma',
  'Reebok',
  'ASICS',
  'New Balance',
  'Mizuno',
  'Under Armour',
  'Champion',
  'Gymshark',
  'Lululemon',
  'Brooks',
  'Saucony',
  'HOKA',
  'On',
  'Salomon',
  'Supreme',
  'Stussy',
  'Bape',
  'Kith',
  'Palace',
  'Noah',
  'Awake NY',
  'Pleasures',
  'FTP',
  'HUF',
  'Obey',
  'Brain Dead',
  'Fucking Awesome',
  'Polar Skate Co.',
  'Ripndip',
  'Fear of God',
  'Fear of God Essentials',
  'Off-White',
  'A-COLD-WALL*',
  'Rhude',
  'Gallery Dept.',
  'Chrome Hearts',
  'Amiri',
  'Palm Angels',
  'Represent',
  'Comme des Garcons',
  'CDG',
  'Neighborhood',
  'WTAPS',
  'Human Made',
  'Visvim',
  'Undercover',
  'Kapital',
  'Needles',
  'Issey Miyake',
  'Yohji Yamamoto',
  'Y-3',
  'Evisu',
  'A Bathing Ape',
  'ADER Error',
  'Thisisneverthat',
  'Matin Kim',
  'Musinsa Standard',
  'Andersson Bell',
  '87MM',
  'Mardi Mercredi',
  'Carhartt',
  'Carhartt WIP',
  'Dickies',
  'Wrangler',
  "Levi's",
  'Red Wing',
  'Timberland',
  'Filson',
  'Ben Davis',
  "Arc'teryx",
  'Patagonia',
  'The North Face',
  'Columbia',
  'Mountain Hardwear',
  'Mammut',
  'Outdoor Research',
  'Rab',
  'Fjallraven',
  'True Religion',
  'Edwin',
  'Nudie Jeans',
  'Diesel',
  'G-Star RAW',
  'Lee',
  'Lucky Brand',
  'Rock Revival',
  'Uniqlo',
  'GU',
  'Gap',
  'Old Navy',
  'American Eagle',
  'Hollister',
  'Abercrombie & Fitch',
  'Banana Republic',
  'J.Crew',
  'Everlane',
  'COS',
  'Muji',
  'Arket',
  'Ralph Lauren',
  'Polo Ralph Lauren',
  'Brooks Brothers',
  'Lacoste',
  'Tommy Hilfiger',
  'GANT',
  'Vineyard Vines',
  'Louis Vuitton',
  'Gucci',
  'Prada',
  'Balenciaga',
  'Dior',
  'Saint Laurent',
  'Burberry',
  'Givenchy',
  'Maison Margiela',
  'Moncler',
  'Valentino',
  'Versace',
  'Fendi',
  'Celine',
  'Loewe',
  'Bottega Veneta',
  'Rick Owens',
  'Maison Kitsune',
  'Vans',
  'Converse',
  'Crocs',
  'Birkenstock',
  'Dr. Martens',
  'UGG',
  'Blundstone',
  'Clarks',
  'Cole Haan',
  'Allen Edmonds',
  'Ariat',
  'Nike SB',
  'DC',
  'Etnies',
  'Emerica',
  'Santa Cruz',
  'Thrasher',
  'Harley-Davidson',
  'Russell Athletic',
  'Fruit of the Loom',
  'Jerzees',
  'Hanes',
  'Aritzia',
  'Brandy Melville',
  'Free People',
  'Princess Polly',
  'Urban Outfitters',
  'Anthropologie',
  'Madewell',
  'Reformation',
  'Zara',
  'Mango',
  'H&M',
  'Forever 21',
  'Garage',
  'PacSun',
  'Juicy Couture',
  'Von Dutch',
  'Affliction',
  'Ed Hardy',
  'Southpole',
  'Sean John',
  'Phat Farm',
  'SuitSupply',
  'Hugo Boss',
  'Canali',
  'Theory',
  'Johnston & Murphy',
] as const;

const BRAND_ALIASES: Record<string, string[]> = {
  'Comme des Garcons': ['CDG', 'Comme', 'CdG'],
  'Polo Ralph Lauren': ['Polo', 'Ralph Lauren', 'RL', 'Polo RL'],
  'The North Face': ['North Face'],
  Bape: ['A Bathing Ape', 'BAPE', 'Bathing Ape'],
  'A Bathing Ape': ['BAPE', 'Bathing Ape'],
  Stussy: ['Stussy'],
  "Arc'teryx": ['Arcteryx', 'Arc Teryx'],
  'Maison Margiela': ['Margiela', 'MM6'],
  'Louis Vuitton': ['LV', 'Louis V'],
  'Saint Laurent': ['YSL', 'Saint Laurent Paris'],
  'Nike SB': ['SB', 'Nike Skateboarding'],
  'Off-White': ['Off White'],
  'Carhartt WIP': ['WIP', 'Carhartt Work In Progress'],
  'New Balance': ['NB'],
  'Under Armour': ['UA'],
  Lululemon: ['Lulu'],
  'Dr. Martens': ['Doc Martens', 'Docs', 'Dr Martens'],
  Birkenstock: ['Birks'],
  'Hugo Boss': ['Boss'],
  "Levi's": ['Levis', 'Levi Strauss'],
  'Harley-Davidson': ['Harley', 'Harley Davidson'],
  'American Eagle': ['AE'],
  'Abercrombie & Fitch': ['A&F', 'Abercrombie'],
  Jordan: ['Air Jordan'],
  Converse: ['Chuck Taylor', 'Chucks'],
  UGG: ['Ugg Australia'],
  Adidas: ['Addidas', 'Adiddas', 'Yeezy'],
};

const CANONICAL_BRAND_OVERRIDES: Record<string, string> = {
  'A Bathing Ape': 'Bape',
  CDG: 'Comme des Garcons',
  'Ralph Lauren': 'Polo Ralph Lauren',
};

const BRAND_SEARCH_TERMS: Record<string, string[]> = {
  Bape: ['bape', 'a bathing ape'],
  Supreme: ['supreme clothing', 'supreme streetwear'],
  Neighborhood: ['neighborhood tokyo', 'neighborhood'],
  'Fear of God Essentials': ['fear of god essentials'],
  'Comme des Garcons': ['comme des garcons', 'cdg'],
};

const TYPE_SEARCH_TERMS: Record<string, string[]> = {
  shirt: ['t-shirt', 'shirt'],
  'long sleeve shirt': ['long sleeve', 'long sleeve shirt'],
  hoodie: ['hoodie', 'zip up hoodie'],
  sweater: ['sweater'],
  jacket: ['jacket'],
  jeans: ['jeans', 'denim'],
  pants: ['pants', 'trousers'],
  sweatpants: ['sweatpants', 'joggers'],
  jorts: ['jorts', 'denim shorts'],
  'cargo shorts': ['cargo shorts', 'utility shorts'],
  'athletic shorts': ['athletic shorts', 'gym shorts'],
  shorts: ['shorts'],
  shoes: ['shoes', 'sneakers'],
};

const comparisonPoolCache = new Map<string, CacheEntry>();
const pendingComparisonPools = new Map<string, Promise<Product[]>>();

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<null>(resolve => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compactText(value: string) {
  return normalizeText(value).replace(/\s+/g, '');
}

function allTokens(value: string) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function listingText(product: Product) {
  return `${product.title} ${product.description ?? ''}`;
}

function canonicalBrand(brand: string) {
  return CANONICAL_BRAND_OVERRIDES[brand] ?? brand;
}

function uniqueBrands(brands: readonly string[]) {
  const seen = new Set<string>();

  return brands
    .map(canonicalBrand)
    .filter(brand => {
      if (seen.has(brand)) {
        return false;
      }

      seen.add(brand);
      return true;
    });
}

function brandTermsForMatch(brand: string) {
  return Array.from(new Set([
    brand,
    ...(BRAND_ALIASES[brand] ?? []),
    ...Object.entries(BRAND_ALIASES)
      .filter(([aliasBrand]) => aliasBrand !== brand && canonicalBrand(aliasBrand) === brand)
      .flatMap(([aliasBrand, aliases]) => [aliasBrand, ...aliases]),
  ]));
}

const BRAND_MATCHERS: BrandMatcher[] = uniqueBrands(BRANDS)
  .map(brand => ({
    brand,
    terms: brandTermsForMatch(brand),
  }))
  .sort((a, b) => {
    const longestA = Math.max(...a.terms.map(term => normalizeText(term).length));
    const longestB = Math.max(...b.terms.map(term => normalizeText(term).length));

    return longestB - longestA;
  });

function isSupremeCourtFalsePositive(normalizedText: string, compact: string, tokens: Set<string>) {
  return (
    normalizedText.includes('supreme court') ||
    compact.includes('supremecourt') ||
    normalizedText.includes('court justice') ||
    normalizedText.includes('court case') ||
    tokens.has('scotus')
  );
}

function matchesBrandTerm(
  term: string,
  normalizedText: string,
  compact: string,
  tokens: Set<string>,
) {
  const normalizedTerm = normalizeText(term);
  const compactTerm = compactText(term);
  const termTokens = allTokens(term);

  if (!normalizedTerm) {
    return false;
  }

  if (normalizedTerm === 'on') {
    return (
      normalizedText.includes('on running') ||
      normalizedText.includes('on cloud') ||
      normalizedText.includes('on shoes') ||
      normalizedText.includes('on sneakers')
    );
  }

  if (termTokens.length === 1) {
    const [singleToken] = termTokens;

    if (singleToken.length <= 3) {
      return tokens.has(singleToken);
    }

    return tokens.has(singleToken) || compact.includes(compactTerm);
  }

  return normalizedText.includes(normalizedTerm) || compact.includes(compactTerm);
}

function detectBrand(product: Product) {
  const text = listingText(product);
  const compact = compactText(text);
  const tokens = new Set(allTokens(text));
  const normalizedText = allTokens(text).join(' ');

  for (const { brand, terms } of BRAND_MATCHERS) {
    if (brand === 'Supreme' && isSupremeCourtFalsePositive(normalizedText, compact, tokens)) {
      return null;
    }

    if (terms.some(term => matchesBrandTerm(term, normalizedText, compact, tokens))) {
      return brand;
    }
  }

  return null;
}

function searchTermsForBrand(brand: string) {
  return BRAND_SEARCH_TERMS[brand] ?? brandTermsForMatch(brand).slice(0, 2);
}

function dealTypeGroup(type: string) {
  if (['shirt', 'button up'].includes(type)) {
    return 'shirt';
  }

  if (['hoodie', 'sweatshirt'].includes(type)) {
    return 'hoodie';
  }

  return type;
}

function searchTermsForType(typeGroup: string) {
  return TYPE_SEARCH_TERMS[typeGroup] ?? [typeGroup];
}

function comparisonKey(product: Product): ComparisonGroup | null {
  const productCategory = detectClothingCategory(product.title, product.description);

  if (!productCategory) {
    return null;
  }

  const productBrand = detectBrand(product);

  if (!productBrand) {
    return null;
  }

  const typeGroup = dealTypeGroup(productCategory.type);

  return {
    key: `${productBrand}::${typeGroup}`,
    brand: productBrand,
    typeGroup,
  };
}

function uniqueProducts(products: Product[]) {
  return uniqueProductsByListingIdentity(products);
}

function mergeProducts(currentProducts: Product[], nextProducts: Product[]) {
  return uniqueProducts([...currentProducts, ...nextProducts]);
}

function totalPriceOf(product: Product) {
  const shippingCost = typeof product.shippingCost === 'number' ? product.shippingCost : 0;

  return product.price > 0 ? product.price + shippingCost : 0;
}

function removeOutliers(products: Product[]) {
  if (products.length < 6) {
    return products;
  }

  const prices = products.map(totalPriceOf).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];

  return products.filter(product => {
    const price = totalPriceOf(product);

    return price >= median * 0.35 && price <= median * 2.8;
  });
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function scoreFromMedian(productPrice: number, medianPrice: number) {
  if (medianPrice <= 0) {
    return 5;
  }

  const differencePercent = ((medianPrice - productPrice) / medianPrice) * 100;

  if (differencePercent >= 0) {
    if (differencePercent <= 20) {
      return clamp(5.4 + differencePercent * 0.095, 5.4, 7.3);
    }

    if (differencePercent <= 40) {
      return clamp(7.3 + (differencePercent - 20) * 0.07, 7.3, 8.7);
    }

    if (differencePercent <= 60) {
      return clamp(8.7 + (differencePercent - 40) * 0.045, 8.7, 9.6);
    }

    return clamp(9.6 + (differencePercent - 60) * 0.02, 9.6, 10);
  }

  return clamp(5.4 + differencePercent * 0.08, 1, 5.4);
}

function confidenceForCount(count: number) {
  if (count >= 10) return 'high';
  if (count >= 5) return 'medium';
  return 'low';
}

function capScoreForConfidence(score: number, confidence: DealRating['confidence']) {
  if (confidence === 'high') {
    return score;
  }

  if (confidence === 'medium') {
    return Math.min(score, 9.4);
  }

  return Math.min(score, 5.9);
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function comparableProductsForGroup(products: Product[], group: ComparisonGroup) {
  return products.filter(product => (
    totalPriceOf(product) > 0 &&
    comparisonKey(product)?.key === group.key
  ));
}

function statsForPool(products: Product[], group: ComparisonGroup): GroupStats | null {
  const comparableProducts = removeOutliers(comparableProductsForGroup(products, group));

  if (comparableProducts.length < MIN_COMPARABLE_COUNT) {
    return null;
  }

  const prices = comparableProducts.map(totalPriceOf).sort((a, b) => a - b);

  return {
    count: comparableProducts.length,
    prices,
    medianComparablePrice: median(prices),
    lowestComparablePrice: prices[0],
    highestComparablePrice: prices[prices.length - 1],
  };
}

function ratingFromStats(product: Product, stats: GroupStats | null): DealRating {
  const productPrice = totalPriceOf(product);

  if (productPrice <= 0 || !stats) {
    return NEUTRAL_RATING;
  }

  const cheaperCount = stats.prices.filter(price => price < productPrice).length;
  const samePriceCount = stats.prices.filter(price => price === productPrice).length;
  const percentile = ((cheaperCount + samePriceCount / 2) / stats.prices.length) * 100;
  const medianDifferencePercent = stats.medianComparablePrice > 0
    ? ((stats.medianComparablePrice - productPrice) / stats.medianComparablePrice) * 100
    : 0;
  const confidence = confidenceForCount(stats.count);
  const score = Number(capScoreForConfidence(
    scoreFromMedian(productPrice, stats.medianComparablePrice),
    confidence,
  ).toFixed(1));
  const explanation = medianDifferencePercent >= 0
    ? `This item is ${medianDifferencePercent.toFixed(1)}% below the median comparable price.`
    : `This item is ${Math.abs(medianDifferencePercent).toFixed(1)}% above the median comparable price.`;

  return {
    score,
    confidence,
    priceRank: Number(percentile.toFixed(1)),
    medianComparablePrice: roundMoney(stats.medianComparablePrice),
    lowestComparablePrice: roundMoney(stats.lowestComparablePrice),
    highestComparablePrice: roundMoney(stats.highestComparablePrice),
    explanation,
  };
}

function neutralRatingFor(product: Product): DealRating {
  if (totalPriceOf(product) <= 0) {
    return NEUTRAL_RATING;
  }

  if (!detectClothingCategory(product.title, product.description)) {
    return NEUTRAL_RATING;
  }

  if (!detectBrand(product)) {
    return {
      ...NEUTRAL_RATING,
      explanation: 'No reliable brand match was found, so this rating stays neutral.',
    };
  }

  return NEUTRAL_RATING;
}

function comparisonQueries(group: ComparisonGroup) {
  const brandTerms = searchTermsForBrand(group.brand);
  const typeTerms = searchTermsForType(group.typeGroup);
  const mainQuery = `${brandTerms[0] ?? group.brand} ${typeTerms[0] ?? group.typeGroup}`.trim();
  const fallbackQuery = `${brandTerms[0] ?? group.brand} ${typeTerms[1] ?? typeTerms[0] ?? group.typeGroup}`.trim();

  return Array.from(new Set([mainQuery, fallbackQuery])).slice(0, 2);
}

async function searchMarketplaceForComparisons(
  marketplace: RatingMarketplace,
  query: string,
  options: DealRatingOptions,
) {
  const providerOptions = {
    query,
    limit: COMPARISON_SEARCH_LIMIT,
    offset: 0,
    minPrice: options.minPrice,
    maxPrice: options.maxPrice,
    sort: options.sort,
    requestPurpose: 'comparison' as const,
  };
  const providerPromise: Promise<ComparisonSearchResponse> = marketplace === 'ebay'
    ? searchEbay(providerOptions)
    : searchEtsy(providerOptions);
  const result = await withTimeout(providerPromise, COMPARISON_PROVIDER_TIMEOUT_MS);

  if (!result) {
    console.warn(`[dealRatingService] ${marketplace} comparison search timed out.`);
    return [];
  }

  if (result.products === null) {
    console.warn(`[dealRatingService] ${marketplace} comparison search skipped: ${result.error}`);
    return [];
  }

  return result.products;
}

async function searchComparisonProducts(query: string, options: DealRatingOptions) {
  const providerResults = await Promise.all(
    options.marketplaces.map(async marketplace => (
      searchMarketplaceForComparisons(marketplace, query, options).catch(error => {
        const message = error instanceof Error ? error.message : 'Unknown comparison search error.';
        console.warn(`[dealRatingService] ${marketplace} comparison search failed: ${message}`);
        return [];
      })
    )),
  );

  return uniqueProducts(providerResults.flat());
}

async function completeComparisonPool(
  group: ComparisonGroup,
  seedProducts: Product[],
  options: DealRatingOptions,
  deadlineAt: number,
) {
  const pendingPool = pendingComparisonPools.get(group.key);

  if (pendingPool) {
    return mergeProducts(seedProducts, await pendingPool);
  }

  const poolPromise = (async () => {
    const cachedPool = comparisonPoolCache.get(group.key);
    let pool = mergeProducts(seedProducts, cachedPool?.products ?? []);
    let completedFallbackSearches = true;

    if (statsForPool(pool, group) || cachedPool?.fetched) {
      comparisonPoolCache.set(group.key, {
        products: pool,
        fetched: cachedPool?.fetched ?? false,
      });
      return pool;
    }

    for (const query of comparisonQueries(group)) {
      if (Date.now() >= deadlineAt) {
        completedFallbackSearches = false;
        break;
      }

      const comparisonProducts = await searchComparisonProducts(query, options);
      pool = mergeProducts(pool, comparisonProducts);

      if (statsForPool(pool, group)) {
        break;
      }
    }

    comparisonPoolCache.set(group.key, {
      products: pool,
      fetched: completedFallbackSearches,
    });

    return pool;
  })();

  pendingComparisonPools.set(group.key, poolPromise);

  try {
    return await poolPromise;
  } finally {
    pendingComparisonPools.delete(group.key);
  }
}

export async function addDealRatings(
  productsToRate: Product[],
  seedProducts: Product[],
  options: DealRatingOptions,
) {
  const deadlineAt = Date.now() + RATING_EXTRA_SEARCH_BUDGET_MS;
  const targetGroups = new Map<string, ComparisonGroup>();

  productsToRate.forEach(product => {
    const group = comparisonKey(product);

    if (group) {
      targetGroups.set(group.key, group);
    }
  });

  const seedGroups = new Map<string, { group: ComparisonGroup; products: Product[] }>();

  seedProducts.forEach(product => {
    const group = comparisonKey(product);

    if (!group || !targetGroups.has(group.key)) {
      return;
    }

    const existingGroup = seedGroups.get(group.key);
    seedGroups.set(group.key, {
      group,
      products: [...(existingGroup?.products ?? []), product],
    });
  });

  const statsByGroup = new Map<string, GroupStats | null>();

  for (const { group, products } of seedGroups.values()) {
    if (Date.now() >= deadlineAt) {
      statsByGroup.set(group.key, statsForPool(products, group));
      continue;
    }

    const pool = await completeComparisonPool(group, products, options, deadlineAt);
    statsByGroup.set(group.key, statsForPool(pool, group));
  }

  return productsToRate.map(product => {
    const group = comparisonKey(product);

    if (!group) {
      return {
        ...product,
        dealRating: neutralRatingFor(product),
      };
    }

    return {
      ...product,
      dealRating: ratingFromStats(product, statsByGroup.get(group.key) ?? null),
    };
  });
}
