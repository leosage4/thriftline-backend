const LETTER_SIZE_PATTERN = /\b(?:size|sz)\s*(xxs|xs|s|m|l|xl|xxl|2xl|xxxl)\b/i;
const NUMERIC_SIZE_PATTERN = /\b(?:size|sz)\s*(\d{1,2}(?:\.\d)?)\b/i;
const WAIST_LENGTH_PATTERN = /\b(?:w\s*)?(\d{2})\s*[x/]\s*(?:l\s*)?(\d{2})\b/i;
const WAIST_PATTERN = /\b(?:waist|w)\s*(\d{2})\b/i;
const COMPACT_WAIST_PATTERN = /\bw\s*(2[6-9]|3[0-9]|4[0-2])\b/i;
const STANDALONE_WAIST_PATTERN = /\b(2[6-9]|3[0-9]|4[0-2])\b/;
const SHOE_SIZE_PATTERN = /\b(?:us|mens|men's|womens|women's|m|w)\s*(\d{1,2}(?:\.\d)?)\b/i;
const STANDALONE_LETTER_SIZE_PATTERN = /\b(XXS|XS|S|M|L|XL|XXL|2XL|XXXL)\b/;
const SPELLED_SIZE_PATTERN = /\b(extra\s+extra\s+small|extra\s+small|small|medium|large|extra\s+large|extra\s+extra\s+large|x-small|x-large|xx-large|2x-large|xxx-large)\b/i;

export const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL'] as const;
export const JEAN_SIZES = ['26', '28', '30', '32', '34', '36', '38', '40', '42'] as const;
export const SHOE_SIZES = ['4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'] as const;

export type SizeRange = {
  minIndex: number;
  maxIndex: number;
};

export type SizePreferences = {
  shirtRange: SizeRange;
  pantsRange: SizeRange;
  waistRange: SizeRange;
  lengthRange: SizeRange;
  shoeRange: SizeRange;
};

export const DEFAULT_SIZE_PREFERENCES: SizePreferences = {
  shirtRange: { minIndex: 0, maxIndex: LETTER_SIZES.length - 1 },
  pantsRange: { minIndex: 0, maxIndex: LETTER_SIZES.length - 1 },
  waistRange: { minIndex: 0, maxIndex: JEAN_SIZES.length - 1 },
  lengthRange: { minIndex: 0, maxIndex: JEAN_SIZES.length - 1 },
  shoeRange: { minIndex: 0, maxIndex: SHOE_SIZES.length - 1 },
};

type SizeFilterProduct = {
  title: string;
  description?: string;
  size?: string;
};

function normalizeLetterSize(value: string) {
  const normalized = value.toUpperCase();

  if (normalized === 'XXL') return '2XL';

  return normalized;
}

function normalizeSpelledSize(value: string) {
  const normalized = value.toLowerCase().replace(/[-\s]+/g, ' ').trim();

  if (normalized === 'extra extra small') return 'XXS';
  if (normalized === 'extra small') return 'XS';
  if (normalized === 'small') return 'S';
  if (normalized === 'medium') return 'M';
  if (normalized === 'large') return 'L';
  if (normalized === 'x large') return 'XL';
  if (normalized === 'extra large') return 'XL';
  if (normalized === 'xx large') return '2XL';
  if (normalized === 'extra extra large') return '2XL';
  if (normalized === '2x large') return '2XL';
  if (normalized === 'xxx large') return 'XXXL';

  return undefined;
}

function looksLikeShoes(text: string) {
  return /\b(shoe|shoes|sneaker|sneakers|boot|boots|trainer|trainers|sandal|sandals|loafer|loafers)\b/i.test(text);
}

function looksLikePants(text: string) {
  return /\b(jean|jeans|denim|pant|pants|trouser|trousers|cargo|chino|chinos|slack|slacks)\b/i.test(text);
}

