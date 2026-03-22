// Ensure Wiki link appears in top nav across pages
(function () {
  document.querySelectorAll('.nav-links').forEach((nav) => {
    const hasWiki = Array.from(nav.querySelectorAll('a')).some((link) => {
      const href = String(link.getAttribute('href') || '').split('#')[0].split('?')[0];
      return href === 'wiki.html';
    });
    if (hasWiki) return;

    const wikiLink = document.createElement('a');
    wikiLink.href = 'wiki.html';
    wikiLink.textContent = 'Wiki';

    const storeLink = Array.from(nav.querySelectorAll('a')).find((link) => {
      const href = String(link.getAttribute('href') || '');
      return href.includes('tebex.io');
    });

    if (storeLink) {
      nav.insertBefore(wikiLink, storeLink);
    } else {
      nav.appendChild(wikiLink);
    }
  });
})();

// Highlight the nav link matching the current page
(function () {
  const currentFile = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach((link) => {
    const linkFile = link.getAttribute('href').split('/').pop().split('#')[0] || 'index.html';
    const isStaffModulePage = currentFile === 'staff.html' || currentFile === 'staff-portal.html' || currentFile === 'staff-announcements.html' || currentFile === 'staff-applications.html' || currentFile === 'staff-application-review.html' || currentFile === 'staff-appeals.html' || currentFile === 'staff-hr.html' || currentFile === 'staff-hr-file.html';
    const isStaffNavLink = linkFile === 'staff.html';
    if (linkFile === currentFile || (isStaffModulePage && isStaffNavLink)) {
      link.classList.add('nav-active');
    }
  });
})();

window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  window.location.reload();
});

window.renderWikiContentToHtml = (rawContent) => {
  const value = String(rawContent || '');
  const escapeHtml = (text) => String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const imageTokenPattern = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;
  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = imageTokenPattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: value.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'image',
      alt: match[1] || 'Wiki image',
      src: match[2] || '',
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    segments.push({ type: 'text', value: value.slice(lastIndex) });
  }

  if (!segments.length) {
    segments.push({ type: 'text', value });
  }

  const textToHtml = (text) => {
    const escaped = escapeHtml(text || '');
    if (!escaped.trim()) return '';
    const paragraphHtml = escaped
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('');
    return paragraphHtml;
  };

  return segments.map((segment) => {
    if (segment.type === 'image') {
      const safeSrc = escapeHtml(segment.src);
      const safeAlt = escapeHtml(segment.alt || 'Wiki image');
      return `<figure class="wiki-content-image-wrap"><img class="wiki-content-image" src="${safeSrc}" alt="${safeAlt}" loading="lazy" /></figure>`;
    }
    return textToHtml(segment.value);
  }).join('');
};

const copyButton = document.getElementById('copyIpButton');
const serverIp = document.getElementById('serverIp');
const copyMessage = document.getElementById('copyMessage');
const yearSpan = document.getElementById('year');
const announcementForm = document.getElementById('announcementForm');
const announcementTitle = document.getElementById('announcementTitle');
const announcementBody = document.getElementById('announcementBody');
const announcementImage = document.getElementById('announcementImage');
const announcementList = document.getElementById('announcementList');
const announcementStatus = document.getElementById('announcementStatus');
const clearAnnouncementsButton = document.getElementById('clearAnnouncementsButton');
const meetStaffStatus = document.getElementById('meetStaffStatus');
const meetStaffPyramid = document.getElementById('meetStaffPyramid');
const ANNOUNCEMENTS_TABLE = 'announcements';
const MAX_ANNOUNCEMENT_IMAGE_BYTES = 4 * 1024 * 1024;
const STAFF_PYRAMID_ROLES = ['owner', 'manager', 'admin', 'developer', 'moderator', 'helper', 'qa_tester', 'media', 'event_team', 'builder'];

if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}

if (copyButton && serverIp && copyMessage) {
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(serverIp.textContent.trim());
      copyMessage.textContent = 'Server IP copied!';
    } catch {
      copyMessage.textContent = 'Could not copy automatically. Please copy it manually.';
    }

    window.clearTimeout(copyButton._messageTimer);
    copyButton._messageTimer = window.setTimeout(() => {
      copyMessage.textContent = '';
    }, 2500);
  });
}

let announcements = [];

const getSupabaseAnnouncementsClient = async () => {
  if (typeof window.getSupabaseClient !== 'function') {
    return null;
  }

  try {
    return await window.getSupabaseClient();
  } catch {
    return null;
  }
};

const mapAnnouncementFromDb = (row) => ({
  id: row.id,
  title: row.title,
  message: row.message,
  imageDataUrl: row.image_data_url || null,
  createdAt: row.created_at || new Date().toISOString(),
});

const mapAnnouncementToDb = (item) => ({
  id: item.id,
  title: item.title,
  message: item.message,
  image_data_url: item.imageDataUrl || null,
  created_at: item.createdAt || new Date().toISOString(),
});

