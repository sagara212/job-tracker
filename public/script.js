/* ============================================================
   JOB TRACKER — SCRIPT.JS (v2 — with 5 advanced features)
   Vanilla JS ES6+ | LocalStorage | SheetJS (Excel)
   Features: Notifications, Labels, Excel Import/Export, Kanban, Timeline
   ============================================================ */

'use strict';

/* ──────────────────────────────────────────────────────────
   1. CONSTANTS & CONFIG
────────────────────────────────────────────────────────── */

const STORAGE_KEY  = 'jobTracker_v1';
const LABELS_KEY   = 'jobTracker_labels';
const THEME_KEY    = 'jobTracker_theme';
const NOTIF_KEY    = 'jobTracker_notif';
const SHEETS_KEY   = 'jobTracker_sheetsUrl';  // Google Apps Script Web App URL

/** Status → CSS badge class */
const STATUS_CLASS = {
  'Applied': 'applied',
  'No Response': 'no-response',
  'Interview': 'interview',
  'Ditolak': 'ditolak',
  'Alhamdulillah': 'alhamdulillah',
};

/** Status → emoji icon */
const STATUS_ICON = {
  'Applied': '📩',
  'No Response': '😶',
  'Interview': '🎤',
  'Ditolak': '❌',
  'Alhamdulillah': '🎉',
};

/** All kanban columns in order */
const KANBAN_STATUSES = ['Applied', 'No Response', 'Interview', 'Ditolak', 'Alhamdulillah'];

/** Priority → sort weight */
const PRIORITY_WEIGHT = { High: 3, Medium: 2, Low: 1 };

/** Excel/CSV headers expected for import (column names, case-insensitive) */
const EXCEL_IMPORT_MAP = {
  'perusahaan': 'company',
  'posisi': 'position',
  'employment type': 'employmentType',
  'job type': 'jobType',
  'lokasi': 'location',
  'tanggal apply': 'applyDate',
  'gaji': 'salary',
  'priority': 'priority',
  'status': 'status',
  'link': 'applyLink',
  'requirements': 'requirements',
  'catatan': 'notes',
};

/* ──────────────────────────────────────────────────────────
   2. APPLICATION STATE
────────────────────────────────────────────────────────── */

const state = {
  jobs: [],       // all job data
  filtered: [],       // filtered/sorted result
  labels: [],       // custom labels: [{id, name, color}]
  viewMode: 'card',   // 'card' | 'table' | 'kanban' | 'timeline'
  theme: 'dark',
  notifEnabled: false,
  filters: { status: '', priority: '', type: '', jobType: '', search: '' },
  sort: 'date-desc',
  pendingDeleteId: null,
  draggedJobId: null,     // for kanban drag-and-drop
};

/* ──────────────────────────────────────────────────────────
   3. LOCALSTORAGE HELPERS
────────────────────────────────────────────────────────── */

function loadFromStorage() { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : []; } catch { return []; } }
function saveToStorage(j) { localStorage.setItem(STORAGE_KEY, JSON.stringify(j)); }
function loadLabels() { try { const r = localStorage.getItem(LABELS_KEY); return r ? JSON.parse(r) : []; } catch { return []; } }
function saveLabels(labels) { localStorage.setItem(LABELS_KEY, JSON.stringify(labels)); }

/* ──────────────────────────────────────────────────────────
   4. ID GENERATOR
────────────────────────────────────────────────────────── */

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ──────────────────────────────────────────────────────────
   5. FILTER & SORT
────────────────────────────────────────────────────────── */

function applyFiltersAndSort() {
  const { status, priority, type, jobType, search } = state.filters;
  const q = search.toLowerCase().trim();

  let result = state.jobs.filter(job => {
    if (status && job.status !== status) return false;
    if (priority && job.priority !== priority) return false;
    if (type && job.employmentType !== type) return false;
    if (jobType && job.jobType !== jobType) return false;
    if (q && !job.company.toLowerCase().includes(q) && !job.position.toLowerCase().includes(q)) return false;
    return true;
  });

  result.sort((a, b) => {
    switch (state.sort) {
      case 'date-desc': return new Date(b.applyDate) - new Date(a.applyDate);
      case 'date-asc': return new Date(a.applyDate) - new Date(b.applyDate);
      case 'priority-desc': return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      case 'priority-asc': return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      case 'company-asc': return a.company.localeCompare(b.company);
      default: return 0;
    }
  });

  state.filtered = result;
}

/* ──────────────────────────────────────────────────────────
   6. DASHBOARD STATS
────────────────────────────────────────────────────────── */

function updateStats() {
  const jobs = state.jobs;
  const total = jobs.length;
  const interview = jobs.filter(j => j.status === 'Interview').length;
  const accepted = jobs.filter(j => j.status === 'Alhamdulillah').length;
  const rejected = jobs.filter(j => j.status === 'Ditolak').length;
  const resolved = accepted + rejected;
  const rate = resolved > 0 ? Math.round((accepted / resolved) * 100) : 0;

  document.getElementById('valTotal').textContent = total;
  document.getElementById('valInterview').textContent = interview;
  document.getElementById('valAccepted').textContent = accepted;
  document.getElementById('valRejected').textContent = rejected;
  document.getElementById('valRate').textContent = rate + '%';
  document.getElementById('progressFill').style.width = rate + '%';
}

/* ──────────────────────────────────────────────────────────
   7. RENDER — CARD VIEW
────────────────────────────────────────────────────────── */

function getJobLabelBadges(job) {
  if (!job.labelIds || !job.labelIds.length) return '';
  return job.labelIds.map(lid => {
    const label = state.labels.find(l => l.id === lid);
    if (!label) return '';
    const textColor = getContrastColor(label.color);
    return `<span class="badge badge--label" style="background:${label.color};color:${textColor}">${escapeHTML(label.name)}</span>`;
  }).join('');
}

