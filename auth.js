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
const USER_PROFILES_TABLE = 'user_profiles';
const ACCESS_DENIED_PAGE = 'access-denied.html';
const VERIFIED_ROLE_KEY = 'islesOfDawnVerifiedRole';
const PROFILE_PAGE = 'profile.html';

const ROLE_ALIASES = Object.freeze({
  user: 'player',
  player: 'player',
  builder: 'builder',
  event_team: 'event_team',
  media: 'media',
  qa_tester: 'qa_tester',
  helper: 'helper',
  moderator: 'moderator',
  developer: 'developer',
  admin: 'admin',
  manager: 'manager',
  owner: 'owner',
  staff: 'developer',
});

const ROLE_LABELS = Object.freeze({
  player: 'Player',
  builder: 'Builder',
  event_team: 'Event Team',
  media: 'Media',
  qa_tester: 'QA Tester',
  helper: 'Helper',
  moderator: 'Moderator',
  developer: 'Developer',
  admin: 'Admin',
  manager: 'Manager',
  owner: 'Owner',
});

const PORTAL_ROLES = new Set(['admin', 'manager', 'owner']);
const STAFF_PORTAL_ROLES = new Set(['builder', 'event_team', 'media', 'qa_tester', 'helper', 'moderator', 'developer', 'admin', 'manager', 'owner']);
const ROLE_MANAGER_ROLES = new Set(['admin', 'manager', 'owner']);

// ── Session ──────────────────────────────────────────────────────────────────
const getSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
};

const setSession = (user) => sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
const clearSession = () => {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(VERIFIED_ROLE_KEY);
};

const setVerifiedCurrentRole = (role) => {
  const normalizedRole = normalizeRoleValue(role) || 'player';
  sessionStorage.setItem(VERIFIED_ROLE_KEY, normalizedRole);
  return normalizedRole;
};

const getVerifiedCurrentRole = () => {
  const role = normalizeRoleValue(sessionStorage.getItem(VERIFIED_ROLE_KEY));
  return role || 'player';
};

// ── Roles ────────────────────────────────────────────────────────────────────
const getRolesMap = () => {
  try {
    return JSON.parse(localStorage.getItem(ROLES_KEY)) || {};
  } catch {
    return {};
  }
};

const getUserRole = (uid) => normalizeRoleValue(getRolesMap()[uid]) || 'player';

const getRoleLabel = (role) => ROLE_LABELS[normalizeRoleValue(role) || 'player'] || 'Player';
const getRolePillClass = (role) => `role-pill role-pill-${normalizeRoleValue(role) || 'player'}`;
const canAccessStaffPortal = (role) => PORTAL_ROLES.has(normalizeRoleValue(role) || 'player');
const canAccessStaffMemberPortal = (role) => STAFF_PORTAL_ROLES.has(normalizeRoleValue(role) || 'player');
const canManageRoles = (role) => ROLE_MANAGER_ROLES.has(normalizeRoleValue(role) || 'player');

const normalizeRoleValue = (role) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  return ROLE_ALIASES[normalizedRole] || '';
};

