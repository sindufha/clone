import express from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth.js';
import { getCourse, listCourses } from '../store.js';
export const coursesRouter = express.Router();
coursesRouter.use(requireAuth);
coursesRouter.get('/', async (req: AuthenticatedRequest, res) => {
  res.json({ success: true, courses: await listCourses(req.user!.id) });
});
coursesRouter.get('/:id', async (req: AuthenticatedRequest, res) => {
  const course = await getCourse(req.user!.id, String(req.params.id));
  if (!course) { res.status(404).json({ success: false, error: 'Mata kuliah belum tersedia atau di luar whitelist.' }); return; }
  res.json({ success: true, course });
});