function createCardHTML(job) {
  const statusClass = STATUS_CLASS[job.status] || 'applied';
  const statusIcon = STATUS_ICON[job.status] || '📩';
  const dateStr = job.applyDate ? formatDate(job.applyDate) : '-';
  const labelBadges = getJobLabelBadges(job);
  const jobTypeBadge = job.jobType ? `<span class="badge badge--date">🏢 ${escapeHTML(job.jobType)}</span>` : '';

  return `
    <article class="job-card" data-id="${job.id}" data-priority="${job.priority}" tabindex="0" aria-label="${job.company} – ${job.position}">
      <div class="job-card__header">
        <div>
          <p class="job-card__company">${escapeHTML(job.company)}</p>
          <p class="job-card__position">${escapeHTML(job.position)}</p>
        </div>
        <span class="badge badge--${statusClass}">${statusIcon} ${job.status}</span>
      </div>
      <div class="job-card__meta">
        <span class="badge badge--type">${job.employmentType}</span>
        ${jobTypeBadge}
        <span class="badge badge--${job.priority.toLowerCase()}">${job.priority}</span>
        ${job.location ? `<span class="badge badge--date">📍 ${escapeHTML(job.location)}</span>` : ''}
        <span class="badge badge--date">🗓 ${dateStr}</span>
        ${job.interviewDate ? `<span class="badge badge--interview">🎤 ${formatDate(job.interviewDate)}</span>` : ''}
      </div>
      ${labelBadges ? `<div class="job-card__labels">${labelBadges}</div>` : ''}
      ${job.salary ? `<p class="text-muted" style="font-size:12px">💰 ${escapeHTML(job.salary)}</p>` : ''}
      <div class="job-card__actions">
        <button class="btn btn--ghost" style="flex:1;font-size:12px" data-action="detail" data-id="${job.id}">👁 Detail</button>
        <button class="btn btn--outline" style="flex:1;font-size:12px" data-action="edit" data-id="${job.id}">✏️ Edit</button>
        <button class="btn-icon" style="color:var(--danger);border-color:var(--danger)" data-action="delete" data-id="${job.id}" title="Hapus">🗑</button>
      </div>
    </article>
  `;
}

function renderCards() {
  document.getElementById('cardGrid').innerHTML = state.filtered.map(createCardHTML).join('');
}

/* ──────────────────────────────────────────────────────────
   8. RENDER — TABLE VIEW
────────────────────────────────────────────────────────── */

