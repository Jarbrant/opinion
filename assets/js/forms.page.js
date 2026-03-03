/* ============================================================
   FIL: assets/js/forms.page.js  (HEL FIL)
   PROJEKT: Enkätmätningar — Matlådor (GitHub Pages)
   VERSION: 0.1.0 (MVP)

   Syfte:
   - Flyttar forms-logik från pages/forms.html till modul (bättre struktur)
   - Läser formulärdefinition från /data/
   - Aktiverar formulär i localStorage (storage.js)
   - Renderar frågor XSS-säkert (textContent + createElement)

   Policy:
   - UI-only
   - XSS-safe rendering
   - Fail-closed vid korrupt data

   Integration (KOPIERA IN I pages/forms.html):
   1) Ta bort hela <script type="module"> ... </script> i forms.html
   2) Lägg in längst ned innan </body>:

      <script type="module">
        import { initFormsPage } from "../assets/js/forms.page.js";
        initFormsPage();
      </script>

============================================================ */

import { getActiveForm, setActiveForm, clearActiveForm } from "./storage.js";

/* ============================================================
   BLOCK 1 — DOM hooks
============================================================ */

const $ = (sel) => document.querySelector(sel);

/* ============================================================
   BLOCK 2 — State
============================================================ */

let loadedForm = null; // HOOK: loadedForm-state

/* ============================================================
   BLOCK 3 — UI helpers
============================================================ */

function setStatus(elStatus, kind, msg) {
  elStatus.classList.remove("statusBox--info", "statusBox--ok", "statusBox--warn");
  if (kind === "info") elStatus.classList.add("statusBox--info");
  if (kind === "ok") elStatus.classList.add("statusBox--ok");
  if (kind === "warn") elStatus.classList.add("statusBox--warn");
  elStatus.textContent = msg; // XSS-safe
}

function setFormMeta(elFormTitle, elFormId, elFormVersion, form) {
  if (!form) {
    elFormTitle.textContent = "—";
    elFormId.textContent = "—";
    elFormVersion.textContent = "—";
    return;
  }
  elFormTitle.textContent = String(form.title || "—");
  elFormId.textContent = String(form.id || "—");
  elFormVersion.textContent = String(form.version || "—");
}

function renderQuestions(elQuestionsWrap, form) {
  // Renderar XSS-säkert via DOM
  elQuestionsWrap.innerHTML = "";

  if (!form || !Array.isArray(form.questions) || form.questions.length === 0) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Inga frågor hittades i formuläret.";
    elQuestionsWrap.appendChild(p);
    return;
  }

  const list = document.createElement("ol");
  list.style.margin = "0";
  list.style.paddingLeft = "18px";

  form.questions.forEach((q, idx) => {
    const li = document.createElement("li");
    li.style.margin = "10px 0";

    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.style.color = "#e2e8f0";
    title.textContent = `${idx + 1}. ${String(q.text || "")}`;

    const meta = document.createElement("div");
    meta.className = "muted small";
    meta.style.marginTop = "4px";
    meta.textContent = `id: ${String(q.id || "—")} • typ: ${String(q.type || "—")}`;

    li.appendChild(title);
    li.appendChild(meta);

    // Options (om finns)
    if (Array.isArray(q.options) && q.options.length > 0) {
      const optWrap = document.createElement("div");
      optWrap.className = "muted";
      optWrap.style.marginTop = "6px";

      const ul = document.createElement("ul");
      ul.style.margin = "6px 0 0 0";
      ul.style.paddingLeft = "18px";

      q.options.forEach((opt) => {
        const oli = document.createElement("li");
        oli.textContent = String(opt);
        ul.appendChild(oli);
      });

      optWrap.appendChild(ul);
      li.appendChild(optWrap);
    } else if (q.type === "free_text") {
      const note = document.createElement("div");
      note.className = "muted";
      note.style.marginTop = "6px";
      note.textContent = "Fritextfråga (ingen fast skala).";
      li.appendChild(note);
    }

    // Followup info
    if (q.followup && typeof q.followup.ifOption === "string") {
      const f = document.createElement("div");
      f.className = "muted small";
      f.style.marginTop = "6px";
      f.textContent = `Följdfråga visas om svar = "${q.followup.ifOption}".`;
      li.appendChild(f);
    }

    list.appendChild(li);
  });

  elQuestionsWrap.appendChild(list);
}

