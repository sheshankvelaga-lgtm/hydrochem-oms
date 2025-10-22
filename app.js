// ===============================================
// CONFIGURATION - REPLACE WITH YOUR VALUES
// ===============================================
const CLIENT_ID = '611448944135-g8ajh2ap7u6phcl1dr5q8ag4e3kc9n9r.apps.googleusercontent.com';
const API_KEY = 'AIzaSyAO_A0iOhJbDgl3y7AXCFVNWSdddaDelqQ';
const SPREADSHEET_ID = '1kGmXilJlk4z-dQ29WnGC-wRPL1jG3kUyVcSx9VO0J0U';

// Admin users who can delete orders
const ADMIN_USERS = [
  'sheshank.velaga@hydrochemindustries.com',
  'admin@hydrochemindustries.com'
];

// ===============================================
// GOOGLE API SETUP
// ===============================================
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let currentUser = null;
let isAdmin = false;

// Sheet tabs
const SHEETS = {
  DEALS: 'Deals',
  ORDERS: 'Orders',
  PRODUCTS: 'Products'
};

// Data cache
let dealsData = [];
let productsData = [];
let ordersData = [];
let productRowCount = 1;

// ===============================================
// INITIALIZATION
// ===============================================
function gapiLoaded() {
  console.log('GAPI loaded');
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  try {
    await gapi.client.init({
      apiKey: API_KEY,
      discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
    console.log('GAPI client initialized');
    maybeEnableButtons();
  } catch (err) {
    console.error('Error initializing GAPI client:', err);
    showToast('Error loading Google APIs: ' + err.message, true);
  }
}

function gisLoaded() {
  console.log('GIS loaded');
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '',
  });
  gisInited = true;
  console.log('Token client initialized');
  maybeEnableButtons();
}

function maybeEnableButtons() {
  console.log('gapiInited:', gapiInited, 'gisInited:', gisInited);
  if (gapiInited && gisInited) {
    document.getElementById('authButton').style.display = 'inline-block';
    console.log('Sign In button enabled');
  }
}

// ===============================================
// AUTHENTICATION
// ===============================================
function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      showToast('Authentication failed: ' + resp.error, true);
      console.error('Auth error:', resp);
      return;
    }
    
    try {
      console.log('Auth response received, getting user info...');
      
      const token = gapi.client.getToken();
      console.log('Access token available:', !!token);
      
      if (!token || !token.access_token) {
        throw new Error('No access token received');
      }
      
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          'Authorization': `Bearer ${token.access_token}`
        }
      });
      
      if (!userInfoResponse.ok) {
        const errorText = await userInfoResponse.text();
        console.error('UserInfo API error:', errorText);
        throw new Error(`Failed to get user info: ${userInfoResponse.status}`);
      }
      
      const userInfo = await userInfoResponse.json();
      currentUser = userInfo.email || 'Unknown User';
      isAdmin = ADMIN_USERS.includes(currentUser);
      
      console.log('Signed in as:', currentUser);
      console.log('Is admin:', isAdmin);
      
      document.getElementById('userEmail').textContent = currentUser;
      document.getElementById('authButton').style.display = 'none';
      document.getElementById('signoutButton').style.display = 'inline-block';
      document.getElementById('orderForm').style.display = 'block';
      document.getElementById('refreshButton').style.display = 'inline-block';
      
      await loadAllData();
      showToast('Signed in successfully as ' + currentUser);
    } catch (error) {
      console.error('Error during sign in:', error);
      showToast('Error: ' + error.message, true);
    }
  };

  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    tokenClient.requestAccessToken({prompt: ''});
  }
}

function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    
    currentUser = null;
    isAdmin = false;
    document.getElementById('userEmail').textContent = '';
    document.getElementById('authButton').style.display = 'inline-block';
    document.getElementById('signoutButton').style.display = 'none';
    document.getElementById('orderForm').style.display = 'none';
    document.getElementById('refreshButton').style.display = 'none';
    
    clearKanban();
    showToast('Signed out successfully');
  }
}

// ===============================================
// DATA LOADING
// ===============================================
async function loadAllData() {
  try {
    console.log('Loading data from Google Sheets...');
    await loadDeals();
    await loadProducts();
    await loadOrders();
    renderKanban();
    console.log('All data loaded successfully');
  } catch (err) {
    showToast('Error loading data: ' + err.message, true);
    console.error('Error loading data:', err);
  }
}