function renderTable() {
  const tbody = document.getElementById('jobTableBody');
  if (!state.filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px">Tidak ada data</td></tr>`;
    return;
  }
  tbody.innerHTML = state.filtered.map(job => {
    const sc = STATUS_CLASS[job.status] || 'applied';
    const si = STATUS_ICON[job.status] || '📩';
    return `
      <tr data-id="${job.id}">
        <td class="col-company">${escapeHTML(job.company)}</td>
        <td class="col-position">${escapeHTML(job.position)}</td>
        <td><span class="badge badge--type">${job.employmentType}</span></td>
        <td>${formatDate(job.applyDate) || '–'}</td>
        <td><span class="badge badge--${job.priority.toLowerCase()}">${job.priority}</span></td>
        <td><span class="badge badge--${sc}">${si} ${job.status}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn-icon" data-action="detail" data-id="${job.id}" title="Detail">👁</button>
            <button class="btn-icon" data-action="edit"   data-id="${job.id}" title="Edit">✏️</button>
            <button class="btn-icon" style="color:var(--danger);border-color:var(--danger)" data-action="delete" data-id="${job.id}" title="Hapus">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/* ──────────────────────────────────────────────────────────
   9. RENDER — KANBAN VIEW (Feature 4)
────────────────────────────────────────────────────────── */

function createKanbanCardHTML(job) {
  const labelBadges = getJobLabelBadges(job);
  return `
    <div class="kanban-card" draggable="true" data-id="${job.id}" data-priority="${job.priority}">
      <p class="kanban-card__company">${escapeHTML(job.company)}</p>
      <p class="kanban-card__position">${escapeHTML(job.position)}</p>
      <div class="kanban-card__meta">
        <span class="badge badge--${job.priority.toLowerCase()}" style="font-size:10px">${job.priority}</span>
        ${job.location ? `<span class="badge badge--date" style="font-size:10px">📍 ${escapeHTML(job.location)}</span>` : ''}
        ${labelBadges}
      </div>
    </div>
  `;
}

function renderKanban() {
  const board = document.getElementById('kanbanBoard');

  // Group jobs by status; apply global filter (except status) for search/priority/type
  const { priority, type, search } = state.filters;
  const q = search.toLowerCase().trim();

  const matchesFilter = job => {
    if (priority && job.priority !== priority) return false;
    if (type && job.employmentType !== type) return false;
    if (q && !job.company.toLowerCase().includes(q) && !job.position.toLowerCase().includes(q)) return false;
    return true;
  };

  const columns = KANBAN_STATUSES.map(status => {
    const jobs = state.jobs.filter(j => j.status === status && matchesFilter(j));
    return { status, jobs };
  });

  board.innerHTML = columns.map(({ status, jobs }) => `
    <div class="kanban-col" data-status="${status}">
      <div class="kanban-col__header">
        <span class="kanban-col__title">${STATUS_ICON[status]} ${status}</span>
        <span class="kanban-col__count">${jobs.length}</span>
      </div>
      <div class="kanban-col__body" data-drop-status="${status}">
        ${jobs.length ? jobs.map(createKanbanCardHTML).join('') : '<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:12px">Kosong</p>'}
      </div>
    </div>
  `).join('');

  // Attach drag-and-drop events after rendering
  setupKanbanDnD();
}

/* ── Kanban Drag-and-Drop using native HTML5 API ── */
function setupKanbanDnD() {
  const board = document.getElementById('kanbanBoard');

  // Drag start: record which card is being dragged
  board.addEventListener('dragstart', e => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    state.draggedJobId = card.dataset.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  board.addEventListener('dragend', e => {
    const card = e.target.closest('.kanban-card');
    if (card) card.classList.remove('dragging');
    // Remove all drag-over highlights
    board.querySelectorAll('.kanban-col--drag-over').forEach(col => col.classList.remove('kanban-col--drag-over'));
  });

  // Drag over column body → highlight column
  board.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const col = e.target.closest('.kanban-col');
    if (!col) return;
    board.querySelectorAll('.kanban-col--drag-over').forEach(c => c.classList.remove('kanban-col--drag-over'));
    col.classList.add('kanban-col--drag-over');
  });

  board.addEventListener('dragleave', e => {
    const col = e.target.closest('.kanban-col');
    if (!col || col.contains(e.relatedTarget)) return;
    col.classList.remove('kanban-col--drag-over');
  });

  // Drop: update job status
  board.addEventListener('drop', e => {
    e.preventDefault();
    const col = e.target.closest('.kanban-col');
    if (!col || !state.draggedJobId) return;
    col.classList.remove('kanban-col--drag-over');

    const newStatus = col.dataset.status;
    if (!newStatus || !KANBAN_STATUSES.includes(newStatus)) return;

    const job = state.jobs.find(j => j.id === state.draggedJobId);
    if (!job || job.status === newStatus) return;

    job.status = newStatus;
    job.updatedAt = new Date().toISOString();
    saveToStorage(state.jobs);
    renderKanban();   // re-render board only (fast)
    updateStats();
    showToast(`Status dipindah ke "${newStatus}" 🔄`, 'success');
    state.draggedJobId = null;
  });

  // Click on kanban card → detail
  board.addEventListener('click', e => {
    const card = e.target.closest('.kanban-card');
    if (card && !e.target.closest('[data-action]')) openDetailModal(card.dataset.id);
  });
}

/* ──────────────────────────────────────────────────────────
   10. RENDER — TIMELINE VIEW (Feature 5)
────────────────────────────────────────────────────────── */

function createTimelineItemHTML(job, idx) {
  const sc = STATUS_CLASS[job.status] || 'applied';
  const si = STATUS_ICON[job.status] || '📩';
  const animDelay = `animation-delay:${idx * 60}ms`;
  const labelBadges = getJobLabelBadges(job);

  return `
    <div class="timeline-item" data-id="${job.id}" data-priority="${job.priority}" style="${animDelay}">
      <div class="timeline-dot">${si}</div>
      <div class="timeline-content" data-action="detail" data-id="${job.id}">
        <div class="timeline-content__header">
          <div>
            <p class="timeline-content__company">${escapeHTML(job.company)}</p>
            <p class="timeline-content__position">${escapeHTML(job.position)}</p>
          </div>
          <span class="timeline-content__date">🗓 ${formatDate(job.applyDate) || '–'}</span>
        </div>
        <div class="timeline-content__badges">
          <span class="badge badge--${sc}">${si} ${job.status}</span>
          <span class="badge badge--${job.priority.toLowerCase()}">${job.priority}</span>
          <span class="badge badge--type">${job.employmentType}</span>
          ${job.interviewDate ? `<span class="badge badge--interview">🎤 ${formatDate(job.interviewDate)}</span>` : ''}
          ${labelBadges}
        </div>
      </div>
    </div>
  `;
}

function renderTimeline() {
  const container = document.getElementById('timelineView');
  applyFiltersAndSort();
  const jobs = state.filtered;

  if (!jobs.length) {
    container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:40px">Tidak ada data</p>`;
    return;
  }

  // Group by "MMMM YYYY" month
  const groups = {};
  jobs.forEach(job => {
    if (!job.applyDate) return;
    const d = new Date(job.applyDate + 'T00:00:00');
    const key = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(job);
  });

  let globalIdx = 0;
  container.innerHTML = Object.entries(groups).map(([month, monthJobs]) => {
    const items = monthJobs.map(job => createTimelineItemHTML(job, globalIdx++)).join('');
    return `
      <div class="timeline-month">
        <div class="timeline-month__header">
          📅 ${month}
          <span class="timeline-month__count">${monthJobs.length} lamaran</span>
        </div>
        <div class="timeline-items">${items}</div>
      </div>
    `;
  }).join('');

  // Click on timeline content → detail
  container.querySelectorAll('.timeline-content').forEach(el => {
    el.addEventListener('click', () => openDetailModal(el.dataset.id));
  });
}

/* ──────────────────────────────────────────────────────────
   11. MASTER RENDER
────────────────────────────────────────────────────────── */

function render() {
  applyFiltersAndSort();
  updateStats();

  const loading = document.getElementById('loadingState');
  const empty = document.getElementById('emptyState');
  const cardGrid = document.getElementById('cardGrid');
  const tableWrp = document.getElementById('tableWrapper');
  const kanban = document.getElementById('kanbanBoard');
  const timeline = document.getElementById('timelineView');

  loading.classList.add('hidden');

  // Kanban and timeline always show even if filter is empty (handled internally)
  const isKanban = state.viewMode === 'kanban';
  const isTimeline = state.viewMode === 'timeline';
  const isEmpty = state.filtered.length === 0;

  // Hide all containers first
  [cardGrid, tableWrp, kanban, timeline, empty].forEach(el => el.classList.add('hidden'));

  if (isKanban) {
    kanban.classList.remove('hidden');
    renderKanban();
  } else if (isTimeline) {
    timeline.classList.remove('hidden');
    renderTimeline();
  } else if (isEmpty) {
    empty.classList.remove('hidden');
  } else if (state.viewMode === 'card') {
    cardGrid.classList.remove('hidden');
    renderCards();
  } else {
    tableWrp.classList.remove('hidden');
    renderTable();
  }
}

/* ──────────────────────────────────────────────────────────
   12. MODAL: TAMBAH / EDIT
────────────────────────────────────────────────────────── */

function openAddModal() {
  document.getElementById('jobForm').reset();
  document.getElementById('jobId').value = '';
  document.getElementById('modalTitle').textContent = '+ Tambah Lamaran';
  document.getElementById('submitBtn').textContent = 'Simpan';
  document.getElementById('applyDate').value = todayISO();
  clearFormErrors();
  renderLabelPicker([]);
  showModal('modalOverlay');
}

function openEditModal(id) {
  const job = state.jobs.find(j => j.id === id);
  if (!job) return;

  document.getElementById('jobId').value = job.id;
  document.getElementById('company').value = job.company;
  document.getElementById('position').value = job.position;
  document.getElementById('employmentType').value = job.employmentType;
  document.getElementById('jobType').value = job.jobType || 'WFO';
  document.getElementById('location').value = job.location || '';
  document.getElementById('applyDate').value = job.applyDate || '';
  document.getElementById('interviewDate').value = job.interviewDate || '';
  document.getElementById('salary').value = job.salary || '';
  document.getElementById('priority').value = job.priority;
  document.getElementById('status').value = job.status;
  document.getElementById('applyLink').value = job.applyLink || '';
  document.getElementById('requirements').value = job.requirements || '';
  document.getElementById('notes').value = job.notes || '';

  document.getElementById('modalTitle').textContent = '✏️ Edit Lamaran';
  document.getElementById('submitBtn').textContent = 'Perbarui';
  clearFormErrors();
  renderLabelPicker(job.labelIds || []);
  showModal('modalOverlay');
}

function closeModal() { hideModal('modalOverlay'); }

/* ──────────────────────────────────────────────────────────
   13. FORM VALIDATION
────────────────────────────────────────────────────────── */

function validateForm() {
  let valid = true;
  const company = document.getElementById('company').value.trim();
  const position = document.getElementById('position').value.trim();
  const applyDate = document.getElementById('applyDate').value;

  if (!company) { showFieldError('companyErr', 'Nama perusahaan wajib diisi'); document.getElementById('company').classList.add('error'); valid = false; }
  if (!position) { showFieldError('positionErr', 'Posisi wajib diisi'); document.getElementById('position').classList.add('error'); valid = false; }
  if (!applyDate) { showFieldError('applyDateErr', 'Tanggal apply wajib diisi'); document.getElementById('applyDate').classList.add('error'); valid = false; }
  return valid;
}

function showFieldError(id, msg) { const el = document.getElementById(id); if (el) el.textContent = msg; }

function clearFormErrors() {
  ['companyErr', 'positionErr', 'applyDateErr'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
  ['company', 'position', 'applyDate'].forEach(id => document.getElementById(id)?.classList.remove('error'));
}

/* ──────────────────────────────────────────────────────────
   14. READ FORM VALUES
────────────────────────────────────────────────────────── */

function readFormValues() {
  // Collect selected label IDs from label picker chips
  const selectedChips = document.querySelectorAll('#labelPicker .label-chip.selected');
  const labelIds = Array.from(selectedChips).map(el => el.dataset.labelId);

  return {
    company: document.getElementById('company').value.trim(),
    position: document.getElementById('position').value.trim(),
    employmentType: document.getElementById('employmentType').value,
    jobType: document.getElementById('jobType').value,
    location: document.getElementById('location').value.trim(),
    applyDate: document.getElementById('applyDate').value,
    interviewDate: document.getElementById('interviewDate').value || '',
    salary: document.getElementById('salary').value.trim(),
    priority: document.getElementById('priority').value,
    status: document.getElementById('status').value,
    applyLink: document.getElementById('applyLink').value.trim(),
    requirements: document.getElementById('requirements').value.trim(),
    notes: document.getElementById('notes').value.trim(),
    labelIds,
    updatedAt: new Date().toISOString(),
  };
}

/* ──────────────────────────────────────────────────────────
   15. CRUD OPERATIONS
────────────────────────────────────────────────────────── */

function addJob(data) {
  const job = { id: generateId(), createdAt: new Date().toISOString(), ...data };
  state.jobs.unshift(job);
  saveToStorage(state.jobs);
  render();
  showToast('Lamaran berhasil ditambahkan! 🎉', 'success');
}

function updateJob(id, data) {
  const idx = state.jobs.findIndex(j => j.id === id);
  if (idx === -1) return;
  state.jobs[idx] = { ...state.jobs[idx], ...data };
  saveToStorage(state.jobs);
  render();
  showToast('Lamaran berhasil diperbarui! ✅', 'success');
}

function deleteJob(id) {
  state.jobs = state.jobs.filter(j => j.id !== id);
  saveToStorage(state.jobs);
  render();
  showToast('Lamaran dihapus.', 'warning');
}

/* ──────────────────────────────────────────────────────────
   16. DETAIL MODAL
────────────────────────────────────────────────────────── */

function openDetailModal(id) {
  const job = state.jobs.find(j => j.id === id);
  if (!job) return;

  const sc = STATUS_CLASS[job.status] || 'applied';
  const si = STATUS_ICON[job.status] || '📩';
  const labelBadges = getJobLabelBadges(job);

  const rows = [
    ['Perusahaan', `<strong>${escapeHTML(job.company)}</strong>`],
    ['Posisi', escapeHTML(job.position)],
    ['Status', `<span class="badge badge--${sc}">${si} ${job.status}</span>`],
    ['Priority', `<span class="badge badge--${job.priority.toLowerCase()}">${job.priority}</span>`],
    ['Tipe', `<span class="badge badge--type">${job.employmentType}</span>`],
    ['Job Type', job.jobType ? `<span class="badge badge--date">🏢 ${escapeHTML(job.jobType)}</span>` : '–'],
    ['Lokasi', escapeHTML(job.location || '–')],
    ['Tanggal Apply', formatDate(job.applyDate) || '–'],
    ['Tgl Interview', job.interviewDate ? `🎤 ${formatDate(job.interviewDate)}` : '–'],
    ['Gaji', escapeHTML(job.salary || '–')],
    ['Apply via', job.applyLink ? `<a class="detail-row__link" href="${escapeHTML(job.applyLink)}" target="_blank" rel="noopener">Buka link ↗</a>` : '–'],
    ['Labels', labelBadges || '–'],
    ['Requirements', job.requirements ? `<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px">${escapeHTML(job.requirements)}</pre>` : '–'],
    ['Catatan', job.notes ? `<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px">${escapeHTML(job.notes)}</pre>` : '–'],
    ['Ditambahkan', formatDateTime(job.createdAt)],
    ['Diperbarui', formatDateTime(job.updatedAt)],
  ];

  document.getElementById('detailBody').innerHTML =
    rows.map(([k, v]) => `<div class="detail-row"><span class="detail-row__key">${k}</span><span class="detail-row__val">${v}</span></div>`)
      .join('<hr class="detail-divider">');
  showModal('detailOverlay');
}

/* ──────────────────────────────────────────────────────────
   17. FEATURE 2 — CUSTOM LABELS
────────────────────────────────────────────────────────── */

/** Render the label list inside the Label Manager modal */
function renderLabelManager() {
  const list = document.getElementById('labelList');
  const emptyMsg = document.getElementById('labelListEmpty');
  const labels = state.labels;

  if (!labels.length) {
    emptyMsg.style.display = '';
    list.querySelectorAll('.label-item').forEach(el => el.remove());
    return;
  }
  emptyMsg.style.display = 'none';

  // Remove old items, re-render
  list.querySelectorAll('.label-item').forEach(el => el.remove());
  labels.forEach(label => {
    const textColor = getContrastColor(label.color);
    const item = document.createElement('div');
    item.className = 'label-item';
    item.innerHTML = `
      <span class="label-item__swatch" style="background:${label.color}"></span>
      <span class="label-item__name">${escapeHTML(label.name)}</span>
      <span class="badge badge--label" style="background:${label.color};color:${textColor}">${escapeHTML(label.name)}</span>
      <button class="label-item__delete" data-label-id="${label.id}" title="Hapus label">✕</button>
    `;
    list.appendChild(item);
  });
}

/** Render label chips inside the job form label picker */
function renderLabelPicker(selectedIds = []) {
  const picker = document.getElementById('labelPicker');
  picker.innerHTML = '';

  if (!state.labels.length) {
    picker.innerHTML = '<span class="label-picker__empty">Belum ada label. Buat di menu 🏷️ Label.</span>';
    return;
  }

  state.labels.forEach(label => {
    const textColor = getContrastColor(label.color);
    const chip = document.createElement('span');
    chip.className = 'label-chip' + (selectedIds.includes(label.id) ? ' selected' : '');
    chip.dataset.labelId = label.id;
    chip.style.background = label.color;
    chip.style.color = textColor;
    chip.innerHTML = `<span class="label-chip__dot"></span>${escapeHTML(label.name)}`;
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
    picker.appendChild(chip);
  });
}

/** Add a new label from the label manager form */
function addLabel() {
  const nameInput = document.getElementById('labelNameInput');
  const colorInput = document.getElementById('labelColorInput');
  const errEl = document.getElementById('labelNameErr');
  const name = nameInput.value.trim();

  if (!name) { errEl.textContent = 'Nama label wajib diisi'; return; }
  errEl.textContent = '';

  const label = { id: generateId(), name, color: colorInput.value };
  state.labels.push(label);
  saveLabels(state.labels);
  nameInput.value = '';
  renderLabelManager();
  showToast(`Label "${name}" ditambahkan! 🏷️`, 'success');
}

/** Delete a label by ID */
function deleteLabel(id) {
  state.labels = state.labels.filter(l => l.id !== id);
  // Remove label from all jobs
  state.jobs.forEach(j => {
    if (j.labelIds) j.labelIds = j.labelIds.filter(lid => lid !== id);
  });
  saveLabels(state.labels);
  saveToStorage(state.jobs);
  renderLabelManager();
  render();
  showToast('Label dihapus.', 'warning');
}

/** Return white or black (#fff/#000) for best contrast on given hex bg */
function getContrastColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 150 ? '#111' : '#fff';
}

/* ──────────────────────────────────────────────────────────
   18. FEATURE 3 — IMPORT EXCEL
────────────────────────────────────────────────────────── */

/** Triggered when user picks an Excel file (.xlsx / .xls) */
function handleImportCSV(file) {
  if (!file) return;

  if (typeof XLSX === 'undefined') {
    showToast('Library Excel belum siap, coba lagi sesaat.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const ws = workbook.Sheets[sheetName];
      // header: 1 → array-of-arrays, defval: ''
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      processExcelRows(rows);
    } catch (err) {
      showToast('Gagal membaca file Excel.', 'error');
      console.error(err);
    }
  };
  reader.onerror = () => showToast('Gagal membaca file.', 'error');
  reader.readAsArrayBuffer(file);
}

/** Process rows from parsed Excel sheet */
function processExcelRows(rows) {
  if (!rows || rows.length < 2) {
    showToast('File Excel kosong atau tidak valid.', 'error');
    return;
  }

  // First row = headers
  const headers = rows[0].map(h => String(h).trim().toLowerCase());

  let imported = 0;
  let skipped  = 0;

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols.length) continue;

    // Map columns to job object keys
    const raw = {};
    headers.forEach((h, idx) => {
      const key = EXCEL_IMPORT_MAP[h];
      if (key) {
        const cell = cols[idx];
        // SheetJS may return Date objects for date cells
        if (cell instanceof Date) {
          raw[key] = cell.toISOString().split('T')[0];
        } else {
          raw[key] = String(cell ?? '').trim();
        }
      }
    });

    // Validate required fields
    if (!raw.company || !raw.position) { skipped++; continue; }

    // Normalize priority and status
    const validPriorities = ['High', 'Medium', 'Low'];
    const validStatuses = ['Applied', 'No Response', 'Interview', 'Ditolak', 'Alhamdulillah'];
    raw.priority = validPriorities.find(p => p.toLowerCase() === (raw.priority || '').toLowerCase()) || 'Medium';
    raw.status   = validStatuses.find(s => s.toLowerCase() === (raw.status || '').toLowerCase()) || 'Applied';
    raw.employmentType = raw.employmentType || 'Full-time';

    // Skip strict duplicates (same company + position + applyDate)
    const isDup = state.jobs.some(j =>
      j.company.toLowerCase()  === raw.company.toLowerCase()  &&
      j.position.toLowerCase() === raw.position.toLowerCase() &&
      j.applyDate === raw.applyDate
    );
    if (isDup) { skipped++; continue; }

    const job = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      labelIds: [],
      ...raw,
    };
    state.jobs.push(job);
    imported++;
  }

  saveToStorage(state.jobs);
  render();
  showToast(`Import selesai! ${imported} berhasil, ${skipped} dilewati.`, imported > 0 ? 'success' : 'warning');
  // Reset file input
  document.getElementById('importCsvInput').value = '';
}

