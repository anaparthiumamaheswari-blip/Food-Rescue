
import { auth, db } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  addDoc,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------------- VARIABLES ----------------

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

// ---------------- HELPER FUNCTIONS ----------------

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function toast(message, isError = false) {
  const box = $("#toast");
  if (!box) {
    alert(message);
    return;
  }

  box.textContent = message;
  box.className = isError ? "show err" : "show";

  setTimeout(() => {
    box.className = "";
  }, 3500);
}

function show(page) {
  if (["food", "dashboard"].includes(page) && !user) {
    toast("Please log in first.", true);
    page = "auth";
  }

  if (page === "donate" && profile?.role !== "restaurant") {
    toast("Only restaurant accounts can donate food.", true);
    page = user ? "home" : "auth";
  }

  document.querySelectorAll(".page").forEach((section) => {
    section.hidden = section.id !== page;
  });

  window.scrollTo(0, 0);
}

// ---------------- NAVIGATION ----------------

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-page]");

  if (link) {
    event.preventDefault();
    show(link.dataset.page);
  }
});

// ---------------- LOGIN / REGISTER TABS ----------------

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

// ---------------- USER PROFILE ----------------

async function loadProfile(currentUser) {
  const userRef = doc(db, "users", currentUser.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    throw new Error("User profile not found. Please register again.");
  }

  profile = snapshot.data();
  updateUI();
}

// ---------------- AUTH ERROR ----------------

function authError(error) {
  const messages = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must contain at least 6 characters.",
    "auth/invalid-email": "Please enter a valid email address."
  };

  toast(messages[error.code] || error.message, true);
}

// ---------------- REGISTRATION ----------------

$("#reg-form").onsubmit = async (event) => {
  event.preventDefault();

  const form = new FormData(event.target);

  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const role = String(form.get("role") || "");

  if (!name || !email || !password || !role) {
    toast("Please fill in all registration details.", true);
    return;
  }

  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await setDoc(doc(db, "users", credential.user.uid), {
      name: name,
      email: email,
      role: role,
      createdAt: serverTimestamp()
    });

    await loadProfile(credential.user);

    event.target.reset();
    toast("Registration successful! Welcome to Food Rescue.");
    show("home");

  } catch (error) {
    authError(error);
  }
};

// ---------------- LOGIN ----------------

$("#login-form").onsubmit = async (event) => {
  event.preventDefault();

  const form = new FormData(event.target);

  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    await loadProfile(credential.user);

    event.target.reset();
    toast("Login successful!");
    show("home");

  } catch (error) {
    authError(error);
  }
};

// ---------------- LOGOUT ----------------

$("#nav-logout").onclick = async (event) => {
  event.preventDefault();

  try {
    if (unsub) {
      unsub();
      unsub = null;
    }

    await signOut(auth);
    toast("Logged out successfully!");
    show("home");

  } catch (error) {
    toast(error.message, true);
  }
};

// ---------------- UPDATE PAGE AFTER LOGIN ----------------

function updateUI() {
  $("#nav-auth").hidden = !!user;
  $("#nav-logout").hidden = !user;

  $("#nav-donate").hidden = profile?.role !== "restaurant";

  const who = $("#whoami");

  if (profile) {
    who.hidden = false;
    who.textContent =
      `Signed in as ${profile.name} (${ROLE_NAMES[profile.role] || profile.role})`;
  } else {
    who.hidden = true;
    who.textContent = "";
  }
}

// ---------------- DONATION QUERY ----------------

function startDonationListener() {
  if (unsub) {
    unsub();
    unsub = null;
  }

  if (!user || !profile) return;

  let donationQuery;

  // Restaurant sees only its own donations.
  if (profile.role === "restaurant") {
    donationQuery = query(
      collection(db, "donations"),
      where("donorId", "==", user.uid)
    );
  }

  // NGO sees available donations.
  else if (profile.role === "ngo") {
    donationQuery = query(
      collection(db, "donations"),
      where("status", "==", "available")
    );
  }

  // Volunteer sees donations accepted by NGOs.
  else if (profile.role === "volunteer") {
    donationQuery = query(
      collection(db, "donations"),
      where("status", "==", "accepted")
    );
  }

  else {
    donations = [];
    render();
    return;
  }

  unsub = onSnapshot(
    donationQuery,

    (snapshot) => {
      donations = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));

      donations.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });

      render();
    },

    (error) => {
      console.error("Donation loading error:", error);
      toast("Could not load donations: " + error.message, true);
    }
  );
}

