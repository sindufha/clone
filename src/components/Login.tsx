import { useState, type FormEvent } from 'react';
import { ArrowRight, GraduationCap, ShieldCheck, Clock3, Bell } from 'lucide-react';
import type { User } from '../../shared/types';
import { login } from '../api';
export function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await login(username, password); setPassword(''); onLogin(result.user); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <div className="login-page" role="main"><div className="login-layout"><section className="login-story"><div className="brand"><span className="brand-mark"><GraduationCap size={26}/></span>NEXUS</div><div><p className="eyebrow">RUANG SEMESTER KAMU</p><h1>Deadline rapi.<br/> Pikiran lebih<br/> <em>lega.</em></h1><p>Sembilan mata kuliah, semua tugas, dan pengingat yang datang tepat saat kamu membutuhkannya.</p><div className="story-features"><span><Clock3 size={18}/>Polling setiap 15 menit</span><span><Bell size={18}/>Pengingat langsung di Android</span></div></div><small>Dirancang untuk semester yang lebih teratur.</small></section><section className="login-form"><p className="eyebrow">SELAMAT DATANG KEMBALI</p><h2>Masuk ke ruangmu.</h2><p>Gunakan akun aplikasi pribadi yang dibuat saat pemasangan server.</p><form onSubmit={(event) => void submit(event)}><label>Username aplikasi<input autoComplete="username" required maxLength={64} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username kamu"/></label><label>Password aplikasi<input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan password"/></label>{error && <div className="alert error" role="alert">{error}</div>}<button className="primary" disabled={busy}>{busy ? 'Sedang masuk…' : 'Masuk ke NEXUS'}<ArrowRight size={18}/></button></form><div className="privacy-note"><ShieldCheck size={20}/><p>Koneksi Moodle diatur setelah masuk. Password Moodle disimpan terenkripsi di server.</p></div></section></div></div>;
}
