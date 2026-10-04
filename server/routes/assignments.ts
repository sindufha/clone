import express from 'express';
import { z } from 'zod';
import { requireAuth, requireCsrf, type AuthenticatedRequest } from '../auth.js';
import { dismissAssignment, getAssignment, listAssignments } from '../store.js';
const querySchema = z.object({
  course: z.string().max(30).optional(), status: z.enum(['all','submitted','pending','overdue','draft','unknown']).optional(),
  search: z.string().trim().max(120).optional(), scope: z.enum(['active','ignored','archived']).default('active'),
  sortBy: z.enum(['dueDate','latest','title','course']).default('dueDate'), order: z.enum(['asc','desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(100).default(100), offset: z.coerce.number().int().min(0).default(0),
});
export const assignmentsRouter = express.Router();
assignmentsRouter.use(requireAuth, requireCsrf);
assignmentsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ success: false, error: 'Filter tugas tidak valid.' }); return; }
  res.json({ success: true, ...await listAssignments(req.user!.id, parsed.data) });
});
assignmentsRouter.get('/:id', async (req: AuthenticatedRequest, res) => {
  const assignment = await getAssignment(req.user!.id, String(req.params.id));
  if (!assignment) { res.status(404).json({ success: false, error: 'Tugas tidak ditemukan.' }); return; }
  res.json({ success: true, assignment });
});
for (const [method, ignored] of [['post', true], ['delete', false]] as const) {
  assignmentsRouter[method]('/:id/ignore', async (req: AuthenticatedRequest, res) => {
    if (!await dismissAssignment(req.user!.id, String(req.params.id), ignored)) {
      res.status(404).json({ success: false, error: 'Tugas tidak ditemukan.' }); return;
    }
    res.json({ success: true, assignment: await getAssignment(req.user!.id, String(req.params.id)) });
  });
}