async function refreshData() {
  try {
    showToast('Refreshing data...');
    await loadAllData();
    showToast('Data refreshed successfully!');
  } catch (err) {
    showToast('Error refreshing data: ' + err.message, true);
  }
}

async function loadDeals() {
  try {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.DEALS}!A2:Z`,
    });
    
    const rows = response.result.values || [];
    dealsData = rows.map(row => ({
      id: row[0] || '',
      name: row[1] || '',
      company: row[2] || '',
      amount: row[3] || '',
      pipeline: row[4] || '',
      stage: row[5] || ''
    }));
    
    console.log('Loaded deals:', dealsData.length);
    
    // Populate deal dropdown
    const select = document.getElementById('dealSelect');
    select.innerHTML = '<option value="">Select a deal...</option>';
    dealsData.forEach(deal => {
      const option = document.createElement('option');
      option.value = deal.name;
      option.textContent = `${deal.name} - ${deal.company}`;
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Error loading deals:', err);
    throw err;
  }
}

async function loadProducts() {
  try {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.PRODUCTS}!A2:E`,
    });
    
    const rows = response.result.values || [];
    productsData = rows
      .filter(row => row[4] === 'TRUE' || row[4] === true || row[4] === 'Yes')
      .map(row => ({
        id: row[0] || '',
        name: row[1] || '',
        unit: row[2] || 'L',
        price: row[3] || '0'
      }));
    
    console.log('Loaded products:', productsData.length);
    
    // Populate product dropdowns
    updateProductDropdowns();
  } catch (err) {
    console.error('Error loading products:', err);
    throw err;
  }
}

function updateProductDropdowns() {
  const selects = document.querySelectorAll('.product-select');
  selects.forEach(select => {
    select.innerHTML = '<option value="">Select product...</option>';
    productsData.forEach(product => {
      const option = document.createElement('option');
      option.value = product.name;
      option.textContent = `${product.name} (₹${product.price}/${product.unit})`;
      select.appendChild(option);
    });
  });
}