// ── legacy stub (not used, kept to avoid reference errors) ──
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/* ──────────────────────────────────────────────────────────
   19. FEATURE 1 — BROWSER NOTIFICATIONS
────────────────────────────────────────────────────────── */

/** Request browser notification permission and toggle */
async function toggleNotifications() {
  if (!('Notification' in window)) {
    showToast('Browser kamu tidak mendukung notifikasi.', 'error');
    return;
  }

  if (Notification.permission === 'denied') {
    showToast('Notifikasi diblokir browser. Aktifkan di pengaturan browser.', 'error');
    return;
  }

  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      showToast('Izin notifikasi ditolak.', 'warning');
      return;
    }
  }

  // Permission is granted — toggle state
  state.notifEnabled = !state.notifEnabled;
  localStorage.setItem(NOTIF_KEY, state.notifEnabled ? '1' : '0');
  updateNotifButton();

  if (state.notifEnabled) {
    showToast('Reminder interview diaktifkan! 🔔', 'success');
    checkUpcomingInterviews(true); // immediate check with toast
  } else {
    showToast('Reminder interview dinonaktifkan.', 'info');
  }
}

/** Update the notification button visual state */
function updateNotifButton() {
  const btn = document.getElementById('notifToggle');
  const icon = document.getElementById('notifIcon');
  if (state.notifEnabled) {
    btn.classList.add('notif-active');
    icon.textContent = '🔔';
    btn.title = 'Reminder aktif — klik untuk nonaktifkan';
  } else {
    btn.classList.remove('notif-active');
    icon.textContent = '🔕';
    btn.title = 'Aktifkan Reminder Interview';
  }
}

