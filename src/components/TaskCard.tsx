import { useState } from 'react';
import { ArrowUpRight, Clock3, Users, Undo2 } from 'lucide-react';
import type { Assignment, AssignmentStatus } from '../../shared/types';
import { FRESH_MS } from '../../shared/reminders';
import { ignoreAssignment } from '../api';
export const statusLabels: Record<AssignmentStatus, string> = { pending: 'Belum dikumpulkan', draft: 'Masih draf', overdue: 'Lewat deadline', submitted: 'Sudah dikumpulkan', unknown: 'Belum terverifikasi' };
export function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB' : 'Belum tersedia';
}
export function TaskCard({ item, onChange }: { item: Assignment; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [expanded, setExpanded] = useState(false);
  async function toggle() {
    setBusy(true); setError('');
    try { await ignoreAssignment(item.id, !item.dismissedAt); await onChange(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  const stale = !item.verified || !item.checkedAt || Date.now() - Date.parse(item.checkedAt) > FRESH_MS;
  return <article className="task-card"><div className="task-top"><span className="course-label">{item.courseName}</span><span className={'badge ' + item.status}>{statusLabels[item.status]}</span></div><button className="task-title" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{item.title}</button><p className="task-date"><Clock3 size={14}/>{item.dueAt ? dateLabel(item.dueAt) : 'Deadline belum tersedia · tanpa pengingat'}</p>{stale && <p className="verification-note">{item.lastError || 'Data belum diperiksa kembali. Pengingat ditunda sampai terverifikasi.'}</p>}{expanded && <div className="task-description"><p>{item.description || 'Buka Moodle untuk membaca instruksi lengkap.'}</p><small>Diperiksa: {dateLabel(item.checkedAt)}</small>{item.submittedAt && <small>Terakhir diubah di Moodle: {dateLabel(item.submittedAt)}</small>}</div>}<div className="task-actions"><a href={item.url} target="_blank" rel="noreferrer" className="text-button">Buka Moodle <ArrowUpRight size={15}/></a>{item.dismissedAt ? <button className="text-button muted-text" disabled={busy} onClick={() => void toggle()}><Undo2 size={14}/>Pulihkan pengingat</button> : item.status !== 'submitted' && !item.archived && <button className="text-button muted-text" disabled={busy} onClick={() => void toggle()}><Users size={14}/>{busy ? 'Menyimpan…' : 'Sudah diwakili kelompok'}</button>}</div>{error && <p className="alert error" role="alert">{error}</p>}</article>;
}
