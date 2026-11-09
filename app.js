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

function genId() {
  var id = state.nextId++;
  return id;
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

function saveData() {
  try {
    var payload = {
      app: 'will-rubys-garage',
      settings: state.settings,
      customers: state.customers,
      quotes: state.quotes,
      invoices: state.invoices,
      timeEntries: state.timeEntries,
      nextId: state.nextId
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    showToast('This browser could not store that. Try fewer or smaller photos.');
    return false;
  }
}

function storageKb() {
  var raw = localStorage.getItem(STORAGE_KEY) || '';
  return Math.round((raw.length * 2) / 1024);
}

function calcQuoteTotals(doc) {
  return GarageCalc.calcDocumentTotals(doc, state.settings);
}

function findCustomer(id) {
  return state.customers.find(function (c) { return c.id === id; }) || null;
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
  return (b.id || 0) - (a.id || 0);
}

function cloneDoc(doc) {
  return JSON.parse(JSON.stringify(doc));
}

function safeImageSrc(url) {
  if (typeof url !== 'string' || url.length > 2000000) return '';
  if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return '';
  return url;
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
        return '<div class="list-item" onclick="openDocument(\'' + row.kind + '\',' + Number(row.doc.id) + ')">' +
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
        return '<div class="list-item" onclick="showCustomer(' + Number(c.id) + ')">' +
          '<div><strong>' + escapeHtml(c.name || 'Untitled') + '</strong>' +
          '<div class="meta">' + escapeHtml([c.phone, count + (count === 1 ? ' vehicle' : ' vehicles')].filter(Boolean).join(' · ')) + '</div></div>' +
          '<div>→</div></div>';
      }).join('') : '<p class="text-muted">No customers yet.</p>') +
    '</div>';
}

function saveNewCustomer() {
  var name = ($('#new-name').value || '').trim();
  if (!name) {
    showToast('Name is required.');
    return;
  }
  state.customers.push({
    id: genId(),
    name: name,
    phone: ($('#new-phone').value || '').trim(),
    email: ($('#new-email').value || '').trim(),
    address: ($('#new-address').value || '').trim(),
    vehicles: []
  });
  if (saveData()) {
    showToast('Customer saved on this device.');
    renderCustomers();
  }
}

