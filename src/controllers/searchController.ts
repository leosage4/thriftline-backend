import type { NextFunction, Request, Response } from 'express';
import {
  SEARCH_SORT_OPTIONS,
  SUPPORTED_SEARCH_MARKETPLACES,
  searchProducts,
  type SearchRequest,
  type SearchSort,
  type SupportedSearchMarketplace,
} from '../services/searchService';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_QUERY_LENGTH = 120;

type QueryValue = string | string[] | undefined;

function firstQueryValue(value: QueryValue) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInteger(value: QueryValue, fallback: number) {
  const rawValue = firstQueryValue(value);

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseOptionalPrice(value: QueryValue) {
  const rawValue = firstQueryValue(value);

  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseMarketplaces(value: QueryValue) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const requested = rawValues
    .flatMap(rawValue => rawValue.split(','))
    .map(rawValue => rawValue.trim().toLowerCase())
    .filter(Boolean);

  if (requested.length === 0) {
    return [...SUPPORTED_SEARCH_MARKETPLACES];
  }

  const unsupported = requested.filter(marketplace => (
    !SUPPORTED_SEARCH_MARKETPLACES.includes(marketplace as SupportedSearchMarketplace)
  ));

  if (unsupported.length > 0) {
    return null;
  }

  return Array.from(new Set(requested)) as SupportedSearchMarketplace[];
}

function parseSort(value: QueryValue) {
  const sort = firstQueryValue(value) ?? 'bestMatch';

  if (!SEARCH_SORT_OPTIONS.includes(sort as SearchSort)) {
    return null;
  }

  return sort as SearchSort;
}

function parseSearchRequest(req: Request): SearchRequest | { error: string } {
  const query = firstQueryValue(req.query.q as QueryValue)?.trim().replace(/\s+/g, ' ') ?? '';

  if (!query) {
    return { error: 'Search query is required.' };
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return { error: `Search query must be ${MAX_QUERY_LENGTH} characters or less.` };
  }

  const limit = parsePositiveInteger(req.query.limit as QueryValue, DEFAULT_LIMIT);
  if (limit === null || limit > MAX_LIMIT) {
    return { error: `Limit must be between 1 and ${MAX_LIMIT}.` };
  }

  const page = parsePositiveInteger(req.query.page as QueryValue, 1);
  if (page === null) {
    return { error: 'Page must be a positive whole number.' };
  }

  const minPrice = parseOptionalPrice(req.query.minPrice as QueryValue);
  if (minPrice === null) {
    return { error: 'Minimum price must be a valid positive number.' };
  }

  const maxPrice = parseOptionalPrice(req.query.maxPrice as QueryValue);
  if (maxPrice === null) {
    return { error: 'Maximum price must be a valid positive number.' };
  }

  if (
    typeof minPrice === 'number' &&
    typeof maxPrice === 'number' &&
    minPrice > maxPrice
  ) {
    return { error: 'Minimum price cannot be higher than maximum price.' };
  }

  const marketplaces = parseMarketplaces(req.query.marketplaces as QueryValue);
  if (marketplaces === null) {
    return { error: 'Requested marketplace is not supported.' };
  }

  const sort = parseSort(req.query.sort as QueryValue);
  if (sort === null) {
    return { error: 'Requested sort option is not supported.' };
  }

  return {
    query,
    limit,
    page,
    marketplaces,
    minPrice,
    maxPrice,
    size: firstQueryValue(req.query.size as QueryValue)?.trim(),
    condition: firstQueryValue(req.query.condition as QueryValue)?.trim(),
    sort,
  };
}

export async function searchController(req: Request, res: Response, next: NextFunction) {
  try {
    const searchRequest = parseSearchRequest(req);

    if ('error' in searchRequest) {
      res.status(400).json({ error: searchRequest.error });
      return;
    }

    const response = await searchProducts(searchRequest);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}
