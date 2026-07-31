// Web Push feliratkozás a Fiókom oldalon.
(function () {
  const btn = document.getElementById('pushBtn');
  if (!btn) return;
  const vapid = btn.dataset.vapid;
  const meta = document.querySelector('meta[name="csrf-token"]');
  const csrf = meta ? meta.content : '';

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !vapid) {
    btn.disabled = true;
    btn.textContent = 'Nem támogatott';
    return;
  }

  function urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        alert('Az értesítés engedélyezése megtagadva a böngészőben.');
        btn.disabled = false;
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapid),
      });
      const res = await fetch('/fiok/push/feliratkozas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify(sub),
      });
      if (res.ok) {
        btn.textContent = '✅ Bekapcsolva ezen az eszközön';
      } else {
        alert('Hiba történt a feliratkozáskor.');
        btn.disabled = false;
      }
    } catch (err) {
      alert('Hiba: ' + err.message);
      btn.disabled = false;
    }
  });
})();
