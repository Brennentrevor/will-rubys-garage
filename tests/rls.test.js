const assert = require('assert');
const fs = require('fs');
const sql = fs.readFileSync(require('path').join(__dirname, '..', 'wrg-setup.sql'), 'utf8');
const code = [
  fs.readFileSync(require('path').join(__dirname, '..', 'cloud.js'), 'utf8'),
  fs.readFileSync(require('path').join(__dirname, '..', 'wrg-config.js'), 'utf8'),
  fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8')
].join('\n');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('ok', name);
}

const executable = sql.replace(/--.*$/gm, '');

test('every garage table enables row level security', () => {
  ['wrg_members', 'wrg_settings', 'wrg_customers', 'wrg_vehicles', 'wrg_quotes', 'wrg_invoices', 'wrg_time_entries', 'wrg_photos']
    .forEach((table) => {
      assert.ok(sql.includes('alter table public.' + table + ' enable row level security'), table);
    });
});

test('policies are member gates for authenticated users only', () => {
  assert.ok(sql.includes('public.wrg_is_member()'));
  assert.ok(!/for\s+(select|insert|update|delete)\s+to\s+anon/i.test(sql));
  assert.ok(!/using\s*\(\s*true\s*\)/i.test(sql));
  assert.ok(!/with check\s*\(\s*true\s*\)/i.test(sql));
});

test('anonymous roles are revoked and members cannot insert themselves', () => {
  assert.ok(/revoke all on public\.wrg_customers from public, anon/i.test(sql));
  assert.ok(!/grant\s+insert\s+on\s+public\.wrg_members/i.test(sql));
  assert.ok(/grant select on public\.wrg_members to authenticated/i.test(sql));
});

test('photo bucket stays private', () => {
  assert.ok(/values \('wrg-photos', 'wrg-photos', false\)/.test(sql));
  assert.ok(/on conflict \(id\) do update set public = false/.test(sql));
  assert.ok(/bucket_id = 'wrg-photos' and public\.wrg_is_member\(\)/.test(sql));
});

test('membership table is created before the SQL helper that reads it', () => {
  const tableAt = executable.indexOf('create table if not exists public.wrg_members');
  const fnAt = executable.indexOf('create or replace function public.wrg_is_member()');
  assert.ok(tableAt !== -1 && fnAt !== -1 && tableAt < fnAt);
});

test('script does not grant maintenance or timekeeping access and does not insert a member', () => {
  assert.ok(!/grant[\s\S]{0,80}maintenance/i.test(executable));
  assert.ok(!/grant[\s\S]{0,80}timekeeping/i.test(executable));
  assert.ok(!/insert into public\.wrg_members/i.test(executable));
});

test('frontend has no service-role key, stored PIN, or stored access password', () => {
  assert.ok(!/service_role/i.test(code));
  assert.ok(!/wrg-access-1995/.test(code));
  assert.ok(!/pinEntered === '1995'/.test(code));
  assert.ok(/wrg-auth-session/.test(code));
  assert.ok(/sessionStorage/.test(code));
});

console.log(passed + ' RLS checks passed');
