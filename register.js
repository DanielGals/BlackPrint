import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword, updateProfile, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { doc, setDoc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('registerForm');
  const errorMessage = document.getElementById('error-message');
  
  // Check if user is already logged in
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Check user role in Firestore
      try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const userData = docSnap.data();
          if (userData.user_type === 'admin') {
            window.location.href = 'admin.html';
          } else {
            window.location.href = 'user.html';
          }
        } else {
          // If the user is authenticated but doesn't have a Firestore document,
          // create one with default user type
          await setDoc(doc(db, "users", user.uid), {
            name: user.displayName || user.email.split('@')[0], // Use email prefix if no display name
            email: user.email,
            user_type: 'user',
            created_at: serverTimestamp(),
            last_login: serverTimestamp()
          });
          window.location.href = 'user.html';
        }
      } catch (error) {
        console.error("Error checking user type:", error);
        errorMessage.textContent = "An error occurred while checking your account. Please try again.";
        errorMessage.style.display = 'block';
      }
    }
  });
  
  // Register form submission
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Get form values
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const cpassword = document.getElementById('cpassword').value;
    // Hardcode user type to 'user'
    const userType = 'user';
    
    // Clear previous error messages
    errorMessage.style.display = 'none';
    
    // Validate form inputs
    if (!name.trim()) {
      errorMessage.textContent = 'Name is required';
      errorMessage.style.display = 'block';
      return;
    }
    
    if (!email.trim()) {
      errorMessage.textContent = 'Email is required';
      errorMessage.style.display = 'block';
      return;
    }
    
    if (password.length < 6) {
      errorMessage.textContent = 'Password must be at least 6 characters';
      errorMessage.style.display = 'block';
      return;
    }
    
    // Validate passwords match
    if (password !== cpassword) {
      errorMessage.textContent = 'Passwords do not match!';
      errorMessage.style.display = 'block';
      return;
    }
    
    try {
      // Register with Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Update profile with name
      await updateProfile(user, {
        displayName: name
      });
      
      // Add user data to Firestore with fixed user type
      await setDoc(doc(db, "users", user.uid), {
        name: name,
        email: email,
        user_type: userType,
        created_at: serverTimestamp(),
        last_login: serverTimestamp()
      });
      
      // Show success message before redirecting
      errorMessage.textContent = 'Registration successful! Redirecting...';
      errorMessage.style.display = 'block';
      errorMessage.style.backgroundColor = '#4CAF50';
      
      // Always redirect to user.html
      setTimeout(() => {
        window.location.href = 'user.html';
      }, 1500);
    } catch (error) {
      // Handle errors
      console.error("Registration error:", error);
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage.textContent = 'Email is already in use. Please use a different email or try to login.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage.textContent = 'Invalid email format.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage.textContent = 'Password is too weak. Please use a stronger password.';
      } else {
        errorMessage.textContent = error.message || 'An error occurred during registration. Please try again.';
      }
      
      errorMessage.style.display = 'block';
    }
  });
});