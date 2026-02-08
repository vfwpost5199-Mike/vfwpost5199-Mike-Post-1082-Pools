// === CONFIG ===
const API_URL = "PASTE_YOUR_APPS_SCRIPT_URL_HERE";
const PUBLIC_SECRET = "PASTE_YOUR_PUBLIC_SECRET_HERE";
const AUTO_REFRESH_MS = 12000;

let picks = {};            // { "1": {...}, ... }
let selectedSquare = null;
let locked = false;

let openOnly = false;
let highlightPaid = true;

// Elements
const gridEl = document.getElementById("grid");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");
const claimedListEl = document.getElementById("claimedList");
const claimedCountEl = document.getElementById("claimedCount");
const remainingCountEl = document.getElementById("remainingCount");
const paidCountEl = document.getElementById("paidCount");
const subEl = document.getElementById("sub");

const modalEl = document.getElementById("modal");
const modalTitleEl = document.getElementById("modalTitle");
const claimForm = document.getElementById("claimForm");
const cancelBtn = document.getElementById("cancelBtn");
const formMsg = document.getElementById("formMsg");

const openOnlyEl = document.getElementById("openOnly");
const highlightPaidEl = document.getElementById("highlightPaid");

const emailEl = document.getElementById("email");
const emailHintEl = document.getElementById("emailHint");
const phoneEl = document.getElementById("phone");

function setStatus(msg) { statusEl.textContent = msg; }

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}

function onlyDigits(s) {
  return (s || "").replace(/\D/g, "");
}

