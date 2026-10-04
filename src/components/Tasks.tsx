import { useCallback, useEffect, useState } from 'react';
import { Search, CalendarDays } from 'lucide-react';
import type { Assignment, CourseSummary } from '../../shared/types';
import { getAssignments } from '../api';
import { statusLabels, TaskCard } from './TaskCard';
export function Tasks({ courses, onChange }: { courses: CourseSummary[]; onChange: () => Promise<void> }) {
  const [items, setItems] = useState<Assignment[]>([]); const [total, setTotal] = useState(0);
  const [scope, setScope] = useState('active'); const [course, setCourse] = useState('all'); const [status, setStatus] = useState('all'); const [search, setSearch] = useState(''); const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => {
    const result = await getAssignments({ scope, course, status, search, offset: String(offset) }); setItems(result.assignments); setTotal(result.total);
  }, [scope, course, status, search, offset]);
  useEffect(() => {
    let active = true; setLoading(true);
    const update = async () => {
      try { const result = await getAssignments({ scope, course, status, search, offset: String(offset) }); if (active) { setItems(result.assignments); setTotal(result.total); setError(''); } }
      catch (error) { if (active) setError((error as Error).message); } finally { if (active) setLoading(false); }
    };
    const delay = setTimeout(() => void update(), 250); const timer = setInterval(() => { if (!document.hidden) void update(); }, 30_000);
    return () => { active = false; clearTimeout(delay); clearInterval(timer); };
  }, [scope, course, status, search, offset]);
  async function changed() { await Promise.all([load(), onChange()]); }
  return <section><div className="tabs" role="group" aria-label="Kategori tugas">{[{ value: 'active', label: 'Tugas aktif' }, { value: 'ignored', label: 'Diwakili kelompok' }, { value: 'archived', label: 'Arsip' }].map((item) => <button key={item.value} aria-pressed={scope === item.value} className={scope === item.value ? 'active' : ''} onClick={() => { setScope(item.value); setOffset(0); }}>{item.label}</button>)}</div><div className="filters"><label className="search"><Search size={17}/><input aria-label="Cari tugas" placeholder="Cari tugas atau mata kuliah…" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }}/></label><select aria-label="Filter mata kuliah" value={course} onChange={(event) => { setCourse(event.target.value); setOffset(0); }}><option value="all">Semua mata kuliah</option>{courses.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select><select aria-label="Filter status" value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}><option value="all">Semua status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{scope === 'archived' && <p className="fineprint">Deadline lewat lebih dari 15 hari atau tugas sudah tidak tercantum di kelas. Tidak menerima pengingat.</p>}{scope === 'ignored' && <p className="fineprint">Tanda ini hanya berlaku di NEXUS. Status pengumpulan Moodle tetap seperti aslinya.</p>}{error && <div className="alert error" role="alert">{error}</div>}<p className="result-count">{loading ? 'Memuat tugas…' : total + ' tugas ditemukan'}</p>{items.length ? items.map((item) => <TaskCard key={item.id} item={item} onChange={changed}/>) : !loading && <div className="empty"><CalendarDays size={32}/><h3>Belum ada tugas di daftar ini</h3><p>Hasil pemeriksaan berikutnya akan muncul otomatis.</p></div>}{total > 100 && <div className="pagination"><button className="secondary" disabled={offset === 0} onClick={() => setOffset(offset - 100)}>Sebelumnya</button><span>{offset + 1}–{Math.min(offset + 100, total)} dari {total}</span><button className="secondary" disabled={offset + 100 >= total} onClick={() => setOffset(offset + 100)}>Berikutnya</button></div>}</section>;
}
