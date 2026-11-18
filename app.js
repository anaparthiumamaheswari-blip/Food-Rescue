import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, doc, setDoc, getDoc, updateDoc, onSnapshot, query, orderBy, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
let user = null, profile = null, donations = [], unsub = null;
const ROLE_NAMES = { restaurant: "Restaurant / Hotel", ngo: "NGO", volunteer: "Volunteer" };

// ---------- helpers ----------
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(msg, isErr = false) {
  const t = $("#toast");
  t.textContent = msg; t.className = "show" + (isErr ? " err" : "");
  setTimeout(() => (t.className = ""), 3200);
}
function show(page) {
  if (["food", "dashboard"].includes(page) && !user) { toast("Please log in first.", true); page = "auth"; }
  if (page === "donate" && profile?.role !== "restaurant") { toast("Only restaurant or hotel accounts can donate.", true); page = user ? "home" : "auth"; }
  document.querySelectorAll(".page").forEach((p) => (p.hidden = p.id !== page));
  scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-page]");
  if (a) { e.preventDefault(); show(a.dataset.page); }
});
function countdown(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
  return `${h}h ${m}m ${s}s left`;
}

// ---------- auth ----------
$("#tab-login").onclick = () => { $("#login-form").hidden = false; $("#reg-form").hidden = true; $("#tab-login").className = "on"; $("#tab-reg").className = ""; };
$("#tab-reg").onclick = () => { $("#login-form").hidden = true; $("#reg-form").hidden = false; $("#tab-reg").className = "on"; $("#tab-login").className = ""; };

async function loadProfile(u) {
  const snap = await getDoc(doc(db, "users", u.uid));
  profile = snap.exists() ? snap.data() : null;
  updateUI();
}
function authError(err) {
  const map = { "auth/invalid-credential": "Wrong email or password.", "auth/email-already-in-use": "That email is already registered.", "auth/weak-password": "Password must be at least 6 characters." };
  toast(map[err.code] || err.message, true);
}

$("#reg-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const cred = await createUserWithEmailAndPassword(auth, f.get("email"), f.get("password"));
    await setDoc(doc(db, "users", cred.user.uid), { name: f.get("name"), email: f.get("email"), role: f.get("role"), createdAt: serverTimestamp() });
    await loadProfile(cred.user);
    toast("Account created. Welcome to Food Rescue!");
    e.target.reset(); show("home");
  } catch (err) { authError(err); }
};
$("#login-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await signInWithEmailAndPassword(auth, f.get("email"), f.get("password"));
    toast("Logged in successfully."); e.target.reset(); show("home");
  } catch (err) { authError(err); }
};
$("#nav-logout").onclick = async (e) => { e.preventDefault(); await signOut(auth); toast("Logged out."); show("home"); };

onAuthStateChanged(auth, async (u) => {
  user = u;
  if (unsub) { unsub(); unsub = null; }
  if (u) {
    await loadProfile(u);
    unsub = onSnapshot(query(collection(db, "donations"), orderBy("createdAt", "desc")),
      (snap) => { donations = snap.docs.map((d) => ({ id: d.id, ...d.data() })); render(); },
      (err) => toast("Could not load donations: " + err.message, true));
  } else { profile = null; donations = []; updateUI(); render(); }
});

function updateUI() {
  $("#nav-auth").hidden = !!user; $("#nav-logout").hidden = !user;
  $("#nav-donate").hidden = profile?.role !== "restaurant";
  const w = $("#whoami");
  w.hidden = !profile;
  if (profile) w.textContent = `Signed in as ${profile.name} (${ROLE_NAMES[profile.role]})`;
}

