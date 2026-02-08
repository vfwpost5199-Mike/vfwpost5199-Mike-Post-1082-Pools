const apiUrlEl = document.getElementById("apiUrl");
const adminKeyEl = document.getElementById("adminKey");
const msgEl = document.getElementById("msg");

const claimedCountEl = document.getElementById("claimedCount");
const remainingCountEl = document.getElementById("remainingCount");
const paidCountEl = document.getElementById("paidCount");

const squareEl = document.getElementById("square");
const paidEl = document.getElementById("paid");
const squareInfoEl = document.getElementById("squareInfo");

const searchEl = document.getElementById("search");
const searchResultsEl = document.getElementById("searchResults");

let picks = {};
let locked = false;

function setMsg(t){ msgEl.textContent = t; }
function setSquareInfo(t){ squareInfoEl.textContent = t; }

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}

function getCfg() {
  return { apiUrl: apiUrlEl.value.trim(), adminKey: adminKeyEl.value.trim() };
}

function saveCfg() {
  const cfg = getCfg();
  localStorage.setItem("squares_admin_apiUrl", cfg.apiUrl);
  localStorage.setItem("squares_admin_key", cfg.adminKey);
  setMsg("Saved locally on this device.");
}

function loadCfg() {
  apiUrlEl.value = localStorage.getItem("squares_admin_apiUrl") || "";
  adminKeyEl.value = localStorage.getItem("squares_admin_key") || "";
}

function computeCounts() {
  const claimed = Object.keys(picks).length;
  const paid = Object.values(picks).filter(p => String(p.paid||"N").toUpperCase()==="Y").length;
  claimedCountEl.textContent = String(claimed);
  paidCountEl.textContent = String(paid);
  remainingCountEl.textContent = String(100 - claimed);
}

async function loadPicks() {
  const { apiUrl } = getCfg();
  if (!apiUrl) return setMsg("Paste Apps Script URL first.");
  setMsg("Loading…");
  const res = await fetch(`${apiUrl}?action=list&_=${Date.now()}`);
  const data = await res.json();
  if (!data.ok) return setMsg(data.error || "Load failed");

  locked = !!data.locked;

  const raw = data.picks || {};
  picks = {};
  for (const [sq, obj] of Object.entries(raw)) {
    const k = String(obj.square || sq).trim();
    picks[k] = {
      square: k,
      name: obj.name || "",
      email: obj.email || "",
      phone: obj.phone || "",
      paid: (String(obj.paid||"N").toUpperCase()==="Y") ? "Y" : "N",
      note: obj.note || ""
    };
  }

  computeCounts();
  setMsg(`Loaded ${Object.keys(picks).length} claimed squares. Board: ${locked ? "LOCKED" : "OPEN"}`);
  showSquareInfo();
  renderSearch();
}

function showSquareInfo() {
  const sq = squareEl.value.trim();
  if (!sq) return setSquareInfo("");
  const p = picks[sq];
  if (!p) return setSquareInfo("Not claimed.");
  setSquareInfo(`Claimed by: ${p.name} | ${p.email} | ${p.phone} | Paid: ${p.paid} | Note: ${p.note || ""}`);
}

async function postAdmin(action, payload) {
  const { apiUrl, adminKey } = getCfg();
  if (!apiUrl) throw new Error("Missing Apps Script URL.");
  if (!adminKey) throw new Error("Missing Admin Key.");

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, adminSecret: adminKey, ...payload })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Admin action failed");
}

function renderSearch() {
  const q = searchEl.value.trim().toLowerCase();
  if (!q) {
    searchResultsEl.innerHTML = `<div style="opacity:.75;font-size:13px">Type a name to search.</div>`;
    return;
  }

  const matches = Object.values(picks)
    .filter(p => (p.name || "").toLowerCase().includes(q))
    .sort((a,b)=>Number(a.square)-Number(b.square));

  if (!matches.length) {
    searchResultsEl.innerHTML = `<div style="opacity:.75;font-size:13px">No matches.</div>`;
    return;
  }

  searchResultsEl.innerHTML = matches.map(p => `
    <div class="claim-item">
      <div><span class="sq">#${escapeHtml(p.square)}</span> — ${escapeHtml(p.name)} • Paid: ${escapeHtml(p.paid)}</div>
      <div style="opacity:.75;font-size:12px;margin-top:4px">${escapeHtml(p.email)} • ${escapeHtml(p.phone)}</div>
      ${p.note ? `<div style="opacity:.75;font-size:12px;margin-top:4px">${escapeHtml(p.note)}</div>` : ""}
    </div>
  `).join("");
}

// Buttons
document.getElementById("saveBtn").addEventListener("click", saveCfg);
document.getElementById("loadBtn").addEventListener("click", loadPicks);

document.getElementById("lockBtn").addEventListener("click", async () => {
  try { setMsg("Locking…"); await postAdmin("adminLock", {}); await loadPicks(); }
  catch(e){ setMsg(e.message); }
});
document.getElementById("unlockBtn").addEventListener("click", async () => {
  try { setMsg("Unlocking…"); await postAdmin("adminUnlock", {}); await loadPicks(); }
  catch(e){ setMsg(e.message); }
});

document.getElementById("resetBtn").addEventListener("click", async () => {
  try {
    const ok = confirm("RESET BOARD? This clears all picks.");
    if (!ok) return;
    setMsg("Resetting…");
    await postAdmin("adminReset", {});
    await loadPicks();
  } catch(e){ setMsg(e.message); }
});

squareEl.addEventListener("input", showSquareInfo);

document.getElementById("setPaidBtn").addEventListener("click", async () => {
  try {
    const sq = squareEl.value.trim();
    const paid = paidEl.value;
    setMsg("Updating paid…");
    await postAdmin("adminSetPaid", { square: sq, paid });
    await loadPicks();
  } catch(e){ setMsg(e.message); }
});

document.getElementById("unclaimBtn").addEventListener("click", async () => {
  try {
    const sq = squareEl.value.trim();
    const ok = confirm(`Unclaim #${sq}?`);
    if (!ok) return;
    setMsg("Unclaiming…");
    await postAdmin("adminUnclaim", { square: sq });
    await loadPicks();
  } catch(e){ setMsg(e.message); }
});

searchEl.addEventListener("input", renderSearch);

// Init
loadCfg();
loadPicks().catch(()=>{});