const normalizeAuthUid = (value) => {
  const input = String(value || '').trim();
  if (!input) return '';
  if (input.includes(':')) {
    return extractAuthUidFromSessionUid(input);
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(input) ? input : '';
};

const validateUsernameValue = (value) => {
  const username = String(value || '').trim();
  if (!username) {
    return { ok: false, message: 'Enter a username.' };
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(username)) {
    return {
      ok: false,
      message: 'Use 3-24 characters. Letters, numbers, dots, hyphens, and underscores are allowed.',
    };
  }

  return { ok: true, username };
};

const slugifyUsernameCandidate = (value) => String(value || '')
  .trim()
  .replace(/[^A-Za-z0-9_.-]+/g, '-')
  .replace(/^[^A-Za-z0-9]+/, '')
  .replace(/[^A-Za-z0-9]+$/, '')
  .slice(0, 24);

const buildUsernameCandidates = (value, fallbackSuffix = '') => {
  const base = slugifyUsernameCandidate(value) || 'player';
  const safeBase = /^[A-Za-z0-9]/.test(base) ? base : `player-${base}`;
  const candidates = [safeBase.slice(0, 24)];
  const normalizedSuffix = String(fallbackSuffix || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  if (normalizedSuffix) {
    candidates.push(`${safeBase.slice(0, 19)}-${normalizedSuffix.slice(0, 4)}`);
    candidates.push(`${safeBase.slice(0, 15)}-${normalizedSuffix.slice(0, 8)}`);
  }

  return [...new Set(candidates)]
    .map((candidate) => candidate.slice(0, 24))
    .filter((candidate) => validateUsernameValue(candidate).ok);
};

const cacheUserRole = (uid, role) => {
  const roles = getRolesMap();
  roles[uid] = normalizeRoleValue(role) || 'player';
  localStorage.setItem(ROLES_KEY, JSON.stringify(roles));
};

const extractAuthUidFromSessionUid = (uid) => {
  if (!uid || typeof uid !== 'string') return '';
  const index = uid.indexOf(':');
  if (index === -1) return '';
  return uid.slice(index + 1);
};

window.assignRole = async (uid, role) => {
  const normalizedRole = normalizeRoleValue(role);
  if (!normalizedRole) {
    console.error('❌ Invalid role. Use: player | helper | moderator | developer | admin | manager | owner');
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

const listUserRoles = async () => {
  const client = await getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'Supabase is not configured yet. Add URL and anon key in auth.js.', rows: [] };
  }

  const { data, error } = await client
    .from(USER_ROLES_TABLE)
    .select('user_id, role, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    return { ok: false, message: error.message, rows: [] };
  }

  const profileLookup = await listVisibleUserProfiles();
  const usernamesById = new Map((profileLookup.rows || []).map((row) => [row.user_id, row.username]));
  const rows = Array.isArray(data)
    ? data.map((row) => ({
        ...row,
        username: usernamesById.get(row.user_id) || '',
      }))
    : [];

  return { ok: true, rows };
};

const upsertUserRoleByAuthUid = async (userIdOrSessionUidOrUsername, role) => {
  const normalizedRole = normalizeRoleValue(role);
  if (!normalizedRole) {
    return { ok: false, message: 'Invalid role. Use player, helper, moderator, developer, admin, manager, or owner.' };
  }

  const resolvedIdentity = await resolveUserIdentifierToAuthUid(userIdOrSessionUidOrUsername);
  if (!resolvedIdentity.ok) {
    return { ok: false, message: resolvedIdentity.message || 'Enter a valid auth UUID, session UID, or username.' };
  }

  const authUid = resolvedIdentity.authUid;

  const client = await getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'Supabase is not configured yet. Add URL and anon key in auth.js.' };
  }

  const payload = {
    user_id: authUid,
    role: normalizedRole,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from(USER_ROLES_TABLE)
    .upsert([payload], { onConflict: 'user_id' })
    .select('user_id, role, updated_at')
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  const currentUser = getSession();
  const currentAuthUid = currentUser ? extractAuthUidFromSessionUid(currentUser.uid) : '';
  if (currentUser && currentAuthUid === authUid) {
    cacheUserRole(currentUser.uid, normalizedRole);
    setVerifiedCurrentRole(normalizedRole);
    renderNavAuth();
  }

  return {
    ok: true,
    row: {
      ...(data || payload),
      username: resolvedIdentity.username || '',
    },
    message: `Role updated to ${normalizedRole}.`,
  };
};

window.listUserRoles = listUserRoles;
window.upsertUserRoleByAuthUid = upsertUserRoleByAuthUid;
window.resolveUserIdentifierToAuthUid = resolveUserIdentifierToAuthUid;
window.getSession = getSession;
window.getUserRole = getUserRole;
window.normalizeAuthUid = normalizeAuthUid;
window.validateUsernameValue = validateUsernameValue;
window.getRoleLabel = getRoleLabel;
window.getRolePillClass = getRolePillClass;
window.canAccessStaffPortal = canAccessStaffPortal;
window.canAccessStaffMemberPortal = canAccessStaffMemberPortal;
window.canManageRoles = canManageRoles;

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

  try {
    return await supabaseClientPromise;
  } catch (error) {
    console.error('Supabase client initialization failed:', error instanceof Error ? error.message : error);
    supabaseClientPromise = null;
    return null;
  }
};

window.isSupabaseConfigured = isSupabaseConfigured;
window.getSupabaseClient = getSupabaseClient;

const profileErrorMessage = (error, fallbackMessage) => {
  if (!error) return fallbackMessage;
  if (error.code === '23505') {
    return 'That username is already taken. Choose another one.';
  }

  return error.message || fallbackMessage;
};

