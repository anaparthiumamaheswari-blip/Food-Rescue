// Paste YOUR values from Firebase Console > Project settings > Your apps > Web app
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAQ325hfT_PYPg2hZeqytgCECA_QIvDFbI",
  authDomain: "food-recuse.firebaseapp.com",
  projectId: "food-recuse",
  storageBucket: "food-recuse.firebasestorage.app",
  messagingSenderId: "G-ZJDYMBHD3B",
  appId: "831400923016"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
