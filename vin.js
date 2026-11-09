/* VIN checks and NHTSA vPIC field picking. Images never leave the phone. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WrgVin = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var VIN_CHARS = /^[A-HJ-NPR-Z0-9]{17}$/;

  function normalizeVin(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function isValidVin(value) {
    return VIN_CHARS.test(normalizeVin(value));
  }

  function acceptScan(value) {
    var vin = normalizeVin(value);
    return isValidVin(vin) ? vin : null;
  }

  function cleanNhtsa(value) {
    var text = value == null ? '' : String(value).trim();
    if (!text) return '';
    if (/^(not applicable|null|undefined|n\/a|unknown)$/i.test(text)) return '';
    return text;
  }

  function pickNhtsaFields(payload) {
    var row = payload && payload.Results && payload.Results[0];
    if (!row) return {};
    var out = {};
    var year = cleanNhtsa(row.ModelYear);
    if (/^\d{4}$/.test(year)) out.year = year;
    var make = cleanNhtsa(row.Make);
    if (make) out.make = make;
    var model = cleanNhtsa(row.Model);
    if (model) out.model = model;
    var trim = cleanNhtsa(row.Trim) || cleanNhtsa(row.Series);
    if (trim) out.trim = trim;
    var displacement = cleanNhtsa(row.DisplacementL);
    if (displacement && displacement !== '0') {
      out.engineDisplacement = /l$/i.test(displacement) ? displacement : displacement + ' L';
    }
    var cylinders = cleanNhtsa(row.EngineCylinders);
    var configuration = cleanNhtsa(row.EngineConfiguration);
    var engine = [];
    if (cylinders && cylinders !== '0') engine.push(cylinders + ' cyl');
    if (configuration) engine.push(configuration);
    if (engine.length) out.engineType = engine.join(' ');
    var fuel = cleanNhtsa(row.FuelTypePrimary);
    if (fuel) out.fuel = fuel;
    var transmission = cleanNhtsa(row.TransmissionStyle);
    if (transmission) out.transmissionType = transmission;
    var speeds = cleanNhtsa(row.TransmissionSpeeds);
    if (speeds && speeds !== '0') out.transmissionSpec = speeds + ' speed';
    return out;
  }

  return {
    normalizeVin: normalizeVin,
    isValidVin: isValidVin,
    acceptScan: acceptScan,
    pickNhtsaFields: pickNhtsaFields
  };
});
