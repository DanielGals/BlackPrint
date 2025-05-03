// Import Firebase from CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCisrm9MONHHh_vgUI9GPNHC2kvTZ5vfFo",
  authDomain: "blackprint-154a2.firebaseapp.com",
  projectId: "blackprint-154a2",
  storageBucket: "blackprint-154a2.firebasestorage.app",
  messagingSenderId: "659582517137",
  appId: "1:659582517137:web:2abab9fafb23f57cde6430"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };