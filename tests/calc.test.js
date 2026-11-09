const assert = require('assert');
const calc = require('../calc.js');

const settings = {
  laborRate: 120,
  laborCostRate: 40,
  taxRate: 6,
  partsMarkup: 40
};

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('ok', name);
}

test('rounds money to cents', () => {
  assert.strictEqual(calc.roundMoney(1.005), 1.01);
  assert.strictEqual(calc.roundMoney(-1.005), -1.01);
  assert.strictEqual(calc.roundMoney(13.986), 13.99);
  assert.strictEqual(calc.roundMoney('nope'), 0);
});

test('suggests part price from markup', () => {
  assert.strictEqual(calc.suggestPartPrice(50, 40), 70);
  assert.strictEqual(calc.suggestPartPrice(9.99, 40), 13.99);
  assert.strictEqual(calc.suggestPartPrice(0, 40), 0);
});

test('labor line uses its own cost rate when set', () => {
  const line = calc.calcLine({ type: 'labor', qty: 1.5, unitCost: 40, unitPrice: 120 }, settings);
  assert.strictEqual(line.revenue, 180);
  assert.strictEqual(line.cost, 60);
  assert.strictEqual(line.profit, 120);
});

test('labor without unit cost falls back to the shop cost rate', () => {
  const line = calc.calcLine({ type: 'labor', qty: 2, unitPrice: 120 }, settings);
  assert.strictEqual(line.cost, 80);
  assert.strictEqual(line.revenue, 240);
});

test('hours are used only when qty is missing', () => {
  const fromHours = calc.calcLine({ type: 'labor', hours: 3, unitCost: 40, unitPrice: 100 }, settings);
  assert.strictEqual(fromHours.qty, 3);
  assert.strictEqual(fromHours.revenue, 300);
  const qtyWins = calc.calcLine({ type: 'labor', qty: 0, hours: 5, unitCost: 40, unitPrice: 100 }, settings);
  assert.strictEqual(qtyWins.qty, 0);
  assert.strictEqual(qtyWins.revenue, 0);
});

test('parts and other lines use quantity times unit cost', () => {
  const part = calc.calcLine({ type: 'part', qty: 2, unitCost: 10, unitPrice: 14 }, settings);
  assert.strictEqual(part.revenue, 28);
  assert.strictEqual(part.cost, 20);
  assert.strictEqual(part.profit, 8);
  const other = calc.calcLine({ type: 'other', qty: 1, unitCost: 5, unitPrice: 20 }, settings);
  assert.strictEqual(other.profit, 15);
  const otherNoCost = calc.calcLine({ type: 'other', qty: 1, unitPrice: 20 }, settings);
  assert.strictEqual(otherNoCost.cost, 0);
});

test('tax is pass-through and is not treated as profit', () => {
  const doc = {
    taxRate: 6,
    items: [
      { type: 'labor', qty: 1.5, unitCost: 40, unitPrice: 120 },
      { type: 'part', qty: 2, unitCost: 10, unitPrice: 14 },
      { type: 'other', qty: 1, unitCost: 5, unitPrice: 20 }
    ]
  };
  const t = calc.calcDocumentTotals(doc, settings);
  assert.strictEqual(t.subtotal, 228);
  assert.strictEqual(t.tax, 13.68);
  assert.strictEqual(t.total, 241.68);
  assert.strictEqual(t.cost, 85);
  assert.strictEqual(t.profit, 143);
  assert.notStrictEqual(t.profit, calc.roundMoney(t.total - t.cost));
  assert.ok(Math.abs(t.margin - (143 / 228) * 100) < 1e-9);
});

test('document tax rate overrides the shop default', () => {
  const t = calc.calcDocumentTotals({
    taxRate: 0,
    items: [{ type: 'labor', qty: 1, unitCost: 40, unitPrice: 100 }]
  }, settings);
  assert.strictEqual(t.tax, 0);
  assert.strictEqual(t.total, 100);
  assert.strictEqual(t.profit, 60);
});

test('empty and zero-subtotal documents do not divide by zero', () => {
  const empty = calc.calcDocumentTotals({ items: [] }, settings);
  assert.strictEqual(empty.subtotal, 0);
  assert.strictEqual(empty.tax, 0);
  assert.strictEqual(empty.total, 0);
  assert.strictEqual(empty.profit, 0);
  assert.strictEqual(empty.margin, 0);
  const zero = calc.calcDocumentTotals({
    items: [{ type: 'part', qty: 0, unitCost: 10, unitPrice: 20 }]
  }, settings);
  assert.strictEqual(zero.margin, 0);
  assert.strictEqual(zero.total, 0);
});

test('negative margin stays defined', () => {
  const t = calc.calcDocumentTotals({
    taxRate: 6,
    items: [{ type: 'part', qty: 1, unitCost: 80, unitPrice: 50 }]
  }, settings);
  assert.strictEqual(t.subtotal, 50);
  assert.strictEqual(t.profit, -30);
  assert.strictEqual(t.tax, 3);
  assert.strictEqual(t.total, 53);
  assert.ok(t.margin < 0);
});

test('missing settings still produce numbers', () => {
  const t = calc.calcDocumentTotals({
    items: [{ type: 'labor', qty: 1, unitPrice: 10 }]
  }, {});
  assert.strictEqual(t.subtotal, 10);
  assert.strictEqual(t.cost, 0);
  assert.strictEqual(t.tax, 0);
  assert.strictEqual(t.profit, 10);
});

test('next document number uses the highest existing number', () => {
  assert.strictEqual(calc.nextDocumentNumber([]), '0001');
  assert.strictEqual(calc.nextDocumentNumber([{ number: '0002' }, { number: '0009' }]), '0010');
  assert.strictEqual(calc.nextDocumentNumber([{ number: 'nope' }, { number: '0003' }]), '0004');
  assert.strictEqual(calc.nextDocumentNumber(null), '0001');
});

console.log(passed + ' calculation tests passed');
