import { useCallback, useEffect, useState } from 'react';
import { BookOpen, CalendarDays, LayoutDashboard, LogOut, RefreshCw, Settings, ArrowUpRight, GraduationCap } from 'lucide-react';
import type { Assignment, CourseSummary, DashboardStats, SyncStatus, User } from '../shared/types';
import * as api from './api';
import { Login } from './components/Login';
import { Tasks } from './components/Tasks';
import { Preferences } from './components/Preferences';
import { Courses } from './components/Courses';
import { InstallButton, usePwa } from './components/Pwa';
import { dateLabel, TaskCard } from './components/TaskCard';
type Tab = 'ringkasan' | 'tugas' | 'matakuliah' | 'pengaturan';
const navigation = [
  { id: 'ringkasan', label: 'Ringkasan', icon: LayoutDashboard },
  { id: 'tugas', label: 'Tugas', icon: CalendarDays },
  { id: 'matakuliah', label: 'Mata kuliah', icon: BookOpen },
  { id: 'pengaturan', label: 'Pengaturan', icon: Settings },
] as const;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState('');
  const [tab, setTab] = useState<Tab>(() => {
    const value = new URLSearchParams(location.search).get('tab');
    return navigation.some((item) => item.id === value) ? value as Tab : 'ringkasan';
  });
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pwa = usePwa();
  const boot = useCallback(async () => {
    setBooting(true); setBootError('');
    try { const result = await api.validateSession(); setUser(result.user); }
    catch (error) { if (!(error instanceof api.ApiError && error.status === 401)) setBootError((error as Error).message); }
    finally { setBooting(false); }
  }, []);
  useEffect(() => { void boot(); const expired = () => setUser(null); window.addEventListener('session-expired', expired); return () => window.removeEventListener('session-expired', expired); }, [boot]);
  const refresh = useCallback(async () => {
    const result = await Promise.allSettled([api.getSyncStatus(), api.getDashboardStats(), api.getCourses(), api.getAssignments()]);
    if (result[0].status === 'fulfilled') setStatus(result[0].value);
    if (result[1].status === 'fulfilled') setStats(result[1].value);
    if (result[2].status === 'fulfilled') setCourses(result[2].value);
    if (result[3].status === 'fulfilled') setAssignments(result[3].value.assignments);
    const failure = result.find((item) => item.status === 'rejected');
    setError(failure?.status === 'rejected' ? (failure.reason as Error).message : '');
  }, []);
  useEffect(() => {
    if (!user) { setStatus(null); setStats(null); setCourses([]); setAssignments([]); return; }
    const update = () => { if (!document.hidden) void refresh(); };
    update(); const timer = window.setInterval(update, 30_000);
    window.addEventListener('online', update); document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); window.removeEventListener('online', update); document.removeEventListener('visibilitychange', update); };
  }, [user, refresh]);
  function changeTab(value: Tab) { setTab(value); history.replaceState(null, '', '/?tab=' + value); }
  async function synchronize() {
    setBusy(true); setNotice(''); setError('');
    try { const result = await api.syncNow(); setNotice(result.workerAvailable ? 'Pemeriksaan Moodle sedang dijalankan. Hasil akan diperbarui otomatis.' : 'Permintaan disimpan. Worker akan memeriksa pada jadwal berikutnya.'); await refresh(); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  async function signOut() {
    try { const subscription = await pwa.subscription().catch(() => null); await api.logout(subscription?.endpoint); await subscription?.unsubscribe().catch(() => false); setUser(null); setError(''); setNotice(''); }
    catch (error) { setError((error as Error).message); }
  }
  if (booting) return <div className="splash"><GraduationCap size={44}/><p>Membuka NEXUS…</p></div>;
  if (bootError) return <div className="splash"><p role="alert">{bootError}</p><button className="primary" onClick={() => void boot()}>Coba lagi</button></div>;
  if (!user) return <Login onLogin={setUser}/>;
  const upcoming = assignments.filter((item) => ['pending', 'draft', 'overdue'].includes(item.status)).slice(0, 5);
  return <div className="app">
    <aside className="sidebar" aria-label="Menu dan akun">
      <a className="brand" href="/"><span className="brand-mark"><GraduationCap size={25}/></span><span>NEXUS<small>Ruang semester kamu</small></span></a>
      <div className="semester-pill">Semester aktif · 9 mata kuliah</div>
      <nav aria-label="Navigasi utama">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'nav-item active' : 'nav-item'} onClick={() => changeTab(id)} aria-current={tab === id ? 'page' : undefined}><Icon size={20}/><span>{label}</span>{id === 'tugas' && stats ? <b>{stats.pending + stats.overdue}</b> : null}</button>)}</nav>
      <div className="sidebar-note"><span className="live-dot"/>Selalu terhubung<small>Polling setiap 15 menit.<br/>Pengingat 07.00–22.00 WIB.</small></div>
      <div className="profile"><span className="avatar">{user.name[0]?.toUpperCase()}</span><span>{user.name}<small>Akun pribadi</small></span><button className="icon-button" aria-label="Keluar" onClick={() => void signOut()}><LogOut size={18}/></button></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="mobile-brand">NEXUS<span> / </span>{navigation.find((item) => item.id === tab)?.label}</div><span className="desktop-caption">Satu tempat untuk semester yang lebih teratur.</span><div className="top-actions"><InstallButton pwa={pwa}/><button className="icon-button mobile-logout" aria-label="Keluar" onClick={() => void signOut()}><LogOut size={18}/></button><span className="timezone">WIB</span></div></header>
      <main>
        <div className="page-heading"><div><p className="eyebrow">SEMESTER INI</p><h1>{tab === 'ringkasan' ? 'Selamat datang, ' + user.name.split(' ')[0] + '.' : navigation.find((item) => item.id === tab)?.label}</h1><p>{tab === 'ringkasan' ? 'Lihat yang perlu diselesaikan, satu tugas pada satu waktu.' : tab === 'tugas' ? 'Deadline dan status pengumpulan dari Moodle.' : tab === 'matakuliah' ? 'Hanya sembilan mata kuliah dalam jadwalmu.' : 'Hubungkan Moodle dan atur pengingat perangkatmu.'}</p></div><button className="secondary sync-button" disabled={busy || !status?.connected} onClick={() => void synchronize()}><RefreshCw size={16} className={busy ? 'spin' : ''}/>{busy ? 'Meminta…' : 'Sinkronkan'}</button></div>
        {error && <div className="alert error" role="alert">{error} Data yang tampil mungkin belum diperbarui.</div>}
        {notice && <div className="alert" role="status">{notice}</div>}
        <div className="sync-strip"><span className={'live-dot ' + (status?.state === 'connected' ? '' : 'muted')}/><span>{status?.latestRun?.status === 'running' ? 'Sedang memeriksa Moodle…' : status?.connected ? 'Terakhir diperiksa: ' + dateLabel(status.lastSyncAt) : 'Moodle belum terhubung'}</span>{status?.lastError && <strong>{status.lastError}</strong>}{!status?.connected && <button className="text-button" onClick={() => changeTab('pengaturan')}>Hubungkan sekarang <ArrowUpRight size={14}/></button>}</div>
        {tab === 'ringkasan' && <>
          <div className="stat-grid">{[{ label: 'Belum dikumpulkan', value: stats?.pending || 0, caption: 'Termasuk tugas yang masih draf', color: 'green' }, { label: 'Lewat deadline', value: stats?.overdue || 0, caption: 'Diabaikan setelah lewat 15 hari', color: 'orange' }, { label: 'Sudah dikumpulkan', value: stats?.submitted || 0, caption: 'Tidak menerima pengingat', color: 'blue' }, { label: 'Mata kuliah terhubung', value: (stats?.courses || 0) + '/9', caption: 'Sesuai whitelist semester', color: 'purple' }].map((stat) => <article className={'stat-card ' + stat.color} key={stat.label}><p>{stat.label}</p><strong>{stat.value}</strong><small>{stat.caption}</small></article>)}</div>
          <div className="overview-grid"><section><div className="section-heading"><h2>Tugas yang perlu perhatian</h2><button className="text-button" onClick={() => changeTab('tugas')}>Lihat semua <ArrowUpRight size={15}/></button></div>{upcoming.length ? upcoming.map((item) => <TaskCard key={item.id} item={item} onChange={refresh}/>) : <div className="empty"><CalendarDays size={32}/><h3>{status?.connected ? 'Belum ada tugas yang perlu dikerjakan' : 'Mulai dari menghubungkan Moodle'}</h3><p>{status?.connected ? 'Tugas akan muncul setelah pemeriksaan selesai.' : 'Buka Pengaturan untuk memantau sembilan mata kuliahmu.'}</p></div>}</section><aside className="info-panel"><span className="eyebrow">PENGINGAT OTOMATIS</span><h2>Lebih tenang<br/> menjelang deadline.</h2><p>Satu ringkasan tiap jam mulai H-7, pukul 07.00–22.00 WIB. Pengingat berhenti setelah tugas dikumpulkan.</p><div className="info-rule">Tugas kelompok?<small>Tandai “Sudah diwakili kelompok” untuk menghentikan pengingatnya.</small></div><button className="primary" onClick={() => changeTab('pengaturan')}>Atur notifikasi <ArrowUpRight size={16}/></button>{Boolean(stats?.unknown) && <p className="fineprint">{stats?.unknown} tugas memiliki status yang belum terverifikasi.</p>}</aside></div>
        </>}
        {tab === 'tugas' && <Tasks courses={courses} onChange={refresh}/>}
        {tab === 'matakuliah' && <Courses courses={courses}/>}
        {tab === 'pengaturan' && <Preferences status={status} refresh={refresh} pwa={pwa}/>}
        <footer>NEXUS · Data dari Moodle kampus · Zona waktu Asia/Jakarta</footer>
      </main>
      <nav className="bottom-nav" aria-label="Navigasi ponsel">{navigation.map(({ id, label, icon: Icon }) => <button key={id} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'active' : ''} onClick={() => changeTab(id)}><Icon size={20}/><span>{label}</span></button>)}</nav>
    </div>
  </div>;
}