// ---------- donations ----------
async function addDonation(data) {
  await addDoc(collection(db, "donations"), {
    ...data, quantity: Number(data.quantity), status: "available",
    donorId: user.uid, createdAt: serverTimestamp()
  });
}
$("#donate-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await addDonation(Object.fromEntries(new FormData(e.target)));
    toast("Donation posted. Thank you for sharing!");
    e.target.reset(); show("food");
  } catch (err) { toast("Could not post: " + err.message, true); }
};
$("#sample-btn").onclick = async () => {
  const hr = (h) => new Date(Date.now() + h * 36e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  const base = { donorName: profile.name, contact: profile.email };
  const samples = [
    { foodName: "Veg Biryani", quantity: 40, description: "Freshly cooked, packed in boxes", location: "Banjara Hills, Hyderabad", expiry: hr(5) },
    { foodName: "Bread & Buns", quantity: 60, description: "Unsold bakery items from today", location: "Madhapur, Hyderabad", expiry: hr(12) },
    { foodName: "Dal & Rice", quantity: 25, description: "Wedding hall leftovers, sealed", location: "Secunderabad", expiry: hr(3) }
  ];
  try { for (const s of samples) await addDonation({ ...base, ...s }); toast("3 sample donations added."); show("food"); }
  catch (err) { toast(err.message, true); }
};

async function setStatus(id, status) {
  try {
    const extra = status === "accepted" ? { acceptedBy: user.uid, acceptedByName: profile.name } : { collectedBy: user.uid };
    await updateDoc(doc(db, "donations", id), { status, ...extra });
    toast(status === "accepted" ? "Donation accepted." : "Marked as collected. Thank you!");
  } catch (err) { toast("Action not allowed: " + err.message, true); }
}
$("#food-list").onclick = (e) => {
  const b = e.target.closest("button[data-id]");
  if (b) setStatus(b.dataset.id, b.dataset.status);
};
$("#filter").onchange = render;

function render() {
  const f = $("#filter").value;
  const list = donations.filter((d) => f === "all" || d.status === f);
  $("#food-list").innerHTML = list.length ? list.map((d) => {
    let btn = "";
    if (d.status === "available" && profile?.role === "ngo") btn = `<button class="btn small" data-id="${d.id}" data-status="accepted">Accept Food</button>`;
    if (d.status === "accepted" && profile?.role === "volunteer") btn = `<button class="btn small" data-id="${d.id}" data-status="collected">Mark Collected</button>`;
    return `<article class="card">
      <span class="badge ${d.status}">${d.status}</span>
      <h3>${esc(d.foodName)}</h3>
      <p>${esc(d.description)}</p>
      <p class="meta"><b>${esc(d.quantity)}</b> servings · from ${esc(d.donorName)}</p>
      <p class="meta">📍 ${esc(d.location)}</p>
      <p class="meta">📞 ${esc(d.contact)}</p>
      ${d.acceptedByName ? `<p class="meta">Accepted by ${esc(d.acceptedByName)}</p>` : ""}
      ${d.status === "collected" ? "" : `<p class="count" data-exp="${esc(d.expiry)}">${countdown(d.expiry)}</p>`}
      ${btn}</article>`;
  }).join("") : `<div class="empty"><h3>No food available right now</h3><p>${user ? "Check back soon, or ask a restaurant to post surplus food." : "Log in to see donations."}</p></div>`;

  const n = (s) => donations.filter((d) => d.status === s).length;
  const rescued = donations.filter((d) => d.status === "collected").reduce((t, d) => t + d.quantity, 0);
  const stat = (v, l) => `<div class="card"><b>${v}</b>${l}</div>`;
  $("#stats").innerHTML = stat(donations.length, "Total donations") + stat(n("available"), "Available") +
    stat(n("accepted"), "Accepted") + stat(n("collected"), "Collected") + stat(rescued, "Meals rescued");
}
setInterval(() => document.querySelectorAll("[data-exp]").forEach((el) => {
  el.textContent = countdown(el.dataset.exp);
  el.classList.toggle("low", new Date(el.dataset.exp) - Date.now() < 36e5);
}), 1000);
render();
