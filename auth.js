// =============================================================================
// auth.js — Supabase OAuth login, session management, and staff helpers
// =============================================================================
//
// REQUIRED SETUP:
//   1) Create a Supabase project (https://supabase.com)
//   2) Auth -> Providers: enable Google + Discord
//   3) Auth -> URL Configuration:
//      - Site URL: your website base URL
//      - Redirect URL: https://your-domain/login.html
//   4) Replace SUPABASE_URL and SUPABASE_ANON_KEY below
//
// NOTE:
//   UI role caching still uses localStorage, but role source-of-truth can be
//   Supabase table: public.user_roles (recommended for secure RLS).
// =============================================================================

const SUPABASE_CONFIG = {
  url: 'https://kigfliiiyeunzexapcgk.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpZ2ZsaWlpeWV1bnpleGFwY2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NTQyMjQsImV4cCI6MjA4OTUzMDIyNH0.sjf4DAdpINtk4SaksxaXk0IJmF1JNbgc5lLMNs5kARs',
  get redirectTo() {
    const base = location.href.replace(/[^/]*(\?.*|#.*)?$/, '');
    return `${base}login.html`;
  },
};

// ── Storage keys ─────────────────────────────────────────────────────────────
const SESSION_KEY = 'islesOfDawnSession';
const ROLES_KEY = 'islesOfDawnRoles';
const LOGIN_NEXT_SK = 'islesOfDawnLoginNext';
const USER_ROLES_TABLE = 'user_roles';

// ── Session ──────────────────────────────────────────────────────────────────
const getSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
};

const setSession = (user) => sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
const clearSession = () => sessionStorage.removeItem(SESSION_KEY);

// ── Roles ────────────────────────────────────────────────────────────────────
const getRolesMap = () => {
  try {
    return JSON.parse(localStorage.getItem(ROLES_KEY)) || {};
  } catch {
    return {};
  }
};

const getUserRole = (uid) => getRolesMap()[uid] || 'user';

const cacheUserRole = (uid, role) => {
  const roles = getRolesMap();
  roles[uid] = role;
  localStorage.setItem(ROLES_KEY, JSON.stringify(roles));
};

const extractAuthUidFromSessionUid = (uid) => {
  if (!uid || typeof uid !== 'string') return '';
  const index = uid.indexOf(':');
  if (index === -1) return '';
  return uid.slice(index + 1);
};

window.assignRole = async (uid, role) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (!['user', 'staff', 'admin'].includes(normalizedRole)) {
    console.error('❌ Invalid role. Use: user | staff | admin');
    return;
  }

  cacheUserRole(uid, normalizedRole);

  const authUid = extractAuthUidFromSessionUid(uid);
  if (!authUid) {
    console.log(`✅ Role "${normalizedRole}" assigned to "${uid}" locally.`);
    return;
  }

  const client = await getSupabaseClient();
  if (!client) {
    console.log(`✅ Role "${normalizedRole}" assigned to "${uid}" locally. Configure Supabase to persist roles remotely.`);
    return;
  }

  const { error } = await client
    .from(USER_ROLES_TABLE)
    .upsert([{ user_id: authUid, role: normalizedRole }], { onConflict: 'user_id' });

  if (error) {
    console.error(`⚠️ Local role updated, but Supabase role write failed: ${error.message}`);
    return;
  }

  console.log(`✅ Role "${normalizedRole}" assigned to "${uid}" and synced to Supabase.`);
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const escHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
};

const isSupabaseConfigured = () => (
  SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL'
  && SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY'
);

let supabaseClientPromise = null;

const loadSupabaseSdk = () => {
  if (window.supabase?.createClient) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-supabase-sdk="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Supabase SDK failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = true;
    script.defer = true;
    script.dataset.supabaseSdk = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Supabase SDK failed to load'));
    document.head.appendChild(script);
  });
};

const getSupabaseClient = async () => {
  if (!isSupabaseConfigured()) return null;

  if (!supabaseClientPromise) {
    supabaseClientPromise = (async () => {
      await loadSupabaseSdk();
      const { createClient } = window.supabase;
      return createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      });
    })();
  }

  return supabaseClientPromise;
};

