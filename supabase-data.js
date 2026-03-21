// =============================================================================
// supabase-data.js — normalized Supabase table helpers for site data
// Supabase-only mode (no localStorage fallback for data source-of-truth)
// =============================================================================

(() => {
  const TABLES = {
    applicationStatuses: 'application_statuses',
    applicationSubmissions: 'application_submissions',
    appealSubmissions: 'appeal_submissions',
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
})();
