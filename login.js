import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const errorMessage = document.getElementById('error-message');
  const forgotPassword = document.getElementById('forgotPassword');

  // Check if user is already logged in
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Check user role in Firestore
      try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
          const userData = docSnap.data();
          
          // Check if user is deactivated
          if (userData.status === 'deactivated') {
            // Sign out the user
            await auth.signOut();
            errorMessage.textContent = "This account has been deactivated. Please contact the administrator.";
            errorMessage.style.display = 'block';
            return;
          }
          
          if (userData.user_type === 'super_admin' || userData.user_type === 'admin') {
            window.location.href = 'admin.html';
          } else {
            window.location.href = 'user.html';
          }
        } else {
          // If the user is authenticated but doesn't have a Firestore document,
          // create one with default user type
          await setDoc(doc(db, "users", user.uid), {
            name: user.displayName || 'User',
            email: user.email,
            user_type: 'user',
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

  // Login form submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Get form values
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    // Clear previous error messages
    errorMessage.style.display = 'none';
    
    try {
      // Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Check user role in Firestore
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
        const userData = docSnap.data();
        
        // Check if user is deactivated
        if (userData.status === 'deactivated') {
          // Sign out the user
          await auth.signOut();
          errorMessage.textContent = "This account has been deactivated. Please contact the administrator.";
          errorMessage.style.display = 'block';
          return;
        }
        
        // Update last login timestamp
        await setDoc(doc(db, "users", user.uid), {
          last_login: serverTimestamp()
        }, { merge: true });
        
        if (userData.user_type === 'super_admin' || userData.user_type === 'admin') {
          window.location.href = 'admin.html';
        } else {
          window.location.href = 'user.html';
        }
      } else {
        // If the user is authenticated but doesn't have a Firestore document,
        // create one with default user type
        await setDoc(doc(db, "users", user.uid), {
          name: user.displayName || 'User',
          email: user.email,
          user_type: 'user',
          last_login: serverTimestamp()
        });
        window.location.href = 'user.html';
      }
    } catch (error) {
      // Handle errors
      errorMessage.textContent = error.message;
      errorMessage.style.display = 'block';
    }
  });

  // Forgot password functionality
  forgotPassword.addEventListener('click', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    
    if (!email) {
      errorMessage.textContent = 'Please enter your email address';
      errorMessage.style.display = 'block';
      return;
    }
    
    try {
      await sendPasswordResetEmail(auth, email);
      errorMessage.textContent = 'Password reset email sent. Check your inbox.';
      errorMessage.style.display = 'block';
      errorMessage.style.color = 'green';
    } catch (error) {
      errorMessage.textContent = error.message;
      errorMessage.style.display = 'block';
    }
  });
});