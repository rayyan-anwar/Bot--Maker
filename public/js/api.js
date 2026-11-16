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


// Shared theme control. Preference is stored locally; system preference is the default.
(function installThemeControl() {
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem('botforge-theme'); } catch (_) {}
  const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const apply = (theme) => {
    root.dataset.theme = theme;
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
      button.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme');
    }
  };
  apply(saved || (systemDark ? 'dark' : 'light'));
  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.querySelector('.topbar');
    if (!bar || document.getElementById('theme-toggle')) return;
    const button = document.createElement('button');
    button.id = 'theme-toggle'; button.type = 'button'; button.className = 'theme-toggle';
    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(next);
      try { localStorage.setItem('botforge-theme', next); } catch (_) {}
    });
    (bar.querySelector('nav') || bar).appendChild(button);
    apply(root.dataset.theme || 'light');
  });
})();
