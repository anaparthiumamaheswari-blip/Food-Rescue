
import { auth, db } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  addDoc,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (selector) => document.querySelector(selector);

let user = null;
let profile = null;
let donations = [];
let unsub = null;

const ROLE_NAMES = {
  restaurant: "Restaurant / Hotel",
  ngo: "NGO",
  volunteer: "Volunteer"
};

// FOOD PHOTOS
function foodPhoto(foodName) {
  const name = String(foodName || "").toLowerCase();

  if (name.includes("biryani") || name.includes("rice")) {
    return "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=700&q=80";
  }

  if (name.includes("bread") || name.includes("bun")) {
    return "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=700&q=80";
  }

  if (name.includes("pizza")) {
    return "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=700&q=80";
  }

  if (name.includes("fruit") || name.includes("apple")) {
    return "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=700&q=80";
  }

  if (name.includes("burger")) {
    return "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=700&q=80";
  }

  if (name.includes("cake") || name.includes("sweet")) {
    return "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=700&q=80";
  }

  return "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=80";
}

// SAFE HTML
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

// MESSAGE
function toast(message, isError = false) {
  const element = $("#toast");

  element.textContent = message;
  element.className = "show" + (isError ? " err" : "");

  setTimeout(() => {
    element.className = "";
  }, 3200);
}

// PAGE NAVIGATION
function show(page) {
  if (["food", "dashboard"].includes(page) && !user) {
    toast("Please log in first.", true);
    page = "auth";
  }

  if (page === "donate" && profile?.role !== "restaurant") {
    toast("Only restaurant or hotel accounts can donate.", true);
    page = user ? "home" : "auth";
  }

  document.querySelectorAll(".page").forEach((element) => {
    element.hidden = element.id !== page;
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-page]");

  if (link) {
    event.preventDefault();
    show(link.dataset.page);
  }
});

// EXPIRY COUNTDOWN
function countdown(expiry) {
  const milliseconds = new Date(expiry) - Date.now();

  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "Expired";
  }

  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);

  return `${hours}h ${minutes}m ${seconds}s left`;
}

// LOGIN AND REGISTER TABS
$("#tab-login").onclick = () => {
  $("#login-form").hidden = false;
  $("#reg-form").hidden = true;

  $("#tab-login").className = "on";
  $("#tab-reg").className = "";
};

$("#tab-reg").onclick = () => {
  $("#login-form").hidden = true;
  $("#reg-form").hidden = false;

  $("#tab-reg").className = "on";
  $("#tab-login").className = "";
};

// LOAD USER PROFILE
async function loadProfile(currentUser) {
  const snapshot = await getDoc(
    doc(db, "users", currentUser.uid)
  );

  profile = snapshot.exists() ? snapshot.data() : null;

  updateUI();
}

// AUTHENTICATION ERRORS
function authError(error) {
  const messages = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must contain at least 6 characters.",
    "auth/invalid-email": "Please enter a valid email address."
  };

  toast(messages[error.code] || error.message, true);
}

// REGISTRATION
$("#reg-form").onsubmit = async (event) => {
  event.preventDefault();

  const form = new FormData(event.target);

  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      form.get("email").trim(),
      form.get("password")
    );

    await setDoc(
      doc(db, "users", credential.user.uid),
      {
        name: form.get("name").trim(),
        email: form.get("email").trim(),
        role: form.get("role"),
        createdAt: serverTimestamp()
      }
    );

    await loadProfile(credential.user);

    toast("Account created successfully!");

    event.target.reset();
    show("home");

  } catch (error) {
    authError(error);
  }
};

// LOGIN
$("#login-form").onsubmit = async (event) => {
  event.preventDefault();

  const form = new FormData(event.target);

  try {
    await signInWithEmailAndPassword(
      auth,
      form.get("email").trim(),
      form.get("password")
    );

    toast("Logged in successfully!");

    event.target.reset();
    show("home");

  } catch (error) {
    authError(error);
  }
};