/**
 * Check for interviews within the next 7 days and fire browser notifications.
 * @param {boolean} [withToast] show a toast if nothing is upcoming
 */
function checkUpcomingInterviews(withToast = false) {
  if (!state.notifEnabled || Notification.permission !== 'granted') return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = state.jobs.filter(job => {
    if (job.status !== 'Interview' || !job.interviewDate) return false;
    const intDate = new Date(job.interviewDate + 'T00:00:00');
    const diff = Math.ceil((intDate - today) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 7;
  });

  if (!upcoming.length) {
    if (withToast) showToast('Tidak ada interview dalam 7 hari ke depan.', 'info');
    return;
  }

  // Fire a notification for each upcoming interview
  upcoming.forEach(job => {
    const intDate = new Date(job.interviewDate + 'T00:00:00');
    const diff = Math.ceil((intDate - today) / (1000 * 60 * 60 * 24));
    const dayText = diff === 0 ? 'HARI INI' : diff === 1 ? 'besok' : `${diff} hari lagi`;

    try {
      new Notification(`🎤 Interview ${dayText}!`, {
        body: `${job.company} — ${job.position}\n${formatDate(job.interviewDate)}`,
        icon: '💼',
        tag: `interview-${job.id}`, // prevents duplicate notifications
      });
    } catch { }
  });
}

/* ──────────────────────────────────────────────────────────
   20. EXPORT EXCEL
────────────────────────────────────────────────────────── */

function exportCSV() {   // kept same name so event-listener still works
  if (!state.jobs.length) { showToast('Tidak ada data untuk diexport.', 'warning'); return; }

  if (typeof XLSX === 'undefined') {
    showToast('Library Excel belum siap, coba lagi sesaat.', 'error');
    return;
  }

  /* ── Build worksheet data ── */
  const HEADERS = [
    'ID', 'Perusahaan', 'Posisi', 'Employment Type', 'Lokasi',
    'Tanggal Apply', 'Tgl Interview', 'Gaji', 'Priority', 'Status',
    'Link', 'Requirements', 'Catatan', 'Dibuat', 'Diperbarui',
  ];

  const dataRows = state.jobs.map(j => [
    j.id,
    j.company,
    j.position,
    j.employmentType,
    j.location     || '',
    j.applyDate    || '',
    j.interviewDate|| '',
    j.salary       || '',
    j.priority,
    j.status,
    j.applyLink    || '',
    j.requirements || '',
    j.notes        || '',
    j.createdAt    || '',
    j.updatedAt    || '',
  ]);

  const wsData = [HEADERS, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  /* ── Style header row bold ── */
  HEADERS.forEach((_, ci) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci });
    if (!ws[cellRef]) return;
    ws[cellRef].s = { font: { bold: true } };
  });

  /* ── Auto column width ── */
  ws['!cols'] = HEADERS.map((h, ci) => {
    const maxLen = Math.max(
      h.length,
      ...dataRows.map(row => String(row[ci] || '').length)
    );
    return { wch: Math.min(maxLen + 2, 50) };
  });

  /* ── Create workbook & download ── */
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Job Tracker');
  XLSX.writeFile(wb, `job-tracker-${todayISO()}.xlsx`);

  showToast('Data berhasil diexport ke Excel! 📥', 'success');
}

