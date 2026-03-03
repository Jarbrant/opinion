/* ============================================================
   FIL: assets/js/storage.js  (HEL FIL)
   PROJEKT: Enkätmätningar — Matlådor (GitHub Pages)
   VERSION: 0.1.0 (MVP)

   Syfte:
   - Stabil lagring i localStorage
   - Fail-closed: korrupt data => tydliga fel, inga tysta writes
   - Hjälpfunktioner för:
       * aktivt formulär
       * lista mätningar
       * senaste + föregående mätning
       * export/import (för senare steg)

   Policy:
   - UI-only, ingen backend
   - XSS-säkert: den här filen renderar inget HTML
============================================================ */

/* ============================================================
   BLOCK 1 — Stabil nyckelstandard (HOOK: storage-keys)
   OBS: Håll dessa stabila när du väl börjar samla data.
============================================================ */

export const STORAGE_KEYS = Object.freeze({
  ACTIVE_FORM: 'SURVEY_FORM_ACTIVE_V1',      // aktiv formulärdefinition (objekt)
  MEASUREMENTS: 'SURVEY_MEASUREMENTS_V1'     // array av mätningar (objekt)
});

/* ============================================================
   BLOCK 2 — Interna helpers
============================================================ */

function safeJsonParse(raw) {
  // Fail-closed: returnerar { ok, value, error }
  if (raw == null || raw === '') return { ok: true, value: null, error: null };
  try {
    return { ok: true, value: JSON.parse(raw), error: null };
  } catch (e) {
    return { ok: false, value: null, error: e };
  }
}

function safeJsonStringify(value) {
  // Fail-closed: returnerar { ok, raw, error }
  try {
    return { ok: true, raw: JSON.stringify(value), error: null };
  } catch (e) {
    return { ok: false, raw: null, error: e };
  }
}

function isPlainObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function normalizeDateKey(dateStr) {
  // HOOK: date-normalization
  // Minimal validering: YYYY-MM-DD
  if (typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function sortByDateAsc(list) {
  // HOOK: sort-by-date
  return [...list].sort((a, b) => {
    const da = String(a?.date || '');
    const db = String(b?.date || '');
    if (da < db) return -1;
    if (da > db) return 1;
    // stabil sekundärsort om två samma datum (valfritt)
    const ua = String(a?.unit || '');
    const ub = String(b?.unit || '');
    return ua.localeCompare(ub);
  });
}

/* ============================================================
   BLOCK 3 — Aktivt formulär (read/write)
============================================================ */

export function getActiveForm() {
  const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_FORM);
  const parsed = safeJsonParse(raw);

  if (!parsed.ok) {
    return {
      ok: false,
      form: null,
      error: 'Kunde inte läsa aktivt formulär: korrupt JSON i localStorage.'
    };
  }

  if (parsed.value == null) {
    return { ok: true, form: null, error: null };
  }

  if (!isPlainObject(parsed.value) || !Array.isArray(parsed.value.questions)) {
    return {
      ok: false,
      form: null,
      error: 'Aktivt formulär har fel format (saknar questions[]).'
    };
  }

  return { ok: true, form: parsed.value, error: null };
}

export function setActiveForm(formObj) {
  // Fail-closed: kräver minsta valid form
  if (!isPlainObject(formObj) || typeof formObj.id !== 'string' || !Array.isArray(formObj.questions)) {
    return { ok: false, error: 'Kan inte spara aktivt formulär: ogiltigt format.' };
  }

  const packed = safeJsonStringify(formObj);
  if (!packed.ok) return { ok: false, error: 'Kan inte serialisera formulär (JSON.stringify-fel).' };

  localStorage.setItem(STORAGE_KEYS.ACTIVE_FORM, packed.raw);
  return { ok: true, error: null };
}

export function clearActiveForm() {
  localStorage.removeItem(STORAGE_KEYS.ACTIVE_FORM);
  return { ok: true, error: null };
}

/* ============================================================
   BLOCK 4 — Mätningar (read/write)
   Mätning shape (MVP):
   {
     formId: string,
     date: "YYYY-MM-DD",
     unit?: string,
     notes?: string,
     answers: {
       [questionId]: { [optionIndexOrLabel]: number }  // vi använder labels i UI senare
     },
     followups?: {
       [questionId]: string[] // fritextsvar (valfritt)
     }
   }
============================================================ */

export function listMeasurements() {
  const raw = localStorage.getItem(STORAGE_KEYS.MEASUREMENTS);
  const parsed = safeJsonParse(raw);

  if (!parsed.ok) {
    return {
      ok: false,
      measurements: [],
      error: 'Kunde inte läsa mätningar: korrupt JSON i localStorage.'
    };
  }

  if (parsed.value == null) {
    return { ok: true, measurements: [], error: null };
  }

  if (!Array.isArray(parsed.value)) {
    return { ok: false, measurements: [], error: 'Mätningar har fel format (inte en array).' };
  }

  // Minimal sanering: bara objekt med date + formId + answers
  const cleaned = parsed.value.filter((m) => {
    if (!isPlainObject(m)) return false;
    if (typeof m.formId !== 'string') return false;
    if (!normalizeDateKey(m.date)) return false;
    if (!isPlainObject(m.answers)) return false;
    return true;
  });

  return { ok: true, measurements: sortByDateAsc(cleaned), error: null };
}

export function saveMeasurements(measurementsArray) {
  if (!Array.isArray(measurementsArray)) {
    return { ok: false, error: 'Kan inte spara: measurements måste vara en array.' };
  }
  const packed = safeJsonStringify(measurementsArray);
  if (!packed.ok) return { ok: false, error: 'Kan inte serialisera mätningar (JSON.stringify-fel).' };

  localStorage.setItem(STORAGE_KEYS.MEASUREMENTS, packed.raw);
  return { ok: true, error: null };
}

export function addMeasurement(measurementObj) {
  // Fail-closed: validera minimalt innan append
  if (!isPlainObject(measurementObj)) return { ok: false, error: 'Mätning måste vara ett objekt.' };
  if (typeof measurementObj.formId !== 'string') return { ok: false, error: 'Mätning saknar formId.' };

  const dateKey = normalizeDateKey(measurementObj.date);
  if (!dateKey) return { ok: false, error: 'Mätning har ogiltigt datum. Använd YYYY-MM-DD.' };

  if (!isPlainObject(measurementObj.answers)) {
    return { ok: false, error: 'Mätning saknar answers (objekt).' };
  }

  const current = listMeasurements();
  if (!current.ok) return { ok: false, error: current.error };

  const next = [...current.measurements, { ...measurementObj, date: dateKey }];
  const saved = saveMeasurements(next);
  if (!saved.ok) return saved;

  return { ok: true, error: null };
}

export function clearMeasurements() {
  localStorage.removeItem(STORAGE_KEYS.MEASUREMENTS);
  return { ok: true, error: null };
}

/* ============================================================
   BLOCK 5 — Senaste / föregående mätning
============================================================ */

export function getLatestMeasurement(formId) {
  const res = listMeasurements();
  if (!res.ok) return { ok: false, latest: null, error: res.error };

  const filtered = typeof formId === 'string'
    ? res.measurements.filter((m) => m.formId === formId)
    : res.measurements;

  if (filtered.length === 0) return { ok: true, latest: null, error: null };

  const sorted = sortByDateAsc(filtered);
  return { ok: true, latest: sorted[sorted.length - 1], error: null };
}

export function getPreviousMeasurement(formId) {
  const res = listMeasurements();
  if (!res.ok) return { ok: false, previous: null, error: res.error };

  const filtered = typeof formId === 'string'
    ? res.measurements.filter((m) => m.formId === formId)
    : res.measurements;

  if (filtered.length < 2) return { ok: true, previous: null, error: null };

  const sorted = sortByDateAsc(filtered);
  return { ok: true, previous: sorted[sorted.length - 2], error: null };
}

/* ============================================================
   BLOCK 6 — Export / Import (MVP helper)
   - exportAll(): hämtar allt i ett paket
   - importAll(): skriver allt (fail-closed, kräver shape)
============================================================ */

export function exportAll() {
  const formRes = getActiveForm();
  const measRes = listMeasurements();

  if (!formRes.ok) return { ok: false, payload: null, error: formRes.error };
  if (!measRes.ok) return { ok: false, payload: null, error: measRes.error };

  const payload = {
    exportedAt: new Date().toISOString(),
    activeForm: formRes.form,
    measurements: measRes.measurements
  };

  return { ok: true, payload, error: null };
}

export function importAll(payload) {
  // Fail-closed: validera innan vi skriver något
  if (!isPlainObject(payload)) return { ok: false, error: 'Import misslyckades: payload är inte ett objekt.' };

  const form = payload.activeForm ?? null;
  const measurements = payload.measurements ?? [];

  if (form !== null) {
    const okForm = isPlainObject(form) && typeof form.id === 'string' && Array.isArray(form.questions);
    if (!okForm) return { ok: false, error: 'Import: activeForm har fel format.' };
  }

  if (!Array.isArray(measurements)) return { ok: false, error: 'Import: measurements måste vara en array.' };

  // Skriv först när allt ser OK ut
  if (form === null) {
    clearActiveForm();
  } else {
    const s1 = setActiveForm(form);
    if (!s1.ok) return s1;
  }

  const s2 = saveMeasurements(measurements);
  if (!s2.ok) return s2;

  return { ok: true, error: null };
}
