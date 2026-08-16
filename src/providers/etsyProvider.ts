import { env } from '../config/env';
import type { Product } from '../types/product';
import { extractListingSize } from '../utils/sizing';

const BASE_URL = 'https://openapi.etsy.com/v3/application';
const IMAGE_FALLBACK_LIMIT = 2;
const ETSY_REQUESTS_PER_SECOND = 2;
const ETSY_REQUEST_INTERVAL_MS = Math.ceil(1000 / ETSY_REQUESTS_PER_SECOND);
const ETSY_RATE_LIMIT_RETRY_MS = 750;

type EtsyMoney = {
  amount: number;
  divisor: number;
  currency_code: string;
};

type EtsyImage = {
  url_75x75?: string;
  url_570xN?: string;
  url_fullxfull?: string;
  url_170x135?: string;
  image_url_75x75?: string;
  image_url_170x135?: string;
  image_url_570xN?: string;
};

type EtsyListing = {
  listing_id: number;
  title: string;
  description?: string;
  url: string;
  price: EtsyMoney;
  state: string;
  shipping_profile_id?: number | null;
  images?: EtsyImage[];
  Images?: EtsyImage[];
  image?: EtsyImage;
  Image?: EtsyImage;
  MainImage?: EtsyImage;
  image_url?: string;
  image_url_170x135?: string;
  image_url_570xN?: string;
  url_170x135?: string;
  url_570xN?: string;
  _embedded?: {
    images?: EtsyImage[];
    Images?: EtsyImage[];
  };
};

type EtsySearchApiResponse = {
  results?: EtsyListing[];
  count?: number;
};

type EtsyImagesApiResponse = {
  results?: EtsyImage[];
  count?: number;
};

export type EtsySearchOptions = {
  query: string;
  limit?: number;
  offset?: number;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'bestMatch' | 'priceLowest';
  requestPurpose?: EtsyRequestPurpose;
  includeImageFallback?: boolean;
};

export type EtsySearchResponse =
  | { marketplace: 'etsy'; products: Product[]; error: null }
  | { marketplace: 'etsy'; products: null; error: string };

type EtsyRequestPurpose = 'primary' | 'comparison' | 'image';

type QueuedEtsyRequest = {
  purpose: EtsyRequestPurpose;
  run: () => Promise<Response>;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
};

const imageCache = new Map<number, string[]>();
const etsyRequestQueues: Record<EtsyRequestPurpose, QueuedEtsyRequest[]> = {
  primary: [],
  comparison: [],
  image: [],
};
let nextEtsyRequestAt = 0;
let etsySchedulerTimer: ReturnType<typeof setTimeout> | null = null;

function wait(ms: number) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function nextQueuedEtsyRequest() {
  return etsyRequestQueues.primary.shift()
    ?? etsyRequestQueues.comparison.shift()
    ?? etsyRequestQueues.image.shift()
    ?? null;
}

function hasQueuedEtsyRequests() {
  return Boolean(
    etsyRequestQueues.primary.length
    || etsyRequestQueues.comparison.length
    || etsyRequestQueues.image.length,
  );
}

function scheduleEtsyDrain(delayMs = 0) {
  if (etsySchedulerTimer) {
    return;
  }

  etsySchedulerTimer = setTimeout(() => {
    etsySchedulerTimer = null;
    drainEtsyQueue();
  }, delayMs);
}

function drainEtsyQueue() {
  const request = nextQueuedEtsyRequest();

  if (!request) {
    return;
  }

  const now = Date.now();
  const waitMs = Math.max(0, nextEtsyRequestAt - now);

  if (waitMs > 0) {
    etsyRequestQueues[request.purpose].unshift(request);
    scheduleEtsyDrain(waitMs);
    return;
  }

  nextEtsyRequestAt = now + ETSY_REQUEST_INTERVAL_MS;

  request.run()
    .then(request.resolve)
    .catch(request.reject)
    .finally(() => {
      if (hasQueuedEtsyRequests()) {
        scheduleEtsyDrain(Math.max(0, nextEtsyRequestAt - Date.now()));
      }
    });
}

function enqueueEtsyFetch(
  url: string,
  init: RequestInit,
  purpose: EtsyRequestPurpose,
) {
  return new Promise<Response>((resolve, reject) => {
    etsyRequestQueues[purpose].push({
      purpose,
      run: () => fetch(url, init),
      resolve,
      reject,
    });
    scheduleEtsyDrain();
  });
}

async function scheduledEtsyFetch(
  url: string,
  init: RequestInit,
  purpose: EtsyRequestPurpose,
) {
  let response = await enqueueEtsyFetch(url, init, purpose);

  if (response.status === 429) {
    console.warn(`[etsyProvider] ${purpose} request rate limited; retrying once.`);
    await wait(ETSY_RATE_LIMIT_RETRY_MS);
    response = await enqueueEtsyFetch(url, init, purpose);
  }

  return response;
}

function etsyIsConfigured() {
  return Boolean(env.etsyApiKey);
}

function etsyApiKeyHeader() {
  if (!env.etsyApiKey) {
    throw new Error('Etsy is not configured.');
  }

  return env.etsyApiSecret
    ? `${env.etsyApiKey}:${env.etsyApiSecret}`
    : env.etsyApiKey;
}

function imageCandidates(images: EtsyImage[] | undefined): string[] {
  return (images ?? [])
    .flatMap(image => [
      image.url_fullxfull,
      image.url_570xN,
      image.url_170x135,
      image.url_75x75,
      image.image_url_570xN,
      image.image_url_170x135,
      image.image_url_75x75,
    ])
    .filter((url): url is string => typeof url === 'string' && url.trim() !== '');
}

