export type Marketplace = 'ebay' | 'etsy' | 'depop' | 'vinted';

export const PRODUCT_CONDITIONS = [
  'New with tags',
  'Like New',
  'Pre owned - Excellent',
  'Pre owned - Good',
  'Pre owned - Fair',
  'Used / vintage',
  'Not specified',
] as const;

export type ProductCondition = typeof PRODUCT_CONDITIONS[number] | string;

export type DealConfidence = 'low' | 'medium' | 'high';

export type DealRating = {
  score: number;
  confidence: DealConfidence;
  priceRank: number;
  medianComparablePrice: number;
  lowestComparablePrice: number;
  highestComparablePrice: number;
  explanation: string;
};

export interface Product {
  id: string;
  title: string;
  description?: string;
  size?: string;

  price: number;
  shippingCost?: number | null;

  imageUrl: string;
  imageUrls: string[];
  itemWebUrl: string;

  condition: ProductCondition;
  source: Marketplace;

  dealRating?: DealRating;
}