// LOGOUT
$("#nav-logout").onclick = async (event) => {
  event.preventDefault();

  try {
    await signOut(auth);

    toast("Logged out successfully!");
    show("home");

  } catch (error) {
    toast(error.message, true);
  }
};

// UPDATE NAVIGATION
function updateUI() {
  $("#nav-auth").hidden = !!user;
  $("#nav-logout").hidden = !user;

  $("#nav-donate").hidden =
    profile?.role !== "restaurant";

  const who = $("#whoami");

  who.hidden = !profile;

  if (profile) {
    who.textContent =
      `Signed in as ${profile.name} (${ROLE_NAMES[profile.role] || profile.role})`;
  }
}

// FIREBASE AUTH STATE
onAuthStateChanged(auth, async (currentUser) => {
  user = currentUser;

  if (unsub) {
    unsub();
    unsub = null;
  }

  if (currentUser) {
    try {
      await loadProfile(currentUser);

      unsub = onSnapshot(
        query(
          collection(db, "donations"),
          orderBy("createdAt", "desc")
        ),

        (snapshot) => {
          donations = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
          }));

          render();
        },

        (error) => {
          console.error("Donation loading error:", error);
          toast("Could not load donations: " + error.message, true);
        }
      );

    } catch (error) {
      console.error("Profile loading error:", error);
      toast("Could not load user profile: " + error.message, true);
    }

  } else {
    profile = null;
    donations = [];

    updateUI();
    render();
  }
});

// ADD FOOD DONATION
async function addDonation(data) {
  if (!user || profile?.role !== "restaurant") {
    throw new Error("Only restaurant accounts can donate.");
  }

  await addDoc(collection(db, "donations"), {
    ...data,
    quantity: Number(data.quantity),
    status: "available",
    donorId: user.uid,
    createdAt: serverTimestamp()
  });
}

// DONATION FORM
$("#donate-form").onsubmit = async (event) => {
  event.preventDefault();

  try {
    const data = Object.fromEntries(
      new FormData(event.target)
    );

    if (new Date(data.expiry).getTime() <= Date.now()) {
      toast("Please select a future expiry time.", true);
      return;
    }

    await addDonation(data);

    toast("Food donation posted successfully!");

    event.target.reset();
    show("food");

  } catch (error) {
    toast("Could not post donation: " + error.message, true);
  }
};

// SAMPLE DONATIONS
$("#sample-btn").onclick = async () => {
  if (!user || profile?.role !== "restaurant") {
    toast("Only restaurants can add sample donations.", true);
    return;
  }

  const futureTime = (hours) => {
    const date = new Date(Date.now() + hours * 3600000);

    const local = new Date(
      date.getTime() - date.getTimezoneOffset() * 60000
    );

    return local.toISOString().slice(0, 16);
  };

  const base = {
    donorName: profile.name,
    contact: profile.email
  };

  const samples = [
    {
      foodName: "Veg Biryani",
      quantity: 40,
      description: "Freshly cooked and packed meals",
      location: "Banjara Hills, Hyderabad",
      expiry: futureTime(5)
    },
    {
      foodName: "Bread and Buns",
      quantity: 60,
      description: "Fresh bakery items",
      location: "Madhapur, Hyderabad",
      expiry: futureTime(12)
    },
    {
      foodName: "Dal and Rice",
      quantity: 25,
      description: "Freshly prepared food",
      location: "Secunderabad",
      expiry: futureTime(3)
    }
  ];

  try {
    for (const sample of samples) {
      await addDonation({
        ...base,
        ...sample
      });
    }

    toast("3 sample donations added!");

    show("food");

  } catch (error) {
    toast(error.message, true);
  }
};

