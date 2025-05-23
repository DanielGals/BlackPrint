import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, addDoc, updateDoc, deleteDoc, query, where } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
  // Store the original auth state
  let originalUser = null;

  const adminNameDisplay = document.getElementById('admin-name');
  const contentContainer = document.querySelector('.content');
  
  // Format shipping address for display
  function formatShippingAddress(address) {
    if (!address) return 'No address provided';
    
    // If address is already a string, return it with line breaks for commas
    if (typeof address === 'string') {
      return address.replace(/,/g, ',<br>');
    }
    
    // If address is an object, format it nicely
    if (typeof address === 'object') {
      let formattedAddress = '';
      
      if (address.street) formattedAddress += address.street + '<br>';
      if (address.city) formattedAddress += address.city;
      if (address.province) formattedAddress += (formattedAddress.endsWith('<br>') ? '' : ', ') + address.province;
      if (address.zip) formattedAddress += ' ' + address.zip + '<br>';
      else if (formattedAddress) formattedAddress += '<br>';
      
      if (address.phone) formattedAddress += 'Phone: ' + address.phone + '<br>';
      if (address.notes) formattedAddress += 'Notes: ' + address.notes;
      
      return formattedAddress || 'No address provided';
    }
    
    return 'Invalid address format';
  }
  
  // Get total quantity for an item from inventory collection - defining in global scope
  async function getItemTotalQuantity(itemId) {
    try {
      const inventoryQuery = query(collection(db, "inventory"), where("itemId", "==", itemId));
      const inventorySnapshot = await getDocs(inventoryQuery);
      
      let totalQuantity = 0;
      inventorySnapshot.forEach(doc => {
        totalQuantity += doc.data().quantity;
      });

      // Deduct quantities for active rentals
      try {
        const activeRentalsQuery = query(
          collection(db, "rentals"), 
          where("status", "==", "active")
        );
        const activeRentalsSnapshot = await getDocs(activeRentalsQuery);
        
        activeRentalsSnapshot.forEach(doc => {
          const rental = doc.data();
          // Check if items array exists (new format)
          if (rental.items && Array.isArray(rental.items)) {
            rental.items.forEach(item => {
              if (item.itemId === itemId) {
                // Deduct the rented quantity from the available total
                totalQuantity -= item.quantity;
              }
            });
          } 
          // Legacy support for old rental format
          else if (rental.itemId === itemId) {
            totalQuantity -= (rental.quantity || 1);
          }
        });
      } catch (error) {
        console.error("Error calculating rented items:", error);
      }
      
      return totalQuantity;
    } catch (error) {
      console.error(`Error getting quantity for item ${itemId}:`, error);
      return 0;
    }
  }
  
  // Sidebar functionality
  const sidebarMenuItems = document.querySelectorAll('.sidebar-menu li');
  const pageContainers = document.querySelectorAll('.page-container');
  const sidebarLogout = document.getElementById('sidebar-logout');
  
  // Add character count functionality for descriptions
  const itemDescription = document.getElementById('item-description');
  const descriptionChars = document.getElementById('description-chars');
  if (itemDescription && descriptionChars) {
    itemDescription.addEventListener('input', () => {
      descriptionChars.textContent = itemDescription.value.length;
    });
  }
  
  const editItemDescription = document.getElementById('edit-item-description');
  const editDescriptionChars = document.getElementById('edit-description-chars');
  if (editItemDescription && editDescriptionChars) {
    editItemDescription.addEventListener('input', () => {
      editDescriptionChars.textContent = editItemDescription.value.length;
    });
  }
  
  // Initialize sidebar navigation
  function initSidebar() {
    sidebarMenuItems.forEach(item => {
      if (item.id !== 'sidebar-logout') {
        item.addEventListener('click', () => {
          // Remove active class from all menu items
          sidebarMenuItems.forEach(menuItem => {
            if (menuItem.id !== 'sidebar-logout') {
              menuItem.classList.remove('active');
            }
          });
          
          // Add active class to clicked menu item
          item.classList.add('active');
          
          // Hide all page containers
          pageContainers.forEach(container => {
            container.classList.add('hidden');
          });
            // Show the selected page container
          const pageName = item.getAttribute('data-page');
          const pageToShow = document.getElementById(`${pageName}-page`);
          if (pageToShow) {
            pageToShow.classList.remove('hidden');
            
            // Initialize page specific functionality
            switch (pageName) {
              case 'sales':
                loadSales();
                break;
            }
          }
        });
      }
    });
    
    // Handle sidebar logout button
    sidebarLogout.addEventListener('click', async () => {
      try {
        // Clear any admin-specific cached data from localStorage
        localStorage.removeItem('adminSessionData');
        
        await signOut(auth);
        // Replace current history state to prevent going back after logout
        window.history.replaceState(null, '', 'login.html');
        window.location.href = 'login.html';
      } catch (error) {
        console.error("Error signing out:", error);
        alert("An error occurred during logout. Please try again.");
      }
    });

    // Handle breadcrumb navigation
    document.querySelectorAll('.breadcrumb-item a').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const pageName = link.getAttribute('data-page');
        
        // Hide all page containers
        pageContainers.forEach(container => {
          container.classList.add('hidden');
        });
        
        // Show the selected page container
        const pageToShow = document.getElementById(`${pageName}-page`);
        if (pageToShow) {
          pageToShow.classList.remove('hidden');
          
          // Update active state in sidebar
          sidebarMenuItems.forEach(menuItem => {
            if (menuItem.id !== 'sidebar-logout') {
              menuItem.classList.remove('active');
              if (menuItem.getAttribute('data-page') === pageName) {
                menuItem.classList.add('active');
              }
            }
          });
        }
      });
    });
  }
  
  // Add loading indicator
  const loadingIndicator = document.createElement('p');
  loadingIndicator.textContent = 'Loading admin dashboard...';
  contentContainer.appendChild(loadingIndicator);
  
  // Check authentication state
  onAuthStateChanged(auth, async (user) => {
    // Store the original user
    originalUser = user;
    
    if (user) {
      // Remove loading indicator
      loadingIndicator.remove();
      
      // Check if the user is actually an admin
      try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const userData = docSnap.data();
          if (userData.user_type === 'admin' || userData.user_type === 'super_admin') {
            // Initialize sidebar
            initSidebar();
            
            // Display admin name
            adminNameDisplay.textContent = userData.name;
            
            // Display admin type in sidebar (Super Admin or Admin)
            const adminType = document.getElementById('admin-type');
            if (adminType) {
              adminType.textContent = userData.user_type === 'super_admin' ? 'Super Admin' : 'Admin';
            }
            
            // Display admin email in sidebar
            const adminEmail = document.getElementById('admin-email');
            if (adminEmail) {
              adminEmail.textContent = userData.email;
            }
            
            // Show the admin creation controls if the user is a super_admin
            const superAdminControls = document.getElementById('super-admin-controls');
            if (superAdminControls && userData.user_type === 'super_admin') {
              superAdminControls.style.display = 'block';
              
              // Add event listener to create admin button
              setupCreateAdminFunctionality(user.uid);
            }
            
            // Update last login timestamp
            await setDoc(doc(db, "users", user.uid), {
              last_login: serverTimestamp()
            }, { merge: true });
            
            // Display admin information on dashboard
            const userInfoDiv = document.createElement('div');
            userInfoDiv.className = 'user-info';
            
            const emailInfo = document.createElement('p');
            emailInfo.textContent = `Admin Email: ${userData.email}`;
            userInfoDiv.appendChild(emailInfo);
            
            if (userData.created_at) {
              const createdDate = userData.created_at.toDate ? userData.created_at.toDate() : new Date(userData.created_at);
              const createdInfo = document.createElement('p');
              createdInfo.textContent = `Account created: ${createdDate.toLocaleDateString()}`;
              userInfoDiv.appendChild(createdInfo);
            }
            
            // Insert user info before the existing content in the dashboard page
            const dashboardPage = document.getElementById('dashboard-page');
            const dashboardContent = dashboardPage.querySelector('.content');
            dashboardContent.appendChild(userInfoDiv);
              // Fetch users for user management page
            loadUsers(userData.user_type === 'super_admin');
            
            // Initialize items page
            initItemsPage();
            
            // Initialize inventory page
            loadInventory();
            
            // Initialize orders page
            loadOrders();
            
            // Initialize sales page
            loadSales();
            
            // Update dashboard counts
            updateDashboardCounts();
            
          } else {
            // Redirect non-admin to user page
            window.location.href = 'user.html';
          }
        } else {
          // User doesn't exist in Firestore, redirect to login
          alert('User not found. Please contact support.');
          await signOut(auth);
          window.location.href = 'login.html';
        }
      } catch (error) {
        console.error("Error fetching admin data:", error);
        // Display error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-msg';
        errorDiv.textContent = "An error occurred while loading the admin dashboard. Please refresh the page.";
        contentContainer.appendChild(errorDiv);
      }
    } else {
      // No user is signed in, redirect to login
      window.location.href = 'login.html';
    }
  });
  
  // Setup create admin functionality with current admin user uid
  function setupCreateAdminFunctionality(currentAdminUid) {
    console.log("Setting up admin creation functionality...");
    const createAdminBtn = document.getElementById('create-admin-btn');
    const adminModal = new bootstrap.Modal(document.getElementById('createAdminModal'));
    
    if (createAdminBtn) {
      createAdminBtn.addEventListener('click', async () => {
        // Get form elements by ID - ensure we're using the correct IDs
        const adminNameInput = document.getElementById('admin-name-input');
        const adminEmailInput = document.getElementById('admin-email-input');
        const adminPassword = document.getElementById('admin-password');
        const adminConfirmPassword = document.getElementById('admin-confirm-password');
        const errorMessage = document.getElementById('admin-error-message');
        const successMessage = document.getElementById('admin-success-message');
        
        console.log("Create admin button clicked, processing form...");
        console.log("Form elements found:", 
                    "Name:", adminNameInput, 
                    "Email:", adminEmailInput, 
                    "Password:", adminPassword, 
                    "Confirm:", adminConfirmPassword);
        
        // Hide previous messages
        errorMessage.classList.add('d-none');
        successMessage.classList.add('d-none');
        
        // Perform validation - with null checks
        if (!adminNameInput || !adminNameInput.value || !adminNameInput.value.trim()) {
          showAdminError('Admin name is required');
          return;
        }
        
        if (!adminEmailInput || !adminEmailInput.value || !adminEmailInput.value.trim()) {
          showAdminError('Email address is required');
          return;
        }
        
        if (!adminPassword || adminPassword.value.length < 6) {
          showAdminError('Password must be at least 6 characters');
          return;
        }
        
        if (!adminConfirmPassword || adminPassword.value !== adminConfirmPassword.value) {
          showAdminError('Passwords do not match');
          return;
        }
        
        // Disable button during creation process
        createAdminBtn.disabled = true;
        createAdminBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Creating...';
        
        try {
          console.log("Attempting to create new admin user with Firebase Auth...");
          
          // Get current admin's email before signing out
          const currentUser = auth.currentUser;
          
          if (!currentUser) {
            throw new Error("You must be signed in to create admin users");
          }
          
          // Store form values in local variables
          const adminNameValue = adminNameInput.value.trim();
          const adminEmailValue = adminEmailInput.value.trim();
          const adminPasswordValue = adminPassword.value;
        
          // Create new admin user
          try {
            // Create user with Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, adminEmailValue, adminPasswordValue);
            const newAdminUser = userCredential.user;
            
            // Add user data to Firestore with admin role
            await setDoc(doc(db, "users", newAdminUser.uid), {
              name: adminNameValue,
              email: adminEmailValue,
              user_type: 'admin', // Set user type to admin
              created_at: serverTimestamp(),
              last_login: serverTimestamp(),
              created_by: currentAdminUid // Use the saved admin UID
            });
            
            console.log("New admin user created successfully:", newAdminUser.uid);
            
            // Show success message
            showAdminSuccess(`Admin user "${adminNameValue}" created successfully`);
            
            // Reset the form
            document.getElementById('admin-form').reset();
            
            // Close the modal after a short delay
            setTimeout(() => {
              adminModal.hide();
              
              // Reload users list after a short delay
              setTimeout(() => {
                loadUsers(true);
                // Update dashboard counts
                updateDashboardCounts();
              }, 500);
            }, 1500);
            
          } catch (error) {
            console.error("Error creating admin user:", error);
            
            if (error.code === 'auth/email-already-in-use') {
              showAdminError('Email is already in use. Please use a different email.');
            } else if (error.code === 'auth/invalid-email') {
              showAdminError('Invalid email format.');
            } else {
              showAdminError(`Error creating admin: ${error.message}`);
            }
          }
        } catch (error) {
          console.error("Error during admin creation process:", error);
          showAdminError(`An unexpected error occurred: ${error.message}`);
        } finally {
          // Re-enable button
          createAdminBtn.disabled = false;
          createAdminBtn.innerHTML = 'Create Admin';
        }
      });
    } else {
      console.error("Create admin button not found!");
    }
  }
  
  // Helper function to show admin creation error
  function showAdminError(message) {
    console.log("Showing admin error:", message);
    const errorMessage = document.getElementById('admin-error-message');
    errorMessage.textContent = message;
    errorMessage.classList.remove('d-none');
  }
  
  // Helper function to show admin creation success
  function showAdminSuccess(message) {
    console.log("Showing admin success:", message);
    const successMessage = document.getElementById('admin-success-message');
    successMessage.textContent = message;
    successMessage.classList.remove('d-none');
  }

  // Load users function
  async function loadUsers(isSuperAdmin) {
    const userListDiv = document.querySelector('.user-list');
    const userSearchInput = document.getElementById('user-search');
    
    // Add event listener for automatic search
    if (userSearchInput) {
      userSearchInput.addEventListener('input', () => {
        loadUsersWithFilter(isSuperAdmin, userSearchInput.value.toLowerCase());
      });
    }
    
    // Initial load without filter
    loadUsersWithFilter(isSuperAdmin, '');
    
    // Inner function to load users with filter
    async function loadUsersWithFilter(isSuperAdmin, searchTerm = '') {
      userListDiv.innerHTML = '<p>Loading users list...</p>';
      
      try {
        const usersCollection = collection(db, "users");
        const userQuerySnapshot = await getDocs(usersCollection);
        
        if (!userQuerySnapshot.empty) {
          const usersTable = document.createElement('table');          usersTable.innerHTML = `
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>User Type</th>
                <th>Status</th>
                <th>Created Date</th>
                <th>Last Login</th>
                ${isSuperAdmin ? '<th>Actions</th>' : ''}
              </tr>
            </thead>
            <tbody>
            </tbody>
          `;
          
          const tbody = usersTable.querySelector('tbody');
          let foundUsers = false;
            userQuerySnapshot.forEach((doc) => {
            const user = doc.data();
            
            // Skip super_admin users as requested - they should not appear in the users list
            if (user.user_type === 'super_admin') {
              return;
            }
            
            // Apply search filter if present
            if (searchTerm && 
                !user.name?.toLowerCase().includes(searchTerm) && 
                !user.email?.toLowerCase().includes(searchTerm)) {
              return;
            }
            
            foundUsers = true;
            const row = document.createElement('tr');
            
            // Name cell
            const nameCell = document.createElement('td');
            nameCell.textContent = user.name || 'No name';
            row.appendChild(nameCell);
            
            // Email cell
            const emailCell = document.createElement('td');
            emailCell.textContent = user.email || 'No email';
            row.appendChild(emailCell);
              // User type cell
            const typeCell = document.createElement('td');
            typeCell.textContent = user.user_type || 'user';
            row.appendChild(typeCell);
            
            // Status cell
            const statusCell = document.createElement('td');
            if (user.status === 'deactivated') {
              statusCell.innerHTML = '<span class="badge bg-danger">Deactivated</span>';
            } else {
              statusCell.innerHTML = '<span class="badge bg-success">Active</span>';
            }
            row.appendChild(statusCell);
            
            // Created date cell
            const createdCell = document.createElement('td');
            if (user.created_at) {
              const createdDate = user.created_at.toDate ? user.created_at.toDate() : new Date(user.created_at);
              createdCell.textContent = createdDate.toLocaleDateString();
            } else {
              createdCell.textContent = 'Unknown';
            }
            row.appendChild(createdCell);
            
            // Last login cell
            const loginCell = document.createElement('td');
            if (user.last_login) {
              const loginDate = user.last_login.toDate ? user.last_login.toDate() : new Date(user.last_login);
              loginCell.textContent = loginDate.toLocaleDateString();
            } else {
              loginCell.textContent = 'Never';
            }
            row.appendChild(loginCell);
            
            // Add action buttons for super admin
            if (isSuperAdmin) {
              const actionsCell = document.createElement('td');
              actionsCell.className = 'action-buttons';
                const deleteBtn = document.createElement('button');
              // If user is already deactivated, show "Activate" button
              if (user.status === 'deactivated') {
                deleteBtn.innerHTML = '<i class="fas fa-user-check"></i>';
                deleteBtn.className = 'btn-activate';
                deleteBtn.title = 'Activate User';
                deleteBtn.addEventListener('click', () => activateUser(doc.id, user.name));
              } else {
                deleteBtn.innerHTML = '<i class="fas fa-user-slash"></i>';
                deleteBtn.className = 'btn-deactivate';
                deleteBtn.title = 'Deactivate User';
                deleteBtn.addEventListener('click', () => deleteUser(doc.id, user.name));
              }
              
              const editBtn = document.createElement('button');
              editBtn.innerHTML = '<i class="fas fa-edit"></i>';
              editBtn.className = 'btn-edit';
              editBtn.title = 'Edit User';
              editBtn.addEventListener('click', () => editUser(doc.id, user));
              
              actionsCell.appendChild(editBtn);
              actionsCell.appendChild(deleteBtn);
              row.appendChild(actionsCell);
            }
            
            tbody.appendChild(row);
          });
          
          // Replace the loading message with the users table
          userListDiv.innerHTML = '';
          userListDiv.appendChild(usersTable);
          
          // Show message if no users match the search
          if (!foundUsers && searchTerm) {
            const noResults = document.createElement('p');
            noResults.textContent = `No users found matching "${searchTerm}"`;
            userListDiv.appendChild(noResults);
          } else if (!foundUsers) {
            userListDiv.innerHTML = '<p>No users found in the database.</p>';
          }
        } else {
          userListDiv.innerHTML = '<p>No users found in the database.</p>';
        }
      } catch (error) {
        console.error("Error fetching users:", error);
        userListDiv.innerHTML = '<p class="error-msg">Failed to load users list: ' + error.message + '</p>';
      }
    }
  }
  // Deactivate user function for super admin (previously delete function)
  async function deleteUser(userId, userName) {
    if (confirm(`Are you sure you want to deactivate the user ${userName}? Deactivated users will not be able to login.`)) {
      try {
        // Update the user document instead of deleting it
        await updateDoc(doc(db, "users", userId), {
          status: 'deactivated',
          deactivatedAt: serverTimestamp(),
          deactivatedBy: auth.currentUser.uid
        });
        
        alert(`User ${userName} has been deactivated.`);
        
        // Reload the user list
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userDocRef = doc(db, "users", currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            loadUsers(userDocSnap.data().user_type === 'super_admin');
          }
        }
      } catch (error) {
        console.error("Error deactivating user:", error);
        alert(`Error deactivating user: ${error.message}`);
      }
    }
  }
  
  // Activate user function for super admin
  async function activateUser(userId, userName) {
    if (confirm(`Are you sure you want to reactivate the user ${userName}? They will be able to login again.`)) {
      try {
        // Update the user document to remove deactivated status
        await updateDoc(doc(db, "users", userId), {
          status: 'active',
          activatedAt: serverTimestamp(),
          activatedBy: auth.currentUser.uid
        });
        
        alert(`User ${userName} has been reactivated.`);
        
        // Reload the user list
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userDocRef = doc(db, "users", currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            loadUsers(userDocSnap.data().user_type === 'super_admin');
          }
        }
      } catch (error) {
        console.error("Error activating user:", error);
        alert(`Error activating user: ${error.message}`);
      }
    }
  }
  
  // Edit user function for super admin
  function editUser(userId, userData) {
    // Create modal for editing user 
    const editUserModal = new bootstrap.Modal(document.getElementById('editUserModal'));
    
    // Populate form with current user data
    document.getElementById('edit-user-id').value = userId;
    document.getElementById('edit-user-name').value = userData.name || '';
    document.getElementById('edit-user-email').value = userData.email || '';
    document.getElementById('edit-user-type').value = userData.user_type || 'user';
    
    // Hide previous messages
    const errorMessage = document.getElementById('edit-user-error-message');
    const successMessage = document.getElementById('edit-user-success-message');
    errorMessage.classList.add('d-none');
    successMessage.classList.add('d-none');
    
    // Show the modal
    editUserModal.show();
    
    // Handle update button click
    const updateUserBtn = document.getElementById('update-user-btn');
    
    // Remove any existing event listeners to prevent duplicates
    const newUpdateBtn = updateUserBtn.cloneNode(true);
    updateUserBtn.parentNode.replaceChild(newUpdateBtn, updateUserBtn);
    
    // Add event listener to the new button
    newUpdateBtn.addEventListener('click', async () => {
      const editForm = document.getElementById('edit-user-form');
      
      // Basic form validation
      if (!editForm.checkValidity()) {
        editForm.reportValidity();
        return;
      }
      
      const newName = document.getElementById('edit-user-name').value;
      
      // Disable button during update process
      newUpdateBtn.disabled = true;
      newUpdateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Updating...';
      
      try {
        // Update the user document in Firestore
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
          name: newName,
          updatedAt: serverTimestamp()
        });
        
        // Hide the modal
        editUserModal.hide();
        
        // Show success message
        const successAlert = document.createElement('div');
        successAlert.className = 'alert alert-success alert-dismissible fade show';
        successAlert.innerHTML = `
          <strong>Success!</strong> User "${newName}" has been updated.
          <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        // Find the parent container to add the alert
        const container = document.querySelector('#users-page .content');
        container.insertBefore(successAlert, container.firstChild);
        
        // Remove success message after 3 seconds
        setTimeout(() => {
          successAlert.remove();
        }, 3000);
        
        // Reload users list
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userDocRef = doc(db, "users", currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            loadUsers(userDocSnap.data().user_type === 'super_admin');
          }
        }
        
      } catch (error) {
        console.error("Error updating user:", error);
        
        // Show error message in the modal
        errorMessage.textContent = `Error updating user: ${error.message}`;
        errorMessage.classList.remove('d-none');
        
        // Re-enable button
        newUpdateBtn.disabled = false;
        newUpdateBtn.innerHTML = 'Update User';
      }
    });
  }
  
  // Initialize items page functionality
  function initItemsPage() {
    const itemForm = document.getElementById('item-form');
    const saveItemBtn = document.getElementById('save-item-btn');
    const itemListDiv = document.querySelector('.item-list');
    const addItemModal = new bootstrap.Modal(document.getElementById('addItemModal'));
    const itemSearchInput = document.getElementById('item-search');
    
    // Load existing items
    loadItems();
    
    // Add event listener for automatic search
    if (itemSearchInput) {
      itemSearchInput.addEventListener('input', () => {
        loadItems(itemSearchInput.value.toLowerCase());
      });
    }
    
    // Handle item form submission
    if (saveItemBtn && itemForm) {
      saveItemBtn.addEventListener('click', async () => {
        // Basic form validation
        if (!itemForm.checkValidity()) {
          itemForm.reportValidity();
          return;
        }
        
        const itemName = itemForm.elements['item-name'].value;
        const itemDescription = itemForm.elements['item-description'].value;
        const itemPrice = parseFloat(itemForm.elements['item-price'].value);
        const itemQuantity = parseInt(itemForm.elements['item-quantity'].value);
        const itemAlertLevel = parseInt(itemForm.elements['item-alert-level'].value);
        // Get item type (sell or rent) from radio buttons
        const itemType = document.querySelector('input[name="item-type"]:checked').value;
        
        try {
          // Add the item to the items collection
          const itemRef = await addDoc(collection(db, "items"), {
            name: itemName,
            description: itemDescription,
            price: itemPrice,
            alertLevel: itemAlertLevel,
            itemType: itemType, // New field for item type
            createdAt: serverTimestamp()
          });
          
          // Add the initial quantity to the inventory collection
          await addDoc(collection(db, "inventory"), {
            itemId: itemRef.id,
            quantity: itemQuantity,
            addedAt: serverTimestamp(),
            addedBy: auth.currentUser.uid
          });
          
          // Reset form
          itemForm.reset();
          
          // Hide modal
          addItemModal.hide();
          
          // Show success message using alert
          const successAlert = document.createElement('div');
          successAlert.className = 'alert alert-success alert-dismissible fade show';
          successAlert.innerHTML = `
            <strong>Success!</strong> Item "${itemName}" added successfully!
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
          `;
          
          // Find the parent container to add the alert
          const container = document.querySelector('#items-page .content');
          container.insertBefore(successAlert, container.firstChild);
          
          // Remove success message after 3 seconds
          setTimeout(() => {
            successAlert.remove();
          }, 3000);
          
          // Reload items
          loadItems();
          
          // Update dashboard counts
          updateDashboardCounts();
          
        } catch (error) {
          console.error("Error adding item:", error);
          alert(`Error adding item: ${error.message}`);
        }
      });
    }
    
    // Load items function with search functionality
    async function loadItems(searchTerm = '') {
      if (itemListDiv) {
        itemListDiv.innerHTML = '<p>Loading items...</p>';
        
        try {
          const itemsCollection = collection(db, "items");
          const itemsSnapshot = await getDocs(itemsCollection);
          
          if (!itemsSnapshot.empty) {
            const itemsTable = document.createElement('table');
            itemsTable.innerHTML = `
              <thead>
                <tr>
                  <th><i class="fas fa-box me-1"></i> Item Name</th>
                  <th><i class="fas fa-align-left me-1"></i> Description</th>
                  <th><i class="fas fa-tag me-1"></i> Price</th>
                  <th><i class="fas fa-exchange-alt me-1"></i> Type</th>
                  <th><i class="fas fa-cubes me-1"></i> Quantity</th>
                  <th><i class="fas fa-exclamation-triangle me-1"></i> Alert Level</th>
                  <th><i class="fas fa-info-circle me-1"></i> Status</th>
                  <th><i class="fas fa-cogs me-1"></i> Actions</th>
                </tr>
              </thead>
              <tbody>
              </tbody>
            `;
            
            const tbody = itemsTable.querySelector('tbody');
            let foundItems = false;
            
            // Process each item
            for (const itemDoc of itemsSnapshot.docs) {
              const item = itemDoc.data();
              const itemId = itemDoc.id;
              
              // Apply search filter if present
              if (searchTerm && !item.name.toLowerCase().includes(searchTerm)) {
                continue;
              }
              
              foundItems = true;
              
              // Calculate total quantity from inventory collection
              const totalQuantity = await getItemTotalQuantity(itemId);
              
              const row = document.createElement('tr');
              
              // Item name cell
              const nameCell = document.createElement('td');
              nameCell.textContent = item.name;
              row.appendChild(nameCell);
              
              // Description cell
              const descriptionCell = document.createElement('td');
              descriptionCell.textContent = item.description || 'No description';
              row.appendChild(descriptionCell);
              
              // Price cell
              const priceCell = document.createElement('td');
              priceCell.textContent = `₱${item.price.toFixed(2)}`;
              row.appendChild(priceCell);
              
              // Item type cell
              const typeCell = document.createElement('td');
              if (item.itemType === 'rent') {
                const typeBadge = document.createElement('span');
                typeBadge.className = 'badge bg-info';
                typeBadge.textContent = 'For Rent';
                typeCell.appendChild(typeBadge);
              } else {
                const typeBadge = document.createElement('span');
                typeBadge.className = 'badge bg-primary';
                typeBadge.textContent = 'For Sale';
                typeCell.appendChild(typeBadge);
              }
              row.appendChild(typeCell);
              
              // Quantity cell
              const quantityCell = document.createElement('td');
              quantityCell.textContent = totalQuantity;
              row.appendChild(quantityCell);
              
              // Alert level cell
              const alertCell = document.createElement('td');
              alertCell.textContent = item.alertLevel;
              row.appendChild(alertCell);
              
              // Status cell
              const statusCell = document.createElement('td');
              if (totalQuantity <= 0) {
                statusCell.textContent = 'Out of Stock';
                statusCell.className = 'status-out';
              } else if (totalQuantity <= item.alertLevel) {
                statusCell.textContent = 'Low Stock';
                statusCell.className = 'status-low';
              } else {
                statusCell.textContent = 'In Stock';
                statusCell.className = 'status-ok';
              }
              row.appendChild(statusCell);
              
              // Actions cell
              const actionsCell = document.createElement('td');
              actionsCell.className = 'action-buttons';
              
              const editBtn = document.createElement('button');
              editBtn.innerHTML = '<i class="fas fa-edit"></i>';
              editBtn.className = 'btn-edit';
              editBtn.title = 'Edit Item';
              editBtn.addEventListener('click', () => editItem(itemId, item, totalQuantity));
              
              const deleteBtn = document.createElement('button');
              deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
              deleteBtn.className = 'btn-delete';
              deleteBtn.title = 'Delete Item';
              deleteBtn.addEventListener('click', () => deleteItem(itemId, item.name));
              
              actionsCell.appendChild(editBtn);
              actionsCell.appendChild(deleteBtn);
              row.appendChild(actionsCell);
              
              tbody.appendChild(row);
            }
            
            // Replace the loading message with the items table
            itemListDiv.innerHTML = '';
            itemListDiv.appendChild(itemsTable);
            
            // Show message if no items match the search
            if (!foundItems && searchTerm) {
              const noResults = document.createElement('p');
              noResults.textContent = `No items found matching "${searchTerm}"`;
              itemListDiv.appendChild(noResults);
            } else if (!foundItems) {
              itemListDiv.innerHTML = '<p>No items found. Add items using the form above.</p>';
            }
          } else {
            itemListDiv.innerHTML = '<p>No items found. Add items using the form above.</p>';
          }
        } catch (error) {
          console.error("Error loading items:", error);
          itemListDiv.innerHTML = `<p class="error-msg">Failed to load items: ${error.message}</p>`;
        }
      }
    }
    
    // Edit item function
    async function editItem(itemId, itemData, currentQuantity) {
      // Create modal for editing item
      const editItemModal = new bootstrap.Modal(document.getElementById('editItemModal'));
      
      // Populate form with current item data
      document.getElementById('edit-item-id').value = itemId;
      document.getElementById('edit-item-name').value = itemData.name;
      document.getElementById('edit-item-description').value = itemData.description || '';
      document.getElementById('edit-description-chars').textContent = (itemData.description || '').length;
      document.getElementById('edit-item-price').value = itemData.price;
      document.getElementById('edit-item-quantity').value = currentQuantity;
      document.getElementById('edit-item-alert-level').value = itemData.alertLevel;
      
      // Set item type radio buttons based on stored value
      if(itemData.itemType === 'rent') {
        document.getElementById('edit-item-type-rent').checked = true;
      } else {
        // Default to "sell" if not specified or is "sell"
        document.getElementById('edit-item-type-sell').checked = true;
      }
      
      // Show the modal
      editItemModal.show();
      
      // Handle update button click
      const updateItemBtn = document.getElementById('update-item-btn');
      
      // Remove any existing event listeners to prevent duplicates
      const newUpdateBtn = updateItemBtn.cloneNode(true);
      updateItemBtn.parentNode.replaceChild(newUpdateBtn, updateItemBtn);
      
      // Add event listener to the new button
      newUpdateBtn.addEventListener('click', async () => {
        const editForm = document.getElementById('edit-item-form');
        
        // Basic form validation
        if (!editForm.checkValidity()) {
          editForm.reportValidity();
          return;
        }
        
        const newName = document.getElementById('edit-item-name').value;
        const newDescription = document.getElementById('edit-item-description').value;
        const newPrice = parseFloat(document.getElementById('edit-item-price').value);
        const newQuantity = parseInt(document.getElementById('edit-item-quantity').value);
        const newAlertLevel = parseInt(document.getElementById('edit-item-alert-level').value);
        // Get item type from radio buttons
        const newItemType = document.querySelector('input[name="edit-item-type"]:checked').value;
        
        try {
          // Update the item document
          const itemRef = doc(db, "items", itemId);
          await updateDoc(itemRef, {
            name: newName,
            description: newDescription,
            price: newPrice,
            alertLevel: newAlertLevel,
            itemType: newItemType,
            updatedAt: serverTimestamp()
          });
          
          // Handle quantity changes
          if (newQuantity !== currentQuantity) {
            // Add inventory adjustment entry
            await addDoc(collection(db, "inventory"), {
              itemId: itemId,
              quantity: newQuantity - currentQuantity, // Positive for addition, negative for reduction
              addedAt: serverTimestamp(),
              addedBy: auth.currentUser.uid,
              adjustmentType: 'edit'
            });
          }
          
          // Hide the modal
          editItemModal.hide();
          
          // Show success message
          const successAlert = document.createElement('div');
          successAlert.className = 'alert alert-success alert-dismissible fade show';
          successAlert.innerHTML = `
            <strong>Success!</strong> Item "${newName}" updated successfully!
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
          `;
          
          // Add the alert to the page
          const container = document.querySelector('#items-page .content');
          container.insertBefore(successAlert, container.firstChild);
          
          // Remove the alert after 3 seconds
          setTimeout(() => {
            successAlert.remove();
          }, 3000);
          
          // Reload items
          loadItems();
          
          // Update dashboard counts
          updateDashboardCounts();
          
        } catch (error) {
          console.error("Error updating item:", error);
          alert(`Error updating item: ${error.message}`);
        }
      });
    }
    
    // Delete item function
    async function deleteItem(itemId, itemName) {
      if (confirm(`Are you sure you want to delete the item "${itemName}"?`)) {
        try {
          // Delete the item from the items collection
          await deleteDoc(doc(db, "items", itemId));
          
          // Delete all inventory entries for this item
          const inventoryQuery = query(collection(db, "inventory"), where("itemId", "==", itemId));
          const inventorySnapshot = await getDocs(inventoryQuery);
          
          const deletePromises = [];
          inventorySnapshot.forEach(doc => {
            deletePromises.push(deleteDoc(doc.ref));
          });
          
          await Promise.all(deletePromises);
          
          alert(`Item "${itemName}" has been deleted.`);
          
          // Reload items
          loadItems();
          
          // Update dashboard counts
          updateDashboardCounts();
        } catch (error) {
          console.error("Error deleting item:", error);
          alert(`Error deleting item: ${error.message}`);
        }
      }
    }
  }
  
  // Load inventory function
  async function loadInventory() {
    const inventoryListDiv = document.querySelector('.inventory-list');
    const transactionHistoryListDiv = document.querySelector('.transaction-history-list');
    const restockListDiv = document.querySelector('.restock-list');
    const inventorySearchInput = document.getElementById('inventory-search');
    const transactionFilterSelect = document.getElementById('transaction-filter');
    const restockFilterSelect = document.getElementById('restock-filter');
    
    // Initialize any Bootstrap tabs
    const triggerTabList = [].slice.call(document.querySelectorAll('#inventoryTabs button'));
    triggerTabList.forEach(function (triggerEl) {
      const tabTrigger = new bootstrap.Tab(triggerEl);
      
      triggerEl.addEventListener('click', function (event) {
        event.preventDefault();
        tabTrigger.show();
      });
    });
    
    // Load initial data for all tabs
    loadInventoryStatus('');
    loadTransactionHistory('all', '');
    loadRestockItems('all', '');
    
    // Add event listener for inventory search
    if (inventorySearchInput) {
      inventorySearchInput.addEventListener('input', () => {
        const searchTerm = inventorySearchInput.value.toLowerCase();
        const activeTab = document.querySelector('#inventoryTabs button.active').getAttribute('id');
        
        if (activeTab === 'inventory-status-tab') {
          loadInventoryStatus(searchTerm);
        } else if (activeTab === 'transaction-history-tab') {
          loadTransactionHistory(transactionFilterSelect.value, searchTerm);
        } else if (activeTab === 'restock-items-tab') {
          loadRestockItems(restockFilterSelect.value, searchTerm);
        }
      });
    }
    
    // Add event listener for transaction filter
    if (transactionFilterSelect) {
      transactionFilterSelect.addEventListener('change', () => {
        loadTransactionHistory(
          transactionFilterSelect.value, 
          inventorySearchInput.value.toLowerCase()
        );
      });
    }
    
    // Add event listener for restock filter
    if (restockFilterSelect) {
      restockFilterSelect.addEventListener('change', () => {
        loadRestockItems(
          restockFilterSelect.value,
          inventorySearchInput.value.toLowerCase()
        );
      });
    }
    
    // Add event listener for bulk restock button
    const bulkRestockBtn = document.getElementById('bulk-restock-btn');
    if (bulkRestockBtn) {
      bulkRestockBtn.addEventListener('click', processBulkRestock);
    }
    
    // Inner function to load inventory status with filter
    async function loadInventoryStatus(searchTerm = '') {
      if (inventoryListDiv) {
        inventoryListDiv.innerHTML = '<p class="text-center py-3"><div class="spinner-border text-primary" role="status"></div><p class="mt-2">Loading inventory status...</p></p>';
        
        try {
          const itemsCollection = collection(db, "items");
          const itemsSnapshot = await getDocs(itemsCollection);
          
          if (!itemsSnapshot.empty) {
            const inventoryTable = document.createElement('table');
            inventoryTable.className = 'table table-hover';
            inventoryTable.innerHTML = `
              <thead>
                <tr>
                  <th><i class="fas fa-box me-1"></i> Item Name</th>
                  <th><i class="fas fa-cubes me-1"></i> Current Quantity</th>
                  <th><i class="fas fa-exclamation-triangle me-1"></i> Alert Level</th>
                  <th><i class="fas fa-exchange-alt me-1"></i> Type</th>
                  <th><i class="fas fa-info-circle me-1"></i> Status</th>
                  <th><i class="fas fa-plus-circle me-1"></i> Quick Restock</th>
                </tr>
              </thead>
              <tbody>
              </tbody>
            `;
            
            const tbody = inventoryTable.querySelector('tbody');
            let foundItems = false;
            
            // Process each item
            for (const itemDoc of itemsSnapshot.docs) {
              const item = itemDoc.data();
              const itemId = itemDoc.id;
              
              // Apply search filter if present
              if (searchTerm && !item.name.toLowerCase().includes(searchTerm)) {
                continue;
              }
              
              foundItems = true;
              
              // Calculate total quantity from inventory collection
              const totalQuantity = await getItemTotalQuantity(itemId);
              
              const row = document.createElement('tr');
              
              // Item name cell
              const nameCell = document.createElement('td');
              nameCell.textContent = item.name;
              if (item.description) {
                const descSpan = document.createElement('span');
                descSpan.className = 'text-muted small d-block';
                descSpan.textContent = item.description.length > 50 ? 
                  item.description.substring(0, 50) + '...' : 
                  item.description;
                nameCell.appendChild(descSpan);
              }
              row.appendChild(nameCell);
              
              // Quantity cell
              const quantityCell = document.createElement('td');
              quantityCell.textContent = totalQuantity;
              row.appendChild(quantityCell);
              
              // Alert level cell
              const alertCell = document.createElement('td');
              alertCell.textContent = item.alertLevel;
              row.appendChild(alertCell);
              
              // Item type cell
              const typeCell = document.createElement('td');
              if (item.itemType === 'rent') {
                typeCell.innerHTML = '<span class="badge bg-info">For Rent</span>';
              } else {
                typeCell.innerHTML = '<span class="badge bg-primary">For Sale</span>';
              }
              row.appendChild(typeCell);
              
              // Status cell
              const statusCell = document.createElement('td');
              if (totalQuantity <= 0) {
                statusCell.textContent = 'Out of Stock';
                statusCell.className = 'status-out';
              } else if (totalQuantity <= item.alertLevel) {
                statusCell.textContent = 'Low Stock';
                statusCell.className = 'status-low';
              } else {
                statusCell.textContent = 'In Stock';
                statusCell.className = 'status-ok';
              }
              row.appendChild(statusCell);
              
              // Quick restock cell
              const restockCell = document.createElement('td');
              
              const restockForm = document.createElement('form');
              restockForm.className = 'restock-form d-flex';
              restockForm.innerHTML = `
                <input type="number" min="1" value="1" class="restock-quantity form-control me-2" required style="width: 80px;">
                <button type="submit" class="btn btn-primary btn-sm">Add</button>
              `;
              
              restockForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const addQuantity = parseInt(restockForm.querySelector('.restock-quantity').value);
                
                try {
                  // Add a new inventory entry for the additional quantity
                  await addDoc(collection(db, "inventory"), {
                    itemId: itemId,
                    quantity: addQuantity,
                    addedAt: serverTimestamp(),
                    addedBy: auth.currentUser.uid,
                    adjustmentType: 'restock'
                  });
                  
                  // Show success message
                  const successMsg = document.createElement('div');
                  successMsg.className = 'alert alert-success p-1 mt-2';
                  successMsg.textContent = `Added ${addQuantity} units`;
                  restockCell.appendChild(successMsg);
                  
                  // Remove success message after 3 seconds
                  setTimeout(() => {
                    successMsg.remove();
                    
                    // Reload data for all tabs to reflect the new inventory
                    loadInventoryStatus(searchTerm);
                    loadTransactionHistory(transactionFilterSelect.value, searchTerm);
                    loadRestockItems(restockFilterSelect.value, searchTerm);
                    
                    // Update dashboard counts
                    updateDashboardCounts();
                  }, 3000);
                  
                } catch (error) {
                  console.error("Error restocking item:", error);
                  alert(`Error restocking item: ${error.message}`);
                }
              });
              
              restockCell.appendChild(restockForm);
              row.appendChild(restockCell);
              
              tbody.appendChild(row);
            }
            
            // Replace the loading message with the inventory table
            inventoryListDiv.innerHTML = '';
            inventoryListDiv.appendChild(inventoryTable);
            
            // Show message if no items match the search
            if (!foundItems && searchTerm) {
              const noResults = document.createElement('p');
              noResults.className = 'text-center py-3';
              noResults.textContent = `No inventory items found matching "${searchTerm}"`;
              inventoryListDiv.appendChild(noResults);
            } else if (!foundItems) {
              inventoryListDiv.innerHTML = '<p class="text-center py-3">No items found in inventory.</p>';
            }
          } else {
            inventoryListDiv.innerHTML = '<p class="text-center py-3">No items found in inventory.</p>';
          }
        } catch (error) {
          console.error("Error loading inventory:", error);
          inventoryListDiv.innerHTML = `<p class="error-msg text-center py-3">Failed to load inventory: ${error.message}</p>`;
        }
      }
    }
    
    // Function to load transaction history with filters
    async function loadTransactionHistory(filterType = 'all', searchTerm = '') {
      if (transactionHistoryListDiv) {
        transactionHistoryListDiv.innerHTML = '<p class="text-center py-3"><div class="spinner-border text-primary" role="status"></div><p class="mt-2">Loading transaction history...</p></p>';
        
        try {
          const inventoryCollection = collection(db, "inventory");
          let inventoryQuery;
          
          // Apply filter if it's not 'all'
          if (filterType !== 'all') {
            inventoryQuery = query(inventoryCollection, where("adjustmentType", "==", filterType));
          } else {
            inventoryQuery = inventoryCollection;
          }
          
          const inventorySnapshot = await getDocs(inventoryQuery);
          
          if (!inventorySnapshot.empty) {
            // Create a lookup of item ids to names for faster reference
            const itemsMap = {};
            const itemsCollection = collection(db, "items");
            const itemsSnapshot = await getDocs(itemsCollection);
            itemsSnapshot.forEach(doc => {
              itemsMap[doc.id] = doc.data().name;
            });
            
            // Create an array of all transactions for sorting
            const transactions = [];
            for (const doc of inventorySnapshot.docs) {
              const transaction = {
                id: doc.id,
                ...doc.data()
              };
              
              // Check if we need to apply search filter
              const itemName = itemsMap[transaction.itemId] || 'Unknown Item';
              if (searchTerm && !itemName.toLowerCase().includes(searchTerm)) {
                continue;
              }
              
              transactions.push(transaction);
            }
            
            // Get rental transactions if filterType is 'all' or 'rental'
            if (filterType === 'all' || filterType === 'rental') {
              const activeRentalsQuery = query(
                collection(db, "rentals"),
                where("status", "==", "active")
              );
              const activeRentalsSnapshot = await getDocs(activeRentalsQuery);
              
              activeRentalsSnapshot.forEach(doc => {
                const rental = doc.data();
                
                // Process each rental as individual transactions
                if (rental.items && Array.isArray(rental.items)) {
                  rental.items.forEach(item => {
                    const itemName = itemsMap[item.itemId] || 'Unknown Item';
                    
                    // Apply search filter if present
                    if (searchTerm && !itemName.toLowerCase().includes(searchTerm)) {
                      return;
                    }
                    
                    transactions.push({
                      id: doc.id + '-' + item.itemId,
                      itemId: item.itemId,
                      quantity: -item.quantity, // Negative quantity since it's reserved
                      addedAt: rental.dateAdded ? new Date(rental.dateAdded) : rental.createdAt,
                      addedBy: rental.userId,
                      adjustmentType: 'rental',
                      rentalId: doc.id,
                      rentalDueDate: rental.dueDate
                    });
                  });
                } 
                // Legacy support for old rental format
                else if (rental.itemId) {
                  const itemName = itemsMap[rental.itemId] || 'Unknown Item';
                  
                  // Apply search filter if present
                  if (searchTerm && !itemName.toLowerCase().includes(searchTerm)) {
                    return;
                  }
                  
                  transactions.push({
                    id: doc.id,
                    itemId: rental.itemId,
                    quantity: -(rental.quantity || 1), // Negative quantity since it's reserved
                    addedAt: rental.dateAdded ? new Date(rental.dateAdded) : rental.createdAt,
                    addedBy: rental.userId,
                    adjustmentType: 'rental',
                    rentalId: doc.id,
                    rentalDueDate: rental.dueDate
                  });
                }
              });
            }
            
            // Sort transactions by date (newest first)
            transactions.sort((a, b) => {
              const dateA = a.addedAt ? (a.addedAt.toDate ? a.addedAt.toDate() : new Date(a.addedAt)) : new Date(0);
              const dateB = b.addedAt ? (b.addedAt.toDate ? b.addedAt.toDate() : new Date(b.addedAt)) : new Date(0);
              return dateB - dateA;
            });
            
            // Create and populate the table
            const transactionTable = document.createElement('table');
            transactionTable.className = 'table table-striped';
            transactionTable.innerHTML = `
              <thead>
                <tr>
                  <th><i class="fas fa-calendar me-1"></i> Date</th>
                  <th><i class="fas fa-box me-1"></i> Item</th>
                  <th><i class="fas fa-sort-numeric-up-alt me-1"></i> Quantity Change</th>
                  <th><i class="fas fa-user-edit me-1"></i> Modified by</th>
                  <th><i class="fas fa-tag me-1"></i> Type</th>
                </tr>
              </thead>
              <tbody>
              </tbody>
            `;
            
            const tbody = transactionTable.querySelector('tbody');
            
            // Generate lookup for all users (both admins and regular users)
            const userNames = {};
            const usersCollection = collection(db, "users");
            const usersSnapshot = await getDocs(usersCollection);
            usersSnapshot.forEach(doc => {
              userNames[doc.id] = doc.data().name || 'Unknown User';
            });
            
            // Process each transaction
            for (const transaction of transactions) {
              const row = document.createElement('tr');
              
              // Date cell
              const dateCell = document.createElement('td');
              if (transaction.addedAt) {
                let date;
                if (transaction.addedAt.toDate) {
                  date = transaction.addedAt.toDate();
                } else if (transaction.addedAt instanceof Date) {
                  date = transaction.addedAt;
                } else {
                  date = new Date(transaction.addedAt);
                }
                dateCell.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
              } else {
                dateCell.textContent = 'Unknown date';
              }
              row.appendChild(dateCell);
              
              // Item cell
              const itemCell = document.createElement('td');
              itemCell.textContent = itemsMap[transaction.itemId] || 'Unknown Item';
              row.appendChild(itemCell);
              
              // Quantity change cell
              const quantityCell = document.createElement('td');
              const quantity = transaction.quantity;
              
              if (quantity > 0) {
                quantityCell.innerHTML = `<span class="text-success">+${quantity}</span>`;
              } else if (quantity < 0) {
                quantityCell.innerHTML = `<span class="text-danger">${quantity}</span>`;
              } else {
                quantityCell.textContent = '0';
              }
              row.appendChild(quantityCell);
              
              // Modified by cell
              const modifiedByCell = document.createElement('td');
              modifiedByCell.textContent = userNames[transaction.addedBy] || 'Unknown User';
              row.appendChild(modifiedByCell);
              
              // Type cell
              const typeCell = document.createElement('td');
              let typeClass, typeText;
              
              switch(transaction.adjustmentType) {
                case 'edit':
                  typeClass = 'bg-warning text-dark';
                  typeText = 'Manual Edit';
                  break;
                case 'order':
                  typeClass = 'bg-primary';
                  typeText = 'Order';
                  break;
                case 'cancelled_order':
                  typeClass = 'bg-info';
                  typeText = 'Order Return';
                  break;
                case 'restock':
                  typeClass = 'bg-success';
                  typeText = 'Restock';
                  break;
                case 'rental':
                  typeClass = 'bg-info';
                  typeText = 'Rental';
                  break;
                default:
                  typeClass = 'bg-secondary';
                  typeText = transaction.adjustmentType || 'Initial';
              }
              
              typeCell.innerHTML = `<span class="badge ${typeClass}">${typeText}</span>`;
              row.appendChild(typeCell);
              
              tbody.appendChild(row);
            }
            
            transactionHistoryListDiv.innerHTML = '';
            transactionHistoryListDiv.appendChild(transactionTable);
            
            // Show message if no transactions
            if (transactions.length === 0) {
              let message = 'No transactions found';
              if (searchTerm) {
                message += ` matching "${searchTerm}"`;
              }
              if (filterType !== 'all') {
                message += ` with filter type "${filterType}"`;
              }
              transactionHistoryListDiv.innerHTML = `<p class="text-center py-3">${message}</p>`;
            }
            
          } else {
            transactionHistoryListDiv.innerHTML = '<p class="text-center py-3">No inventory transactions found.</p>';
          }
        } catch (error) {
          console.error("Error loading transaction history:", error);
          transactionHistoryListDiv.innerHTML = `<p class="error-msg text-center py-3">Failed to load transaction history: ${error.message}</p>`;
        }
      }
    }
    
    // Function to load restock items tab with filters
    async function loadRestockItems(filterType = 'all', searchTerm = '') {
      if (restockListDiv) {
        restockListDiv.innerHTML = '<p class="text-center py-3"><div class="spinner-border text-primary" role="status"></div><p class="mt-2">Loading restock items...</p></p>';
        
        try {
          const itemsCollection = collection(db, "items");
          const itemsSnapshot = await getDocs(itemsCollection);
          
          if (!itemsSnapshot.empty) {
            // Create restock form table
            const restockTable = document.createElement('table');
            restockTable.className = 'table table-hover';
            restockTable.innerHTML = `
              <thead>
                <tr>
                  <th><input type="checkbox" id="select-all-items" class="form-check-input"></th>
                  <th><i class="fas fa-box me-1"></i> Item Name</th>
                  <th><i class="fas fa-cubes me-1"></i> Current Quantity</th>
                  <th><i class="fas fa-exclamation-triangle me-1"></i> Alert Level</th>
                  <th><i class="fas fa-info-circle me-1"></i> Status</th>
                  <th><i class="fas fa-plus-circle me-1"></i> Restock Quantity</th>
                </tr>
              </thead>
              <tbody>
              </tbody>
            `;
            
            const tbody = restockTable.querySelector('tbody');
            let foundItems = false;
            
            // Process each item
            for (const itemDoc of itemsSnapshot.docs) {
              const item = itemDoc.data();
              const itemId = itemDoc.id;
              
              // Calculate total quantity from inventory collection
              const totalQuantity = await getItemTotalQuantity(itemId);
              
              // Apply filters
              if (
                (filterType === 'out_of_stock' && totalQuantity > 0) ||
                (filterType === 'low_stock' && totalQuantity > item.alertLevel) ||
                (searchTerm && !item.name.toLowerCase().includes(searchTerm))
              ) {
                continue;
              }
              
              foundItems = true;
              
              const row = document.createElement('tr');
              
              // Checkbox cell
              const checkboxCell = document.createElement('td');
              const checkbox = document.createElement('input');
              checkbox.type = 'checkbox';
              checkbox.className = 'form-check-input item-checkbox';
              checkbox.dataset.itemId = itemId;
              checkbox.dataset.itemName = item.name;
              checkboxCell.appendChild(checkbox);
              row.appendChild(checkboxCell);
              
              // Item name cell
              const nameCell = document.createElement('td');
              nameCell.textContent = item.name;
              row.appendChild(nameCell);
              
              // Quantity cell
              const quantityCell = document.createElement('td');
              quantityCell.textContent = totalQuantity;
              row.appendChild(quantityCell);
              
              // Alert level cell
              const alertCell = document.createElement('td');
              alertCell.textContent = item.alertLevel;
              row.appendChild(alertCell);
              
              // Status cell
              const statusCell = document.createElement('td');
              if (totalQuantity <= 0) {
                statusCell.innerHTML = '<span class="badge bg-danger">Out of Stock</span>';
              } else if (totalQuantity <= item.alertLevel) {
                statusCell.innerHTML = '<span class="badge bg-warning text-dark">Low Stock</span>';
              } else {
                statusCell.innerHTML = '<span class="badge bg-success">In Stock</span>';
              }
              row.appendChild(statusCell);
              
              // Restock quantity cell
              const restockCell = document.createElement('td');
              const restockInput = document.createElement('input');
              restockInput.type = 'number';
              restockInput.min = '1';
              restockInput.value = '1';
              restockInput.className = 'form-control restock-item-quantity';
              restockInput.dataset.itemId = itemId;
              
              // Auto-calculate recommended restock quantity based on alert level
              if (totalQuantity <= 0) {
                // If out of stock, suggest a quantity to reach alert level + some buffer
                const suggestedQuantity = item.alertLevel + 5;
                restockInput.value = suggestedQuantity;
                
                // Add a small note about the suggestion
                const suggestionNote = document.createElement('small');
                suggestionNote.className = 'text-muted';
                suggestionNote.textContent = `Suggested quantity to maintain stock level`;
                restockCell.appendChild(restockInput);
                restockCell.appendChild(suggestionNote);
              } else if (totalQuantity <= item.alertLevel) {
                // If low stock, suggest a quantity to reach above alert level
                const suggestedQuantity = item.alertLevel - totalQuantity + 5;
                restockInput.value = suggestedQuantity;
                restockCell.appendChild(restockInput);
              } else {
                restockCell.appendChild(restockInput);
              }
              
              row.appendChild(restockCell);
              tbody.appendChild(row);
            }
            
            // Replace the loading message with the restock table
            restockListDiv.innerHTML = '';
            restockListDiv.appendChild(restockTable);
            
            // Add event listener to "select all" checkbox
            const selectAllCheckbox = document.getElementById('select-all-items');
            if (selectAllCheckbox) {
              selectAllCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                document.querySelectorAll('.item-checkbox').forEach(checkbox => {
                  checkbox.checked = isChecked;
                });
              });
            }
            
            // Show message if no items match the filters
            if (!foundItems) {
              let message = 'No items found';
              if (searchTerm) {
                message += ` matching "${searchTerm}"`;
              }
              if (filterType !== 'all') {
                message += ` with filter type "${filterType}"`;
              }
              restockListDiv.innerHTML = `<p class="text-center py-3">${message}</p>`;
            }
          } else {
            restockListDiv.innerHTML = '<p class="text-center py-3">No items found to restock.</p>';
          }
        } catch (error) {
          console.error("Error loading restock items:", error);
          restockListDiv.innerHTML = `<p class="error-msg text-center py-3">Failed to load restock items: ${error.message}</p>`;
        }
      }
    }
    
    // Process bulk restock
    async function processBulkRestock() {
      const selectedCheckboxes = document.querySelectorAll('.item-checkbox:checked');
      
      if (selectedCheckboxes.length === 0) {
        alert("Please select at least one item to restock.");
        return;
      }
      
      if (!confirm(`Are you sure you want to restock ${selectedCheckboxes.length} items?`)) {
        return;
      }
      
      // Display loading indicator
      const bulkRestockBtn = document.getElementById('bulk-restock-btn');
      const originalBtnText = bulkRestockBtn.innerHTML;
      bulkRestockBtn.disabled = true;
      bulkRestockBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...';
      
      const restockResults = {
        success: 0,
        failed: 0,
        details: []
      };
      
      // Process each selected item
      for (const checkbox of selectedCheckboxes) {
        const itemId = checkbox.dataset.itemId;
        const itemName = checkbox.dataset.itemName;
        
        // Find corresponding quantity input
        const quantityInput = document.querySelector(`.restock-item-quantity[data-item-id="${itemId}"]`);
        const quantity = parseInt(quantityInput?.value || 1);
        
        if (quantity <= 0) {
          restockResults.failed++;
          restockResults.details.push({
            itemName,
            success: false,
            message: 'Invalid quantity'
          });
          continue;
        }
        
        try {
          // Add a new inventory entry for the additional quantity
          await addDoc(collection(db, "inventory"), {
            itemId: itemId,
            quantity: quantity,
            addedAt: serverTimestamp(),
            addedBy: auth.currentUser.uid,
            adjustmentType: 'restock',
            notes: `Bulk restock of ${quantity} units`
          });
          
          restockResults.success++;
          restockResults.details.push({
            itemName,
            success: true,
            quantity
          });
        } catch (error) {
          console.error(`Error restocking item ${itemName}:`, error);
          restockResults.failed++;
          restockResults.details.push({
            itemName,
            success: false,
            message: error.message
          });
        }
      }
      
      // Re-enable button and restore original text
      bulkRestockBtn.disabled = false;
      bulkRestockBtn.innerHTML = originalBtnText;
      
      // Show results
      let resultMessage = `Restocking complete: ${restockResults.success} successful, ${restockResults.failed} failed.`;
      
      if (restockResults.details.length > 0) {
        resultMessage += "\n\nDetails:";
        restockResults.details.forEach(item => {
          if (item.success) {
            resultMessage += `\n✅ ${item.itemName}: Added ${item.quantity} units`;
          } else {
            resultMessage += `\n❌ ${item.itemName}: ${item.message}`;
          }
        });
      }
      
      alert(resultMessage);
      
      // Reload data
      loadInventoryStatus(inventorySearchInput.value.toLowerCase());
      loadTransactionHistory(transactionFilterSelect.value, inventorySearchInput.value.toLowerCase());
      loadRestockItems(restockFilterSelect.value, inventorySearchInput.value.toLowerCase());
      
      // Update dashboard counts
      updateDashboardCounts();
    }
  }
  
  // Get shipping address from order data
  function getShippingAddress(order) {
    let address = '';
    
    if (order.shippingAddress) {
      address = order.shippingAddress;
    } else if (order.shipping && typeof order.shipping === 'string') {
      address = order.shipping;
    } else if (order.shipping && typeof order.shipping === 'object') {
      const { street, city, province, zip, phone, notes } = order.shipping;
      address = `${street || ''}, ${city || ''}, ${province || ''} ${zip || ''}`;
      
      if (phone) {
        address += `<br>Phone: ${phone}`;
      }
      
      if (notes) {
        address += `<br>Notes: ${notes}`;
      }
    }
    
    return address || 'No address provided';
  }
    // Function to update dashboard counts
  async function updateDashboardCounts() {
    try {
      // Get users count
      const usersSnapshot = await getDocs(collection(db, "users"));
      const usersCount = document.getElementById('users-count');
      if (usersCount) {
        usersCount.textContent = usersSnapshot.size;
      }
      
      // Get items count
      const itemsSnapshot = await getDocs(collection(db, "items"));
      const itemsCount = document.getElementById('items-count');
      if (itemsCount) {
        itemsCount.textContent = itemsSnapshot.size;
      }
      
      // Get low stock and out of stock items count
      let lowStockCount = 0;
      let outOfStockCount = 0;
      const lowStockItems = [];
      const outOfStockItems = [];
      
      for (const itemDoc of itemsSnapshot.docs) {
        const item = itemDoc.data();
        const itemId = itemDoc.id;
        const totalQuantity = await getItemTotalQuantity(itemId);
        
        if (totalQuantity <= 0) {
          outOfStockCount++;
          outOfStockItems.push({ 
            id: itemId,
            name: item.name, 
            quantity: totalQuantity,
            alertLevel: item.alertLevel
          });
        } else if (totalQuantity <= item.alertLevel) {
          lowStockCount++;
          lowStockItems.push({ 
            id: itemId,
            name: item.name, 
            quantity: totalQuantity,
            alertLevel: item.alertLevel
          });
        }
      }
      
      const lowStockCountElem = document.getElementById('low-stock-count');
      const lowStockCard = document.getElementById('low-stock-card');
      if (lowStockCountElem) {
        lowStockCountElem.textContent = lowStockCount;
      }
      
      // Set up low stock tooltip/popover
      if (lowStockCard && lowStockItems.length > 0) {
        let lowStockContent = '<div class="dashboard-popover"><h6>Low Stock Items</h6><ul class="list-group">';
        lowStockItems.forEach(item => {
          lowStockContent += `<li class="list-group-item d-flex justify-content-between align-items-center">
            ${item.name} <span class="badge bg-warning text-dark">${item.quantity}/${item.alertLevel}</span></li>`;
        });
        lowStockContent += '</ul></div>';
        
        // Initialize popover
        const lowStockPopover = new bootstrap.Popover(lowStockCard, {
          html: true,
          trigger: 'hover',
          content: lowStockContent,
          placement: 'bottom',
          container: 'body'
        });
      }
      
      const outOfStockCountElem = document.getElementById('out-of-stock-count');
      const outOfStockCard = document.getElementById('out-of-stock-card');
      if (outOfStockCountElem) {
        outOfStockCountElem.textContent = outOfStockCount;
      }
      
      // Set up out of stock tooltip/popover
      if (outOfStockCard && outOfStockItems.length > 0) {
        let outOfStockContent = '<div class="dashboard-popover"><h6>Out of Stock Items</h6><ul class="list-group">';
        outOfStockItems.forEach(item => {
          outOfStockContent += `<li class="list-group-item d-flex justify-content-between align-items-center">
            ${item.name} <span class="badge bg-danger">0/${item.alertLevel}</span></li>`;
        });
        outOfStockContent += '</ul></div>';
        
        // Initialize popover
        const outOfStockPopover = new bootstrap.Popover(outOfStockCard, {
          html: true,
          trigger: 'hover',
          content: outOfStockContent,
          placement: 'bottom',
          container: 'body'
        });
      }
      
      // Get orders counts
      const ordersSnapshot = await getDocs(collection(db, "orders"));
      let pendingCount = 0;
      let completedCount = 0;
      
      ordersSnapshot.forEach(doc => {
        const order = doc.data();
        if (order.status === 'finished') {
          completedCount++;
        } else {
          pendingCount++;
        }
      });
      
      const pendingOrderCountElem = document.getElementById('pending-order-count');
      if (pendingOrderCountElem) {
        pendingOrderCountElem.textContent = pendingCount;
      }
        const completedOrderCountElem = document.getElementById('completed-order-count');
      if (completedOrderCountElem) {
        completedOrderCountElem.textContent = completedCount;
      }
      
      // Initialize dashboard cards if they exist
      initDashboardCards();
      
    } catch (error) {
      console.error("Error updating dashboard counts:", error);
    }
  }
  
  // Load and manage orders
  async function loadOrders() {
    const orderSearchInput = document.getElementById('order-search');
    const pendingOrdersListDiv = document.querySelector('.pending-orders-list');
    const completedOrdersListDiv = document.querySelector('.completed-orders-list');
    
    // Add event listener for search functionality
    if (orderSearchInput) {
      orderSearchInput.addEventListener('input', () => {
        const searchTerm = orderSearchInput.value.toLowerCase();
        loadOrdersWithFilter(searchTerm);
      });
    }
    
    // Initial load without filter
    loadOrdersWithFilter('');
    
    // Load orders with filter
    async function loadOrdersWithFilter(searchTerm = '') {
      if (pendingOrdersListDiv && completedOrdersListDiv) {
        pendingOrdersListDiv.innerHTML = '<p class="text-center py-4"><div class="spinner-border text-warning" role="status"></div><p class="mt-2">Loading pending orders...</p></p>';
        completedOrdersListDiv.innerHTML = '<p class="text-center py-4"><div class="spinner-border text-success" role="status"></div><p class="mt-2">Loading completed orders...</p></p>';
        
        try {
          // Fetch all orders from the orders collection
          const ordersCollection = collection(db, "orders");
          const ordersSnapshot = await getDocs(ordersCollection);
          
          console.log("Orders fetched:", ordersSnapshot.size); // Debug log
          
          if (!ordersSnapshot.empty) {
            // Create tables for pending and completed orders
            const pendingTable = createOrdersTable();
            const completedTable = createOrdersTable();
            
            let foundPendingOrders = false;
            let foundCompletedOrders = false;
            
            // Create array from snapshot for processing
            const orders = [];
            ordersSnapshot.forEach(doc => {
              orders.push({
                id: doc.id,
                ...doc.data()
              });
            });
            
            // Sort orders by creation date (newest first)
            orders.sort((a, b) => {
              const dateA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
              const dateB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
              return dateB - dateA;
            });
            
            // Process each order
            for (const order of orders) {
              const orderId = order.id;
              
              // Ensure order has required properties with defaults
              if (!order.status) order.status = 'pending';
              if (!order.totalAmount && !order.total) order.total = 0;
              else if (order.totalAmount && !order.total) order.total = order.totalAmount;
              
             
              // Set customer information
              if (!order.customer) {
                if (order.userId) {
                  // Try to fetch user information
                  try {
                    const userDoc = await getDoc(doc(db, "users", order.userId));
                    if (userDoc.exists()) {
                      const userData = userDoc.data();
                      order.customer = {
                        name: userData.name || order.userName || 'Unknown',
                        email: userData.email || order.userEmail || 'No email',
                        phone: userData.phone || 'No phone'
                      };
                    } else {
                      order.customer = {
                        name: order.userName || 'Unknown',
                        email: order.userEmail || 'No email',
                        phone: 'No phone'
                      };
                    }
                  } catch (error) {
                    console.error("Error fetching user data:", error);
                    order.customer = {
                      name: order.userName || 'Unknown',
                      email: order.userEmail || 'No email',
                      phone: 'No phone'
                    };
                  }
                } else {
                  order.customer = {
                    name: order.userName || 'Unknown',
                    email: order.userEmail || 'No email',
                    phone: 'No phone'
                  };
                }
              }
              
              // Set shipping address if it doesn't exist but shippingAddress does
              if (!order.shipping && order.shippingAddress) {
                order.shipping = { address: order.shippingAddress };
              } else if (!order.shipping) {
                order.shipping = { address: 'No address provided' };
              }
              
              // Set empty items array if not exists
              if (!order.items) {
                order.items = [];
              } else if (Array.isArray(order.items)) {
                // Fetch additional item details if needed
                for (let i = 0; i < order.items.length; i++) {
                  const item = order.items[i];
                  if (item.itemId && (!item.name || !item.description)) {
                    try {
                      const itemDoc = await getDoc(doc(db, "items", item.itemId));
                      if (itemDoc.exists()) {
                        const itemData = itemDoc.data();
                        order.items[i] = {
                          ...item,
                          name: item.name || itemData.name || 'Unknown Item',
                          description: item.description || itemData.description || '',
                          price: item.price || itemData.price || 0
                        };
                      }
                    } catch (error) {
                      console.error(`Error fetching item details for ${item.itemId}:`, error);
                    }
                  }
                }
              }
              
              // Skip if order doesn't match search term
              if (searchTerm && 
                  !orderId.toLowerCase().includes(searchTerm) && 
                  !(order.customer?.name || '').toLowerCase().includes(searchTerm) && 
                  !(order.customer?.email || '').toLowerCase().includes(searchTerm)) {
                continue;
              }
              
              // Create order row
              const row = createOrderRow(order, orderId);
              
              // Add to appropriate table based on status
              if (order.status === 'finished' || order.status === 'cancelled') {
                completedTable.querySelector('tbody').appendChild(row);
                foundCompletedOrders = true;
              } else {
                pendingTable.querySelector('tbody').appendChild(row);
                foundPendingOrders = true;
              }
            }
            
            // Update pending orders list
            pendingOrdersListDiv.innerHTML = '';
            if (foundPendingOrders) {
              pendingOrdersListDiv.appendChild(pendingTable);
            } else {
              const noOrdersMsg = document.createElement('p');
              noOrdersMsg.className = 'text-center py-3';
              noOrdersMsg.innerHTML = searchTerm 
                ? `No pending orders match "${searchTerm}"`
                : 'No pending orders found';
              pendingOrdersListDiv.appendChild(noOrdersMsg);
            }
            
            // Update completed orders list
            completedOrdersListDiv.innerHTML = '';
            if (foundCompletedOrders) {
              completedOrdersListDiv.appendChild(completedTable);
            } else {
              const noOrdersMsg = document.createElement('p');
              noOrdersMsg.className = 'text-center py-3';
              noOrdersMsg.innerHTML = searchTerm 
                ? `No completed orders match "${searchTerm}"`
                : 'No completed orders found';
              completedOrdersListDiv.appendChild(noOrdersMsg);
            }
          } else {
            console.log("No orders found in the database"); // Debug log
            // No orders found
            pendingOrdersListDiv.innerHTML = '<p class="text-center py-3">No pending orders found</p>';
            completedOrdersListDiv.innerHTML = '<p class="text-center py-3">No completed orders found</p>';
          }
        } catch (error) {
          console.error("Error loading orders:", error);
          pendingOrdersListDiv.innerHTML = `<p class="error-msg">Error loading orders: ${error.message}</p>`;
          completedOrdersListDiv.innerHTML = `<p class="error-msg">Error loading orders: ${error.message}</p>`;
        }
      }
    }
    
    // Create table structure for orders
    function createOrdersTable() {
      const table = document.createElement('table');
      table.className = 'table table-hover';
      table.innerHTML = `
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Total</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      return table;
    }
    
    // Create a row for an order
    function createOrderRow(order, orderId) {
      const row = document.createElement('tr');
      
      // Order ID cell
      const idCell = document.createElement('td');
      idCell.textContent = orderId.substring(0, 8) + '...';
      idCell.title = orderId;
      row.appendChild(idCell);
      
      // Date cell
      const dateCell = document.createElement('td');
      if (order.createdAt) {
        try {
          const orderDate = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
          dateCell.textContent = orderDate.toLocaleDateString();
        } catch (error) {
          console.error("Error formatting date:", error);
          dateCell.textContent = 'Invalid Date';
        }
      } else {
        dateCell.textContent = 'Unknown';
      }
      row.appendChild(dateCell);
      
      // Customer cell
      const customerCell = document.createElement('td');
      customerCell.textContent = order.customer?.name || 'Anonymous';
      row.appendChild(customerCell);
      
      // Total cell
      const totalCell = document.createElement('td');
      try {
        totalCell.textContent = `₱${parseFloat(order.total || 0).toFixed(2)}`;
      } catch (error) {
        totalCell.textContent = `₱0.00`;
      }
      row.appendChild(totalCell);
      
      // Status cell
      const statusCell = document.createElement('td');
      const statusBadge = document.createElement('span');
      statusBadge.className = 'badge';
      
      switch(order.status) {
        case 'pending':
          statusBadge.classList.add('bg-warning', 'text-dark');
          statusBadge.textContent = 'Pending';
          break;
        case 'processing':
          statusBadge.classList.add('bg-info', 'text-dark');
          statusBadge.textContent = 'Processing';
          break;
        case 'shipped':
          statusBadge.classList.add('bg-primary');
          statusBadge.textContent = 'Shipped';
          break;
        case 'finished':
          statusBadge.classList.add('bg-success');
          statusBadge.textContent = 'Finished';
          break;
        case 'cancelled':
          statusBadge.classList.add('bg-danger');
          statusBadge.textContent = 'Cancelled';
          break;
        default:
          statusBadge.classList.add('bg-secondary');
          statusBadge.textContent = order.status || 'Unknown';
      }
      
      statusCell.appendChild(statusBadge);
      row.appendChild(statusCell);
      
      // Actions cell
      const actionsCell = document.createElement('td');
      
      // View details button for all orders
      const viewBtn = document.createElement('button');
      viewBtn.className = 'btn btn-sm btn-outline-primary me-1';
      viewBtn.innerHTML = '<i class="fas fa-eye"></i>';
      viewBtn.title = 'View Order Details';
      viewBtn.addEventListener('click', () => viewOrderDetails(orderId, order));
      actionsCell.appendChild(viewBtn);
      
      row.appendChild(actionsCell);
      
      return row;
    }
    
    // View order details
    async function viewOrderDetails(orderId, order) {
      const modal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
      
      try {
        // Refresh order data to ensure we have the latest information
        const orderDoc = await getDoc(doc(db, "orders", orderId));
        if (orderDoc.exists()) {
          // Merge existing order data with fresh data from the database
          const freshOrderData = orderDoc.data();
          order = {
            ...order,
            ...freshOrderData,
            id: orderId
          };
        }
        
        // Populate order information
        document.getElementById('order-id').textContent = orderId;
        
        // Format order date
        let orderDate = 'Unknown';
        if (order.createdAt) {
          try {
            const date = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
            orderDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
          } catch (error) {
            console.error("Error formatting date:", error);
            orderDate = 'Invalid Date';
          }
        }
        document.getElementById('order-date').textContent = orderDate;
        
        // Set total amount - handle different field names for total
        const totalAmount = order.total || order.totalAmount || 0;
        document.getElementById('order-total').textContent = `₱${parseFloat(totalAmount).toFixed(2)}`;
        document.getElementById('modal-order-total').textContent = `₱${parseFloat(totalAmount).toFixed(2)}`;
        
        // Set order status
        const statusBadge = document.getElementById('order-status');
        statusBadge.className = 'badge';
        
        switch(order.status) {
          case 'pending':
            statusBadge.classList.add('bg-warning', 'text-dark');
            statusBadge.textContent = 'Pending';
            break;
          case 'processing':
            statusBadge.classList.add('bg-info', 'text-dark');
            statusBadge.textContent = 'Processing';
            break;
          case 'shipped':
            statusBadge.classList.add('bg-primary');
            statusBadge.textContent = 'Shipped';
            break;
          case 'finished':
            statusBadge.classList.add('bg-success');
            statusBadge.textContent = 'Finished';
            break;
          case 'cancelled':
            statusBadge.classList.add('bg-danger');
            statusBadge.textContent = 'Cancelled';
            break;
          default:
            statusBadge.classList.add('bg-secondary');
            statusBadge.textContent = order.status || 'Unknown';
        }
        
        // Set customer information
        document.getElementById('customer-name').textContent = order.customer?.name || order.userName || 'Anonymous';
        document.getElementById('customer-email').textContent = order.customer?.email || order.userEmail || 'N/A';
        
        // Set shipping address
        const addressElem = document.getElementById('shipping-address');
        if (order.shipping?.address) {
          addressElem.innerHTML = formatShippingAddress(order.shipping.address);
        } else if (order.shippingAddress) {
          addressElem.innerHTML = formatShippingAddress(order.shippingAddress);
        } else {
          addressElem.innerHTML = 'No shipping address provided';
        }
        
        // Populate order items
        const orderItemsList = document.getElementById('order-items-list');
        orderItemsList.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div> Loading items...</td></tr>';
        
        if (order.items && order.items.length) {
          orderItemsList.innerHTML = '';
          let orderTotal = 0;
          
          // Process each item
          for (let i = 0; i < order.items.length; i++) {
            const item = order.items[i];
            let itemName = item.name;
            let itemDescription = item.description;
            let itemPrice = item.price;
            
            // If we only have itemId but missing details, fetch from items collection
            if (item.itemId && (!itemName || !itemPrice)) {
              try {
                const itemDoc = await getDoc(doc(db, "items", item.itemId));
                if (itemDoc.exists()) {
                  const itemData = itemDoc.data();
                  itemName = itemName || itemData.name;
                  itemDescription = itemDescription || itemData.description;
                  itemPrice = itemPrice || itemData.price;
                }
              } catch (err) {
                console.error(`Error fetching item data for ${item.itemId}:`, err);
              }
            }
            
            const row = document.createElement('tr');
            
            // Item name/description
            const itemCell = document.createElement('td');
            itemCell.innerHTML = `<strong>${itemName || 'Unknown Item'}</strong>`;
            if (itemDescription) {
              const descElem = document.createElement('div');
              descElem.className = 'small text-muted';
              descElem.textContent = itemDescription;
              itemCell.appendChild(descElem);
            }
            row.appendChild(itemCell);
            
            // Item price
            const priceCell = document.createElement('td');
            priceCell.className = 'text-center';
            priceCell.textContent = `₱${parseFloat(itemPrice || 0).toFixed(2)}`;
            row.appendChild(priceCell);
            
            // Item quantity
            const quantityCell = document.createElement('td');
            quantityCell.className = 'text-center';
            quantityCell.textContent = item.quantity || 1;
            row.appendChild(quantityCell);
            
            // Calculate subtotal
            const quantity = parseInt(item.quantity || 1);
            const price = parseFloat(itemPrice || 0);
            const subtotal = quantity * price;
            orderTotal += subtotal;
            
            // Item subtotal
            const subtotalCell = document.createElement('td');
            subtotalCell.className = 'text-end';
            subtotalCell.textContent = `₱${subtotal.toFixed(2)}`;
            row.appendChild(subtotalCell);
            
            orderItemsList.appendChild(row);
          }
          
          // Update order total if it was calculated differently
          if (Math.abs(orderTotal - totalAmount) > 0.01) {
            console.log(`Warning: Calculated total (${orderTotal}) differs from order total (${totalAmount})`);
          }
          
        } else {
          orderItemsList.innerHTML = '';
          const emptyRow = document.createElement('tr');
          const emptyCell = document.createElement('td');
          emptyCell.colSpan = 4;
          emptyCell.className = 'text-center';
          emptyCell.textContent = 'No items found for this order';
          emptyRow.appendChild(emptyCell);
          orderItemsList.appendChild(emptyRow);
        }
        
        // Set up status update functionality - hide for finished or cancelled orders
        const statusUpdateSection = document.getElementById('status-update-section');
        
        if (order.status === 'finished' || order.status === 'cancelled') {
          // Hide status update section for finished or cancelled orders
          statusUpdateSection.style.display = 'none';
        } else {
          // Show status update section for pending/processing/shipped orders
          statusUpdateSection.style.display = 'block';
          
          const statusSelect = document.getElementById('status-select');
          statusSelect.value = order.status || 'pending';
          
          const updateStatusBtn = document.getElementById('update-status-btn');
          
          // Remove any existing event listeners
          const newUpdateBtn = updateStatusBtn.cloneNode(true);
          updateStatusBtn.parentNode.replaceChild(newUpdateBtn, updateStatusBtn);
          
          // Add event listener to update status
          newUpdateBtn.addEventListener('click', async () => {
            const newStatus = statusSelect.value;
            
            try {
              // Update the order status in Firestore
              const orderRef = doc(db, "orders", orderId);
              await updateDoc(orderRef, {
                status: newStatus,
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser.uid
              });
              
              // If the order is being cancelled, return the inventory
              if (newStatus === 'cancelled') {
                // Return inventory quantities
                if (order.items && order.items.length > 0) {
                  for (const item of order.items) {
                    if (item.itemId && item.quantity) {
                      try {
                        // Add a positive inventory adjustment to return the items to stock
                        await addDoc(collection(db, "inventory"), {
                          itemId: item.itemId,
                          quantity: item.quantity, // Positive quantity to return to inventory
                          addedAt: serverTimestamp(),
                          addedBy: auth.currentUser.uid,
                          adjustmentType: 'cancelled_order',
                          orderId: orderId // Reference to the cancelled order
                        });
                        console.log(`Returned ${item.quantity} of item ${item.itemId} to inventory`);
                      } catch (error) {
                        console.error(`Error returning inventory for item ${item.itemId}:`, error);
                      }
                    }
                  }
                }
              }
              
              // Update the status badge in the modal
              statusBadge.className = 'badge';
              
              switch(newStatus) {
                case 'pending':
                  statusBadge.classList.add('bg-warning', 'text-dark');
                  statusBadge.textContent = 'Pending';
                  break;
                case 'processing':
                  statusBadge.classList.add('bg-info', 'text-dark');
                  statusBadge.textContent = 'Processing';
                  break;
                case 'shipped':
                  statusBadge.classList.add('bg-primary');
                  statusBadge.textContent = 'Shipped';
                  break;
                case 'finished':
                  statusBadge.classList.add('bg-success');
                  statusBadge.textContent = 'Finished';
                  
                  // Hide status update section when status changes to finished
                  statusUpdateSection.style.display = 'none';
                  break;
                case 'cancelled':
                  statusBadge.classList.add('bg-danger');
                  statusBadge.textContent = 'Cancelled';
                  break;
              }
              
              // Show success message
              const successMsg = document.createElement('div');
              successMsg.className = 'alert alert-success mt-3';
              successMsg.innerHTML = `<i class="fas fa-check-circle me-2"></i>Order status updated to <strong>${newStatus}</strong>`;
              
              statusUpdateSection.appendChild(successMsg);
              
              // Remove success message after 3 seconds
              setTimeout(() => {
                successMsg.remove();
              }, 3000);
              
              // Reload orders to reflect the status change
              loadOrdersWithFilter(orderSearchInput.value.toLowerCase());
              
              // Update dashboard counts
              updateDashboardCounts();
              
            } catch (error) {
              console.error("Error updating order status:", error);
              
              // Show error message
              const errorMsg = document.createElement('div');
              errorMsg.className = 'alert alert-danger mt-3';
              errorMsg.innerHTML = `<i class="fas fa-exclamation-circle me-2"></i>Error: ${error.message}`;
              
              statusUpdateSection.appendChild(errorMsg);
              
              // Remove error message after 5 seconds
              setTimeout(() => {
                errorMsg.remove();
              }, 5000);
            }
          });
        }
      } catch (error) {
        console.error("Error displaying order details:", error);
        
        // Show error in the modal
        document.getElementById('order-items-list').innerHTML = `
          <tr>
            <td colspan="4" class="text-center text-danger">
              <i class="fas fa-exclamation-triangle me-2"></i>
              Error loading order details: ${error.message}
            </td>
          </tr>
        `;
      }
        // Show the modal
      modal.show();
    }
  }
  
  // Initialize dashboard card click functionality
  function initDashboardCards() {
    const dashboardCards = document.querySelectorAll('.dashboard-card');
    
    dashboardCards.forEach(card => {
      card.addEventListener('click', () => {
        // Get the target page from data attribute
        const targetPage = card.dataset.page;
        const inventoryType = card.dataset.inventoryType;
        
        // Navigate to target page
        const menuItem = document.querySelector(`.sidebar-menu li[data-page="${targetPage}"]`);
        if (menuItem) {
          // First navigate to target page
          menuItem.click();
          
          // Then apply appropriate filter if needed for inventory items
          if (inventoryType && targetPage === 'inventory') {
            setTimeout(() => {
              if (inventoryType === 'low') {
                const restockTab = document.getElementById('restock-items-tab');
                if (restockTab) {
                  restockTab.click();
                }
                
                const restockFilter = document.getElementById('restock-filter');
                if (restockFilter) {
                  restockFilter.value = 'low_stock';
                  // Trigger change event to apply filter
                  restockFilter.dispatchEvent(new Event('change'));
                }
              } else if (inventoryType === 'out') {
                const restockTab = document.getElementById('restock-items-tab');
                if (restockTab) {
                  restockTab.click();
                }
                
                const restockFilter = document.getElementById('restock-filter');
                if (restockFilter) {
                  restockFilter.value = 'out_of_stock';
                  // Trigger change event to apply filter
                  restockFilter.dispatchEvent(new Event('change'));
                }
              }
            }, 500); // Give time for the inventory page to load
          }
        }
      });
    });
  }
  
  // Call initDashboardCards after auth state is confirmed and dashboard is visible
  const initObserver = new MutationObserver((mutations) => {
    const dashboardPage = document.getElementById('dashboard-page');
    if (dashboardPage && !dashboardPage.classList.contains('hidden')) {
      initDashboardCards();
      initObserver.disconnect(); // No need to observe anymore
    }
  });
  
  // Start observing the document with the configured parameters
  initObserver.observe(document.body, { attributes: true, subtree: true });
    // Load and analyze sales data
  async function loadSales() {
    const salesListDiv = document.querySelector('.sales-list');
    const filterSalesBtn = document.getElementById('filter-sales-btn');
    const startDateInput = document.getElementById('sales-date-start');
    const endDateInput = document.getElementById('sales-date-end');
    
    // Set default date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    startDateInput.valueAsDate = thirtyDaysAgo;
    endDateInput.valueAsDate = today;
    
    // Load initial sales data
    loadSalesData(startDateInput.value, endDateInput.value);
    
    // Add event listener for filter button
    if (filterSalesBtn) {
      filterSalesBtn.addEventListener('click', () => {
        loadSalesData(startDateInput.value, endDateInput.value);
      });
    }
      // Function to load sales data with date filters
    async function loadSalesData(startDate, endDate) {
      // Show loading state
      salesListDiv.innerHTML = '<p class="text-center my-4"><div class="spinner-border text-primary" role="status"></div><br><span class="mt-2 d-block">Loading sales data...</span></p>';
      
      try {
        // Convert input strings to date objects for comparison
        const startDateObj = new Date(startDate);
        startDateObj.setHours(0, 0, 0, 0);
        
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        
        // Fetch item data for later use
        const itemsMap = {};
        const itemsSnapshot = await getDocs(collection(db, "items"));
        itemsSnapshot.forEach(doc => {
          itemsMap[doc.id] = {
            id: doc.id,
            ...doc.data()
          };
        });
        
        // Query orders from Firestore
        const ordersQuery = query(
          collection(db, "orders"),
          where("status", "in", ["finished", "shipped"])
        );
        const ordersSnapshot = await getDocs(ordersQuery);
        
        // Also query completed rentals
        const rentalsQuery = query(
          collection(db, "rentals"),
          where("status", "in", ["completed", "finished"])
        );
        const rentalsSnapshot = await getDocs(rentalsQuery);
        
        // Initialize arrays and counters
        const filteredOrders = [];
        let totalSales = 0;
        let totalOrderItems = 0;
        
        // Process regular order sales
        ordersSnapshot.forEach(doc => {
          const orderData = doc.data();
          let orderDate;
          
          // Handle different date formats in orders
          if (orderData.createdAt) {
            if (orderData.createdAt.toDate) {
              // Firestore timestamp
              orderDate = orderData.createdAt.toDate();
            } else if (orderData.createdAt.seconds) {
              // Timestamp object
              orderDate = new Date(orderData.createdAt.seconds * 1000);
            } else {
              // Try to parse as date string
              orderDate = new Date(orderData.createdAt);
            }
          } else {
            // If no date found, use current date
            orderDate = new Date();
          }
          
          // Check if order is within date range
          if (orderDate >= startDateObj && orderDate <= endDateObj) {
            // Calculate order amount properly from items if available
            let orderAmount = 0;
            let itemCount = 0;
            
            // Calculate from items array if it exists
            if (orderData.items && Array.isArray(orderData.items)) {
              orderData.items.forEach(item => {
                const quantity = parseInt(item.quantity || 1);
                const price = parseFloat(item.price || 0);
                orderAmount += quantity * price;
                itemCount += quantity;
              });
              totalOrderItems += itemCount;
            } 
            // Fallback to total field if items array is not available or empty
            else if (orderData.total) {
              orderAmount = parseFloat(orderData.total);
              itemCount = 1; // Assume at least one item
              totalOrderItems += 1;
            }
            
            totalSales += orderAmount;
            
            // Add to filtered orders
            filteredOrders.push({
              id: doc.id,
              date: orderDate,
              customer: orderData.customer?.name || orderData.userName || 'Anonymous',
              amount: orderAmount,
              status: orderData.status || 'unknown',
              type: 'order',
              itemCount
            });
          }
        });
        
        // Process rental sales
        rentalsSnapshot.forEach(doc => {
          const rentalData = doc.data();
          let rentalDate;
          let rentalAmount = 0;
          let itemCount = 0;
          
          // Handle different date formats in rentals
          if (rentalData.completedDate) {
            if (rentalData.completedDate.toDate) {
              rentalDate = rentalData.completedDate.toDate();
            } else {
              rentalDate = new Date(rentalData.completedDate);
            }
          } else if (rentalData.dateCompleted) {
            rentalDate = new Date(rentalData.dateCompleted);
          } else if (rentalData.createdAt) {
            if (rentalData.createdAt.toDate) {
              rentalDate = rentalData.createdAt.toDate();
            } else {
              rentalDate = new Date(rentalData.createdAt);
            }
          } else if (rentalData.dateAdded) {
            rentalDate = new Date(rentalData.dateAdded);
          } else {
            rentalDate = new Date();
          }
          
          // Check if rental is within date range
          if (rentalDate >= startDateObj && rentalDate <= endDateObj) {
            // Calculate rental amount
            if (rentalData.finalAmount) {
              rentalAmount = parseFloat(rentalData.finalAmount);
            } else if (rentalData.totalAmount) {
              rentalAmount = parseFloat(rentalData.totalAmount);
            } else if (rentalData.depositAmount) {
              rentalAmount = parseFloat(rentalData.depositAmount);
            }
            
            // Count items in rental
            if (rentalData.items && Array.isArray(rentalData.items)) {
              rentalData.items.forEach(item => {
                itemCount += parseInt(item.quantity || 1);
              });
            } else if (rentalData.itemId) {
              // Old rental format with single item
              itemCount = parseInt(rentalData.quantity || 1);
            }
            
            totalOrderItems += itemCount;
            totalSales += rentalAmount;
            
            // Add to filtered orders
            filteredOrders.push({
              id: doc.id,
              date: rentalDate,
              customer: rentalData.customer?.name || rentalData.userName || rentalData.customerName || 'Anonymous',
              amount: rentalAmount,
              status: rentalData.status || 'completed',
              type: 'rental',
              itemCount
            });
          }
        });
        
        // Sort orders by date (newest first)
        filteredOrders.sort((a, b) => b.date - a.date);
        
        // Update summary metrics
        const totalOrdersCount = filteredOrders.length;
        const averageOrderValue = totalOrdersCount > 0 ? totalSales / totalOrdersCount : 0;
        
        document.getElementById('total-sales-amount').textContent = `₱${totalSales.toFixed(2)}`;
        document.getElementById('total-orders-count').textContent = totalOrdersCount;
        document.getElementById('average-order-value').textContent = `₱${averageOrderValue.toFixed(2)}`;
        
        // Add the total items sold display if element exists
        const totalItemsElem = document.getElementById('total-items-sold');
        if (totalItemsElem) {
          totalItemsElem.textContent = totalOrderItems;
        }
        
        // Create and populate table
        if (salesListDiv) {
          if (filteredOrders.length > 0) {
            const table = document.createElement('table');
            table.className = 'table table-striped table-hover';
            table.innerHTML = `
              <thead>
                <tr>
                  <th>Date</th>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th class="text-end">Amount</th>
                </tr>
              </thead>
              <tbody></tbody>
            `;
            
            const tbody = table.querySelector('tbody');
            
            filteredOrders.forEach(order => {
              const row = document.createElement('tr');
              
              // Format date
              const dateCell = document.createElement('td');
              const formattedDate = order.date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric'
              });
              dateCell.textContent = formattedDate;
              row.appendChild(dateCell);
              
              // Order ID
              const idCell = document.createElement('td');
              idCell.textContent = order.id.substring(0, 8) + '...';
              idCell.title = order.id;
              row.appendChild(idCell);
              
              // Transaction Type
              const typeCell = document.createElement('td');
              const typeBadge = document.createElement('span');
              typeBadge.className = 'badge';
              
              if (order.type === 'rental') {
                typeBadge.classList.add('bg-info');
                typeBadge.textContent = 'Rental';
              } else {
                typeBadge.classList.add('bg-primary');
                typeBadge.textContent = 'Sale';
              }
              
              typeCell.appendChild(typeBadge);
              row.appendChild(typeCell);
              
              // Customer
              const customerCell = document.createElement('td');
              customerCell.textContent = order.customer;
              row.appendChild(customerCell);
              
              // Status
              const statusCell = document.createElement('td');
              const statusBadge = document.createElement('span');
              statusBadge.className = 'badge';
              
              switch(order.status) {
                case 'finished':
                case 'completed':
                  statusBadge.classList.add('bg-success');
                  statusBadge.textContent = 'Completed';
                  break;
                case 'shipped':
                  statusBadge.classList.add('bg-info');
                  statusBadge.textContent = 'Shipped';
                  break;
                default:
                  statusBadge.classList.add('bg-secondary');
                  statusBadge.textContent = order.status || 'Unknown';
              }
              
              statusCell.appendChild(statusBadge);
              row.appendChild(statusCell);
              
              // Amount
              const amountCell = document.createElement('td');
              amountCell.className = 'text-end';
              amountCell.textContent = `₱${order.amount.toFixed(2)}`;
              row.appendChild(amountCell);
              
              tbody.appendChild(row);
            });
              salesListDiv.innerHTML = '';
            salesListDiv.appendChild(table);
            
            // Update sales count badge
            const salesCountBadge = document.getElementById('sales-count');
            if (salesCountBadge) {
              salesCountBadge.textContent = `${filteredOrders.length} sales`;
            }
          } else {
            salesListDiv.innerHTML = '<div class="alert alert-info">No sales data found for the selected date range.</div>';
            
            // Update sales count badge to show zero
            const salesCountBadge = document.getElementById('sales-count');
            if (salesCountBadge) {
              salesCountBadge.textContent = '0 sales';
            }
          }
        }
        
      } catch (error) {
        console.error("Error loading sales data:", error);
        salesListDiv.innerHTML = `<div class="alert alert-danger">Error loading sales data: ${error.message}</div>`;
      }
    }
  }
});