async function loadOrders() {
  try {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.ORDERS}!A2:M`,
    });
    
    const rows = response.result.values || [];
    
    // Group orders by Order ID
    const orderMap = new Map();
    
    rows.forEach((row, idx) => {
      const orderId = row[0] || `ORD-${Date.now()}-${idx}`;
      
      if (!orderMap.has(orderId)) {
        orderMap.set(orderId, {
          rowIndex: idx + 2,
          id: orderId,
          dealName: row[1] || '',
          products: [],
          discountCode: row[4] || '',
          address: row[5] || '',
          gst: row[6] || '',
          lrNumber: row[7] || '',
          status: row[8] || 'placed',
          createdBy: row[9] || '',
          createdAt: row[10] || '',
          custom1: row[11] || '',
          custom2: row[12] || ''
        });
      }
      
      // Add product to this order
      const order = orderMap.get(orderId);
      order.products.push({
        name: row[2] || '',
        volume: row[3] || ''
      });
    });
    
    ordersData = Array.from(orderMap.values());
    console.log('Loaded orders:', ordersData.length);
  } catch (err) {
    console.error('Error loading orders:', err);
    throw err;
  }
}

// ===============================================
// MULTI-PRODUCT MANAGEMENT
// ===============================================
function addProductRow() {
  const container = document.getElementById('productItems');
  const newRow = document.createElement('div');
  newRow.className = 'product-item';
  newRow.dataset.productIndex = productRowCount;
  
  newRow.innerHTML = `
    <label>
      Product
      <select class="product-select" required>
        <option value="">Select product...</option>
      </select>
    </label>
    <label>
      Volume (Liters)
      <input type="number" class="volume-input" min="1" step="0.1" placeholder="e.g., 100" required />
    </label>
    <button type="button" class="btn-remove" onclick="removeProduct(${productRowCount})">✕</button>
  `;
  
  container.appendChild(newRow);
  productRowCount++;
  updateProductDropdowns();
  updateRemoveButtons();
}

function removeProduct(index) {
  const row = document.querySelector(`[data-product-index="${index}"]`);
  if (row) {
    row.remove();
    updateRemoveButtons();
  }
}

function updateRemoveButtons() {
  const items = document.querySelectorAll('.product-item');
  items.forEach((item, idx) => {
    const btn = item.querySelector('.btn-remove');
    btn.style.display = items.length > 1 ? 'block' : 'none';
  });
}

// ===============================================
// ORDER CREATION
// ===============================================
async function createOrder() {
  const dealName = document.getElementById('dealSelect').value;
  const discountCode = document.getElementById('discountInput').value;
  const address = document.getElementById('addressInput').value;
  const gst = document.getElementById('gstInput').value;
  const lrNumber = document.getElementById('lrInput').value;
  const custom1 = document.getElementById('custom1Input').value;
  const custom2 = document.getElementById('custom2Input').value;

  // Get all products
  const productItems = document.querySelectorAll('.product-item');
  const products = [];
  
  for (let item of productItems) {
    const productSelect = item.querySelector('.product-select');
    const volumeInput = item.querySelector('.volume-input');
    
    if (productSelect.value && volumeInput.value) {
      products.push({
        name: productSelect.value,
        volume: volumeInput.value
      });
    }
  }

  if (!dealName || products.length === 0 || !address || !gst) {
    showToast('Please fill all required fields and add at least one product', true);
    return;
  }

  const orderId = `ORD-${Date.now()}`;
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  
  // Create one row per product
  const rows = products.map(product => [
    orderId,
    dealName,
    product.name,
    product.volume,
    discountCode,
    address,
    gst,
    lrNumber,
    'placed',
    currentUser,
    timestamp,
    custom1,
    custom2
  ]);

  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.ORDERS}!A:M`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: rows
      }
    });

    // Clear form
    document.getElementById('dealSelect').value = '';
    document.getElementById('discountInput').value = '';
    document.getElementById('addressInput').value = '';
    document.getElementById('gstInput').value = '';
    document.getElementById('lrInput').value = '';
    document.getElementById('custom1Input').value = '';
    document.getElementById('custom2Input').value = '';
    
    // Reset product rows
    const container = document.getElementById('productItems');
    container.innerHTML = `
      <div class="product-item" data-product-index="0">
        <label>
          Product
          <select class="product-select" required>
            <option value="">Select product...</option>
          </select>
        </label>
        <label>
          Volume (Liters)
          <input type="number" class="volume-input" min="1" step="0.1" placeholder="e.g., 100" required />
        </label>
        <button type="button" class="btn-remove" onclick="removeProduct(0)" style="display:none;">✕</button>
      </div>
    `;
    productRowCount = 1;
    updateProductDropdowns();

    await loadOrders();
    renderKanban();
    showToast(`Order created successfully with ${products.length} product(s)!`);
  } catch (err) {
    console.error('Error creating order:', err);
    showToast('Error creating order: ' + err.message, true);
  }
}

// ===============================================
// KANBAN RENDERING
// ===============================================
function renderKanban() {
  const lanes = ['placed', 'in_progress', 'shipped', 'delivered', 'cancelled'];
  
  lanes.forEach(status => {
    const lane = document.getElementById(`lane-${status}`);
    lane.innerHTML = '';
    
    const orders = ordersData.filter(order => order.status === status);
    
    orders.forEach(order => {
      const card = createCard(order);
      lane.appendChild(card);
    });
    
    // Update count
    document.getElementById(`count-${status}`).textContent = orders.length;
    
    // Setup drop zone
    setupDropZone(lane);
  });
}

