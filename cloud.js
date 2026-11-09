/* Shop cloud IO. The browser uses the public anon key and a sessionStorage auth key.
   Writes require a signed-in garage member. Offline use is read-only. */
(function () {
  var CACHE_KEY = 'wrg-readonly-cache';
  var client = null;
  var shadow = null;
  var signedIn = false;
  var member = false;
  var online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  var readOnly = false;
  var channel = null;
  var refreshTimer = null;
  var loading = false;
  var saving = false;

  function config() {
    return window.WRG_CONFIG || {};
  }

  function libraryReady() {
    return typeof supabase !== 'undefined' && supabase.createClient;
  }

  function isConfigured() {
    return WrgSync.configured(config()) && libraryReady();
  }

  function status() {
    return {
      configured: isConfigured(),
      signedIn: signedIn,
      member: member,
      online: online,
      readOnly: readOnly || !online,
      loading: loading
    };
  }

  function setOnline(next) {
    online = next;
    readOnly = !next;
    if (window.setSyncStatus) window.setSyncStatus(status());
  }

  function ensureClient() {
    if (!isConfigured()) return null;
    if (client) return client;
    client = supabase.createClient(config().supabaseUrl, config().supabaseAnonKey, {
      auth: {
        storage: window.sessionStorage,
        storageKey: 'wrg-auth-session',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    return client;
  }

  function mapSettings(row) {
    if (!row) return Object.assign({ version: 0 }, window.DEFAULT_SETTINGS || {});
    return {
      businessName: row.business_name,
      ownerName: row.owner_name,
      address: row.address || '',
      phone: row.phone || '',
      email: row.email || '',
      laborRate: Number(row.labor_rate),
      laborCostRate: Number(row.labor_cost_rate),
      taxRate: Number(row.tax_rate),
      partsMarkup: Number(row.parts_markup),
      terms: row.terms || '',
      version: row.version || 1
    };
  }

  function settingsPayload(row) {
    return {
      business_name: row.businessName,
      owner_name: row.ownerName,
      address: row.address || '',
      phone: row.phone || '',
      email: row.email || '',
      labor_rate: Number(row.laborRate),
      labor_cost_rate: Number(row.laborCostRate),
      tax_rate: Number(row.taxRate),
      parts_markup: Number(row.partsMarkup),
      terms: row.terms || ''
    };
  }

  function textValue(value) {
    return value == null ? '' : String(value);
  }

  function mapVehicle(vehicle) {
    return {
      id: vehicle.id,
      version: vehicle.version || 1,
      legacyId: vehicle.legacy_id,
      customerId: vehicle.customer_id,
      year: textValue(vehicle.year),
      make: textValue(vehicle.make),
      model: textValue(vehicle.model),
      trim: textValue(vehicle.trim),
      plate: textValue(vehicle.plate),
      vin: textValue(vehicle.vin),
      odometer: textValue(vehicle.odometer),
      engineType: textValue(vehicle.engine_type),
      engineDisplacement: textValue(vehicle.engine_displacement),
      fuel: textValue(vehicle.fuel),
      transmissionType: textValue(vehicle.transmission_type),
      transmissionSpec: textValue(vehicle.transmission_spec),
      oilType: textValue(vehicle.oil_type),
      oilGrade: textValue(vehicle.oil_grade),
      oilSpec: textValue(vehicle.oil_spec),
      oilCapacity: textValue(vehicle.oil_capacity),
      oilFilter: textValue(vehicle.oil_filter),
      frontBrake: textValue(vehicle.front_brake),
      frontBrakeNotes: textValue(vehicle.front_brake_notes),
      rearBrake: textValue(vehicle.rear_brake),
      rearBrakeNotes: textValue(vehicle.rear_brake_notes),
      wiperLeft: textValue(vehicle.wiper_left),
      wiperRight: textValue(vehicle.wiper_right),
      wiperRear: textValue(vehicle.wiper_rear)
    };
  }

  function vehiclePayload(row) {
    return {
      id: row.id,
      legacy_id: row.legacyId || null,
      customer_id: row.customerId,
      year: textValue(row.year),
      make: textValue(row.make),
      model: textValue(row.model),
      trim: textValue(row.trim),
      plate: textValue(row.plate),
      vin: textValue(row.vin),
      odometer: textValue(row.odometer),
      engine_type: textValue(row.engineType),
      engine_displacement: textValue(row.engineDisplacement),
      fuel: textValue(row.fuel),
      transmission_type: textValue(row.transmissionType),
      transmission_spec: textValue(row.transmissionSpec),
      oil_type: textValue(row.oilType),
      oil_grade: textValue(row.oilGrade),
      oil_spec: textValue(row.oilSpec),
      oil_capacity: textValue(row.oilCapacity),
      oil_filter: textValue(row.oilFilter),
      front_brake: textValue(row.frontBrake),
      front_brake_notes: textValue(row.frontBrakeNotes),
      rear_brake: textValue(row.rearBrake),
      rear_brake_notes: textValue(row.rearBrakeNotes),
      wiper_left: textValue(row.wiperLeft),
      wiper_right: textValue(row.wiperRight),
      wiper_rear: textValue(row.wiperRear)
    };
  }

  function dateOnly(value) {
    return value ? String(value).slice(0, 10) : '';
  }

  function attachPhotos(doc, photos) {
    doc.photos = photos
      .filter(function (photo) { return photo.doc_id === doc.id; })
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
      .map(function (photo) {
        return {
          id: photo.id,
          version: photo.version || 1,
          caption: photo.caption || '',
          type: photo.photo_type === 'after' ? 'after' : 'before',
          storagePath: photo.storage_path,
          signedUrl: '',
          dataUrl: ''
        };
      });
    return doc;
  }

  function mapDocument(row, kind) {
    return {
      id: row.id,
      version: row.version || 1,
      legacyId: row.legacy_id,
      number: row.number,
      date: dateOnly(row.doc_date),
      status: row.status,
      customerId: row.customer_id,
      customerName: row.customer_name || '',
      customerPhone: row.customer_phone || '',
      customerEmail: row.customer_email || '',
      customerAddress: row.customer_address || '',
      vehicleId: row.vehicle_id,
      vehicleDesc: row.vehicle_desc || '',
      vehiclePlate: row.vehicle_plate || '',
      vehicleVin: row.vehicle_vin || '',
      vehicleTrim: row.vehicle_trim || '',
      vehicleOdometer: row.vehicle_odometer || '',
      vehicleSpecs: row.vehicle_specs && typeof row.vehicle_specs === 'object' ? row.vehicle_specs : {},
      taxRate: Number(row.tax_rate),
      notes: row.notes || '',
      workPerformed: row.work_performed || '',
      items: Array.isArray(row.items) ? row.items : [],
      photos: [],
      quoteId: kind === 'invoice' ? row.quote_id : undefined,
      paidDate: kind === 'invoice' ? dateOnly(row.paid_date) : undefined
    };
  }

  function documentPayload(row) {
    return {
      id: row.id,
      legacy_id: row.legacyId || null,
      number: row.number,
      doc_date: row.date || null,
      status: row.status || 'draft',
      customer_id: row.customerId || null,
      customer_name: row.customerName || '',
      customer_phone: row.customerPhone || '',
      customer_email: row.customerEmail || '',
      customer_address: row.customerAddress || '',
      vehicle_id: row.vehicleId || null,
      vehicle_desc: row.vehicleDesc || '',
      vehicle_plate: row.vehiclePlate || '',
      vehicle_vin: row.vehicleVin || '',
      vehicle_trim: row.vehicleTrim || '',
      vehicle_odometer: row.vehicleOdometer || '',
      vehicle_specs: row.vehicleSpecs && typeof row.vehicleSpecs === 'object' ? row.vehicleSpecs : {},
      tax_rate: Number(row.taxRate) || 0,
      notes: row.notes || '',
      work_performed: row.workPerformed || '',
      items: row.items || []
    };
  }

  async function signPaths(state) {
    var paths = [];
    function collect(docs) {
      (docs || []).forEach(function (doc) {
        (doc.photos || []).forEach(function (photo) {
          if (photo.storagePath) paths.push(photo.storagePath);
        });
      });
    }
    collect(state.quotes);
    collect(state.invoices);
    if (!paths.length) return state;
    var signed = await client.storage.from('wrg-photos').createSignedUrls(paths, 60 * 60);
    var byPath = {};
    ((signed && signed.data) || []).forEach(function (item) {
      if (item && item.path && item.signedUrl) byPath[item.path] = item.signedUrl;
    });
    function apply(docs) {
      (docs || []).forEach(function (doc) {
        (doc.photos || []).forEach(function (photo) {
          if (photo.storagePath && byPath[photo.storagePath]) photo.signedUrl = byPath[photo.storagePath];
        });
      });
    }
    apply(state.quotes);
    apply(state.invoices);
    return state;
  }

  async function fetchState() {
    var results = await Promise.all([
      client.from('wrg_settings').select('*').eq('id', 1).maybeSingle(),
      client.from('wrg_customers').select('*').order('name'),
      client.from('wrg_vehicles').select('*'),
      client.from('wrg_quotes').select('*'),
      client.from('wrg_invoices').select('*'),
      client.from('wrg_time_entries').select('*'),
      client.from('wrg_photos').select('*')
    ]);
    results.forEach(function (result) {
      if (result.error) throw result.error;
    });
    var photos = results[6].data || [];
    var customers = (results[1].data || []).map(function (row) {
      return {
        id: row.id,
        version: row.version || 1,
        legacyId: row.legacy_id,
        name: row.name || '',
        phone: row.phone || '',
        email: row.email || '',
        address: row.address || '',
        vehicles: (results[2].data || []).filter(function (vehicle) {
          return vehicle.customer_id === row.id;
        }).map(mapVehicle)
      };
    });
    var quotes = (results[3].data || []).map(function (row) {
      return attachPhotos(mapDocument(row, 'quote'), photos.filter(function (photo) { return photo.doc_kind === 'quote'; }));
    });
    var invoices = (results[4].data || []).map(function (row) {
      return attachPhotos(mapDocument(row, 'invoice'), photos.filter(function (photo) { return photo.doc_kind === 'invoice'; }));
    });
    var timeEntries = (results[5].data || []).map(function (row) {
      return {
        id: row.id,
        version: row.version || 1,
        legacyId: row.legacy_id,
        date: dateOnly(row.entry_date),
        hours: Number(row.hours),
        description: row.description || '',
        jobNumber: row.job_number || '',
        rate: Number(row.rate)
      };
    });
    var state = {
      settings: mapSettings(results[0].data),
      customers: customers,
      quotes: quotes,
      invoices: invoices,
      timeEntries: timeEntries
    };
    return signPaths(state);
  }

  function remember(next) {
    shadow = WrgSync.clone(next);
    try {
      var cacheable = WrgSync.clone(next);
      [cacheable.quotes, cacheable.invoices].forEach(function (docs) {
        (docs || []).forEach(function (doc) {
          (doc.photos || []).forEach(function (photo) {
            photo.dataUrl = '';
            photo.signedUrl = '';
          });
        });
      });
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheable));
    } catch (err) { /* cache is optional */ }
  }

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function adopt(next, conflicts) {
    remember(next);
    if (window.adoptShopState) window.adoptShopState(next, conflicts || []);
  }

  async function load() {
    loading = true;
    if (window.setSyncStatus) window.setSyncStatus(status());
    var next = await fetchState();
    loading = false;
    adopt(next, []);
    listen();
    if (window.setSyncStatus) window.setSyncStatus(status());
    return next;
  }

  function listen() {
    if (!client || channel) return;
    var tables = ['wrg_settings', 'wrg_customers', 'wrg_vehicles', 'wrg_quotes', 'wrg_invoices', 'wrg_time_entries', 'wrg_photos'];
    channel = client.channel('wrg-shop');
    tables.forEach(function (table) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: table }, function () {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 400);
      });
    });
    channel.subscribe();
  }

  async function refresh() {
    if (!online || !client || saving) return;
    try {
      var remote = await fetchState();
      var dirty = window.shopDirtyIds ? window.shopDirtyIds() : [];
      var dirtySet = {};
      dirty.forEach(function (id) { dirtySet[String(id)] = true; });
      var current = window.shopState ? window.shopState() : shadow;
      if (!current || !dirty.length) {
        adopt(remote, []);
        return;
      }
      var conflicts = [];
      function pick(localRows, remoteRows) {
        var merged = WrgSync.mergeRemote(localRows, remoteRows, dirty);
        conflicts = conflicts.concat(merged.conflicts);
        return merged.rows;
      }
      var customers = pick(current.customers, remote.customers);
      var remoteVehicles = WrgSync.flattenVehicles(remote);
      var localVehicles = WrgSync.flattenVehicles(current);
      var vehicles = WrgSync.mergeRemote(localVehicles, remoteVehicles, dirty);
      conflicts = conflicts.concat(vehicles.conflicts);
      customers.forEach(function (customer) {
        if (dirtySet[String(customer.id)]) return;
        customer.vehicles = vehicles.rows.filter(function (vehicle) {
          return String(vehicle.customerId) === String(customer.id);
        });
      });
      var next = {
        settings: dirtySet['1'] ? current.settings : remote.settings,
        customers: customers,
        quotes: pick(current.quotes, remote.quotes),
        invoices: pick(current.invoices, remote.invoices),
        timeEntries: pick(current.timeEntries, remote.timeEntries)
      };
      shadow = WrgSync.clone(remote);
      if (window.adoptShopState) window.adoptShopState(next, conflicts);
    } catch (err) {
      setOnline(false);
    }
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl).split(',');
    var binary = atob(parts[1] || '');
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: 'image/jpeg' });
  }

  function clearPhotoData(state, photoId, path) {
    [state.quotes, state.invoices].forEach(function (docs) {
      (docs || []).forEach(function (doc) {
        (doc.photos || []).forEach(function (photo) {
          if (String(photo.id) === String(photoId)) {
            photo.storagePath = path;
            photo.dataUrl = '';
          }
        });
      });
    });
  }

  async function applyOp(op, state) {
    if (op.table === 'wrg_photos' && op.op !== 'delete') {
      var photo = op.row;
      if (photo.dataUrl && !photo.storagePath) {
        var path = photo.docKind + '/' + photo.docId + '/' + photo.id + '.jpg';
        var uploaded = await client.storage.from('wrg-photos').upload(path, dataUrlToBlob(photo.dataUrl), {
          contentType: 'image/jpeg',
          upsert: false
        });
        if (uploaded.error) return { ok: false, message: 'A photo could not be stored in the private shop bucket.' };
        photo.storagePath = path;
        clearPhotoData(state, photo.id, path);
      }
      var photoRow = {
        id: photo.id,
        doc_kind: photo.docKind,
        doc_id: photo.docId,
        storage_path: photo.storagePath,
        caption: photo.caption || '',
        photo_type: photo.type === 'after' ? 'after' : 'before',
        sort_order: photo.sortOrder || 0
      };
      return writeRow('wrg_photos', op.op, photo.id, op.expectedVersion, photoRow);
    }
    if (op.table === 'wrg_settings') {
      return writeRow('wrg_settings', 'update', 1, op.expectedVersion, settingsPayload(op.row));
    }
    if (op.table === 'wrg_customers') {
      return writeRow('wrg_customers', op.op, op.id || op.row.id, op.expectedVersion, {
        id: op.row.id,
        legacy_id: op.row.legacyId || null,
        name: op.row.name || '',
        phone: op.row.phone || '',
        email: op.row.email || '',
        address: op.row.address || ''
      });
    }
    if (op.table === 'wrg_vehicles') {
      return writeRow('wrg_vehicles', op.op, op.id || op.row.id, op.expectedVersion, vehiclePayload(op.row));
    }
    if (op.table === 'wrg_quotes' || op.table === 'wrg_invoices') {
      var payload = documentPayload(op.row);
      if (op.table === 'wrg_invoices') {
        payload.quote_id = op.row.quoteId || null;
        payload.paid_date = op.row.paidDate || null;
      }
      return writeRow(op.table, op.op, op.id || op.row.id, op.expectedVersion, payload);
    }
    if (op.table === 'wrg_time_entries') {
      return writeRow('wrg_time_entries', op.op, op.id || op.row.id, op.expectedVersion, {
        id: op.row.id,
        legacy_id: op.row.legacyId || null,
        entry_date: op.row.date,
        hours: Number(op.row.hours) || 0,
        description: op.row.description || '',
        job_number: op.row.jobNumber || '',
        rate: Number(op.row.rate) || 0
      });
    }
    return { ok: false, message: 'Unknown shop record.' };
  }

  async function writeRow(table, op, id, expectedVersion, payload) {
    if (op === 'delete') {
      var removed = await client.from(table).delete().eq('id', id).eq('version', expectedVersion).select('id');
      if (removed.error) return { ok: false, message: removed.error.message };
      if (!removed.data || !removed.data.length) {
        return { ok: false, conflict: true, id: id, table: table, message: 'Another phone changed this record first. It was not deleted.' };
      }
      return { ok: true };
    }
    if (op === 'insert') {
      var inserted = await client.from(table).insert(payload).select('id, version').single();
      if (inserted.error) {
        if (inserted.error.code === '23505') {
          return { ok: false, conflict: true, id: id, table: table, message: 'That job number was just used on another phone. It was not overwritten.' };
        }
        return { ok: false, message: inserted.error.message };
      }
      return { ok: true, version: inserted.data.version };
    }
    var updated = await client.from(table).update(payload).eq('id', id).eq('version', expectedVersion).select('id, version');
    if (updated.error) return { ok: false, message: updated.error.message };
    if (!updated.data || !updated.data.length) {
      return { ok: false, conflict: true, id: id, table: table, message: 'Another phone saved this record first. Your copy was not written over it.' };
    }
    return { ok: true, version: updated.data[0].version };
  }

  async function persist(state) {
    var gate = WrgSync.canWrite(status());
    if (!gate.ok) return gate;
    if (!shadow) return { ok: false, message: 'Shop records are still loading.' };
    saving = true;
    try {
      var ops = WrgSync.planPersist(state, shadow);
      if (!ops.length) return { ok: true };
      var conflicts = [];
      for (var i = 0; i < ops.length; i++) {
        var result = await applyOp(ops[i], state);
        if (!result.ok) {
          if (result.conflict) conflicts.push(result);
          else return result;
        }
      }
      if (conflicts.length) {
        saving = false;
        await refresh();
        return {
          ok: false,
          conflict: true,
          conflicts: conflicts,
          message: conflicts[0].message
        };
      }
      await load();
      return { ok: true };
    } finally {
      saving = false;
    }
  }

  async function signIn(pin) {
    var sb = ensureClient();
    if (!sb) return { ok: false, message: 'Shop cloud is not configured yet.' };
    var password = WrgSync.accessPassword(pin, config().accessPrefix);
    var email = config().shopEmail || WrgSync.SHOP_EMAIL;
    var signed = await sb.auth.signInWithPassword({ email: email, password: password });
    password = '';
    if (signed.error) {
      var text = signed.error.message || '';
      if (/network|fetch|Failed to fetch/i.test(text)) {
        return { ok: false, message: 'Can’t reach the shop cloud. Check the connection and try again.' };
      }
      return { ok: false, message: 'Incorrect PIN' };
    }
    var userId = signed.data.user && signed.data.user.id;
    var membership = await sb.from('wrg_members').select('user_id').eq('user_id', userId).maybeSingle();
    if (membership.error || !membership.data) {
      await sb.auth.signOut();
      signedIn = false;
      member = false;
      return { ok: false, message: 'This sign-in is not on the garage membership list. Maintenance and timekeeping accounts are not given access.' };
    }
    signedIn = true;
    member = true;
    readOnly = false;
    return { ok: true };
  }

  async function signOut() {
    if (client) await client.auth.signOut();
    signedIn = false;
    member = false;
    shadow = null;
    try { sessionStorage.removeItem(CACHE_KEY); } catch (err) { /* ignore */ }
  }

  async function restoreSession() {
    if (!isConfigured()) return { ok: false, unconfigured: true };
    if (navigator && navigator.onLine === false) {
      setOnline(false);
      var cached = readCache();
      var hasAuth = false;
      try { hasAuth = !!sessionStorage.getItem('wrg-auth-session'); } catch (err) { hasAuth = false; }
      if (hasAuth && cached) {
        signedIn = true;
        member = true;
        readOnly = true;
        adopt(cached, []);
        return { ok: true, offline: true };
      }
      return { ok: false, offline: true, message: 'Sign-in needs a connection.' };
    }
    var sb = ensureClient();
    var existing = await sb.auth.getSession();
    if (!existing.data.session) return { ok: false };
    var userId = existing.data.session.user.id;
    var membership = await sb.from('wrg_members').select('user_id').eq('user_id', userId).maybeSingle();
    if (membership.error || !membership.data) {
      await sb.auth.signOut();
      return { ok: false, message: 'This sign-in is not on the garage membership list.' };
    }
    signedIn = true;
    member = true;
    return { ok: true };
  }

  async function importPlan(localPayload) {
    var gate = WrgSync.canWrite(status());
    if (!gate.ok) return gate;
    return { ok: true, plan: WrgSync.planDeviceImport(localPayload, shadow || { customers: [], quotes: [], invoices: [], timeEntries: [] }) };
  }

  window.addEventListener('online', function () {
    setOnline(true);
    if (signedIn) refresh();
  });
  window.addEventListener('offline', function () { setOnline(false); });

  window.WrgCloud = {
    status: status,
    isConfigured: isConfigured,
    signIn: signIn,
    signOut: signOut,
    restoreSession: restoreSession,
    load: load,
    persist: persist,
    importPlan: importPlan,
    shadow: function () { return shadow; },
    libraryReady: libraryReady
  };
})();
