// Highlight the nav link matching the current page
(function () {
  const currentFile = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach((link) => {
    const linkFile = link.getAttribute('href').split('/').pop().split('#')[0] || 'index.html';
    const isStaffModulePage = currentFile === 'staff.html' || currentFile === 'staff-announcements.html' || currentFile === 'staff-applications.html' || currentFile === 'staff-appeals.html';
    const isStaffNavLink = linkFile === 'staff.html';
    if (linkFile === currentFile || (isStaffModulePage && isStaffNavLink)) {
      link.classList.add('nav-active');
    }
  });
})();

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
const ANNOUNCEMENTS_TABLE = 'announcements';
const MAX_ANNOUNCEMENT_IMAGE_BYTES = 4 * 1024 * 1024;

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