export function extractListingSize(...parts: Array<string | undefined>) {
  const text = parts.filter(Boolean).join(' ');

  if (!text.trim()) {
    return undefined;
  }

  const waistLengthMatch = text.match(WAIST_LENGTH_PATTERN);
  if (waistLengthMatch) {
    return `${waistLengthMatch[1]}x${waistLengthMatch[2]}`;
  }

  const compactWaistMatch = text.match(COMPACT_WAIST_PATTERN);
  if (compactWaistMatch) {
    return compactWaistMatch[1];
  }

  if (looksLikePants(text)) {
    const standaloneWaistMatch = text.match(STANDALONE_WAIST_PATTERN);
    if (standaloneWaistMatch) {
      return standaloneWaistMatch[1];
    }
  }

  const letterMatch = text.match(LETTER_SIZE_PATTERN);
  if (letterMatch) {
    return normalizeLetterSize(letterMatch[1]);
  }

  const spelledSizeMatch = text.match(SPELLED_SIZE_PATTERN);
  if (spelledSizeMatch) {
    return normalizeSpelledSize(spelledSizeMatch[1]);
  }

  const standaloneLetterMatch = text.match(STANDALONE_LETTER_SIZE_PATTERN);
  if (standaloneLetterMatch) {
    return normalizeLetterSize(standaloneLetterMatch[1]);
  }

  if (looksLikeShoes(text)) {
    const shoeSizeMatch = text.match(SHOE_SIZE_PATTERN);
    if (shoeSizeMatch) {
      return shoeSizeMatch[1];
    }
  }

  const numericMatch = text.match(NUMERIC_SIZE_PATTERN);
  if (numericMatch) {
    return numericMatch[1];
  }

  const waistMatch = text.match(WAIST_PATTERN);
  if (waistMatch) {
    return waistMatch[1];
  }

  return undefined;
}

function valuesInRange(values: readonly string[], range: SizeRange) {
  return values.slice(range.minIndex, range.maxIndex + 1);
}

function listingCategory(product: SizeFilterProduct) {
  const text = `${product.title} ${product.description ?? ''}`.toLowerCase();

  if (/\b(shoe|shoes|sneaker|sneakers|boot|boots|trainer|trainers|sandal|sandals)\b/.test(text)) {
    return 'shoes';
  }

  if (looksLikePants(text)) {
    return 'pants';
  }

  return 'tops';
}

function allowedSizesForCategory(category: string, preferences: SizePreferences) {
  if (category === 'shoes') {
    return valuesInRange(SHOE_SIZES, preferences.shoeRange);
  }

  if (category === 'pants') {
    return [
      ...valuesInRange(LETTER_SIZES, preferences.pantsRange),
      ...valuesInRange(JEAN_SIZES, preferences.waistRange),
    ];
  }

  return valuesInRange(LETTER_SIZES, preferences.shirtRange);
}

export function matchesSavedSizePreferences(
  product: SizeFilterProduct,
  preferences: SizePreferences = DEFAULT_SIZE_PREFERENCES,
) {
  if (!product.size) {
    return true;
  }

  const category = listingCategory(product);
  const allowedSizes = allowedSizesForCategory(category, preferences);
  const normalizedSize = normalizeLetterSize(product.size);

  if (/^\d{2}X\d{2}$/.test(normalizedSize)) {
    const [waist, length] = normalizedSize.split('X');
    return (
      allowedSizes.includes(waist) &&
      valuesInRange(JEAN_SIZES, preferences.lengthRange).includes(length)
    );
  }

  return allowedSizes.includes(normalizedSize);
}

export function formatListingSizeLabel(product: SizeFilterProduct) {
  if (!product.size) {
    return 'No size, check listing';
  }

  const category = listingCategory(product);
  const normalizedSize = normalizeLetterSize(product.size);

  if (category === 'pants' && /^\d{2}$/.test(normalizedSize)) {
    return `Size W${normalizedSize}`;
  }

  return `Size ${normalizedSize}`;
}
