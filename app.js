/* Will Ruby's Garage shop desk.
   Records live in this browser only. The PIN is a session gate, not encryption. */
'use strict';

var STORAGE_KEY = 'will-rubys-garage:data:v1';
var SESSION_KEY = 'will-rubys-garage:session';
var DEFAULT_EMAIL = 'Brennentrevor@yahoo.com';
var BUSINESS_NAME = 'Will Ruby’s Garage';
var MAX_PHOTOS = 8;

var DEFAULT_SETTINGS = {
  businessName: BUSINESS_NAME,
  ownerName: 'Will Ruby',
  address: '',
  phone: '',
  email: DEFAULT_EMAIL,
  laborRate: 120,
  laborCostRate: 40,
  taxRate: 6,
  partsMarkup: 40,
  terms: 'Payment due upon completion. Thank you for your business!'
};

var state = {
  settings: Object.assign({}, DEFAULT_SETTINGS),
  customers: [],
  quotes: [],
  invoices: [],
  timeEntries: [],
  nextId: 1
};

var currentQuote = null;
var editKind = 'quote';
var editIsNew = false;

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attr(value) {
  return escapeHtml(value).replace(/\r\n|\n|\r/g, '&#10;');
}

function textBreaks(value) {
  return escapeHtml(value).replace(/\r\n|\n|\r/g, '<br>');
}

function todayISO() {
  var d = new Date();
  var z = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

function formatMoney(n) {
  var v = GarageCalc.roundMoney(n);
  var sign = v < 0 ? '-' : '';
  return sign + '$' + Math.abs(v).toFixed(2);
}

function formatQty(n) {
  var v = Math.round((Number(n) || 0) * 100) / 100;
  return String(v);
}

function formatDate(d) {
  if (!d) return '';
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d));
  if (m) {
    var local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return local.toLocaleDateString();
  }
  var date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

function showToast(message) {
  var el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
}

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var hex = '';
  for (var i = 0; i < 32; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20, 32);
}

function genId() {
  state.nextId += 1;
  return newId();
}

function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function jsId(id) {
  return '\'' + String(id).replace(/\\/g, '\\\\').replace(/'/g, '\\\'') + '\'';
}

function ensureNextId() {
  var max = 0;
  function take(row) {
    if (row && typeof row.id === 'number' && row.id > max) max = row.id;
  }
  state.customers.forEach(function (c) {
    take(c);
    (c.vehicles || []).forEach(take);
  });
  state.quotes.forEach(take);
  state.invoices.forEach(take);
  state.timeEntries.forEach(take);
  if (!state.nextId || state.nextId <= max) state.nextId = max + 1;
}

function asObjectList(list) {
  return Array.isArray(list) ? list.filter(function (row) { return row && typeof row === 'object'; }) : [];
}

function applyPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid backup');
  }
  if (data.app && data.app !== 'will-rubys-garage') {
    throw new Error('Wrong app');
  }
  if (!Array.isArray(data.customers) || !Array.isArray(data.quotes) || !Array.isArray(data.invoices)) {
    throw new Error('Invalid backup');
  }
  state.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
  state.customers = asObjectList(data.customers);
  state.quotes = asObjectList(data.quotes);
  state.invoices = asObjectList(data.invoices);
  state.timeEntries = asObjectList(data.timeEntries);
  state.nextId = Number(data.nextId) || 1;
  ensureNextId();
}

function loadData() {
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    applyPayload(JSON.parse(saved));
  } catch (err) {
    console.error('Load failed', err);
    state.settings = Object.assign({}, DEFAULT_SETTINGS);
  }
}

function canSave() {
  if (!window.WrgCloud || !WrgCloud.isConfigured()) {
    showToast('Shop cloud is not configured. Nothing was saved to the shared shop.');
    return false;
  }
  var gate = WrgSync.canWrite(WrgCloud.status());
  if (!gate.ok) {
    showToast(gate.message);
    setSyncStatus(WrgCloud.status());
    return false;
  }
  return true;
}

function commitShop(okMessage) {
  if (!canSave()) return Promise.resolve({ ok: false, code: 'blocked' });
  setSyncStatus({ configured: true, signedIn: true, member: true, online: true, loading: true });
  return WrgCloud.persist(state).then(function (result) {
    setSyncStatus(WrgCloud.status());
    if (!result || !result.ok) {
      showToast((result && result.message) || 'Not saved.');
      if (result && result.conflicts) showConflictBanner(result.conflicts);
      return result || { ok: false };
    }
    if (okMessage) showToast(okMessage);
    return result;
  }).catch(function (err) {
    showToast(err && err.message ? err.message : 'Save failed.');
    return { ok: false, message: err && err.message };
  });
}

function saveData() {
  return commitShop(null);
}

function storageKb() {
  var raw = localStorage.getItem(STORAGE_KEY) || '';
  return Math.round((raw.length * 2) / 1024);
}

function calcQuoteTotals(doc) {
  return GarageCalc.calcDocumentTotals(doc, state.settings);
}

function findCustomer(id) {
  return state.customers.find(function (c) { return sameId(c.id, id); }) || null;
}

function findById(list, id) {
  return (list || []).find(function (row) { return sameId(row.id, id); }) || null;
}

function vehicleLabel(v) {
  if (!v) return '';
  return [v.year, v.make, v.model].filter(Boolean).join(' ');
}

function getVehiclesForCustomer(cid) {
  var c = findCustomer(cid);
  return c && Array.isArray(c.vehicles) ? c.vehicles : [];
}

function statusClass(status) {
  var known = { draft: 1, sent: 1, paid: 1, overdue: 1, converted: 1 };
  return known[status] ? status : 'draft';
}

