// ===============================================
// CONFIGURATION - REPLACE WITH YOUR VALUES
// ===============================================
const CLIENT_ID = '611448944135-g8ajh2ap7u6phcl1dr5q8ag4e3kc9n9r.apps.googleusercontent.com'; // From Google Cloud Console
const API_KEY = 'AIzaSyAO_A0iOhJbDgl3y7AXCFVNWSdddaDelqQ'; // From Google Cloud Console
const SPREADSHEET_ID = '1kGmXilJlk4z-dQ29WnGC-wRPL1jG3kUyVcSx9VO0J0U'; // From Google Sheet URL

// Admin users who can delete orders (add sales team emails here)
const ADMIN_USERS = [
  'sheshank.velaga@hydrochemindustries.com',
  'admin@hydrochemindustries.com'
];

// ===============================================
// GOOGLE API SETUP
// ===============================================
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

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

// ===============================================
// INITIALIZATION
// ===============================================
function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: [DISCOVERY_DOC],
  });
  gapiInited = true;
  maybeEnableButtons();
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '',
  });
  gisInited = true;
  maybeEnableButtons();
}

function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    document.getElementById('authButton').style.display = 'inline-block';
  }
}

// ===============================================
// AUTHENTICATION
// ===============================================
function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      showToast('Authentication failed', true);
      throw (resp);
    }
    
    // Get user info
    const token = gapi.client.getToken();
    if (token) {
      const userInfo = parseJwt(token.access_token);
      currentUser = userInfo.email || 'Unknown User';
      isAdmin = ADMIN_USERS.includes(currentUser);
      
      document.getElementById('userEmail').textContent = currentUser;
      document.getElementById('authButton').style.display = 'none';
      document.getElementById('signoutButton').style.display = 'inline-block';
      document.getElementById('orderForm').style.display = 'block';
      
      await loadAllData();
      showToast('Signed in successfully!');
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
    
    clearKanban();
    showToast('Signed out successfully');
  }
}

function parseJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  return JSON.parse(jsonPayload);
}

// ===============================================
// DATA LOADING
// ===============================================
async function loadAllData() {
  try {
    await loadDeals();
    await loadProducts();
    await loadOrders();
    renderKanban();
  } catch (err) {
    showToast('Error loading data: ' + err.message, true);
  }
}

async function loadDeals() {
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
  
  // Populate deal dropdown
  const select = document.getElementById('dealSelect');
  select.innerHTML = '<option value="">Select a deal...</option>';
  dealsData.forEach(deal => {
    const option = document.createElement('option');
    option.value = deal.name;
    option.textContent = `${deal.name} - ${deal.company}`;
    select.appendChild(option);
  });
}

async function loadProducts() {
  const response = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEETS.PRODUCTS}!A2:E`,
  });
  
  const rows = response.result.values || [];
  productsData = rows
    .filter(row => row[4] === 'TRUE' || row[4] === true)
    .map(row => ({
      id: row[0] || '',
      name: row[1] || '',
      unit: row[2] || 'L',
      price: row[3] || '0'
    }));
  
  // Populate product dropdown
  const select = document.getElementById('productSelect');
  select.innerHTML = '<option value="">Select a product...</option>';
  productsData.forEach(product => {
    const option = document.createElement('option');
    option.value = product.name;
    option.textContent = `${product.name} (₹${product.price}/${product.unit})`;
    select.appendChild(option);
  });
}

async function loadOrders() {
  const response = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEETS.ORDERS}!A2:M`,
  });
  
  const rows = response.result.values || [];
  ordersData = rows.map((row, idx) => ({
    rowIndex: idx + 2, // +2 because row 1 is header, array is 0-indexed
    id: row[0] || `ORD-${Date.now()}-${idx}`,
    dealName: row[1] || '',
    product: row[2] || '',
    volume: row[3] || '',
    discountCode: row[4] || '',
    address: row[5] || '',
    gst: row[6] || '',
    lrNumber: row[7] || '',
    status: row[8] || 'placed',
    createdBy: row[9] || '',
    createdAt: row[10] || '',
    custom1: row[11] || '',
    custom2: row[12] || ''
  }));
}

// ===============================================
// ORDER CREATION
// ===============================================
async function createOrder() {
  const dealName = document.getElementById('dealSelect').value;
  const product = document.getElementById('productSelect').value;
  const volume = document.getElementById('volumeInput').value;
  const discountCode = document.getElementById('discountInput').value;
  const address = document.getElementById('addressInput').value;
  const gst = document.getElementById('gstInput').value;
  const lrNumber = document.getElementById('lrInput').value;
  const custom1 = document.getElementById('custom1Input').value;
  const custom2 = document.getElementById('custom2Input').value;

  if (!dealName || !product || !volume || !address || !gst) {
    showToast('Please fill all required fields', true);
    return;
  }

  const orderId = `ORD-${Date.now()}`;
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  
  const newRow = [
    orderId,
    dealName,
    product,
    volume,
    discountCode,
    address,
    gst,
    lrNumber,
    'placed',
    currentUser,
    timestamp,
    custom1,
    custom2
  ];

  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.ORDERS}!A:M`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [newRow]
      }
    });

    // Clear form
    document.getElementById('dealSelect').value = '';
    document.getElementById('productSelect').value = '';
    document.getElementById('volumeInput').value = '';
    document.getElementById('discountInput').value = '';
    document.getElementById('addressInput').value = '';
    document.getElementById('gstInput').value = '';
    document.getElementById('lrInput').value = '';
    document.getElementById('custom1Input').value = '';
    document.getElementById('custom2Input').value = '';

    await loadOrders();
    renderKanban();
    showToast('Order created successfully!');
  } catch (err) {
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
  
  card.innerHTML = `
    <div class="card-header">
      <div>
        <div class="card-title">${order.dealName}</div>
        <div class="card-id">${order.id}</div>
      </div>
      ${isAdmin ? `<button class="delete-btn" onclick="deleteOrder('${order.id}', ${order.rowIndex})">🗑️</button>` : ''}
    </div>
    <div class="card-details">
      <div class="card-row">
        <span class="card-label">Product:</span>
        <span class="card-value">${order.product}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Volume:</span>
        <span class="card-value">${order.volume} L</span>
      </div>
      ${order.lrNumber ? `<div class="card-row">
        <span class="card-label">LR:</span>
        <span class="card-value">${order.lrNumber}</span>
      </div>` : ''}
      ${order.discountCode ? `<div class="card-row">
        <span class="card-label">Discount:</span>
        <span class="card-value">${order.discountCode}</span>
      </div>` : ''}
    </div>
    <div class="card-footer">
      👤 ${order.createdBy} • 📅 ${order.createdAt}
    </div>
  `;
  
  setupDragAndDrop(card);
  return card;
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
    const rowIndex = draggingCard.dataset.rowIndex;
    const newStatus = lane.dataset.status;
    
    await updateOrderStatus(orderId, rowIndex, newStatus);
  });
}

async function updateOrderStatus(orderId, rowIndex, newStatus) {
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.ORDERS}!I${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[newStatus]]
      }
    });
    
    await loadOrders();
    renderKanban();
    showToast(`Order moved to ${newStatus.replace('_', ' ')}`);
  } catch (err) {
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
  
  if (!confirm(`Delete order ${orderId}? This cannot be undone.`)) {
    return;
  }
  
  try {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: 0, // Orders sheet (change if needed)
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }]
      }
    });
    
    await loadOrders();
    renderKanban();
    showToast('Order deleted successfully');
  } catch (err) {
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
