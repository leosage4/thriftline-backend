import { searchEbay } from '../providers/ebayProvider';
import { searchEtsy } from '../providers/etsyProvider';
import type { Marketplace, Product } from '../types/product';
import { uniqueProductsByListingIdentity } from '../utils/productIdentity';
import { addDealRatings } from './dealRatingService';

export const SUPPORTED_SEARCH_MARKETPLACES = ['ebay', 'etsy'] as const;
export const SEARCH_SORT_OPTIONS = ['bestMatch', 'priceLowest'] as const;
const RATING_SEED_LIMIT = 24;
const MARKETPLACE_SEARCH_TIMEOUT_MS = 12_000;

export type SupportedSearchMarketplace = typeof SUPPORTED_SEARCH_MARKETPLACES[number];
export type SearchSort = typeof SEARCH_SORT_OPTIONS[number];

export type SearchRequest = {
  query: string;
  limit: number;
  page: number;
  marketplaces: SupportedSearchMarketplace[];
  minPrice?: number;
  maxPrice?: number;
  size?: string;
  condition?: string;
  sort: SearchSort;
};

export type MarketplaceSearchError = {
  marketplace: SupportedSearchMarketplace;
  message: string;
};

export type SearchResponse = {
  query: string;
  total: number;
  products: Product[];
  marketplaces: {
    searched: SupportedSearchMarketplace[];
    successful: SupportedSearchMarketplace[];
    failed: SupportedSearchMarketplace[];
  };
  errors: MarketplaceSearchError[];
  pagination: {
    page: number;
    limit: number;
    returned: number;
    hasNextPage: boolean;
  };
  cached: false;
};

type ProviderResult =
  | { marketplace: SupportedSearchMarketplace; products: Product[]; error: null }
  | { marketplace: SupportedSearchMarketplace; products: null; error: string };

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

function marketplaceAllowed(source: Marketplace): source is SupportedSearchMarketplace {
  return SUPPORTED_SEARCH_MARKETPLACES.includes(source as SupportedSearchMarketplace);
}

function uniqueProducts(products: Product[]) {
  return uniqueProductsByListingIdentity(products);
}

function totalPrice(product: Product) {
  const shipping = typeof product.shippingCost === 'number' ? product.shippingCost : 0;
  return product.price > 0 ? product.price + shipping : 0;
}

function conditionMatches(productCondition: string, requestedCondition: string) {
  const condition = normalizeText(productCondition);
  const requested = normalizeText(requestedCondition);

  if (!requested) {
    return true;
  }

  if (requested === 'new with tags') {
    return condition.includes('new with tags') || condition.includes('new');
  }

  if (requested === 'like new') {
    return condition.includes('like new');
  }

  if (requested === 'pre owned excellent') {
    return condition.includes('excellent');
  }

  if (requested === 'pre owned good') {
    return condition.includes('good');
  }

  if (requested === 'pre owned fair') {
    return condition.includes('fair');
  }

  if (requested === 'used vintage') {
    return condition.includes('used') || condition.includes('vintage') || condition.includes('pre owned');
  }

  return condition.includes(requested);
}

function sizeMatches(productSize: string | undefined, requestedSize: string | undefined) {
  if (!requestedSize) {
    return true;
  }

  if (!productSize) {
    return false;
  }

  return normalizeText(productSize) === normalizeText(requestedSize);
}

function productMatchesFilters(product: Product, request: SearchRequest) {
  if (!marketplaceAllowed(product.source) || !request.marketplaces.includes(product.source)) {
    return false;
  }

  if (typeof request.minPrice === 'number' && product.price < request.minPrice) {
    return false;
  }

  if (typeof request.maxPrice === 'number' && product.price > request.maxPrice) {
    return false;
  }

  if (!sizeMatches(product.size, request.size)) {
    return false;
  }

  if (request.condition && !conditionMatches(product.condition, request.condition)) {
    return false;
  }

  return true;
}

