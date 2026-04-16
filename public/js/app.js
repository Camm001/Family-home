/* ── Global state ─────────────────────────────────────────────────────────── */
const App = {
  token: localStorage.getItem('fh_token'),
  user: null,
  ws: null,
  wsReady: false,
  currentPage: null,

  // ── API helper ─────────────────────────────────────────────────────────── //
  async api(path, opts = {}) {
    const isFormData = opts.body instanceof FormData;
    const headers = {};
    if (!isFormData) headers['Content-Type'] = 'application/json';
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch('/api' + path, {
      headers,
      ...opts,
      body: isFormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  },

  async apiForm(path, formData, method = 'POST') {
    const headers = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch('/api' + path, { method, headers, body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  },

  // ── Toast ──────────────────────────────────────────────────────────────── //
  toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast${type ? ' ' + type : ''}`;
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), 3500);
  },

  // ── Modal ──────────────────────────────────────────────────────────────── //
  openModal(html, onOpen) {
    const box = document.getElementById('modal-box');
    box.innerHTML = html;
    document.getElementById('modal').classList.remove('hidden');
    box.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => App.closeModal()));
    document.getElementById('modal').addEventListener('click', e => { if (e.target === e.currentTarget) App.closeModal(); }, { once: true });
    if (onOpen) onOpen(box);
  },

  closeModal() {
    document.getElementById('modal').classList.add('hidden');
  },

  // ── WebSocket ──────────────────────────────────────────────────────────── //
  connectWS() {
    if (!this.token) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${this.token}`);
    this.ws = ws;

    ws.onopen = () => {
      this.wsReady = true;
      document.getElementById('ws-status').classList.remove('offline');
    };
    ws.onclose = () => {
      this.wsReady = false;
      document.getElementById('ws-status').classList.add('offline');
      setTimeout(() => this.connectWS(), 3000);
    };
    ws.onmessage = (e) => {
      try {
        const { type, data } = JSON.parse(e.data);
        document.dispatchEvent(new CustomEvent('ws:' + type, { detail: data }));
      } catch {}
    };
  },

  // ── Auth ───────────────────────────────────────────────────────────────── //
  async loadUser() {
    try {
      this.user = await this.api('/auth/me');
    } catch {
      this.logout();
      return false;
    }
    return true;
  },

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('fh_token');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    if (this.ws) { this.ws.close(); this.ws = null; }
  },

  // ── Navigation ─────────────────────────────────────────────────────────── //
  navigate(page) {
    if (this.currentPage === page) return;
    this.currentPage = page;

    // Update nav highlight
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    document.getElementById('page-title').textContent = PAGE_TITLES[page] || page;

    // Close sidebar on mobile
    document.getElementById('sidebar').classList.remove('open');

    // Render page
    const renderer = PAGE_RENDERERS[page];
    if (renderer) renderer();
    else document.getElementById('content').innerHTML = `<div class="empty-state"><p>Page not found</p></div>`;
  },

  async start() {
    if (!this.token) {
      this.showAuth();
      return;
    }
    const ok = await this.loadUser();
    if (!ok) return;
    this.showApp();
  }
};

/* ── Page registry ────────────────────────────────────────────────────────── */
const PAGE_TITLES = {
  dashboard: 'Dashboard', calendar: 'Calendar', shopping: 'Shopping Lists',
  chores: 'Chores', meals: 'Meal Planner', recipes: 'Recipes',
  photos: 'Photos', board: 'Message Board', documents: 'Documents',
  expenses: 'Expenses', watchlist: 'Watchlist', reminders: 'Reminders',
  pantry: 'Pantry', links: 'Links'
};

const PAGE_RENDERERS = {}; // filled by each module

/* ── Auth UI ──────────────────────────────────────────────────────────────── */
function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}
App.showAuth = showAuth;

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Set user info in sidebar
  const av = document.getElementById('user-avatar');
  av.textContent = App.user.name[0].toUpperCase();
  av.style.background = App.user.color || '#6366f1';
  document.getElementById('user-name-sidebar').textContent = App.user.name;

  App.connectWS();
  App.setupPush();

  // Route from hash
  const page = location.hash.replace('#', '') || 'dashboard';
  App.navigate(page);
}
App.showApp = showApp;

/* ── Push subscription ────────────────────────────────────────────────────── */
App.setupPush = async function () {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const { key } = await App.api('/push/vapid-public-key');
    if (!key) return;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    await App.api('/push/subscribe', { method: 'POST', body: { endpoint: sub.endpoint, keys: { p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))), auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))) } } });
  } catch {}
};

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/* ── Auth form wiring ─────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('login-form').classList.toggle('hidden', btn.dataset.tab !== 'login');
      document.getElementById('register-form').classList.toggle('hidden', btn.dataset.tab !== 'register');
    });
  });

  // Login
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { token, user } = await App.api('/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      App.token = token;
      App.user = user;
      localStorage.setItem('fh_token', token);
      App.showApp();
    } catch (err) {
      const el = document.getElementById('login-error');
      el.textContent = err.message;
      el.classList.remove('hidden');
    }
  });

  // Register
  document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { token, user } = await App.api('/auth/register', { method: 'POST', body: { name: fd.get('name'), email: fd.get('email'), password: fd.get('password'), token: fd.get('token') || undefined } });
      App.token = token;
      App.user = user;
      localStorage.setItem('fh_token', token);
      App.showApp();
    } catch (err) {
      const el = document.getElementById('register-error');
      el.textContent = err.message;
      el.classList.remove('hidden');
    }
  });

  // Sidebar toggle
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  document.getElementById('sidebar-close').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
  });

  // Nav links
  document.querySelectorAll('.nav-item').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      App.navigate(a.dataset.page);
      history.pushState(null, '', '#' + a.dataset.page);
    });
  });

  window.addEventListener('popstate', () => {
    const page = location.hash.replace('#', '') || 'dashboard';
    App.navigate(page);
  });

  // User menu
  document.getElementById('user-menu-btn').addEventListener('click', () => {
    const u = App.user;
    document.getElementById('user-modal').classList.remove('hidden');
    document.querySelector('#profile-form [name="name"]').value = u.name;
    document.querySelector('#profile-form [name="color"]').value = u.color || '#6366f1';
  });
  document.querySelectorAll('#user-modal .modal-close').forEach(b => b.addEventListener('click', () => document.getElementById('user-modal').classList.add('hidden')));
  document.getElementById('user-modal').addEventListener('click', e => { if (e.target === e.currentTarget) document.getElementById('user-modal').classList.add('hidden'); });

  document.getElementById('profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = { name: fd.get('name'), color: fd.get('color') };
    if (fd.get('password')) body.password = fd.get('password');
    try {
      const user = await App.api('/users/me', { method: 'PUT', body });
      App.user = { ...App.user, ...user };
      document.getElementById('user-name-sidebar').textContent = App.user.name;
      const av = document.getElementById('user-avatar');
      av.textContent = App.user.name[0].toUpperCase();
      av.style.background = App.user.color;
      document.getElementById('user-modal').classList.add('hidden');
      App.toast('Profile updated', 'success');
    } catch (err) { App.toast(err.message, 'error'); }
  });

  document.getElementById('logout-btn').addEventListener('click', () => App.logout());

  App.start();
});
