// =============================================================================
// supabase-data.js — normalized Supabase table helpers for site data
// Supabase-only mode (no localStorage fallback for data source-of-truth)
// =============================================================================

(() => {
  const TABLES = {
    applicationStatuses: 'application_statuses',
    applicationSubmissions: 'application_submissions',
    appealSubmissions: 'appeal_submissions',
    userDiscordLinks: 'user_discord_links',
    discordLinkCodes: 'discord_link_codes',
  };

  const DISCORD_LINK_CODE_TTL_MINUTES = 10;

  const makeDiscordLinkCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const randomValues = crypto.getRandomValues(new Uint32Array(8));
    return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
  };

  const getClient = async () => {
    if (typeof window.getSupabaseClient !== 'function') return null;
    try {
      return await window.getSupabaseClient();
    } catch {
      return null;
    }
  };

  const fromDbAppSubmission = (row) => ({
    acknowledgements: row.acknowledgements || {},
    id: row.id,
    status: row.status,
    roleId: row.role_id,
    roleTitle: row.role_title,
    userId: row.user_id || null,
    discordUserId: row.discord_user_id || null,
    minecraftUsername: row.minecraft_username || '',
    age: row.age || '',
    discord: row.discord || '',
    email: row.email || '',
    whyJoin: row.why_join || '',
    experience: row.experience || '',
    conflictHandling: row.conflict_handling || '',
    communityImprovement: row.community_improvement || '',
    questionPrompts: Array.isArray((row.acknowledgements || {}).questionPrompts)
      ? (row.acknowledgements || {}).questionPrompts
      : [],
    extraResponses: Array.isArray((row.acknowledgements || {}).extraResponses)
      ? (row.acknowledgements || {}).extraResponses
      : [],
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by || null,
    createdAt: row.created_at || new Date().toISOString(),
  });

  const toDbAppSubmission = (submission) => ({
    id: submission.id,
    status: submission.status || 'pending',
    role_id: submission.roleId || '',
    role_title: submission.roleTitle || '',
    user_id: submission.userId || null,
    discord_user_id: submission.discordUserId || null,
    minecraft_username: submission.minecraftUsername || null,
    age: submission.age || null,
    discord: submission.discord || null,
    email: submission.email || null,
    why_join: submission.whyJoin || null,
    experience: submission.experience || null,
    conflict_handling: submission.conflictHandling || null,
    community_improvement: submission.communityImprovement || null,
    acknowledgements: {
      ...(submission.acknowledgements || {}),
      questionPrompts: Array.isArray(submission.questionPrompts)
        ? submission.questionPrompts
        : Array.isArray(submission.acknowledgements?.questionPrompts)
          ? submission.acknowledgements.questionPrompts
          : [],
      extraResponses: Array.isArray(submission.extraResponses)
        ? submission.extraResponses
        : Array.isArray(submission.acknowledgements?.extraResponses)
          ? submission.acknowledgements.extraResponses
          : [],
    },
    reviewed_at: submission.reviewedAt || null,
    reviewed_by: submission.reviewedBy || null,
    created_at: submission.createdAt || new Date().toISOString(),
  });

  const fromDbAppealSubmission = (row) => ({
    id: row.id,
    status: row.status,
    minecraftName: row.minecraft_name || '',
    discord: row.discord || '',
    email: row.email || '',
    punishmentType: row.punishment_type || '',
    punishmentDate: row.punishment_date || '',
    punishmentLocation: row.punishment_location || '',
    eventSummary: row.event_summary || '',
    reconsiderReason: row.reconsider_reason || '',
    preventionPlan: row.prevention_plan || '',
    additionalContext: row.additional_context || '',
    acknowledgements: row.acknowledgements || {},
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by || null,
    createdAt: row.created_at || new Date().toISOString(),
  });

  const toDbAppealSubmission = (submission) => ({
    id: submission.id,
    status: submission.status || 'pending',
    minecraft_name: submission.minecraftName || null,
    discord: submission.discord || null,
    email: submission.email || null,
    punishment_type: submission.punishmentType || null,
    punishment_date: submission.punishmentDate || null,
    punishment_location: submission.punishmentLocation || null,
    event_summary: submission.eventSummary || null,
    reconsider_reason: submission.reconsiderReason || null,
    prevention_plan: submission.preventionPlan || null,
    additional_context: submission.additionalContext || null,
    acknowledgements: submission.acknowledgements || {},
    reviewed_at: submission.reviewedAt || null,
    reviewed_by: submission.reviewedBy || null,
    created_at: submission.createdAt || new Date().toISOString(),
  });

  window.syncApplicationStatusesFromSupabase = async () => {
    const client = await getClient();
    if (!client) return null;

    const { data, error } = await client
      .from(TABLES.applicationStatuses)
      .select('role_id,is_open')
      .order('role_id', { ascending: true });

    if (error) {
      console.warn('Could not fetch application statuses from Supabase:', error.message);
      return null;
    }

    return (data || []).reduce((acc, row) => {
      acc[row.role_id] = row.is_open === true;
      return acc;
    }, {});
  };

  window.pushApplicationStatusesToSupabase = async (statuses) => {
    const client = await getClient();
    if (!client) return false;

    const source = statuses || {};
    const rows = Object.entries(source).map(([roleId, isOpen]) => ({
      role_id: roleId,
      is_open: isOpen === true,
      updated_at: new Date().toISOString(),
    }));

    if (!rows.length) return true;

    const { error } = await client
      .from(TABLES.applicationStatuses)
      .upsert(rows, { onConflict: 'role_id' });

    if (error) {
      console.warn('Could not push application statuses to Supabase:', error.message);
      return false;
    }

    return true;
  };

  window.syncApplicationSubmissionsFromSupabase = async () => {
    const client = await getClient();
    if (!client) return null;

    const { data, error } = await client
      .from(TABLES.applicationSubmissions)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not fetch applications from Supabase:', error.message);
      return null;
    }

    return (data || []).map(fromDbAppSubmission);
  };

  window.insertApplicationToSupabase = async (submission) => {
    const client = await getClient();
    if (!client) return false;

    const { error } = await client
      .from(TABLES.applicationSubmissions)
      .upsert([toDbAppSubmission(submission)], { onConflict: 'id' });

    if (error) {
      console.warn('Could not save application to Supabase:', error.message);
      return false;
    }

    return true;
  };

  window.getMyDiscordLinkFromSupabase = async () => {
    const client = await getClient();
    if (!client) {
      return { ok: false, linked: false, message: 'Supabase not configured.', link: null };
    }

    const authUid = window.getCurrentAuthUid?.() || '';
    if (!authUid) {
      return { ok: false, linked: false, message: 'Sign in required.', link: null };
    }

    const { data, error } = await client
      .from(TABLES.userDiscordLinks)
      .select('user_id, discord_user_id, discord_tag, linked_at, updated_at')
      .eq('user_id', authUid)
      .maybeSingle();

    if (error) {
      console.warn('Could not fetch Discord link for current user:', error.message);
      return { ok: false, linked: false, message: error.message, link: null };
    }

    if (!data?.discord_user_id) {
      return { ok: true, linked: false, link: null };
    }

    return {
      ok: true,
      linked: true,
      link: {
        userId: data.user_id,
        discordUserId: String(data.discord_user_id),
        discordTag: data.discord_tag || null,
        linkedAt: data.linked_at || null,
        updatedAt: data.updated_at || null,
      },
    };
  };

  window.createDiscordLinkCodeInSupabase = async () => {
    const client = await getClient();
    if (!client) {
      return { ok: false, message: 'Supabase not configured.', code: null, expiresAt: null };
    }

    const authUid = window.getCurrentAuthUid?.() || '';
    if (!authUid) {
      return { ok: false, message: 'You must sign in first.', code: null, expiresAt: null };
    }

    const code = makeDiscordLinkCode();
    const expiresAt = new Date(Date.now() + DISCORD_LINK_CODE_TTL_MINUTES * 60 * 1000).toISOString();

    const { error } = await client
      .from(TABLES.discordLinkCodes)
      .upsert([
        {
          code,
          user_id: authUid,
          expires_at: expiresAt,
          used_at: null,
          used_by_discord_user_id: null,
          created_at: new Date().toISOString(),
        },
      ], { onConflict: 'user_id' });

    if (error) {
      console.warn('Could not create Discord link code:', error.message);
      return { ok: false, message: error.message, code: null, expiresAt: null };
    }

    return { ok: true, code, expiresAt };
  };

  window.updateApplicationReviewInSupabase = async (submissionId, nextStatus, reviewedBy) => {
    const client = await getClient();
    if (!client) return false;

    const { error } = await client
      .from(TABLES.applicationSubmissions)
      .update({
        status: nextStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy || 'Staff',
      })
      .eq('id', submissionId);

    if (error) {
      console.warn('Could not update application review in Supabase:', error.message);
      return false;
    }

    return true;
  };

  window.syncAppealSubmissionsFromSupabase = async () => {
    const client = await getClient();
    if (!client) return null;

    const { data, error } = await client
      .from(TABLES.appealSubmissions)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not fetch appeals from Supabase:', error.message);
      return null;
    }

    return (data || []).map(fromDbAppealSubmission);
  };

  window.insertAppealToSupabase = async (submission) => {
    const client = await getClient();
    if (!client) return false;

    const { error } = await client
      .from(TABLES.appealSubmissions)
      .upsert([toDbAppealSubmission(submission)], { onConflict: 'id' });

    if (error) {
      console.warn('Could not save appeal to Supabase:', error.message);
      return false;
    }

    return true;
  };

  window.updateAppealReviewInSupabase = async (submissionId, nextStatus, reviewedBy) => {
    const client = await getClient();
    if (!client) return false;

    const { error } = await client
      .from(TABLES.appealSubmissions)
      .update({
        status: nextStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy || 'Staff',
      })
      .eq('id', submissionId);

    if (error) {
      console.warn('Could not update appeal review in Supabase:', error.message);
      return false;
    }

    return true;
  };

  // ===========================================================================
  // HR Portal — Staff Files, Log Entries, and Application Lockouts
  // ===========================================================================

  const HR_TABLES = {
    staffFiles: 'staff_files',
    staffFeedback: 'staff_feedback',
    staffDisciplinary: 'staff_disciplinary',
    staffActivity: 'staff_activity',
    lockouts: 'application_lockouts',
    loaRequests: 'staff_loa_requests',
  };

  const STAFF_FILE_SYNC_ROLES = new Set(['builder', 'event_team', 'media', 'qa_tester', 'helper', 'moderator', 'developer', 'admin', 'manager', 'owner']);

  const normalizeRoleForSync = (role) => {
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'staff') return 'developer';
    return normalized;
  };

  const DEFAULT_ONBOARDING = {
    interviewScheduled: false,
    interviewDate: '',
    interviewComplete: false,
    interviewStatus: 'pending',
    interviewNotes: '',
    onboardingSetup: false,
    portalGuided: false,
    workflowExplained: false,
    onboardingComplete: false,
    approvedAt: null,
    deniedAt: null,
  };

  const fromDbStaffFile = (row) => ({
    id: row.id,
    minecraftUsername: row.minecraft_username || '',
    userId: row.user_id || null,
    discord: row.discord || '',
    email: row.email || '',
    appliedRoleId: row.applied_role_id || '',
    assignedRole: row.assigned_role || '',
    applicationId: row.application_id || null,
    onboarding: {
      ...DEFAULT_ONBOARDING,
      ...(row.onboarding || {}),
    },
    notes: row.notes || '',
    isActive: row.is_active === true,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  });

  window.createStaffFile = async (data) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const row = {
      minecraft_username: String(data.minecraftUsername || '').trim(),
      user_id: data.userId || null,
      discord: data.discord || null,
      email: data.email || null,
      applied_role_id: data.appliedRoleId || null,
      assigned_role: data.assignedRole || null,
      application_id: data.applicationId || null,
      onboarding: { ...DEFAULT_ONBOARDING },
      notes: data.notes || '',
      is_active: data.isActive === true,
    };

    const { data: result, error } = await client
      .from(HR_TABLES.staffFiles)
      .insert([row])
      .select()
      .single();

    if (error) {
      console.warn('Could not create staff file:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, file: fromDbStaffFile(result) };
  };

  window.syncStaffFilesFromRoleAssignments = async () => {
    const client = await getClient();
    if (!client) {
      return {
        ok: false,
        message: 'Supabase not configured.',
        summary: { created: 0, linked: 0, updated: 0, skipped: 0, totalStaffUsers: 0 },
      };
    }

    const { data: roleRows, error: roleError } = await client
      .from('user_roles')
      .select('user_id, role');

    if (roleError) {
      console.warn('Could not fetch user roles for staff file sync:', roleError.message);
      return {
        ok: false,
        message: roleError.message,
        summary: { created: 0, linked: 0, updated: 0, skipped: 0, totalStaffUsers: 0 },
      };
    }

    const staffRoleRows = (roleRows || [])
      .map((row) => ({
        userId: row.user_id,
        role: normalizeRoleForSync(row.role),
      }))
      .filter((row) => row.userId && STAFF_FILE_SYNC_ROLES.has(row.role));

    const uniqueStaffUsers = Array.from(new Map(staffRoleRows.map((row) => [row.userId, row])).values());
    const userIds = uniqueStaffUsers.map((row) => row.userId);

    if (!userIds.length) {
      return {
        ok: true,
        message: 'No staff-role users found in role assignments.',
        summary: { created: 0, linked: 0, updated: 0, skipped: 0, totalStaffUsers: 0 },
      };
    }

    const { data: profileRows, error: profileError } = await client
      .from('user_profiles')
      .select('user_id, username')
      .in('user_id', userIds);

    if (profileError) {
      console.warn('Could not fetch usernames for staff file sync:', profileError.message);
      return {
        ok: false,
        message: profileError.message,
        summary: { created: 0, linked: 0, updated: 0, skipped: 0, totalStaffUsers: userIds.length },
      };
    }

    const usernamesById = new Map((profileRows || []).map((row) => [row.user_id, String(row.username || '').trim()]));

    const existing = await window.getStaffFiles?.();
    if (!existing?.ok) {
      return {
        ok: false,
        message: existing?.message || 'Could not load existing staff files.',
        summary: { created: 0, linked: 0, updated: 0, skipped: 0, totalStaffUsers: userIds.length },
      };
    }

    const existingFiles = existing.files || [];
    const byUserId = new Map();
    const byUsername = new Map();

    existingFiles.forEach((file) => {
      if (file.userId) {
        byUserId.set(String(file.userId), file);
      }
      const usernameKey = String(file.minecraftUsername || '').trim().toLowerCase();
      if (usernameKey && !byUsername.has(usernameKey)) {
        byUsername.set(usernameKey, file);
      }
    });

    let created = 0;
    let linked = 0;
    let updated = 0;
    let skipped = 0;

    for (const person of uniqueStaffUsers) {
      const userId = String(person.userId);
      const role = person.role;
      const profileUsername = String(usernamesById.get(userId) || '').trim();
      const fallbackName = `staff-${userId.slice(0, 8)}`;
      const minecraftUsername = profileUsername || fallbackName;
      const usernameKey = minecraftUsername.toLowerCase();

      const matchedByUser = byUserId.get(userId);
      if (matchedByUser) {
        const needsAssignedRole = !matchedByUser.assignedRole || matchedByUser.assignedRole !== role;
        const needsActive = matchedByUser.isActive !== true;

        if (needsAssignedRole || needsActive) {
          const patch = {};
          if (needsAssignedRole) patch.assignedRole = role;
          if (needsActive) patch.isActive = true;
          const updateResult = await window.updateStaffFile?.(matchedByUser.id, patch);
          if (updateResult?.ok) {
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          skipped += 1;
        }
        continue;
      }

      const matchedByUsername = byUsername.get(usernameKey);
      if (matchedByUsername && !matchedByUsername.userId) {
        const linkResult = await window.updateStaffFile?.(matchedByUsername.id, {
          userId,
          assignedRole: role,
          isActive: true,
        });

        if (linkResult?.ok) {
          linked += 1;
          const linkedFile = linkResult.file;
          if (linkedFile?.userId) byUserId.set(String(linkedFile.userId), linkedFile);
          byUsername.set(usernameKey, linkedFile || matchedByUsername);
        } else {
          skipped += 1;
        }
        continue;
      }

      const createResult = await window.createStaffFile?.({
        minecraftUsername,
        userId,
        assignedRole: role,
        isActive: true,
      });

      if (createResult?.ok && createResult.file) {
        created += 1;
        const file = createResult.file;
        if (file.userId) byUserId.set(String(file.userId), file);
        byUsername.set(String(file.minecraftUsername || '').trim().toLowerCase(), file);
      } else {
        skipped += 1;
      }
    }

    const totalTouched = created + linked + updated;
    return {
      ok: true,
      message: totalTouched
        ? `Staff file sync complete. Created ${created}, linked ${linked}, updated ${updated}, skipped ${skipped}.`
        : `Staff file sync complete. No changes needed (${skipped} skipped).`,
      summary: { created, linked, updated, skipped, totalStaffUsers: uniqueStaffUsers.length },
    };
  };

  window.getStaffFiles = async () => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', files: [] };

    const { data, error } = await client
      .from(HR_TABLES.staffFiles)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not fetch staff files:', error.message);
      return { ok: false, message: error.message, files: [] };
    }

    return { ok: true, files: (data || []).map(fromDbStaffFile) };
  };

  window.getStaffFileById = async (id) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', file: null };

    const { data, error } = await client
      .from(HR_TABLES.staffFiles)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.warn('Could not fetch staff file:', error.message);
      return { ok: false, message: error.message, file: null };
    }

    return { ok: true, file: data ? fromDbStaffFile(data) : null };
  };

  window.getStaffFileByUserId = async (userId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', file: null };

    const { data, error } = await client
      .from(HR_TABLES.staffFiles)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Could not fetch staff file by user_id:', error.message);
      return { ok: false, message: error.message, file: null };
    }

    return { ok: true, file: data ? fromDbStaffFile(data) : null };
  };

  window.getStaffFileByMinecraftUsername = async (username) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', file: null };

    const { data, error } = await client
      .from(HR_TABLES.staffFiles)
      .select('*')
      .ilike('minecraft_username', String(username || '').trim())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Could not fetch staff file by username:', error.message);
      return { ok: false, message: error.message, file: null };
    }

    return { ok: true, file: data ? fromDbStaffFile(data) : null };
  };

  window.updateStaffFile = async (id, patch) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const dbPatch = { updated_at: new Date().toISOString() };
    if (patch.minecraftUsername !== undefined) dbPatch.minecraft_username = patch.minecraftUsername;
    if (patch.userId !== undefined) dbPatch.user_id = patch.userId || null;
    if (patch.discord !== undefined) dbPatch.discord = patch.discord;
    if (patch.email !== undefined) dbPatch.email = patch.email;
    if (patch.assignedRole !== undefined) dbPatch.assigned_role = patch.assignedRole;
    if (patch.onboarding !== undefined) dbPatch.onboarding = patch.onboarding;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;

    const { data, error } = await client
      .from(HR_TABLES.staffFiles)
      .update(dbPatch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.warn('Could not update staff file:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, file: fromDbStaffFile(data) };
  };

  // ── Generic log entry helpers ─────────────────────────────────────────────

  const insertStaffLog = async (table, staffFileId, entry) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const { data, error } = await client
      .from(table)
      .insert([{ staff_file_id: staffFileId, ...entry }])
      .select()
      .single();

    if (error) {
      console.warn(`Could not insert into ${table}:`, error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, entry: data };
  };

  const fetchStaffLog = async (table, staffFileId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', entries: [] };

    const { data, error } = await client
      .from(table)
      .select('*')
      .eq('staff_file_id', staffFileId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn(`Could not fetch from ${table}:`, error.message);
      return { ok: false, message: error.message, entries: [] };
    }

    return { ok: true, entries: data || [] };
  };

  const deleteStaffLog = async (table, entryId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const { error } = await client
      .from(table)
      .delete()
      .eq('id', entryId);

    if (error) {
      console.warn(`Could not delete from ${table}:`, error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true };
  };

  window.addStaffFeedback    = (fileId, entry) => insertStaffLog(HR_TABLES.staffFeedback, fileId, entry);
  window.getStaffFeedback    = (fileId) => fetchStaffLog(HR_TABLES.staffFeedback, fileId);
  window.deleteStaffFeedback = (entryId) => deleteStaffLog(HR_TABLES.staffFeedback, entryId);
  window.addStaffDisciplinary = (fileId, entry) => insertStaffLog(HR_TABLES.staffDisciplinary, fileId, entry);
  window.getStaffDisciplinary = (fileId) => fetchStaffLog(HR_TABLES.staffDisciplinary, fileId);
  window.deleteStaffDisciplinary = (entryId) => deleteStaffLog(HR_TABLES.staffDisciplinary, entryId);
  window.addStaffActivity    = (fileId, entry) => insertStaffLog(HR_TABLES.staffActivity, fileId, entry);
  window.getStaffActivity    = (fileId) => fetchStaffLog(HR_TABLES.staffActivity, fileId);
  window.deleteStaffActivity = (entryId) => deleteStaffLog(HR_TABLES.staffActivity, entryId);

  // ── Application lockouts ──────────────────────────────────────────────────

  window.checkApplicationLockout = async (minecraftUsername) => {
    const client = await getClient();
    if (!client) return { locked: false, unlocksAt: null };

    const now = new Date().toISOString();
    const { data, error } = await client
      .from(HR_TABLES.lockouts)
      .select('locked_until')
      .ilike('minecraft_username', String(minecraftUsername || '').trim())
      .gt('locked_until', now)
      .order('locked_until', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return { locked: false, unlocksAt: null };
    return { locked: true, unlocksAt: new Date(data.locked_until) };
  };

  window.setApplicationLockout = async (minecraftUsername, reason) => {
    const client = await getClient();
    if (!client) return false;

    const lockedUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await client
      .from(HR_TABLES.lockouts)
      .insert([{
        minecraft_username: String(minecraftUsername || '').trim(),
        locked_until: lockedUntil,
        reason: String(reason || 'Application denied'),
      }]);

    if (error) {
      console.warn('Could not set application lockout:', error.message);
      return false;
    }

    return true;
  };

  window.clearApplicationLockout = async (minecraftUsername) => {
    const client = await getClient();
    if (!client) return false;

    const normalizedUsername = String(minecraftUsername || '').trim();
    if (!normalizedUsername) return true;

    const { error } = await client
      .from(HR_TABLES.lockouts)
      .delete()
      .ilike('minecraft_username', normalizedUsername);

    if (error) {
      console.warn('Could not clear application lockout:', error.message);
      return false;
    }

    return true;
  };

  // ── Staff LOA requests ───────────────────────────────────────────────────

  const fromDbLoaRequest = (row) => ({
    id: row.id,
    staffFileId: row.staff_file_id,
    requesterUserId: row.requester_user_id || null,
    reason: row.reason || '',
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    status: row.status || 'pending',
    managerNote: row.manager_note || '',
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    staffFile: row.staff_files
      ? {
          id: row.staff_files.id,
          minecraftUsername: row.staff_files.minecraft_username || '',
          assignedRole: row.staff_files.assigned_role || '',
          userId: row.staff_files.user_id || null,
        }
      : null,
  });

  window.createLoaRequest = async ({ staffFileId, requesterUserId, reason, startDate, endDate }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const payload = {
      staff_file_id: staffFileId,
      requester_user_id: requesterUserId || null,
      reason: String(reason || '').trim(),
      start_date: startDate || null,
      end_date: endDate || null,
      status: 'pending',
      manager_note: '',
      reviewed_by: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from(HR_TABLES.loaRequests)
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.warn('Could not create LOA request:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, request: fromDbLoaRequest(data) };
  };

  window.getLoaRequestsByStaffFile = async (staffFileId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', requests: [] };

    const { data, error } = await client
      .from(HR_TABLES.loaRequests)
      .select('*')
      .eq('staff_file_id', staffFileId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not fetch LOA requests:', error.message);
      return { ok: false, message: error.message, requests: [] };
    }

    return { ok: true, requests: (data || []).map(fromDbLoaRequest) };
  };

  window.getAllLoaRequests = async () => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', requests: [] };

    const { data, error } = await client
      .from(HR_TABLES.loaRequests)
      .select('*, staff_files(id, minecraft_username, assigned_role, user_id)')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not fetch all LOA requests:', error.message);
      return { ok: false, message: error.message, requests: [] };
    }

    return { ok: true, requests: (data || []).map(fromDbLoaRequest) };
  };

  window.updateLoaRequestStatus = async (requestId, { status, managerNote, reviewedBy }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const nextStatus = String(status || '').trim().toLowerCase();
    if (!['pending', 'approved', 'denied'].includes(nextStatus)) {
      return { ok: false, message: 'Invalid LOA status.' };
    }

    const patch = {
      status: nextStatus,
      manager_note: String(managerNote || '').trim(),
      reviewed_by: reviewedBy || null,
      reviewed_at: nextStatus === 'pending' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from(HR_TABLES.loaRequests)
      .update(patch)
      .eq('id', requestId)
      .select('*, staff_files(id, minecraft_username, assigned_role, user_id)')
      .single();

    if (error) {
      console.warn('Could not update LOA status:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, request: fromDbLoaRequest(data) };
  };

  window.deleteLoaRequest = async (requestId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const { error } = await client
      .from(HR_TABLES.loaRequests)
      .delete()
      .eq('id', requestId);

    if (error) {
      console.warn('Could not delete LOA request:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true };
  };

  // ── Wiki articles ───────────────────────────────────────────────────────

  const WIKI_TABLE = 'wiki_articles';
  const WIKI_GROUPS_TABLE = 'wiki_groups';
  const DEFAULT_WIKI_GROUPS = Object.freeze([
    { slug: 'getting-started', label: 'Getting Started' },
    { slug: 'server-guides', label: 'Server Guides' },
    { slug: 'staff-guides', label: 'Staff Guides' },
    { slug: 'rules-policies', label: 'Rules & Policies' },
    { slug: 'faq', label: 'FAQ' },
  ]);

  let wikiGroupsCache = DEFAULT_WIKI_GROUPS.slice();
  const WIKI_GROUP_FALLBACK = DEFAULT_WIKI_GROUPS[0].slug;
  const normalizeWikiGroupSlug = (value) => {
    const input = String(value || '').trim().toLowerCase();
    return wikiGroupsCache.some((group) => group.slug === input) ? input : WIKI_GROUP_FALLBACK;
  };

  const sanitizeWikiGroupSlug = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const sanitizeWikiGroupLabel = (value) => String(value || '').trim();

  const fromDbWikiGroup = (row) => ({
    id: row.id,
    slug: sanitizeWikiGroupSlug(row.slug),
    label: sanitizeWikiGroupLabel(row.label) || sanitizeWikiGroupSlug(row.slug),
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  });

  const sortWikiGroups = (groups) => groups
    .slice()
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label));

  const ensureWikiGroupsFallback = (groups) => {
    const next = Array.isArray(groups) ? groups.filter((group) => group.slug && group.label) : [];
    return next.length ? sortWikiGroups(next) : DEFAULT_WIKI_GROUPS.map((group, index) => ({
      id: null,
      slug: group.slug,
      label: group.label,
      sortOrder: index,
      createdAt: null,
      updatedAt: null,
    }));
  };

  window.getWikiGroups = () => wikiGroupsCache.slice();

  window.loadWikiGroups = async () => {
    const client = await getClient();
    if (!client) {
      wikiGroupsCache = ensureWikiGroupsFallback([]);
      return { ok: true, groups: wikiGroupsCache, message: 'Using default wiki groups.' };
    }

    const { data, error } = await client
      .from(WIKI_GROUPS_TABLE)
      .select('*')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });

    if (error) {
      console.warn('Could not load wiki groups, falling back to defaults:', error.message);
      wikiGroupsCache = ensureWikiGroupsFallback([]);
      return { ok: true, groups: wikiGroupsCache, message: 'Using default wiki groups.' };
    }

    wikiGroupsCache = ensureWikiGroupsFallback((data || []).map(fromDbWikiGroup));
    return { ok: true, groups: wikiGroupsCache };
  };

  window.createWikiGroup = async ({ label, slug, sortOrder }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const normalizedLabel = sanitizeWikiGroupLabel(label);
    const normalizedSlug = sanitizeWikiGroupSlug(slug || label);
    if (!normalizedLabel || !normalizedSlug) {
      return { ok: false, message: 'Group label and slug are required.' };
    }

    const payload = {
      label: normalizedLabel,
      slug: normalizedSlug,
      sort_order: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from(WIKI_GROUPS_TABLE)
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.warn('Could not create wiki group:', error.message);
      return { ok: false, message: error.message };
    }

    await window.loadWikiGroups();
    return { ok: true, group: fromDbWikiGroup(data) };
  };

  window.updateWikiGroup = async (groupId, { label, slug, sortOrder }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const patch = { updated_at: new Date().toISOString() };
    if (label !== undefined) patch.label = sanitizeWikiGroupLabel(label);
    if (slug !== undefined) patch.slug = sanitizeWikiGroupSlug(slug);
    if (sortOrder !== undefined && Number.isFinite(Number(sortOrder))) patch.sort_order = Number(sortOrder);

    const { data, error } = await client
      .from(WIKI_GROUPS_TABLE)
      .update(patch)
      .eq('id', groupId)
      .select('*')
      .single();

    if (error) {
      console.warn('Could not update wiki group:', error.message);
      return { ok: false, message: error.message };
    }

    await window.loadWikiGroups();
    return { ok: true, group: fromDbWikiGroup(data) };
  };

  window.deleteWikiGroup = async (groupId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const { error } = await client
      .from(WIKI_GROUPS_TABLE)
      .delete()
      .eq('id', groupId);

    if (error) {
      console.warn('Could not delete wiki group:', error.message);
      return { ok: false, message: error.message };
    }

    await window.loadWikiGroups();
    return { ok: true };
  };

  window.deleteWikiGroupSafe = async (groupId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const { data: groupRow, error: groupError } = await client
      .from(WIKI_GROUPS_TABLE)
      .select('id, slug, label')
      .eq('id', groupId)
      .maybeSingle();

    if (groupError) {
      console.warn('Could not load wiki group for guarded delete:', groupError.message);
      return { ok: false, message: groupError.message };
    }

    if (!groupRow?.id || !groupRow?.slug) {
      return { ok: false, message: 'Wiki folder was not found.' };
    }

    const { data: approvedRows, error: approvedError } = await client
      .from(WIKI_TABLE)
      .select('id', { count: 'exact' })
      .eq('group_slug', groupRow.slug)
      .eq('status', 'approved');

    if (approvedError) {
      console.warn('Could not check approved wiki usage for folder delete:', approvedError.message);
      return { ok: false, message: approvedError.message };
    }

    const approvedCount = (approvedRows || []).length;
    if (approvedCount > 0) {
      return {
        ok: false,
        message: `Cannot delete folder "${groupRow.label || groupRow.slug}" because ${approvedCount} approved page${approvedCount === 1 ? '' : 's'} are still using it.`,
        blockedByApprovedArticles: true,
        approvedCount,
      };
    }

    return window.deleteWikiGroup(groupId);
  };

  window.moveApprovedWikiArticlesAndDeleteGroup = async ({ fromGroupId, toGroupId }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    if (!fromGroupId || !toGroupId) {
      return { ok: false, message: 'Both source and destination folders are required.' };
    }
    if (String(fromGroupId) === String(toGroupId)) {
      return { ok: false, message: 'Choose a different destination folder.' };
    }

    const { data: groups, error: groupError } = await client
      .from(WIKI_GROUPS_TABLE)
      .select('id, slug, label')
      .in('id', [fromGroupId, toGroupId]);

    if (groupError) {
      console.warn('Could not resolve folders for move/delete:', groupError.message);
      return { ok: false, message: groupError.message };
    }

    const fromGroup = (groups || []).find((group) => String(group.id) === String(fromGroupId));
    const toGroup = (groups || []).find((group) => String(group.id) === String(toGroupId));

    if (!fromGroup?.id || !toGroup?.id) {
      return { ok: false, message: 'Could not resolve selected folders.' };
    }

    const { data: movedRows, error: moveError } = await client
      .from(WIKI_TABLE)
      .update({
        group_slug: toGroup.slug,
        updated_at: new Date().toISOString(),
      })
      .eq('group_slug', fromGroup.slug)
      .eq('status', 'approved')
      .select('id');

    if (moveError) {
      console.warn('Could not move approved wiki pages:', moveError.message);
      return { ok: false, message: moveError.message };
    }

    const deleteResult = await window.deleteWikiGroupSafe(fromGroupId);
    if (!deleteResult?.ok) {
      return deleteResult;
    }

    return {
      ok: true,
      movedCount: (movedRows || []).length,
      message: `Moved ${(movedRows || []).length} approved page${(movedRows || []).length === 1 ? '' : 's'} to "${toGroup.label || toGroup.slug}" and deleted the folder.`,
    };
  };

  const fromDbWikiArticle = (row) => ({
    id: row.id,
    title: row.title || '',
    slug: row.slug || '',
    groupSlug: normalizeWikiGroupSlug(row.group_slug),
    excerpt: row.excerpt || '',
    content: row.content || '',
    status: row.status || 'pending',
    authorUserId: row.author_user_id || null,
    authorName: row.author_name || '',
    reviewerUserId: row.reviewer_user_id || null,
    reviewerName: row.reviewer_name || '',
    reviewNote: row.review_note || '',
    reviewedAt: row.reviewed_at || null,
    publishedAt: row.published_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  });

  window.createWikiArticle = async ({ title, slug, groupSlug, excerpt, content, authorUserId, authorName }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const normalizedSlug = String(slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!normalizedSlug) {
      return { ok: false, message: 'A valid slug is required.' };
    }

    const payload = {
      title: String(title || '').trim(),
      slug: normalizedSlug,
      group_slug: normalizeWikiGroupSlug(groupSlug),
      excerpt: String(excerpt || '').trim(),
      content: String(content || '').trim(),
      status: 'pending',
      author_user_id: authorUserId || null,
      author_name: String(authorName || '').trim() || null,
      reviewer_user_id: null,
      reviewer_name: null,
      review_note: '',
      reviewed_at: null,
      published_at: null,
      updated_at: new Date().toISOString(),
    };

    if (!payload.title || !payload.content) {
      return { ok: false, message: 'Title and content are required.' };
    }

    const { data, error } = await client
      .from(WIKI_TABLE)
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.warn('Could not create wiki article:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, article: fromDbWikiArticle(data) };
  };

  window.updateMyWikiArticle = async ({ articleId, title, slug, groupSlug, excerpt, content, authorUserId }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const normalizedSlug = String(slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!articleId) return { ok: false, message: 'Article id is required.' };
    if (!authorUserId) return { ok: false, message: 'Author account is required.' };
    if (!String(title || '').trim() || !String(content || '').trim() || !normalizedSlug) {
      return { ok: false, message: 'Title, slug, and content are required.' };
    }

    const patch = {
      title: String(title || '').trim(),
      slug: normalizedSlug,
      group_slug: normalizeWikiGroupSlug(groupSlug),
      excerpt: String(excerpt || '').trim(),
      content: String(content || '').trim(),
      status: 'pending',
      review_note: '',
      reviewer_user_id: null,
      reviewer_name: '',
      reviewed_at: null,
      published_at: null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from(WIKI_TABLE)
      .update(patch)
      .eq('id', articleId)
      .eq('author_user_id', authorUserId)
      .select('*')
      .single();

    if (error) {
      console.warn('Could not update wiki article:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, article: fromDbWikiArticle(data) };
  };

  window.getMyWikiArticles = async (authorUserId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', articles: [] };

    const { data, error } = await client
      .from(WIKI_TABLE)
      .select('*')
      .eq('author_user_id', authorUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not fetch own wiki articles:', error.message);
      return { ok: false, message: error.message, articles: [] };
    }

    return { ok: true, articles: (data || []).map(fromDbWikiArticle) };
  };

  window.getEditablePublishedWikiArticles = async () => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', articles: [] };

    const { data, error } = await client
      .from(WIKI_TABLE)
      .select('*')
      .eq('status', 'approved')
      .order('published_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not fetch editable published wiki articles:', error.message);
      return { ok: false, message: error.message, articles: [] };
    }

    return { ok: true, articles: (data || []).map(fromDbWikiArticle) };
  };

  window.submitWikiRevision = async ({ articleId, title, slug, groupSlug, excerpt, content, authorUserId, authorName }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const normalizedSlug = String(slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!articleId) return { ok: false, message: 'Article id is required.' };
    if (!authorUserId) return { ok: false, message: 'Author account is required.' };
    if (!String(title || '').trim() || !String(content || '').trim() || !normalizedSlug) {
      return { ok: false, message: 'Title, slug, and content are required.' };
    }

    const nowIso = new Date().toISOString();
    const patch = {
      title: String(title || '').trim(),
      slug: normalizedSlug,
      group_slug: normalizeWikiGroupSlug(groupSlug),
      excerpt: String(excerpt || '').trim(),
      content: String(content || '').trim(),
      status: 'pending',
      author_user_id: authorUserId,
      author_name: String(authorName || '').trim() || null,
      review_note: '',
      reviewer_user_id: null,
      reviewer_name: '',
      reviewed_at: null,
      published_at: null,
      updated_at: nowIso,
    };

    const { data, error } = await client
      .from(WIKI_TABLE)
      .update(patch)
      .eq('id', articleId)
      .eq('status', 'approved')
      .select('*')
      .single();

    if (error) {
      console.warn('Could not submit wiki revision:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, article: fromDbWikiArticle(data) };
  };

  window.getPendingWikiArticles = async () => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', articles: [] };

    const { data, error } = await client
      .from(WIKI_TABLE)
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not fetch pending wiki articles:', error.message);
      return { ok: false, message: error.message, articles: [] };
    }

    return { ok: true, articles: (data || []).map(fromDbWikiArticle) };
  };

  window.reviewWikiArticle = async (articleId, { status, reviewerUserId, reviewerName, reviewNote }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const nextStatus = String(status || '').trim().toLowerCase();
    if (!['approved', 'denied'].includes(nextStatus)) {
      return { ok: false, message: 'Review status must be approved or denied.' };
    }

    const nowIso = new Date().toISOString();
    const patch = {
      status: nextStatus,
      reviewer_user_id: reviewerUserId || null,
      reviewer_name: String(reviewerName || '').trim() || null,
      review_note: String(reviewNote || '').trim(),
      reviewed_at: nowIso,
      published_at: nextStatus === 'approved' ? nowIso : null,
      updated_at: nowIso,
    };

    const { data, error } = await client
      .from(WIKI_TABLE)
      .update(patch)
      .eq('id', articleId)
      .select('*')
      .single();

    if (error) {
      console.warn('Could not review wiki article:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, article: fromDbWikiArticle(data) };
  };

  window.getPublishedWikiArticles = async () => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', articles: [] };

    const { data, error } = await client
      .from(WIKI_TABLE)
      .select('*')
      .eq('status', 'approved')
      .order('published_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not fetch published wiki articles:', error.message);
      return { ok: false, message: error.message, articles: [] };
    }

    return { ok: true, articles: (data || []).map(fromDbWikiArticle) };
  };

  window.getPublishedWikiArticleBySlug = async (slug) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', article: null };

    const normalizedSlug = String(slug || '').trim().toLowerCase();
    if (!normalizedSlug) {
      return { ok: false, message: 'Article slug is required.', article: null };
    }

    const { data, error } = await client
      .from(WIKI_TABLE)
      .select('*')
      .eq('status', 'approved')
      .eq('slug', normalizedSlug)
      .maybeSingle();

    if (error) {
      console.warn('Could not fetch published wiki article by slug:', error.message);
      return { ok: false, message: error.message, article: null };
    }

    return { ok: true, article: data ? fromDbWikiArticle(data) : null };
  };

  // ── Roadmap Cards & Tasks ────────────────────────────────────────────────

  const fromDbRoadmapCard = (row) => ({
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    status: row.status || 'todo',
    priority: row.priority || 'medium',
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  });

  const fromDbSiteNotification = (row) => ({
    id: row.id,
    userId: row.user_id || null,
    type: row.type || 'general',
    title: row.title || '',
    message: row.message || '',
    link: row.link || '',
    metadata: row.metadata || {},
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
  });

  window.getStaffDirectory = async () => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', staff: [] };

    const { data, error } = await client.rpc('list_staff_directory');
    if (error) {
      console.warn('Could not load staff directory:', error.message);
      return { ok: false, message: error.message, staff: [] };
    }

    return {
      ok: true,
      staff: (data || []).map((row) => ({
        userId: row.user_id,
        username: row.username || '',
        role: row.role || 'player',
        avatarUrl: row.avatar_url || null,
      })),
    };
  };

  window.createSiteNotification = async ({ userId, type, title, message, link, metadata, createdBy }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const notificationId = `notice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = {
      id: notificationId,
      user_id: userId,
      type: String(type || 'general').trim() || 'general',
      title: String(title || '').trim(),
      message: String(message || '').trim(),
      link: String(link || '').trim() || null,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      created_by: createdBy || null,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('site_notifications')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.warn('Could not create notification:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, notification: fromDbSiteNotification(data) };
  };

  window.getMySiteNotifications = async () => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', notifications: [] };

    const authUid = window.getCurrentAuthUid?.() || '';
    if (!authUid) return { ok: false, message: 'Sign in required.', notifications: [] };

    const { data, error } = await client
      .from('site_notifications')
      .select('*')
      .eq('user_id', authUid)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not fetch notifications:', error.message);
      return { ok: false, message: error.message, notifications: [] };
    }

    return { ok: true, notifications: (data || []).map(fromDbSiteNotification) };
  };

  window.createRoadmapCard = async ({ title, description, status, priority, createdBy }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const cardId = `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = {
      id: cardId,
      title: String(title || '').trim(),
      description: String(description || '').trim(),
      status: ['todo', 'in_progress', 'in_review', 'done'].includes(status) ? status : 'todo',
      priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
      created_by: createdBy,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('roadmap_cards')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.warn('Could not create roadmap card:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, card: fromDbRoadmapCard(data) };
  };

  window.getRoadmapCards = async () => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', cards: [] };

    const { data, error } = await client
      .from('roadmap_cards')
      .select('*')
      .order('status', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not fetch roadmap cards:', error.message);
      return { ok: false, message: error.message, cards: [] };
    }

    return { ok: true, cards: (data || []).map(fromDbRoadmapCard) };
  };

  window.getRoadmapCardById = async (cardId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', card: null };

    const { data, error } = await client
      .from('roadmap_cards')
      .select('*')
      .eq('id', cardId)
      .maybeSingle();

    if (error) {
      console.warn('Could not fetch roadmap card:', error.message);
      return { ok: false, message: error.message, card: null };
    }

    return { ok: true, card: data ? fromDbRoadmapCard(data) : null };
  };

  window.updateRoadmapCard = async (cardId, { title, description, status, priority }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const patch = { updated_at: new Date().toISOString() };
    if (title !== undefined) patch.title = String(title || '').trim();
    if (description !== undefined) patch.description = String(description || '').trim();
    if (status !== undefined) patch.status = ['todo', 'in_progress', 'in_review', 'done'].includes(status) ? status : 'todo';
    if (priority !== undefined) patch.priority = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';

    const { data, error } = await client
      .from('roadmap_cards')
      .update(patch)
      .eq('id', cardId)
      .select('*')
      .single();

    if (error) {
      console.warn('Could not update roadmap card:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, card: fromDbRoadmapCard(data) };
  };

  window.deleteRoadmapCard = async (cardId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const { error } = await client
      .from('roadmap_cards')
      .delete()
      .eq('id', cardId);

    if (error) {
      console.warn('Could not delete roadmap card:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true };
  };

  window.createRoadmapTask = async ({ cardId, checklistId, title }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const taskId = `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = {
      id: taskId,
      card_id: cardId,
      checklist_id: checklistId || null,
      title: String(title || '').trim(),
      is_completed: false,
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    const { data, error } = await client
      .from('roadmap_card_tasks')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.warn('Could not create roadmap task:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, task: data };
  };

  window.getRoadmapTasksByCard = async (cardId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', tasks: [] };

    const { data, error } = await client
      .from('roadmap_card_tasks')
      .select('*')
      .eq('card_id', cardId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Could not fetch roadmap tasks:', error.message);
      return { ok: false, message: error.message, tasks: [] };
    }

    return { ok: true, tasks: data || [] };
  };

  window.updateRoadmapTask = async (taskId, { title, isCompleted }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const patch = {};
    if (title !== undefined) patch.title = String(title || '').trim();
    if (isCompleted !== undefined) {
      patch.is_completed = isCompleted === true;
      patch.completed_at = isCompleted ? new Date().toISOString() : null;
    }

    const { data, error } = await client
      .from('roadmap_card_tasks')
      .update(patch)
      .eq('id', taskId)
      .select('*')
      .single();

    if (error) {
      console.warn('Could not update roadmap task:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, task: data };
  };

  window.deleteRoadmapTask = async (taskId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const { error } = await client
      .from('roadmap_card_tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      console.warn('Could not delete roadmap task:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true };
  };

  window.createRoadmapChecklist = async ({ cardId, title }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const checklistId = `checklist-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = {
      id: checklistId,
      card_id: cardId,
      title: String(title || '').trim(),
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('roadmap_card_checklists')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.warn('Could not create roadmap checklist:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true, checklist: data };
  };

  window.getRoadmapChecklistsByCard = async (cardId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', checklists: [] };

    const { data, error } = await client
      .from('roadmap_card_checklists')
      .select('*')
      .eq('card_id', cardId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Could not fetch roadmap checklists:', error.message);
      return { ok: false, message: error.message, checklists: [] };
    }

    return { ok: true, checklists: data || [] };
  };

  window.deleteRoadmapChecklist = async (checklistId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const { error } = await client
      .from('roadmap_card_checklists')
      .delete()
      .eq('id', checklistId);

    if (error) {
      console.warn('Could not delete roadmap checklist:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true };
  };

  window.assignRoadmapCard = async ({ cardId, assignedTo, assignedBy }) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const assignmentId = `assign-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = {
      id: assignmentId,
      card_id: cardId,
      assigned_to: assignedTo,
      assigned_by: assignedBy,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('roadmap_card_assignments')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.warn('Could not assign roadmap card:', error.message);
      return { ok: false, message: error.message };
    }

    const cardResult = await window.getRoadmapCardById?.(cardId);
    const cardTitle = cardResult?.ok && cardResult.card?.title ? cardResult.card.title : 'Roadmap card';
    const notificationLink = `staff-portal.html?tab=roadmap&card=${encodeURIComponent(cardId)}`;
    const notificationResult = await window.createSiteNotification?.({
      userId: assignedTo,
      type: 'roadmap_assignment',
      title: 'New roadmap assignment',
      message: `You were assigned to "${cardTitle}".`,
      link: notificationLink,
      metadata: { cardId },
      createdBy: assignedBy,
    });

    if (!notificationResult?.ok) {
      console.warn('Roadmap assignment created without notification:', notificationResult?.message || 'Unknown notification error');
    }

    return { ok: true, assignment: data };
  };

  window.getRoadmapAssignmentsByCard = async (cardId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.', assignments: [] };

    const { data, error } = await client
      .from('roadmap_card_assignments')
      .select('*')
      .eq('card_id', cardId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Could not fetch roadmap assignments:', error.message);
      return { ok: false, message: error.message, assignments: [] };
    }

    return { ok: true, assignments: data || [] };
  };

  window.removeRoadmapAssignment = async (assignmentId) => {
    const client = await getClient();
    if (!client) return { ok: false, message: 'Supabase not configured.' };

    const { error } = await client
      .from('roadmap_card_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) {
      console.warn('Could not remove roadmap assignment:', error.message);
      return { ok: false, message: error.message };
    }

    return { ok: true };
  };
})();