function updateActivateButton(elBtnActivate) {
  elBtnActivate.disabled = !loadedForm;
}

/* ============================================================
   BLOCK 4 — Actions
============================================================ */

async function loadFormFromData(ui) {
  const { elStatus, elBtnActivate, elFormTitle, elFormId, elFormVersion, elQuestionsWrap } = ui;

  setStatus(elStatus, "info", "Läser formulär från /data…");
  loadedForm = null;
  updateActivateButton(elBtnActivate);
  setFormMeta(elFormTitle, elFormId, elFormVersion, null);
  renderQuestions(elQuestionsWrap, null);

  try {
    const res = await fetch("../data/form.matlador_feedback_v1.json", { cache: "no-store" });
    if (!res.ok) {
      setStatus(elStatus, "warn", `Kunde inte läsa formulärfilen (HTTP ${res.status}). Kontrollera att filen finns i /data/.`);
      return;
    }

    const data = await res.json();

    // Minimal validering (fail-closed)
    if (!data || typeof data.id !== "string" || !Array.isArray(data.questions)) {
      setStatus(elStatus, "warn", "Formulärfilen har fel format (saknar id eller questions[]).");
      return;
    }

    loadedForm = data;
    setFormMeta(elFormTitle, elFormId, elFormVersion, loadedForm);
    renderQuestions(elQuestionsWrap, loadedForm);
    updateActivateButton(elBtnActivate);

    // Visa om redan aktivt
    const active = getActiveForm();
    if (active.ok && active.form && active.form.id === loadedForm.id) {
      setStatus(elStatus, "ok", "Formulär laddat. Detta formulär är redan aktivt.");
    } else {
      setStatus(elStatus, "ok", "Formulär laddat. Klicka “Aktivera formulär” för att spara det som aktivt.");
    }
  } catch (e) {
    setStatus(elStatus, "warn", "Ett fel uppstod när formuläret skulle läsas (JSON/fetch-fel).");
  }
}

function activateLoadedForm(ui) {
  const { elStatus } = ui;

  if (!loadedForm) {
    setStatus(elStatus, "warn", "Ingen formulärdefinition är laddad. Klicka “Läs formulär” först.");
    return;
  }

  const res = setActiveForm(loadedForm);
  if (!res.ok) {
    setStatus(elStatus, "warn", res.error || "Kunde inte aktivera formuläret (okänt fel).");
    return;
  }

  setStatus(elStatus, "ok", "Formulär aktiverat. Nu kan du registrera mätningar.");
}

function clearActive(ui) {
  const { elStatus } = ui;
  clearActiveForm();
  setStatus(elStatus, "ok", "Aktivt formulär rensat (localStorage).");
}

/* ============================================================
   BLOCK 5 — Public init
============================================================ */

export function initFormsPage() {
  // HOOK: initFormsPage
  const ui = {
    elBtnLoad: $("#btnLoad"),
    elBtnActivate: $("#btnActivate"),
    elBtnClear: $("#btnClear"),

    elStatus: $("#statusBox"),
    elFormTitle: $("#formTitle"),
    elFormId: $("#formId"),
    elFormVersion: $("#formVersion"),
    elQuestionsWrap: $("#questionsWrap")
  };

  // Fail-closed: om någon DOM saknas
  const missing = Object.entries(ui).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    // Vi kan inte rendera korrekt utan dessa hooks.
    // Ingen alert-spam: skriv i console.
    console.error("FormsPage init failed. Missing DOM hooks:", missing);
    return;
  }

  // Init status: visa aktivt om det finns
  const active = getActiveForm();
  if (!active.ok) {
    setStatus(ui.elStatus, "warn", active.error || "Fel vid läsning av aktivt formulär.");
  } else if (!active.form) {
    setStatus(ui.elStatus, "info", "Inget aktivt formulär ännu. Klicka “Läs formulär” och aktivera.");
  } else {
    setStatus(ui.elStatus, "ok", `Aktivt formulär: ${String(active.form.title || active.form.id)}.`);
  }

  // Events
  ui.elBtnLoad.addEventListener("click", () => loadFormFromData(ui));
  ui.elBtnActivate.addEventListener("click", () => activateLoadedForm(ui));
  ui.elBtnClear.addEventListener("click", () => clearActive(ui));

  // Startläge
  updateActivateButton(ui.elBtnActivate);
}