// csvEscape kept for backward-compat (no longer used for export)
function csvEscape(val) {
  const str = String(val ?? '');
  return (str.includes(',') || str.includes('"') || str.includes('\n'))
    ? `"${str.replace(/"/g, '""')}"` : str;
}

/* ──────────────────────────────────────────────────────────
   21. GOOGLE SHEETS SYNC
────────────────────────────────────────────────────────── */

/** Buka modal pengaturan Google Sheets */
function openSheetsSettingsModal() {
  const savedUrl = localStorage.getItem(SHEETS_KEY) || '';
  document.getElementById('sheetsWebAppUrl').value = savedUrl;
  document.getElementById('sheetsUrlErr').textContent = '';
  setSheetsStatus('', '', false);   // sembunyikan status row
  showModal('sheetsOverlay');
}

/** Tampilkan / sembunyikan status indicator di dalam modal */
function setSheetsStatus(icon, text, show = true) {
  const row  = document.getElementById('sheetsStatusRow');
  const ico  = document.getElementById('sheetsStatusIcon');
  const txt  = document.getElementById('sheetsStatusText');
  row.style.display = show ? 'flex' : 'none';
  if (show) { ico.textContent = icon; txt.textContent = text; }
}

/** Validasi & simpan URL ke localStorage */
function saveSheetsUrl() {
  const url = document.getElementById('sheetsWebAppUrl').value.trim();
  const errEl = document.getElementById('sheetsUrlErr');
  if (!url) {
    errEl.textContent = 'URL tidak boleh kosong.';
    return null;
  }
  if (!url.startsWith('https://script.google.com/')) {
    errEl.textContent = 'URL harus berasal dari script.google.com';
    return null;
  }
  errEl.textContent = '';
  localStorage.setItem(SHEETS_KEY, url);
  return url;
}

/**
 * PUSH — kirim semua data jobs ke Google Sheets (overwrite).
 * Menggunakan no-cors mode karena Apps Script tidak support CORS preflight.
 */
async function syncToSheets() {
  const url = saveSheetsUrl();
  if (!url) return;

  setSheetsStatus('⏳', 'Mengirim data ke Google Sheets…');
  disableSheetsButtons(true);

  try {
    const payload = JSON.stringify({ action: 'push', jobs: state.jobs });

    // no-cors: fetch berhasil tapi response opaque (kita tidak bisa baca body-nya)
    // Untuk tahu berhasil/gagal, kita cukup pastikan tidak ada network error.
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: payload,
    });

    setSheetsStatus('✅', `${state.jobs.length} data berhasil dikirim ke Google Sheets!`);
    showToast(`${state.jobs.length} data berhasil di-push ke Google Sheets! ☁️`, 'success');
  } catch (err) {
    setSheetsStatus('❌', 'Gagal menghubungi Google Sheets. Cek URL dan koneksi internet.');
    showToast('Gagal push ke Google Sheets.', 'error');
    console.error(err);
  } finally {
    disableSheetsButtons(false);
  }
}

/**
 * PULL — ambil data dari Google Sheets, merge ke localStorage.
 * Karena GET bisa dibaca (CORS diallow oleh Apps Script dengan Execute as: Me),
 * kita gunakan mode cors biasa.
 */
async function syncFromSheets() {
  const url = saveSheetsUrl();
  if (!url) return;

  setSheetsStatus('⏳', 'Mengambil data dari Google Sheets…');
  disableSheetsButtons(true);

  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Unknown error');

    const incoming = data.jobs || [];
    if (!incoming.length) {
      setSheetsStatus('ℹ️', 'Tidak ada data di Google Sheets.');
      showToast('Google Sheets kosong, tidak ada data untuk di-pull.', 'info');
      return;
    }

    // Merge: upsert berdasarkan ID
    let added = 0, updated = 0;
    incoming.forEach(remoteJob => {
      const localIdx = state.jobs.findIndex(j => j.id === remoteJob.id);
      if (localIdx === -1) {
        state.jobs.push(remoteJob);
        added++;
      } else {
        // Ambil yang lebih baru berdasarkan updatedAt
        const localTime  = new Date(state.jobs[localIdx].updatedAt || 0);
        const remoteTime = new Date(remoteJob.updatedAt || 0);
        if (remoteTime > localTime) {
          state.jobs[localIdx] = remoteJob;
          updated++;
        }
      }
    });

    saveToStorage(state.jobs);
    render();
    setSheetsStatus('✅', `Pull selesai: ${added} ditambahkan, ${updated} diperbarui.`);
    showToast(`Pull selesai! +${added} baru, ${updated} diperbarui. ☁️`, 'success');
  } catch (err) {
    setSheetsStatus('❌', `Gagal: ${err.message}`);
    showToast('Gagal pull dari Google Sheets. Cek URL dan coba lagi.', 'error');
    console.error(err);
  } finally {
    disableSheetsButtons(false);
  }
}

/** Nonaktifkan / aktifkan tombol saat loading */
function disableSheetsButtons(disabled) {
  ['sheetsPushBtn', 'sheetsPullBtn', 'sheetsSaveUrlBtn'].forEach(id => {
    document.getElementById(id).disabled = disabled;
  });
}

/* ──────────────────────────────────────────────────────────
   22. DARK MODE
────────────────────────────────────────────────────────── */

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', state.theme);
  document.getElementById('themeIcon').textContent = state.theme === 'dark' ? '🌙' : '☀️';
  localStorage.setItem(THEME_KEY, state.theme);
}

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    state.theme = saved;
    document.body.setAttribute('data-theme', state.theme);
    document.getElementById('themeIcon').textContent = state.theme === 'dark' ? '🌙' : '☀️';
  }
}

