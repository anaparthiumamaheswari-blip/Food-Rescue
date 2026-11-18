
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

// ---------------- BASIC SETTINGS ----------------

const $ = (selector) => document.querySelector(selector);

let user = null;
let profile = null;
let donations = [];
let unsubscribeDonations = null;

const ROLE_NAMES = {
  restaurant: "Restaurant / Hotel",
  ngo: "NGO",
  volunteer: "Volunteer"
};

// ---------------- HELPER FUNCTIONS ----------------

function toast(message, isError = false) {
  const element = $("#toast");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.className = isError ? "show err" : "show";

  setTimeout(() => {
    element.className = "";
  }, 3500);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const characters = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return characters[character];
  });
}

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

  window.scrollTo(0, 0);
}

// Navigation

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-page]");

  if (link) {
    event.preventDefault();
    show(link.dataset.page);
  }
});

// ---------------- FOOD PHOTOGRAPHS ----------------

function foodPhoto(foodName) {
  const name = String(foodName || "").toLowerCase();

  if (name.includes("biryani")) {
    return "https://images.unsplash.com/photo-1563379091339-03246963d96a?w=700";
  }

  if (name.includes("rice") || name.includes("dal")) {
    return "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=700";
  }

  if (name.includes("bread") || name.includes("bun")) {
    return "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=700";
  }

  if (name.includes("fruit")) {
    return "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=700";
  }

  if (name.includes("pizza")) {
    return "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=700";
  }

  if (name.includes("vegetable")) {
    return "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=700";
  }

  return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=700";
}

// ---------------- EXPIRY COUNTDOWN ----------------

function countdown(expiry) {
  if (!expiry) return "Expiry not specified";

  const remaining = new Date(expiry).getTime() - Date.now();

  if (Number.isNaN(remaining)) return "Expiry not specified";
  if (remaining <= 0) return "Expired";

  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);

  return `${hours}h ${minutes}m left`;
}

// ---------------- AUTHENTICATION ----------------

// Login and registration tabs

if ($("#tab-login")) {
  $("#tab-login").onclick = () => {
    $("#login-form").hidden = false;
    $("#reg-form").hidden = true;

    $("#tab-login").classList.add("on");
    $("#tab-reg").classList.remove("on");
  };
}

if ($("#tab-reg")) {
  $("#tab-reg").onclick = () => {
    $("#login-form").hidden = true;
    $("#reg-form").hidden = false;

    $("#tab-reg").classList.add("on");
    $("#tab-login").classList.remove("on");
  };
}

// Load user profile from Firestore

async function loadProfile(currentUser) {
  const userRef = doc(db, "users", currentUser.uid);
  const userSnapshot = await getDoc(userRef);

  if (userSnapshot.exists()) {
    profile = userSnapshot.data();
  } else {
    profile = null;
  }

  updateUI();
}

// Display authentication errors

function authError(error) {
  const messages = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must contain at least 6 characters.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/network-request-failed": "Check your internet connection."
  };

  toast(messages[error.code] || error.message, true);
}

// Registration

if ($("#reg-form")) {
  $("#reg-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);

    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    const role = String(data.get("role") || "");

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

      form.reset();

      toast("Account created successfully!");
      show("home");

    } catch (error) {
      authError(error);
    }
  });
}

// Login

if ($("#login-form")) {
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);

    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");

    try {
      await signInWithEmailAndPassword(auth, email, password);

      form.reset();

      toast("Login successful!");
      show("home");

    } catch (error) {
      authError(error);
    }
  });
}

// Logout

if ($("#nav-logout")) {
  $("#nav-logout").addEventListener("click", async (event) => {
    event.preventDefault();

    try {
      await signOut(auth);
      toast("Logged out successfully!");
      show("home");
    } catch (error) {
      toast(error.message, true);
    }
  });
}

// Update navigation based on login status

