/* Pure shop-sync rules. No network, no PIN, and no password value. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WrgSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var SHOP_EMAIL = 'wrg-shop@garage.example';
  var ACCESS_PREFIX = 'wrg-access-';

  function sameId(a, b) {
    return a != null && b != null && String(a) === String(b);
  }

  function configured(config) {
    return !!(config && String(config.supabaseUrl || '').trim() && String(config.supabaseAnonKey || '').trim());
  }

  function accessPassword(pin, prefix) {
    return String(prefix == null ? ACCESS_PREFIX : prefix) + String(pin == null ? '' : pin);
  }

  function canWrite(status) {
    status = status || {};
    if (!status.configured) {
      return {
        ok: false,
        code: 'unconfigured',
        message: 'Shop cloud is not configured yet. Add the public anon key and finish wrg-setup.sql before records can sync.'
      };
    }
    if (!status.signedIn || !status.member) {
      return {
        ok: false,
        code: 'signed-out',
        message: 'Sign in with the shop PIN before saving. The shared desk is only open to the garage membership.'
      };
    }
    if (!status.online || status.readOnly) {
      return {
        ok: false,
        code: 'offline',
        message: 'Offline. This phone can view the last loaded shop records but will not save until the connection returns.'
      };
    }
    return { ok: true };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).sort().forEach(function (key) { out[key] = stable(value[key]); });
      return out;
    }
    return value;
  }

  function stableString(value) {
    return JSON.stringify(stable(value));
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function itemsFingerprint(items) {
    return (items || []).map(function (item) {
      return {
        type: item.type || 'labor',
        description: text(item.description),
        qty: num(item.qty != null ? item.qty : item.hours),
        unitCost: num(item.unitCost),
        unitPrice: num(item.unitPrice),
        priceManual: !!item.priceManual
      };
    });
  }

  function photosFingerprint(photos) {
    return (photos || []).map(function (photo) {
      return {
        id: text(photo.id),
        caption: text(photo.caption),
        type: photo.type === 'after' ? 'after' : 'before',
        storagePath: text(photo.storagePath),
        pending: !!photo.dataUrl && !photo.storagePath
      };
    });
  }

  function customerFingerprint(row) {
    return stableString({
      name: text(row.name),
      phone: text(row.phone),
      email: text(row.email),
      address: text(row.address)
    });
  }

  function vehicleFingerprint(row) {
    return stableString({
      customerId: text(row.customerId),
      year: text(row.year),
      make: text(row.make),
      model: text(row.model),
      trim: text(row.trim),
      plate: text(row.plate),
      vin: text(row.vin),
      odometer: text(row.odometer),
      engineType: text(row.engineType),
      engineDisplacement: text(row.engineDisplacement),
      fuel: text(row.fuel),
      transmissionType: text(row.transmissionType),
      transmissionSpec: text(row.transmissionSpec),
      oilType: text(row.oilType),
      oilGrade: text(row.oilGrade),
      oilSpec: text(row.oilSpec),
      oilCapacity: text(row.oilCapacity),
      oilFilter: text(row.oilFilter),
      frontBrake: text(row.frontBrake),
      frontBrakeNotes: text(row.frontBrakeNotes),
      rearBrake: text(row.rearBrake),
      rearBrakeNotes: text(row.rearBrakeNotes),
      wiperLeft: text(row.wiperLeft),
      wiperRight: text(row.wiperRight),
      wiperRear: text(row.wiperRear)
    });
  }

  function documentFingerprint(row) {
    return stableString({
      number: text(row.number),
      date: text(row.date).slice(0, 10),
      status: text(row.status),
      customerId: text(row.customerId || ''),
      customerName: text(row.customerName),
      customerPhone: text(row.customerPhone),
      customerEmail: text(row.customerEmail),
      customerAddress: text(row.customerAddress),
      vehicleId: text(row.vehicleId || ''),
      vehicleDesc: text(row.vehicleDesc),
      vehiclePlate: text(row.vehiclePlate),
      vehicleVin: text(row.vehicleVin),
      vehicleTrim: text(row.vehicleTrim),
      vehicleOdometer: text(row.vehicleOdometer),
      vehicleSpecs: stable(row.vehicleSpecs || {}),
      taxRate: num(row.taxRate),
      notes: text(row.notes),
      workPerformed: text(row.workPerformed),
      quoteId: text(row.quoteId || ''),
      paidDate: text(row.paidDate || ''),
      items: itemsFingerprint(row.items),
      photos: photosFingerprint(row.photos)
    });
  }

  function timeFingerprint(row) {
    return stableString({
      date: text(row.date).slice(0, 10),
      hours: num(row.hours),
      description: text(row.description),
      jobNumber: text(row.jobNumber),
      rate: num(row.rate)
    });
  }

  function settingsFingerprint(row) {
    return stableString({
      businessName: text(row.businessName),
      ownerName: text(row.ownerName),
      address: text(row.address),
      phone: text(row.phone),
      email: text(row.email),
      laborRate: num(row.laborRate),
      laborCostRate: num(row.laborCostRate),
      taxRate: num(row.taxRate),
      partsMarkup: num(row.partsMarkup),
      terms: text(row.terms)
    });
  }

  function indexById(list) {
    var map = {};
    (list || []).forEach(function (row) {
      if (row && row.id != null) map[String(row.id)] = row;
    });
    return map;
  }

  function flattenVehicles(state) {
    var out = [];
    (state.customers || []).forEach(function (customer) {
      (customer.vehicles || []).forEach(function (vehicle) {
        out.push({
          id: vehicle.id,
          version: vehicle.version || 0,
          customerId: vehicle.customerId || customer.id,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          plate: vehicle.plate,
          vin: vehicle.vin,
          legacyId: vehicle.legacyId
        });
      });
    });
    return out;
  }

  function flattenPhotos(docs, kind) {
    var out = [];
    (docs || []).forEach(function (doc) {
      (doc.photos || []).forEach(function (photo, index) {
        out.push({
          id: photo.id,
          version: photo.version || 0,
          docKind: kind,
          docId: doc.id,
          caption: photo.caption || '',
          type: photo.type === 'after' ? 'after' : 'before',
          storagePath: photo.storagePath || '',
          dataUrl: photo.dataUrl || '',
          sortOrder: index
        });
      });
    });
    return out;
  }

  function diffList(current, previous, fingerprint) {
    var now = indexById(current);
    var then = indexById(previous);
    var inserts = [];
    var updates = [];
    var deletes = [];
    Object.keys(now).forEach(function (id) {
      if (!then[id]) inserts.push(now[id]);
      else if (fingerprint(now[id]) !== fingerprint(then[id])) {
        updates.push({ row: now[id], expectedVersion: then[id].version || 0 });
      }
    });
    Object.keys(then).forEach(function (id) {
      if (!now[id]) deletes.push({ id: then[id].id, expectedVersion: then[id].version || 0 });
    });
    return { inserts: inserts, updates: updates, deletes: deletes };
  }

  function planPersist(current, shadow) {
    current = current || {};
    shadow = shadow || { settings: {}, customers: [], quotes: [], invoices: [], timeEntries: [] };
    var ops = [];
    function pushRows(table, diff, toRow) {
      diff.inserts.forEach(function (row) {
        ops.push({ op: 'insert', table: table, row: toRow(row), id: row.id });
      });
      diff.updates.forEach(function (entry) {
        ops.push({
          op: 'update',
          table: table,
          id: entry.row.id,
          expectedVersion: entry.expectedVersion,
          row: toRow(entry.row)
        });
      });
    }
    function pushDeletes(table, diff) {
      diff.deletes.forEach(function (entry) {
        ops.push({ op: 'delete', table: table, id: entry.id, expectedVersion: entry.expectedVersion });
      });
    }

    if (settingsFingerprint(current.settings || {}) !== settingsFingerprint(shadow.settings || {})) {
      ops.push({
        op: 'update',
        table: 'wrg_settings',
        id: 1,
        expectedVersion: (shadow.settings && shadow.settings.version) || 0,
        row: current.settings || {}
      });
    }

    var customerDiff = diffList(current.customers, shadow.customers, customerFingerprint);
    pushRows('wrg_customers', customerDiff, function (row) { return row; });
    var vehicleDiff = diffList(flattenVehicles(current), flattenVehicles(shadow), vehicleFingerprint);
    pushRows('wrg_vehicles', vehicleDiff, function (row) { return row; });
    var quoteDiff = diffList(current.quotes, shadow.quotes, documentFingerprint);
    pushRows('wrg_quotes', quoteDiff, function (row) { return row; });
    var invoiceDiff = diffList(current.invoices, shadow.invoices, documentFingerprint);
    pushRows('wrg_invoices', invoiceDiff, function (row) { return row; });
    var timeDiff = diffList(current.timeEntries, shadow.timeEntries, timeFingerprint);
    pushRows('wrg_time_entries', timeDiff, function (row) { return row; });
    var photoDiff = diffList(
      flattenPhotos(current.quotes, 'quote').concat(flattenPhotos(current.invoices, 'invoice')),
      flattenPhotos(shadow.quotes, 'quote').concat(flattenPhotos(shadow.invoices, 'invoice')),
      function (photo) {
        return stableString({
          docKind: photo.docKind,
          docId: text(photo.docId),
          caption: text(photo.caption),
          type: photo.type,
          storagePath: text(photo.storagePath),
          pending: !!photo.dataUrl && !photo.storagePath,
          sortOrder: photo.sortOrder
        });
      }
    );
    pushRows('wrg_photos', photoDiff, function (row) { return row; });

    pushDeletes('wrg_photos', photoDiff);
    pushDeletes('wrg_time_entries', timeDiff);
    pushDeletes('wrg_invoices', invoiceDiff);
    pushDeletes('wrg_quotes', quoteDiff);
    pushDeletes('wrg_vehicles', vehicleDiff);
    pushDeletes('wrg_customers', customerDiff);
    return ops;
  }

  function applyVersionedUpdate(store, id, expectedVersion, patch) {
    var key = String(id);
    var row = store[key];
    if (!row || row.version !== expectedVersion) return { conflict: true, server: row || null };
    var next = {};
    Object.keys(row).forEach(function (name) { next[name] = row[name]; });
    Object.keys(patch || {}).forEach(function (name) { next[name] = patch[name]; });
    next.version = row.version + 1;
    store[key] = next;
    return { conflict: false, row: next };
  }

  function mergeRemote(localRows, remoteRows, dirtyIds) {
    var dirty = {};
    (dirtyIds || []).forEach(function (id) { dirty[String(id)] = true; });
    var local = indexById(localRows);
    var remote = indexById(remoteRows);
    var rows = [];
    var conflicts = [];
    Object.keys(remote).forEach(function (id) {
      var localRow = local[id];
      var remoteRow = remote[id];
      if (dirty[id] && localRow && (localRow.version || 0) !== (remoteRow.version || 0)) {
        rows.push(localRow);
        conflicts.push({
          id: localRow.id,
          localVersion: localRow.version || 0,
          serverVersion: remoteRow.version || 0,
          server: remoteRow
        });
      } else if (dirty[id] && localRow) {
        rows.push(localRow);
      } else {
        rows.push(remoteRow);
      }
    });
    Object.keys(local).forEach(function (id) {
      if (!remote[id] && dirty[id]) rows.push(local[id]);
    });
    return { rows: rows, conflicts: conflicts };
  }

  function digits(value) {
    return text(value).replace(/\D/g, '');
  }

  function customerKey(row) {
    return text(row.name).trim().toLowerCase() + '|' + digits(row.phone);
  }

  function vehicleKey(row) {
    return [row.year, row.make, row.model, row.plate].map(function (part) {
      return text(part).trim().toLowerCase();
    }).join('|');
  }

  function planDeviceImport(localPayload, cloudState) {
    var skipped = [];
    var customers = [];
    var vehicles = [];
    var quotes = [];
    var invoices = [];
    var timeEntries = [];
    var customerMap = {};
    var quoteMap = {};
    var cloudCustomers = (cloudState && cloudState.customers) || [];
    var cloudQuotes = (cloudState && cloudState.quotes) || [];
    var cloudInvoices = (cloudState && cloudState.invoices) || [];
    var cloudTime = (cloudState && cloudState.timeEntries) || [];
    var customersByKey = {};
    cloudCustomers.forEach(function (customer) { customersByKey[customerKey(customer)] = customer; });
    var quoteNumbers = {};
    var invoiceNumbers = {};
    cloudQuotes.forEach(function (quote) { quoteNumbers[text(quote.number)] = true; });
    cloudInvoices.forEach(function (invoice) { invoiceNumbers[text(invoice.number)] = true; });

    (localPayload.customers || []).forEach(function (source) {
      var existing = customersByKey[customerKey(source)];
      if (existing) {
        customerMap[String(source.id)] = existing.id;
        skipped.push({ kind: 'customer', name: source.name, reason: 'already in the shop' });
        (source.vehicles || []).forEach(function (vehicle) {
          var owned = existing.vehicles || [];
          var duplicate = owned.some(function (row) { return vehicleKey(row) === vehicleKey(vehicle); });
          if (duplicate) {
            skipped.push({ kind: 'vehicle', name: vehicleKey(vehicle), reason: 'already on that customer' });
            return;
          }
          vehicles.push({
            source: vehicle,
            customerId: existing.id
          });
        });
        return;
      }
      customers.push(source);
      customerMap[String(source.id)] = null;
    });

    (localPayload.quotes || []).forEach(function (quote) {
      if (quoteNumbers[text(quote.number)]) {
        skipped.push({ kind: 'quote', number: quote.number, reason: 'job number already in the shop' });
        return;
      }
      quotes.push(quote);
      quoteNumbers[text(quote.number)] = true;
    });
    (localPayload.invoices || []).forEach(function (invoice) {
      if (invoiceNumbers[text(invoice.number)]) {
        skipped.push({ kind: 'invoice', number: invoice.number, reason: 'job number already in the shop' });
        return;
      }
      invoices.push(invoice);
      invoiceNumbers[text(invoice.number)] = true;
    });
    (localPayload.timeEntries || []).forEach(function (entry) {
      var duplicate = cloudTime.some(function (row) { return timeFingerprint(row) === timeFingerprint(entry); });
      if (duplicate) {
        skipped.push({ kind: 'time', reason: 'matching time entry already in the shop' });
        return;
      }
      timeEntries.push(entry);
    });

    return {
      customers: customers,
      vehicles: vehicles,
      quotes: quotes,
      invoices: invoices,
      timeEntries: timeEntries,
      customerMap: customerMap,
      quoteMap: quoteMap,
      skipped: skipped,
      deletes: []
    };
  }

  return {
    SHOP_EMAIL: SHOP_EMAIL,
    ACCESS_PREFIX: ACCESS_PREFIX,
    sameId: sameId,
    configured: configured,
    accessPassword: accessPassword,
    canWrite: canWrite,
    clone: clone,
    customerFingerprint: customerFingerprint,
    documentFingerprint: documentFingerprint,
    settingsFingerprint: settingsFingerprint,
    planPersist: planPersist,
    applyVersionedUpdate: applyVersionedUpdate,
    mergeRemote: mergeRemote,
    planDeviceImport: planDeviceImport,
    flattenVehicles: flattenVehicles
  };
});