const fetchUserProfileByAuthUid = async (authUid) => {
  const client = await getSupabaseClient();
  if (!client || !authUid) {
    return { ok: false, message: 'Profile lookup unavailable.', profile: null };
  }

  const { data, error } = await client
    .from(USER_PROFILES_TABLE)
    .select('user_id, username, avatar_url, updated_at, created_at')
    .eq('user_id', authUid)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    return { ok: false, message: error.message, profile: null };
  }

  return { ok: true, profile: data || null };
};

const listVisibleUserProfiles = async () => {
  const client = await getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'Profile lookup unavailable.', rows: [] };
  }

  const { data, error } = await client
    .from(USER_PROFILES_TABLE)
    .select('user_id, username, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    return { ok: false, message: error.message, rows: [] };
  }

  return { ok: true, rows: Array.isArray(data) ? data : [] };
};

const resolveUserIdentifierToAuthUid = async (value) => {
  const authUid = normalizeAuthUid(value);
  if (authUid) {
    const profileLookup = await fetchUserProfileByAuthUid(authUid);
    return {
      ok: true,
      authUid,
      username: profileLookup.ok ? profileLookup.profile?.username || '' : '',
    };
  }

  const usernameCheck = validateUsernameValue(value);
  if (!usernameCheck.ok) {
    return { ok: false, message: 'Enter a valid auth UUID, session UID, or username.' };
  }

  const client = await getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'Supabase is not configured yet. Add URL and anon key in auth.js.' };
  }

  const { data, error } = await client
    .from(USER_PROFILES_TABLE)
    .select('user_id, username')
    .ilike('username', usernameCheck.username)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    return { ok: false, message: error.message };
  }

  if (!data?.user_id) {
    return { ok: false, message: 'No profile was found for that username.' };
  }

  return { ok: true, authUid: data.user_id, username: data.username || usernameCheck.username };
};

const updateStoredSessionProfile = (username) => {
  const sessionUser = getSession();
  if (!sessionUser) return null;

  const nextSession = {
    ...sessionUser,
    name: username || sessionUser.name,
    username: username || null,
  };
  setSession(nextSession);
  return nextSession;
};

const ensureUserProfileForSupabaseUser = async (supabaseUser) => {
  if (!supabaseUser?.id) {
    return { ok: false, profile: null, message: 'No authenticated user found.' };
  }

  const existingProfile = await fetchUserProfileByAuthUid(supabaseUser.id);
  if (existingProfile.ok && existingProfile.profile) {
    return existingProfile;
  }

  const client = await getSupabaseClient();
  if (!client) {
    return { ok: false, profile: null, message: 'Supabase is not configured yet. Add URL and anon key in auth.js.' };
  }

  const preferredSource =
    supabaseUser.user_metadata?.preferred_username
    || supabaseUser.user_metadata?.username
    || supabaseUser.user_metadata?.name
    || supabaseUser.user_metadata?.full_name
    || (supabaseUser.email ? supabaseUser.email.split('@')[0] : 'player');
  const usernameCandidates = buildUsernameCandidates(preferredSource, supabaseUser.id);

  for (const candidate of usernameCandidates) {
    const { data, error } = await client
      .from(USER_PROFILES_TABLE)
      .upsert([
        {
          user_id: supabaseUser.id,
          username: candidate,
          updated_at: new Date().toISOString(),
        },
      ], { onConflict: 'user_id' })
      .select('user_id, username, updated_at, created_at')
      .single();

    if (!error) {
      return { ok: true, profile: data || null };
    }

    if (error.code !== '23505') {
      return { ok: false, profile: null, message: error.message };
    }
  }

  return { ok: false, profile: null, message: 'Could not create a unique username for this account.' };
};

const getCurrentUserProfile = async () => {
  const authUid = window.getCurrentAuthUid?.() || '';
  if (!authUid) {
    return { ok: false, message: 'You need to sign in first.', profile: null };
  }

  return fetchUserProfileByAuthUid(authUid);
};