function byDateDesc(a, b) {
  var da = a.date || '';
  var db = b.date || '';
  if (da !== db) return da < db ? 1 : -1;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function cloneDoc(doc) {
  return JSON.parse(JSON.stringify(doc));
}

function safeImageSrc(url) {
  if (typeof url !== 'string' || !url || url.length > 2000000) return '';
  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
  try {
    var parsed = new URL(url, window.location.href);
    if (parsed.protocol === 'https:' && parsed.hostname === 'evgpnpqtnemlbnygpbxs.supabase.co' && parsed.pathname.indexOf('/storage/v1/object/') !== -1) {
      return url;
    }
  } catch (err) { /* ignore bad urls */ }
  return '';
}

function refreshBrand() {
  var title = state.settings.businessName || BUSINESS_NAME;
  var h1 = $('.app-header h1');
  if (h1) h1.textContent = title;
  document.title = title;
}

function quoteIsMeaningful(q) {
  if (!q) return false;
  return (q.items && q.items.length) ||
    (q.notes && String(q.notes).trim()) ||
    (q.workPerformed && String(q.workPerformed).trim()) ||
    (q.photos && q.photos.length) ||
    q.customerId;
}

function showView(name) {
  if (name === 'new-quote') {
    showNewQuote();
    return;
  }
  var editor = $('#view-quote-editor');
  if (editor && editor.classList.contains('active') && name !== 'quote-editor') {
    maybeAutosave();
  }
  $all('.view').forEach(function (v) { v.classList.remove('active'); });
  var view = $('#view-' + name);
  if (view) view.classList.add('active');
  var navName = name === 'customer-detail' ? 'customers'
    : (name === 'quote-editor' ? (editKind === 'invoice' ? 'invoices' : 'quotes')
    : (name === 'invoice' ? 'invoices' : name));
  $all('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
  var btn = $('.nav-btn[data-view="' + navName + '"]');
  if (btn) btn.classList.add('active');
  var renderers = {
    dashboard: renderDashboard,
    customers: renderCustomers,
    quotes: renderQuotes,
    invoices: renderInvoices,
    time: renderTime,
    settings: renderSettings
  };
  if (renderers[name]) renderers[name]();
  window.scrollTo(0, 0);
}

function renderDashboard() {
  var el = $('#view-dashboard');
  var invoices = state.invoices || [];
  var quotes = state.quotes || [];
  var paid = invoices.filter(function (i) { return i.status === 'paid'; });
  var outstanding = invoices.filter(function (i) { return i.status !== 'paid' && i.status !== 'draft'; });
  var totalRevenue = paid.reduce(function (s, i) { return s + calcQuoteTotals(i).total; }, 0);
  var totalOutstanding = outstanding.reduce(function (s, i) { return s + calcQuoteTotals(i).total; }, 0);
  var totalProfit = paid.reduce(function (s, i) { return s + calcQuoteTotals(i).profit; }, 0);
  var recent = quotes.map(function (q) { return { doc: q, kind: 'quote' }; })
    .concat(invoices.map(function (inv) { return { doc: inv, kind: 'invoice' }; }))
    .sort(function (a, b) { return byDateDesc(a.doc, b.doc); })
    .slice(0, 5);

  el.innerHTML =
    '<input type="search" id="dashboard-search" class="search-input" placeholder="Search customers and jobs" oninput="handleDashboardSearch(this.value)">' +
    '<div id="search-results" style="display:none"></div>' +
    '<div class="stat-grid">' +
      statCard('stat-revenue', formatMoney(totalRevenue), 'Paid revenue') +
      statCard('stat-outstanding', formatMoney(totalOutstanding), 'Outstanding') +
      statCard('stat-profit', formatMoney(totalProfit), 'Profit') +
      statCard('stat-customers', String(state.customers.length), 'Customers') +
    '</div>' +
    '<div class="card"><h3>Recent activity</h3>' +
      (recent.length ? recent.map(function (row) {
        var t = calcQuoteTotals(row.doc);
        var label = row.kind === 'invoice' ? 'Invoice' : 'Quote';
        return '<div class="list-item" onclick="openDocument(\'' + row.kind + '\',' + jsId(row.doc.id) + ')">' +
          '<div><strong>' + label + ' #' + escapeHtml(row.doc.number || row.doc.id) + '</strong>' +
          '<div class="meta">' + escapeHtml(row.doc.customerName || 'No customer') +
          (row.doc.vehicleDesc ? ' · ' + escapeHtml(row.doc.vehicleDesc) : '') +
          ' · ' + escapeHtml(formatDate(row.doc.date)) + '</div></div>' +
          '<div class="text-right"><div>' + formatMoney(t.total) + '</div>' +
          '<div class="meta">' + t.margin.toFixed(0) + '% margin</div></div></div>';
      }).join('') : '<p class="text-muted">No jobs yet. Create your first quote.</p>') +
    '</div>' +
    '<button type="button" class="btn" onclick="showView(\'new-quote\')">+ New quote</button>';
}

function statCard(id, value, label) {
  return '<div class="stat-card"><div class="value" id="' + id + '">' + escapeHtml(value) + '</div><div class="label">' + escapeHtml(label) + '</div></div>';
}

function handleDashboardSearch(query) {
  var resultsEl = $('#search-results');
  if (!resultsEl) return;
  query = String(query || '').trim().toLowerCase();
  window._searchActions = [];
  if (!query) {
    resultsEl.style.display = 'none';
    resultsEl.innerHTML = '';
    return;
  }
  var results = [];
  state.customers.forEach(function (c) {
    var vehicles = (c.vehicles || []).map(function (v) {
      return [v.year, v.make, v.model, v.plate, v.vin].join(' ');
    }).join(' ');
    var hay = [c.name, c.phone, c.email, c.address, vehicles].join(' ').toLowerCase();
    if (hay.indexOf(query) !== -1) {
      results.push({
        type: 'Customer',
        title: c.name || 'Customer',
        meta: [c.phone, c.email].filter(Boolean).join(' · '),
        action: function () { showCustomer(c.id); }
      });
    }
  });
  state.quotes.forEach(function (q) { pushDocResult(results, q, 'Quote', 'quote'); });
  state.invoices.forEach(function (inv) { pushDocResult(results, inv, 'Invoice', 'invoice'); });

  if (!results.length) {
    resultsEl.innerHTML = '<div class="card"><p class="text-muted">No results for “' + escapeHtml(query) + '”</p></div>';
  } else {
    var shown = results.slice(0, 12);
    window._searchActions = shown.map(function (r) { return r.action; });
    resultsEl.innerHTML = '<div class="card"><h3>Search results (' + shown.length + (results.length > shown.length ? '+' : '') + ')</h3>' +
      shown.map(function (r, i) {
        return '<div class="list-item" onclick="searchResultAction(' + i + ')">' +
          '<div><strong>' + escapeHtml(r.title) + '</strong><div class="meta">' + escapeHtml(r.type + (r.meta ? ' · ' + r.meta : '')) + '</div></div><div>→</div></div>';
      }).join('') + '</div>';
  }
  resultsEl.style.display = 'block';
}

function pushDocResult(results, doc, type, kind) {
  var hay = [doc.number, doc.customerName, doc.notes, doc.workPerformed, doc.vehicleDesc, doc.vehiclePlate, doc.vehicleVin]
    .join(' ').toLowerCase();
  var query = ($('#dashboard-search') && $('#dashboard-search').value || '').trim().toLowerCase();
  if (!query || hay.indexOf(query) === -1) return;
  results.push({
    type: type,
    title: type + ' #' + (doc.number || doc.id),
    meta: doc.customerName || '',
    action: function () { openDocument(kind, doc.id); }
  });
}

function searchResultAction(index) {
  if (window._searchActions && window._searchActions[index]) window._searchActions[index]();
}

function openDocument(kind, id) {
  if (kind === 'invoice') viewInvoice(id);
  else viewQuote(id);
}

function renderCustomers() {
  var el = $('#view-customers');
  var customers = state.customers.slice().sort(function (a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  el.innerHTML =
    '<div class="card"><h3>Add customer</h3>' +
    '<form onsubmit="event.preventDefault(); saveNewCustomer();">' +
      '<div class="form-group"><label for="new-name">Name</label><input id="new-name" maxlength="120" autocomplete="name" required></div>' +
      '<div class="form-group"><label for="new-phone">Phone</label><input id="new-phone" type="tel" maxlength="40" autocomplete="tel"></div>' +
      '<div class="form-group"><label for="new-email">Email</label><input id="new-email" type="email" maxlength="120" autocomplete="email"></div>' +
      '<div class="form-group"><label for="new-address">Address</label><textarea id="new-address" maxlength="300" autocomplete="street-address"></textarea></div>' +
      '<button class="btn" type="submit" id="new-customer-save">Save customer</button>' +
    '</form></div>' +
    '<div class="card"><h3>Customers (' + customers.length + ')</h3>' +
      (customers.length ? customers.map(function (c) {
        var count = (c.vehicles || []).length;
        return '<div class="list-item" onclick="showCustomer(' + jsId(c.id) + ')">' +
          '<div><strong>' + escapeHtml(c.name || 'Untitled') + '</strong>' +
          '<div class="meta">' + escapeHtml([c.phone, count + (count === 1 ? ' vehicle' : ' vehicles')].filter(Boolean).join(' · ')) + '</div></div>' +
          '<div>→</div></div>';
      }).join('') : '<p class="text-muted">No customers yet.</p>') +
    '</div>';
}

function saveNewCustomer() {
  if (!canSave()) return;
  var name = ($('#new-name').value || '').trim();
  if (!name) {
    showToast('Name is required.');
    return;
  }
  state.customers.push({
    id: genId(),
    version: 0,
    name: name,
    phone: ($('#new-phone').value || '').trim(),
    email: ($('#new-email').value || '').trim(),
    address: ($('#new-address').value || '').trim(),
    vehicles: []
  });
  commitShop('Customer saved in the shop.').then(function (result) {
    if (!result || !result.ok) return;
    renderCustomers();
  });
}

function showCustomer(id) {
  var c = findCustomer(id);
  if (!c) {
    showView('customers');
    return;
  }
  if (!Array.isArray(c.vehicles)) c.vehicles = [];
  window.vehicleSaveTarget = 'customer';
  var el = $('#view-customer-detail');
  el.innerHTML =
    '<div class="toolbar"><button type="button" class="btn-sm btn-secondary" onclick="showView(\'customers\')">← Back</button></div>' +
    '<div class="card mt-2"><h3>Customer</h3>' +
    '<form onsubmit="event.preventDefault(); saveCustomerEdits();">' +
      '<input type="hidden" id="edit-id" value="' + attr(c.id) + '">' +
      '<div class="form-group"><label for="edit-name">Name</label><input id="edit-name" maxlength="120" required value="' + attr(c.name) + '"></div>' +
      '<div class="form-group"><label for="edit-phone">Phone</label><input id="edit-phone" type="tel" maxlength="40" value="' + attr(c.phone) + '"></div>' +
      '<div class="form-group"><label for="edit-email">Email</label><input id="edit-email" type="email" maxlength="120" value="' + attr(c.email) + '"></div>' +
      '<div class="form-group"><label for="edit-address">Address</label><textarea id="edit-address">' + escapeHtml(c.address || '') + '</textarea></div>' +
      '<button class="btn" type="submit" id="edit-customer-save">Save changes</button>' +
    '</form>' +
    '<button type="button" class="btn btn-danger" id="delete-customer" onclick="deleteCustomer(' + jsId(c.id) + ')">Delete customer</button>' +
    '</div>' +
    (typeof vehicleSectionHtml === 'function' ? vehicleSectionHtml(c) : '') +
    '<button type="button" class="btn" onclick="newQuoteForCustomer(' + jsId(c.id) + ')">New quote for ' + escapeHtml((c.name || 'customer').split(' ')[0]) + '</button>';
  showView('customer-detail');
}

function readCustomerFields() {
  var idEl = $('#edit-id');
  if (!idEl) return null;
  var c = findCustomer(idEl.value);
  if (!c) return null;
  var name = ($('#edit-name').value || '').trim();
  if (name) c.name = name;
  c.phone = ($('#edit-phone').value || '').trim();
  c.email = ($('#edit-email').value || '').trim();
  c.address = ($('#edit-address').value || '').trim();
  state.quotes.forEach(function (q) { if (q.customerId === c.id) q.customerName = c.name; });
  state.invoices.forEach(function (inv) { if (inv.customerId === c.id) inv.customerName = c.name; });
  return c;
}

function saveCustomerEdits() {
  if (!canSave()) return;
  var c = readCustomerFields();
  if (!c || !($('#edit-name').value || '').trim()) {
    showToast('Name is required.');
    return;
  }
  commitShop('Customer saved in the shop.').then(function (result) {
    if (!result || !result.ok) return;
    showCustomer(c.id);
  });
}

function deleteCustomer(id) {
  var c = findCustomer(id);
  if (!c) return;
  if (!confirm('Remove ' + (c.name || 'this customer') + ' from the shared shop? Saved quotes and invoices keep the name already printed on them.')) return;
  if (!canSave()) return;
  state.customers = state.customers.filter(function (row) { return !sameId(row.id, id); });
  commitShop('Customer removed from the shop.').then(function (result) {
    if (!result || !result.ok) return;
    showView('customers');
  });
}

function editVehicle(customerId, vehicleId) {
  var c = findCustomer(customerId);
  var v = c && (c.vehicles || []).find(function (row) { return sameId(row.id, vehicleId); });
  if (!v) return;
  window.vehicleSaveTarget = 'customer';
  fillVehicleForm(v);
  var specs = document.querySelector('#vehicle-form details');
  if (specs) specs.open = true;
  var year = document.getElementById('veh-year');
  if (year) year.focus();
}

function saveVehicle() {
  if (!canSave()) return;
  var fields = collectVehicleForm();
  if (!fields.year || !fields.make || !fields.model) {
    showToast('Year, make, and model are required. Service specs can stay blank.');
    return;
  }
  if (fields.vin && window.WrgVin && !WrgVin.isValidVin(fields.vin)) {
    showToast('VIN must be 17 characters and cannot use I, O, or Q. Leave it blank if unknown.');
    return;
  }
  var target = window.vehicleSaveTarget || 'customer';
  var customer = target === 'customer' ? readCustomerFields() : findCustomer(currentQuote && currentQuote.customerId);
  if (!customer) {
    showToast('Save the customer before adding a vehicle.');
    return;
  }
  if (!Array.isArray(customer.vehicles)) customer.vehicles = [];
  var existing = fields.id ? customer.vehicles.find(function (row) { return sameId(row.id, fields.id); }) : null;
  if (existing) Object.assign(existing, fields, { id: existing.id, version: existing.version || 0, customerId: customer.id });
  else {
    existing = Object.assign(blankVehicle(), fields, { id: genId(), version: 0, customerId: customer.id });
    customer.vehicles.push(existing);
  }
  if (currentQuote && (target === 'quote' || target === 'guide' || target === 'guide-specs')) {
    currentQuote.customerId = customer.id;
    currentQuote.vehicleId = existing.id;
    snapshotParty(currentQuote);
    if (target === 'guide' || target === 'guide-specs') currentQuote.guideStep = target === 'guide-specs' ? 'review' : 'basics';
  }
  var returnCustomer = customer.id;
  commitShop('Vehicle saved in the shop.').then(function (result) {
    if (!result || !result.ok) return;
    window.vehicleSaveTarget = 'customer';
    if (target === 'customer') showCustomer(returnCustomer);
    else renderQuoteEditor();
  });
}

function deleteVehicle(customerId, vehicleId) {
  var c = findCustomer(customerId);
  if (!c) return;
  if (!confirm('Remove this vehicle from the customer in the shared shop? Older quotes keep the description already saved on them.')) return;
  if (!canSave()) return;
  readCustomerFields();
  c.vehicles = (c.vehicles || []).filter(function (v) { return !sameId(v.id, vehicleId); });
  commitShop('Vehicle removed from the shop.').then(function (result) {
    if (!result || !result.ok) return;
    showCustomer(customerId);
  });
}

function renderQuotes() {
  var el = $('#view-quotes');
  var quotes = state.quotes.slice().sort(byDateDesc);
  el.innerHTML =
    '<button type="button" class="btn" onclick="showView(\'new-quote\')">+ New quote</button>' +
    '<div class="card mt-4">' +
      (quotes.length ? quotes.map(function (q) {
        var t = calcQuoteTotals(q);
        var status = q.status || 'draft';
        return '<div class="list-item" onclick="viewQuote(' + jsId(q.id) + ')">' +
          '<div><strong>Quote #' + escapeHtml(q.number) + '</strong>' +
          '<div class="meta">' + escapeHtml(q.customerName || 'Walk-in') +
          (q.vehicleDesc ? ' · ' + escapeHtml(q.vehicleDesc) : '') +
          ' · ' + escapeHtml(formatDate(q.date)) + '</div></div>' +
          '<div class="text-right"><div>' + formatMoney(t.total) + '</div>' +
          '<span class="badge badge-' + statusClass(status) + '">' + escapeHtml(status) + '</span></div></div>';
      }).join('') : '<p class="text-muted">No quotes yet.</p>') +
    '</div>';
}

function renderInvoices() {
  var el = $('#view-invoices');
  var invoices = state.invoices.slice().sort(byDateDesc);
  el.innerHTML =
    '<div class="card">' +
      (invoices.length ? invoices.map(function (inv) {
        var t = calcQuoteTotals(inv);
        var status = inv.status || 'sent';
        return '<div class="list-item" onclick="viewInvoice(' + jsId(inv.id) + ')">' +
          '<div><strong>Invoice #' + escapeHtml(inv.number) + '</strong>' +
          '<div class="meta">' + escapeHtml(inv.customerName || 'Customer') +
          (inv.vehicleDesc ? ' · ' + escapeHtml(inv.vehicleDesc) : '') +
          ' · ' + escapeHtml(formatDate(inv.date)) + '</div></div>' +
          '<div class="text-right"><div>' + formatMoney(t.total) + '</div>' +
          '<span class="badge badge-' + statusClass(status) + '">' + escapeHtml(status) + '</span></div></div>';
      }).join('') : '<p class="text-muted">No invoices yet. Convert a quote to create one.</p>') +
    '</div>';
}

function showNewQuote(customerId) {
  captureEditorIfOpen();
  customerId = customerId || null;
  editKind = 'quote';
  editIsNew = true;
  currentQuote = {
    id: genId(),
    number: GarageCalc.nextDocumentNumber(state.quotes),
    date: todayISO(),
    status: 'draft',
    items: [],
    taxRate: state.settings.taxRate,
    customerId: customerId,
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    vehicleId: null,
    vehicleDesc: '',
    vehiclePlate: '',
    vehicleVin: '',
    notes: '',
    photos: [],
    workPerformed: '',
    guideStep: customerId ? 'vehicle' : 'customer',
    vehicleTrim: '',
    vehicleOdometer: '',
    vehicleSpecs: {}
  };
  var c = findCustomer(customerId);
  if (c) {
    currentQuote.customerName = c.name || '';
    if ((c.vehicles || []).length === 1) currentQuote.vehicleId = c.vehicles[0].id;
  }
  snapshotParty(currentQuote);
  renderQuoteEditor();
  showView('quote-editor');
}

function newQuoteForCustomer(cid) {
  showNewQuote(cid);
}

function captureEditorIfOpen() {
  var editor = $('#view-quote-editor');
  if (editor && editor.classList.contains('active')) maybeAutosave();
}

function maybeAutosave() {
  if (!currentQuote) return;
  if (editKind === 'invoice' || !editIsNew || quoteIsMeaningful(currentQuote)) persistQuote();
}

function viewQuote(id) {
  captureEditorIfOpen();
  var q = state.quotes.find(function (row) { return sameId(row.id, id); });
  if (!q) return;
  editKind = 'quote';
  editIsNew = false;
  currentQuote = cloneDoc(q);
  if (!Array.isArray(currentQuote.items)) currentQuote.items = [];
  if (!Array.isArray(currentQuote.photos)) currentQuote.photos = [];
  renderQuoteEditor();
  showView('quote-editor');
}

function editInvoice(id) {
  captureEditorIfOpen();
  var inv = state.invoices.find(function (row) { return sameId(row.id, id); });
  if (!inv) return;
  editKind = 'invoice';
  editIsNew = false;
  currentQuote = cloneDoc(inv);
  if (!Array.isArray(currentQuote.items)) currentQuote.items = [];
  if (!Array.isArray(currentQuote.photos)) currentQuote.photos = [];
  renderQuoteEditor();
  showView('quote-editor');
}

function renderQuoteEditor() {
  var q = currentQuote;
  var el = $('#view-quote-editor');
  if (!q || !el) return;
  var customers = state.customers;
  var vehicles = getVehiclesForCustomer(q.customerId);
  if (q.guideStep && q.guideStep !== 'lines' && typeof renderQuoteGuide === 'function') {
    el.innerHTML = renderQuoteGuide(q);
    return;
  }
  var isInvoice = editKind === 'invoice';
  var title = (isInvoice ? 'Invoice #' : 'Quote #') + escapeHtml(q.number);
  var customerOptions = '<option value="">Walk-in / cash</option>' +
    customers.map(function (c) {
      return '<option value="' + attr(c.id) + '"' + (q.customerId === c.id ? ' selected' : '') + '>' + escapeHtml(c.name || 'Customer') + '</option>';
    }).join('');
  if (q.customerId && !customers.some(function (c) { return c.id === q.customerId; })) {
    customerOptions += '<option value="' + attr(q.customerId) + '" selected>' + escapeHtml(q.customerName || 'Saved customer') + '</option>';
  }
  var vehicleOptions = '<option value="">No vehicle</option>' +
    vehicles.map(function (v) {
      return '<option value="' + attr(v.id) + '"' + (q.vehicleId === v.id ? ' selected' : '') + '>' + escapeHtml(vehicleLabel(v)) + '</option>';
    }).join('');
  if (q.vehicleId && !vehicles.some(function (v) { return v.id === q.vehicleId; })) {
    vehicleOptions += '<option value="' + attr(q.vehicleId) + '" selected>' + escapeHtml(q.vehicleDesc || 'Saved vehicle') + '</option>';
  }

  el.innerHTML =
    '<div class="screen-only">' +
      '<div class="toolbar"><button type="button" class="btn-sm btn-secondary" onclick="closeEditor()">← Back</button></div>' +
      '<h2 class="mt-2" id="editor-title">' + title + '</h2>' +
      (q.status === 'converted' && !isInvoice ? '<p class="help">This quote was already converted. You can still edit it or create another invoice.</p>' : '') +
      '<div class="card mt-2">' +
        '<div class="form-group"><label for="q-customer">Customer</label><select id="q-customer" onchange="updateQuoteCustomer()">' + customerOptions + '</select></div>' +
        '<div class="form-group"><label for="q-vehicle">Vehicle</label><select id="q-vehicle" onchange="updateQuoteVehicle()">' + vehicleOptions + '</select></div>' +
        (typeof quoteVehicleActions === 'function' ? quoteVehicleActions() : '') +
        '<div class="field-stack">' +
          '<div class="form-group"><label for="q-date">Date</label><input type="date" id="q-date" value="' + attr(q.date || todayISO()) + '" oninput="currentQuote.date=this.value"></div>' +
          '<div class="form-group"><label for="q-tax">Tax rate (%)</label><input type="number" id="q-tax" step="0.1" value="' + attr(q.taxRate != null ? q.taxRate : state.settings.taxRate) + '" oninput="updateQuoteTax(this.value)"></div>' +
        '</div>' +
        '<div class="form-group"><label for="q-notes">Shop notes (not printed)</label><textarea id="q-notes" oninput="currentQuote.notes=this.value">' + escapeHtml(q.notes || '') + '</textarea></div>' +
      '</div>' +
      '<div class="card"><div class="flex-between"><h3>Line items</h3><button type="button" class="btn-sm" id="add-line" onclick="addLineItem()">+ Add item</button></div>' +
        '<div id="line-items">' + renderLineItems() + '</div>' +
      '</div>' +
      '<div class="card"><h3>Totals and margin</h3><div id="quote-totals" class="totals-box" aria-live="polite"></div>' +
        '<p class="help">Margin is profit divided by the subtotal. Sales tax is passed through and is not counted as profit. Cost stays on this screen and is left off the printed copy.</p>' +
      '</div>' +
      '<div class="card"><div class="flex-between"><h3>Photos</h3>' +
        '<label class="btn-sm">+ Add photo<input id="photo-input" type="file" accept="image/*" capture="environment" style="display:none" onchange="addPhoto(event)"></label></div>' +
        '<div id="photo-list" class="mt-2">' + renderPhotoEditors() + '</div>' +
      '</div>' +
      '<div class="card"><h3>Work performed</h3>' +
        '<textarea id="q-work" placeholder="What was inspected, replaced, or repaired." oninput="onWorkInput(this)">' + escapeHtml(q.workPerformed || '') + '</textarea>' +
        '<p class="help">This statement prints on the quote or invoice.</p>' +
      '</div>' +
      '<button type="button" class="btn" id="save-doc" onclick="saveQuote()">' + (isInvoice ? 'Save invoice' : 'Save quote') + '</button>' +
      '<button type="button" class="btn btn-secondary" id="print-doc" onclick="saveAsPDF()">Print / Save PDF</button>' +
      '<a class="btn btn-secondary" id="email-quote" href="mailto:" onclick="this.href=buildMailtoFromEditor()">Email draft</a>' +
      '<p class="help">Email opens your mail app with a draft and the shop signature. This page does not send mail. Attach a PDF from the print dialog if you want one.</p>' +
      (isInvoice ? '' : '<button type="button" class="btn btn-success" id="convert-invoice" onclick="convertToInvoice()">Convert to invoice</button>') +
      '<button type="button" class="btn btn-danger" id="delete-doc" onclick="deleteCurrentDocument()">Delete ' + (isInvoice ? 'invoice' : 'quote') + '</button>' +
    '</div>' +
    '<div id="quote-print-mount" class="print-only"></div>';
  updateQuoteTotals();
}

function renderLineItems() {
  var items = currentQuote.items || [];
  if (!items.length) return '<p class="text-muted">No items yet. Add labor, parts, or other charges.</p>';
  return items.map(function (item, idx) {
    var line = GarageCalc.calcLine(item, state.settings);
    return '<div class="line-item" data-idx="' + idx + '">' +
      '<div><span class="mini-label">Type</span><select data-line="' + idx + '" data-field="type" onchange="updateLine(' + idx + ', \'type\', this.value)">' +
        option('labor', 'Labor', item.type) + option('part', 'Part', item.type) + option('other', 'Other', item.type) +
      '</select></div>' +
      '<div class="mt-2"><span class="mini-label">Description</span><input data-line="' + idx + '" data-field="description" maxlength="180" placeholder="Description" value="' + attr(item.description || '') + '" oninput="updateLine(' + idx + ', \'description\', this.value)"></div>' +
      '<div class="row mt-2">' +
        '<div><span class="mini-label">' + (item.type === 'labor' ? 'Hours' : 'Qty') + '</span><input data-line="' + idx + '" data-field="qty" type="number" step="0.1" value="' + attr(item.qty != null ? item.qty : 1) + '" oninput="updateLine(' + idx + ', \'qty\', this.value)"></div>' +
        '<div><span class="mini-label">Your cost</span><input data-line="' + idx + '" data-field="unitCost" type="number" step="0.01" value="' + attr(item.unitCost != null ? item.unitCost : '') + '" oninput="updateLine(' + idx + ', \'unitCost\', this.value)"></div>' +
        '<div><span class="mini-label">Price</span><input data-line="' + idx + '" data-field="unitPrice" type="number" step="0.01" value="' + attr(item.unitPrice != null ? item.unitPrice : '') + '" oninput="updateLine(' + idx + ', \'unitPrice\', this.value)"></div>' +
      '</div>' +
      '<div class="line-profit" data-line-profit="' + idx + '">' + escapeHtml(lineSummary(line)) + '</div>' +
      '<div class="actions"><button type="button" class="btn-sm btn-danger" onclick="removeLine(' + idx + ')">Remove</button></div>' +
    '</div>';
  }).join('');
}

function option(value, label, current) {
  return '<option value="' + value + '"' + (current === value ? ' selected' : '') + '>' + label + '</option>';
}

function lineSummary(line) {
  return formatMoney(line.revenue) + ' · cost ' + formatMoney(line.cost) + ' · profit ' + formatMoney(line.profit);
}

function renderPhotoEditors() {
  var photos = currentQuote.photos || [];
  if (!photos.length) return '<p class="text-muted">No photos yet. Add a before or after picture.</p>';
  return photos.map(function (p, i) {
    var src = safeImageSrc(p.signedUrl || p.dataUrl);
    return '<div class="photo-card">' +
      (src ? '<img alt="" src="' + src + '">' : '<p class="text-muted">Photo could not be shown.</p>') +
      '<div class="row mt-2">' +
        '<div><span class="mini-label">Caption</span><input data-photo-caption="' + i + '" maxlength="140" placeholder="Before — worn pads" value="' + attr(p.caption || '') + '" oninput="currentQuote.photos[' + i + '].caption=this.value"></div>' +
        '<div><span class="mini-label">When</span><select data-photo-type="' + i + '" onchange="currentQuote.photos[' + i + '].type=this.value">' +
          '<option value="before"' + (p.type !== 'after' ? ' selected' : '') + '>Before</option>' +
          '<option value="after"' + (p.type === 'after' ? ' selected' : '') + '>After</option>' +
        '</select></div>' +
      '</div>' +
      '<button type="button" class="btn-sm btn-danger mt-2" onclick="removePhoto(' + i + ')">Remove photo</button>' +
    '</div>';
  }).join('');
}

function updateLine(idx, field, value) {
  if (!currentQuote || !currentQuote.items || !currentQuote.items[idx]) return;
  if (field === 'type') {
    syncQuoteForm();
    var item = currentQuote.items[idx];
    item.type = value;
    if (value === 'labor') {
      item.priceManual = false;
      item.unitCost = Number(state.settings.laborCostRate) || 0;
      item.unitPrice = GarageCalc.defaultUnitPrice('labor', item.unitCost, state.settings);
      if (!item.qty) item.qty = 1;
    } else {
      item.priceManual = false;
      item.unitCost = 0;
      item.unitPrice = 0;
    }
    renderQuoteEditor();
    return;
  }
  var row = currentQuote.items[idx];
  if (field === 'qty' || field === 'unitCost' || field === 'unitPrice') {
    var n = parseFloat(value);
    row[field] = Number.isFinite(n) ? n : 0;
  } else {
    row[field] = value;
  }
  if (field === 'unitPrice') row.priceManual = true;
  if (field === 'unitCost' && row.type !== 'labor' && !row.priceManual) {
    row.unitPrice = GarageCalc.repriceFromCost(row, state.settings);
    var priceInput = document.querySelector('[data-line="' + idx + '"][data-field="unitPrice"]');
    if (priceInput) priceInput.value = row.unitPrice.toFixed(2);
  }
  var profitEl = document.querySelector('[data-line-profit="' + idx + '"]');
  if (profitEl) profitEl.textContent = lineSummary(GarageCalc.calcLine(row, state.settings));
  updateQuoteTotals();
}

function addLineItem() {
  syncQuoteForm();
  if (!currentQuote.items) currentQuote.items = [];
  currentQuote.items.push({
    type: 'labor',
    description: '',
    qty: 1,
    unitCost: Number(state.settings.laborCostRate) || 0,
    unitPrice: GarageCalc.defaultUnitPrice('labor', state.settings.laborCostRate, state.settings),
    priceManual: false
  });
  renderQuoteEditor();
}

function removeLine(idx) {
  syncQuoteForm();
  currentQuote.items.splice(idx, 1);
  renderQuoteEditor();
}

function addPhoto(event) {
  var file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file || !currentQuote) return;
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || '')) {
    showToast('Choose a photo.');
    return;
  }
  if ((currentQuote.photos || []).length >= MAX_PHOTOS) {
    showToast('This job already has ' + MAX_PHOTOS + ' photos.');
    return;
  }
  var quoteId = currentQuote.id;
  compressImage(file).then(function (dataUrl) {
    if (!currentQuote || currentQuote.id !== quoteId) return;
    syncQuoteForm();
    if (!currentQuote.photos) currentQuote.photos = [];
    currentQuote.photos.push({ id: genId(), version: 0, dataUrl: dataUrl, caption: '', type: 'before', storagePath: '' });
    renderQuoteEditor();
  }).catch(function () {
    showToast('Could not read that photo. Try a JPEG or PNG.');
  });
}

function compressImage(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = reject;
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var maxEdge = 1280;
        var scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function removePhoto(idx) {
  syncQuoteForm();
  currentQuote.photos.splice(idx, 1);
  renderQuoteEditor();
}

function updateQuoteCustomer() {
  syncQuoteForm();
  var vehicles = getVehiclesForCustomer(currentQuote.customerId);
  if (!vehicles.some(function (v) { return v.id === currentQuote.vehicleId; })) {
    currentQuote.vehicleId = null;
  }
  snapshotParty(currentQuote);
  renderQuoteEditor();
}

function updateQuoteVehicle() {
  syncQuoteForm();
  snapshotParty(currentQuote);
}

function updateQuoteTax(value) {
  var n = parseFloat(value);
  currentQuote.taxRate = Number.isFinite(n) ? n : 0;
  updateQuoteTotals();
}

function onWorkInput(el) {
  currentQuote.workPerformed = el.value;
  refreshMailto();
}

function syncQuoteForm() {
  if (!currentQuote) return;
  var notes = $('#q-notes');
  if (notes) currentQuote.notes = notes.value;
  var work = $('#q-work');
  if (work) currentQuote.workPerformed = work.value;
  var tax = $('#q-tax');
  if (tax) {
    var n = parseFloat(tax.value);
    currentQuote.taxRate = Number.isFinite(n) ? n : 0;
  }
  var date = $('#q-date');
  if (date && date.value) currentQuote.date = date.value;
  var cust = $('#q-customer');
  if (cust) currentQuote.customerId = cust.value || null;
  var veh = $('#q-vehicle');
  if (veh) currentQuote.vehicleId = veh.value || null;
  document.querySelectorAll('.line-item').forEach(function (rowEl) {
    var idx = Number(rowEl.getAttribute('data-idx'));
    var item = currentQuote.items && currentQuote.items[idx];
    if (!item) return;
    var type = rowEl.querySelector('[data-field="type"]');
    var desc = rowEl.querySelector('[data-field="description"]');
    var qty = rowEl.querySelector('[data-field="qty"]');
    var cost = rowEl.querySelector('[data-field="unitCost"]');
    var price = rowEl.querySelector('[data-field="unitPrice"]');
    if (type) item.type = type.value;
    if (desc) item.description = desc.value;
    if (qty) item.qty = parseFloat(qty.value) || 0;
    if (cost) {
      var c = parseFloat(cost.value);
      item.unitCost = Number.isFinite(c) ? c : 0;
    }
    if (price) {
      var p = parseFloat(price.value);
      item.unitPrice = Number.isFinite(p) ? p : 0;
    }
  });
  document.querySelectorAll('[data-photo-caption]').forEach(function (input) {
    var i = Number(input.getAttribute('data-photo-caption'));
    if (currentQuote.photos && currentQuote.photos[i]) currentQuote.photos[i].caption = input.value;
  });
  document.querySelectorAll('[data-photo-type]').forEach(function (sel) {
    var i = Number(sel.getAttribute('data-photo-type'));
    if (currentQuote.photos && currentQuote.photos[i]) {
      currentQuote.photos[i].type = sel.value === 'after' ? 'after' : 'before';
    }
  });
  snapshotParty(currentQuote);
}

function snapshotParty(doc) {
  if (!doc) return;
  var c = findCustomer(doc.customerId);
  if (!doc.customerId) {
    doc.customerName = '';
    doc.customerPhone = '';
    doc.customerEmail = '';
    doc.customerAddress = '';
  } else if (c) {
    doc.customerName = c.name || '';
    doc.customerPhone = c.phone || '';
    doc.customerEmail = c.email || '';
    doc.customerAddress = c.address || '';
  }
  var vehicles = getVehiclesForCustomer(doc.customerId);
  var v = vehicles.find(function (row) { return row.id === doc.vehicleId; });
  if (v) {
    doc.vehicleDesc = vehicleTitle(v) || vehicleLabel(v);
    doc.vehiclePlate = v.plate || '';
    doc.vehicleVin = v.vin || '';
    doc.vehicleTrim = v.trim || '';
    doc.vehicleOdometer = v.odometer || '';
    doc.vehicleSpecs = typeof specsSnapshot === 'function' ? specsSnapshot(v) : {};
  } else if (!doc.vehicleId) {
    doc.vehicleDesc = '';
    doc.vehiclePlate = '';
    doc.vehicleVin = '';
    doc.vehicleTrim = '';
    doc.vehicleOdometer = '';
    doc.vehicleSpecs = {};
  }
}

function updateQuoteTotals() {
  var el = $('#quote-totals');
  if (!el || !currentQuote) return;
  var t = calcQuoteTotals(currentQuote);
  var marginClass = t.margin > 30 ? 'text-success' : (t.margin >= 0 ? 'text-warning' : 'text-danger');
  el.innerHTML =
    '<div class="flex-between"><span>Subtotal</span><strong data-field="subtotal">' + formatMoney(t.subtotal) + '</strong></div>' +
    '<div class="flex-between"><span>Tax (' + escapeHtml(String(t.taxRate)) + '%)</span><strong data-field="tax">' + formatMoney(t.tax) + '</strong></div>' +
    '<div class="flex-between grand"><span>Total</span><strong data-field="total">' + formatMoney(t.total) + '</strong></div>' +
    '<div class="flex-between text-muted"><span>Your cost</span><span data-field="cost">' + formatMoney(t.cost) + '</span></div>' +
    '<div class="flex-between ' + marginClass + '"><span>Margin</span><strong><span data-field="margin">' + t.margin.toFixed(1) + '%</span> (<span data-field="profit">' + formatMoney(t.profit) + '</span>)</strong></div>';
  refreshMailto();
  var mount = $('#quote-print-mount');
  if (mount) mount.innerHTML = buildDocumentHtml(currentQuote, editKind === 'invoice' ? 'invoice' : 'quote');
}

function refreshMailto() {
  var link = $('#email-quote');
  if (link && currentQuote) link.href = mailtoHref(currentQuote, editKind === 'invoice' ? 'invoice' : 'quote');
}

function buildMailtoFromEditor() {
  syncQuoteForm();
  updateQuoteTotals();
  return mailtoHref(currentQuote, editKind === 'invoice' ? 'invoice' : 'quote');
}

function persistQuote() {
  if (!currentQuote) return Promise.resolve({ ok: false });
  if (!canSave()) return Promise.resolve({ ok: false });
  syncQuoteForm();
  var list = editKind === 'invoice' ? state.invoices : state.quotes;
  var idx = list.findIndex(function (row) { return sameId(row.id, currentQuote.id); });
  if (idx >= 0) list[idx] = currentQuote;
  else list.push(currentQuote);
  editIsNew = false;
  return commitShop(null);
}

function saveQuote() {
  persistQuote().then(function (result) {
    if (!result || !result.ok) return;
    showToast((editKind === 'invoice' ? 'Invoice' : 'Quote') + ' saved in the shop.');
    showView(editKind === 'invoice' ? 'invoices' : 'quotes');
  });
}

function closeEditor() {
  showView(editKind === 'invoice' ? 'invoices' : 'quotes');
}

function deleteCurrentDocument() {
  if (!currentQuote) return;
  var kind = editKind;
  var id = currentQuote.id;
  var label = kind === 'invoice' ? 'invoice' : 'quote';
  if (!confirm('Delete this ' + label + ' from the shared shop?')) return;
  if (!canSave()) return;
  if (kind === 'invoice') state.invoices = state.invoices.filter(function (row) { return !sameId(row.id, id); });
  else state.quotes = state.quotes.filter(function (row) { return !sameId(row.id, id); });
  currentQuote = null;
  editIsNew = true;
  commitShop('Deleted from the shop.').then(function (result) {
    if (!result || !result.ok) return;
    showView(kind === 'invoice' ? 'invoices' : 'quotes');
  });
}

function convertToInvoice() {
  if (!currentQuote || editKind === 'invoice') return;
  syncQuoteForm();
  if (currentQuote.status === 'converted') {
    if (!confirm('This quote was already converted. Create another invoice?')) return;
  }
  if (!canSave()) return;
  syncQuoteForm();
  var list = state.quotes;
  var idx = list.findIndex(function (row) { return sameId(row.id, currentQuote.id); });
  if (idx >= 0) list[idx] = currentQuote;
  else list.push(currentQuote);
  editIsNew = false;
  var inv = cloneDoc(currentQuote);
  inv.id = genId();
  inv.version = 0;
  inv.guideStep = 'lines';
  inv.number = GarageCalc.nextDocumentNumber(state.invoices);
  inv.status = 'sent';
  inv.quoteId = currentQuote.id;
  delete inv.paidDate;
  state.invoices.push(inv);
  currentQuote.status = 'converted';
  var saved = state.quotes.find(function (q) { return sameId(q.id, currentQuote.id); });
  if (saved) saved.status = 'converted';
  var invoiceId = inv.id;
  commitShop('Invoice created in the shop.').then(function (result) {
    if (!result || !result.ok) return;
    viewInvoice(invoiceId);
  });
}

function viewInvoice(id) {
  var inv = state.invoices.find(function (row) { return sameId(row.id, id); });
  if (!inv) return;
  var t = calcQuoteTotals(inv);
  var status = inv.status || 'sent';
  var el = $('#view-invoice');
  el.innerHTML =
    '<div class="no-print toolbar">' +
      '<button type="button" class="btn-sm btn-secondary" onclick="showView(\'invoices\')">← Back</button>' +
      '<button type="button" class="btn-sm" id="edit-invoice" onclick="editInvoice(' + jsId(inv.id) + ')">Edit</button>' +
      '<button type="button" class="btn-sm" id="print-invoice" onclick="saveAsPDF()">Print / Save PDF</button>' +
      '<a class="btn-sm btn-secondary" id="email-invoice" href="' + attr(mailtoHref(inv, 'invoice')) + '" onclick="this.href=mailtoForInvoice(' + jsId(inv.id) + ')">Email</a>' +
      '<button type="button" class="btn-sm btn-success" id="mark-paid" onclick="togglePaid(' + jsId(inv.id) + ')">' + (status === 'paid' ? 'Mark unpaid' : 'Mark paid') + '</button>' +
      '<button type="button" class="btn-sm btn-danger" id="delete-invoice" onclick="deleteInvoice(' + jsId(inv.id) + ')">Delete</button>' +
    '</div>' +
    '<p class="help no-print">Print opens the browser dialog. Choose Save as PDF there. Email opens a draft in your mail app and does not send by itself.</p>' +
    '<div class="mt-2">' + buildDocumentHtml(inv, 'invoice') + '</div>' +
    '<div class="internal no-print"><strong>Not printed.</strong> Cost <span id="inv-cost">' + formatMoney(t.cost) + '</span>' +
      ' · Profit <span id="inv-profit">' + formatMoney(t.profit) + '</span>' +
      ' · Margin <span id="inv-margin">' + t.margin.toFixed(1) + '%</span></div>';
  showView('invoice');
}

function buildDocumentHtml(doc, kind) {
  var s = state.settings;
  var t = calcQuoteTotals(doc);
  var label = kind === 'invoice' ? 'INVOICE' : 'QUOTE';
  var address = s.address ? textBreaks(s.address) + '<br>' : '';
  var contact = escapeHtml([s.phone, s.email || DEFAULT_EMAIL].filter(Boolean).join(' · '));
  var billAddress = doc.customerAddress ? '<div>' + textBreaks(doc.customerAddress) + '</div>' : '';
  var billContact = [doc.customerPhone, doc.customerEmail].filter(Boolean).join(' · ');
  var vehicleBits = [doc.vehicleDesc, doc.vehiclePlate, doc.vehicleVin ? 'VIN ' + doc.vehicleVin : '', doc.vehicleOdometer ? 'Odo ' + doc.vehicleOdometer : ''].filter(Boolean);
  var rows = (doc.items || []).map(function (item) {
    var qty = item.qty != null ? item.qty : 1;
    var amount = GarageCalc.roundMoney((Number(qty) || 0) * (Number(item.unitPrice) || 0));
    var typeLabel = item.type === 'part' ? 'Part' : (item.type === 'other' ? 'Other' : 'Labor');
    return '<tr><td>' + escapeHtml(typeLabel) + '</td><td>' + escapeHtml(item.description || typeLabel) + '</td>' +
      '<td class="num">' + escapeHtml(formatQty(qty)) + '</td>' +
      '<td class="num">' + formatMoney(item.unitPrice) + '</td>' +
      '<td class="num">' + formatMoney(amount) + '</td></tr>';
  }).join('');
  var photos = (doc.photos || []).map(function (p) {
    var src = safeImageSrc(p.signedUrl || p.dataUrl);
    if (!src && !(p.caption || p.storagePath)) return '';
    var when = p.type === 'after' ? 'After' : 'Before';
    var caption = (p.caption || '').trim();
    var line = caption || when;
    if (caption && caption.toLowerCase().indexOf(when.toLowerCase()) !== 0) line = when + ' — ' + caption;
    return '<figure class="doc-photo">' + (src ? '<img src="' + src + '" alt="' + attr(line) + '">' : '') +
      '<figcaption>' + escapeHtml(line) + '</figcaption></figure>';
  }).join('');
  return '<article class="doc">' +
    '<header class="doc-head"><div class="doc-brand"><img src="icon-192.png" alt="">' +
      '<div><h2>' + escapeHtml(s.businessName || BUSINESS_NAME) + '</h2><p>' + address + contact + '</p></div></div>' +
      '<div class="doc-id"><div class="doc-type">' + label + '</div><div class="doc-number">#' + escapeHtml(doc.number || '') + '</div>' +
      '<div class="doc-date">' + escapeHtml(formatDate(doc.date)) + '</div></div></header>' +
    '<section class="doc-bill"><h3>Bill to</h3><p><strong>' + escapeHtml(doc.customerName || 'Customer') + '</strong></p>' +
      billAddress + (billContact ? '<p>' + escapeHtml(billContact) + '</p>' : '') +
      (vehicleBits.length ? '<p>Vehicle: ' + escapeHtml(vehicleBits.join(' · ')) + '</p>' : '') +
    '</section>' +
    '<table class="doc-table"><thead><tr><th>Type</th><th>Description</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5">No line items</td></tr>') +
    '</tbody></table>' +
    '<div class="doc-totals"><div><span>Subtotal</span><span data-doc="subtotal">' + formatMoney(t.subtotal) + '</span></div>' +
      '<div><span>Tax (' + escapeHtml(String(t.taxRate)) + '%)</span><span data-doc="tax">' + formatMoney(t.tax) + '</span></div>' +
      '<div class="doc-grand"><span>Total</span><span data-doc="total">' + formatMoney(t.total) + '</span></div></div>' +
    (typeof serviceSpecsHtml === 'function' ? serviceSpecsHtml(doc.vehicleSpecs) : '') +
    (doc.workPerformed ? '<section class="doc-section doc-work"><h3>Work performed</h3><p>' + textBreaks(doc.workPerformed) + '</p></section>' : '') +
    (photos ? '<section class="doc-section"><h3>Photos</h3><div class="doc-photos">' + photos + '</div></section>' : '') +
    '<footer class="doc-terms doc-section">' + textBreaks(s.terms || '') + '</footer>' +
  '</article>';
}

function saveAsPDF() {
  var invoiceView = $('#view-invoice');
  if (!(invoiceView && invoiceView.classList.contains('active')) && currentQuote) {
    syncQuoteForm();
    var mount = $('#quote-print-mount');
    if (mount) mount.innerHTML = buildDocumentHtml(currentQuote, editKind === 'invoice' ? 'invoice' : 'quote');
  }
  window.print();
}

function mailtoHref(doc, kind) {
  var s = state.settings;
  var t = calcQuoteTotals(doc);
  var first = String(doc.customerName || '').trim().split(/\s+/)[0];
  var label = kind === 'invoice' ? 'Invoice' : 'Quote';
  var lines = [
    'Hi' + (first ? ' ' + first : '') + ',',
    '',
    'Please review ' + label.toLowerCase() + ' #' + (doc.number || '') + '.',
    'Total: ' + formatMoney(t.total)
  ];
  var work = String(doc.workPerformed || '').trim();
  if (work) lines.push('', 'Work performed:', work.slice(0, 600));
  lines.push('', 'Thank you,', s.ownerName || 'Will Ruby', s.businessName || BUSINESS_NAME);
  if (s.phone) lines.push(s.phone);
  lines.push(s.email || DEFAULT_EMAIL);
  var to = String(doc.customerEmail || '').trim();
  var toSafe = /^[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+$/.test(to) ? to : '';
  return 'mailto:' + toSafe + '?subject=' + encodeURIComponent(label + ' #' + (doc.number || '') + ' from ' + (s.businessName || BUSINESS_NAME)) +
    '&body=' + encodeURIComponent(lines.join('\n'));
}

function mailtoForInvoice(id) {
  var inv = state.invoices.find(function (row) { return sameId(row.id, id); });
  return inv ? mailtoHref(inv, 'invoice') : 'mailto:';
}

function togglePaid(id) {
  var inv = state.invoices.find(function (row) { return sameId(row.id, id); });
  if (!inv) return;
  if (!canSave()) return;
  if (inv.status === 'paid') {
    inv.status = 'sent';
    delete inv.paidDate;
  } else {
    inv.status = 'paid';
    inv.paidDate = todayISO();
  }
  commitShop(inv.status === 'paid' ? 'Marked paid in the shop.' : 'Marked unpaid in the shop.').then(function (result) {
    if (!result || !result.ok) return;
    viewInvoice(id);
  });
}

function deleteInvoice(id) {
  if (!confirm('Delete this invoice from the shared shop?')) return;
  if (!canSave()) return;
  state.invoices = state.invoices.filter(function (row) { return !sameId(row.id, id); });
  if (currentQuote && sameId(currentQuote.id, id) && editKind === 'invoice') currentQuote = null;
  commitShop('Invoice deleted from the shop.').then(function (result) {
    if (!result || !result.ok) return;
    showView('invoices');
  });
}

function renderTime() {
  var el = $('#view-time');
  var entries = state.timeEntries.slice().sort(byDateDesc);
  var jobs = [];
  state.quotes.forEach(function (q) { jobs.push({ number: q.number, label: 'Quote #' + q.number + (q.customerName ? ' · ' + q.customerName : '') }); });
  state.invoices.forEach(function (inv) { jobs.push({ number: inv.number, label: 'Invoice #' + inv.number + (inv.customerName ? ' · ' + inv.customerName : '') }); });
  el.innerHTML =
    '<div class="card"><h3>Log time</h3>' +
    '<form onsubmit="event.preventDefault(); saveTime();">' +
      '<input type="hidden" id="time-id" value="">' +
      '<div class="row">' +
        '<div class="form-group"><label for="time-date">Date</label><input type="date" id="time-date" value="' + todayISO() + '"></div>' +
        '<div class="form-group"><label for="time-hours">Hours</label><input type="number" id="time-hours" min="0" step="0.1" required></div>' +
      '</div>' +
      '<div class="form-group"><label for="time-desc">Description</label><input id="time-desc" maxlength="160" placeholder="Labor"></div>' +
      '<div class="form-group"><label for="time-job">Job</label><select id="time-job"><option value="">Unassigned</option>' +
        jobs.map(function (job) {
          return '<option value="' + attr(job.number) + '">' + escapeHtml(job.label) + '</option>';
        }).join('') +
      '</select></div>' +
      '<button class="btn" type="submit" id="time-save">Save time</button>' +
    '</form></div>' +
    '<div class="card"><h3>Entries</h3>' +
      (entries.length ? entries.map(function (e) {
        var rate = e.rate != null ? e.rate : (state.settings.laborRate || 0);
        return '<div class="list-item">' +
          '<div><strong>' + escapeHtml(formatQty(e.hours)) + ' hrs</strong> — ' + escapeHtml(e.description || 'Labor') +
          '<div class="meta">' + escapeHtml(e.jobNumber ? 'Job ' + e.jobNumber : 'Unassigned') + ' · ' + escapeHtml(formatDate(e.date)) + '</div></div>' +
          '<div class="row-actions"><div>' + formatMoney((Number(e.hours) || 0) * rate) + '</div>' +
            '<button type="button" class="btn-sm btn-secondary" onclick="editTime(' + jsId(e.id) + ')">Edit</button>' +
            '<button type="button" class="btn-sm btn-danger" onclick="deleteTime(' + jsId(e.id) + ')">Delete</button></div></div>';
      }).join('') : '<p class="text-muted">No time entries yet.</p>') +
    '</div>';
}

function saveTime() {
  var hours = parseFloat($('#time-hours').value);
  if (!Number.isFinite(hours) || hours <= 0) {
    showToast('Enter hours greater than zero.');
    return;
  }
  if (!canSave()) return;
  var id = $('#time-id').value;
  var entry = {
    date: $('#time-date').value || todayISO(),
    hours: hours,
    description: ($('#time-desc').value || '').trim() || 'Labor',
    jobNumber: $('#time-job').value || '',
    rate: Number(state.settings.laborRate) || 0
  };
  if (id) {
    var existing = state.timeEntries.find(function (row) { return sameId(row.id, id); });
    if (existing) {
      entry.id = existing.id;
      entry.version = existing.version || 0;
      if (existing.rate != null) entry.rate = existing.rate;
      Object.assign(existing, entry);
    }
  } else {
    entry.id = genId();
    entry.version = 0;
    state.timeEntries.push(entry);
  }
  commitShop('Time saved in the shop.').then(function (result) {
    if (!result || !result.ok) return;
    renderTime();
  });
}

function editTime(id) {
  var e = state.timeEntries.find(function (row) { return sameId(row.id, id); });
  if (!e) return;
  $('#time-id').value = e.id;
  $('#time-date').value = e.date || todayISO();
  $('#time-hours').value = e.hours;
  $('#time-desc').value = e.description || '';
  if (e.jobNumber && !$('#time-job').querySelector('option[value="' + attr(e.jobNumber) + '"]')) {
    var opt = document.createElement('option');
    opt.value = e.jobNumber;
    opt.textContent = 'Job ' + e.jobNumber;
    $('#time-job').appendChild(opt);
  }
  $('#time-job').value = e.jobNumber || '';
  $('#time-save').textContent = 'Save time entry';
  window.scrollTo(0, 0);
}

function deleteTime(id) {
  if (!confirm('Delete this time entry from the shared shop?')) return;
  if (!canSave()) return;
  state.timeEntries = state.timeEntries.filter(function (row) { return !sameId(row.id, id); });
  commitShop('Time entry removed.').then(function (result) {
    if (!result || !result.ok) return;
    renderTime();
  });
}

function renderSettings() {
  var s = state.settings;
  var el = $('#view-settings');
  var kb = 0;
  try { kb = storageKb(); } catch (err) { kb = 0; }
  el.innerHTML =
    '<div class="notice" id="storage-notice"><strong>Shared shop cloud</strong>' +
      'Customers, vehicles, quotes, invoices, photos, and these settings sync for everyone who signs in with the shop PIN. ' +
      'There is no separate admin role. The PIN is only the shared sign-in, not a private permission. ' +
      'Photos go to the private wrg-photos bucket. This page is not synced until the shop cloud is configured.' +
    '</div>' +
    '<div class="notice"><strong>Defaults</strong>' +
      'The hourly rate is used for new labor lines only: hours times that rate. Markup applies to parts and other charges, never labor, and only until someone types a different price. ' +
      'Changing these defaults does not rewrite prices already saved on a quote or invoice.' +
    '</div>' +
    '<div class="card"><h3>Business info</h3>' +
      '<div class="form-group"><label for="set-name">Business name</label><input id="set-name" value="' + attr(s.businessName || '') + '"></div>' +
      '<div class="form-group"><label for="set-owner">Your name</label><input id="set-owner" value="' + attr(s.ownerName || '') + '"></div>' +
      '<div class="form-group"><label for="set-address">Address</label><textarea id="set-address">' + escapeHtml(s.address || '') + '</textarea></div>' +
      '<div class="form-group"><label for="set-phone">Phone</label><input id="set-phone" value="' + attr(s.phone || '') + '"></div>' +
      '<div class="form-group"><label for="set-email">Email</label><input id="set-email" type="email" value="' + attr(s.email || DEFAULT_EMAIL) + '"></div>' +
    '</div>' +
    '<div class="card"><h3>Rates</h3>' +
      '<div class="row">' +
        '<div class="form-group"><label for="set-labor">Hourly labor rate</label><input type="number" step="0.01" id="set-labor" value="' + attr(s.laborRate) + '"></div>' +
        '<div class="form-group"><label for="set-cost">Labor cost rate</label><input type="number" step="0.01" id="set-cost" value="' + attr(s.laborCostRate) + '"></div>' +
      '</div>' +
      '<div class="field-stack">' +
        '<div class="form-group"><label for="set-tax">Tax rate (%)</label><input type="number" step="0.1" id="set-tax" value="' + attr(s.taxRate) + '"></div>' +
        '<div class="form-group"><label for="set-markup">Markup for parts and other charges (%)</label><input type="number" step="0.1" id="set-markup" value="' + attr(s.partsMarkup) + '"></div>' +
      '</div>' +
      '<div class="form-group"><label for="set-terms">Invoice terms</label><textarea id="set-terms">' + escapeHtml(s.terms || '') + '</textarea></div>' +
      '<button type="button" class="btn" id="save-settings" onclick="saveSettings()">Save settings</button>' +
    '</div>' +
    '<div class="card"><h3>This phone’s old copy</h3>' +
      '<p class="help">If this browser still has the earlier device-only records, you can copy them into the shop. Matching customers and job numbers are skipped. Nothing already in the shop is deleted.</p>' +
      '<button type="button" class="btn" id="import-device" onclick="importDeviceRecords()">Copy this device into the shop</button>' +
      '<p class="help">A JSON file is a private copy, not the live shop. Restoring one adds records that are not already there.</p>' +
      '<button type="button" class="btn btn-secondary" id="export-btn" onclick="exportData()">Download JSON copy</button>' +
      '<button type="button" class="btn btn-secondary" id="import-btn" onclick="importData()">Add records from a JSON file</button>' +
      '<input type="file" id="import-file" accept="application/json,.json" style="display:none" onchange="handleImport(event)">' +
    '</div>' +
    '<div class="card"><h3>Install on iPhone</h3>' +
      '<p class="help">In Safari, tap Share, then Add to Home Screen. After one online visit the shell can open offline in read-only mode. Saving still needs a connection.</p>' +
      '<button type="button" class="btn btn-secondary" id="lock-btn" onclick="lockApp()">Lock session</button>' +
    '</div>';
}

function readNumber(id, fallback) {
  var el = document.getElementById(id);
  var n = el ? parseFloat(el.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function saveSettings() {
  if (!canSave()) return;
  state.settings.businessName = ($('#set-name').value || '').trim() || BUSINESS_NAME;
  state.settings.ownerName = ($('#set-owner').value || '').trim();
  state.settings.address = $('#set-address').value || '';
  state.settings.phone = ($('#set-phone').value || '').trim();
  state.settings.email = ($('#set-email').value || '').trim() || DEFAULT_EMAIL;
  state.settings.laborRate = readNumber('set-labor', 120);
  state.settings.laborCostRate = readNumber('set-cost', 40);
  state.settings.taxRate = readNumber('set-tax', 6);
  state.settings.partsMarkup = readNumber('set-markup', 40);
  state.settings.terms = $('#set-terms').value || '';
  commitShop('Shop defaults saved. Saved quotes and invoices keep their prices.').then(function (result) {
    if (!result || !result.ok) return;
    refreshBrand();
    renderSettings();
  });
}

function exportData() {
  var data = {
    app: 'will-rubys-garage',
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    customers: state.customers,
    quotes: state.quotes,
    invoices: state.invoices,
    timeEntries: state.timeEntries,
    nextId: state.nextId
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  var url = URL.createObjectURL(blob);
  a.href = url;
  a.download = 'will-rubys-garage-backup-' + todayISO() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}

function importData() {
  var input = $('#import-file');
  if (input) input.click();
}

function handleImport(e) {
  var file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var data = JSON.parse(reader.result);
      if (!data || data.app !== 'will-rubys-garage') throw new Error('bad');
      if (!confirm('Add records from this file into the shared shop? Existing shop records stay. Matching names and job numbers are skipped, not overwritten.')) return;
      applyImportPlan(WrgSync.planDeviceImport(data, state));
    } catch (err) {
      showToast('That file is not a Will Ruby’s Garage backup.');
    }
  };
  reader.readAsText(file);
}

function importDeviceRecords() {
  var raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (err) { raw = null; }
  if (!raw || !Array.isArray(raw.customers)) {
    showToast('This browser does not have an older device copy to copy.');
    return;
  }
  if (!confirm('Copy this device’s old records into the shared shop? Records already in the shop are kept. Matching customers and job numbers are skipped.')) return;
  applyImportPlan(WrgSync.planDeviceImport(raw, state), function () {
    if (confirm('The shop now has the records that were not already there. Remove the old copy from this browser?')) {
      localStorage.removeItem(STORAGE_KEY);
    }
  });
}

function applyImportPlan(plan, done) {
  if (!canSave()) return;
  var idMap = Object.assign({}, plan.customerMap || {});
  (plan.customers || []).forEach(function (source) {
    var id = genId();
    idMap[String(source.id)] = id;
    var vehicles = (source.vehicles || []).map(function (vehicle) {
      return Object.assign(blankVehicle(), vehicle, { id: genId(), version: 0, customerId: id });
    });
    state.customers.push({
      id: id,
      version: 0,
      legacyId: source.id,
      name: source.name || '',
      phone: source.phone || '',
      email: source.email || '',
      address: source.address || '',
      vehicles: vehicles
    });
  });
  (plan.vehicles || []).forEach(function (entry) {
    var customer = findCustomer(entry.customerId);
    if (!customer) return;
    if (!customer.vehicles) customer.vehicles = [];
    customer.vehicles.push(Object.assign(blankVehicle(), entry.source, { id: genId(), version: 0, customerId: customer.id }));
  });
  function addDocs(list, target) {
    (list || []).forEach(function (source) {
      var copy = cloneDoc(source);
      copy.id = genId();
      copy.version = 0;
      copy.legacyId = source.id;
      if (copy.customerId && idMap[String(copy.customerId)]) copy.customerId = idMap[String(copy.customerId)];
      (copy.photos || []).forEach(function (photo) {
        photo.id = genId();
        photo.version = 0;
        photo.storagePath = '';
      });
      target.push(copy);
    });
  }
  addDocs(plan.quotes, state.quotes);
  addDocs(plan.invoices, state.invoices);
  (plan.timeEntries || []).forEach(function (source) {
    state.timeEntries.push({
      id: genId(),
      version: 0,
      date: source.date,
      hours: source.hours,
      description: source.description || 'Labor',
      jobNumber: source.jobNumber || '',
      rate: source.rate
    });
  });
  commitShop('Added the records that were not already in the shop.').then(function (result) {
    if (!result || !result.ok) return;
    if (done) done();
    showView('dashboard');
  });
}

function lockApp() {
  var finish = function () { location.reload(); };
  if (window.WrgCloud && WrgCloud.signOut) WrgCloud.signOut().then(finish, finish);
  else finish();
}

var pinEntered = '';

function showPinScreen() {
  if ($('#pin-overlay')) return;
  var overlay = document.createElement('div');
  overlay.id = 'pin-overlay';
  overlay.className = 'pin-overlay';
  overlay.innerHTML =
    '<div class="pin-card">' +
      '<img src="icon-192.png" alt="Will Ruby’s Garage">' +
      '<h2>Will Ruby’s Garage</h2>' +
      '<p class="text-muted">Enter the shared shop PIN for this session</p>' +
      '<div id="pin-display" class="pin-dots">••••</div>' +
      '<div class="pin-grid">' +
        [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(function (n) {
          if (n === '') return '<div></div>';
          var label = n === '⌫' ? 'Delete' : String(n);
          return '<button type="button" class="pin-btn" data-key="' + n + '" aria-label="' + label + '">' + n + '</button>';
        }).join('') +
      '</div>' +
      '<p id="pin-error" class="pin-error"></p>' +
    '</div>';
  document.body.appendChild(overlay);
  pinEntered = '';
  overlay.querySelectorAll('.pin-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { pressPin(btn.getAttribute('data-key')); });
  });
}

function pressPin(key) {
  var display = $('#pin-display');
  var error = $('#pin-error');
  if (!display) return;
  if (key === '⌫') pinEntered = pinEntered.slice(0, -1);
  else if (pinEntered.length < 4) pinEntered += key;
  display.textContent = pinEntered.length ? '•'.repeat(pinEntered.length) : '••••';
  if (pinEntered.length !== 4) return;
  var pin = pinEntered;
  pinEntered = '';
  if (error) error.textContent = 'Checking the shop…';
  WrgCloud.signIn(pin).then(function (result) {
    pin = '';
    if (!result || !result.ok) {
      if (error) error.textContent = (result && result.message) || 'Incorrect PIN';
      var again = $('#pin-display');
      if (again) again.textContent = '••••';
      return;
    }
    var overlay = $('#pin-overlay');
    if (overlay) overlay.remove();
    initApp();
  });
}

function onPinKeydown(e) {
  if (!$('#pin-overlay')) return;
  if (/^[0-9]$/.test(e.key)) pressPin(e.key);
  else if (e.key === 'Backspace') pressPin('⌫');
}

var appStarted = false;

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  var opts = { scope: './', updateViaCache: 'none' };
  navigator.serviceWorker.register('./sw.js', opts).catch(function () {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  });
}

function setSyncStatus(shopStatus) {
  var el = document.getElementById('sync-status');
  if (!el) return;
  shopStatus = shopStatus || (window.WrgCloud ? WrgCloud.status() : {});
  el.classList.remove('sync-ok', 'sync-warn', 'sync-bad');
  if (!shopStatus.configured) {
    el.textContent = 'Setup needed';
    el.classList.add('sync-bad');
  } else if (shopStatus.loading) {
    el.textContent = 'Loading shop…';
    el.classList.add('sync-warn');
  } else if (!shopStatus.online || shopStatus.readOnly) {
    el.textContent = 'Offline — read only';
    el.classList.add('sync-warn');
  } else if (shopStatus.signedIn && shopStatus.member) {
    el.textContent = 'Synced';
    el.classList.add('sync-ok');
  } else {
    el.textContent = 'Sign in needed';
    el.classList.add('sync-warn');
  }
}

function showSetupScreen() {
  if ($('#setup-overlay')) return;
  var overlay = document.createElement('div');
  overlay.id = 'setup-overlay';
  overlay.className = 'pin-overlay';
  overlay.innerHTML = '<div class="pin-card" style="text-align:left"><img src="icon-192.png" alt="">' +
    '<h2>Shop cloud is not configured</h2>' +
    '<p class="help">This phone is not syncing. Add the public Supabase anon key to wrg-config.js, run wrg-setup.sql in the garage project, and create the shared shop sign-in. Do not put a service-role key in the app. Records stay unavailable until that setup is finished.</p></div>';
  document.body.appendChild(overlay);
  setSyncStatus({ configured: false });
}

function showConflictBanner(conflicts) {
  var el = document.getElementById('conflict-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'conflict-banner';
    el.className = 'conflict-banner';
    document.getElementById('app').insertBefore(el, document.querySelector('.view'));
  }
  el.hidden = false;
  var first = conflicts[0] || {};
  el.innerHTML = '<strong>Another phone saved first.</strong> ' + escapeHtml(first.message || 'Your edit was not written over that record.') +
    ' <button type="button" class="btn-sm" id="load-theirs" onclick="loadTheirVersion()">Load their version</button>';
}

function loadTheirVersion() {
  currentQuote = null;
  var editor = document.getElementById('view-quote-editor');
  if (editor) editor.classList.remove('active');
  WrgCloud.load().then(function () {
    var banner = document.getElementById('conflict-banner');
    if (banner) banner.hidden = true;
    showView('dashboard');
  });
}

function adoptShopState(next, conflicts) {
  var editor = document.getElementById('view-quote-editor');
  var editorOpen = editor && editor.classList.contains('active') && currentQuote;
  if (editorOpen) syncQuoteForm();
  var keep = editorOpen ? cloneDoc(currentQuote) : null;
  state.settings = next.settings || state.settings;
  state.customers = next.customers || [];
  state.quotes = next.quotes || [];
  state.invoices = next.invoices || [];
  state.timeEntries = next.timeEntries || [];
  if (keep) {
    var list = editKind === 'invoice' ? state.invoices : state.quotes;
    var incoming = list.find(function (row) { return sameId(row.id, keep.id); });
    if (incoming && WrgSync.documentFingerprint(keep) === WrgSync.documentFingerprint(incoming)) {
      var step = keep.guideStep;
      keep = cloneDoc(incoming);
      if (step) keep.guideStep = step;
    } else if (incoming && (incoming.version || 0) !== (keep.version || 0)) {
      showConflictBanner([{ id: keep.id, message: 'Another phone saved this job. Your edit was not written over it.' }]);
    }
    currentQuote = keep;
    var idx = list.findIndex(function (row) { return sameId(row.id, keep.id); });
    if (idx >= 0) list[idx] = keep;
    else list.push(keep);
  }
  refreshBrand();
  if (conflicts && conflicts.length) showConflictBanner(conflicts);
  if (!editorOpen) {
    var active = document.querySelector('.view.active');
    var name = active ? active.id.replace('view-', '') : 'dashboard';
    if (name !== 'quote-editor' && name !== 'customer-detail' && name !== 'invoice') {
      var renderers = { dashboard: renderDashboard, customers: renderCustomers, quotes: renderQuotes, invoices: renderInvoices, time: renderTime, settings: renderSettings };
      if (renderers[name]) renderers[name]();
    }
  }
  setSyncStatus(WrgCloud.status());
}

function shopDirtyIds() {
  var shadow = WrgCloud.shadow && WrgCloud.shadow();
  if (!shadow) return [];
  var editor = document.getElementById('view-quote-editor');
  if (editor && editor.classList.contains('active')) syncQuoteForm();
  return WrgSync.planPersist(state, shadow).map(function (op) {
    return String(op.id || (op.row && op.row.id) || '');
  }).filter(Boolean);
}

function shopState() { return state; }

function initApp() {
  if (appStarted) return;
  appStarted = true;
  $all('.nav-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { showView(btn.getAttribute('data-view')); });
  });
  setSyncStatus({ configured: true, loading: true, signedIn: true, member: true, online: true });
  var pending = WrgCloud.load ? WrgCloud.load() : Promise.resolve();
  Promise.resolve(pending).then(function () {
    refreshBrand();
    setSyncStatus(WrgCloud.status());
    showView('dashboard');
  }).catch(function (err) {
    showToast(err && err.message ? err.message : 'The shop records could not be loaded.');
    setSyncStatus(WrgCloud.status());
  });
}

function init() {
  document.addEventListener('keydown', onPinKeydown);
  registerServiceWorker();
  window.adoptShopState = adoptShopState;
  window.shopDirtyIds = shopDirtyIds;
  window.shopState = shopState;
  window.setSyncStatus = setSyncStatus;
  if (!window.WrgCloud || !WrgCloud.isConfigured()) {
    showSetupScreen();
    return;
  }
  WrgCloud.restoreSession().then(function (session) {
    if (session && session.ok) initApp();
    else showPinScreen();
  }).catch(function () { showPinScreen(); });
}

document.addEventListener('DOMContentLoaded', init);
