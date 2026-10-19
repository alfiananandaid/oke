/**
 * Frontend Application Controller for Automatic Document Feeder (ADF)
 */

// =========================================================================
// TEMPATKAN URL WEB APP GOOGLE APPS SCRIPT ANDA DI SINI
// =========================================================================
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbyNbnK394KydAVWXo9Ugc7Cuii5MDp2eDgHH2mwzzpcPSleoTD46FiA2lAQsQLSaJTT/exec";

const APP_STATE = {
  apiUrl: localStorage.getItem('adf_api_url') || (DEFAULT_GAS_URL !== "https://script.google.com/macros/s/AKfycbyNbnK394KydAVWXo9Ugc7Cuii5MDp2eDgHH2mwzzpcPSleoTD46FiA2lAQsQLSaJTT/exec" ? DEFAULT_GAS_URL : ''),
  token: localStorage.getItem('adf_token') || '',
  user: JSON.parse(localStorage.getItem('adf_user') || 'null'),
  deviceId: getDeviceId(),
  sessionTimer: null,
  activeTransNo: null
};

// Generate or retrieve persistent Device ID
function getDeviceId() {
  let devId = localStorage.getItem('adf_device_id');
  if (!devId) {
    devId = 'DEV-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('adf_device_id', devId);
  }
  return devId;
}

document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
  setupAutoLogoutCheck();
});

function initApp() {
  if (!APP_STATE.apiUrl || APP_STATE.apiUrl === "PASANG_URL_WEB_APP_GAS_ANDA_DI_SINI") {
    showModal('config-modal');
    return;
  }

  if (APP_STATE.token && APP_STATE.user) {
    validateSession();
  } else {
    showView('login-view');
  }
}

function setupEventListeners() {
  // Config Modal
  document.getElementById('save-config-btn').addEventListener('click', () => {
    const url = document.getElementById('gas-url-input').value.trim();
    if (!url || !url.startsWith('https://script.google.com/')) {
      alert('Masukkan URL Google Apps Script Web App yang valid.');
      return;
    }
    APP_STATE.apiUrl = url;
    localStorage.setItem('adf_api_url', url);
    hideModal('config-modal');
    initApp();
  });

  document.getElementById('open-config-btn').addEventListener('click', () => {
    document.getElementById('gas-url-input').value = APP_STATE.apiUrl;
    showModal('config-modal');
  });

  // Login & Logout
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Navigation Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      switchTab(e.target.dataset.tab);
    });
  });

  // Product Search in Form
  document.getElementById('btn-search-product').addEventListener('click', handleProductSearch);

  // Form Field Calculations
  ['form-price', 'form-qty', 'form-discount-percent'].forEach(id => {
    document.getElementById(id).addEventListener('input', calculateFormTotals);
  });

  // Transaction Creation
  document.getElementById('adf-transaction-form').addEventListener('submit', handleCreateTransaction);

  // Photo Upload Buttons
  [1, 2, 3].forEach(idx => {
    document.getElementById(`upload-btn-${idx}`).addEventListener('click', () => handlePhotoUpload(idx));
  });

  // History & Refresh
  document.getElementById('refresh-dashboard-btn').addEventListener('click', loadDashboard);
  document.getElementById('refresh-history-btn').addEventListener('click', loadTransactions);
  document.getElementById('filter-status').addEventListener('change', loadTransactions);

  // Modal Close Buttons
  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => hideModal('detail-modal'));
  });
}

/** API Communication Helper */
async function apiPost(action, payload = {}) {
  if (!APP_STATE.apiUrl || APP_STATE.apiUrl === "PASANG_URL_WEB_APP_GAS_ANDA_DI_SINI") {
    throw new Error('API Endpoint belum dikonfigurasi.');
  }
  
  const bodyData = {
    action: action,
    token: APP_STATE.token,
    deviceId: APP_STATE.deviceId,
    ...payload
  };

  try {
    const response = await fetch(APP_STATE.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(bodyData)
    });
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Terjadi kesalahan pada server.');
    return result;
  } catch (err) {
    console.error(`API Error [${action}]:`, err);
    throw err;
  }
}

