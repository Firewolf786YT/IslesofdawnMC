function setupNavDropdowns() {
  const dropdowns = Array.from(document.querySelectorAll('.nav-dropdown'));
  if (!dropdowns.length) {
    return;
  }

  const closeDropdown = (dropdown) => {
    dropdown.classList.remove('open');
    const button = dropdown.querySelector('.nav-dropdown-btn');
    if (button) {
      button.setAttribute('aria-expanded', 'false');
    }
  };

  const closeAllDropdowns = () => {
    dropdowns.forEach(closeDropdown);
  };

  dropdowns.forEach((dropdown) => {
    const button = dropdown.querySelector('.nav-dropdown-btn');
    if (!button) {
      return;
    }

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = !dropdown.classList.contains('open');
      closeAllDropdowns();
      if (willOpen) {
        dropdown.classList.add('open');
        button.setAttribute('aria-expanded', 'true');
      }
    });

    button.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeDropdown(dropdown);
        button.blur();
      }
    });
  });

  document.addEventListener('click', () => {
    closeAllDropdowns();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupNavDropdowns);
} else {
  setupNavDropdowns();
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

// Dynamically load and render the staff roster on the homepage
async function loadMeetStaff() {
  const statusEl = document.getElementById('meetStaffStatus');
  const pyramidEl = document.getElementById('meetStaffPyramid');
  if (!statusEl || !pyramidEl) return;

  statusEl.textContent = 'Loading staff roster…';
  pyramidEl.innerHTML = '';

  if (!window.isSupabaseConfigured?.()) {
    statusEl.textContent = 'Staff roster unavailable until Supabase is configured.';
    return;
  }

  const result = await window.getStaffFiles?.();
  if (!result?.ok) {
    statusEl.textContent = 'Could not load staff roster.';
    return;
  }
  // Only show active staff
  const staff = (result.files || []).filter(member => member.isActive);
  if (!staff.length) {
    statusEl.textContent = 'No staff found.';
    return;
  }

  // Group staff by assignedRole (rank), descending order (Owner, Manager, Admin, etc.)
  const RANK_ORDER = [
    'owner', 'manager', 'admin', 'developer', 'moderator', 'helper', 'qa_tester', 'media', 'event_team', 'builder'
  ];
  const grouped = {};
  staff.forEach(member => {
    const role = String(member.assignedRole || 'other').toLowerCase();
    if (!grouped[role]) grouped[role] = [];
    grouped[role].push(member);
  });

  let rendered = false;
  RANK_ORDER.forEach(rank => {
    const members = grouped[rank];
    if (members && members.length) {
      rendered = true;
      const groupDiv = document.createElement('div');
      groupDiv.className = 'meet-staff-group';
      const label = document.createElement('h3');
      label.className = 'staff-rank-label';
      label.textContent = rank.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      groupDiv.appendChild(label);
      const cardsRow = document.createElement('div');
      cardsRow.className = 'meet-staff-cards';
      members.forEach(member => {
        const card = document.createElement('div');
        card.className = 'meet-staff-card';
        // Avatar circle with color by rank
        const avatar = document.createElement('div');
        avatar.className = `meet-staff-avatar meet-staff-avatar-${rank}`;
        avatar.textContent = (member.minecraftUsername || '?').charAt(0).toUpperCase();
        card.appendChild(avatar);
        // Info block
        const info = document.createElement('div');
        info.className = 'meet-staff-card-info';
        // Username
        const name = document.createElement('div');
        name.className = 'meet-staff-card-name';
        name.textContent = member.minecraftUsername || 'Unknown';
        info.appendChild(name);
        card.appendChild(info);
        cardsRow.appendChild(card);
      });
      groupDiv.appendChild(cardsRow);
      pyramidEl.appendChild(groupDiv);
    }
  });

  if (!rendered) {
    statusEl.textContent = 'No staff found.';
    return;
  }
  statusEl.textContent = '';
}