const syncAnnouncementsFromSupabase = async () => {
  const client = await getSupabaseAnnouncementsClient();
  if (!client) return false;

  const { data, error } = await client
    .from(ANNOUNCEMENTS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Could not load announcements from Supabase:', error.message);
    return false;
  }

  announcements = (data || []).map(mapAnnouncementFromDb);
  return true;
};

const insertAnnouncementSupabase = async (item) => {
  const client = await getSupabaseAnnouncementsClient();
  if (!client) return false;

  const { error } = await client
    .from(ANNOUNCEMENTS_TABLE)
    .upsert([mapAnnouncementToDb(item)], { onConflict: 'id' });

  if (error) {
    console.warn('Could not save announcement to Supabase:', error.message);
    return false;
  }

  return true;
};

const deleteAnnouncementSupabase = async (announcementId) => {
  const client = await getSupabaseAnnouncementsClient();
  if (!client) return false;

  const { error } = await client
    .from(ANNOUNCEMENTS_TABLE)
    .delete()
    .eq('id', announcementId);

  if (error) {
    console.warn('Could not delete announcement from Supabase:', error.message);
    return false;
  }

  return true;
};

const clearAnnouncementsSupabase = async () => {
  const client = await getSupabaseAnnouncementsClient();
  if (!client) return false;

  const { error } = await client
    .from(ANNOUNCEMENTS_TABLE)
    .delete()
    .not('id', 'is', null);

  if (error) {
    console.warn('Could not clear announcements in Supabase:', error.message);
    return false;
  }

  return true;
};

const buildStaffRankBuckets = (rows) => {
  const buckets = new Map(STAFF_PYRAMID_ROLES.map((role) => [role, []]));
  (rows || []).forEach((row) => {
    const role = String(row?.role || '').toLowerCase();
    const username = String(row?.username || '').trim();
    if (!buckets.has(role) || !username) {
      return;
    }

    buckets.get(role).push({ username, avatarUrl: row?.avatar_url || null });
  });

  STAFF_PYRAMID_ROLES.forEach((role) => {
    buckets.get(role).sort((a, b) => a.username.localeCompare(b.username));
  });

  return buckets;
};

const createStaffCard = (member, role) => {
  const name = member.username;
  const initial = (name[0] || '?').toUpperCase();
  const pillClass = window.getRolePillClass?.(role) || `role-pill role-pill-${role}`;
  const roleLabel = window.getRoleLabel?.(role) || role;

  const card = document.createElement('article');
  card.className = `meet-staff-card meet-staff-card-${role}`;

  const avatarWrap = document.createElement('div');
  avatarWrap.className = `meet-staff-avatar meet-staff-avatar-${role}`;
  avatarWrap.setAttribute('aria-hidden', 'true');

  if (member.avatarUrl) {
    const img = document.createElement('img');
    img.src = member.avatarUrl;
    img.alt = '';
    img.className = 'meet-staff-avatar-img';
    img.onerror = () => {
      // Fall back to initials if image fails to load
      avatarWrap.removeChild(img);
      avatarWrap.textContent = initial;
    };
    avatarWrap.appendChild(img);
  } else {
    avatarWrap.textContent = initial;
  }

  const info = document.createElement('div');
  info.className = 'meet-staff-card-info';

  const username = document.createElement('strong');
  username.className = 'meet-staff-card-name';
  username.textContent = name;

  const pill = document.createElement('span');
  pill.className = pillClass;
  pill.textContent = roleLabel;

  info.append(username, pill);
  card.append(avatarWrap, info);
  return card;
};

const createStaffGroup = (role, members) => {
  const group = document.createElement('section');
  group.className = 'meet-staff-group';

  const grid = document.createElement('div');
  grid.className = 'meet-staff-cards';
  members.forEach((member) => grid.appendChild(createStaffCard(member, role)));

  group.append(grid);
  return group;
};

const renderMeetStaffPyramid = (rows) => {
  if (!meetStaffPyramid) {
    return;
  }

  const buckets = buildStaffRankBuckets(rows);
  const tiers = STAFF_PYRAMID_ROLES
    .map((role) => ({ role, members: buckets.get(role) || [] }))
    .filter((tier) => tier.members.length > 0);

  meetStaffPyramid.innerHTML = '';

  if (!tiers.length) {
    const empty = document.createElement('p');
    empty.className = 'announcement-empty';
    empty.textContent = 'No staff members are listed yet.';
    meetStaffPyramid.appendChild(empty);
    return;
  }

  tiers.forEach(({ role, members }) => {
    meetStaffPyramid.appendChild(createStaffGroup(role, members));
  });
};

const loadMeetStaff = async () => {
  if (!meetStaffPyramid || !meetStaffStatus) {
    return;
  }

  if (!window.isSupabaseConfigured?.()) {
    meetStaffStatus.textContent = 'Staff roster is unavailable until Supabase is configured.';
    meetStaffPyramid.innerHTML = '';
    return;
  }

  const client = await window.getSupabaseClient?.();
  if (!client) {
    meetStaffStatus.textContent = 'Could not connect to Supabase to load the staff roster.';
    meetStaffPyramid.innerHTML = '';
    return;
  }

  const { data, error } = await client.rpc('list_public_staff_members');
  if (error) {
    meetStaffStatus.textContent = 'Could not load staff roster yet. Run the latest Supabase migration to enable it.';
    meetStaffPyramid.innerHTML = '';
    return;
  }

  renderMeetStaffPyramid(Array.isArray(data) ? data : []);
  meetStaffStatus.textContent = 'Live staff roster by rank.';
};

