import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, addDoc, updateDoc, deleteDoc, query, where } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
  const userName = document.getElementById('user-name');
  const contentContainer = document.querySelector('.content');
  
  // Sidebar functionality
  const sidebarMenuItems = document.querySelectorAll('.sidebar-menu li');
  const pageContainers = document.querySelectorAll('.page-container');
  const sidebarLogout = document.getElementById('sidebar-logout');
  
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
            
            // Load orders when navigating to orders page
            if (pageName === 'orders') {
              loadUserOrders();
            }
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
          
          // Load orders when navigating to orders page
          if (pageName === 'orders') {
            loadUserOrders();
          }
        }
      });
    });
  }
  
  // Add loading indicator
  const loadingIndicator = document.createElement('p');
  loadingIndicator.textContent = 'Loading user dashboard...';
  contentContainer.appendChild(loadingIndicator);
  
  // Add event listener for the "Continue Shopping" button
  document.addEventListener('click', (e) => {
    // Check if the clicked element has data-page="home" attribute
    if (e.target.getAttribute('data-page') === 'home') {
      e.preventDefault();
      
      // Hide all page containers
      pageContainers.forEach(container => {
        container.classList.add('hidden');
      });
      
      // Show home page
      const homePage = document.getElementById('home-page');
      if (homePage) {
        homePage.classList.remove('hidden');
      }
      
      // Update sidebar active menu
      sidebarMenuItems.forEach(menuItem => {
        if (menuItem.id !== 'sidebar-logout') {
          menuItem.classList.remove('active');
          if (menuItem.getAttribute('data-page') === 'home') {
            menuItem.classList.add('active');
          }
        }
      });
    }
  });
  
  // User's cart
  let cart = [];
  
  // Check authentication state
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Remove loading indicator
      loadingIndicator.remove();
      
      try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const userData = docSnap.data();
          
          // Check if user is an admin, redirect if they are
          if (userData.user_type === 'admin' || userData.user_type === 'super_admin') {
            window.location.href = 'admin.html';
            return;
          }
          
          // Initialize sidebar
          initSidebar();
          
          // Display user name
          userName.textContent = userData.name;
          
          // Also update the sidebar user name
          const sidebarUserName = document.getElementById('sidebar-user-name');
          if (sidebarUserName) {
            sidebarUserName.textContent = userData.name;
          }
          
          // Display user email in sidebar
          const userEmail = document.getElementById('user-email');
          if (userEmail) {
            userEmail.textContent = userData.email;
          }
          
          // Update last login timestamp
          await setDoc(doc(db, "users", user.uid), {
            last_login: serverTimestamp()
          }, { merge: true });
          
          // Load cart from localStorage if it exists
          const savedCart = localStorage.getItem(`cart_${user.uid}`);
          if (savedCart) {
            try {
              cart = JSON.parse(savedCart);
              updateCartBadge();
            } catch (e) {
              console.error("Error parsing cart from localStorage:", e);
              cart = [];
            }
          }
          
          // Set up search functionality
          const searchInput = document.getElementById('search-items');
          if (searchInput) {
            searchInput.addEventListener('input', () => {
              loadItems(searchInput.value.toLowerCase());
            });
          }
          
          // Load available items
          loadItems();
          
          // Load cart
          loadCart();
          
        } else {
          // User doesn't exist in Firestore, sign out and redirect to login
          alert('User not found. Please contact support.');
          await signOut(auth);
          window.location.href = 'login.html';
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        // Display error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-msg';
        errorDiv.textContent = "An error occurred while loading the user dashboard. Please refresh the page.";
        contentContainer.appendChild(errorDiv);
      }
    } else {
      // No user is signed in, redirect to login
      window.location.href = 'login.html';
    }
  });
  
  // Load items function
  async function loadItems(searchQuery = '') {
    const itemsCatalog = document.querySelector('.items-catalog');
    if (itemsCatalog) {
      itemsCatalog.innerHTML = '<p>Loading available items...</p>';
      
      try {
        const itemsCollection = collection(db, "items");
        const itemsSnapshot = await getDocs(itemsCollection);
        
        if (!itemsSnapshot.empty) {
          itemsCatalog.innerHTML = '';
          
          // Process each item
          for (const doc of itemsSnapshot.docs) {
            const item = doc.data();
            const itemId = doc.id;
            
            if (item.name.toLowerCase().includes(searchQuery)) {
              // Get the total quantity from inventory collection
              const totalQuantity = await getItemTotalQuantity(itemId);
              
              const itemCard = document.createElement('div');
              itemCard.className = 'col-md-6 col-lg-4 col-xl-3';
              
              // Set badge status based on quantity
              let badgeStatus, badgeText;
              if (totalQuantity <= 0) {
                badgeStatus = 'bg-danger';
                badgeText = 'Out of Stock';
              } else if (totalQuantity <= 3) {
                badgeStatus = 'bg-warning';
                badgeText = 'Low Stock';
              } else {
                badgeStatus = 'bg-success';
                badgeText = 'In Stock';
              }
              
              // Create item card content without image, adjusted for text-only display
              itemCard.innerHTML = `
                <div class="card item-card">
                  <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                      <span class="badge ${badgeStatus} me-2">
                        ${badgeText}
                      </span>
                      <small class="text-muted">${totalQuantity} available</small>
                    </div>
                    <h5 class="card-title">${item.name}</h5>
                    <p class="card-text text-muted small">${item.description || 'No description available'}</p>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                      <span class="text-success fw-bold">₱${item.price.toFixed(2)}</span>
                    </div>
                    ${totalQuantity <= 0 ? 
                      `<button class="btn btn-secondary w-100" disabled>Out of Stock</button>` : 
                      totalQuantity <= 3 ?
                      `<button class="btn btn-warning w-100 add-to-cart"><i class="fas fa-cart-plus"></i> Add to Cart</button>` :
                      `<button class="btn btn-success w-100 add-to-cart"><i class="fas fa-cart-plus"></i> Add to Cart</button>`
                    }
                  </div>
                </div>
              `;
              
              // Add button event listener if item is in stock (even low stock)
              if (totalQuantity > 0) {
                const addButton = itemCard.querySelector('.add-to-cart');
                addButton.addEventListener('click', () => {
                  addToCart(itemId, {...item, quantity: totalQuantity});
                });
              }
              
              itemsCatalog.appendChild(itemCard);
            }
          }
          
          // If no items match the search
          if (itemsCatalog.children.length === 0) {
            itemsCatalog.innerHTML = '<div class="col-12"><p>No items match your search.</p></div>';
          }
        } else {
          itemsCatalog.innerHTML = '<div class="col-12"><p>No items are available at this time.</p></div>';
        }
      } catch (error) {
        console.error("Error loading items:", error);
        itemsCatalog.innerHTML = `<div class="col-12"><p class="error-msg">Failed to load items: ${error.message}</p></div>`;
      }
    }
  }
  
  // Add to cart function
  function addToCart(itemId, item) {
    // Check if the item has zero items in inventory
    if (item.quantity <= 0) {
      // Show warning notification
      const warningModal = document.createElement('div');
      warningModal.className = 'notification';
      warningModal.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <div>This item is out of stock.</div>
      `;
      document.body.appendChild(warningModal);
      
      // Remove notification after 3 seconds
      setTimeout(() => {
        if (document.body.contains(warningModal)) {
          warningModal.remove();
        }
      }, 3000);
      
      return; // Exit the function without adding to cart
    }
    
    // Check if the item is already in the cart
    const existingItem = cart.find(cartItem => cartItem.id === itemId);
    let itemQuantity = 1;
    
    if (existingItem) {
      // Check if adding one more would exceed available stock
      if (existingItem.quantity >= item.quantity) {
        // Show warning notification
        const warningModal = document.createElement('div');
        warningModal.className = 'notification';
        warningModal.style.backgroundColor = '#fff3cd';
        warningModal.style.color = '#856404';
        warningModal.innerHTML = `
          <i class="fas fa-exclamation-circle"></i>
          <div>You've reached the maximum available quantity for this item.</div>
        `;
        document.body.appendChild(warningModal);
        
        // Remove notification after 3 seconds
        setTimeout(() => {
          if (document.body.contains(warningModal)) {
            warningModal.remove();
          }
        }, 3000);
        
        return; // Exit without adding more
      }
      
      // Increase quantity if already in cart
      existingItem.quantity += 1;
      itemQuantity = existingItem.quantity;
    } else {
      // Add new item to cart
      cart.push({
        id: itemId,
        name: item.name,
        price: item.price,
        quantity: 1,
        maxQuantity: item.quantity // Store the max quantity available
      });
    }
    
    // Save cart to localStorage
    const currentUser = auth.currentUser;
    if (currentUser) {
      localStorage.setItem(`cart_${currentUser.uid}`, JSON.stringify(cart));
    }
    
    // Calculate cart totals
    const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
    const totalPrice = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    
    // Remove any existing cart success modals
    const existingModals = document.querySelectorAll('.cart-success-modal');
    existingModals.forEach(modal => modal.remove());
    
    // Create Amazon-style success modal
    const successModal = document.createElement('div');
    successModal.className = 'cart-success-modal';
    successModal.innerHTML = `
      <div class="cart-success-content">
        <div class="cart-success-check">
          <i class="fas fa-check"></i>
        </div>
        <div class="cart-success-message">
          <h4>Added to Cart</h4>
          <p>${item.name} (${itemQuantity}x) has been added to your cart</p>
        </div>
      </div>
      <div class="cart-success-actions">
        <button class="cart-view-btn">Cart (${totalItems} items)</button>
        <button class="cart-checkout-btn">Checkout now (₱${totalPrice.toFixed(2)})</button>
        <button class="cart-success-close"><i class="fas fa-times"></i></button>
      </div>
    `;
    document.body.appendChild(successModal);
    
    // Add event listeners for buttons
    const viewCartBtn = successModal.querySelector('.cart-view-btn');
    viewCartBtn.addEventListener('click', () => {
      // Navigate to cart page
      pageContainers.forEach(container => {
        container.classList.add('hidden');
      });
      
      const cartPage = document.getElementById('cart-page');
      if (cartPage) {
        cartPage.classList.remove('hidden');
      }
      
      // Update sidebar active state
      sidebarMenuItems.forEach(menuItem => {
        if (menuItem.id !== 'sidebar-logout') {
          menuItem.classList.remove('active');
          if (menuItem.getAttribute('data-page') === 'cart') {
            menuItem.classList.add('active');
          }
        }
      });
      
      // Remove the modal
      successModal.remove();
    });
    
    const checkoutBtn = successModal.querySelector('.cart-checkout-btn');
    checkoutBtn.addEventListener('click', () => {
      // Navigate to cart page and trigger checkout
      pageContainers.forEach(container => {
        container.classList.add('hidden');
      });
      
      const cartPage = document.getElementById('cart-page');
      if (cartPage) {
        cartPage.classList.remove('hidden');
      }
      
      // Update sidebar active state
      sidebarMenuItems.forEach(menuItem => {
        if (menuItem.id !== 'sidebar-logout') {
          menuItem.classList.remove('active');
          if (menuItem.getAttribute('data-page') === 'cart') {
            menuItem.classList.add('active');
          }
        }
      });
      
      // Trigger checkout
      const checkoutButton = document.getElementById('checkout-btn');
      if (checkoutButton) {
        // Add a tiny delay to ensure UI updates before checkout
        setTimeout(() => {
          checkoutButton.click();
        }, 100);
      }
      
      // Remove the modal
      successModal.remove();
    });
    
    const closeBtn = successModal.querySelector('.cart-success-close');
    closeBtn.addEventListener('click', () => {
      successModal.remove();
    });
    
    // Auto-hide the modal after 5 seconds
    setTimeout(() => {
      if (document.body.contains(successModal)) {
        successModal.remove();
      }
    }, 5000);
    
    // Update cart badge
    updateCartBadge();
    
    // Update cart page if it's visible
    if (document.getElementById('cart-page') && !document.getElementById('cart-page').classList.contains('hidden')) {
      loadCart();
    }
  }
  
  // Update cart badge to show number of items
  function updateCartBadge() {
    const cartMenuItem = document.querySelector('.sidebar-menu li[data-page="cart"]');
    
    if (cartMenuItem) {
      // Check if a badge already exists
      let badge = cartMenuItem.querySelector('.cart-badge');
      
      // Calculate total items in cart
      const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
      
      if (totalItems > 0) {
        if (!badge) {
          // Create badge if it doesn't exist
          badge = document.createElement('span');
          badge.className = 'cart-badge';
          cartMenuItem.appendChild(badge);
        }
        badge.textContent = totalItems;
      } else if (badge) {
        // Remove badge if cart is empty
        badge.remove();
      }
    }
  }
  
  // Load cart contents on the cart page
  function loadCart() {
    const cartItems = document.querySelector('.cart-items');
    const cartTotal = document.getElementById('cart-total');
    const cartSubtotal = document.getElementById('cart-subtotal');
    const checkoutBtn = document.getElementById('checkout-btn');
    const emptyCartMessage = document.getElementById('empty-cart-message');
    
    if (cartItems && cartTotal) {
      if (cart.length === 0) {
        cartItems.innerHTML = '';
        if (emptyCartMessage) {
          emptyCartMessage.style.display = 'block';
        }
        cartTotal.textContent = '₱0.00';
        if (cartSubtotal) cartSubtotal.textContent = '₱0.00';
        if (checkoutBtn) checkoutBtn.disabled = true;
        return;
      }
      
      // Hide empty cart message if cart has items
      if (emptyCartMessage) {
        emptyCartMessage.style.display = 'none';
      }
      
      cartItems.innerHTML = '';
      let total = 0;
      
      cart.forEach((item, index) => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        
        const itemPrice = item.price * item.quantity;
        total += itemPrice;
        
        const reachedMaxQuantity = item.quantity >= item.maxQuantity;
        
        cartItem.innerHTML = `
          <div class="cart-item-details">
            <h5><i class="fas fa-box me-2"></i>${item.name}</h5>
            <p class="mb-0 text-success fw-bold">₱${item.price.toFixed(2)} × ${item.quantity}</p>
            <small class="text-muted">Total: ₱${itemPrice.toFixed(2)}</small>
            ${reachedMaxQuantity ? `<small class="text-danger"><i class="fas fa-exclamation-circle"></i> Maximum quantity reached</small>` : ''}
          </div>
          <div class="cart-controls">
            <div class="quantity-control">
              <button class="decrease-qty"><i class="fas fa-minus"></i></button>
              <span>${item.quantity}</span>
              <button class="increase-qty" ${reachedMaxQuantity ? 'disabled' : ''}><i class="fas fa-plus"></i></button>
            </div>
            <button class="remove-item-btn"><i class="fas fa-trash"></i></button>
          </div>
        `;
        
        // Add event listeners for quantity buttons
        const decreaseBtn = cartItem.querySelector('.decrease-qty');
        const increaseBtn = cartItem.querySelector('.increase-qty');
        const removeBtn = cartItem.querySelector('.remove-item-btn');
        
        decreaseBtn.addEventListener('click', () => {
          if (item.quantity > 1) {
            item.quantity--;
            saveCart();
            loadCart(); // Reload cart
          }
        });
        
        increaseBtn.addEventListener('click', () => {
          if (item.quantity < item.maxQuantity) {
            item.quantity++;
            saveCart();
            loadCart(); // Reload cart
          } else {
            // Show warning notification
            const warningModal = document.createElement('div');
            warningModal.className = 'notification';
            warningModal.style.backgroundColor = '#fff3cd';
            warningModal.style.color = '#856404';
            warningModal.innerHTML = `
              <i class="fas fa-exclamation-circle"></i>
              <div>Cannot add more. Maximum available quantity reached.</div>
            `;
            document.body.appendChild(warningModal);
            
            // Remove notification after 3 seconds
            setTimeout(() => {
              if (document.body.contains(warningModal)) {
                warningModal.remove();
              }
            }, 3000);
          }
        });
        
        removeBtn.addEventListener('click', () => {
          cart.splice(index, 1);
          saveCart();
          loadCart(); // Reload cart
        });
        
        cartItems.appendChild(cartItem);
      });
      
      // Update subtotal and total (they are the same now without shipping)
      if (cartSubtotal) cartSubtotal.textContent = `₱${total.toFixed(2)}`;
      cartTotal.textContent = `₱${total.toFixed(2)}`;
      
      // Enable checkout button
      if (checkoutBtn) checkoutBtn.disabled = false;
    }
  }
  
  // Save cart to localStorage
  function saveCart() {
    const currentUser = auth.currentUser;
    if (currentUser) {
      localStorage.setItem(`cart_${currentUser.uid}`, JSON.stringify(cart));
      updateCartBadge();
    }
  }
  
  // Add event listener to checkout button
  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', async () => {
      if (cart.length === 0) {
        alert('Your cart is empty.');
        return;
      }
      
      // Instead of directly confirming checkout, show the address modal
      showAddressModal();
    });
  }
  
  // Function to show address modal and handle checkout process
  function showAddressModal() {
    // Get current user data to pre-fill the form
    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert('You need to be logged in to checkout.');
      return;
    }
    
    // Initialize Bootstrap modal
    const addressModal = new bootstrap.Modal(document.getElementById('addressModal'));
    
    // Calculate cart info for the modal
    const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
    const totalAmount = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    
    // Pre-fill user information
    getDoc(doc(db, "users", currentUser.uid))
      .then(docSnap => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          // Set read-only fields
          document.getElementById('checkout-name').value = userData.name || currentUser.displayName || '';
          document.getElementById('checkout-email').value = userData.email || currentUser.email || '';
          
          // Pre-fill address fields if they exist in the user data
          if (userData.address) {
            document.getElementById('checkout-address').value = userData.address.street || '';
            document.getElementById('checkout-city').value = userData.address.city || '';
            document.getElementById('checkout-province').value = userData.address.province || '';
            document.getElementById('checkout-zip').value = userData.address.zip || '';
            document.getElementById('checkout-phone').value = userData.address.phone || '';
          }
          
          // Update order summary in modal
          document.getElementById('modal-items-count').textContent = `${totalItems} items`;
          document.getElementById('modal-total').textContent = `₱${totalAmount.toFixed(2)}`;
          
          // Show the modal
          addressModal.show();
        } else {
          alert('User information not found. Please contact support.');
        }
      })
      .catch(error => {
        console.error('Error getting user data:', error);
        alert('Error loading user information. Please try again.');
      });
  }
  
  // Add event listener to confirm checkout button in the modal
  const confirmCheckoutBtn = document.getElementById('confirm-checkout-btn');
  if (confirmCheckoutBtn) {
    confirmCheckoutBtn.addEventListener('click', async () => {
      // Validate form
      const shippingForm = document.getElementById('shipping-form');
      if (!shippingForm.checkValidity()) {
        shippingForm.reportValidity();
        return;
      }
      
      // Collect form data
      const shippingAddress = {
        street: document.getElementById('checkout-address').value,
        city: document.getElementById('checkout-city').value,
        province: document.getElementById('checkout-province').value,
        zip: document.getElementById('checkout-zip').value,
        phone: document.getElementById('checkout-phone').value
      };
      
      // Process the order
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          alert('You need to be logged in to checkout.');
          return;
        }
        
        // Create order document
        const orderData = {
          userId: currentUser.uid,
          userName: document.getElementById('checkout-name').value,
          userEmail: document.getElementById('checkout-email').value,
          shippingAddress: shippingAddress,
          items: cart.map(item => ({
            itemId: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity
          })),
          totalAmount: cart.reduce((total, item) => total + (item.price * item.quantity), 0),
          status: 'pending',
          createdAt: serverTimestamp()
        };
        
        // Add to orders collection
        await addDoc(collection(db, 'orders'), orderData);
        
        // Update inventory quantities by adding negative adjustment entries
        for (const item of cart) {
          try {
            // Add a negative inventory adjustment
            await addDoc(collection(db, "inventory"), {
              itemId: item.id,
              quantity: -item.quantity, // Negative quantity for reduction
              addedAt: serverTimestamp(),
              addedBy: currentUser.uid,
              adjustmentType: 'order'
            });
          } catch (error) {
            console.error(`Error updating inventory for item ${item.id}:`, error);
          }
        }
        
        // Save user's address for future use (optional)
        try {
          await setDoc(doc(db, "users", currentUser.uid), {
            address: shippingAddress,
            last_updated: serverTimestamp()
          }, { merge: true });
        } catch (error) {
          console.error("Error saving user address:", error);
          // Non-critical error, don't block the checkout
        }
        
        // Close modal
        const addressModal = bootstrap.Modal.getInstance(document.getElementById('addressModal'));
        addressModal.hide();
        
        // Clear cart
        cart = [];
        saveCart();
        loadCart();
        
        // Show success message
        showOrderConfirmation();
        
        // Reload available items to update stock
        loadItems();
        
      } catch (error) {
        console.error('Error during checkout:', error);
        alert(`Checkout failed: ${error.message}`);
      }
    });
  }
  
  // Function to show order confirmation message
  function showOrderConfirmation() {
    // Create a success modal with enhanced styling
    const successModal = document.createElement('div');
    successModal.className = 'order-success-modal';
    
    successModal.innerHTML = `
      <div class="order-success-icon">
        <i class="fas fa-check-circle"></i>
      </div>
      <h3 class="order-success-title">Order Placed Successfully!</h3>
      <p class="order-success-message">Thank you for your order. We will process it shortly and notify you when it ships.</p>
      <div class="order-success-buttons">
        <button class="order-success-button view-orders-btn">View My Orders</button>
        <button class="order-success-button continue-shopping-btn">Continue Shopping</button>
      </div>
    `;
    document.body.appendChild(successModal);
    
    // Add event listener to view orders button
    const viewOrdersBtn = successModal.querySelector('.view-orders-btn');
    viewOrdersBtn.addEventListener('click', () => {
      // Remove the success modal
      document.body.removeChild(successModal);
      
      // Navigate to orders page
      pageContainers.forEach(container => {
        container.classList.add('hidden');
      });
      
      const ordersPage = document.getElementById('orders-page');
      if (ordersPage) {
        ordersPage.classList.remove('hidden');
        
        // Load the user's orders
        loadUserOrders();
      }
      
      // Update sidebar active menu
      sidebarMenuItems.forEach(menuItem => {
        if (menuItem.id !== 'sidebar-logout') {
          menuItem.classList.remove('active');
          if (menuItem.getAttribute('data-page') === 'orders') {
            menuItem.classList.add('active');
          }
        }
      });
    });
    
    // Add event listener to continue shopping button
    const continueShoppingBtn = successModal.querySelector('.continue-shopping-btn');
    continueShoppingBtn.addEventListener('click', () => {
      // Remove the success modal
      document.body.removeChild(successModal);
      
      // Navigate to home page
      pageContainers.forEach(container => {
        container.classList.add('hidden');
      });
      
      const homePage = document.getElementById('home-page');
      if (homePage) {
        homePage.classList.remove('hidden');
      }
      
      // Update sidebar active menu
      sidebarMenuItems.forEach(menuItem => {
        if (menuItem.id !== 'sidebar-logout') {
          menuItem.classList.remove('active');
          if (menuItem.getAttribute('data-page') === 'home') {
            menuItem.classList.add('active');
          }
        }
      });
    });
    
    // Auto-remove after 10 seconds (increased from 5 seconds for better visibility)
    setTimeout(() => {
      if (document.body.contains(successModal)) {
        document.body.removeChild(successModal);
      }
    }, 10000);
  }
  
  // Load and display user orders
  async function loadUserOrders() {
    const ordersList = document.getElementById('orders-list');
    const emptyOrdersMessage = document.getElementById('empty-orders-message');
    
    if (!ordersList) return;
    
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('User not authenticated');
      
      // Show loading indicator
      ordersList.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-success" role="status"></div><p class="mt-2">Loading your orders...</p></div>';
      
      // Query user's orders
      const ordersQuery = query(collection(db, "orders"), where("userId", "==", currentUser.uid));
      const ordersSnapshot = await getDocs(ordersQuery);
      
      if (ordersSnapshot.empty) {
        ordersList.innerHTML = '';
        if (emptyOrdersMessage) {
          emptyOrdersMessage.style.display = 'block';
        }
        return;
      }
      
      // Hide empty orders message
      if (emptyOrdersMessage) {
        emptyOrdersMessage.style.display = 'none';
      }
      
      // Clear existing content
      ordersList.innerHTML = '';
      
      // Create array from snapshot for sorting
      const orders = [];
      ordersSnapshot.forEach(doc => {
        orders.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Sort orders by creation date (newest first)
      orders.sort((a, b) => {
        const dateA = a.createdAt ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
      });
      
      // Process each order
      orders.forEach(order => {
        const orderCard = document.createElement('div');
        orderCard.className = 'order-card mb-4';
        
        // Format date if available
        let orderDate = 'No date';
        if (order.createdAt) {
          const date = order.createdAt.toDate();
          orderDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        }
        
        // Determine status and status class based on order.status
        let statusClass, statusText, statusIcon;
        
        switch(order.status) {
          case 'processing':
            statusClass = 'processing';
            statusText = 'Processing';
            statusIcon = 'fa-cogs';
            break;
          case 'shipped':
            statusClass = 'shipped';
            statusText = 'Shipped';
            statusIcon = 'fa-shipping-fast';
            break;
          case 'finished':
            statusClass = 'finished';
            statusText = 'Delivered';
            statusIcon = 'fa-check-circle';
            break;
          case 'cancelled':
            statusClass = 'cancelled';
            statusText = 'Cancelled';
            statusIcon = 'fa-times-circle';
            break;
          default: // 'pending' or any other status
            statusClass = 'pending';
            statusText = 'Pending';
            statusIcon = 'fa-clock';
        }
        
        // Generate delivery information based on status
        let deliveryInfo = '';
        
        if (order.status === 'processing') {
          deliveryInfo = `
            <div class="delivery-info">
              <h6 class="mb-2"><i class="fas fa-tasks me-2"></i>Order Status</h6>
              <p class="mb-1">Your order is being processed.</p>
              <p class="mb-2">We'll update you when it ships.</p>
            </div>
          `;
        } else if (order.status === 'shipped') {
          deliveryInfo = `
            <div class="delivery-info">
              <h6 class="mb-2"><i class="fas fa-truck me-2"></i>Delivery Information</h6>
              <p class="mb-1 text-primary">Your order has been shipped!</p>
              <p class="mb-2">Expected delivery: Within 3-5 days</p>
            </div>
          `;
        } else if (order.status === 'finished') {
          deliveryInfo = `
            <div class="delivery-info">
              <h6 class="mb-2"><i class="fas fa-check-circle me-2"></i>Delivery Information</h6>
              <p class="mb-1 text-success">Your order has been delivered!</p>
              <p class="mb-2">Thank you for shopping with us.</p>
            </div>
          `;
        } else if (order.status === 'cancelled') {
          deliveryInfo = `
            <div class="delivery-info">
              <h6 class="mb-2"><i class="fas fa-times-circle me-2"></i>Order Cancelled</h6>
              <p class="mb-1 text-danger">This order has been cancelled.</p>
            </div>
          `;
        }
        
        orderCard.innerHTML = `
          <div class="order-header">
            <div>
              <div class="order-number">Order #${order.id.substring(0, 8).toUpperCase()}</div>
              <div class="order-date">${orderDate}</div>
            </div>
            <span class="order-status ${statusClass}">
              <i class="fas ${statusIcon} me-1"></i> ${statusText}
            </span>
          </div>
          <div class="order-details">
            <div class="order-items">
              ${order.items.map(item => `
                <div class="order-item">
                  <div class="order-item-name">${item.name}</div>
                  <div class="order-item-qty">x${item.quantity}</div>
                  <div class="order-item-price">₱${(item.price * item.quantity).toFixed(2)}</div>
                </div>
              `).join('')}
            </div>
            <div class="order-total">
              <span>Total Amount</span>
              <span>₱${order.totalAmount.toFixed(2)}</span>
            </div>
            <div class="delivery-address">
              <strong><i class="fas fa-map-marker-alt me-2"></i>Shipping Address:</strong><br>
              ${formatShippingAddress(order.shippingAddress)}
            </div>
            ${deliveryInfo}
          </div>
        `;
        
        ordersList.appendChild(orderCard);
      });
      
    } catch (error) {
      console.error("Error loading user orders:", error);
      ordersList.innerHTML = `<div class="alert alert-danger" role="alert">
        <i class="fas fa-exclamation-circle me-2"></i>
        Failed to load your orders: ${error.message}
      </div>`;
    }
  }
  
  // Helper function to format shipping address
  function formatShippingAddress(address) {
    if (!address) return 'No address provided';
    
    let formattedAddress = '';
    if (address.street) formattedAddress += address.street;
    if (address.city) formattedAddress += (formattedAddress ? ', ' : '') + address.city;
    if (address.province) formattedAddress += (formattedAddress ? ', ' : '') + address.province;
    if (address.zip) formattedAddress += (formattedAddress ? ' ' : '') + address.zip;
    if (address.phone) formattedAddress += (formattedAddress ? '<br>Phone: ' : 'Phone: ') + address.phone;
    
    return formattedAddress || 'No address provided';
  }
});

// Get total quantity for an item from inventory collection
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