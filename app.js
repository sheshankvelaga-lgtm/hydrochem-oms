// ===============================================
// CONFIGURATION
// ===============================================
const CLIENT_ID = '611448944135-g8ajh2ap7u6phcl1dr5q8ag4e3kc9n9r.apps.googleusercontent.com';
const API_KEY = 'AIzaSyAO_A0iOhJbDgl3y7AXCFVNWSdddaDelqQ';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwu_1bPiNu0LvPbIOnNGU4yWymRn6MyHFZnvyZAbTh477GnDpncj810YPI8QD9q-epKhQ/exec';

const ADMIN_USERS = [
  'sheshank.velaga@hydrochemindustries.com',
  'admin@hydrochemindustries.com'
];

// ===============================================
// GOOGLE API SETUP
// ===============================================
const SCOPES = 'https://www.googleapis.com/auth/userinfo.email';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let currentUser = null;
let isAdmin = false;

let dealsData = [];
let productsData = [];
let ordersData = [];
let productRowCount = 1;
let currentOrderId = null;

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
      discoveryDocs: [],
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
      const token = gapi.client.getToken();
      
      if (!token || !token.access_token) {
        throw new Error('No access token received');
      }
      
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          'Authorization': `Bearer ${token.access_token}`
        }
      });
      
      if (!userInfoResponse.ok) {
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
      document.getElementById('searchBar').style.display = 'block';
      
      await loadAllData();
      showToast('Signed in successfully!');
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
    document.getElementById('searchBar').style.display = 'none';
    
    clearKanban();
    showToast('Signed out successfully');
  }
}

// ===============================================
// API CALLS TO APPS SCRIPT
// ===============================================
async function callAppsScriptWithResponse(action, params = {}) {
  const payload = {
    action: action,
    userEmail: currentUser,
    ...params
  };
  
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify(payload)
    });
    
    const text = await response.text();
    return JSON.parse(text);
  } catch (error) {
    console.error('Apps Script API error:', error);
    throw error;
  }
}

// ===============================================
// DATA LOADING
// ===============================================
async function loadAllData() {
  try {
    console.log('Loading data...');
    await Promise.all([
      loadDeals(),
      loadProducts(),
      loadOrders()
    ]);
    renderKanban();
    console.log('All data loaded');
  } catch (err) {
    showToast('Error loading data: ' + err.message, true);
    console.error('Error loading data:', err);
  }
}

async function refreshData() {
  try {
    showToast('Refreshing...');
    await loadAllData();
    showToast('Refreshed!');
  } catch (err) {
    showToast('Error refreshing: ' + err.message, true);
  }
}

async function loadDeals() {
  try {
    const result = await callAppsScriptWithResponse('getDeals');
    dealsData = result.deals || [];
    console.log('Loaded deals:', dealsData.length);
    
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
    const result = await callAppsScriptWithResponse('getProducts');
    productsData = result.products || [];
    console.log('Loaded products:', productsData.length);
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
    const result = await callAppsScriptWithResponse('getOrders');
    ordersData = result.orders || [];
    console.log('Loaded orders:', ordersData.length);
    populateOwnerFilter();
  } catch (err) {
    console.error('Error loading orders:', err);
    throw err;
  }
}

// ===============================================
// SEARCH FUNCTIONALITY
// ===============================================
async function performSearch() {
  const query = document.getElementById('searchInput').value;
  const status = document.getElementById('statusFilter').value;
  const owner = document.getElementById('ownerFilter').value;
  
  try {
    showToast('Searching...');
    const result = await callAppsScriptWithResponse('searchOrders', {
      query,
      status
    });
    
    let orders = result.orders || [];
    
    if (owner && owner !== 'all') {
      orders = orders.filter(order => order.createdBy === owner);
    }
    
    ordersData = orders;
    renderKanban();
    showToast(`Found ${ordersData.length} orders`);
  } catch (err) {
    showToast('Search error: ' + err.message, true);
  }
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('statusFilter').value = 'all';
  document.getElementById('ownerFilter').value = 'all';
  loadOrders().then(() => {
    renderKanban();
    showToast('Search cleared');
  });
}

