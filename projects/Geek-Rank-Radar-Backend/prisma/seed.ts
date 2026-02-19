import { PrismaClient } from '../src/generated/prisma/client/index.js';
import { SERVICE_AREA_SEEDS } from '../src/config/serviceAreas.js';
import { CATEGORY_SEEDS } from '../src/config/categories.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding service areas...');
  for (const area of SERVICE_AREA_SEEDS) {
    await prisma.serviceArea.upsert({
      where: { id: area.name },
      update: {},
      create: {
        name: area.name,
        state: area.state,
        centerLat: area.centerLat,
        centerLng: area.centerLng,
        radiusMiles: area.radiusMiles,
      },
    });
  }
  // Re-fetch created areas to get their IDs
  const areas = await prisma.serviceArea.findMany();
  console.log(`  Created ${areas.length} service areas`);

  console.log('Seeding categories and keywords...');
  // First pass: create parent categories
  const parentCategories = CATEGORY_SEEDS.filter((c) => !c.parentSlug);
  for (const cat of parentCategories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name },
      create: {
        name: cat.name,
        slug: cat.slug,
      },
    });
  }

  // Second pass: create child categories with parent references
  const childCategories = CATEGORY_SEEDS.filter((c) => c.parentSlug);
  for (const cat of childCategories) {
    const parent = await prisma.category.findUnique({
      where: { slug: cat.parentSlug },
    });
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, parentId: parent?.id },
      create: {
        name: cat.name,
        slug: cat.slug,
        parentId: parent?.id,
      },
    });
  }

  // Third pass: create keywords for all categories
  for (const cat of CATEGORY_SEEDS) {
    const category = await prisma.category.findUnique({
      where: { slug: cat.slug },
    });
    if (!category) continue;

    for (let i = 0; i < cat.keywords.length; i++) {
      const keyword = cat.keywords[i];
      await prisma.categoryKeyword.upsert({
        where: {
          categoryId_keyword: {
            categoryId: category.id,
            keyword,
          },
        },
        update: { priority: cat.keywords.length - i },
        create: {
          categoryId: category.id,
          keyword,
          priority: cat.keywords.length - i,
        },
      });
    }
  }

  const totalKeywords = await prisma.categoryKeyword.count();
  const totalCategories = await prisma.category.count();
  console.log(`  Created ${totalCategories} categories with ${totalKeywords} keywords`);

  console.log('Seed complete!');
}

main()
  .catch((e: unknown) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