// ---------------- LOGIN STATE LISTENER ----------------

onAuthStateChanged(auth, async (currentUser) => {
  user = currentUser;

  if (unsub) {
    unsub();
    unsub = null;
  }

  if (user) {
    try {
      await loadProfile(user);
      startDonationListener();
      render();
    } catch (error) {
      console.error("Profile loading error:", error);
      toast(error.message, true);
    }
  } else {
    profile = null;
    donations = [];
    updateUI();
    render();
  }
});

// ---------------- ADD DONATION ----------------

async function addDonation(data) {
  if (!user || profile?.role !== "restaurant") {
    throw new Error("Only logged-in restaurant accounts can donate.");
  }

  const donation = {
    foodName: String(data.foodName || "").trim(),

    quantity: Number(data.quantity),

    description: String(data.description || "").trim(),

    donorName: String(
      data.donorName || profile.name || "Restaurant"
    ).trim(),

    location: String(data.location || "").trim(),

    expiry: String(data.expiry || "").trim(),

    contact: String(
      data.contact || profile.email || ""
    ).trim(),

    donorId: user.uid,

    status: "available",

    createdAt: serverTimestamp()
  };

  if (
    !donation.foodName ||
    !donation.quantity ||
    donation.quantity <= 0 ||
    !donation.donorName ||
    !donation.location ||
    !donation.expiry ||
    !donation.contact
  ) {
    throw new Error("Please fill in all donation details correctly.");
  }

  if (new Date(donation.expiry).getTime() <= Date.now()) {
    throw new Error("Please select a future food expiry time.");
  }

  await addDoc(collection(db, "donations"), donation);
}

// ---------------- DONATION FORM ----------------

$("#donate-form").onsubmit = async (event) => {
  event.preventDefault();

  if (!user) {
    toast("Please log in first.", true);
    show("auth");
    return;
  }

  if (profile?.role !== "restaurant") {
    toast("Only restaurant accounts can post donations.", true);
    return;
  }

  const formData = Object.fromEntries(
    new FormData(event.target).entries()
  );

  try {
    await addDonation(formData);

    event.target.reset();

    toast("Donation posted successfully! Thank you for sharing.");

    show("food");

  } catch (error) {
    console.error("Donation posting error:", error);
    toast("Could not post donation: " + error.message, true);
  }
};

// ---------------- SAMPLE DONATIONS ----------------

$("#sample-btn").onclick = async () => {
  if (!user || profile?.role !== "restaurant") {
    toast("Please log in with a restaurant account.", true);
    return;
  }

  const futureTime = (hours) => {
    const date = new Date(Date.now() + hours * 60 * 60 * 1000);

    return new Date(
      date.getTime() - date.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 16);
  };

  const samples = [
    {
      foodName: "Veg Biryani",
      quantity: 40,
      description: "Freshly cooked and packed.",
      donorName: profile.name,
      location: "Main Road",
      expiry: futureTime(5),
      contact: profile.email
    },
    {
      foodName: "Bread and Buns",
      quantity: 30,
      description: "Fresh unsold bakery items.",
      donorName: profile.name,
      location: "Market Area",
      expiry: futureTime(8),
      contact: profile.email
    },
    {
      foodName: "Dal and Rice",
      quantity: 25,
      description: "Freshly prepared food.",
      donorName: profile.name,
      location: "City Centre",
      expiry: futureTime(3),
      contact: profile.email
    }
  ];

  try {
    for (const donation of samples) {
      await addDonation(donation);
    }

    toast("Three sample donations added successfully!");
    show("food");

  } catch (error) {
    toast("Could not add samples: " + error.message, true);
  }
};