function directImageCandidates(listing: EtsyListing) {
  return [
    listing.image_url_570xN,
    listing.url_570xN,
    listing.image_url,
    listing.image_url_170x135,
    listing.url_170x135,
  ].filter((url): url is string => typeof url === 'string' && url.trim() !== '');
}

function safeProviderError(status?: number) {
  if (status === 401 || status === 403) {
    return 'Etsy credentials are invalid.';
  }

  if (status === 429) {
    return 'Etsy search is temporarily rate limited.';
  }

  if (status && status >= 500) {
    return 'Etsy search is temporarily unavailable.';
  }

  return 'Etsy search failed.';
}

function mapListing(listing: EtsyListing): Product {
  const price = listing.price.amount / listing.price.divisor;
  const candidates = [
    ...imageCandidates(listing.images),
    ...imageCandidates(listing.Images),
    ...imageCandidates(listing._embedded?.images),
    ...imageCandidates(listing._embedded?.Images),
    ...imageCandidates(listing.image ? [listing.image] : undefined),
    ...imageCandidates(listing.Image ? [listing.Image] : undefined),
    ...imageCandidates(listing.MainImage ? [listing.MainImage] : undefined),
    ...directImageCandidates(listing),
  ];

  return {
    id: String(listing.listing_id),
    title: listing.title,
    description: listing.description,
    size: extractListingSize(listing.title, listing.description),
    price: Number(price.toFixed(2)),
    shippingCost: listing.shipping_profile_id ? null : 0,
    imageUrl: candidates[0] ?? '',
    imageUrls: candidates,
    itemWebUrl: listing.url,
    condition: 'Used / Vintage',
    source: 'etsy',
  };
}

async function getListingImageUrls(listingId: number): Promise<string[]> {
  const cached = imageCache.get(listingId);

  if (cached) {
    return cached;
  }

  try {
    const response = await scheduledEtsyFetch(`${BASE_URL}/listings/${listingId}/images`, {
      method: 'GET',
      headers: {
        'x-api-key': etsyApiKeyHeader(),
      },
    }, 'image');

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as EtsyImagesApiResponse;
    const imageUrls = imageCandidates(data.results);
    imageCache.set(listingId, imageUrls);

    return imageUrls;
  } catch {
    return [];
  }
}

async function addFallbackImages(products: Product[], listings: EtsyListing[]) {
  const imageLessProductIndexes = products
    .map((product, index) => ({ product, index }))
    .filter(({ product }) => !product.imageUrl)
    .slice(0, IMAGE_FALLBACK_LIMIT);

  if (imageLessProductIndexes.length === 0) {
    return products;
  }

  const imageSets = await Promise.all(
    imageLessProductIndexes.map(({ index }) => getListingImageUrls(listings[index].listing_id)),
  );

  const productsWithImages = [...products];
  imageLessProductIndexes.forEach(({ index }, imageSetIndex) => {
    const imageUrls = imageSets[imageSetIndex];

    if (imageUrls.length > 0) {
      productsWithImages[index] = {
        ...productsWithImages[index],
        imageUrl: imageUrls[0],
        imageUrls,
      };
    }
  });

  return productsWithImages;
}

function buildSearchParams(options: EtsySearchOptions) {
  const params = new URLSearchParams({
    keywords: options.query.trim(),
    limit: String(options.limit ?? 20),
    offset: String(options.offset ?? 0),
    sort_on: options.sort === 'priceLowest' ? 'price' : 'score',
    sort_order: options.sort === 'priceLowest' ? 'up' : 'desc',
  });

  if (typeof options.minPrice === 'number') {
    params.set('min_price', String(options.minPrice));
  }

  if (typeof options.maxPrice === 'number') {
    params.set('max_price', String(options.maxPrice));
  }

  params.append('includes', 'Images');

  return params;
}

export async function searchEtsy(options: EtsySearchOptions): Promise<EtsySearchResponse> {
  const query = options.query.trim();

  if (!query) {
    return { marketplace: 'etsy', products: [], error: null };
  }

  if (!etsyIsConfigured()) {
    return { marketplace: 'etsy', products: null, error: 'Etsy is not configured.' };
  }

  try {
    const params = buildSearchParams({ ...options, query });
    const requestPurpose = options.requestPurpose ?? 'primary';
    const response = await scheduledEtsyFetch(`${BASE_URL}/listings/active?${params.toString()}`, {
      method: 'GET',
      headers: {
        'x-api-key': etsyApiKeyHeader(),
      },
    }, requestPurpose);

    if (!response.ok) {
      const text = await response.text();

      if (response.status === 400 && text.includes('Offset provided is greater than the total count')) {
        return { marketplace: 'etsy', products: [], error: null };
      }

      console.error('[etsyProvider] search failed:', response.status, text);

      return {
        marketplace: 'etsy',
        products: null,
        error: safeProviderError(response.status),
      };
    }

    const data = await response.json() as EtsySearchApiResponse;
    const listings = data.results ?? [];
    const mappedProducts = listings.map(listing => mapListing(listing));
    const products = options.includeImageFallback
      ? await addFallbackImages(mappedProducts, listings)
      : mappedProducts;

    return { marketplace: 'etsy', products, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Etsy error.';
    console.error('[etsyProvider] search error:', message);

    return {
      marketplace: 'etsy',
      products: null,
      error: message.includes('configured') ? message : 'Etsy search is temporarily unavailable.',
    };
  }
}
