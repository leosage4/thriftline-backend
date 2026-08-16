export type ListingFilterCategory = 'Tops' | 'Pants' | 'Shoes' | 'Jackets' | 'Accessories';

export type ListingCategory =
  | ListingFilterCategory
  | 'Shorts'
  | 'Formal';

export type DetectedClothingCategory = {
  category: ListingCategory;
  filterCategory: ListingFilterCategory;
  type: string;
  term: string;
};

type KeywordEntry = {
  terms: string[];
  category: ListingCategory;
  filterCategory: ListingFilterCategory;
  type: string;
};

const KEYWORD_ENTRIES: KeywordEntry[] = [
  {
    category: 'Accessories',
    filterCategory: 'Accessories',
    type: 'phone case',
    terms: ['phone case', 'iphone case', 'case'],
  },
  {
    category: 'Accessories',
    filterCategory: 'Accessories',
    type: 'bag',
    terms: ['backpack', 'fanny pack', 'satchel', 'satchels', 'tote', 'totes', 'purse', 'bag', 'bags'],
  },
  {
    category: 'Accessories',
    filterCategory: 'Accessories',
    type: 'hat',
    terms: ['headband', 'headbands', 'beanie', 'beanies', 'fedora', 'fedoras', 'cap', 'caps', 'hat', 'hats'],
  },
  {
    category: 'Accessories',
    filterCategory: 'Accessories',
    type: 'jewelry',
    terms: ['necklace', 'necklaces', 'bracelet', 'bracelets', 'earring', 'earrings', 'ring', 'rings', 'watch', 'watches', 'pendant', 'pendants'],
  },
  {
    category: 'Accessories',
    filterCategory: 'Accessories',
    type: 'small accessory',
    terms: ['wallet', 'wallets', 'glove', 'gloves', 'scarf', 'scarves', 'belt', 'belts', 'sock', 'socks'],
  },
  {
    category: 'Shoes',
    filterCategory: 'Shoes',
    type: 'shoes',
    terms: ['basketball shoes', 'running shoes', 'dress shoes', 'skate shoes', 'hiking boots', 'soccer cleats', 'football cleats', 'sneakers', 'sneaker', 'trainers', 'trainer', 'boots', 'boot', 'loafers', 'loafer', 'sandals', 'sandal', 'slides', 'slide', 'clogs', 'clog', 'shoes', 'shoe'],
  },
  {
    category: 'Jackets',
    filterCategory: 'Jackets',
    type: 'jacket',
    terms: ['varsity jacket', 'denim jacket', 'leather jacket', 'rain jacket', 'track jacket', 'shell jacket', 'windbreaker', 'windbreakers', 'puffer', 'puffers', 'bomber', 'bombers', 'parka', 'parkas', 'anorak', 'anoraks', 'jacket', 'jackets', 'coat', 'coats', 'fleece'],
  },
  {
    category: 'Pants',
    filterCategory: 'Pants',
    type: 'jeans',
    terms: ['jeans', 'jean', 'denim pants'],
  },
  {
    category: 'Pants',
    filterCategory: 'Pants',
    type: 'sweatpants',
    terms: ['sweatpants', 'joggers', 'jogger', 'track pants', 'training pants'],
  },
  {
    category: 'Pants',
    filterCategory: 'Pants',
    type: 'pants',
    terms: ['cargo pants', 'corduroy pants', 'dress pants', 'work pants', 'yoga pants', 'khakis', 'khaki', 'chinos', 'chino', 'trousers', 'trouser', 'leggings', 'pants', 'pant'],
  },
  {
    category: 'Shorts',
    filterCategory: 'Pants',
    type: 'jorts',
    terms: ['denim shorts', 'jean shorts', 'jorts'],
  },
  {
    category: 'Shorts',
    filterCategory: 'Pants',
    type: 'cargo shorts',
    terms: ['cargo shorts', 'utility shorts'],
  },
  {
    category: 'Shorts',
    filterCategory: 'Pants',
    type: 'athletic shorts',
    terms: ['basketball shorts', 'compression shorts', 'running shorts', 'athletic shorts', 'workout shorts', 'sports shorts', 'sport shorts', 'gym shorts', 'training shorts'],
  },
  {
    category: 'Shorts',
    filterCategory: 'Pants',
    type: 'shorts',
    terms: ['shorts'],
  },
  {
    category: 'Tops',
    filterCategory: 'Tops',
    type: 'hoodie',
    terms: ['zip hoodie', 'zip up hoodie', 'hoodie', 'hoodies', 'pullover', 'pullovers'],
  },
  {
    category: 'Tops',
    filterCategory: 'Tops',
    type: 'long sleeve shirt',
    terms: ['long sleeve shirt', 'long sleeve t shirt', 'long sleeve t-shirt', 'long sleeve tee', 'long sleeve'],
  },
  {
    category: 'Tops',
    filterCategory: 'Tops',
    type: 'shirt',
    terms: ['graphic tee', 't shirt', 't-shirt', 'tshirt', 'tee shirt', 'dress shirt', 'compression shirt', 'jersey', 'jerseys', 'polo', 'polos', 'shirt', 'shirts', 'tee', 'tees'],
  },
  {
    category: 'Tops',
    filterCategory: 'Tops',
    type: 'sweatshirt',
    terms: ['crewneck', 'crew neck', 'sweatshirt', 'sweatshirts'],
  },
  {
    category: 'Tops',
    filterCategory: 'Tops',
    type: 'button up',
    terms: ['button down', 'button up', 'flannel', 'flannels'],
  },
  {
    category: 'Tops',
    filterCategory: 'Tops',
    type: 'sweater',
    terms: ['knit sweater', 'sweater', 'sweaters', 'quarter zip', 'cardigan', 'cardigans', 'vest', 'vests'],
  },
  {
    category: 'Formal',
    filterCategory: 'Jackets',
    type: 'formal jacket',
    terms: ['sport coat', 'blazer', 'blazers', 'suit', 'suits', 'tuxedo', 'tuxedos', 'waistcoat', 'waistcoats'],
  },
  {
    category: 'Formal',
    filterCategory: 'Accessories',
    type: 'tie',
    terms: ['bow tie', 'tie', 'ties'],
  },
];

const SORTED_KEYWORD_ENTRIES = KEYWORD_ENTRIES
  .flatMap(entry => entry.terms.map(term => ({ ...entry, term })))
  .sort((a, b) => {
    if (a.term === 'shorts' && b.term !== 'shorts') return 1;
    if (b.term === 'shorts' && a.term !== 'shorts') return -1;

    return b.term.length - a.term.length;
  });

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasTerm(text: string, term: string) {
  const normalizedTerm = normalizeText(term);
  const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`(^|\\s)${escapedTerm}(\\s|$)`).test(text);
}

export function detectClothingCategory(
  ...parts: Array<string | undefined>
): DetectedClothingCategory | null {
  const titleText = normalizeText(parts[0] ?? '');
  const fullText = normalizeText(parts.filter(Boolean).join(' '));

  if (
    fullText.includes('supreme court') ||
    fullText.includes('court justice') ||
    fullText.includes('court case') ||
    fullText.includes('scotus')
  ) {
    return null;
  }

  const titleMatch = SORTED_KEYWORD_ENTRIES.find(entry => hasTerm(titleText, entry.term));
  const match = titleMatch ?? SORTED_KEYWORD_ENTRIES.find(entry => hasTerm(fullText, entry.term));

  if (!match) {
    return null;
  }

  return {
    category: match.category,
    filterCategory: match.filterCategory,
    type: match.type,
    term: match.term,
  };
}
