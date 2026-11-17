
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
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ---------- VARIABLES ----------
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

// ---------- HELPER FUNCTIONS ----------
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

function toast(message, isError = false) {
  const element = $("#toast");
  if (!element) {
    console.log(message);
    return;
  }

  element.textContent = message;
  element.className = "show" + (isError ? " err" : "");

  setTimeout(() => {
    element.className = "";
  }, 3200);
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

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-page]");

  if (link) {
    event.preventDefault();
    show(link.dataset.page);
  }
});

function countdown(expiry) {
  if (!expiry) return "Expiry not specified";

  const milliseconds = new Date(expiry).getTime() - Date.now();

  if (Number.isNaN(milliseconds)) return "Expiry not specified";
  if (milliseconds <= 0) return "Expired";

  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);

  return `${hours}h ${minutes}m left`;
}

// ---------- LOGIN AND REGISTRATION ----------
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

async function loadProfile(currentUser) {
  const profileDoc = await getDoc(
    doc(db, "users", currentUser.uid)
  );

  profile = profileDoc.exists() ? profileDoc.data() : null;

  updateUI();
}

function authError(error) {
  const messages = {
    "auth/invalid-credential": "Wrong email or password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-email": "Please enter a valid email address."
  };

  toast(messages[error.code] || error.message, true);
}

// REGISTER
$("#reg-form").onsubmit = async (event) => {
  event.preventDefault();

  const formData = new FormData(event.target);

  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      formData.get("email"),
      formData.get("password")
    );

    await setDoc(doc(db, "users", credential.user.uid), {
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role"),
      createdAt: serverTimestamp()
    });

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

  const formData = new FormData(event.target);

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      formData.get("email"),
      formData.get("password")
    );

    await loadProfile(credential.user);

    if (!profile) {
      toast("Account profile not found. Please check Firebase.", true);
      return;
    }

    event.target.reset();

    toast("Login successful!");

    show("home");

    updateUI();
    listenToDonations();

  } catch (error) {
    console.error("Login error:", error);
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

// ---------- UPDATE NAVIGATION ----------
function updateUI() {
  $("#nav-auth").hidden = !!user;
  $("#nav-logout").hidden = !user;

  $("#nav-donate").hidden =
    profile?.role !== "restaurant";

  const welcome = $("#whoami");

  welcome.hidden = !profile;

  if (profile) {
    welcome.textContent =
      `Signed in as ${profile.name} (${ROLE_NAMES[profile.role] || profile.role})`;
  }
}

// ---------- LOAD DONATIONS BASED ON ROLE ----------
function listenToDonations() {
  if (unsubscribeDonations) {
    unsubscribeDonations();
    unsubscribeDonations = null;
  }

  donations = [];
  render();

  if (!user || !profile) return;

  let donationQuery;

  if (profile.role === "ngo") {
    // NGO can see available food.
    donationQuery = query(
      collection(db, "donations"),
      where("status", "==", "available")
    );

  } else if (profile.role === "volunteer") {
    // Volunteer can see accepted food.
    donationQuery = query(
      collection(db, "donations"),
      where("status", "==", "accepted")
    );

  } else if (profile.role === "restaurant") {
    // Restaurant can see its own donations.
    donationQuery = query(
      collection(db, "donations"),
      where("donorId", "==", user.uid)
    );

  } else {
    toast("Your account role is missing. Please check your user profile.", true);
    return;
  }

  unsubscribeDonations = onSnapshot(
    donationQuery,

    (snapshot) => {
      donations = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data()
      }));

      // Sort newest donations first.
      donations.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });

      render();
    },

    (error) => {
      console.error("Food loading error:", error);
      toast("Could not load donations: " + error.message, true);
    }
  );
}

// ---------- AUTHENTICATION STATE ----------
onAuthStateChanged(auth, async (currentUser) => {
  user = currentUser;

  if (unsubscribeDonations) {
    unsubscribeDonations();
    unsubscribeDonations = null;
  }

  donations = [];

  if (currentUser) {
    try {
      await loadProfile(currentUser);
      listenToDonations();
    } catch (error) {
      console.error("Profile loading error:", error);
      profile = null;
      updateUI();
      toast("Could not load your account profile.", true);
    }

  } else {
    profile = null;
    updateUI();
    render();
  }
});

// ---------- ADD DONATION ----------
async function addDonation(data) {
  if (!user || profile?.role !== "restaurant") {
    throw new Error("Only restaurant accounts can donate.");
  }

  await addDoc(collection(db, "donations"), {
    ...data,
    quantity: Number(data.quantity),
    status: "available",
    donorId: user.uid,
    donorName: profile.name,
    contact: profile.email,
    createdAt: serverTimestamp()
  });
}

$("#donate-form").onsubmit = async (event) => {
  event.preventDefault();

  try {
    const formData = Object.fromEntries(
      new FormData(event.target)
    );

    await addDonation(formData);

    toast("Food donation posted successfully!");

    event.target.reset();
    show("food");

  } catch (error) {
    console.error(error);
    toast("Could not post donation: " + error.message, true);
  }
};