// ---------------- ACCEPT / COLLECT DONATION ----------------

async function setStatus(id, status) {
  if (!user || !profile) return;

  try {
    let changes = {};

    if (status === "accepted" && profile.role === "ngo") {
      changes = {
        status: "accepted",
        acceptedBy: user.uid,
        acceptedByName: profile.name
      };
    }

    else if (status === "collected" && profile.role === "volunteer") {
      changes = {
        status: "collected",
        collectedBy: user.uid
      };
    }

    else {
      throw new Error("You are not allowed to perform this action.");
    }

    await updateDoc(doc(db, "donations", id), changes);

    toast(
      status === "accepted"
        ? "Donation accepted successfully!"
        : "Food marked as collected!"
    );

  } catch (error) {
    console.error("Donation status error:", error);
    toast("Action failed: " + error.message, true);
  }
}

// ---------------- FOOD LIST BUTTONS ----------------

$("#food-list").onclick = (event) => {
  const button = event.target.closest("button[data-id]");

  if (!button) return;

  setStatus(button.dataset.id, button.dataset.status);
};

// ---------------- FILTER ----------------

$("#filter").onchange = render;

// ---------------- COUNTDOWN ----------------

function countdown(expiry) {
  const remaining = new Date(expiry).getTime() - Date.now();

  if (!Number.isFinite(remaining) || remaining <= 0) {
    return "Expired";
  }

  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);

  return `${hours} hours ${minutes} minutes left`;
}

// ---------------- DISPLAY FOOD ----------------

function render() {
  const foodList = $("#food-list");
  const filter = $("#filter").value;

  let visibleDonations = donations;

  if (filter !== "all") {
    visibleDonations = visibleDonations.filter(
      (donation) => donation.status === filter
    );
  }

  foodList.innerHTML = visibleDonations.length
    ? visibleDonations.map((donation) => {
        let button = "";

        if (
          profile?.role === "ngo" &&
          donation.status === "available"
        ) {
          button = `
            <button class="btn small"
              data-id="${esc(donation.id)}"
              data-status="accepted">
              Accept Food
            </button>`;
        }

        if (
          profile?.role === "volunteer" &&
          donation.status === "accepted"
        ) {
          button = `
            <button class="btn small"
              data-id="${esc(donation.id)}"
              data-status="collected">
              Mark Collected
            </button>`;
        }

        return `
          <article class="card">
            <span class="badge ${esc(donation.status)}">
              ${esc(donation.status)}
            </span>

            <h3>${esc(donation.foodName)}</h3>

            <p>${esc(donation.description)}</p>

            <p class="meta">
              <b>Quantity:</b> ${esc(donation.quantity)} servings
            </p>

            <p class="meta">
              <b>Restaurant:</b> ${esc(donation.donorName)}
            </p>

            <p class="meta">
              <b>Location:</b> ${esc(donation.location)}
            </p>

            <p class="meta">
              <b>Contact:</b> ${esc(donation.contact)}
            </p>

            <p class="count">
              ${countdown(donation.expiry)}
            </p>

            ${button}
          </article>
        `;
      }).join("")
    : `
      <div class="empty">
        <h3>No food donations found.</h3>
        <p>New donations will appear here.</p>
      </div>
    `;

  // Dashboard statistics
  const count = (status) =>
    donations.filter((d) => d.status === status).length;

  const rescued = donations
    .filter((d) => d.status === "collected")
    .reduce((total, d) => total + (Number(d.quantity) || 0), 0);

  $("#stats").innerHTML = `
    <div class="card">
      <h3>${donations.length}</h3>
      <p>Total donations</p>
    </div>

    <div class="card">
      <h3>${count("available")}</h3>
      <p>Available</p>
    </div>

    <div class="card">
      <h3>${count("accepted")}</h3>
      <p>Accepted</p>
    </div>

    <div class="card">
      <h3>${count("collected")}</h3>
      <p>Collected</p>
    </div>

    <div class="card">
      <h3>${rescued}</h3>
      <p>Meals rescued</p>
    </div>
  `;
}

// Initial page setup
updateUI();
render();
show("home");