function showCustomer(id) {
  var c = findCustomer(id);
  if (!c) {
    showView('customers');
    return;
  }
  if (!Array.isArray(c.vehicles)) c.vehicles = [];
  var el = $('#view-customer-detail');
  el.innerHTML =
    '<div class="toolbar"><button type="button" class="btn-sm btn-secondary" onclick="showView(\'customers\')">← Back</button></div>' +
    '<div class="card mt-2"><h3>Customer</h3>' +
    '<form onsubmit="event.preventDefault(); saveCustomerEdits();">' +
      '<input type="hidden" id="edit-id" value="' + Number(c.id) + '">' +
      '<div class="form-group"><label for="edit-name">Name</label><input id="edit-name" maxlength="120" required value="' + attr(c.name) + '"></div>' +
      '<div class="form-group"><label for="edit-phone">Phone</label><input id="edit-phone" type="tel" maxlength="40" value="' + attr(c.phone) + '"></div>' +
      '<div class="form-group"><label for="edit-email">Email</label><input id="edit-email" type="email" maxlength="120" value="' + attr(c.email) + '"></div>' +
      '<div class="form-group"><label for="edit-address">Address</label><textarea id="edit-address">' + escapeHtml(c.address || '') + '</textarea></div>' +
      '<button class="btn" type="submit" id="edit-customer-save">Save changes</button>' +
    '</form>' +
    '<button type="button" class="btn btn-danger" id="delete-customer" onclick="deleteCustomer(' + Number(c.id) + ')">Delete customer</button>' +
    '</div>' +
    '<div class="card"><div class="flex-between"><h3>Vehicles</h3></div>' +
      (c.vehicles.length ? c.vehicles.map(function (v) {
        return '<div class="list-item">' +
          '<div><strong>' + escapeHtml(vehicleLabel(v) || 'Vehicle') + '</strong>' +
          '<div class="meta">' + escapeHtml([v.plate, v.vin].filter(Boolean).join(' · ')) + '</div></div>' +
          '<div class="row-actions">' +
            '<button type="button" class="btn-sm btn-secondary" onclick="editVehicle(' + Number(c.id) + ',' + Number(v.id) + ')">Edit</button>' +
            '<button type="button" class="btn-sm btn-danger" onclick="deleteVehicle(' + Number(c.id) + ',' + Number(v.id) + ')">Delete</button>' +
          '</div></div>';
      }).join('') : '<p class="text-muted">No vehicles yet.</p>') +
      '<form class="mt-2" onsubmit="event.preventDefault(); saveVehicle();">' +
        '<input type="hidden" id="veh-id" value="">' +
        '<div class="row">' +
          '<div><span class="mini-label">Year</span><input id="veh-year" inputmode="numeric" maxlength="4" placeholder="2014"></div>' +
          '<div><span class="mini-label">Make</span><input id="veh-make" maxlength="40" placeholder="Honda"></div>' +
          '<div><span class="mini-label">Model</span><input id="veh-model" maxlength="40" placeholder="Civic"></div>' +
        '</div>' +
        '<div class="row mt-2">' +
          '<div><span class="mini-label">Plate</span><input id="veh-plate" maxlength="20"></div>' +
          '<div><span class="mini-label">VIN</span><input id="veh-vin" maxlength="20"></div>' +
        '</div>' +
        '<button class="btn" type="submit" id="veh-save">Add vehicle</button>' +
      '</form>' +
    '</div>' +
    '<button type="button" class="btn" onclick="newQuoteForCustomer(' + Number(c.id) + ')">New quote for ' + escapeHtml((c.name || 'customer').split(' ')[0]) + '</button>';
  showView('customer-detail');
}

function readCustomerFields() {
  var idEl = $('#edit-id');
  if (!idEl) return null;
  var c = findCustomer(parseInt(idEl.value, 10));
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
  var c = readCustomerFields();
  if (!c || !($('#edit-name').value || '').trim()) {
    showToast('Name is required.');
    return;
  }
  if (saveData()) {
    showToast('Customer saved on this device.');
    showCustomer(c.id);
  }
}

function deleteCustomer(id) {
  var c = findCustomer(id);
  if (!c) return;
  if (!confirm('Remove ' + (c.name || 'this customer') + ' from this device? Saved quotes and invoices keep the name already printed on them.')) return;
  state.customers = state.customers.filter(function (row) { return row.id !== id; });
  saveData();
  showToast('Customer removed from this device.');
  showView('customers');
}

function editVehicle(customerId, vehicleId) {
  var c = findCustomer(customerId);
  var v = c && (c.vehicles || []).find(function (row) { return row.id === vehicleId; });
  if (!v) return;
  $('#veh-id').value = v.id;
  $('#veh-year').value = v.year || '';
  $('#veh-make').value = v.make || '';
  $('#veh-model').value = v.model || '';
  $('#veh-plate').value = v.plate || '';
  $('#veh-vin').value = v.vin || '';
  $('#veh-save').textContent = 'Save vehicle';
  $('#veh-year').focus();
}

function saveVehicle() {
  var c = readCustomerFields();
  if (!c) return;
  var year = ($('#veh-year').value || '').trim();
  var make = ($('#veh-make').value || '').trim();
  var model = ($('#veh-model').value || '').trim();
  if (!year || !make || !model) {
    showToast('Year, make, and model are required.');
    return;
  }
  if (!Array.isArray(c.vehicles)) c.vehicles = [];
  var existingId = parseInt($('#veh-id').value, 10);
  var payload = {
    year: year,
    make: make,
    model: model,
    plate: ($('#veh-plate').value || '').trim(),
    vin: ($('#veh-vin').value || '').trim()
  };
  if (Number.isFinite(existingId)) {
    var v = c.vehicles.find(function (row) { return row.id === existingId; });
    if (v) Object.assign(v, payload);
  } else {
    payload.id = genId();
    c.vehicles.push(payload);
  }
  if (saveData()) {
    showToast('Vehicle saved on this device.');
    showCustomer(c.id);
  }
}