// ACCEPT OR COLLECT DONATION
async function setStatus(id, status) {
  try {
    if (!user || !profile) {
      throw new Error("Please log in first.");
    }

    if (status === "accepted" && profile.role !== "ngo") {
      throw new Error("Only NGOs can accept donations.");
    }

    if (status === "collected" && profile.role !== "volunteer") {
      throw new Error("Only volunteers can collect food.");
    }

    const extra = status === "accepted"
      ? {
          acceptedBy: user.uid,
          acceptedByName: profile.name
        }
      : {
          collectedBy: user.uid
        };

    await updateDoc(
      doc(db, "donations", id),
      {
        status,
        ...extra
      }
    );

    toast(
      status === "accepted"
        ? "Donation accepted successfully!"
        : "Food marked as collected!"
    );

  } catch (error) {
    toast("Action failed: " + error.message, true);
  }
}

// FOOD LIST BUTTONS
$("#food-list").onclick = (event) => {
  const button = event.target.closest("button[data-id]");

  if (button) {
    setStatus(
      button.dataset.id,
      button.dataset.status
    );
  }
};

$("#filter").onchange = render;

// DISPLAY FOOD DONATIONS
function render() {
  if (!$("#food-list")) return;

  const filter = $("#filter").value;

  let list = donations.filter((item) => {
    return filter === "all" || item.status === filter;
  });

  const foodList = $("#food-list");

  foodList.innerHTML = list.length
    ? list.map((item) => {

        let button = "";

        if (
          item.status === "available" &&
          profile?.role === "ngo"
        ) {
          button = `
            <button class="btn small"
              data-id="${esc(item.id)}"
              data-status="accepted">
              Accept Food ❤️
            </button>
          `;
        }

        if (
          item.status === "accepted" &&
          profile?.role === "volunteer"
        ) {
          button = `
            <button class="btn small"
              data-id="${esc(item.id)}"
              data-status="collected">
              Mark Collected 🚚
            </button>
          `;
        }

        return `
          <article class="card food-card">

            <img
              class="food-photo"
              src="${foodPhoto(item.foodName)}"
              alt="${esc(item.foodName)}"
              loading="lazy"
            >

            <div class="food-card-content">

              <span class="badge ${esc(item.status)}">
                ${esc(item.status)}
              </span>

              <h3>${esc(item.foodName)}</h3>

              <p>${esc(item.description)}</p>

              <p class="meta">
                🍱 ${esc(item.quantity)} servings
              </p>

              <p class="meta">
                🏨 ${esc(item.donorName)}
              </p>

              <p class="meta">
                📍 ${esc(item.location)}
              </p>

              <p class="meta">
                📞 ${esc(item.contact)}
              </p>

              ${
                item.acceptedByName
                  ? `<p class="meta">Accepted by ${esc(item.acceptedByName)}</p>`
                  : ""
              }

              ${
                item.status !== "collected"
                  ? `<p class="count" data-exp="${esc(item.expiry)}">
                       ${countdown(item.expiry)}
                     </p>`
                  : ""
              }

              ${button}

            </div>
          </article>
        `;

      }).join("")

    : `
      <div class="empty">
        <h3>🍲 No food donations found</h3>
        <p>Check back soon for available food.</p>
      </div>
    `;

  // DASHBOARD STATISTICS
  const count = (status) =>
    donations.filter((item) => item.status === status).length;

  const rescued = donations
    .filter((item) => item.status === "collected")
    .reduce((total, item) => total + Number(item.quantity || 0), 0);

  const stat = (value, label) => `
    <div class="card">
      <b>${value}</b>
      ${label}
    </div>
  `;

  $("#stats").innerHTML =
    stat(donations.length, "Total Donations") +
    stat(count("available"), "Available Food") +
    stat(count("accepted"), "Accepted Donations") +
    stat(count("collected"), "Collected Donations") +
    stat(rescued, "Meals Rescued");
}

// LIVE EXPIRY COUNTDOWN
setInterval(() => {
  document.querySelectorAll("[data-exp]").forEach((element) => {
    element.textContent = countdown(element.dataset.exp);

    element.classList.toggle(
      "low",
      new Date(element.dataset.exp) - Date.now() < 3600000
    );
  });
}, 1000);

render();