window.isSupabaseConfigured = isSupabaseConfigured;
window.getSupabaseClient = getSupabaseClient;

const toAppSession = (supabaseUser) => {
  if (!supabaseUser) return null;

  const provider = String(
    supabaseUser.app_metadata?.provider
    || supabaseUser.identities?.[0]?.provider
    || 'supabase'
  );

  const preferredName =
    supabaseUser.user_metadata?.full_name
    || supabaseUser.user_metadata?.name
    || supabaseUser.user_metadata?.preferred_username
    || supabaseUser.user_metadata?.user_name
    || (supabaseUser.email ? supabaseUser.email.split('@')[0] : null)
    || 'Player';

  return {
    uid: `${provider}:${supabaseUser.id}`,
    name: preferredName,
    email: supabaseUser.email || null,
    avatar:
      supabaseUser.user_metadata?.avatar_url
      || supabaseUser.user_metadata?.picture
      || null,
    provider,
  };
};

const syncSessionFromSupabase = async () => {
  const client = await getSupabaseClient();
  if (!client) return getSession();

  const { data, error } = await client.auth.getSession();
  if (error) {
    console.error('Supabase session read failed:', error.message);
    return getSession();
  }

  const user = data?.session?.user ? toAppSession(data.session.user) : null;
  if (user) {
    setSession(user);
  } else {
    clearSession();
  }
  return user;
};

const syncCurrentUserRoleFromSupabase = async () => {
  const client = await getSupabaseClient();
  const sessionUser = getSession();
  if (!client || !sessionUser) return null;

  const authUid = extractAuthUidFromSessionUid(sessionUser.uid);
  if (!authUid) return null;

  const { data, error } = await client
    .from(USER_ROLES_TABLE)
    .select('role')
    .eq('user_id', authUid)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.warn('Could not sync role from Supabase:', error.message);
    return null;
  }

  const role = data?.role && ['user', 'staff', 'admin'].includes(data.role) ? data.role : 'user';
  cacheUserRole(sessionUser.uid, role);
  return role;
};

window.syncCurrentUserRoleFromSupabase = syncCurrentUserRoleFromSupabase;
window.getCurrentAuthUid = () => {
  const user = getSession();
  return user ? extractAuthUidFromSessionUid(user.uid) : '';
};

// ── OAuth login redirects (Supabase) ─────────────────────────────────────────
const loginWithGoogle = async () => {
  const client = await getSupabaseClient();
  if (!client) {
    showLoginError('Supabase is not configured yet. Add URL and anon key in auth.js.');
    return;
  }

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: SUPABASE_CONFIG.redirectTo },
  });

  if (error) {
    showLoginError(`Google sign-in failed: ${error.message}`);
  }
};

const loginWithDiscord = async () => {
  const client = await getSupabaseClient();
  if (!client) {
    showLoginError('Supabase is not configured yet. Add URL and anon key in auth.js.');
    return;
  }

  const { error } = await client.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: SUPABASE_CONFIG.redirectTo },
  });

  if (error) {
    showLoginError(`Discord sign-in failed: ${error.message}`);
  }
};

// ── Logout ───────────────────────────────────────────────────────────────────
const logout = async () => {
  const client = await getSupabaseClient();
  if (client) {
    const { error } = await client.auth.signOut();
    if (error) {
      console.error('Supabase logout error:', error.message);
    }
  }

  clearSession();

  if (location.pathname.includes('staff')) {
    location.replace('index.html');
  } else {
    renderNavAuth();
  }
};

