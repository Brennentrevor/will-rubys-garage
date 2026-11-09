const assert = require('assert');
const vin = require('../vin.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('ok', name);
}

test('accepts a 17-character VIN and rejects I, O, and Q', () => {
  assert.strictEqual(vin.acceptScan('1hgcm82633a004352'), '1HGCM82633A004352');
  assert.strictEqual(vin.acceptScan('1HG CM82633A004352'), '1HGCM82633A004352');
  assert.strictEqual(vin.acceptScan('1HGCM82633A00435'), null);
  assert.strictEqual(vin.acceptScan('1HGCM82633A00435I'), null);
  assert.strictEqual(vin.acceptScan('1HGCM82633A00435O'), null);
  assert.strictEqual(vin.acceptScan('1HGCM82633A00435Q'), null);
});

test('NHTSA decode fills only returned vehicle fields', () => {
  const fields = vin.pickNhtsaFields({
    Results: [{
      ModelYear: '2014',
      Make: 'HONDA',
      Model: 'Accord',
      Trim: '',
      Series: 'EX',
      DisplacementL: '2.4',
      EngineCylinders: '4',
      EngineConfiguration: 'In-Line',
      FuelTypePrimary: 'Gasoline',
      TransmissionStyle: 'Automatic',
      TransmissionSpeeds: '6',
      OilType: '0W-20',
      BrakeSystemType: 'Disc',
      WiperSize: '26'
    }]
  });
  assert.strictEqual(fields.year, '2014');
  assert.strictEqual(fields.make, 'HONDA');
  assert.strictEqual(fields.model, 'Accord');
  assert.strictEqual(fields.trim, 'EX');
  assert.strictEqual(fields.engineDisplacement, '2.4 L');
  assert.strictEqual(fields.engineType, '4 cyl In-Line');
  assert.strictEqual(fields.fuel, 'Gasoline');
  assert.strictEqual(fields.transmissionType, 'Automatic');
  assert.strictEqual(fields.transmissionSpec, '6 speed');
  assert.strictEqual(fields.oilType, undefined);
  assert.strictEqual(fields.frontBrake, undefined);
  assert.strictEqual(fields.wiperLeft, undefined);
});

test('missing NHTSA values stay absent', () => {
  const fields = vin.pickNhtsaFields({
    Results: [{
      ModelYear: '0',
      Make: 'Not Applicable',
      Model: '',
      FuelTypePrimary: 'null',
      DisplacementL: '0'
    }]
  });
  assert.deepStrictEqual(fields, {});
});

console.log(passed + ' VIN tests passed');