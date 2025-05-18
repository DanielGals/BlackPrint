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
          }
        });
      }
    });
    
    // Handle sidebar logout button
    sidebarLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
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
        
        try {
          // Add the item to the items collection
          const itemRef = await addDoc(collection(db, "items"), {
            name: itemName,
            description: itemDescription,
            price: itemPrice,
            alertLevel: itemAlertLevel,
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
        
        try {
          // Update the item document
          const itemRef = doc(db, "items", itemId);
          await updateDoc(itemRef, {
            name: newName,
            description: newDescription,
            price: newPrice,
            alertLevel: newAlertLevel,
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
    const inventorySearchInput = document.getElementById('inventory-search');
    
    // Add event listener for automatic search
    if (inventorySearchInput) {
      inventorySearchInput.addEventListener('input', () => {
        loadInventoryWithFilter(inventorySearchInput.value.toLowerCase());
      });
    }
    
    // Initial load without filter
    loadInventoryWithFilter('');
    
    // Inner function to load inventory with filter
    async function loadInventoryWithFilter(searchTerm = '') {
      if (inventoryListDiv) {
        inventoryListDiv.innerHTML = '<p>Loading inventory...</p>';
        
        try {
          const itemsCollection = collection(db, "items");
          const itemsSnapshot = await getDocs(itemsCollection);
          
          if (!itemsSnapshot.empty) {
            const inventoryTable = document.createElement('table');
            inventoryTable.innerHTML = `
              <thead>
                <tr>
                  <th><i class="fas fa-box me-1"></i> Item Name</th>
                  <th><i class="fas fa-cubes me-1"></i> Current Quantity</th>
                  <th><i class="fas fa-exclamation-triangle me-1"></i> Alert Level</th>
                  <th><i class="fas fa-info-circle me-1"></i> Status</th>
                  <th><i class="fas fa-plus-circle me-1"></i> Actions</th>
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
              
              // Actions cell with restock form
              const actionsCell = document.createElement('td');
              
              const restockForm = document.createElement('form');
              restockForm.className = 'restock-form d-flex';
              restockForm.innerHTML = `
                <input type="number" min="1" value="1" class="restock-quantity form-control me-2" required style="width: 80px;">
                <button type="submit" class="btn btn-primary btn-sm">Restock</button>
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
                    addedBy: auth.currentUser.uid
                  });
                  
                  // Show success message
                  const successMsg = document.createElement('div');
                  successMsg.className = 'alert alert-success p-1 mt-2';
                  successMsg.textContent = `Added ${addQuantity} units`;
                  actionsCell.appendChild(successMsg);
                  
                  // Remove success message after 3 seconds
                  setTimeout(() => {
                    successMsg.remove();
                    
                    // Reload inventory after success
                    loadInventoryWithFilter(searchTerm);
                    
                    // Update dashboard counts
                    updateDashboardCounts();
                  }, 3000);
                  
                } catch (error) {
                  console.error("Error restocking item:", error);
                  alert(`Error restocking item: ${error.message}`);
                }
              });
              
              actionsCell.appendChild(restockForm);
              row.appendChild(actionsCell);
              
              tbody.appendChild(row);
            }
            
            // Replace the loading message with the inventory table
            inventoryListDiv.innerHTML = '';
            inventoryListDiv.appendChild(inventoryTable);
            
            // Show message if no items match the search
            if (!foundItems && searchTerm) {
              const noResults = document.createElement('p');
              noResults.textContent = `No inventory items found matching "${searchTerm}"`;
              inventoryListDiv.appendChild(noResults);
            } else if (!foundItems) {
              inventoryListDiv.innerHTML = '<p>No items found in inventory.</p>';
            }
          } else {
            inventoryListDiv.innerHTML = '<p>No items found in inventory.</p>';
          }
        } catch (error) {
          console.error("Error loading inventory:", error);
          inventoryListDiv.innerHTML = `<p class="error-msg">Failed to load inventory: ${error.message}</p>`;
        }
      }
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
      
      for (const itemDoc of itemsSnapshot.docs) {
        const item = itemDoc.data();
        const totalQuantity = await getItemTotalQuantity(itemDoc.id);
        
        if (totalQuantity <= 0) {
          outOfStockCount++;
        } else if (totalQuantity <= item.alertLevel) {
          lowStockCount++;
        }
      }
      
      const lowStockCountElem = document.getElementById('low-stock-count');
      if (lowStockCountElem) {
        lowStockCountElem.textContent = lowStockCount;
      }
      
      const outOfStockCountElem = document.getElementById('out-of-stock-count');
      if (outOfStockCountElem) {
        outOfStockCountElem.textContent = outOfStockCount;
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
});