/* ──────────────────────────────────────────────────────────
   22. TOAST NOTIFICATIONS
────────────────────────────────────────────────────────── */

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 3500);
}

/* ──────────────────────────────────────────────────────────
   23. MODAL HELPERS
────────────────────────────────────────────────────────── */

function showModal(id) {
  const overlay = document.getElementById(id);
  overlay.classList.remove('hidden');
  setTimeout(() => {
    const first = overlay.querySelector('input, select, button, textarea, [tabindex]');
    if (first) first.focus();
  }, 40);
}

function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

/* ──────────────────────────────────────────────────────────
   24. UTILITY
────────────────────────────────────────────────────────── */

function escapeHTML(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str ?? '').replace(/[&<>"']/g, c => map[c]);
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(isoStr) {
  if (!isoStr) return '–';
  return new Date(isoStr).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function todayISO() { return new Date().toISOString().split('T')[0]; }

/* ──────────────────────────────────────────────────────────
   25. VIEW TOGGLE HELPER
────────────────────────────────────────────────────────── */

function setViewMode(mode) {
  state.viewMode = mode;
  ['viewCard', 'viewTable', 'viewKanban', 'viewTimeline'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active');
    el.setAttribute('aria-pressed', 'false');
  });
  const modeMap = { card: 'viewCard', table: 'viewTable', kanban: 'viewKanban', timeline: 'viewTimeline' };
  const btn = document.getElementById(modeMap[mode]);
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true'); }
  render();
}

/* ──────────────────────────────────────────────────────────
   26. ACTION DISPATCHER
────────────────────────────────────────────────────────── */

function handleAction(action, id) {
  switch (action) {
    case 'detail': openDetailModal(id); break;
    case 'edit': openEditModal(id); break;
    case 'delete':
      state.pendingDeleteId = id;
      showModal('confirmOverlay');
      break;
  }
}

function handleCardAction(e) {
  const btn = e.target.closest('[data-action]');
  if (btn) { e.stopPropagation(); handleAction(btn.dataset.action, btn.dataset.id); return; }
  const card = e.target.closest('.job-card');
  if (card) openDetailModal(card.dataset.id);
}

/* ──────────────────────────────────────────────────────────
   27. EVENT LISTENERS
────────────────────────────────────────────────────────── */

function setupEventListeners() {
  // ── Tambah / Empty ──
  document.getElementById('openModalBtn').addEventListener('click', openAddModal);
  document.getElementById('emptyAddBtn').addEventListener('click', openAddModal);

  // ── Modal form ──
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeModal);

  // ── Modal detail ──
  document.getElementById('closeDetailBtn').addEventListener('click', () => hideModal('detailOverlay'));

  // ── Label Manager ──
  document.getElementById('openLabelsBtn').addEventListener('click', () => {
    renderLabelManager();
    showModal('labelManagerOverlay');
  });
  document.getElementById('closeLabelManagerBtn').addEventListener('click', () => hideModal('labelManagerOverlay'));
  document.getElementById('addLabelBtn').addEventListener('click', addLabel);
  document.getElementById('labelNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } });

  // Label delete (event delegation on label list)
  document.getElementById('labelList').addEventListener('click', e => {
    const btn = e.target.closest('[data-label-id]');
    if (btn && btn.classList.contains('label-item__delete')) deleteLabel(btn.dataset.labelId);
  });

  // ── Click outside modal to close ──
  ['modalOverlay', 'detailOverlay', 'confirmOverlay', 'labelManagerOverlay', 'sheetsOverlay'].forEach(id => {
    document.getElementById(id).addEventListener('click', function (e) {
      if (e.target === this) {
        if (id === 'modalOverlay') closeModal();
        else hideModal(id);
      }
    });
  });

  // ── Escape key closes any open modal ──
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      ['modalOverlay', 'detailOverlay', 'confirmOverlay', 'labelManagerOverlay', 'sheetsOverlay', 'tutorOverlay'].forEach(id => {
        if (!document.getElementById(id).classList.contains('hidden')) {
          if (id === 'modalOverlay') closeModal();
          else hideModal(id);
        }
      });
    }
  });

  // ── Form submit ──
  document.getElementById('jobForm').addEventListener('submit', function (e) {
    e.preventDefault();
    clearFormErrors();
    if (!validateForm()) return;
    const id = document.getElementById('jobId').value;
    const data = readFormValues();
    id ? updateJob(id, data) : addJob(data);
    closeModal();
  });

  // ── Card grid & table event delegation ──
  document.getElementById('cardGrid').addEventListener('click', handleCardAction);
  document.getElementById('jobTableBody').addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (btn) { e.stopPropagation(); handleAction(btn.dataset.action, btn.dataset.id); return; }
    const row = e.target.closest('tr[data-id]');
    if (row) openDetailModal(row.dataset.id);
  });
  document.getElementById('cardGrid').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { const card = e.target.closest('.job-card'); if (card) openDetailModal(card.dataset.id); }
  });

  // ── Delete confirm ──
  document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
    if (state.pendingDeleteId) { deleteJob(state.pendingDeleteId); state.pendingDeleteId = null; }
    hideModal('confirmOverlay');
  });
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
    state.pendingDeleteId = null; hideModal('confirmOverlay');
  });

  // ── Filters ──
  document.getElementById('filterStatus').addEventListener('change', function () { state.filters.status = this.value; render(); });
  document.getElementById('filterPriority').addEventListener('change', function () { state.filters.priority = this.value; render(); });
  document.getElementById('filterType').addEventListener('change', function () { state.filters.type = this.value; render(); });
  document.getElementById('filterJobType').addEventListener('change', function () { state.filters.jobType = this.value; render(); });
  document.getElementById('sortBy').addEventListener('change', function () { state.sort = this.value; render(); });
  document.getElementById('globalSearch').addEventListener('input', function () { state.filters.search = this.value; render(); });

  // ── Theme ──
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // ── Export Excel ──
  document.getElementById('exportCsv').addEventListener('click', exportCSV);

  // ── Import Excel ──
  document.getElementById('importCsvBtn').addEventListener('click', () => document.getElementById('importCsvInput').click());
  document.getElementById('importCsvInput').addEventListener('change', function () {
    if (this.files && this.files[0]) handleImportCSV(this.files[0]);
  });

  // ── Notifications ──
  document.getElementById('notifToggle').addEventListener('click', toggleNotifications);

  // ── View Mode Toggles ──
  document.getElementById('viewCard').addEventListener('click', () => setViewMode('card'));
  document.getElementById('viewTable').addEventListener('click', () => setViewMode('table'));
  document.getElementById('viewKanban').addEventListener('click', () => setViewMode('kanban'));
  document.getElementById('viewTimeline').addEventListener('click', () => setViewMode('timeline'));

  // ── Hamburger menu toggle (mobile) ──
  const hamburger = document.getElementById('navHamburger');
  const navActions = document.getElementById('navActions');
  hamburger.addEventListener('click', () => {
    const isOpen = navActions.classList.toggle('nav-open');
    hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    hamburger.querySelector('.hamburger-icon').textContent = isOpen ? '✕' : '☰';
  });
  // Close nav when clicking outside navbar on mobile
  document.addEventListener('click', e => {
    if (!e.target.closest('.navbar') && navActions.classList.contains('nav-open')) {
      navActions.classList.remove('nav-open');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.querySelector('.hamburger-icon').textContent = '☰';
    }
  });

  // ── Google Sheets Sync ──
  document.getElementById('openSheetsSettingsBtn').addEventListener('click', openSheetsSettingsModal);
  document.getElementById('closeSheetsBtn').addEventListener('click', () => hideModal('sheetsOverlay'));
  document.getElementById('sheetsSaveUrlBtn').addEventListener('click', () => {
    if (saveSheetsUrl()) showToast('URL Google Sheets disimpan! 💾', 'success');
  });
  document.getElementById('sheetsPushBtn').addEventListener('click', syncToSheets);
  document.getElementById('sheetsPullBtn').addEventListener('click', syncFromSheets);

  // ── Tutor Modal ──
  document.getElementById('openTutorBtn').addEventListener('click', () => showModal('tutorOverlay'));
  document.getElementById('closeTutorBtn').addEventListener('click', () => hideModal('tutorOverlay'));
  document.getElementById('tutorOverlay').addEventListener('click', function (e) {
    if (e.target === this) hideModal('tutorOverlay');
  });

  // ── Tutor Tab Switching ──
  document.querySelectorAll('.tutor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Update tab active state
      document.querySelectorAll('.tutor-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      // Show/hide panels
      const target = tab.dataset.tutorTab; // 'usage' or 'sheets'
      document.getElementById('tutorPanelUsage').classList.toggle('hidden', target !== 'usage');
      document.getElementById('tutorPanelSheets').classList.toggle('hidden', target !== 'sheets');
    });
  });

  // ── Copy Apps Script button ──
  document.getElementById('copyScriptBtn').addEventListener('click', function () {
    const code = document.querySelector('#tutorOverlay .tutor-code code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      this.textContent = '✅ Copied!';
      this.classList.add('copied');
      setTimeout(() => {
        this.textContent = '📋 Copy';
        this.classList.remove('copied');
      }, 2000);
    }).catch(() => showToast('Gagal copy, coba manual.', 'error'));
  });
}