function createCard(order) {
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.orderId = order.id;
  card.dataset.rowIndex = order.rowIndex;
  
  // Summary of products
  const productSummary = order.products.length > 1 
    ? `${order.products.length} products` 
    : `${order.products[0].name}`;
  
  const totalVolume = order.products.reduce((sum, p) => sum + parseFloat(p.volume || 0), 0);
  
  card.innerHTML = `
    <div class="card-header">
      <div>
        <div class="card-title">${order.dealName}</div>
        <div class="card-id">${order.id}</div>
      </div>
      ${isAdmin ? `<button class="delete-btn" onclick="deleteOrder('${order.id}', ${order.rowIndex}); event.stopPropagation();">🗑️</button>` : ''}
    </div>
    <div class="card-details">
      <div class="card-row">
        <span class="card-label">Products:</span>
        <span class="card-value">${productSummary}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Total Vol:</span>
        <span class="card-value">${totalVolume} L</span>
      </div>
      ${order.lrNumber ? `<div class="card-row">
        <span class="card-label">LR:</span>
        <span class="card-value">${order.lrNumber}</span>
      </div>` : ''}
    </div>
    <div class="card-footer">
      👤 ${order.createdBy} • 📅 ${order.createdAt}
    </div>
  `;
  
  // Click to open modal
  card.addEventListener('click', (e) => {
    if (!e.target.classList.contains('delete-btn')) {
      openOrderModal(order);
    }
  });
  
  setupDragAndDrop(card);
  return card;
}

// ===============================================
// ORDER DETAIL MODAL
// ===============================================
function openOrderModal(order) {
  const modal = document.getElementById('orderModal');
  const modalBody = document.getElementById('modalBody');
  
  const productsHTML = order.products.map(p => 
    `<li>${p.name} - ${p.volume} L</li>`
  ).join('');
  
  modalBody.innerHTML = `
    <div class="modal-section">
      <h3>Order Information</h3>
      <div class="detail-grid">
        <div class="detail-row">
          <span class="detail-label">Order ID</span>
          <span class="detail-value">${order.id}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status</span>
          <span class="detail-value">${order.status.replace('_', ' ').toUpperCase()}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Created By</span>
          <span class="detail-value">${order.createdBy}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Created At</span>
          <span class="detail-value">${order.createdAt}</span>
        </div>
      </div>
    </div>

    <div class="modal-section">
      <h3>Deal Details</h3>
      <div class="detail-grid">
        <div class="detail-row">
          <span class="detail-label">Deal Name</span>
          <span class="detail-value">${order.dealName}</span>
        </div>
      </div>
    </div>

    <div class="modal-section">
      <h3>Products</h3>
      <div class="detail-row">
        <div class="detail-value">
          <ul style="margin: 0; padding-left: 20px;">
            ${productsHTML}
          </ul>
        </div>
      </div>
    </div>

    <div class="modal-section">
      <h3>Customer Information</h3>
      <div class="detail-grid">
        <div class="detail-row" style="grid-column: 1 / -1;">
          <span class="detail-label">Customer Address</span>
          <span class="detail-value">${order.address}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">GST Number</span>
          <span class="detail-value">${order.gst}</span>
        </div>
        ${order.discountCode ? `<div class="detail-row">
          <span class="detail-label">Discount Code</span>
          <span class="detail-value">${order.discountCode}</span>
        </div>` : ''}
      </div>
    </div>

    <div class="modal-section">
      <h3>Shipping Information</h3>
      <div class="detail-grid">
        <div class="detail-row">
          <span class="detail-label">LR Number (Editable)</span>
          <div class="editable-field">
            <input type="text" id="lrNumberEdit" value="${order.lrNumber || ''}" placeholder="Enter LR Number" />
            <button class="btn-save" onclick="saveLRNumber('${order.id}')">💾 Save LR Number</button>
          </div>
        </div>
      </div>
    </div>

    ${order.custom1 || order.custom2 ? `<div class="modal-section">
      <h3>Custom Fields</h3>
      <div class="detail-grid">
        ${order.custom1 ? `<div class="detail-row">
          <span class="detail-label">Custom Field 1</span>
          <span class="detail-value">${order.custom1}</span>
        </div>` : ''}
        ${order.custom2 ? `<div class="detail-row">
          <span class="detail-label">Custom Field 2</span>
          <span class="detail-value">${order.custom2}</span>
        </div>` : ''}
      </div>
    </div>` : ''}
  `;
  
  modal.classList.add('show');
}

