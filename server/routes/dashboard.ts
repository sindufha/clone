import express from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth.js';
import { dashboardStats } from '../store.js';
export const dashboardRouter = express.Router();
dashboardRouter.use(requireAuth);
dashboardRouter.get('/stats', async (req: AuthenticatedRequest, res) => {
  res.json({ success: true, stats: await dashboardStats(req.user!.id) });
});