// ── OAuth callback handler (runs on login.html after provider redirects back) ─
const handleOAuthCallback = async () => {
  const queryParams = Object.fromEntries(new URLSearchParams(location.search));

  if (queryParams.error || queryParams.error_description) {
    const msg = queryParams.error_description || queryParams.error;
    showLoginError(`Sign-in was cancelled or denied: ${msg}`);
    showLoginOptions();
    return;
  }

  const client = await getSupabaseClient();
  if (!client) {
    showLoginError('Supabase is not configured yet. Add URL and anon key in auth.js.');
    showLoginOptions();
    return;
  }

  const user = await syncSessionFromSupabase();

  if (user) {
    await syncCurrentUserRoleFromSupabase();
    history.replaceState({}, '', 'login.html');
    finishLogin();
    return;
  }

  showLoginError('Could not complete sign-in. Please try again.');
  showLoginOptions();
};

const finishLogin = () => {
  const next = sessionStorage.getItem(LOGIN_NEXT_SK) || 'index.html';
  sessionStorage.removeItem(LOGIN_NEXT_SK);
  location.replace(next);
};

// ── Login page helpers ────────────────────────────────────────────────────────
const showLoginError = (msg) => {
  const el = document.getElementById('loginError');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('is-hidden');
};

const showLoginOptions = () => {
  document.getElementById('loginLoader')?.classList.add('is-hidden');
  document.getElementById('loginOptions')?.classList.remove('is-hidden');
};

// ── Staff guard ───────────────────────────────────────────────────────────────
const requireStaff = () => {
  const user = getSession();
  if (!user) {
    sessionStorage.setItem(LOGIN_NEXT_SK, location.href);
    location.replace('login.html');
    return false;
  }

  const role = getUserRole(user.uid);
  if (role !== 'staff' && role !== 'admin') {
    location.replace('index.html');
    return false;
  }

  return true;
};

const requireStaffAccess = async () => {
  const current = await syncSessionFromSupabase();
  if (!current) {
    sessionStorage.setItem(LOGIN_NEXT_SK, location.href);
    location.replace('login.html');
    return false;
  }

  await syncCurrentUserRoleFromSupabase();
  const role = getUserRole(current.uid);
  if (role !== 'staff' && role !== 'admin') {
    location.replace('index.html');
    return false;
  }

  return true;
};

window.requireStaffAccess = requireStaffAccess;

// ── Nav auth widget ────────────────────────────────────────────────────────────
const renderNavAuth = () => {
  const slot = document.getElementById('navAuth');
  if (!slot) return;

  const user = getSession();
  if (!user) {
    slot.innerHTML = '<a class="btn btn-nav-login" href="login.html">Login</a>';
    return;
  }

  const initial = escHtml((user.name || user.email || '?')[0].toUpperCase());
  const role = getUserRole(user.uid);
  const staffLink = (role === 'staff' || role === 'admin')
    ? '<a class="nav-auth-staff" href="staff.html">Staff Portal</a>'
    : '';

  slot.innerHTML = `
    <div class="nav-auth-user">
      ${staffLink}
      <span class="nav-auth-avatar">${initial}</span>
      <span class="nav-auth-name">${escHtml(user.name || user.email)}</span>
      <button class="btn btn-nav-logout" id="navLogoutBtn" type="button">Log out</button>
    </div>`;

  document.getElementById('navLogoutBtn')?.addEventListener('click', () => {
    logout();
  });
};

// ── Dev helpers ───────────────────────────────────────────────────────────────
window.devLogin = () => {
  const uid = 'dev:local';
  setSession({ uid, name: 'Dev Admin', email: 'dev@local', avatar: null, provider: 'dev' });
  const roles = getRolesMap();
  roles[uid] = 'admin';
  localStorage.setItem(ROLES_KEY, JSON.stringify(roles));
  console.log('✅ Dev admin session started. Redirecting to Staff Portal…');
  location.replace('staff.html');
};

window.devLogout = async () => {
  await logout();
  console.log('✅ Dev session cleared.');
  location.replace('index.html');
};

// ── Init ──────────────────────────────────────────────────────────────────────
(() => {
  renderNavAuth();

  // Refresh local session from Supabase if configured, then refresh nav UI.
  syncSessionFromSupabase()
    .then(() => syncCurrentUserRoleFromSupabase())
    .then(() => renderNavAuth())
    .catch(() => {
      // Keep existing local session behavior if sync fails.
    });
})();