// ===============================================
// SAVE LR NUMBER
// ===============================================
async function saveLRNumber(orderId) {
  const lrNumber = document.getElementById('lrNumberEdit').value;
  
  try {
    // Find all rows with this order ID and update LR number
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.ORDERS}!A2:M`,
    });
    
    const rows = response.result.values || [];
    const updates = [];
    
    rows.forEach((row, idx) => {
      if (row[0] === orderId) {
        updates.push({
          range: `${SHEETS.ORDERS}!H${idx + 2}`, // H column is LR Number
          values: [[lrNumber]]
        });
      }
    });
    
    if (updates.length > 0) {
      await gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          data: updates,
          valueInputOption: 'USER_ENTERED'
        }
      });
      
      showToast('LR Number saved successfully!');
      await loadOrders();
      renderKanban();
      
      // Update the modal with new data
      const updatedOrder = ordersData.find(o => o.id === orderId);
      if (updatedOrder) {
        closeModal();
        setTimeout(() => openOrderModal(updatedOrder), 300);
      }
    }
  } catch (err) {
    console.error('Error saving LR number:', err);
    showToast('Error saving LR number: ' + err.message, true);
  }
}

// ===============================================
// DRAG AND DROP
// ===============================================
function setupDragAndDrop(card) {
  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', card.innerHTML);
  });
  
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });
}

function setupDropZone(lane) {
  lane.addEventListener('dragover', (e) => {
    e.preventDefault();
    lane.classList.add('dragover');
    e.dataTransfer.dropEffect = 'move';
  });
  
  lane.addEventListener('dragleave', () => {
    lane.classList.remove('dragover');
  });
  
  lane.addEventListener('drop', async (e) => {
    e.preventDefault();
    lane.classList.remove('dragover');
    
    const draggingCard = document.querySelector('.dragging');
    if (!draggingCard) return;
    
    const orderId = draggingCard.dataset.orderId;
    const newStatus = lane.dataset.status;
    
    await updateOrderStatus(orderId, newStatus);
  });
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    // Find all rows with this order ID and update their status
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.ORDERS}!A2:M`,
    });
    
    const rows = response.result.values || [];
    const updates = [];
    
    rows.forEach((row, idx) => {
      if (row[0] === orderId) {
        updates.push({
          range: `${SHEETS.ORDERS}!I${idx + 2}`,
          values: [[newStatus]]
        });
      }
    });
    
    if (updates.length > 0) {
      await gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          data: updates,
          valueInputOption: 'USER_ENTERED'
        }
      });
    }
    
    await loadOrders();
    renderKanban();
    showToast(`Order moved to ${newStatus.replace('_', ' ')}`);
  } catch (err) {
    console.error('Error updating order:', err);
    showToast('Error updating order: ' + err.message, true);
  }
}

// ===============================================
// DELETE ORDER (Admin only)
// ===============================================
async function deleteOrder(orderId, rowIndex) {
  if (!isAdmin) {
    showToast('Only admins can delete orders', true);
    return;
  }
  
  if (!confirm(`Delete order ${orderId}? This will delete all product lines. This cannot be undone.`)) {
    return;
  }
  
  try {
    // Find all rows with this order ID
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.ORDERS}!A2:M`,
    });
    
    const rows = response.result.values || [];
    const rowsToDelete = [];
    
    rows.forEach((row, idx) => {
      if (row[0] === orderId) {
        rowsToDelete.push(idx + 2); // +2 for header and 0-index
      }
    });
    
    // Get sheet ID
    const sheetResponse = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });
    
    const ordersSheet = sheetResponse.result.sheets.find(s => s.properties.title === SHEETS.ORDERS);
    const sheetId = ordersSheet ? ordersSheet.properties.sheetId : 0;
    
    // Delete rows in reverse order (from bottom to top)
    const deleteRequests = rowsToDelete.reverse().map(rowNum => ({
      deleteDimension: {
        range: {
          sheetId: sheetId,
          dimension: 'ROWS',
          startIndex: rowNum - 1,
          endIndex: rowNum
        }
      }
    }));
    
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: deleteRequests
      }
    });
    
    await loadOrders();
    renderKanban();
    showToast('Order deleted successfully');
  } catch (err) {
    console.error('Error deleting order:', err);
    showToast('Error deleting order: ' + err.message, true);
  }
}

// ===============================================
// UTILITIES
// ===============================================
function clearKanban() {
  const lanes = ['placed', 'in_progress', 'shipped', 'delivered', 'cancelled'];
  lanes.forEach(status => {
    document.getElementById(`lane-${status}`).innerHTML = '';
    document.getElementById(`count-${status}`).textContent = '0';
  });
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (isError ? ' error' : '');
  
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}
