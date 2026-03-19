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
const ANNOUNCEMENTS_STORAGE_KEY = 'islesOfDawnAnnouncements';
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

const readAnnouncements = () => {
  try {
    const storedAnnouncements = localStorage.getItem(ANNOUNCEMENTS_STORAGE_KEY);
    const parsedAnnouncements = storedAnnouncements ? JSON.parse(storedAnnouncements) : [];

    if (!Array.isArray(parsedAnnouncements)) {
      return [];
    }

    return parsedAnnouncements.filter(
      (item) =>
        item &&
        typeof item.title === 'string' &&
        typeof item.message === 'string' &&
        (typeof item.imageDataUrl === 'string' || typeof item.imageDataUrl === 'undefined')
    );
  } catch {
    return [];
  }
};

let announcements = readAnnouncements();

const saveAnnouncements = () => {
  localStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(announcements));
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
      deleteButton.addEventListener('click', () => {
        const shouldDelete = window.confirm('Delete this announcement?');
        if (!shouldDelete) {
          return;
        }

        announcements.splice(index, 1);
        saveAnnouncements();
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

    announcements.unshift({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: titleValue,
      message: bodyValue,
      imageDataUrl,
      createdAt: new Date().toISOString()
    });

    saveAnnouncements();
    renderAnnouncements();
    announcementForm.reset();
    setAnnouncementStatus('Announcement posted!');
  });
}

if (clearAnnouncementsButton) {
  clearAnnouncementsButton.addEventListener('click', () => {
    if (!announcements.length) {
      setAnnouncementStatus('There are no announcements to clear.');
      return;
    }

    const shouldClear = window.confirm('Clear all announcements?');
    if (!shouldClear) {
      return;
    }

    announcements = [];
    saveAnnouncements();
    renderAnnouncements();
    setAnnouncementStatus('All announcements cleared.');
  });
}

renderAnnouncements();
