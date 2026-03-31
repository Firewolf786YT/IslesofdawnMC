// Dropdown for 'More' button (fix: toggle .open on .nav-dropdown)
function setupNavDropdown() {
  const dropdown = document.querySelector('.nav-dropdown');
  const dropdownBtn = dropdown?.querySelector('.nav-dropdown-btn');
  if (dropdown && dropdownBtn) {
    dropdownBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', function(e) {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  }
}

// More dropdown (click-to-open, close on outside click)
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.nav-dropdown-btn').forEach(btn => {
    const dropdown = btn.closest('.nav-dropdown');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle('open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      // Close other dropdowns
      document.querySelectorAll('.nav-dropdown').forEach(other => {
        if (other !== dropdown) other.classList.remove('open');
      });
      document.querySelectorAll('.nav-dropdown-btn[aria-expanded]')
        .forEach(otherBtn => {
          if (otherBtn !== btn) otherBtn.setAttribute('aria-expanded', 'false');
        });
    });
    // Keyboard accessibility
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        dropdown.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        btn.blur();
      }
    });
  });
  document.addEventListener('click', function () {
    document.querySelectorAll('.nav-dropdown.open').forEach(drop => drop.classList.remove('open'));
    document.querySelectorAll('.nav-dropdown-btn[aria-expanded]')
      .forEach(btn => btn.setAttribute('aria-expanded', 'false'));
  });
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupNavDropdown);
} else {
  setupNavDropdown();
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

const loadHomeAnnouncementsPreview = async () => {
  const container = document.getElementById('homeAnnouncementsList');
  if (!container) {
    return;
  }

  if (!window.isSupabaseConfigured?.()) {
    container.innerHTML = '<p class="announcement-empty">Announcements are unavailable until Supabase is configured.</p>';
    return;
  }

  const client = await window.getSupabaseClient?.();
  if (!client) {
    container.innerHTML = '<p class="announcement-empty">Could not connect to load announcements.</p>';
    return;
  }

  const { data, error } = await client
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) {
    console.warn('Could not fetch announcements:', error.message);
    container.innerHTML = '<p class="announcement-empty">Could not load announcements.</p>';
    return;
  }

  const announcements = data || [];
  if (!announcements.length) {
    container.innerHTML = '<p class="announcement-empty">No announcements yet. Check back soon!</p>';
    return;
  }

  container.innerHTML = '';
  announcements.forEach((announcement) => {
    const item = document.createElement('article');
    item.className = 'home-announcement-item card';

    const title = String(announcement.title || 'Announcement').trim();
    const message = String(announcement.message || '').trim();
    const imageUrl = announcement.image_data_url || '';

    const createdDate = announcement.created_at 
      ? new Date(announcement.created_at).toLocaleDateString()
      : 'Recently';

    let html = `
      <div class="home-announcement-header">
        <h3>${escapeHtml(title)}</h3>
        <span class="home-announcement-date">${escapeHtml(createdDate)}</span>
      </div>
    `;

    if (imageUrl) {
      html += `<img class="home-announcement-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" loading="lazy" />`;
    }

    html += `<p class="home-announcement-message">${escapeHtml(message.substring(0, 150))}${message.length > 150 ? '...' : ''}</p>`;

    item.innerHTML = html;
    container.appendChild(item);
  });
};

const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const renderTestimonials = () => {
  const container = document.getElementById('testimonialsList');
  if (!container) {
    return;
  }

  // Placeholder for future testimonials
  container.innerHTML = '<p class="announcement-empty">Testimonials coming soon! Share your IslesOfDawnMC experience.</p>';
};

(async () => {
  await loadMeetStaff();
  await loadHomeAnnouncementsPreview();
  renderTestimonials();
})();
