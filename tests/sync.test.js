const assert = require('assert');
const sync = require('../sync-model.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('ok', name);
}

const base = {
  settings: { businessName: 'Will Ruby’s Garage', ownerName: 'Will', address: '', phone: '', email: 'a@b.c', laborRate: 120, laborCostRate: 40, taxRate: 6, partsMarkup: 40, terms: 'Due', version: 1 },
  customers: [],
  quotes: [],
  invoices: [],
  timeEntries: []
};

test('password is derived from the typed PIN and is not a stored PIN', () => {
  assert.strictEqual(sync.accessPassword('1995', 'wrg-access-'), 'wrg-access-1995');
  assert.strictEqual(sync.accessPassword('2001'), 'wrg-access-2001');
  assert.ok(!Object.values(sync).some((value) => value === '1995' || value === 'wrg-access-1995'));
});

test('missing anon key is not configured and cannot write', () => {
  assert.strictEqual(sync.configured({ supabaseUrl: 'https://evgpnpqtnemlbnygpbxs.supabase.co', supabaseAnonKey: '' }), false);
  const gate = sync.canWrite({ configured: false, signedIn: true, member: true, online: true });
  assert.strictEqual(gate.ok, false);
  assert.strictEqual(gate.code, 'unconfigured');
  assert.ok(!/synced/i.test(gate.message));
});

test('offline signed-in member is read only', () => {
  const gate = sync.canWrite({ configured: true, signedIn: true, member: true, online: false, readOnly: true });
  assert.strictEqual(gate.code, 'offline');
  assert.ok(/will not save/i.test(gate.message));
});

test('a non-member cannot write', () => {
  const gate = sync.canWrite({ configured: true, signedIn: true, member: false, online: true });
  assert.strictEqual(gate.code, 'signed-out');
});

test('unchanged shop state produces no writes', () => {
  const state = sync.clone(base);
  state.customers = [{ id: 'c1', version: 2, name: 'Jordan Hale', phone: '555', email: '', address: '', vehicles: [] }];
  assert.deepStrictEqual(sync.planPersist(state, state), []);
});

test('a stale local version is what the update must match', () => {
  const shadow = sync.clone(base);
  const current = sync.clone(base);
  const quote = { id: 'q1', version: 4, number: '0001', date: '2026-11-09', status: 'draft', customerId: '', customerName: '', customerPhone: '', customerEmail: '', customerAddress: '', vehicleId: '', vehicleDesc: '', vehiclePlate: '', vehicleVin: '', taxRate: 6, notes: 'mine', workPerformed: '', items: [], photos: [] };
  shadow.quotes = [Object.assign({}, quote, { version: 5, notes: 'theirs' })];
  current.quotes = [quote];
  const ops = sync.planPersist(current, shadow);
  assert.strictEqual(ops.length, 1);
  assert.strictEqual(ops[0].expectedVersion, 4);
});

test('a changed quote is an update pinned to the shadow version', () => {
  const shadow = sync.clone(base);
  shadow.quotes = [{ id: 'q1', version: 4, number: '0001', date: '2026-11-09', status: 'draft', customerId: '', customerName: '', customerPhone: '', customerEmail: '', customerAddress: '', vehicleId: '', vehicleDesc: '', vehiclePlate: '', vehicleVin: '', taxRate: 6, notes: '', workPerformed: '', items: [], photos: [] }];
  const current = sync.clone(shadow);
  current.quotes[0].notes = 'Waiting on pads';
  const ops = sync.planPersist(current, shadow);
  assert.strictEqual(ops.length, 1);
  assert.strictEqual(ops[0].op, 'update');
  assert.strictEqual(ops[0].table, 'wrg_quotes');
  assert.strictEqual(ops[0].expectedVersion, 4);
});

test('version check refuses a second writer', () => {
  const store = { q1: { id: 'q1', version: 4, notes: '' } };
  const first = sync.applyVersionedUpdate(store, 'q1', 4, { notes: 'Phone A' });
  const second = sync.applyVersionedUpdate(store, 'q1', 4, { notes: 'Phone B' });
  assert.strictEqual(first.conflict, false);
  assert.strictEqual(first.row.version, 5);
  assert.strictEqual(first.row.notes, 'Phone A');
  assert.strictEqual(second.conflict, true);
  assert.strictEqual(store.q1.notes, 'Phone A');
});

test('remote refresh keeps a dirty job and reports the conflict', () => {
  const local = [{ id: 'q1', version: 4, notes: 'local edit' }];
  const remote = [{ id: 'q1', version: 5, notes: 'other phone' }, { id: 'q2', version: 1, notes: 'new' }];
  const merged = sync.mergeRemote(local, remote, ['q1']);
  assert.strictEqual(merged.rows.find((row) => row.id === 'q1').notes, 'local edit');
  assert.strictEqual(merged.rows.find((row) => row.id === 'q2').notes, 'new');
  assert.strictEqual(merged.conflicts.length, 1);
  assert.strictEqual(merged.conflicts[0].serverVersion, 5);
});

test('a clean job takes the other phone version', () => {
  const merged = sync.mergeRemote(
    [{ id: 'q1', version: 4, notes: 'same' }],
    [{ id: 'q1', version: 5, notes: 'other phone' }],
    []
  );
  assert.strictEqual(merged.rows[0].notes, 'other phone');
  assert.strictEqual(merged.conflicts.length, 0);
});

test('device import skips existing jobs and never deletes shop records', () => {
  const cloud = {
    customers: [{ id: 'cloud-c', name: 'Jordan Hale', phone: '555-0148', vehicles: [{ year: '2014', make: 'Honda', model: 'Accord', plate: 'TEST123' }] }],
    quotes: [{ number: '0001' }],
    invoices: [{ number: '0007' }],
    timeEntries: [{ date: '2026-11-09', hours: 1, description: 'Brake job', jobNumber: '0001', rate: 120 }]
  };
  const local = {
    customers: [{
      id: 3,
      name: 'Jordan Hale',
      phone: '(555) 0148',
      vehicles: [
        { year: '2014', make: 'Honda', model: 'Accord', plate: 'TEST123' },
        { year: '1999', make: 'Spare', model: 'Widget', plate: '' }
      ]
    }, { id: 4, name: 'New Person', phone: '555-0199', vehicles: [] }],
    quotes: [{ id: 8, number: '0001' }, { id: 9, number: '0002' }],
    invoices: [{ id: 10, number: '0007' }, { id: 11, number: '0008' }],
    timeEntries: [
      { date: '2026-11-09', hours: 1, description: 'Brake job', jobNumber: '0001', rate: 120 },
      { date: '2026-11-09', hours: 2, description: 'Diagnostic', jobNumber: '', rate: 120 }
    ]
  };
  const plan = sync.planDeviceImport(local, cloud);
  assert.deepStrictEqual(plan.deletes, []);
  assert.strictEqual(plan.customers.length, 1);
  assert.strictEqual(plan.customers[0].name, 'New Person');
  assert.strictEqual(plan.vehicles.length, 1);
  assert.strictEqual(plan.vehicles[0].customerId, 'cloud-c');
  assert.deepStrictEqual(plan.quotes.map((row) => row.number), ['0002']);
  assert.deepStrictEqual(plan.invoices.map((row) => row.number), ['0008']);
  assert.strictEqual(plan.timeEntries.length, 1);
  assert.ok(plan.skipped.some((row) => row.kind === 'quote' && row.number === '0001'));
});

console.log(passed + ' sync tests passed');