function formatPhoneUS(input) {
  const d = onlyDigits(input).slice(0, 10);
  const a = d.slice(0, 3);
  const b = d.slice(3, 6);
  const c = d.slice(6, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${a}`;
  if (d.length <= 6) return `(${a}) ${b}`;
  return `(${a}) ${b}-${c}`;
}

// Email validation + typo suggestions
function isValidEmailBasic(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function suggestEmailFix(email) {
  const e = (email || "").trim().toLowerCase();
  const commonFixes = [
    ["gmial.com", "gmail.com"],
    ["gamil.com", "gmail.com"],
    ["gmai.com", "gmail.com"],
    ["gmail.con", "gmail.com"],
    ["gnail.com", "gmail.com"],
    ["hotmial.com", "hotmail.com"],
    ["hotmai.com", "hotmail.com"],
    ["hotmail.con", "hotmail.com"],
    ["yaho.com", "yahoo.com"],
    ["yahoo.con", "yahoo.com"],
    ["outlok.com", "outlook.com"],
    ["outlook.con", "outlook.com"],
    ["icloud.con", "icloud.com"],
    ["aol.con", "aol.com"]
  ];

  const at = e.indexOf("@");
  if (at === -1) return { ok: false, message: "Email must include @." };

  const local = e.slice(0, at);
  const domain = e.slice(at + 1);

  if (!local) return { ok: false, message: "Email is missing the name part before @." };
  if (!domain) return { ok: false, message: "Email is missing the domain after @." };
  if (domain.includes("..")) return { ok: false, message: "Email domain has '..' — please fix." };
  if (!domain.includes(".")) return { ok: false, message: "Email domain should include a dot (like .com)." };

  for (const [bad, good] of commonFixes) {
    if (domain === bad) return { ok: true, suggestion: `${local}@${good}` };
  }

  if (!isValidEmailBasic(e)) return { ok: false, message: "Email format looks off — please double-check." };
  return { ok: true };
}

function showEmailHint() {
  const val = (emailEl.value || "").trim();
  emailHintEl.classList.remove("warn");
  emailHintEl.textContent = "";
  emailHintEl.onclick = null;
  emailHintEl.style.cursor = "default";

  if (!val) return;

  const check = suggestEmailFix(val);

  if (check.suggestion && check.suggestion.toLowerCase() !== val.toLowerCase()) {
    emailHintEl.classList.add("warn");
    emailHintEl.textContent = `Did you mean: ${check.suggestion}? (Click to apply)`;
    emailHintEl.style.cursor = "pointer";
    emailHintEl.onclick = () => {
      emailEl.value = check.suggestion;
      emailHintEl.textContent = "Updated email.";
      emailHintEl.classList.remove("warn");
      emailHintEl.style.cursor = "default";
      emailHintEl.onclick = null;
    };
    return;
  }

  if (check.ok === false) {
    emailHintEl.classList.add("warn");
    emailHintEl.textContent = check.message;
  }
}

function openModal(squareNum) {
  selectedSquare = squareNum;
  modalTitleEl.textContent = `Claim Square #${squareNum}`;
  formMsg.textContent = "";
  claimForm.reset();
  emailHintEl.textContent = "";
  modalEl.classList.add("show");
  modalEl.setAttribute("aria-hidden", "false");
  document.getElementById("name").focus();
}

function closeModal() {
  modalEl.classList.remove("show");
  modalEl.setAttribute("aria-hidden", "true");
  selectedSquare = null;
}

function computeCounts() {
  const claimed = Object.keys(picks).length;
  const paid = Object.values(picks).filter(p => String(p.paid || "N").toUpperCase() === "Y").length;
  claimedCountEl.textContent = String(claimed);
  paidCountEl.textContent = String(paid);
  remainingCountEl.textContent = String(100 - claimed);
}

function renderGrid() {
  gridEl.innerHTML = "";

  for (let i = 1; i <= 100; i++) {
    const key = String(i);
    const claimed = !!picks[key];
    const isPaidY = claimed && (String(picks[key].paid || "N").toUpperCase() === "Y");

    // Toggle: show only open squares
    if (openOnly && (locked || claimed)) continue;

    const paidClass = (highlightPaid && isPaidY) ? "paidY" : "";

    const div = document.createElement("div");
    div.className = `square ${claimed ? "claimed" : "open"} ${paidClass}`;
    div.dataset.square = key;

    const who = claimed ? (picks[key].name || "").trim() : "";
    const paidTxt = claimed ? (isPaidY ? "Paid: Y" : "Paid: N") : "";

    div.innerHTML = `
      <div class="num">${i}</div>
      <div class="who">${claimed ? escapeHtml(who) : (locked ? "Locked" : "Open")}</div>
      <div class="paid">${claimed ? paidTxt : ""}</div>
    `;

    div.addEventListener("click", () => {
      if (locked) return;
      if (claimed) return;
      openModal(i);
    });

    gridEl.appendChild(div);
  }
}

function renderClaimedList() {
  const entries = Object.values(picks).sort((a,b) => Number(a.square) - Number(b.square));

  claimedListEl.innerHTML = entries.length
    ? entries.map(p => `
        <div class="claim-item">
          <div><span class="sq">#${escapeHtml(p.square)}</span> — ${escapeHtml(p.name || "")} • Paid: ${escapeHtml(p.paid || "N")}</div>
          ${p.note ? `<div style="opacity:.75;font-size:12px;margin-top:4px">${escapeHtml(p.note)}</div>` : ""}
        </div>
      `).join("")
    : `<div style="opacity:.75;font-size:13px">No squares claimed yet.</div>`;
}

async function loadPicks() {
  try {
    setStatus("Refreshing…");
    const res = await fetch(`${API_URL}?action=list&_=${Date.now()}`, { method: "GET" });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed to load");

    locked = !!data.locked;
    subEl.textContent = locked ? "Board is LOCKED (no more claims)." : "Click an open square to claim it.";

    const raw = data.picks || {};
    picks = {};
    for (const [sq, obj] of Object.entries(raw)) {
      const k = String(obj.square || sq).trim();
      picks[k] = {
        square: k,
        name: obj.name || "",
        email: obj.email || "",
        phone: obj.phone || "",
        paid: (String(obj.paid || "N").toUpperCase() === "Y") ? "Y" : "N",
        note: obj.note || ""
      };
    }

    computeCounts();
    renderGrid();
    renderClaimedList();
    setStatus(`Updated ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error(err);
    setStatus("Error loading");
  }
}

async function claimSquare(square, name, email, phoneDigits, paid, note) {
  const payload = {
    secret: PUBLIC_SECRET,
    action: "claim",
    square: String(square),
    name,
    email,
    phone: phoneDigits,
    paid,
    note
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Claim failed");
}

// Toggle preferences
function loadTogglePrefs() {
  openOnly = localStorage.getItem("squares_openOnly") === "true";
  highlightPaid = localStorage.getItem("squares_highlightPaid") !== "false";
  openOnlyEl.checked = openOnly;
  highlightPaidEl.checked = highlightPaid;
}

function saveTogglePrefs() {
  localStorage.setItem("squares_openOnly", String(openOnly));
  localStorage.setItem("squares_highlightPaid", String(highlightPaid));
}

// Events
refreshBtn.addEventListener("click", loadPicks);

cancelBtn.addEventListener("click", closeModal);
modalEl.addEventListener("click", (e) => { if (e.target === modalEl) closeModal(); });

openOnlyEl.addEventListener("change", () => {
  openOnly = openOnlyEl.checked;
  saveTogglePrefs();
  renderGrid();
});
highlightPaidEl.addEventListener("change", () => {
  highlightPaid = highlightPaidEl.checked;
  saveTogglePrefs();
  renderGrid();
});

emailEl.addEventListener("input", showEmailHint);
emailEl.addEventListener("blur", showEmailHint);

phoneEl.addEventListener("input", () => {
  const formatted = formatPhoneUS(phoneEl.value);
  phoneEl.value = formatted;
});

claimForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedSquare) return;

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const phoneDigits = onlyDigits(document.getElementById("phone").value);
  const paid = document.getElementById("paid").value;
  const note = document.getElementById("note").value.trim();

  formMsg.textContent = "Saving…";

  try {
    if (locked) throw new Error("Board is locked.");
    if (picks[String(selectedSquare)]) throw new Error("That square was just claimed. Pick another.");

    const emailCheck = suggestEmailFix(email);
    if (emailCheck.ok === false) throw new Error(emailCheck.message || "Please enter a valid email.");
    if (phoneDigits.length !== 10) throw new Error("Cell number must be 10 digits.");

    await claimSquare(selectedSquare, name, email, phoneDigits, paid, note);
    closeModal();
    await loadPicks();
  } catch (err) {
    formMsg.textContent = err.message;
  }
});

// Init
loadTogglePrefs();
loadPicks();
setInterval(loadPicks, AUTO_REFRESH_MS);