const setAnnouncementStatus = (message) => {
  if (!announcementStatus) {
    return;
  }

  announcementStatus.textContent = message;
  window.clearTimeout(setAnnouncementStatus._timer);
  setAnnouncementStatus._timer = window.setTimeout(() => {
    announcementStatus.textContent = '';
  }, 2500);
};

const readAnnouncementImage = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select an image file.'));
      return;
    }

    if (file.size > MAX_ANNOUNCEMENT_IMAGE_BYTES) {
      reject(new Error('Image must be 4 MB or smaller.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });

const renderAnnouncements = () => {
  if (!announcementList) {
    return;
  }

  const isAnnouncementManager = Boolean(announcementForm && clearAnnouncementsButton);

  announcementList.innerHTML = '';

  if (!announcements.length) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'announcement-empty';
    emptyMessage.textContent = 'No announcements yet. Post your first update.';
    announcementList.appendChild(emptyMessage);
    return;
  }

  announcements.forEach((announcement, index) => {
    const article = document.createElement('article');
    article.className = 'announcement-item';

    const title = document.createElement('h4');
    title.textContent = announcement.title;

    const meta = document.createElement('p');
    meta.className = 'announcement-meta';

    const createdDate = new Date(announcement.createdAt);
    meta.textContent = Number.isNaN(createdDate.getTime())
      ? 'Posted recently'
      : `Posted ${createdDate.toLocaleString()}`;

    const body = document.createElement('p');
    body.textContent = announcement.message;

    article.append(title, meta, body);

    if (announcement.imageDataUrl) {
      const image = document.createElement('img');
      image.className = 'announcement-image';
      image.src = announcement.imageDataUrl;
      image.alt = `${announcement.title} attachment`;
      image.loading = 'lazy';
      article.appendChild(image);
    }

    if (isAnnouncementManager) {
      const actions = document.createElement('div');
      actions.className = 'announcement-item-actions';

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn-announcement-delete';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', async () => {
        const shouldDelete = window.confirm('Delete this announcement?');
        if (!shouldDelete) {
          return;
        }

        const ok = await deleteAnnouncementSupabase(announcement.id);
        if (!ok) {
          setAnnouncementStatus('Could not delete announcement from Supabase.');
          return;
        }

        await syncAnnouncementsFromSupabase();
        renderAnnouncements();
        setAnnouncementStatus('Announcement deleted.');
      });

      actions.appendChild(deleteButton);
      article.appendChild(actions);
    }

    announcementList.appendChild(article);
  });
};

if (announcementForm && announcementTitle && announcementBody) {
  announcementForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const titleValue = announcementTitle.value.trim();
    const bodyValue = announcementBody.value.trim();

    if (!titleValue || !bodyValue) {
      setAnnouncementStatus('Please fill in both title and message.');
      return;
    }

    let imageDataUrl = null;
    try {
      const file = announcementImage?.files?.[0] || null;
      imageDataUrl = await readAnnouncementImage(file);
    } catch (error) {
      setAnnouncementStatus(error instanceof Error ? error.message : 'Image upload failed.');
      return;
    }

    const newAnnouncement = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: titleValue,
      message: bodyValue,
      imageDataUrl,
      createdAt: new Date().toISOString()
    };

    const ok = await insertAnnouncementSupabase(newAnnouncement);
    if (!ok) {
      setAnnouncementStatus('Could not post announcement to Supabase.');
      return;
    }

    await syncAnnouncementsFromSupabase();
    renderAnnouncements();

    announcementForm.reset();
    setAnnouncementStatus('Announcement posted!');
  });
}

if (clearAnnouncementsButton) {
  clearAnnouncementsButton.addEventListener('click', async () => {
    if (!announcements.length) {
      setAnnouncementStatus('There are no announcements to clear.');
      return;
    }

    const shouldClear = window.confirm('Clear all announcements?');
    if (!shouldClear) {
      return;
    }

    const ok = await clearAnnouncementsSupabase();
    if (!ok) {
      setAnnouncementStatus('Could not clear announcements in Supabase.');
      return;
    }

    announcements = [];
    renderAnnouncements();
    setAnnouncementStatus('All announcements cleared.');
  });
}

(async () => {
  const hasAnnouncementsUi = Boolean(announcementList || announcementForm || clearAnnouncementsButton);
  if (!hasAnnouncementsUi) {
    return;
  }

  if (!window.isSupabaseConfigured?.()) {
    if (announcementList) {
      announcementList.innerHTML = '<p class="announcement-empty">Announcements are unavailable until Supabase is configured.</p>';
    }
    if (announcementStatus) {
      setAnnouncementStatus('Supabase is not configured.');
    }
    return;
  }

  await syncAnnouncementsFromSupabase();
  renderAnnouncements();
})();

(async () => {
  await loadMeetStaff();
})();
