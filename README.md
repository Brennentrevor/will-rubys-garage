# Will Ruby’s Garage

Shared shop desk for quotes, invoices, vehicles, and job photos. This branch talks to the existing family Supabase project and is **not** the copy on `main` until that project is provisioned.

Shop URL after Pages is serving this branch: https://brennentrevor.github.io/will-rubys-garage/

## Sign-in

Everyone uses the same shop PIN. The app signs in to one shared Supabase Auth user for this browser session. The session is stored under `wrg-auth-session` in `sessionStorage`, separate from other apps on this GitHub Pages site. The PIN and the full password are not stored in the source. There is no per-person account and no separate admin role: anyone with the shop PIN can edit settings.

## Where records live

Rows live in `wrg_*` tables. Photos live in the private `wrg-photos` bucket. Anonymous users cannot read or write them. Only a signed-in user who is listed in `wrg_members` can. Maintenance and timekeeping accounts are not members.

While offline, the phone can show the last shop records loaded in this tab and will not save. A conflicting save from another phone is kept; this phone asks before replacing it.

An older device-only copy under `will-rubys-garage:data:v1` is not uploaded until someone taps **Copy this device into the shop**. That copy adds missing records and does not delete what is already in the shop.

## Setup the parent still runs

1. In the Supabase SQL editor for `evgpnpqtnemlbnygpbxs`, run `wrg-setup.sql`.
2. Authentication → Add user:
   - Email: `wrg-shop@garage.example`
   - Password: `wrg-access-` immediately followed by the shop PIN. Set that only in the dashboard.
3. Copy that user’s UUID and insert it:

```sql
insert into public.wrg_members (user_id)
values ('PASTE-USER-UUID')
on conflict (user_id) do nothing;
```

4. Put the project’s public anon key in `wrg-config.js`. Do not put the service-role key in the app.
5. After that, this branch can replace `main`.

## Pricing

New labor lines use hours × the hourly rate. Markup applies only to parts and other charges, and only until the price is typed by hand. Saved quote and invoice prices stay as stored when the defaults change.

## VIN

Barcode scans run on this phone with ZXing, including iPhone Safari. A photo of the barcode is decoded locally. A confirmed 17-character VIN can be sent as text to the public NHTSA vPIC service, which fills only year, make, model, trim, engine, fuel, and transmission when those values come back. Oil, brakes, and wipers are never guessed.

## Checks

```
node tests/calc.test.js
node tests/vin.test.js
node tests/sync.test.js
node tests/rls.test.js
node --check app.js
node --check guide.js
node --check cloud.js
```
