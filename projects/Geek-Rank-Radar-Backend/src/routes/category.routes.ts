import { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../config/database.js';
import { sendSuccess } from '../utils/response.js';
import { validateBody } from '../middleware/validator.js';

const createCategorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  parentId: z.string().uuid().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const addKeywordsSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1),
});

const createServiceAreaSchema = z.object({
  name: z.string().min(1),
  state: z.string().default('FL'),
  centerLat: z.number(),
  centerLng: z.number(),
  radiusMiles: z.number().default(3),
});

const updateServiceAreaSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  radiusMiles: z.number().optional(),
});

export function createCategoryRoutes(): Router {
  const router = Router();

  // GET /api/categories — List all categories with keyword counts
  router.get('/', async (_req, res, next) => {
    try {
      const categories = await getPrisma().category.findMany({
        where: { isActive: true },
        include: {
          keywords: { where: { isActive: true }, orderBy: { priority: 'desc' } },
          children: { where: { isActive: true } },
          _count: { select: { businesses: true } },
        },
        orderBy: { name: 'asc' },
      });
      sendSuccess(res, categories);
    } catch (error: unknown) {
      next(error);
    }
  });

  // POST /api/categories — Create category
  router.post('/', validateBody(createCategorySchema), async (req, res, next) => {
    try {
      const category = await getPrisma().category.create({
        data: req.body,
        include: { keywords: true },
      });
      sendSuccess(res, category, 201);
    } catch (error: unknown) {
      next(error);
    }
  });

  // PUT /api/categories/:id — Update category
  router.put('/:id', validateBody(updateCategorySchema), async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const category = await getPrisma().category.update({
        where: { id },
        data: req.body,
        include: { keywords: true },
      });
      sendSuccess(res, category);
    } catch (error: unknown) {
      next(error);
    }
  });

  // POST /api/categories/:id/keywords — Add keywords
  router.post('/:id/keywords', validateBody(addKeywordsSchema), async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const { keywords } = req.body as { keywords: string[] };

      const created = await Promise.all(
        keywords.map((keyword: string) =>
          getPrisma().categoryKeyword.upsert({
            where: { categoryId_keyword: { categoryId: id, keyword } },
            update: {},
            create: { categoryId: id, keyword },
          }),
        ),
      );

      sendSuccess(res, created, 201);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}

export function createServiceAreaRoutes(): Router {
  const router = Router();

  // GET /api/service-areas — List service areas
  router.get('/', async (_req, res, next) => {
    try {
      const areas = await getPrisma().serviceArea.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
      sendSuccess(res, areas);
    } catch (error: unknown) {
      next(error);
    }
  });

  // POST /api/service-areas — Create service area
  router.post('/', validateBody(createServiceAreaSchema), async (req, res, next) => {
    try {
      const area = await getPrisma().serviceArea.create({ data: req.body });
      sendSuccess(res, area, 201);
    } catch (error: unknown) {
      next(error);
    }
  });

  // PUT /api/service-areas/:id — Update service area
  router.put('/:id', validateBody(updateServiceAreaSchema), async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const area = await getPrisma().serviceArea.update({
        where: { id },
        data: req.body,
      });
      sendSuccess(res, area);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