/* ──────────────────────────────────────────────────────────
   28. SEED DATA (demo — fires only if storage is empty)
────────────────────────────────────────────────────────── */

function seedDemoData() {
  const today = todayISO();
  const demo = [
    {
      id: 'demo_1', company: 'PT Teknologi Maju', position: 'Frontend Developer',
      employmentType: 'Full-time', location: 'Jakarta (Hybrid)', applyDate: '2026-03-01',
      interviewDate: today, // today so notification demo works
      salary: '8–12 juta', priority: 'High', status: 'Interview',
      applyLink: 'https://example.com/jobs/1',
      requirements: '- Min. 2 tahun pengalaman React.js\n- Familiar dengan TypeScript',
      notes: 'Direkomendasikan oleh teman. Interview tahap 2 minggu depan.',
      labelIds: [], createdAt: '2026-03-01T09:00:00.000Z', updatedAt: '2026-03-10T14:30:00.000Z',
    },
    {
      id: 'demo_2', company: 'Startup Digital Kreatif', position: 'UI/UX Designer',
      employmentType: 'Full-time', location: 'Remote', applyDate: '2026-03-05',
      interviewDate: '', salary: '6–9 juta', priority: 'Medium', status: 'Applied',
      applyLink: 'https://example.com/jobs/2', requirements: '- Portfolio Figma\n- Design system experience',
      notes: '', labelIds: [], createdAt: '2026-03-05T08:00:00.000Z', updatedAt: '2026-03-05T08:00:00.000Z',
    },
    {
      id: 'demo_3', company: 'PT Global Solusi', position: 'Backend Engineer',
      employmentType: 'Full-time', location: 'Surabaya', applyDate: '2026-02-20',
      interviewDate: '', salary: '10–15 juta', priority: 'High', status: 'Ditolak',
      applyLink: '', requirements: '- Node.js / Express\n- PostgreSQL\n- Docker',
      notes: 'Gagal di technical test.', labelIds: [], createdAt: '2026-02-20T10:00:00.000Z', updatedAt: '2026-03-08T16:00:00.000Z',
    },
    {
      id: 'demo_4', company: 'Perusahaan Impian Tbk', position: 'Full Stack Developer',
      employmentType: 'Full-time', location: 'Jakarta (On-site)', applyDate: '2026-03-10',
      interviewDate: '', salary: '15–20 juta', priority: 'High', status: 'Alhamdulillah',
      applyLink: 'https://example.com/jobs/4', requirements: '- React + Node.js\n- Min. 3 tahun',
      notes: 'Alhamdulillah diterima! Mulai 1 April.', labelIds: [], createdAt: '2026-03-10T09:00:00.000Z', updatedAt: '2026-03-20T11:00:00.000Z',
    },
    {
      id: 'demo_5', company: 'Freelance Project XYZ', position: 'WordPress Developer',
      employmentType: 'Freelance', location: 'Remote', applyDate: '2026-03-15',
      interviewDate: '', salary: '3 juta / project', priority: 'Low', status: 'No Response',
      applyLink: '', requirements: 'WordPress, Elementor, WooCommerce',
      notes: 'Sudah kirim portofolio, belum ada kabar.', labelIds: [], createdAt: '2026-03-15T07:00:00.000Z', updatedAt: '2026-03-15T07:00:00.000Z',
    },
  ];
  state.jobs = demo;
  saveToStorage(demo);
}

/* ──────────────────────────────────────────────────────────
   29. INIT
────────────────────────────────────────────────────────── */

function init() {
  // 1. Load & apply theme
  loadTheme();

  // 2. Load labels
  state.labels = loadLabels();

  // 3. Load jobs
  const stored = loadFromStorage();
  if (!stored.length) seedDemoData();
  else state.jobs = stored;

  // 4. Load notification preference
  const savedNotif = localStorage.getItem(NOTIF_KEY);
  if (savedNotif === '1' && Notification.permission === 'granted') {
    state.notifEnabled = true;
  }
  updateNotifButton();

  // 5. Register events
  setupEventListeners();

  // 6. Render (with skeleton delay)
  setTimeout(() => {
    render();
    // Check upcoming interviews on load (silently)
    if (state.notifEnabled) setTimeout(checkUpcomingInterviews, 1500);
  }, 600);
}

document.addEventListener('DOMContentLoaded', init);
