
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
  onSnapshot,
  query,
  where,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// HTML Elements
const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const donationForm = document.getElementById("donationForm");

const authArea = document.getElementById("authArea");
const userArea = document.getElementById("userArea");

const welcomeMessage = document.getElementById("welcomeMessage");
const roleMessage = document.getElementById("roleMessage");

const authMessage = document.getElementById("authMessage");
const donationMessage = document.getElementById("donationMessage");

const logoutBtn = document.getElementById("logoutBtn");
const foodList = document.getElementById("foodList");

// Current user details
let currentUser = null;
let currentRole = null;
let currentName = "";

let unsubscribeDonations = null;

// Display messages
function showMessage(element, message, success = false) {
  element.textContent = message;
  element.style.color = success ? "green" : "red";
}

// REGISTER USER
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;
  const role = document.getElementById("registerRole").value;

  if (!name || !email || !password || !role) {
    showMessage(authMessage, "Please fill all registration fields.");
    return;
  }

  try {
    const result = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await setDoc(doc(db, "users", result.user.uid), {
      name: name,
      email: email,
      role: role,
      createdAt: serverTimestamp()
    });

    registerForm.reset();

    showMessage(
      authMessage,
      "Registration successful!",
      true
    );

  } catch (error) {
    showMessage(authMessage, error.message);
    console.error("Registration error:", error);
  }
});

// LOGIN USER
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);

    loginForm.reset();

    showMessage(authMessage, "Login successful!", true);

  } catch (error) {
    showMessage(authMessage, error.message);
    console.error("Login error:", error);
  }
});

// LOGOUT USER
logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);

    showMessage(
      authMessage,
      "Logged out successfully!",
      true
    );

  } catch (error) {
    showMessage(authMessage, error.message);
  }
});

// CHECK LOGIN STATUS
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  currentRole = null;
  currentName = "";

  if (user) {
    try {
      const userDoc = await getDoc(
        doc(db, "users", user.uid)
      );

      if (!userDoc.exists()) {
        await signOut(auth);
        showMessage(authMessage, "User profile not found. Please register again.");
        return;
      }

      const data = userDoc.data();

      currentRole = data.role;
      currentName = data.name;

      if (!["restaurant", "ngo"].includes(currentRole)) {
        throw new Error("Invalid account role.");
      }

      authArea.classList.add("hidden");
      userArea.classList.remove("hidden");

      welcomeMessage.textContent =
        "Welcome, " + currentName + "!";

      roleMessage.textContent =
        "Logged in as: " + currentRole;

    } catch (error) {
      console.error("Profile loading error:", error);
      showMessage(authMessage, error.message);
    }

  } else {
    authArea.classList.remove("hidden");
    userArea.classList.add("hidden");
  }

  updateDonationAccess();
  loadFoodDonations();
});

// CONTROL DONATION ACCESS
function updateDonationAccess() {
  const canDonate =
    currentUser && currentRole === "restaurant";

  donationForm.querySelectorAll(
    "input, textarea, button"
  ).forEach((element) => {
    element.disabled = !canDonate;
  });

  if (!currentUser) {
    donationMessage.textContent =
      "Please login as a restaurant to donate.";

  } else if (currentRole === "ngo") {
    donationMessage.textContent =
      "NGO accounts can accept food, not donate.";

  } else {
    donationMessage.textContent =
      "You can donate surplus food.";

    donationMessage.style.color = "green";
  }
}

// DONATE FOOD
donationForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentUser || currentRole !== "restaurant") {
    showMessage(
      donationMessage,
      "Only restaurant accounts can donate food."
    );
    return;
  }

  const foodName =
    document.getElementById("foodName").value.trim();

  const quantity =
    document.getElementById("quantity").value.trim();

  const location =
    document.getElementById("location").value.trim();

  const expiry =
    document.getElementById("expiry").value;

  const description =
    document.getElementById("foodDescription").value.trim();

  if (!foodName || !quantity || !location || !expiry) {
    showMessage(
      donationMessage,
      "Please fill all required fields."
    );
    return;
  }

  if (new Date(expiry).getTime() <= Date.now()) {
    showMessage(
      donationMessage,
      "Please select a future expiry time."
    );
    return;
  }

  try {
    await addDoc(collection(db, "donations"), {
      foodName: foodName,
      quantity: quantity,
      location: location,
      expiry: expiry,
      description: description,
      donorName: currentName,
      donorEmail: currentUser.email,
      donorId: currentUser.uid,
      status: "available",
      createdAt: serverTimestamp()
    });

    donationForm.reset();

    showMessage(
      donationMessage,
      "Food donation added successfully!",
      true
    );

  } catch (error) {
    showMessage(
      donationMessage,
      "Could not post donation: " + error.message
    );

    console.error("Donation error:", error);
  }
});

// LOAD AVAILABLE FOOD
function loadFoodDonations() {
  if (unsubscribeDonations) {
    unsubscribeDonations();
    unsubscribeDonations = null;
  }

  foodList.innerHTML =
    "<p>Loading food donations...</p>";

  const donationsQuery = query(
    collection(db, "donations"),
    where("status", "==", "available")
  );

  unsubscribeDonations = onSnapshot(
    donationsQuery,

    (snapshot) => {
      foodList.innerHTML = "";

      if (snapshot.empty) {
        foodList.innerHTML =
          "<p>No available food donations currently.</p>";
        return;
      }

      const donations = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));

      donations.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;

        return bTime - aTime;
      });

      donations.forEach((food) => {
        const card = document.createElement("div");
        card.className = "food-card";

        const title = document.createElement("h3");
        title.textContent = "🍱 " + food.foodName;

        const quantity = document.createElement("p");
        quantity.textContent =
          "Quantity: " + food.quantity;

        const location = document.createElement("p");
        location.textContent =
          "Location: " + food.location;

        const expiry = document.createElement("p");
        expiry.textContent =
          "Available until: " + food.expiry;

        const donor = document.createElement("p");
        donor.textContent =
          "Donated by: " + food.donorName;

        const description = document.createElement("p");
        description.textContent =
          food.description || "No description provided.";

        card.append(
          title,
          quantity,
          location,
          expiry,
          donor,
          description
        );

        if (currentUser && currentRole === "ngo") {
          const acceptBtn = document.createElement("button");

          acceptBtn.textContent = "Accept Donation";

          acceptBtn.addEventListener("click", () => {
            acceptDonation(food.id, acceptBtn);
          });

          card.appendChild(acceptBtn);
        }

        foodList.appendChild(card);
      });
    },

    (error) => {
      foodList.innerHTML =
        "<p>Unable to load food donations.</p>";

      console.error("Food loading error:", error);
    }
  );
}

// ACCEPT FOOD DONATION
async function acceptDonation(id, button) {
  if (!currentUser || currentRole !== "ngo") {
    alert("Only NGO accounts can accept donations.");
    return;
  }

  button.disabled = true;

  try {
    await updateDoc(
      doc(db, "donations", id),
      {
        status: "accepted",
        claimedBy: currentUser.uid,
        claimedByEmail: currentUser.email,
        claimedAt: serverTimestamp()
      }
    );

    alert("Food donation accepted successfully!");

  } catch (error) {
    button.disabled = false;

    alert(
      "Unable to accept donation: " + error.message
    );

    console.error("Accept donation error:", error);
  }
}
