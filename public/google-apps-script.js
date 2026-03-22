/**
 * ============================================================
 *  JOB TRACKER — GOOGLE APPS SCRIPT
 *  Deploy sebagai Web App (Execute as: Me, Who has access: Anyone)
 *
 *  CARA SETUP:
 *  1. Buka Google Sheets → Extensions → Apps Script
 *  2. Hapus kode default, paste seluruh kode ini
 *  3. Klik "Deploy" → "New deployment" → Type: Web app
 *     - Execute as     : Me
 *     - Who has access : Anyone
 *  4. Klik "Deploy", copy URL yang muncul
 *  5. Paste URL tersebut di Job Tracker → tombol ☁️ Sync Sheets → Pengaturan
 * ============================================================
 */

// ── KONFIGURASI ────────────────────────────────────────────
const SHEET_NAME = 'Job Tracker';   // Nama sheet (tab)

// Header kolom di Google Sheets (urutan harus sama)
const HEADERS = [
  'ID', 'Perusahaan', 'Posisi', 'Employment Type', 'Lokasi',
  'Tanggal Apply', 'Tgl Interview', 'Gaji', 'Priority', 'Status',
  'Link', 'Requirements', 'Catatan', 'Label IDs', 'Dibuat', 'Diperbarui',
];

// ── HELPERS ────────────────────────────────────────────────

/** Ambil atau buat sheet dengan nama SHEET_NAME */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Tulis header
    sheet.appendRow(HEADERS);
    // Format header: bold, background abu-abu
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#263238');
    headerRange.setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    // Auto-resize kolom
    sheet.autoResizeColumns(1, HEADERS.length);
  }
  return sheet;
}

/** Konversi row array → job object */
function rowToJob(row) {
  return {
    id:             row[0]  || '',
    company:        row[1]  || '',
    position:       row[2]  || '',
    employmentType: row[3]  || '',
    location:       row[4]  || '',
    applyDate:      row[5]  || '',
    interviewDate:  row[6]  || '',
    salary:         row[7]  || '',
    priority:       row[8]  || 'Medium',
    status:         row[9]  || 'Applied',
    applyLink:      row[10] || '',
    requirements:   row[11] || '',
    notes:          row[12] || '',
    labelIds:       row[13] ? JSON.parse(row[13]) : [],
    createdAt:      row[14] || '',
    updatedAt:      row[15] || '',
  };
}

/** Konversi job object → row array */
function jobToRow(job) {
  return [
    job.id             || '',
    job.company        || '',
    job.position       || '',
    job.employmentType || '',
    job.location       || '',
    job.applyDate      || '',
    job.interviewDate  || '',
    job.salary         || '',
    job.priority       || 'Medium',
    job.status         || 'Applied',
    job.applyLink      || '',
    job.requirements   || '',
    job.notes          || '',
    JSON.stringify(job.labelIds || []),
    job.createdAt      || new Date().toISOString(),
    job.updatedAt      || new Date().toISOString(),
  ];
}

/** CORS headers untuk response */
function buildResponse(data, statusCode) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ── HTTP HANDLERS ──────────────────────────────────────────

/**
 * GET  → Kembalikan semua job dari Google Sheets ke Job Tracker
 * URL  : <webAppUrl>
 */
function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const rows  = sheet.getDataRange().getValues();

    if (rows.length <= 1) {
      // Hanya header, tidak ada data
      return buildResponse({ success: true, jobs: [] });
    }

    // Skip baris pertama (header)
    const jobs = rows.slice(1)
      .filter(row => row[0]) // skip baris kosong (tidak ada ID)
      .map(rowToJob);

    return buildResponse({ success: true, jobs });
  } catch (err) {
    return buildResponse({ success: false, error: err.message });
  }
}

/**
 * POST → Terima data jobs dari Job Tracker, simpan ke Google Sheets
 * Body : { action: 'push', jobs: [...] }
 *          action 'push'  → replace semua data (overwrite)
 *          action 'merge' → upsert berdasarkan ID
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action  = payload.action || 'push';
    const jobs    = payload.jobs   || [];

    const sheet = getOrCreateSheet();

    if (action === 'push') {
      // ── PUSH: hapus semua data lama, tulis ulang ──
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
        sheet.deleteRows(2, lastRow - 1);
      }
      if (jobs.length > 0) {
        const rows = jobs.map(jobToRow);
        sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
      }
      // Auto-resize setelah data masuk
      sheet.autoResizeColumns(1, HEADERS.length);
      return buildResponse({ success: true, written: jobs.length, action: 'push' });
    }

    if (action === 'merge') {
      // ── MERGE: upsert by ID ──
      const existingRows = sheet.getDataRange().getValues();
      const idColIdx = 0; // kolom A = ID

      // Buat map: id → rowIndex (1-based, row 1 = header)
      const idToRow = {};
      for (let i = 1; i < existingRows.length; i++) {
        const id = existingRows[i][idColIdx];
        if (id) idToRow[id] = i + 1; // +1 karena sheet row 1-based
      }

      const newRows = [];
      jobs.forEach(job => {
        const rowIdx = idToRow[job.id];
        if (rowIdx) {
          // Update baris yang ada
          sheet.getRange(rowIdx, 1, 1, HEADERS.length).setValues([jobToRow(job)]);
        } else {
          // Tambah baris baru
          newRows.push(jobToRow(job));
        }
      });

      if (newRows.length > 0) {
        const startRow = sheet.getLastRow() + 1;
        sheet.getRange(startRow, 1, newRows.length, HEADERS.length).setValues(newRows);
      }
      sheet.autoResizeColumns(1, HEADERS.length);
      return buildResponse({ success: true, written: jobs.length, action: 'merge' });
    }

    return buildResponse({ success: false, error: 'Action tidak dikenal. Gunakan: push atau merge' });

  } catch (err) {
    return buildResponse({ success: false, error: err.message });
  }
}