function deleteVehicle(customerId, vehicleId) {
  var c = findCustomer(customerId);
  if (!c) return;
  if (!confirm('Remove this vehicle from the customer on this device?')) return;
  readCustomerFields();
  c.vehicles = (c.vehicles || []).filter(function (v) { return v.id !== vehicleId; });
  saveData();
  showCustomer(customerId);
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
        return '<div class="list-item" onclick="viewQuote(' + Number(q.id) + ')">' +
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
        return '<div class="list-item" onclick="viewInvoice(' + Number(inv.id) + ')">' +
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
    workPerformed: ''
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
  var q = state.quotes.find(function (row) { return row.id === id; });
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
  var inv = state.invoices.find(function (row) { return row.id === id; });
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
  var isInvoice = editKind === 'invoice';
  var title = (isInvoice ? 'Invoice #' : 'Quote #') + escapeHtml(q.number);
  var customerOptions = '<option value="">Walk-in / cash</option>' +
    customers.map(function (c) {
      return '<option value="' + Number(c.id) + '"' + (q.customerId === c.id ? ' selected' : '') + '>' + escapeHtml(c.name || 'Customer') + '</option>';
    }).join('');
  if (q.customerId && !customers.some(function (c) { return c.id === q.customerId; })) {
    customerOptions += '<option value="' + Number(q.customerId) + '" selected>' + escapeHtml(q.customerName || 'Saved customer') + '</option>';
  }
  var vehicleOptions = '<option value="">No vehicle</option>' +
    vehicles.map(function (v) {
      return '<option value="' + Number(v.id) + '"' + (q.vehicleId === v.id ? ' selected' : '') + '>' + escapeHtml(vehicleLabel(v)) + '</option>';
    }).join('');
  if (q.vehicleId && !vehicles.some(function (v) { return v.id === q.vehicleId; })) {
    vehicleOptions += '<option value="' + Number(q.vehicleId) + '" selected>' + escapeHtml(q.vehicleDesc || 'Saved vehicle') + '</option>';
  }

  el.innerHTML =
    '<div class="screen-only">' +
      '<div class="toolbar"><button type="button" class="btn-sm btn-secondary" onclick="closeEditor()">← Back</button></div>' +
      '<h2 class="mt-2" id="editor-title">' + title + '</h2>' +
      (q.status === 'converted' && !isInvoice ? '<p class="help">This quote was already converted. You can still edit it or create another invoice.</p>' : '') +
      '<div class="card mt-2">' +
        '<div class="form-group"><label for="q-customer">Customer</label><select id="q-customer" onchange="updateQuoteCustomer()">' + customerOptions + '</select></div>' +
        '<div class="form-group"><label for="q-vehicle">Vehicle</label><select id="q-vehicle" onchange="updateQuoteVehicle()">' + vehicleOptions + '</select></div>' +
        '<div class="row">' +
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
    var src = safeImageSrc(p.dataUrl);
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
      item.unitCost = Number(state.settings.laborCostRate) || 0;
      item.unitPrice = Number(state.settings.laborRate) || 0;
      if (!item.qty) item.qty = 1;
    } else if (value === 'part') {
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
  if (field === 'unitCost' && row.type === 'part') {
    row.unitPrice = GarageCalc.suggestPartPrice(row.unitCost, state.settings.partsMarkup);
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
    unitPrice: Number(state.settings.laborRate) || 0
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
    currentQuote.photos.push({ dataUrl: dataUrl, caption: '', type: 'before' });
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
  if (cust) {
    var cid = parseInt(cust.value, 10);
    currentQuote.customerId = Number.isFinite(cid) ? cid : null;
  }
  var veh = $('#q-vehicle');
  if (veh) {
    var vid = parseInt(veh.value, 10);
    currentQuote.vehicleId = Number.isFinite(vid) ? vid : null;
  }
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
    doc.vehicleDesc = vehicleLabel(v);
    doc.vehiclePlate = v.plate || '';
    doc.vehicleVin = v.vin || '';
  } else if (!doc.vehicleId) {
    doc.vehicleDesc = '';
    doc.vehiclePlate = '';
    doc.vehicleVin = '';
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
  if (!currentQuote) return false;
  syncQuoteForm();
  var list = editKind === 'invoice' ? state.invoices : state.quotes;
  var idx = list.findIndex(function (row) { return row.id === currentQuote.id; });
  if (idx >= 0) list[idx] = currentQuote;
  else list.push(currentQuote);
  editIsNew = false;
  return saveData();
}

function saveQuote() {
  if (!persistQuote()) return;
  showToast((editKind === 'invoice' ? 'Invoice' : 'Quote') + ' saved on this device.');
  showView(editKind === 'invoice' ? 'invoices' : 'quotes');
}

function closeEditor() {
  showView(editKind === 'invoice' ? 'invoices' : 'quotes');
}

function deleteCurrentDocument() {
  if (!currentQuote) return;
  var kind = editKind;
  var id = currentQuote.id;
  var label = kind === 'invoice' ? 'invoice' : 'quote';
  if (!confirm('Delete this ' + label + ' from this device?')) return;
  if (kind === 'invoice') state.invoices = state.invoices.filter(function (row) { return row.id !== id; });
  else state.quotes = state.quotes.filter(function (row) { return row.id !== id; });
  currentQuote = null;
  editIsNew = true;
  saveData();
  showToast('Deleted from this device.');
  showView(kind === 'invoice' ? 'invoices' : 'quotes');
}

function convertToInvoice() {
  if (!currentQuote || editKind === 'invoice') return;
  syncQuoteForm();
  if (currentQuote.status === 'converted') {
    if (!confirm('This quote was already converted. Create another invoice?')) return;
  }
  if (!persistQuote()) return;
  var inv = cloneDoc(currentQuote);
  inv.id = genId();
  inv.number = GarageCalc.nextDocumentNumber(state.invoices);
  inv.status = 'sent';
  inv.quoteId = currentQuote.id;
  delete inv.paidDate;
  state.invoices.push(inv);
  currentQuote.status = 'converted';
  var saved = state.quotes.find(function (q) { return q.id === currentQuote.id; });
  if (saved) saved.status = 'converted';
  saveData();
  showToast('Invoice created on this device.');
  viewInvoice(inv.id);
}

function viewInvoice(id) {
  var inv = state.invoices.find(function (row) { return row.id === id; });
  if (!inv) return;
  var t = calcQuoteTotals(inv);
  var status = inv.status || 'sent';
  var el = $('#view-invoice');
  el.innerHTML =
    '<div class="no-print toolbar">' +
      '<button type="button" class="btn-sm btn-secondary" onclick="showView(\'invoices\')">← Back</button>' +
      '<button type="button" class="btn-sm" id="edit-invoice" onclick="editInvoice(' + Number(inv.id) + ')">Edit</button>' +
      '<button type="button" class="btn-sm" id="print-invoice" onclick="saveAsPDF()">Print / Save PDF</button>' +
      '<a class="btn-sm btn-secondary" id="email-invoice" href="' + attr(mailtoHref(inv, 'invoice')) + '" onclick="this.href=mailtoForInvoice(' + Number(inv.id) + ')">Email</a>' +
      '<button type="button" class="btn-sm btn-success" id="mark-paid" onclick="togglePaid(' + Number(inv.id) + ')">' + (status === 'paid' ? 'Mark unpaid' : 'Mark paid') + '</button>' +
      '<button type="button" class="btn-sm btn-danger" id="delete-invoice" onclick="deleteInvoice(' + Number(inv.id) + ')">Delete</button>' +
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
  var vehicleBits = [doc.vehicleDesc, doc.vehiclePlate, doc.vehicleVin].filter(Boolean);
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
    var src = safeImageSrc(p.dataUrl);
    if (!src) return '';
    var when = p.type === 'after' ? 'After' : 'Before';
    var caption = (p.caption || '').trim();
    var line = caption || when;
    if (caption && caption.toLowerCase().indexOf(when.toLowerCase()) !== 0) line = when + ' — ' + caption;
    return '<figure class="doc-photo"><img src="' + src + '" alt="' + attr(line) + '">' +
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
  var inv = state.invoices.find(function (row) { return row.id === id; });
  return inv ? mailtoHref(inv, 'invoice') : 'mailto:';
}

function togglePaid(id) {
  var inv = state.invoices.find(function (row) { return row.id === id; });
  if (!inv) return;
  if (inv.status === 'paid') {
    inv.status = 'sent';
    delete inv.paidDate;
  } else {
    inv.status = 'paid';
    inv.paidDate = todayISO();
  }
  saveData();
  viewInvoice(id);
}

function deleteInvoice(id) {
  if (!confirm('Delete this invoice from this device?')) return;
  state.invoices = state.invoices.filter(function (row) { return row.id !== id; });
  if (currentQuote && currentQuote.id === id && editKind === 'invoice') currentQuote = null;
  saveData();
  showToast('Invoice deleted from this device.');
  showView('invoices');
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
            '<button type="button" class="btn-sm btn-secondary" onclick="editTime(' + Number(e.id) + ')">Edit</button>' +
            '<button type="button" class="btn-sm btn-danger" onclick="deleteTime(' + Number(e.id) + ')">Delete</button></div></div>';
      }).join('') : '<p class="text-muted">No time entries yet.</p>') +
    '</div>';
}

