/* ADF frontend. Configure API_BASE to a secure HTTPS proxy that forwards to Apps Script. */
const API_BASE = 'https://script.google.com/macros/s/AKfycbxOa_H_6dQKzV6nx9-Xjujc9_tpaKu-2ws_gi6C4xRvWpYearDS73iFxvKG2bm2wvzy/exec'; // Example: https://your-proxy.example.com/api
const STORAGE_TOKEN = 'adf_session_token';
const STORAGE_DEVICE = 'adf_device_id';
let currentUser = null;
let productCache = null;

const $ = id => document.getElementById(id);
function deviceId() {
  let id = localStorage.getItem(STORAGE_DEVICE);
  if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : 'dev-' + Math.random().toString(36).slice(2) + Date.now(); localStorage.setItem(STORAGE_DEVICE,id); }
  return id;
}
async function api(action, extra={}) {
  if (!API_BASE) throw new Error('API belum dikonfigurasi. Isi API_BASE di app.js setelah backend/proxy dipasang.');
  const res = await fetch(API_BASE, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,token:localStorage.getItem(STORAGE_TOKEN)||'',deviceId:deviceId(),...extra})
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Permintaan gagal.');
  return data;
}
function showLogin() {
  $('loginView').hidden=false; $('appView').hidden=true; $('nav').hidden=true; $('userChip').hidden=true;
}
function showApp() {
  $('loginView').hidden=true; $('appView').hidden=false; $('nav').hidden=false; $('userChip').hidden=false;
  $('userName').textContent=currentUser.Nama||currentUser.Username;
  $('userRole').textContent=`${currentUser.Role} · ${currentUser.Place}`;
  $('avatar').textContent=(currentUser.Nama||currentUser.Username||'A').slice(0,1).toUpperCase();
  $('connectionLabel').textContent='Session active';
  renderDashboard();
}
$('loginForm').addEventListener('submit', async e=>{
  e.preventDefault(); $('loginMessage').textContent='Memeriksa akun…';
  try {
    const result=await api('login',{username:$('username').value.trim(),password:$('password').value,deviceId:deviceId()});
    localStorage.setItem(STORAGE_TOKEN,result.token); currentUser=result.user;
    $('password').value=''; $('loginMessage').textContent=''; showApp();
  } catch(err) { $('loginMessage').textContent=err.message; }
});
$('logoutBtn').addEventListener('click', async()=>{
  try { await api('logout'); } catch(e) {}
  localStorage.removeItem(STORAGE_TOKEN); currentUser=null; showLogin();
});
$('nav').addEventListener('click', e=>{
  const b=e.target.closest('[data-view]'); if(!b)return;
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===b));
  if(b.dataset.view==='dashboard') renderDashboard();
  if(b.dataset.view==='new') openNewForm();
  if(b.dataset.view==='mine') renderTransactions('mine');
  if(b.dataset.view==='approval') renderTransactions('approval');
});
async function boot() {
  const token=localStorage.getItem(STORAGE_TOKEN);
  if(!token){showLogin();return;}
  try { const r=await api('me'); currentUser=r.user; showApp(); }
  catch(e){localStorage.removeItem(STORAGE_TOKEN);showLogin();}
}
async function renderDashboard() {
  $('pageTitle').textContent='Dashboard';
  $('viewContent').innerHTML=`<div class="section-head"><div><h2>Ringkasan pengajuan</h2><p class="muted">Pantau status transaksi dan SLA Anda.</p></div><button class="primary" id="newBtn">＋ New Proposal</button></div><div class="stats" id="stats"><div class="stat-card">Loading…</div></div><div class="panel"><div class="section-head"><h2>Transaksi terbaru</h2><button class="secondary" id="viewAllBtn">Lihat semua</button></div><div id="recentTable" class="empty">Memuat data…</div></div>`;
  $('newBtn').onclick=openNewForm; $('viewAllBtn').onclick=()=>renderTransactions('mine');
  try {
    const [d,t]=await Promise.all([api('dashboard'),api('listTransactions')]);
    const c=d.counts;
    $('stats').innerHTML=[
      ['Total pengajuan',c.total,'Semua transaksi yang dapat Anda akses','▤'],
      ['Menunggu approval',c.pending,'Sedang dalam proses','◷'],
      ['Sendback',c.sendback,'Perlu perhatian atau revisi','↶'],
      ['SLA terlambat',c.overdue,'Periksa antrean yang tertunda','!']
    ].map(x=>`<div class="stat-card"><div class="stat-top"><span>${x[0]}</span><span class="stat-icon">${x[3]}</span></div><div class="stat-value">${x[1]}</div><div class="stat-note">${x[2]}</div></div>`).join('');
    $('recentTable').innerHTML=tableHTML(t.transactions.slice(0,8));
  } catch(e) { $('recentTable').innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`; }
}
async function renderTransactions(mode) {
  $('pageTitle').textContent=mode==='approval'?'Approval Center':'My Submission';
  $('viewContent').innerHTML=`<div class="section-head"><div><h2>${mode==='approval'?'Antrean approval':'Riwayat pengajuan'}</h2><p class="muted">Data dibatasi sesuai role dan Place akun.</p></div><button class="primary" id="newBtn">＋ New Proposal</button></div><div class="panel"><div id="transactions" class="empty">Memuat data…</div></div>`;
  $('newBtn').onclick=openNewForm;
  try {
    const r=await api('listTransactions');
    let rows=r.transactions;
    if(mode==='approval') rows=rows.filter(x=>isMyQueue(x.Status,currentUser.Role));
    $('transactions').innerHTML=tableHTML(rows);
    document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openTransaction(b.dataset.open));
  } catch(e){$('transactions').innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`;}
}
function isMyQueue(status,role) {
  return ({ADM:['PENDING_ADM'],MGR:['PENDING_MGR'],MSO:['PENDING_MSO'],BUYER:['PENDING_BUYER','PENDING_BUYER_REVIEW','PENDING_BUYER_FINAL']})[role]?.includes(status)||false;
}
function tableHTML(rows) {
  if(!rows||!rows.length)return '<div class="empty">Belum ada transaksi.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>TransNo</th><th>Date</th><th>Place</th><th>Product</th><th>Status</th><th>SLA</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${escapeHtml(r.TransNo)}</b></td><td>${escapeHtml(formatDate(r.Date))}</td><td>${escapeHtml(r.Place)}</td><td>${escapeHtml(r.SKU||r.Deskripsi||'—')}</td><td><span class="status ${r.Status==='COMPLETED'?'done':''}">${escapeHtml(r.Status)}</span></td><td><span class="status ${r.SLAStatus==='OVERDUE'?'overdue':''}">${escapeHtml(r.SLAStatus||'—')}</span></td><td><button class="secondary" data-open="${escapeHtml(r.TransNo)}">Detail</button></td></tr>`).join('')}</tbody></table></div>`;
}
function openNewForm() {
  $('modalTitle').textContent='New Proposal';
  $('modalBody').innerHTML=`<form id="proposalForm">
    <div class="form-grid">
      <label class="wide">SKU / KLS / Artikel <input id="productSearch" placeholder="Scan barcode atau ketik kode produk" autocomplete="off" required><span class="help">Hasil akan divalidasi ulang oleh backend saat disimpan.</span></label>
      <div class="wide"><button type="button" class="secondary" id="lookupBtn">Cari DataMaster</button><div id="productResult" class="product-result">Belum ada produk dipilih.</div></div>
      <label>Qty<input id="qty" type="number" min="1" step="1" value="1" required></label>
      <label>Discount (%)<input id="discount" type="number" min="0" max="100" step=".01" value="0"></label>
      <label>Proposal<select id="proposal"><option value="">Pilih proposal</option><option>Promo</option><option>Clearance</option></select></label>
      <label>DocNo<input id="docNo" placeholder="Nomor dokumen (opsional)"></label>
      <label class="wide">Reason<textarea id="reason" rows="3" required placeholder="Jelaskan alasan pengajuan"></textarea></label>
      <label class="wide">Jika produk tidak ditemukan, deskripsi manual<input id="manualDescription" placeholder="Diisi jika non-master"></label>
      <label>Dept manual<input id="manualDept" placeholder="Dept"></label>
      <label>Commodity manual<input id="manualCommodity" placeholder="Commodity"></label>
      <label>Price manual<input id="manualPrice" type="number" min="0" step=".01" placeholder="Harga"></label>
      <label class="wide"><span class="help">Produk non-master ditandai otomatis dan wajib divalidasi ADM. Harga manual bukan data master.</span></label>
    </div>
    <div class="photo-box"><b>Foto dokumentasi (opsional saat draft awal)</b><p class="help">Unggah setelah transaksi tersimpan agar file dikaitkan ke folder transaksi. Watermark server-side permanen memerlukan image compositor yang dikonfigurasi.</p></div>
    <div class="action-row" style="margin-top:22px"><button class="primary" type="submit">Simpan pengajuan</button><button class="secondary" type="button" id="cancelForm">Batal</button></div>
    <div id="formMessage" class="message"></div>
  </form>`;
  productCache=null;
  $('modal').showModal();
  $('closeModal').onclick=()=>$('modal').close();
  $('cancelForm').onclick=()=>$('modal').close();
  $('lookupBtn').onclick=lookupProduct;
  $('productSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();lookupProduct();}});
  $('proposalForm').onsubmit=submitProposal;
}
async function lookupProduct() {
  const q=$('productSearch').value.trim(); if(!q)return;
  $('productResult').textContent='Mencari…';
  try {
    const r=await api('searchProduct',{query:q}); productCache=r.product||null;
    if(productCache) {
      $('productResult').innerHTML=`<b>${escapeHtml(productCache.SKU)}</b> · ${escapeHtml(productCache['Deskripsi Produk'])}<br>Dept: ${escapeHtml(productCache.Dept)} · Commodity: ${escapeHtml(productCache.Commodity)}<br>Price: ${escapeHtml(productCache.Price)}`;
      $('manualDescription').value=productCache['Deskripsi Produk']||'';
    } else $('productResult').textContent='Produk tidak ditemukan. Lengkapi data manual; ADM wajib memvalidasi.';
  } catch(e){$('productResult').textContent=e.message;}
}
async function submitProposal(e) {
  e.preventDefault(); const msg=$('formMessage'); msg.textContent='Menyimpan…';
  const master=productCache;
  const data={
    Place:currentUser.Place,SKU:master?master.SKU:$('productSearch').value.trim(),
    Deskripsi:master?master['Deskripsi Produk']:$('manualDescription').value.trim(),
    Dept:master?master.Dept:$('manualDept').value.trim(),
    Commodity:master?master.Commodity:$('manualCommodity').value.trim(),
    Price:master?Number(master.Price):Number($('manualPrice').value||0),
    Qty:Number($('qty').value),DiscountPercent:Number($('discount').value||0),
    Proposal:$('proposal').value,DocNo:$('docNo').value.trim(),Reason:$('reason').value.trim(),
    IsNonMaster:!master
  };
  try {
    const r=await api('createTransaction',{data});
    msg.textContent='Tersimpan: '+r.transaction.TransNo;
    setTimeout(()=>{$('modal').close();renderDashboard();},700);
  } catch(err){msg.textContent=err.message;}
}
async function openTransaction(transNo) {
  try {
    const r=await api('listTransactions'); const t=r.transactions.find(x=>x.TransNo===transNo); if(!t)throw new Error('Transaksi tidak ditemukan.');
    $('modalTitle').textContent=transNo;
    $('modalBody').innerHTML=`<div class="product-result"><b>Status:</b> ${escapeHtml(t.Status)}<br><b>Produk:</b> ${escapeHtml(t.SKU)} · ${escapeHtml(t.Deskripsi)}<br><b>Qty:</b> ${escapeHtml(t.Qty)} · <b>Final Amount:</b> ${escapeHtml(t.FinalAmount)}<br><b>Reason:</b> ${escapeHtml(t.Reason)}<br><b>Place:</b> ${escapeHtml(t.Place)}<br><b>Folder:</b> ${t['Link Folder']?`<a href="${escapeHtml(t['Link Folder'])}" target="_blank" rel="noopener">Buka folder Drive</a>`:'—'}</div>
    <form id="decisionForm"><label>Feedback<textarea id="decisionFeedback" rows="3" placeholder="Wajib saat sendback"></textarea></label>
    <label>Buyer decision (jika BUYER)<select id="buyerDecision"><option value="">Pilih keputusan</option><option value="Approve Discount">Approve Discount</option><option value="WO">WO</option><option value="Reject">Reject</option></select></label>
    <div class="action-row" style="margin-top:18px"><button class="primary" type="button" id="approveBtn">Approve / Submit</button><button class="secondary" type="button" id="sendbackBtn">Sendback</button></div><div id="decisionMessage" class="message"></div></form>`;
    $('modal').showModal(); $('closeModal').onclick=()=>$('modal').close();
    $('approveBtn').onclick=()=>submitDecision(t,'approve');
    $('sendbackBtn').onclick=()=>submitDecision(t,'sendback');
  } catch(e){alert(e.message);}
}
async function submitDecision(t,action) {
  const feedback=$('decisionFeedback').value.trim(), msg=$('decisionMessage');
  try {
    const r=await api(action,{TransNo:t.TransNo,feedback,buyerNote:feedback,buyerDecision:$('buyerDecision').value});
    msg.textContent='Status baru: '+r.Status; setTimeout(()=>{$('modal').close();renderDashboard();},700);
  } catch(e){msg.textContent=e.message;}
}
function formatDate(d){if(!d)return '—';const dt=new Date(d);return isNaN(dt)?String(d):dt.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
$('closeModal').onclick=()=>$('modal').close();
showLogin();