function sortProducts(products: Product[], sort: SearchSort) {
  if (sort === 'bestMatch') {
    return products;
  }

  return [...products].sort((a, b) => {
    const aPrice = totalPrice(a);
    const bPrice = totalPrice(b);

    if (aPrice <= 0 && bPrice <= 0) return 0;
    if (aPrice <= 0) return 1;
    if (bPrice <= 0) return -1;

    return aPrice - bPrice;
  });
}

function interleaveProductsByMarketplace(
  products: Product[],
  marketplaces: SupportedSearchMarketplace[],
) {
  const productsByMarketplace = marketplaces.reduce(
    (groups, marketplace) => ({
      ...groups,
      [marketplace]: products.filter(product => product.source === marketplace),
    }),
    {} as Record<SupportedSearchMarketplace, Product[]>,
  );
  const interleavedProducts: Product[] = [];
  let hasProducts = true;

  while (hasProducts) {
    hasProducts = false;

    marketplaces.forEach(marketplace => {
      const product = productsByMarketplace[marketplace].shift();

      if (product) {
        interleavedProducts.push(product);
        hasProducts = true;
      }
    });
  }

  return interleavedProducts;
}

function productsForDisplayOrder(
  products: Product[],
  request: SearchRequest,
) {
  if (request.sort === 'bestMatch' && request.marketplaces.length > 1) {
    return interleaveProductsByMarketplace(products, request.marketplaces);
  }

  return sortProducts(products, request.sort);
}

async function searchMarketplace(
  marketplace: SupportedSearchMarketplace,
  request: SearchRequest,
): Promise<ProviderResult> {
  const providerLimit = Math.max(request.limit, RATING_SEED_LIMIT);
  const providerOptions = {
    query: request.query,
    limit: providerLimit,
    offset: (request.page - 1) * providerLimit,
    minPrice: request.minPrice,
    maxPrice: request.maxPrice,
    sort: request.sort,
    requestPurpose: 'primary' as const,
  };
  const providerPromise: Promise<ProviderResult> = marketplace === 'ebay'
    ? searchEbay(providerOptions)
    : searchEtsy(providerOptions);
  const result = await withTimeout(providerPromise, MARKETPLACE_SEARCH_TIMEOUT_MS);

  if (!result) {
    return {
      marketplace,
      products: null,
      error: `${marketplace} search timed out.`,
    };
  }

  return result;
}

export async function searchProducts(request: SearchRequest): Promise<SearchResponse> {
  const query = request.query.trim().replace(/\s+/g, ' ');
  const normalizedRequest = { ...request, query };

  const providerResults = await Promise.all(
    normalizedRequest.marketplaces.map(marketplace => searchMarketplace(marketplace, normalizedRequest)),
  );

  const successful = providerResults
    .filter(result => result.error === null)
    .map(result => result.marketplace);
  const errors = providerResults
    .filter((result): result is Extract<ProviderResult, { products: null }> => result.error !== null)
    .map(result => ({
      marketplace: result.marketplace,
      message: result.error,
    }));
  const combinedProducts = providerResults.flatMap(result => result.products ?? []);
  const filteredProducts = uniqueProducts(combinedProducts)
    .filter(product => productMatchesFilters(product, normalizedRequest));
  const displayProducts = productsForDisplayOrder(filteredProducts, normalizedRequest);
  const products = displayProducts.slice(0, normalizedRequest.limit);
  const ratedProducts = await addDealRatings(products, filteredProducts, {
    marketplaces: normalizedRequest.marketplaces,
    minPrice: normalizedRequest.minPrice,
    maxPrice: normalizedRequest.maxPrice,
    sort: normalizedRequest.sort,
  });

  return {
    query,
    total: displayProducts.length,
    products: ratedProducts,
    marketplaces: {
      searched: normalizedRequest.marketplaces,
      successful,
      failed: errors.map(error => error.marketplace),
    },
    errors,
    pagination: {
      page: normalizedRequest.page,
      limit: normalizedRequest.limit,
      returned: products.length,
      hasNextPage: displayProducts.length > normalizedRequest.limit,
    },
    cached: false,
  };
}
