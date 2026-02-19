export interface CategorySeed {
  name: string;
  slug: string;
  parentSlug?: string;
  keywords: string[];
}

export const CATEGORY_SEEDS: CategorySeed[] = [
  {
    name: 'IT Consulting',
    slug: 'it-consulting',
    keywords: [
      'IT consulting',
      'tech consulting near me',
      'computer consulting',
      'IT support small business',
      'technology consultant',
    ],
  },
  {
    name: 'Web Development',
    slug: 'web-development',
    keywords: [
      'web developer near me',
      'website development',
      'custom software development',
      'web design',
      'app development near me',
    ],
  },
  {
    name: 'SEO Services',
    slug: 'seo-services',
    keywords: [
      'SEO services near me',
      'SEO company',
      'local SEO',
      'search engine optimization',
      'SEO agency',
    ],
  },
  {
    name: 'Computer Repair',
    slug: 'computer-repair',
    keywords: [
      'computer repair near me',
      'laptop repair',
      'PC repair',
      'computer fix near me',
      'tech repair',
    ],
  },
  {
    name: 'Managed IT Services',
    slug: 'managed-it-services',
    keywords: [
      'managed IT services',
      'managed service provider',
      'IT managed services near me',
      'MSP near me',
    ],
  },
  {
    name: 'Restaurants',
    slug: 'restaurants',
    keywords: [
      'restaurants near me',
      'best restaurants',
      'food near me',
      'dinner near me',
      'lunch spots',
    ],
  },
  {
    name: 'Pizza',
    slug: 'pizza',
    parentSlug: 'restaurants',
    keywords: [
      'pizza near me',
      'best pizza',
      'pizza delivery',
      'pizzeria near me',
    ],
  },
  {
    name: 'Mexican Restaurants',
    slug: 'mexican-restaurants',
    parentSlug: 'restaurants',
    keywords: [
      'mexican food near me',
      'mexican restaurant',
      'tacos near me',
      'best mexican food',
    ],
  },
  {
    name: 'Italian Restaurants',
    slug: 'italian-restaurants',
    parentSlug: 'restaurants',
    keywords: [
      'italian restaurant near me',
      'italian food',
      'pasta near me',
      'best italian restaurant',
    ],
  },
  {
    name: 'Fast Food',
    slug: 'fast-food',
    parentSlug: 'restaurants',
    keywords: [
      'fast food near me',
      'drive through near me',
      'quick food',
      'cheap eats near me',
    ],
  },
  {
    name: 'Coffee Shops',
    slug: 'coffee-shops',
    parentSlug: 'restaurants',
    keywords: [
      'coffee near me',
      'coffee shop',
      'cafe near me',
      'best coffee',
    ],
  },
  {
    name: 'Bars & Nightlife',
    slug: 'bars-nightlife',
    parentSlug: 'restaurants',
    keywords: [
      'bars near me',
      'happy hour near me',
      'sports bar',
      'cocktail bar near me',
    ],
  },
];
