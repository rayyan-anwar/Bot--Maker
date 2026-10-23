// Small fetch wrapper shared by every page. Talks to our own backend only.
async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    method: options.method || 'GET',
    headers: options.body instanceof FormData ? {} : { 'content-type': 'application/json' },
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin'
  });

  let data = null;
  try { data = await res.json(); } catch (_) {}

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

async function requireLogin() {
  try {
    const { user } = await api('/auth/me');
    return user;
  } catch (_) {
    window.location.href = '/index.html';
    return null;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
