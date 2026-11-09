/* Pure quote/invoice math for Will Ruby's Garage.
   Tax is collected and passed through. It is not profit. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.GarageCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function roundMoney(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return 0;
    var sign = x < 0 ? -1 : 1;
    var cents = Math.round(Math.abs(x) * 100 + 1e-8);
    return (sign * cents) / 100;
  }

  function lineQty(item) {
    if (!item) return 0;
    if (item.qty !== '' && item.qty != null) return Number(item.qty) || 0;
    return Number(item.hours) || 0;
  }

  function lineCostRate(item, settings) {
    settings = settings || {};
    var hasCost = item && item.unitCost !== '' && item.unitCost != null && Number.isFinite(Number(item.unitCost));
    if (hasCost) return Number(item.unitCost);
    if (item && item.type === 'labor') return Number(settings.laborCostRate) || 0;
    return 0;
  }

  function calcLine(item, settings) {
    item = item || {};
    var qty = lineQty(item);
    var unitPrice = Number(item.unitPrice) || 0;
    var unitCost = lineCostRate(item, settings);
    var revenue = roundMoney(qty * unitPrice);
    var cost = roundMoney(qty * unitCost);
    var profit = roundMoney(revenue - cost);
    return {
      qty: qty,
      unitPrice: unitPrice,
      unitCost: unitCost,
      revenue: revenue,
      cost: cost,
      profit: profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0
    };
  }

  function calcDocumentTotals(doc, settings) {
    doc = doc || {};
    settings = settings || {};
    var subtotal = 0;
    var cost = 0;
    var items = Array.isArray(doc.items) ? doc.items : [];
    for (var i = 0; i < items.length; i++) {
      var line = calcLine(items[i], settings);
      subtotal += line.revenue;
      cost += line.cost;
    }
    subtotal = roundMoney(subtotal);
    cost = roundMoney(cost);
    var taxRate = doc.taxRate != null && doc.taxRate !== '' ? Number(doc.taxRate) : Number(settings.taxRate);
    if (!Number.isFinite(taxRate)) taxRate = 0;
    var tax = roundMoney(subtotal * (taxRate / 100));
    var total = roundMoney(subtotal + tax);
    var profit = roundMoney(subtotal - cost);
    return {
      subtotal: subtotal,
      tax: tax,
      total: total,
      cost: cost,
      profit: profit,
      margin: subtotal > 0 ? (profit / subtotal) * 100 : 0,
      taxRate: taxRate
    };
  }

  function suggestPartPrice(unitCost, markupPercent) {
    var cost = Number(unitCost) || 0;
    var markup = Number(markupPercent) || 0;
    return roundMoney(cost * (1 + markup / 100));
  }

  function nextDocumentNumber(docs) {
    var max = 0;
    var list = Array.isArray(docs) ? docs : [];
    for (var i = 0; i < list.length; i++) {
      var n = parseInt(list[i] && list[i].number, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    var next = String(max + 1);
    while (next.length < 4) next = '0' + next;
    return next;
  }

  return {
    roundMoney: roundMoney,
    calcLine: calcLine,
    calcDocumentTotals: calcDocumentTotals,
    suggestPartPrice: suggestPartPrice,
    nextDocumentNumber: nextDocumentNumber
  };
});