// ---------- SAMPLE DONATIONS ----------
$("#sample-btn").onclick = async () => {
  if (profile?.role !== "restaurant") {
    toast("Only restaurant accounts can add sample donations.", true);
    return;
  }

  const expiryAfterHours = (hours) => {
    const date = new Date(Date.now() + hours * 60 * 60 * 1000);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  const samples = [
    {
      foodName: "Veg Biryani",
      quantity: 40,
      description: "Freshly cooked food packed in boxes.",
      location: "Banjara Hills, Hyderabad",
      expiry: expiryAfterHours(5)
    },
    {
      foodName: "Bread and Buns",
      quantity: 60,
      description: "Fresh unsold bakery items.",
      location: "Madhapur, Hyderabad",
      expiry: expiryAfterHours(12)
    },
    {
      foodName: "Dal and Rice",
      quantity: 25,
      description: "Freshly prepared packed food.",
      location: "Secunderabad",
      expiry: expiryAfterHours(3)
    }
  ];

  try {
    for (const sample of samples) {
      await addDonation(sample);
    }

    toast("3 sample donations added successfully!");
    show("food");

  } catch (error) {
    console.error(error);
    toast(error.message, true);
  }
};

// ---------- ACCEPT OR COLLECT FOOD ----------
async function setStatus(id, status) {
  try {
    let extraData = {};

    if (status === "accepted" && profile?.role === "ngo") {
      extraData = {
        acceptedBy: user.uid,
        acceptedByName: profile.name
      };

    } else if (
      status === "collected" &&
      profile?.role === "volunteer"
    ) {
      extraData = {
        collectedBy: user.uid
      };

    } else {
      throw new Error("You are not allowed to perform this action.");
    }

    await updateDoc(doc(db, "donations", id), {
      status,
      ...extraData
    });

    toast(
      status === "accepted"
        ? "Food donation accepted successfully!"
        : "Food marked as collected!"
    );

  } catch (error) {
    console.error(error);
    toast("Action failed: " + error.message, true);
  }
}

$("#food-list").onclick = (event) => {
  const button = event.target.closest("button[data-id]");

  if (button) {
    setStatus(button.dataset.id, button.dataset.status);
  }
};

$("#filter").onchange = render;

// ---------- DISPLAY FOOD ----------
function render() {
  const foodList = $("#food-list");
  const filter = $("#filter");

  if (!foodList || !filter) return;

  const selectedFilter = filter.value;

  const filteredDonations = donations.filter((donation) => {
    return selectedFilter === "all" ||
      donation.status === selectedFilter;
  });

  if (filteredDonations.length === 0) {
    foodList.innerHTML = `
      <div class="empty">
        <h3>No food available right now</h3>
        <p>New food donations will appear here.</p>
      </div>
    `;
  } else {
    foodList.innerHTML = filteredDonations.map((donation) => {
      let button = "";

      if (
        donation.status === "available" &&
        profile?.role === "ngo"
      ) {
        button = `
          <button class="btn small"
            data-id="${esc(donation.id)}"
            data-status="accepted">
            Accept Food
          </button>
        `;
      }

      if (
        donation.status === "accepted" &&
        profile?.role === "volunteer"
      ) {
        button = `
          <button class="btn small"
            data-id="${esc(donation.id)}"
            data-status="collected">
            Mark Collected
          </button>
        `;
      }

      return `
        <article class="card">

          <span class="badge ${esc(donation.status)}">
            ${esc(donation.status)}
          </span>

          <h3>${esc(donation.foodName)}</h3>

          <p>${esc(donation.description)}</p>

          <p class="meta">
            <b>${esc(donation.quantity)}</b> servings
            · from ${esc(donation.donorName)}
          </p>

          <p class="meta">
            📍 ${esc(donation.location)}
          </p>

          <p class="meta">
            📞 ${esc(donation.contact)}
          </p>

          ${donation.acceptedByName
            ? `<p class="meta">Accepted by ${esc(donation.acceptedByName)}</p>`
            : ""
          }

          ${donation.status !== "collected"
            ? `<p class="count" data-exp="${esc(donation.expiry)}">${countdown(donation.expiry)}</p>`
            : ""
          }

          ${button}

        </article>
      `;
    }).join("");
  }

  // Dashboard statistics
  const countStatus = (status) =>
    donations.filter((donation) => donation.status === status).length;

  const rescuedMeals = donations
    .filter((donation) => donation.status === "collected")
    .reduce((total, donation) => total + (Number(donation.quantity) || 0), 0);

  const stat = (value, label) => `
    <div class="card">
      <b>${value}</b>
      ${label}
    </div>
  `;

  const stats = $("#stats");

  if (stats) {
    stats.innerHTML =
      stat(donations.length, "Total donations") +
      stat(countStatus("available"), "Available") +
      stat(countStatus("accepted"), "Accepted") +
      stat(countStatus("collected"), "Collected") +
      stat(rescuedMeals, "Meals rescued");
  }
}

// ---------- UPDATE EXPIRY COUNTDOWN ----------
setInterval(() => {
  document.querySelectorAll("[data-exp]").forEach((element) => {
    element.textContent = countdown(element.dataset.exp);

    const remaining =
      new Date(element.dataset.exp).getTime() - Date.now();

    element.classList.toggle(
      "low",
      remaining > 0 && remaining < 3600000
    );
  });
}, 1000);

render();