const saveCurrentUserProfile = async (username) => {
  const usernameCheck = validateUsernameValue(username);
  if (!usernameCheck.ok) {
    return { ok: false, message: usernameCheck.message };
  }

  const client = await getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'Supabase is not configured yet. Add URL and anon key in auth.js.' };
  }

  const authUid = window.getCurrentAuthUid?.() || '';
  if (!authUid) {
    return { ok: false, message: 'You need to sign in first.' };
  }

  const { data, error } = await client
    .from(USER_PROFILES_TABLE)
    .upsert([
      {
        user_id: authUid,
        username: usernameCheck.username,
        updated_at: new Date().toISOString(),
      },
    ], { onConflict: 'user_id' })
    .select('user_id, username, updated_at, created_at')
    .single();

  if (error) {
    return { ok: false, message: profileErrorMessage(error, 'Could not save your username.') };
  }

  const { error: authUpdateError } = await client.auth.updateUser({
    data: {
      preferred_username: usernameCheck.username,
      username: usernameCheck.username,
      name: usernameCheck.username,
      full_name: usernameCheck.username,
    },
  });

  if (authUpdateError) {
    console.warn('Could not update auth metadata for username:', authUpdateError.message);
  }

  updateStoredSessionProfile(data?.username || usernameCheck.username);
  renderNavAuth();

  return {
    ok: true,
    message: 'Profile updated successfully.',
    profile: data || { user_id: authUid, username: usernameCheck.username },
  };
};

const AVATAR_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const AVATARS_BUCKET = 'avatars';

const saveCurrentUserAvatar = async (file) => {
  if (!file) return { ok: false, message: 'No file selected.' };

  if (!AVATAR_ALLOWED_TYPES.has(file.type)) {
    return { ok: false, message: 'Only JPEG, PNG, GIF, or WebP images are allowed.' };
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, message: 'Image must be under 2 MB.' };
  }

  const client = await getSupabaseClient();
  if (!client) return { ok: false, message: 'Supabase is not configured yet. Add URL and anon key in auth.js.' };

  const authUid = window.getCurrentAuthUid?.() || '';
  if (!authUid) return { ok: false, message: 'You need to sign in first.' };

  // Always store at a fixed path so uploads overwrite the previous avatar
  const filePath = `${authUid}/avatar`;

  const { error: uploadError } = await client.storage
    .from(AVATARS_BUCKET)
    .upload(filePath, file, { upsert: true, contentType: file.type });

  if (uploadError) return { ok: false, message: uploadError.message };

  const { data: urlData } = client.storage.from(AVATARS_BUCKET).getPublicUrl(filePath);
  const avatarUrl = urlData?.publicUrl || null;

  if (!avatarUrl) return { ok: false, message: 'Could not get the public URL for your avatar.' };

  const existingProfile = await fetchUserProfileByAuthUid(authUid);
  if (!existingProfile.ok) {
    return { ok: false, message: existingProfile.message || 'Could not verify your profile before saving the avatar.' };
  }

  if (!existingProfile.profile) {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData?.user) {
      return { ok: false, message: authError?.message || 'Could not load your account details to create a profile row.' };
    }

    const createdProfile = await ensureUserProfileForSupabaseUser(authData.user);
    if (!createdProfile.ok || !createdProfile.profile) {
      return { ok: false, message: createdProfile.message || 'Could not create a profile row for this account.' };
    }

    updateStoredSessionProfile(createdProfile.profile.username || getSession()?.name || 'Player');
    renderNavAuth();
  }

  const { error: profileError } = await client
    .from(USER_PROFILES_TABLE)
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('user_id', authUid);

  if (profileError) return { ok: false, message: profileError.message };

  const sessionUser = getSession();
  if (sessionUser) setSession({ ...sessionUser, avatar: avatarUrl });

  return { ok: true, message: 'Avatar updated successfully.', avatarUrl };
};

const removeCurrentUserAvatar = async () => {
  const client = await getSupabaseClient();
  if (!client) return { ok: false, message: 'Supabase is not configured yet. Add URL and anon key in auth.js.' };

  const authUid = window.getCurrentAuthUid?.() || '';
  if (!authUid) return { ok: false, message: 'You need to sign in first.' };

  const filePath = `${authUid}/avatar`;

  // Remove from storage (ignore not-found errors)
  const { error: removeError } = await client.storage.from(AVATARS_BUCKET).remove([filePath]);
  if (removeError && removeError.message !== 'Object not found') {
    return { ok: false, message: removeError.message };
  }

  const { error: profileError } = await client
    .from(USER_PROFILES_TABLE)
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq('user_id', authUid);

  if (profileError) return { ok: false, message: profileError.message };

  const sessionUser = getSession();
  if (sessionUser) setSession({ ...sessionUser, avatar: null });

  return { ok: true, message: 'Avatar removed.' };
};

