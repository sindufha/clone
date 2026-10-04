import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { request } from '../api';
interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
export function usePwa() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches);
  const [hint, setHint] = useState('');
  useEffect(() => {
    const before = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', before); window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', before); window.removeEventListener('appinstalled', done); };
  }, []);
  const registration = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
    const current = await navigator.serviceWorker.getRegistration('/');
    if (!current) return null;
    if (current.active) return current;
    return Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))]);
  }, []);
  const subscription = useCallback(async () => {
    const worker = await registration();
    return worker && 'PushManager' in window ? worker.pushManager.getSubscription() : null;
  }, [registration]);
  async function install() {
    if (!prompt) { setHint(import.meta.env.DEV ? 'Tombol instal tersedia pada hasil build PWA melalui HTTPS.' : 'Buka di Chrome Android, lalu pilih menu ⋮ → Instal aplikasi atau Tambahkan ke layar utama. Jika sudah terpasang, buka ikon NEXUS.'); return; }
    await prompt.prompt(); await prompt.userChoice; setPrompt(null);
  }
  async function enable(publicKey: string) {
    const worker = await registration();
    if (!worker || !('PushManager' in window) || !('Notification' in window)) throw new Error('Web Push memerlukan build PWA pada HTTPS dan browser yang mendukung.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Izin notifikasi belum diberikan. Ubah izin situs di pengaturan Chrome.');
    const value = publicKey.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(value + '='.repeat((4 - value.length % 4) % 4)), (char) => char.charCodeAt(0));
    const existing = await worker.pushManager.getSubscription();
    const result = existing || await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    await request('/push/subscriptions', { method: 'POST', body: JSON.stringify(result.toJSON()) }); return result;
  }
  async function disable() {
    const current = await subscription();
    if (current) { await request('/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: current.endpoint }) }); await current.unsubscribe(); }
  }
  return { installed, hint, install, subscription, enable, disable };
}
export type PwaController = ReturnType<typeof usePwa>;
export function InstallButton({ pwa }: { pwa: PwaController }) {
  return <div className="install-wrapper"><button className="secondary compact" onClick={() => void pwa.install()} disabled={pwa.installed}><Download size={16}/>{pwa.installed ? 'Terpasang' : 'Instal aplikasi'}</button>{pwa.hint && <div className="install-hint" role="status">{pwa.hint}</div>}</div>;
}