function populateOwnerFilter() {
  const owners = [...new Set(ordersData.map(order => order.createdBy))].sort();
  const select = document.getElementById('ownerFilter');
  select.innerHTML = '<option value="all">All Owners</option>';
  
  owners.forEach(owner => {
    const option = document.createElement('option');
    option.value = owner;
    option.textContent = owner;
    select.appendChild(option);
  });
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
  items.forEach((item) => {
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
    showToast('Please fill all required fields', true);
    return;
  }

  const orderId = `ORD-${Date.now()}`;
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  try {
    showToast('Creating order...');
    
    const createPromise = callAppsScriptWithResponse('createOrder', {
      orderId,
      dealName,
      products,
      discountCode,
      address,
      gst,
      lrNumber,
      custom1,
      custom2
    });

    document.getElementById('dealSelect').value = '';
    document.getElementById('discountInput').value = '';
    document.getElementById('addressInput').value = '';
    document.getElementById('gstInput').value = '';
    document.getElementById('lrInput').value = '';
    document.getElementById('custom1Input').value = '';
    document.getElementById('custom2Input').value = '';
    
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

    await createPromise;
    
    const newOrder = {
      rowIndex: 0,
      id: orderId,
      dealName: dealName,
      products: products,
      discountCode: discountCode,
      address: address,
      gst: gst,
      lrNumber: lrNumber,
      status: 'placed',
      createdBy: currentUser,
      createdAt: timestamp,
      custom1: custom1,
      custom2: custom2,
      notes: '',
      attachments: ''
    };
    
    ordersData.push(newOrder);
    
    const placedLane = document.getElementById('lane-placed');
    const card = createCard(newOrder);
    placedLane.appendChild(card);
    
    const count = document.getElementById('count-placed');
    count.textContent = parseInt(count.textContent) + 1;
    
    populateOwnerFilter();
    showToast(`Order created! Email sent.`);
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
    
    document.getElementById(`count-${status}`).textContent = orders.length;
    setupDropZone(lane);
  });
}

function createCard(order) {
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.orderId = order.id;
  card.dataset.rowIndex = order.rowIndex;
  
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
      ${isAdmin ? `<button class="delete-btn" onclick="deleteOrder('${order.id}'); event.stopPropagation();">🗑️</button>` : ''}
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
  
  card.addEventListener('click', (e) => {
    if (!e.target.classList.contains('delete-btn')) {
      openOrderModal(order);
    }
  });
  
  setupDragAndDrop(card);
  return card;
}
// ===============================================
// ORDER DETAIL MODAL (FIXED - WITH NOTES & ATTACHMENTS HTML)
// ===============================================
async function openOrderModal(order) {
  currentOrderId = order.id;
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
          <span class="detail-label">LR Number</span>
          <div class="editable-field">
            <input type="text" id="lrNumberEdit" value="${order.lrNumber || ''}" placeholder="Enter LR Number" />
            <button class="btn-save" onclick="event.stopPropagation(); saveLRNumber('${order.id}')">💾 Save</button>
          </div>
        </div>
      </div>
    </div>

    ${(order.custom1 || order.custom2) ? `<div class="modal-section">
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
  
  // Add Notes Section HTML (after modalBody content)
  const notesSection = document.getElementById('notesSection');
  if (notesSection) {
    notesSection.style.display = 'block';
  }
  
  // Add Attachments Section HTML (after notes)
  const attachmentsSection = document.getElementById('attachmentsSection');
  if (attachmentsSection) {
    attachmentsSection.style.display = 'block';
  }
  
  modal.classList.add('show');
  
  // Load notes and attachments
  await loadNotes(order.id);
  await loadAttachments(order.id);
}

// ===============================================
// NOTES FUNCTIONALITY
// ===============================================
async function loadNotes(orderId) {
  try {
    const result = await callAppsScriptWithResponse('getNotes', { orderId });
    const notes = result.notes || [];
    
    const notesList = document.getElementById('notesList');
    
    if (notes.length === 0) {
      notesList.innerHTML = '<div class="no-notes">No notes yet</div>';
    } else {
      notesList.innerHTML = notes.map(note => `
        <div class="note-item">
          <div class="note-text">${note.text}</div>
          <div class="note-meta">By ${note.by} on ${note.at}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading notes:', err);
  }
}

async function addNote() {
  const noteInput = document.getElementById('noteInput');
  const noteText = noteInput.value.trim();
  
  if (!noteText) {
    showToast('Please enter a note', true);
    return;
  }
  
  try {
    showToast('Adding note...');
    await callAppsScriptWithResponse('addNote', {
      orderId: currentOrderId,
      noteText
    });
    
    noteInput.value = '';
    await loadNotes(currentOrderId);
    showToast('Note added!');
  } catch (err) {
    showToast('Error adding note: ' + err.message, true);
  }
}