function updateUI() {
  const authButton = $("#nav-auth");
  const logoutButton = $("#nav-logout");
  const donateButton = $("#nav-donate");
  const welcome = $("#whoami");

  if (authButton) authButton.hidden = !!user;

  if (logoutButton) logoutButton.hidden = !user;

  if (donateButton) {
    donateButton.hidden = profile?.role !== "restaurant";
  }

  if (welcome) {
    welcome.hidden = !profile;

    if (profile) {
      welcome.textContent =
        `Signed in as ${profile.name || user.email} (${ROLE_NAMES[profile.role] || profile.role})`;
    }
  }
}

// ---------------- FOOD DONATIONS ----------------

async function addDonation(data) {
  if (!user || !profile) {
    throw new Error("Please log in before donating food.");
  }

  if (profile.role !== "restaurant") {
    throw new Error("Only restaurant accounts can donate.");
  }

  const donation = {
    foodName: String(data.foodName || "").trim(),
    quantity: Number(data.quantity),
    description: String(data.description || "").trim(),
    donorName: String(data.donorName || profile.name || "").trim(),
    location: String(data.location || "").trim(),
    expiry: String(data.expiry || "").trim(),
    contact: String(data.contact || profile.email || "").trim(),
    status: "available",
    donorId: user.uid,
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
    throw new Error("Please complete all required donation fields.");
  }

  if (new Date(donation.expiry).getTime() <= Date.now()) {
    throw new Error("Please enter a future expiry time.");
  }

  await addDoc(collection(db, "donations"), donation);
}

// Donation form

if ($("#donate-form")) {
  $("#donate-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      await addDonation(data);

      form.reset();

      toast("Food donation posted successfully!");
      show("food");

    } catch (error) {
      toast("Could not post donation: " + error.message, true);
    }
  });
}

// ---------------- SAMPLE DONATIONS ----------------

if ($("#sample-btn")) {
  $("#sample-btn").onclick = async () => {
    if (!user || profile?.role !== "restaurant") {
      toast("Please log in as a restaurant account.", true);
      return;
    }

    const futureTime = (hours) => {
      const date = new Date(Date.now() + hours * 3600000);
      const localDate = new Date(
        date.getTime() - date.getTimezoneOffset() * 60000
      );

      return localDate.toISOString().slice(0, 16);
    };

    const samples = [
      {
        foodName: "Veg Biryani",
        quantity: 40,
        description: "Freshly prepared and packed food.",
        donorName: profile.name || "Restaurant",
        location: "Hyderabad",
        expiry: futureTime(5),
        contact: profile.email
      },
      {
        foodName: "Bread & Buns",
        quantity: 30,
        description: "Fresh unsold bakery items.",
        donorName: profile.name || "Restaurant",
        location: "Hyderabad",
        expiry: futureTime(8),
        contact: profile.email
      },
      {
        foodName: "Dal & Rice",
        quantity: 25,
        description: "Freshly cooked meal packets.",
        donorName: profile.name || "Restaurant",
        location: "Hyderabad",
        expiry: futureTime(4),
        contact: profile.email
      }
    ];

    try {
      for (const sample of samples) {
        await addDonation(sample);
      }

      toast("Three sample donations added!");
      show("food");

    } catch (error) {
      toast(error.message, true);
    }
  };
}

// ---------------- ACCEPT / COLLECT FOOD ----------------

async function setDonationStatus(id, status) {
  if (!user || !profile) {
    toast("Please log in first.", true);
    return;
  }

  try {
    const extraData = {};

    if (status === "accepted" && profile.role === "ngo") {
      extraData.acceptedBy = user.uid;
      extraData.acceptedByName = profile.name || profile.email;
    } else if (
      status === "collected" &&
      profile.role === "volunteer"
    ) {
      extraData.collectedBy = user.uid;
    } else {
      toast("Your account cannot perform this action.", true);
      return;
    }

    await updateDoc(doc(db, "donations", id), {
      status: status,
      ...extraData
    });

    toast(
      status === "accepted"
        ? "Food donation accepted successfully!"
        : "Food marked as collected!"
    );

  } catch (error) {
    toast("Could not update donation: " + error.message, true);
  }
}

// Donation action buttons

if ($("#food-list")) {
  $("#food-list").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-id]");

    if (button) {
      setDonationStatus(
        button.dataset.id,
        button.dataset.status
      );
    }
  });
}

