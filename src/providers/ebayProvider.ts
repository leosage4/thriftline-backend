import { env } from '../config/env';
import type { Product } from '../types/product';
import { extractListingSize } from '../utils/sizing';

const BASE_URL = 'https://api.ebay.com';
const MARKETPLACE_ID = 'EBAY_US';
const TOKEN_REFRESH_BUFFER_MS = 60_000;

type EbayTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

type EbayImage = {
  imageUrl: string;
};

type EbayItemSummary = {
  itemId: string;
  title: string;
  price?: { value: string; currency: string };
  shortDescription?: string;
  image?: EbayImage;
  thumbnailImages?: EbayImage[];
  additionalImages?: EbayImage[];
  itemWebUrl: string;
  condition?: string;
  shippingOptions?: {
    shippingCostType?: string;
    shippingCost?: { value: string; currency: string };
  }[];
};

type EbaySearchApiResponse = {
  itemSummaries?: EbayItemSummary[];
  total?: number;
  warnings?: unknown[];
};

export type EbaySearchOptions = {
  query: string;
  limit?: number;
  offset?: number;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'bestMatch' | 'priceLowest';
};

export type EbaySearchResponse =
  | { marketplace: 'ebay'; products: Product[]; error: null }
  | { marketplace: 'ebay'; products: null; error: string };

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function ebayIsConfigured() {
  return Boolean(env.ebayClientId && env.ebayClientSecret);
}

function ebayCredentials() {
  if (!env.ebayClientId || !env.ebayClientSecret) {
    throw new Error('eBay credentials are not configured.');
  }

  return {
    clientId: env.ebayClientId,
    clientSecret: env.ebayClientSecret,
  };
}

function parseMoney(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeProviderError(status?: number) {
  if (status === 401 || status === 403) {
    return 'eBay credentials are invalid or expired.';
  }

  if (status === 429) {
    return 'eBay search is temporarily rate limited.';
  }

  if (status && status >= 500) {
    return 'eBay search is temporarily unavailable.';
  }

  return 'eBay search failed.';
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken;
  }

  const { clientId, clientSecret } = ebayCredentials();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(`${BASE_URL}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[ebayProvider] auth failed:', response.status, text);
    throw new Error(safeProviderError(response.status));
  }

  const data = await response.json() as EbayTokenResponse;
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;

  return cachedToken;
}

function mapItem(item: EbayItemSummary): Product {
  const candidates: string[] = [
    item.image?.imageUrl,
    ...(item.thumbnailImages ?? []).map(image => image.imageUrl),
    ...(item.additionalImages ?? []).map(image => image.imageUrl),
  ].filter((url): url is string => typeof url === 'string' && url.trim() !== '');

  const shippingOption = item.shippingOptions?.[0];
  const shippingCost = shippingOption?.shippingCost?.value
    ? parseMoney(shippingOption.shippingCost.value)
    : shippingOption?.shippingCostType === 'FIXED'
      ? 0
      : null;

  return {
    id: item.itemId,
    title: item.title,
    description: item.shortDescription,
    size: extractListingSize(item.title, item.shortDescription),
    price: parseMoney(item.price?.value),
    shippingCost,
    imageUrl: candidates[0] ?? '',
    imageUrls: candidates,
    itemWebUrl: item.itemWebUrl,
    condition: item.condition ?? 'Not specified',
    source: 'ebay',
  };
}

function buildSearchParams(options: EbaySearchOptions) {
  const params = new URLSearchParams({
    q: options.query.trim(),
    limit: String(options.limit ?? 20),
    offset: String(options.offset ?? 0),
    fieldgroups: 'COMPACT,ADDITIONAL_SELLER_DETAILS',
  });

  if (
    typeof options.minPrice === 'number' ||
    typeof options.maxPrice === 'number'
  ) {
    const min = typeof options.minPrice === 'number' ? options.minPrice : '';
    const max = typeof options.maxPrice === 'number' ? options.maxPrice : '';
    params.set('filter', `price:[${min}..${max}],priceCurrency:USD`);
  }

  if (options.sort === 'priceLowest') {
    params.set('sort', 'price');
  }

  return params;
}

async function requestEbaySearch(token: string, options: EbaySearchOptions) {
  const params = buildSearchParams(options);

  return fetch(`${BASE_URL}/buy/browse/v1/item_summary/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE_ID,
    },
  });
}

export async function searchEbay(options: EbaySearchOptions): Promise<EbaySearchResponse> {
  const query = options.query.trim();

  if (!query) {
    return { marketplace: 'ebay', products: [], error: null };
  }

  if (!ebayIsConfigured()) {
    return { marketplace: 'ebay', products: null, error: 'eBay is not configured.' };
  }

  try {
    let token = await getAccessToken();
    let response = await requestEbaySearch(token, { ...options, query });

    if (response.status === 401) {
      cachedToken = null;
      tokenExpiresAt = 0;
      token = await getAccessToken();
      response = await requestEbaySearch(token, { ...options, query });
    }

    if (!response.ok) {
      const text = await response.text();
      console.error('[ebayProvider] search failed:', response.status, text);
      return {
        marketplace: 'ebay',
        products: null,
        error: safeProviderError(response.status),
      };
    }

    const data = await response.json() as EbaySearchApiResponse;
    const products = (data.itemSummaries ?? []).map(mapItem);

    return { marketplace: 'ebay', products, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown eBay error.';
    console.error('[ebayProvider] search error:', message);

    return {
      marketplace: 'ebay',
      products: null,
      error: message.includes('configured') ? message : 'eBay search is temporarily unavailable.',
    };
  }
}
