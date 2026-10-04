self.addEventListener('push', (event) => {
  let data;
  try { data = event.data?.json(); } catch { data = null; }
  if (!data || typeof data.title !== 'string') return;
  if (typeof data.timestamp === 'number' && Date.now() - data.timestamp > 60 * 60 * 1000) return;
  event.waitUntil(self.registration.showNotification(data.title.slice(0, 120), {
    body: String(data.body || '').slice(0, 800), icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    tag: data.tag === 'nexus-test' ? 'nexus-test' : 'nexus-deadlines', renotify: true,
    data: { url: '/?tab=' + (data.tag === 'nexus-test' ? 'pengaturan' : 'tugas') },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/?tab=tugas', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    for (const window of windows) { if (new URL(window.url).origin === target.origin) { await window.navigate(target.href); return window.focus(); } }
    return self.clients.openWindow(target.href);
  }));
});