// ---------------- DISPLAY DONATIONS ----------------

function render() {
  const foodList = $("#food-list");

  if (!foodList) return;

  const filterElement = $("#filter");
  const selectedFilter = filterElement
    ? filterElement.value
    : "all";

  const filteredDonations = donations.filter((donation) => {
    return (
      selectedFilter === "all" ||
      donation.status === selectedFilter
    );
  });

  if (filteredDonations.length === 0) {
    foodList.innerHTML = `
      <div class="empty">
        <h3>No food donations found</h3>
        <p>New food donations will appear here.</p>
      </div>
    `;
  } else {
    foodList.innerHTML = filteredDonations.map((donation) => {
      let actionButton = "";

      if (
        donation.status === "available" &&
        profile?.role === "ngo"
      ) {
        actionButton = `
          <button class="btn small"
            data-id="${escapeHTML(donation.id)}"
            data-status="accepted">
            Accept Food
          </button>
        `;
      }

      if (
        donation.status === "accepted" &&
        profile?.role === "volunteer"
      ) {
        actionButton = `
          <button class="btn small"
            data-id="${escapeHTML(donation.id)}"
            data-status="collected">
            Mark Collected
          </button>
        `;
      }

      return `
        <article class="card food-card">

          <img
            src="${foodPhoto(donation.foodName)}"
            alt="${escapeHTML(donation.foodName)}"
            class="food-image"
            loading="lazy"
          >

          <span class="badge ${escapeHTML(donation.status)}">
            ${escapeHTML(donation.status)}
          </span>

          <h3>${escapeHTML(donation.foodName)}</h3>

          <p>${escapeHTML(donation.description)}</p>

          <p>
            <strong>Quantity:</strong>
            ${escapeHTML(donation.quantity)} servings
          </p>

          <p>
            <strong>Restaurant:</strong>
            ${escapeHTML(donation.donorName)}
          </p>

          <p>
            <strong>Location:</strong>
            ${escapeHTML(donation.location)}
          </p>

          <p>
            <strong>Contact:</strong>
            ${escapeHTML(donation.contact)}
          </p>

          <p>
            <strong>Expiry:</strong>
            ${escapeHTML(countdown(donation.expiry))}
          </p>

          ${
            donation.acceptedByName
              ? `<p>Accepted by: ${escapeHTML(donation.acceptedByName)}</p>`
              : ""
          }

          ${actionButton}

        </article>
      `;
    }).join("");
  }

  // Dashboard statistics

  const stats = $("#stats");

  if (stats) {
    const count = (status) =>
      donations.filter((item) => item.status === status).length;

    const rescuedMeals = donations
      .filter((item) => item.status === "collected")
      .reduce((total, item) => total + Number(item.quantity || 0), 0);

    stats.innerHTML = `
      <div class="card">
        <h3>${donations.length}</h3>
        <p>Total Donations</p>
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
        <h3>${rescuedMeals}</h3>
        <p>Meals Rescued</p>
      </div>
    `;
  }
}

// Filter donations

if ($("#filter")) {
  $("#filter").addEventListener("change", render);
}

// ---------------- FIREBASE AUTH STATE ----------------

onAuthStateChanged(auth, async (currentUser) => {
  user = currentUser;

  if (unsubscribeDonations) {
    unsubscribeDonations();
    unsubscribeDonations = null;
  }

  if (currentUser) {
    try {
      await loadProfile(currentUser);

      const donationsQuery = query(
        collection(db, "donations"),
        orderBy("createdAt", "desc")
      );

      unsubscribeDonations = onSnapshot(
        donationsQuery,
        (snapshot) => {
          donations = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
          }));

          render();
        },
        (error) => {
          console.error("Food loading error:", error);
          toast("Could not load donations: " + error.message, true);
        }
      );

    } catch (error) {
      console.error("Profile loading error:", error);
      toast("Could not load your profile: " + error.message, true);
    }

  } else {
    profile = null;
    donations = [];

    updateUI();
    render();
  }
});

console.log("Food Rescue application loaded successfully.");
