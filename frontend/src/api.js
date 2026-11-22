export default async function api(path, { method = 'GET', body } = {}) {
  const t = localStorage.getItem('token');
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: body && JSON.stringify(body) });
  if (r.status === 401 && path !== '/login' && localStorage.getItem('token')) { localStorage.clear(); location.href = '/login'; }
  const d = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
}