// ===============================================
// FILE ATTACHMENTS
// ===============================================
async function loadAttachments(orderId) {
  try {
    const result = await callAppsScriptWithResponse('getAttachments', { orderId });
    const attachments = result.attachments || [];
    
    const attachmentsList = document.getElementById('attachmentsList');
    
    if (attachments.length === 0) {
      attachmentsList.innerHTML = '<div class="no-attachments">No attachments yet</div>';
    } else {
      attachmentsList.innerHTML = attachments.map(att => `
        <div class="attachment-item">
          <div class="attachment-info">
            <span class="attachment-icon">📎</span>
            <div class="attachment-details">
              <div class="attachment-name">${att.fileName}</div>
              <div class="attachment-size">${formatBytes(att.size)}</div>
            </div>
          </div>
          <a href="${att.fileUrl}" target="_blank" class="btn-download">Download</a>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading attachments:', err);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function handleFileSelect(event) {
  const files = event.target.files;
  
  if (files.length === 0) return;
  
  const uploadStatus = document.getElementById('uploadStatus');
  uploadStatus.textContent = `Uploading ${files.length} file(s)...`;
  
  try {
    for (let file of files) {
      await uploadFile(file);
    }
    
    uploadStatus.textContent = 'Upload complete!';
    await loadAttachments(currentOrderId);
    showToast('Files uploaded successfully!');
    
    setTimeout(() => {
      uploadStatus.textContent = '';
      document.getElementById('fileInput').value = '';
    }, 2000);
  } catch (err) {
    uploadStatus.textContent = 'Upload failed';
    showToast('Upload error: ' + err.message, true);
  }
}

async function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async function(e) {
      try {
        const base64Data = e.target.result.split(',')[1];
        
        await callAppsScriptWithResponse('uploadFile', {
          orderId: currentOrderId,
          fileName: file.name,
          fileData: base64Data,
          mimeType: file.type
        });
        
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===============================================
// SAVE LR NUMBER
// ===============================================
async function saveLRNumber(orderId) {
  const lrInput = document.getElementById('lrNumberEdit');
  if (!lrInput) return;
  
  const lrNumber = lrInput.value.trim();
  
  try {
    showToast('Saving...');
    
    await callAppsScriptWithResponse('updateLRNumber', {
      orderId,
      lrNumber
    });
    
    const order = ordersData.find(o => o.id === orderId);
    if (order) {
      order.lrNumber = lrNumber;
    }
    
    showToast('LR Number saved!');
    
    setTimeout(() => {
      const updatedOrder = ordersData.find(o => o.id === orderId);
      if (updatedOrder) {
        closeModal();
        setTimeout(() => openOrderModal(updatedOrder), 200);
      }
    }, 500);
  } catch (err) {
    console.error('Error saving LR number:', err);
    showToast('Error: ' + err.message, true);
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
    const oldStatus = draggingCard.closest('.lane').dataset.status;
    
    lane.appendChild(draggingCard);
    updateCountsOptimistic(oldStatus, newStatus);
    showToast('Updating...');
    
    try {
      await callAppsScriptWithResponse('updateOrderStatus', {
        orderId,
        newStatus
      });
      
      const order = ordersData.find(o => o.id === orderId);
      if (order) {
        order.status = newStatus;
      }
      
      showToast(`Moved to ${newStatus.replace('_', ' ')}. Email sent if shipped.`);
    } catch (err) {
      console.error('Error updating order:', err);
      showToast('Error: ' + err.message, true);
      await loadOrders();
      renderKanban();
    }
  });
}

function updateCountsOptimistic(fromStatus, toStatus) {
  const fromCount = document.getElementById(`count-${fromStatus}`);
  fromCount.textContent = parseInt(fromCount.textContent) - 1;
  
  const toCount = document.getElementById(`count-${toStatus}`);
  toCount.textContent = parseInt(toCount.textContent) + 1;
}

// ===============================================
// DELETE ORDER
// ===============================================
async function deleteOrder(orderId) {
  if (!isAdmin) {
    showToast('Only admins can delete orders', true);
    return;
  }
  
  if (!confirm(`Delete order ${orderId}? This cannot be undone.`)) {
    return;
  }
  
  try {
    showToast('Deleting...');
    
    const card = document.querySelector(`[data-order-id="${orderId}"]`);
    const lane = card ? card.closest('.lane') : null;
    const status = lane ? lane.dataset.status : null;
    
    if (card) {
      card.remove();
      
      if (status) {
        const count = document.getElementById(`count-${status}`);
        count.textContent = parseInt(count.textContent) - 1;
      }
    }
    
    await callAppsScriptWithResponse('deleteOrder', {
      orderId
    });
    
    ordersData = ordersData.filter(o => o.id !== orderId);
    populateOwnerFilter();
    showToast('Order deleted');
  } catch (err) {
    console.error('Error deleting order:', err);
    showToast('Error: ' + err.message, true);
    await loadOrders();
    renderKanban();
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