function saveTime() {
  var hours = parseFloat($('#time-hours').value);
  if (!Number.isFinite(hours) || hours <= 0) {
    showToast('Enter hours greater than zero.');
    return;
  }
  var id = parseInt($('#time-id').value, 10);
  var entry = {
    date: $('#time-date').value || todayISO(),
    hours: hours,
    description: ($('#time-desc').value || '').trim() || 'Labor',
    jobNumber: $('#time-job').value || '',
    rate: Number(state.settings.laborRate) || 0
  };
  if (Number.isFinite(id)) {
    var existing = state.timeEntries.find(function (row) { return row.id === id; });
    if (existing) {
      entry.id = id;
      if (existing.rate != null) entry.rate = existing.rate;
      Object.assign(existing, entry);
    }
  } else {
    entry.id = genId();
    state.timeEntries.push(entry);
  }
  if (saveData()) {
    showToast('Time saved on this device.');
    renderTime();
  }
}

function editTime(id) {
  var e = state.timeEntries.find(function (row) { return row.id === id; });
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
  if (!confirm('Delete this time entry from this device?')) return;
  state.timeEntries = state.timeEntries.filter(function (row) { return row.id !== id; });
  saveData();
  renderTime();
}

function renderSettings() {
  var s = state.settings;
  var el = $('#view-settings');
  var kb = 0;
  try { kb = storageKb(); } catch (err) { kb = 0; }
  el.innerHTML =
    '<div class="notice" id="storage-notice"><strong>Stored on this device only</strong>' +
      'Customers, vehicles, quotes, invoices, photos, and time stay in this browser under the key ' +
      '<span id="storage-key">' + escapeHtml(STORAGE_KEY) + '</span>. They are not uploaded and do not sync to another phone or computer. ' +
      'About <span id="storage-kb">' + kb + '</span> KB is in use here. Export a JSON backup if you want a copy. ' +
      'Clearing browser data for this site deletes the records.' +
    '</div>' +
    '<div class="notice"><strong>PIN is only a session gate</strong>' +
      'The shop PIN is 1995. It hides the desk until it is entered again in this browser session. ' +
      'It is not an account, and it does not encrypt records. Anyone who can open this browser’s site data can read them.' +
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
        '<div class="form-group"><label for="set-labor">Labor rate ($/hr)</label><input type="number" step="0.01" id="set-labor" value="' + attr(s.laborRate) + '"></div>' +
        '<div class="form-group"><label for="set-cost">Your cost rate ($/hr)</label><input type="number" step="0.01" id="set-cost" value="' + attr(s.laborCostRate) + '"></div>' +
      '</div>' +
      '<div class="row">' +
        '<div class="form-group"><label for="set-tax">Tax rate (%)</label><input type="number" step="0.1" id="set-tax" value="' + attr(s.taxRate) + '"></div>' +
        '<div class="form-group"><label for="set-markup">Default parts markup (%)</label><input type="number" step="0.1" id="set-markup" value="' + attr(s.partsMarkup) + '"></div>' +
      '</div>' +
      '<div class="form-group"><label for="set-terms">Invoice terms</label><textarea id="set-terms">' + escapeHtml(s.terms || '') + '</textarea></div>' +
      '<button type="button" class="btn" id="save-settings" onclick="saveSettings()">Save settings</button>' +
    '</div>' +
    '<div class="card"><h3>Backup</h3>' +
      '<p class="help">The file contains whatever is on this device, including photos. Keep it private.</p>' +
      '<button type="button" class="btn" id="export-btn" onclick="exportData()">Download JSON backup</button>' +
      '<button type="button" class="btn btn-secondary" id="import-btn" onclick="importData()">Restore JSON backup</button>' +
      '<input type="file" id="import-file" accept="application/json,.json" style="display:none" onchange="handleImport(event)">' +
    '</div>' +
    '<div class="card"><h3>Install on iPhone</h3>' +
      '<p class="help">Open this site in Safari, tap Share, then Add to Home Screen. The icon uses the shop logo. After one online visit, the shell can open offline. Records still stay on that device.</p>' +
      '<button type="button" class="btn btn-secondary" id="lock-btn" onclick="lockApp()">Lock session</button>' +
    '</div>';
}