window.getCurrentUserProfile = getCurrentUserProfile;
window.saveCurrentUserProfile = saveCurrentUserProfile;
window.saveCurrentUserAvatar = saveCurrentUserAvatar;
window.removeCurrentUserAvatar = removeCurrentUserAvatar;

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
    username: supabaseUser.user_metadata?.preferred_username || supabaseUser.user_metadata?.username || null,
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
    const profileResult = await ensureUserProfileForSupabaseUser(data.session.user);
    const nextUser = {
      ...user,
      name: profileResult.ok && profileResult.profile?.username ? profileResult.profile.username : user.name,
      username: profileResult.ok ? profileResult.profile?.username || user.username || null : user.username || null,
      avatar: profileResult.ok ? profileResult.profile?.avatar_url || user.avatar || null : user.avatar || null,
    };
    setSession(nextUser);
    return nextUser;
  } else {
    clearSession();
  }
  return null;
};

const syncCurrentUserRoleFromSupabase = async () => {
  const client = await getSupabaseClient();
  const sessionUser = getSession();
  if (!client || !sessionUser) {
    return setVerifiedCurrentRole('player');
  }

  const authUid = extractAuthUidFromSessionUid(sessionUser.uid);
  if (!authUid) {
    cacheUserRole(sessionUser.uid, 'player');
    return setVerifiedCurrentRole('player');
  }

  const { data, error } = await client
    .from(USER_ROLES_TABLE)
    .select('role')
    .eq('user_id', authUid)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.warn('Could not sync role from Supabase:', error.message);
    cacheUserRole(sessionUser.uid, 'player');
    return setVerifiedCurrentRole('player');
  }

  const role = normalizeRoleValue(data?.role) || 'player';
  cacheUserRole(sessionUser.uid, role);
  return setVerifiedCurrentRole(role);
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

const signInWithEmailPassword = async (email, password) => {
  const client = await getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'Supabase is not configured yet. Add URL and anon key in auth.js.' };
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: error.message };
  }

  const user = data?.user ? toAppSession(data.user) : await syncSessionFromSupabase();
  if (user) {
    setSession(user);
    await syncCurrentUserRoleFromSupabase();
    return { ok: true, requiresEmailConfirmation: false };
  }

  return { ok: false, message: 'Could not complete sign-in. Please try again.' };
};

const createAccountWithEmailPassword = async (email, password, displayName = '') => {
  const usernameCheck = validateUsernameValue(displayName);
  if (!usernameCheck.ok) {
    return { ok: false, message: usernameCheck.message };
  }

  const client = await getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'Supabase is not configured yet. Add URL and anon key in auth.js.' };
  }

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: SUPABASE_CONFIG.redirectTo,
      data: {
        preferred_username: usernameCheck.username,
        username: usernameCheck.username,
        name: usernameCheck.username,
        full_name: usernameCheck.username,
      },
    },
  });

  if (error) {
    return { ok: false, message: profileErrorMessage(error, error.message) };
  }

  if (data?.session?.user) {
    const user = toAppSession(data.session.user);
    if (user) {
      setSession(user);
      const profileResult = await saveCurrentUserProfile(usernameCheck.username);
      if (!profileResult.ok) {
        return profileResult;
      }
      await syncCurrentUserRoleFromSupabase();
      return { ok: true, requiresEmailConfirmation: false };
    }
  }

  return {
    ok: true,
    requiresEmailConfirmation: true,
    message: 'Account created. Check your email for the confirmation link before signing in.',
  };
};

window.signInWithEmailPassword = signInWithEmailPassword;
window.createAccountWithEmailPassword = createAccountWithEmailPassword;

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
  if (!canAccessStaffPortal(role)) {
    location.replace(ACCESS_DENIED_PAGE);
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
  if (!canAccessStaffPortal(role)) {
    location.replace(ACCESS_DENIED_PAGE);
    return false;
  }

  return true;
};

const requireGeneralStaffAccess = async () => {
  const current = await syncSessionFromSupabase();
  if (!current) {
    sessionStorage.setItem(LOGIN_NEXT_SK, location.href);
    location.replace('login.html');
    return false;
  }

  await syncCurrentUserRoleFromSupabase();
  const role = getUserRole(current.uid);
  if (!canAccessStaffMemberPortal(role)) {
    location.replace(ACCESS_DENIED_PAGE);
    return false;
  }

  return true;
};

window.requireStaffAccess = requireStaffAccess;
window.requireGeneralStaffAccess = requireGeneralStaffAccess;
window.syncSessionFromSupabase = syncSessionFromSupabase;

