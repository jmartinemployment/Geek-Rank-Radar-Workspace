import { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../config/database.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';
import { validateQuery, validateBody } from '../middleware/validator.js';

const listBusinessesSchema = z.object({
  categoryId: z.string().uuid().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  isMine: z.coerce.boolean().optional(),
  isCompetitor: z.coerce.boolean().optional(),
  minRating: z.coerce.number().optional(),
  hasPhone: z.coerce.boolean().optional(),
  hasWebsite: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const updateBusinessSchema = z.object({
  isMine: z.boolean().optional(),
  isCompetitor: z.boolean().optional(),
});

export function createBusinessRoutes(): Router {
  const router = Router();

  // GET /api/businesses — List businesses with filters
  router.get('/', validateQuery(listBusinessesSchema), async (req, res, next) => {
    try {
      const filters = req.query as unknown as z.infer<typeof listBusinessesSchema>;
      const where: Record<string, unknown> = { isActive: true };

      if (filters.categoryId) where.categoryId = filters.categoryId;
      if (filters.city) where.city = { equals: filters.city, mode: 'insensitive' };
      if (filters.state) where.state = filters.state;
      if (filters.isMine !== undefined) where.isMine = filters.isMine;
      if (filters.isCompetitor !== undefined) where.isCompetitor = filters.isCompetitor;
      if (filters.hasPhone) where.phone = { not: null };
      if (filters.hasWebsite) where.website = { not: null };
      if (filters.minRating !== undefined) {
        where.googleRating = { gte: filters.minRating };
      }

      const [businesses, total] = await Promise.all([
        getPrisma().business.findMany({
          where,
          include: { category: true },
          orderBy: { lastSeenAt: 'desc' },
          skip: (filters.page - 1) * filters.limit,
          take: filters.limit,
        }),
        getPrisma().business.count({ where }),
      ]);

      sendPaginated(res, businesses, {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  // GET /api/businesses/mine — Own businesses
  router.get('/mine', async (_req, res, next) => {
    try {
      const businesses = await getPrisma().business.findMany({
        where: { isMine: true, isActive: true },
        include: { category: true },
        orderBy: { name: 'asc' },
      });
      sendSuccess(res, businesses);
    } catch (error: unknown) {
      next(error);
    }
  });

  // GET /api/businesses/competitors — Competitor businesses
  router.get('/competitors', async (_req, res, next) => {
    try {
      const businesses = await getPrisma().business.findMany({
        where: { isCompetitor: true, isActive: true },
        include: { category: true },
        orderBy: { name: 'asc' },
      });
      sendSuccess(res, businesses);
    } catch (error: unknown) {
      next(error);
    }
  });

  // GET /api/businesses/search — Full-text search
  router.get('/search', async (req, res, next) => {
    try {
      const q = typeof req.query['q'] === 'string' ? req.query['q'] : '';
      if (!q) {
        sendError(res, 'Query parameter "q" is required', 400);
        return;
      }

      const businesses = await getPrisma().business.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { address: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { website: { contains: q, mode: 'insensitive' } },
          ],
        },
        include: { category: true },
        orderBy: { lastSeenAt: 'desc' },
        take: 50,
      });
      sendSuccess(res, businesses);
    } catch (error: unknown) {
      next(error);
    }
  });

  // GET /api/businesses/:id — Full business profile
  router.get('/:id', async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const business = await getPrisma().business.findUnique({
        where: { id },
        include: { category: true },
      });
      if (!business) {
        sendError(res, 'Business not found', 404);
        return;
      }
      sendSuccess(res, business);
    } catch (error: unknown) {
      next(error);
    }
  });

  // GET /api/businesses/:id/rankings — Rank history
  router.get('/:id/rankings', async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const rankings = await getPrisma().scanRanking.findMany({
        where: { businessId: id },
        include: {
          scanPoint: {
            include: {
              scan: {
                include: { serviceArea: true, category: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      sendSuccess(res, rankings);
    } catch (error: unknown) {
      next(error);
    }
  });

  // GET /api/businesses/:id/reviews — Review count history
  router.get('/:id/reviews', async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const reviews = await getPrisma().reviewSnapshot.findMany({
        where: { businessId: id },
        orderBy: { capturedAt: 'desc' },
        take: 100,
      });
      sendSuccess(res, reviews);
    } catch (error: unknown) {
      next(error);
    }
  });

  // PUT /api/businesses/:id — Update business flags
  router.put('/:id', validateBody(updateBusinessSchema), async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const business = await getPrisma().business.update({
        where: { id },
        data: req.body,
        include: { category: true },
      });
      sendSuccess(res, business);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