function readNumber(id, fallback) {
  var el = document.getElementById(id);
  var n = el ? parseFloat(el.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function saveSettings() {
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
  if (saveData()) {
    refreshBrand();
    showToast('Settings saved on this device.');
    renderSettings();
  }
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
      if (!confirm('Replace all Will Ruby’s Garage records on this device with this backup?')) return;
      applyPayload(data);
      if (!saveData()) return;
      refreshBrand();
      showToast('Backup restored on this device.');
      showView('dashboard');
    } catch (err) {
      showToast('That file is not a Will Ruby’s Garage backup.');
    }
  };
  reader.readAsText(file);
}

function lockApp() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (err) { /* ignore */ }
  location.reload();
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
      '<p class="text-muted">Enter the shop PIN for this session</p>' +
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
  if (pinEntered === '1995') {
    try { sessionStorage.setItem(SESSION_KEY, 'ok'); } catch (err) { /* private mode */ }
    var overlay = $('#pin-overlay');
    if (overlay) overlay.remove();
    initApp();
    return;
  }
  if (error) error.textContent = 'Incorrect PIN';
  pinEntered = '';
  setTimeout(function () {
    var again = $('#pin-display');
    var err = $('#pin-error');
    if (again) again.textContent = '••••';
    if (err) err.textContent = '';
  }, 700);
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

function initApp() {
  if (appStarted) return;
  appStarted = true;
  loadData();
  refreshBrand();
  $all('.nav-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { showView(btn.getAttribute('data-view')); });
  });
  showView('dashboard');
}

function init() {
  document.addEventListener('keydown', onPinKeydown);
  registerServiceWorker();
  var unlocked = false;
  try { unlocked = sessionStorage.getItem(SESSION_KEY) === 'ok'; } catch (err) { unlocked = false; }
  if (unlocked) initApp();
  else showPinScreen();
}

document.addEventListener('DOMContentLoaded', init);