/** Authentication Logic */
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  errorEl.classList.add('hidden');
  btn.disabled = true;

  try {
    const res = await apiPost('login', { username, password });
    APP_STATE.token = res.token;
    APP_STATE.user = res.user;
    localStorage.setItem('adf_token', res.token);
    localStorage.setItem('adf_user', JSON.stringify(res.user));
    
    renderUserInfo();
    showView('main-view');
    loadDashboard();
    loadTransactions();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

async function validateSession() {
  try {
    const res = await apiPost('me');
    APP_STATE.user = res.user;
    localStorage.setItem('adf_user', JSON.stringify(res.user));
    renderUserInfo();
    showView('main-view');
    loadDashboard();
    loadTransactions();
  } catch (err) {
    console.warn('Session expired or invalid:', err.message);
    clearSession();
    showView('login-view');
  }
}

async function handleLogout() {
  try {
    if (APP_STATE.token) await apiPost('logout');
  } catch (e) {
    console.log('Logout cleanup error:', e);
  } finally {
    clearSession();
    showView('login-view');
  }
}

function clearSession() {
  APP_STATE.token = '';
  APP_STATE.user = null;
  localStorage.removeItem('adf_token');
  localStorage.removeItem('adf_user');
}

/** Enforce 12-Hour Client Auto Logout Check */
function setupAutoLogoutCheck() {
  if (APP_STATE.sessionTimer) clearInterval(APP_STATE.sessionTimer);
  APP_STATE.sessionTimer = setInterval(() => {
    if (APP_STATE.token) {
      validateSession();
    }
  }, 10 * 60 * 1000); // Check every 10 minutes
}

/** UI Renderers */
function showView(viewId) {
  document.querySelectorAll('.view-container').forEach(v => v.classList.add('hidden'));
  document.getElementById(viewId).classList.remove('hidden');
}

function showModal(modalId) { document.getElementById(modalId).classList.remove('hidden'); }
function hideModal(modalId) { document.getElementById(modalId).classList.add('hidden'); }

function renderUserInfo() {
  if (!APP_STATE.user) return;
  document.getElementById('user-display-name').textContent = APP_STATE.user.Nama || APP_STATE.user.Username;
  document.getElementById('user-display-role').textContent = APP_STATE.user.Role;
  document.getElementById('user-display-place').textContent = APP_STATE.user.Place;
  document.getElementById('form-place').value = APP_STATE.user.Place;

  // Role visibility permissions
  const role = String(APP_STATE.user.Role).toUpperCase();
  const formBtn = document.getElementById('nav-form-btn');
  if (['STAFF', 'ADM'].includes(role)) {
    formBtn.classList.remove('hidden');
  } else {
    formBtn.classList.add('hidden');
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const activeBtn = document.querySelector(`[data-tab="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  document.getElementById(tabId).classList.add('active');

  if (tabId === 'tab-dashboard') loadDashboard();
  if (tabId === 'tab-history') loadTransactions();
}

/** Product Search & Form Calculations */
async function handleProductSearch() {
  const query = document.getElementById('form-search-sku').value.trim();
  if (!query) return;

  const alertBox = document.getElementById('non-master-alert');
  alertBox.classList.add('hidden');

  try {
    const res = await apiPost('searchProduct', { query });
    if (res.product) {
      document.getElementById('form-sku').value = res.product.SKU || '';
      document.getElementById('form-deskripsi').value = res.product['Deskripsi Produk'] || '';
      document.getElementById('form-dept').value = res.product.Dept || '';
      document.getElementById('form-commodity').value = res.product.Commodity || '';
      document.getElementById('form-price').value = res.product.Price || 0;
      calculateFormTotals();
    } else {
      alertBox.classList.remove('hidden');
      document.getElementById('form-sku').value = query;
      document.getElementById('form-deskripsi').value = '';
    }
  } catch (err) {
    alert('Gagal mencari produk: ' + err.message);
  }
}

function calculateFormTotals() {
  const price = parseFloat(document.getElementById('form-price').value) || 0;
  const qty = parseFloat(document.getElementById('form-qty').value) || 0;
  const discPct = Math.min(100, Math.max(0, parseFloat(document.getElementById('form-discount-percent').value) || 0));

  const promoAmount = price * qty;
  const discountAmount = promoAmount * (discPct / 100);
  const finalAmount = promoAmount - discountAmount;

  document.getElementById('calc-promo').textContent = formatRp(promoAmount);
  document.getElementById('calc-discount').textContent = formatRp(discountAmount);
  document.getElementById('calc-final').textContent = formatRp(finalAmount);
}

function formatRp(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

/** Transaction Creation & Photo Uploads */
async function handleCreateTransaction(e) {
  e.preventDefault();
  const alertBox = document.getElementById('non-master-alert');
  const isNonMaster = !alertBox.classList.contains('hidden');

  const payload = {
    data: {
      Place: document.getElementById('form-place').value,
      SKU: document.getElementById('form-sku').value.trim(),
      Deskripsi: document.getElementById('form-deskripsi').value.trim(),
      Dept: document.getElementById('form-dept').value.trim(),
      Commodity: document.getElementById('form-commodity').value.trim(),
      Price: parseFloat(document.getElementById('form-price').value) || 0,
      Qty: parseFloat(document.getElementById('form-qty').value) || 1,
      DiscountPercent: parseFloat(document.getElementById('form-discount-percent').value) || 0,
      Reason: document.getElementById('form-reason').value.trim(),
      Proposal: document.getElementById('form-proposal').value.trim(),
      DocNo: document.getElementById('form-docno').value.trim(),
      IsNonMaster: isNonMaster ? 'true' : 'false'
    }
  };

  const btn = document.getElementById('submit-trans-btn');
  btn.disabled = true;

  try {
    const res = await apiPost('createTransaction', payload);
    APP_STATE.activeTransNo = res.transaction.TransNo;
    document.getElementById('created-trans-no').textContent = res.transaction.TransNo;
    document.getElementById('photo-upload-section').classList.remove('hidden');
    alert(`Transaksi ${res.transaction.TransNo} berhasil dibuat! Silakan upload foto pendukung.`);
  } catch (err) {
    alert('Gagal membuat transaksi: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

async function handlePhotoUpload(index) {
  if (!APP_STATE.activeTransNo) {
    alert('Buat transaksi terlebih dahulu sebelum mengupload foto.');
    return;
  }

  const fileInput = document.getElementById(`photo-input-${index}`);
  if (!fileInput.files || !fileInput.files[0]) {
    alert(`Pilih file foto untuk Foto ${index}.`);
    return;
  }

  const file = fileInput.files[0];
  const btn = document.getElementById(`upload-btn-${index}`);
  const statusSpan = document.getElementById(`photo-status-${index}`);

  btn.disabled = true;
  statusSpan.textContent = 'Mendapatkan lokasi GPS & memproses...';

  try {
    const coords = await getCurrentLocation();
    const dataUrl = await fileToDataUrl(file);

    const res = await apiPost('uploadPhoto', {
      TransNo: APP_STATE.activeTransNo,
      index: index,
      dataUrl: dataUrl,
      latitude: coords.latitude,
      longitude: coords.longitude
    });

    statusSpan.textContent = `Uploaded (File ID: ${res.fileId.slice(0, 8)}...)`;
    statusSpan.style.color = '#16a34a';
  } catch (err) {
    statusSpan.textContent = 'Gagal upload';
    statusSpan.style.color = '#dc2626';
    alert('Gagal upload foto: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = err => reject(err);
    reader.readAsDataURL(file);
  });
}

function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ latitude: 'unavailable', longitude: 'unavailable' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve({ latitude: 'unavailable', longitude: 'unavailable' }),
      { timeout: 8000, enableHighAccuracy: true }
    );
  });
}

/** Dashboard & History Loaders */
async function loadDashboard() {
  try {
    const res = await apiPost('dashboard');
    const c = res.counts;
    document.getElementById('stat-total').textContent = c.total || 0;
    document.getElementById('stat-pending').textContent = c.pending || 0;
    document.getElementById('stat-sendback').textContent = c.sendback || 0;
    document.getElementById('stat-completed').textContent = c.completed || 0;
    document.getElementById('stat-overdue').textContent = c.overdue || 0;
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

async function loadTransactions() {
  const tbody = document.getElementById('transaction-table-body');
  const statusFilter = document.getElementById('filter-status').value;
  tbody.innerHTML = '<tr><td colspan="9" class="text-center">Memuat data...</td></tr>';

  try {
    const res = await apiPost('listTransactions', { status: statusFilter });
    if (!res.transactions || res.transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center">Tidak ada transaksi ditemukan.</td></tr>';
      return;
    }

    tbody.innerHTML = res.transactions.map(item => `
      <tr>
        <td><strong>${item.TransNo}</strong></td>
        <td>${item.Date ? String(item.Date).slice(0, 10) : '-'}</td>
        <td>${item.Place}</td>
        <td>${item.SKU || '-'}<br><span class="text-sm text-muted">${item.Deskripsi || ''}</span></td>
        <td>${item.Qty}</td>
        <td>${formatRp(item.FinalAmount || 0)}</td>
        <td><span class="badge">${item.Status}</span></td>
        <td><span class="badge ${item.SLAStatus === 'OVERDUE' ? 'badge-danger' : ''}">${item.SLAStatus || 'ON_TRACK'}</span></td>
        <td><button class="btn btn-secondary btn-sm" onclick="openDetailModal('${item.TransNo}')">Detail</button></td>
      </tr>
    `).join('');
    
    window.lastFetchedTransactions = res.transactions;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Gagal memuat: ${err.message}</td></tr>`;
  }
}

/** Transaction Detail & Approval Workflows */
function openDetailModal(transNo) {
  const list = window.lastFetchedTransactions || [];
  const item = list.find(t => t.TransNo === transNo);
  if (!item) return;

  document.getElementById('modal-trans-no').textContent = item.TransNo;
  const body = document.getElementById('modal-detail-content');
  const footer = document.getElementById('modal-action-footer');

  body.innerHTML = `
    <div class="form-row">
      <div class="form-group flex-1"><strong>Pemohon:</strong> ${item.Nama} (${item.Username})</div>
      <div class="form-group flex-1"><strong>Lokasi:</strong> ${item.Place}</div>
    </div>
    <div class="form-row">
      <div class="form-group flex-1"><strong>SKU:</strong> ${item.SKU || '-'}</div>
      <div class="form-group flex-2"><strong>Deskripsi:</strong> ${item.Deskripsi}</div>
    </div>
    <div class="form-row">
      <div class="form-group flex-1"><strong>Harga:</strong> ${formatRp(item.Price)}</div>
      <div class="form-group flex-1"><strong>Qty:</strong> ${item.Qty}</div>
      <div class="form-group flex-1"><strong>Diskon:</strong> ${item.DiscountPercent}%</div>
    </div>
    <div class="form-row">
      <div class="form-group flex-1"><strong>Total Final:</strong> ${formatRp(item.FinalAmount)}</div>
      <div class="form-group flex-1"><strong>Status:</strong> ${item.Status}</div>
    </div>
    <hr>
    <div class="form-group">
      <strong>Catatan Approval Sebelumnya:</strong>
      <div class="text-sm">
        ${item.ADMFeedback ? `<p><strong>ADM:</strong> \${item.ADMFeedback}</p>` : ''}
        ${item.MGRFeedback ? `<p><strong>MGR:</strong> \${item.MGRFeedback}</p>` : ''}
        ${item.MSOFeedback ? `<p><strong>MSO:</strong> \${item.MSOFeedback}</p>` : ''}
        ${item['Buyer Note'] ? `<p><strong>Buyer Note:</strong> \${item['Buyer Note']}</p>` : ''}
        ${item.StoreFeedback ? `<p><strong>Store Feedback:</strong> \${item.StoreFeedback}</p>` : ''}
      </div>
    </div>
  `;

  footer.innerHTML = renderApprovalControls(item);
  showModal('detail-modal');
}

function renderApprovalControls(item) {
  const role = String(APP_STATE.user.Role).toUpperCase();
  const status = String(item.Status);

  let html = `<div class="form-group flex-1" style="margin-bottom:0">`;

  if ((role === 'ADM' && status === 'PENDING_ADM') ||
      (role === 'MGR' && status === 'PENDING_MGR') ||
      (role === 'MSO' && status === 'PENDING_MSO')) {
    html += `
      <input type="text" id="action-feedback" placeholder="Masukkan catatan feedback / alasan..." style="margin-bottom:0.5rem; width:100%">
      <div>
        <button class="btn btn-success btn-sm" onclick="executeTransition('${item.TransNo}', 'approve')">Approve</button>
        <button class="btn btn-danger btn-sm" onclick="executeTransition('${item.TransNo}', 'sendback')">Sendback</button>
      </div>
    `;
  } else if (role === 'BUYER' && status === 'PENDING_BUYER') {
    html += `
      <input type="text" id="buyer-note" placeholder="Buyer Note..." style="margin-bottom:0.3rem; width:100%">
      <input type="text" id="buyer-caused-by" placeholder="Caused By..." style="margin-bottom:0.3rem; width:100%">
      <select id="buyer-decision" style="margin-bottom:0.5rem; width:100%">
        <option value="APPROVE_DISCOUNT">Approve Discount</option>
        <option value="WRITE_OFF">Write Off (WO)</option>
      </select>
      <div>
        <button class="btn btn-success btn-sm" onclick="executeBuyerApprove('${item.TransNo}')">Approve ke Store</button>
        <button class="btn btn-danger btn-sm" onclick="executeTransition('${item.TransNo}', 'sendback')">Sendback</button>
      </div>
    `;
  } else if (['STAFF', 'ADM'].includes(role) && ['PENDING_STORE', 'SENDBACK_STAFF'].includes(status)) {
    html += `
      <input type="text" id="store-trans-no" placeholder="No. Transaksi Kasir Store (Wajib jika Accept)" style="margin-bottom:0.3rem; width:100%">
      <input type="text" id="store-feedback" placeholder="Feedback / Alasan Keberatan" style="margin-bottom:0.5rem; width:100%">
      <div>
        <button class="btn btn-success btn-sm" onclick="executeStoreFeedback('${item.TransNo}', 'accept')">Store Accept</button>
        <button class="btn btn-warning btn-sm" onclick="executeStoreFeedback('${item.TransNo}', 'object')">Keberatan (Object)</button>
      </div>
    `;
  } else if (role === 'BUYER' && ['PENDING_BUYER_REVIEW', 'PENDING_BUYER_FINAL'].includes(status)) {
    html += `
      <input type="text" id="buyer-final-note" placeholder="Catatan Keputusan Final..." style="margin-bottom:0.5rem; width:100%">
      <div>
        ${status === 'PENDING_BUYER_REVIEW' ? `
          <button class="btn btn-primary btn-sm" onclick="executeBuyerFinal('\${item.TransNo}', 'accept')">Terima Keberatan</button>
          <button class="btn btn-warning btn-sm" onclick="executeBuyerFinal('\${item.TransNo}', 'revise')">Minta Revisi</button>
        ` : `
          <button class="btn btn-success btn-sm" onclick="executeBuyerFinal('\${item.TransNo}', 'completed')">Selesaikan Transaksi (Complete)</button>
        `}
      </div>
    `;
  } else {
    html += `<span class="text-sm text-muted">Tidak ada aksi approval yang diperlukan untuk role Anda pada status ini.</span>`;
  }

  html += `</div>`;
  return html;
}

/** Transition Handlers */
async function executeTransition(transNo, action) {
  const feedback = document.getElementById('action-feedback')?.value || '';
  try {
    await apiPost(action, { TransNo: transNo, feedback });
    alert(`Transaksi berhasil di-${action}.`);
    hideModal('detail-modal');
    loadTransactions();
    loadDashboard();
  } catch (err) {
    alert('Gagal memproses approval: ' + err.message);
  }
}

async function executeBuyerApprove(transNo) {
  const buyerNote = document.getElementById('buyer-note')?.value || '';
  const BuyerCausedBy = document.getElementById('buyer-caused-by')?.value || '';
  const buyerDecision = document.getElementById('buyer-decision')?.value || '';

  try {
    await apiPost('approve', { TransNo: transNo, buyerNote, BuyerCausedBy, buyerDecision });
    alert('Transaksi berhasil di-approve oleh Buyer.');
    hideModal('detail-modal');
    loadTransactions();
  } catch (err) {
    alert('Gagal memproses approval Buyer: ' + err.message);
  }
}

async function executeStoreFeedback(transNo, actionType) {
  const StoreTransNo = document.getElementById('store-trans-no')?.value || '';
  const feedback = document.getElementById('store-feedback')?.value || '';

  try {
    await apiPost('storeFeedback', { TransNo: transNo, action: actionType, StoreTransNo, feedback });
    alert('Feedback Store berhasil disimpan.');
    hideModal('detail-modal');
    loadTransactions();
  } catch (err) {
    alert('Gagal menyimpan feedback Store: ' + err.message);
  }
}

async function executeBuyerFinal(transNo, decisionType) {
  const note = document.getElementById('buyer-final-note')?.value || '';
  try {
    await apiPost('buyerFinal', { TransNo: transNo, decision: decisionType, note });
    alert('Keputusan Final Buyer berhasil disimpan.');
    hideModal('detail-modal');
    loadTransactions();
    loadDashboard();
  } catch (err) {
    alert('Gagal menyimpan keputusan Buyer: ' + err.message);
  }
}