// ── Nav auth widget ────────────────────────────────────────────────────────────
const renderNavAuth = () => {
  const slot = document.getElementById('navAuth');
  if (!slot) return;

  if (window.__navAuthMenuClickHandler) {
    document.removeEventListener('click', window.__navAuthMenuClickHandler);
    window.__navAuthMenuClickHandler = null;
  }

  if (window.__navAuthMenuEscapeHandler) {
    document.removeEventListener('keydown', window.__navAuthMenuEscapeHandler);
    window.__navAuthMenuEscapeHandler = null;
  }

  const user = getSession();
  if (!user) {
    slot.innerHTML = '<a class="btn btn-nav-login" href="login.html">Login</a>';
    return;
  }

  const initial = escHtml((user.name || user.email || '?')[0].toUpperCase());
  const displayName = escHtml(user.name || user.email);
  const avatarMarkup = user.avatar
    ? `<span class="nav-auth-avatar"><img class="nav-auth-avatar-img" src="${escHtml(user.avatar)}" alt="" /></span>`
    : `<span class="nav-auth-avatar">${initial}</span>`;
  const role = getVerifiedCurrentRole();
  const staffPortalLink = canAccessStaffMemberPortal(role)
    ? '<a class="nav-auth-menu-item nav-auth-menu-item-staff" href="staff-portal.html">Staff Portal</a>'
    : '';
  const managementLink = canAccessStaffPortal(role)
    ? '<a class="nav-auth-menu-item nav-auth-menu-item-staff" href="staff.html">Management Portal</a>'
    : '';

  slot.innerHTML = `
    <div class="nav-auth-user">
      <button class="nav-auth-trigger" id="navAuthTrigger" type="button" aria-haspopup="menu" aria-expanded="false">
        ${avatarMarkup}
        <span class="nav-auth-name">${displayName}</span>
        <span class="nav-auth-caret" aria-hidden="true">▾</span>
      </button>
      <div class="nav-auth-menu is-hidden" id="navAuthMenu" role="menu">
        <a class="nav-auth-menu-item" href="${PROFILE_PAGE}" role="menuitem">Profile</a>
        ${staffPortalLink}
        ${managementLink}
        <button class="nav-auth-menu-item nav-auth-menu-logout" id="navLogoutBtn" type="button" role="menuitem">Log out</button>
      </div>
    </div>`;

  const trigger = document.getElementById('navAuthTrigger');
  const menu = document.getElementById('navAuthMenu');
  const closeMenu = () => {
    if (!menu || !trigger) return;
    menu.classList.add('is-hidden');
    trigger.setAttribute('aria-expanded', 'false');
  };

  const toggleMenu = () => {
    if (!menu || !trigger) return;
    const isOpen = !menu.classList.contains('is-hidden');
    if (isOpen) {
      closeMenu();
      return;
    }

    menu.classList.remove('is-hidden');
    trigger.setAttribute('aria-expanded', 'true');
  };

  trigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMenu();
  });

  menu?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  window.__navAuthMenuClickHandler = (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!slot.contains(target)) {
      closeMenu();
    }
  };

  window.__navAuthMenuEscapeHandler = (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  };

  document.addEventListener('click', window.__navAuthMenuClickHandler);
  document.addEventListener('keydown', window.__navAuthMenuEscapeHandler);

  document.getElementById('navLogoutBtn')?.addEventListener('click', () => {
    closeMenu();
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
  console.log('✅ Dev admin session started. Redirecting to Management Portal…');
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

  if (!isSupabaseConfigured()) {
    return;
  }

  const currentFile = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const pagesRequiringFreshAuth = new Set([
    'login.html',
    'profile.html',
    'staff.html',
    'staff-portal.html',
    'staff-announcements.html',
    'staff-applications.html',
    'staff-appeals.html',
    'apply.html',
  ]);

  const localSession = getSession();
  const shouldForceSyncNow = pagesRequiringFreshAuth.has(currentFile);

  if (!localSession && !shouldForceSyncNow) {
    return;
  }

  const runSync = () => {
    // Refresh local session from Supabase if configured, then refresh nav UI.
    syncSessionFromSupabase()
      .then((sessionUser) => (sessionUser ? syncCurrentUserRoleFromSupabase() : 'player'))
      .then(() => renderNavAuth())
      .catch(() => {
        // Keep existing local session behavior if sync fails.
      });
  };

  if (shouldForceSyncNow) {
    runSync();
    return;
  }

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => runSync(), { timeout: 1200 });
  } else {
    window.setTimeout(runSync, 0);
  }
})();
