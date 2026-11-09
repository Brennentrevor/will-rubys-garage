/* Guided customer and vehicle steps, plus on-phone VIN scanning. */
var SPEC_FIELDS = [
  ['engineType', 'Engine type'],
  ['engineDisplacement', 'Displacement'],
  ['fuel', 'Fuel'],
  ['transmissionType', 'Transmission'],
  ['transmissionSpec', 'Transmission spec'],
  ['oilType', 'Oil type'],
  ['oilGrade', 'Oil grade'],
  ['oilSpec', 'Oil spec'],
  ['oilCapacity', 'Oil capacity'],
  ['oilFilter', 'Oil filter'],
  ['frontBrakeNotes', 'Front brake notes'],
  ['rearBrakeNotes', 'Rear brake notes'],
  ['wiperLeft', 'Front left / driver wiper'],
  ['wiperRight', 'Front right / passenger wiper']
];

function blankVehicle() {
  return {
    trim: '', odometer: '', engineType: '', engineDisplacement: '', fuel: '',
    transmissionType: '', transmissionSpec: '', oilType: '', oilGrade: '', oilSpec: '',
    oilCapacity: '', oilFilter: '', frontBrake: '', frontBrakeNotes: '', rearBrake: '',
    rearBrakeNotes: '', wiperLeft: '', wiperRight: '', wiperRear: ''
  };
}

function vehicleTitle(v) {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
}

function fieldInput(id, label, value, extra) {
  return '<div class="form-group"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + attr(value || '') + '"' + (extra || '') + '></div>';
}

function vehicleFormHtml(v) {
  v = Object.assign(blankVehicle(), v || {});
  return '<input type="hidden" id="veh-id" value="' + attr(v.id || '') + '">' +
    '<div class="field-stack">' +
      fieldInput('veh-year', 'Year', v.year, ' inputmode="numeric" maxlength="4"') +
      fieldInput('veh-make', 'Make', v.make, ' maxlength="40"') +
      fieldInput('veh-model', 'Model', v.model, ' maxlength="40"') +
      fieldInput('veh-trim', 'Trim', v.trim, ' maxlength="40"') +
      fieldInput('veh-plate', 'Plate', v.plate, ' maxlength="20"') +
      fieldInput('veh-odometer', 'Odometer', v.odometer, ' inputmode="numeric" maxlength="12"') +
    '</div>' +
    '<div class="form-group"><label for="veh-vin">VIN</label>' +
      '<input id="veh-vin" maxlength="17" autocapitalize="characters" value="' + attr(v.vin || '') + '" placeholder="Type 17 characters">' +
      '<div class="toolbar mt-2">' +
        '<button type="button" class="btn-sm" id="vin-scan" onclick="openVinScanner()">Scan barcode</button>' +
        '<label class="btn-sm btn-secondary">Photo<input id="vin-photo" type="file" accept="image/*" capture="environment" style="display:none" onchange="scanVinPhoto(event)"></label>' +
      '</div>' +
      '<p id="vin-note" class="help">Type the VIN anytime. Scanning reads the barcode on this phone and does not send the picture to an OCR service. iPhone Safari uses a barcode library because the built-in detector is not available there.</p>' +
    '</div>' +
    '<details class="spec-block"><summary>Service specs, optional</summary>' +
      '<div class="field-stack mt-2">' +
        fieldInput('veh-engineType', 'Engine type', v.engineType) +
        fieldInput('veh-engineDisplacement', 'Displacement', v.engineDisplacement) +
        fieldInput('veh-fuel', 'Fuel', v.fuel) +
        fieldInput('veh-transmissionType', 'Transmission', v.transmissionType) +
        fieldInput('veh-transmissionSpec', 'Transmission spec', v.transmissionSpec) +
        fieldInput('veh-oilType', 'Oil type', v.oilType) +
        fieldInput('veh-oilGrade', 'Oil grade', v.oilGrade) +
        fieldInput('veh-oilSpec', 'Oil spec', v.oilSpec) +
        fieldInput('veh-oilCapacity', 'Oil capacity', v.oilCapacity) +
        fieldInput('veh-oilFilter', 'Oil filter', v.oilFilter) +
      '</div>' +
      '<div class="form-group"><label for="veh-frontBrake">Front brakes</label><select id="veh-frontBrake">' + brakeOptions(v.frontBrake) + '</select></div>' +
      fieldInput('veh-frontBrakeNotes', 'Front pad / rotor notes', v.frontBrakeNotes) +
      '<div class="form-group"><label for="veh-rearBrake">Rear brakes</label><select id="veh-rearBrake">' + brakeOptions(v.rearBrake) + '</select></div>' +
      fieldInput('veh-rearBrakeNotes', 'Rear pad / rotor notes', v.rearBrakeNotes) +
      fieldInput('veh-wiperLeft', 'Front left / driver wiper', v.wiperLeft) +
      fieldInput('veh-wiperRight', 'Front right / passenger wiper', v.wiperRight) +
      '<div class="form-group"><label for="veh-wiperRear">Rear wiper</label><input id="veh-wiperRear" value="' + attr(v.wiperRear || '') + '" placeholder="Size, or none"></div>' +
      '<p class="help">Leave unknown specs blank. A VIN lookup never fills oil, brakes, or wipers.</p>' +
    '</details>';
}

