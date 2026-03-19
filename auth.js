// =============================================================================
// auth.js — OAuth login, session management, and staff permission helpers
// =============================================================================
//
// SETUP (required before going live):
//   1. Google  → console.cloud.google.com → APIs & Services → Credentials
//               Create an OAuth 2.0 Web Client ID.
//               Add your site's login.html URL as an "Authorised redirect URI".
//   2. Discord → discord.com/developers/applications → OAuth2
//               Copy the Client ID.
//               Add your site's login.html URL as a Redirect URI.
//   3. Replace the placeholder strings below with your real Client IDs.
//
// GRANTING STAFF ACCESS (once a user has logged in at least once):
//   Open browser DevTools console on any page and run:
//     assignRole('discord:123456789012345678', 'staff')
//   Replace the ID with the user's UID shown after they sign in.
//   Valid roles: 'user' (default) | 'staff' | 'admin'
// =============================================================================

const AUTH_CONFIG = {
  google: {
    clientId: 'YOUR_GOOGLE_CLIENT_ID',
    scope: 'openid email profile',
  },
  discord: {
    clientId: 'YOUR_DISCORD_CLIENT_ID',
    scope: 'identify email',
  },
  get redirectUri() {
    const base = location.href.replace(/[^/]*(\?.*|#.*)?$/, '');
    return `${base}login.html`;
  },
};

// ── Storage keys ─────────────────────────────────────────────────────────────
const SESSION_KEY    = 'islesOfDawnSession';
const ROLES_KEY      = 'islesOfDawnRoles';
const OAUTH_SK       = 'islesOfDawnOAuthState';
const LOGIN_NEXT_SK  = 'islesOfDawnLoginNext';

// ── Session ──────────────────────────────────────────────────────────────────
const getSession = () => {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
};
const setSession = (user) => sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
const clearSession = () => sessionStorage.removeItem(SESSION_KEY);

// ── Roles ────────────────────────────────────────────────────────────────────
const getRolesMap = () => {
  try { return JSON.parse(localStorage.getItem(ROLES_KEY)) || {}; } catch { return {}; }
};
const getUserRole = (uid) => getRolesMap()[uid] || 'user';

window.assignRole = (uid, role) => {
  const roles = getRolesMap();
  roles[uid] = role;
  localStorage.setItem(ROLES_KEY, JSON.stringify(roles));
  console.log(`✅ Role "${role}" assigned to "${uid}". Refresh the page to apply.`);
};

// ── HTML escaping (prevents XSS in user-supplied OAuth data) ─────────────────
const escHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
};

// ── PKCE helpers (used for Google authorization code flow) ───────────────────
const randomBase64Url = (bytes = 32) => {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

const sha256Base64Url = async (plain) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

// ── OAuth login redirects ─────────────────────────────────────────────────────
const loginWithGoogle = async () => {
  if (AUTH_CONFIG.google.clientId === 'YOUR_GOOGLE_CLIENT_ID') {
    showLoginError('Google sign-in is not configured yet. Add your Client ID to auth.js.');
    return;
  }
  const state     = randomBase64Url(16);
  const verifier  = randomBase64Url(48);
  const challenge = await sha256Base64Url(verifier);
  sessionStorage.setItem(OAUTH_SK, JSON.stringify({ state, verifier, provider: 'google' }));
  const params = new URLSearchParams({
    client_id:             AUTH_CONFIG.google.clientId,
    redirect_uri:          AUTH_CONFIG.redirectUri,
    response_type:         'code',
    scope:                 AUTH_CONFIG.google.scope,
    state,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  });
  location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
};

const loginWithDiscord = () => {
  if (AUTH_CONFIG.discord.clientId === 'YOUR_DISCORD_CLIENT_ID') {
    showLoginError('Discord sign-in is not configured yet. Add your Client ID to auth.js.');
    return;
  }
  const state = randomBase64Url(16);
  sessionStorage.setItem(OAUTH_SK, JSON.stringify({ state, provider: 'discord' }));
  const params = new URLSearchParams({
    client_id:     AUTH_CONFIG.discord.clientId,
    redirect_uri:  AUTH_CONFIG.redirectUri,
    response_type: 'token',
    scope:         AUTH_CONFIG.discord.scope,
    state,
  });
  location.href = `https://discord.com/api/oauth2/authorize?${params}`;
};

// ── Logout ───────────────────────────────────────────────────────────────────
const logout = () => {
  clearSession();
  if (location.pathname.includes('staff')) {
    location.replace('index.html');
  } else {
    renderNavAuth();
  }
};

// ── OAuth callback handler (runs on login.html after provider redirects back) ─
const handleOAuthCallback = async () => {
  const hashParams = Object.fromEntries(
    location.hash.slice(1).split('&').filter(Boolean)
      .map((p) => p.split('=').map(decodeURIComponent))
  );
  const queryParams = Object.fromEntries(new URLSearchParams(location.search));

  // Provider returned an error
  if (queryParams.error || hashParams.error) {
    const msg = queryParams.error_description || hashParams.error_description
      || queryParams.error || hashParams.error;
    showLoginError(`Sign-in was cancelled or denied: ${msg}`);
    showLoginOptions();
    return;
  }

  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem(OAUTH_SK)); } catch { /* */ }
  sessionStorage.removeItem(OAUTH_SK);

  // ── Discord (access token in URL hash) ────────────────────────────────────
  if (hashParams.access_token && stored?.provider === 'discord') {
    if (hashParams.state !== stored.state) {
      showLoginError('Authentication failed: state mismatch. Please try again.');
      showLoginOptions();
      return;
    }
    try {
      const res = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${hashParams.access_token}` },
      });
      if (!res.ok) throw new Error('Discord API error');
      const data = await res.json();
      setSession({
        uid:      `discord:${data.id}`,
        name:     data.global_name || data.username,
        email:    data.email || null,
        avatar:   data.avatar
          ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
          : null,
        provider: 'discord',
      });
      history.replaceState({}, '', 'login.html');
      finishLogin();
    } catch {
      showLoginError('Could not fetch Discord account info. Please try again.');
      showLoginOptions();
    }
    return;
  }

  // ── Google (authorization code + PKCE) ────────────────────────────────────
  if (queryParams.code && stored?.provider === 'google') {
    if (queryParams.state !== stored.state) {
      showLoginError('Authentication failed: state mismatch. Please try again.');
      showLoginOptions();
      return;
    }
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code:          queryParams.code,
          client_id:     AUTH_CONFIG.google.clientId,
          redirect_uri:  AUTH_CONFIG.redirectUri,
          grant_type:    'authorization_code',
          code_verifier: stored.verifier,
        }),
      });
      if (!tokenRes.ok) throw new Error('Token exchange failed');
      const tokens  = await tokenRes.json();
      const infoRes = await fetch(
        `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${tokens.access_token}`
      );
      if (!infoRes.ok) throw new Error('Could not load Google profile');
      const data = await infoRes.json();
      setSession({
        uid:      `google:${data.id}`,
        name:     data.name,
        email:    data.email,
        avatar:   data.picture || null,
        provider: 'google',
      });
      history.replaceState({}, '', 'login.html');
      finishLogin();
    } catch {
      showLoginError('Could not complete Google sign-in. Please try again.');
      showLoginOptions();
    }
    return;
  }

  // No recognisable callback — show login buttons normally
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
// Call requireStaff() in an inline script on any restricted page.
// Returns true if access is granted; redirects and returns false otherwise.
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

// ── Nav auth widget ────────────────────────────────────────────────────────────
const renderNavAuth = () => {
  const slot = document.getElementById('navAuth');
  if (!slot) return;
  const user = getSession();
  if (!user) {
    slot.innerHTML = `<a class="btn btn-nav-login" href="login.html">Login</a>`;
    return;
  }
  const initial   = escHtml((user.name || user.email || '?')[0].toUpperCase());
  const role      = getUserRole(user.uid);
  const staffLink = (role === 'staff' || role === 'admin')
    ? `<a class="nav-auth-staff" href="staff.html">Staff Portal</a>`
    : '';
  slot.innerHTML = `
    <div class="nav-auth-user">
      ${staffLink}
      <span class="nav-auth-avatar">${initial}</span>
      <span class="nav-auth-name">${escHtml(user.name || user.email)}</span>
      <button class="btn btn-nav-logout" id="navLogoutBtn" type="button">Log out</button>
    </div>`;
  document.getElementById('navLogoutBtn')?.addEventListener('click', logout);
};

// ── Dev helpers (REMOVE BEFORE GOING LIVE) ───────────────────────────────────
// Opens the Staff Portal without needing OAuth configured.
// Usage in browser DevTools console:
//   devLogin()   — creates a local admin session
//   devLogout()  — clears it
window.devLogin = () => {
  const uid = 'dev:local';
  setSession({ uid, name: 'Dev Admin', email: 'dev@local', avatar: null, provider: 'dev' });
  const roles = getRolesMap();
  roles[uid] = 'admin';
  localStorage.setItem(ROLES_KEY, JSON.stringify(roles));
  console.log('✅ Dev admin session started. Redirecting to Staff Portal…');
  location.replace('staff.html');
};

window.devLogout = () => {
  clearSession();
  console.log('✅ Dev session cleared.');
  location.replace('index.html');
};

// ── Init ──────────────────────────────────────────────────────────────────────
renderNavAuth();
