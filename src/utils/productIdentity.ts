import type { Product } from '../types/product';

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeUrl(value: string | undefined) {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/+$/, '');

    return `${url.hostname.toLowerCase()}${pathname.toLowerCase()}`;
  } catch {
    return value
      .split(/[?#]/)[0]
      .trim()
      .toLowerCase()
      .replace(/\/+$/, '');
  }
}

function priceCents(product: Product) {
  return Number.isFinite(product.price) ? Math.round(product.price * 100) : 0;
}

export function productIdentityKeys(product: Product) {
  const keys: string[] = [];
  const source = product.source;
  const id = product.id.trim().toLowerCase();
  const itemUrl = normalizeUrl(product.itemWebUrl);
  const imageUrl = normalizeUrl(product.imageUrl || product.imageUrls[0]);
  const title = normalizeText(product.title);
  const cents = priceCents(product);

  if (source && id) {
    keys.push(`exact:${source}:${id}`);
  }

  if (itemUrl) {
    keys.push(`url:${itemUrl}`);
  }

  if (source && title && cents > 0 && imageUrl) {
    keys.push(`content:${source}:${title}:${cents}:${imageUrl}`);
  }

  return keys;
}

export function uniqueProductsByListingIdentity(products: Product[]) {
  const seen = new Set<string>();

  return products.filter(product => {
    const keys = productIdentityKeys(product);
    const duplicate = keys.some(key => seen.has(key));

    if (duplicate) {
      return false;
    }

    keys.forEach(key => seen.add(key));
    return true;
  });
}