function brakeOptions(current) {
  return [['', 'Unknown'], ['disc', 'Disc'], ['drum', 'Drum']].map(function (pair) {
    return '<option value="' + pair[0] + '"' + (current === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
  }).join('');
}

function vehicleSectionHtml(customer) {
  var vehicles = customer.vehicles || [];
  return '<div class="card" id="vehicle-card"><h3>Vehicles</h3>' +
    (vehicles.length ? vehicles.map(function (v) {
      return '<div class="list-item"><div><strong>' + escapeHtml(vehicleTitle(v) || vehicleLabel(v) || 'Vehicle') + '</strong>' +
        '<div class="meta">' + escapeHtml([v.plate, v.vin, v.odometer ? 'Odo ' + v.odometer : ''].filter(Boolean).join(' · ')) + '</div></div>' +
        '<div class="row-actions">' +
          '<button type="button" class="btn-sm btn-secondary" onclick="editVehicle(' + jsId(customer.id) + ',' + jsId(v.id) + ')">Edit</button>' +
          '<button type="button" class="btn-sm btn-danger" onclick="deleteVehicle(' + jsId(customer.id) + ',' + jsId(v.id) + ')">Delete</button>' +
        '</div></div>';
    }).join('') : '<p class="text-muted">No vehicles yet. Older vehicles keep whatever was already saved.</p>') +
    '<form class="mt-2" id="vehicle-form" onsubmit="event.preventDefault(); saveVehicle();">' +
      vehicleFormHtml(null) +
      '<button class="btn" type="submit" id="veh-save">Add vehicle</button>' +
    '</form></div>';
}

function formValue(id) {
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function collectVehicleForm() {
  var vin = window.WrgVin ? WrgVin.normalizeVin(formValue('veh-vin')) : formValue('veh-vin').toUpperCase();
  return Object.assign(blankVehicle(), {
    id: formValue('veh-id'),
    year: formValue('veh-year'),
    make: formValue('veh-make'),
    model: formValue('veh-model'),
    trim: formValue('veh-trim'),
    plate: formValue('veh-plate'),
    odometer: formValue('veh-odometer'),
    vin: vin,
    engineType: formValue('veh-engineType'),
    engineDisplacement: formValue('veh-engineDisplacement'),
    fuel: formValue('veh-fuel'),
    transmissionType: formValue('veh-transmissionType'),
    transmissionSpec: formValue('veh-transmissionSpec'),
    oilType: formValue('veh-oilType'),
    oilGrade: formValue('veh-oilGrade'),
    oilSpec: formValue('veh-oilSpec'),
    oilCapacity: formValue('veh-oilCapacity'),
    oilFilter: formValue('veh-oilFilter'),
    frontBrake: formValue('veh-frontBrake'),
    frontBrakeNotes: formValue('veh-frontBrakeNotes'),
    rearBrake: formValue('veh-rearBrake'),
    rearBrakeNotes: formValue('veh-rearBrakeNotes'),
    wiperLeft: formValue('veh-wiperLeft'),
    wiperRight: formValue('veh-wiperRight'),
    wiperRear: formValue('veh-wiperRear')
  });
}

function fillVehicleForm(v) {
  var fields = Object.assign(blankVehicle(), v || {});
  ['year', 'make', 'model', 'trim', 'plate', 'odometer', 'vin', 'engineType', 'engineDisplacement', 'fuel', 'transmissionType', 'transmissionSpec', 'oilType', 'oilGrade', 'oilSpec', 'oilCapacity', 'oilFilter', 'frontBrake', 'frontBrakeNotes', 'rearBrake', 'rearBrakeNotes', 'wiperLeft', 'wiperRight', 'wiperRear'].forEach(function (key) {
    var el = document.getElementById('veh-' + key);
    if (el) el.value = fields[key] || '';
  });
  var idEl = document.getElementById('veh-id');
  if (idEl) idEl.value = v && v.id ? v.id : '';
  var save = document.getElementById('veh-save');
  if (save) save.textContent = v && v.id ? 'Save vehicle' : 'Add vehicle';
}

function serviceSpecsHtml(specs) {
  if (!specs || typeof specs !== 'object') return '';
  var labels = {
    engineType: 'Engine', engineDisplacement: 'Displacement', fuel: 'Fuel',
    transmissionType: 'Transmission', transmissionSpec: 'Transmission spec',
    oilType: 'Oil type', oilGrade: 'Oil grade', oilSpec: 'Oil spec', oilCapacity: 'Oil capacity', oilFilter: 'Oil filter',
    frontBrake: 'Front brakes', frontBrakeNotes: 'Front brake notes', rearBrake: 'Rear brakes', rearBrakeNotes: 'Rear brake notes',
    wiperLeft: 'Driver wiper', wiperRight: 'Passenger wiper', wiperRear: 'Rear wiper'
  };
  var bits = Object.keys(labels).filter(function (key) { return specs[key]; }).map(function (key) {
    return '<div>' + escapeHtml(labels[key] + ': ' + specs[key]) + '</div>';
  });
  if (!bits.length) return '';
  return '<section class="doc-section"><h3>Service specs</h3>' + bits.join('') + '</section>';
}

function specsSnapshot(v) {
  var out = {};
  ['engineType', 'engineDisplacement', 'fuel', 'transmissionType', 'transmissionSpec', 'oilType', 'oilGrade', 'oilSpec', 'oilCapacity', 'oilFilter', 'frontBrake', 'frontBrakeNotes', 'rearBrake', 'rearBrakeNotes', 'wiperLeft', 'wiperRight', 'wiperRear'].forEach(function (key) {
    if (v && v[key]) out[key] = v[key];
  });
  return out;
}

function stepPills(active) {
  var steps = [['customer', 'Customer'], ['vehicle', 'Vehicle'], ['basics', 'Basics'], ['specs', 'Specs'], ['review', 'Review']];
  return '<div class="step-pills">' + steps.map(function (step) {
    return '<span class="' + (step[0] === active ? 'active' : '') + '">' + step[1] + '</span>';
  }).join('') + '</div>';
}

function renderQuoteGuide(q) {
  var step = q.guideStep || 'customer';
  var body = '';
  if (step === 'customer') body = guideCustomer(q);
  else if (step === 'vehicle') body = guideVehicle(q);
  else if (step === 'basics') body = guideBasics(q);
  else if (step === 'specs') body = guideSpecs(q);
  else body = guideReview(q);
  return '<div class="screen-only" id="quote-guide">' +
    '<div class="toolbar"><button type="button" class="btn-sm btn-secondary" onclick="closeEditor()">← Back</button></div>' +
    '<h2 class="mt-2">New quote #' + escapeHtml(q.number) + '</h2>' +
    stepPills(step) + body + '</div>';
}

function guideCustomer(q) {
  var options = '<option value="">Choose</option>' + state.customers.map(function (c) {
    return '<option value="' + attr(c.id) + '"' + (sameId(q.customerId, c.id) ? ' selected' : '') + '>' + escapeHtml(c.name || 'Customer') + '</option>';
  }).join('') + '<option value="walk-in"' + (!q.customerId && q.walkIn ? ' selected' : '') + '>Walk-in / cash</option>';
  return '<div class="card"><h3>1. Customer</h3>' +
    '<div class="form-group"><label for="guide-customer">Saved customer</label><select id="guide-customer">' + options + '</select></div>' +
    '<button type="button" class="btn" id="guide-use-customer" onclick="guideUseCustomer()">Continue</button>' +
    '<h3 class="mt-4">Or add a customer</h3>' +
    '<form onsubmit="event.preventDefault(); guideAddCustomer();">' +
      '<div class="form-group"><label for="guide-name">Name</label><input id="guide-name" required maxlength="120"></div>' +
      '<div class="form-group"><label for="guide-phone">Phone</label><input id="guide-phone" type="tel" maxlength="40"></div>' +
      '<div class="form-group"><label for="guide-email">Email</label><input id="guide-email" type="email" maxlength="120"></div>' +
      '<button class="btn btn-secondary" type="submit" id="guide-add-customer">Save customer and continue</button>' +
    '</form></div>';
}

function guideUseCustomer() {
  var sel = document.getElementById('guide-customer');
  if (!sel || !sel.value) {
    showToast('Choose a customer or add one.');
    return;
  }
  if (sel.value === 'walk-in') {
    currentQuote.customerId = null;
    currentQuote.walkIn = true;
    currentQuote.customerName = '';
    currentQuote.guideStep = 'basics';
  } else {
    currentQuote.customerId = sel.value;
    currentQuote.walkIn = false;
    snapshotParty(currentQuote);
    currentQuote.guideStep = 'vehicle';
  }
  renderQuoteEditor();
}

function guideAddCustomer() {
  if (!canSave()) return;
  var name = formValue('guide-name');
  if (!name) {
    showToast('Name is required.');
    return;
  }
  var customer = {
    id: genId(),
    version: 0,
    name: name,
    phone: formValue('guide-phone'),
    email: formValue('guide-email'),
    address: '',
    vehicles: []
  };
  state.customers.push(customer);
  currentQuote.customerId = customer.id;
  currentQuote.walkIn = false;
  snapshotParty(currentQuote);
  currentQuote.guideStep = 'vehicle';
  commitShop('Customer saved in the shop.').then(function (result) {
    if (!result || !result.ok) {
      state.customers = state.customers.filter(function (row) { return !sameId(row.id, customer.id); });
      currentQuote.customerId = null;
      return;
    }
    renderQuoteEditor();
  });
}

function guideVehicle(q) {
  window.vehicleSaveTarget = 'guide';
  var vehicles = getVehiclesForCustomer(q.customerId);
  var options = '<option value="">Choose</option>' + vehicles.map(function (v) {
    return '<option value="' + attr(v.id) + '"' + (sameId(q.vehicleId, v.id) ? ' selected' : '') + '>' + escapeHtml(vehicleTitle(v) || 'Vehicle') + '</option>';
  }).join('');
  return '<div class="card"><h3>2. Vehicle</h3>' +
    '<p class="help">' + escapeHtml(q.customerName || 'This customer') + '</p>' +
    '<div class="form-group"><label for="guide-vehicle">Saved vehicle</label><select id="guide-vehicle">' + options + '</select></div>' +
    '<div class="toolbar">' +
      '<button type="button" class="btn-sm" id="guide-edit-vehicle" onclick="guideEditSelected()">Edit</button>' +
      '<button type="button" class="btn-sm btn-secondary" id="guide-no-vehicle" onclick="guideSkipVehicle()">No vehicle</button>' +
    '</div>' +
    '<button type="button" class="btn" id="guide-use-vehicle" onclick="guideUseVehicle()">Use selected vehicle</button>' +
    '<h3 class="mt-4">Add a vehicle</h3>' +
    '<form id="vehicle-form" onsubmit="event.preventDefault(); saveVehicle();">' + vehicleFormHtml(null) +
      '<button class="btn btn-secondary" type="submit" id="veh-save">Save vehicle and continue</button>' +
    '</form></div>';
}

function guideEditSelected() {
  var id = formValue('guide-vehicle');
  var vehicles = getVehiclesForCustomer(currentQuote.customerId);
  var vehicle = vehicles.find(function (row) { return sameId(row.id, id); });
  if (!vehicle) {
    showToast('Choose a vehicle to edit.');
    return;
  }
  fillVehicleForm(vehicle);
  var specs = document.querySelector('#vehicle-form details');
  if (specs) specs.open = true;
}

function guideUseVehicle() {
  var id = formValue('guide-vehicle');
  if (!id) {
    showToast('Choose a vehicle, add one, or continue with no vehicle.');
    return;
  }
  currentQuote.vehicleId = id;
  snapshotParty(currentQuote);
  currentQuote.guideStep = 'basics';
  renderQuoteEditor();
}

function guideSkipVehicle() {
  currentQuote.vehicleId = null;
  snapshotParty(currentQuote);
  currentQuote.guideStep = 'basics';
  renderQuoteEditor();
}

function guideBasics(q) {
  return '<div class="card"><h3>3. Basics</h3>' +
    '<div class="field-stack">' +
      '<div class="form-group"><label for="q-date">Date</label><input type="date" id="q-date" value="' + attr(q.date || todayISO()) + '"></div>' +
      '<div class="form-group"><label for="q-tax">Tax rate (%)</label><input type="number" id="q-tax" step="0.1" value="' + attr(q.taxRate != null ? q.taxRate : state.settings.taxRate) + '"></div>' +
    '</div>' +
    '<div class="form-group"><label for="q-notes">Shop notes, not printed</label><textarea id="q-notes">' + escapeHtml(q.notes || '') + '</textarea></div>' +
    '<button type="button" class="btn" id="guide-basics-next" onclick="guideSaveBasics()">Continue</button>' +
    '<button type="button" class="btn btn-secondary" onclick="setGuideStep(\'vehicle\')">Back</button></div>';
}

function guideSaveBasics() {
  var date = document.getElementById('q-date');
  var tax = document.getElementById('q-tax');
  var notes = document.getElementById('q-notes');
  if (date && date.value) currentQuote.date = date.value;
  if (tax) {
    var n = parseFloat(tax.value);
    currentQuote.taxRate = Number.isFinite(n) ? n : 0;
  }
  if (notes) currentQuote.notes = notes.value;
  currentQuote.guideStep = currentQuote.vehicleId ? 'specs' : 'review';
  renderQuoteEditor();
}

function guideSpecs(q) {
  var vehicle = (getVehiclesForCustomer(q.customerId) || []).find(function (row) { return sameId(row.id, q.vehicleId); });
  return '<div class="card"><h3>4. Service specs</h3>' +
    '<p class="help">Optional. Saved on this vehicle and reused next time. Nothing here is required.</p>' +
    '<form id="vehicle-form" onsubmit="event.preventDefault(); saveGuideSpecs();">' +
      vehicleFormHtml(vehicle) +
      '<button class="btn" type="submit" id="veh-save">Save specs and review</button>' +
    '</form>' +
    '<button type="button" class="btn btn-secondary" id="guide-skip-specs" onclick="setGuideStep(\'review\')">Skip specs</button></div>';
}

function saveGuideSpecs() {
  window.vehicleSaveTarget = 'guide-specs';
  saveVehicle();
}

function guideReview(q) {
  var linked = (getVehiclesForCustomer(q.customerId) || []).find(function (row) { return sameId(row.id, q.vehicleId); });
  var specs = Object.assign({}, (linked && specsSnapshot(linked)) || {}, q.vehicleSpecs || {});
  var specBits = Object.keys(specs).map(function (key) { return key + ': ' + specs[key]; });
  var vin = q.vehicleVin || (linked && linked.vin) || '';
  var odometer = q.vehicleOdometer || (linked && linked.odometer) || '';
  var desc = q.vehicleDesc || (linked && (vehicleTitle(linked) || vehicleLabel(linked))) || 'No vehicle';
  return '<div class="card"><h3>5. Review</h3>' +
    '<p><strong>' + escapeHtml(q.customerName || 'Walk-in') + '</strong></p>' +
    '<p>' + escapeHtml(desc) + '</p>' +
    '<p class="meta">' + escapeHtml([vin, odometer ? 'Odo ' + odometer : ''].filter(Boolean).join(' · ')) + '</p>' +
    (specBits.length ? '<p class="help">' + escapeHtml(specBits.join(' · ')) + '</p>' : '<p class="help">No service specs yet.</p>') +
    '<button type="button" class="btn" id="guide-start" onclick="startQuoteLines()">Start quote</button></div>';
}

function setGuideStep(step) {
  if (!currentQuote) return;
  currentQuote.guideStep = step;
  renderQuoteEditor();
}

function startQuoteLines() {
  currentQuote.guideStep = 'lines';
  renderQuoteEditor();
}

function quoteVehicleActions() {
  return '<div class="toolbar mt-2">' +
    '<button type="button" class="btn-sm" id="quote-add-vehicle" onclick="openQuoteVehicle(false)">Add vehicle</button>' +
    '<button type="button" class="btn-sm btn-secondary" id="quote-edit-vehicle" onclick="openQuoteVehicle(true)">Edit vehicle</button>' +
    '</div><div id="quote-vehicle-slot"></div>';
}

function openQuoteVehicle(edit) {
  if (!currentQuote || !currentQuote.customerId) {
    showToast('Choose a customer before adding a vehicle.');
    return;
  }
  var slot = document.getElementById('quote-vehicle-slot');
  if (!slot) return;
  var vehicle = null;
  if (edit) {
    vehicle = (getVehiclesForCustomer(currentQuote.customerId) || []).find(function (row) {
      return sameId(row.id, currentQuote.vehicleId);
    });
    if (!vehicle) {
      showToast('Choose a vehicle to edit.');
      return;
    }
  }
  window.vehicleSaveTarget = 'quote';
  slot.innerHTML = '<form id="vehicle-form" class="mt-2" onsubmit="event.preventDefault(); saveVehicle();">' +
    vehicleFormHtml(vehicle) +
    '<button class="btn" type="submit" id="veh-save">' + (edit ? 'Save vehicle' : 'Add vehicle') + '</button></form>';
  if (edit) fillVehicleForm(vehicle);
}

var vinReader = null;

function openVinScanner() {
  closeVinScanner();
  var modal = document.createElement('div');
  modal.id = 'vin-modal';
  modal.className = 'pin-overlay';
  modal.innerHTML = '<div class="pin-card" style="text-align:left">' +
    '<h2>Scan VIN</h2>' +
    '<p class="help">Point at the barcode. The picture stays on this phone. If the camera is unavailable, use Photo or type the VIN. Letters I, O, and Q are not valid.</p>' +
    '<video id="vin-video" playsinline muted style="width:100%;border-radius:12px;background:#0f172a"></video>' +
    '<p id="vin-scan-status" class="help">Starting camera…</p>' +
    '<div id="vin-confirm"></div>' +
    '<button type="button" class="btn btn-secondary" id="vin-close" onclick="closeVinScanner()">Close</button>' +
    '</div>';
  document.body.appendChild(modal);
  if (!window.ZXing || !ZXing.BrowserMultiFormatReader) {
    setVinStatus('This browser did not load the barcode library. Type the VIN or pick a photo. Nothing is sent to an OCR service.');
    return;
  }
  vinReader = new ZXing.BrowserMultiFormatReader();
  vinReader.decodeFromVideoDevice(undefined, 'vin-video', function (result) {
    if (result) considerVin(result.getText());
  }).catch(function () {
    setVinStatus('The camera did not start. Type the 17-character VIN, or choose a photo of the barcode. The photo is decoded on this phone.');
  });
}

function setVinStatus(message) {
  var el = document.getElementById('vin-scan-status');
  if (el) el.textContent = message;
  var note = document.getElementById('vin-note');
  if (note && !document.getElementById('vin-modal')) note.textContent = message;
}

function openVinConfirm(raw) {
  closeVinScanner();
  var modal = document.createElement('div');
  modal.id = 'vin-modal';
  modal.className = 'pin-overlay';
  modal.innerHTML = '<div class="pin-card" style="text-align:left"><h2>VIN photo</h2><p id="vin-scan-status" class="help"></p><div id="vin-confirm"></div>' +
    '<button type="button" class="btn btn-secondary" onclick="closeVinScanner()">Close</button></div>';
  document.body.appendChild(modal);
  considerVin(raw);
}

function considerVin(raw) {
  var vin = window.WrgVin ? WrgVin.acceptScan(raw) : null;
  if (!vin) {
    setVinStatus('That read is not a 17-character VIN without I, O, or Q. Try again or type it.');
    return;
  }
  if (vinReader) {
    try { vinReader.reset(); } catch (err) { /* stop camera */ }
    vinReader = null;
  }
  stopVinVideo();
  var box = document.getElementById('vin-confirm');
  if (!box) return;
  box.innerHTML = '<p><strong>' + escapeHtml(vin) + '</strong></p>' +
    '<button type="button" class="btn" id="vin-accept" onclick="acceptScannedVin(\'' + vin + '\')">Use this VIN</button>';
  setVinStatus('Confirm the VIN before it is saved.');
}

function acceptScannedVin(vin) {
  var input = document.getElementById('veh-vin');
  if (input) input.value = vin;
  closeVinScanner();
  lookupVin(vin);
}

function scanVinPhoto(event) {
  var file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (!window.ZXing || !ZXing.BrowserMultiFormatReader) {
    setVinStatus('Photo scanning needs the barcode library, which did not load. Type the VIN. The photo is not uploaded.');
    return;
  }
  var url = URL.createObjectURL(file);
  var img = new Image();
  img.onload = function () {
    var reader = new ZXing.BrowserMultiFormatReader();
    reader.decodeFromImageElement(img).then(function (result) {
      URL.revokeObjectURL(url);
      if (!document.getElementById('vin-modal')) openVinConfirm(result.getText());
      else considerVin(result.getText());
    }).catch(function () {
      URL.revokeObjectURL(url);
      setVinStatus('No VIN barcode was found in that photo. Type the 17 characters. The photo was not uploaded.');
    });
  };
  img.onerror = function () {
    URL.revokeObjectURL(url);
    setVinStatus('That photo could not be read. Type the VIN.');
  };
  img.src = url;
}

function stopVinVideo() {
  var video = document.getElementById('vin-video');
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(function (track) { track.stop(); });
    video.srcObject = null;
  }
}

function closeVinScanner() {
  if (vinReader) {
    try { vinReader.reset(); } catch (err) { /* already stopped */ }
    vinReader = null;
  }
  stopVinVideo();
  var modal = document.getElementById('vin-modal');
  if (modal) modal.remove();
}

function lookupVin(vin) {
  if (!window.WrgVin || !WrgVin.isValidVin(vin)) return;
  if (navigator && navigator.onLine === false) {
    showToast('VIN saved on the form. Lookup needs a connection. Oil, brakes, and wipers stay blank.');
    return;
  }
  fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' + encodeURIComponent(vin) + '?format=json')
    .then(function (res) {
      if (!res.ok) throw new Error('lookup failed');
      return res.json();
    })
    .then(function (payload) {
      var fields = WrgVin.pickNhtsaFields(payload);
      var filled = [];
      Object.keys(fields).forEach(function (key) {
        var el = document.getElementById('veh-' + key);
        if (el && !String(el.value || '').trim()) {
          el.value = fields[key];
          filled.push(key);
        }
      });
      if (!filled.length) showToast('VIN kept. NHTSA did not add year, make, model, engine, or transmission. Other specs stay blank.');
      else showToast('Filled ' + filled.join(', ') + ' from NHTSA. Oil, brakes, and wipers were not looked up.');
    })
    .catch(function () {
      showToast('VIN kept. The vehicle lookup did not respond. Enter details yourself. Oil, brakes, and wipers are never guessed.');
    });
}

function applyEmptyDecodedFields(fields) {
  var filled = [];
  Object.keys(fields || {}).forEach(function (key) {
    var el = document.getElementById('veh-' + key);
    if (el && !String(el.value || '').trim() && fields[key]) {
      el.value = fields[key];
      filled.push(key);
    }
  });
  return filled;
}
