# Will Ruby’s Garage

Shop desk for quotes, invoices, job photos, and time. It is an installable mobile web app with a light navy theme. Open the GitHub Pages address below with the trailing slash so the relative files load:

https://brennentrevor.github.io/will-rubys-garage/

That URL works after GitHub Pages is enabled for this repository from the `main` branch root.

## Sign-in

The shop PIN is `1995`. It only unlocks the desk for the current browser session. It is not an account, and it does not encrypt records. Anyone who can open this browser’s saved site data can read them without the PIN.

## Where records live

Customers, vehicles, quotes, invoices, photos, time, and settings stay in this browser. They are not uploaded and they do not sync to another phone or computer.

- Records: `localStorage` key `will-rubys-garage:data:v1`
- Session gate: `sessionStorage` key `will-rubys-garage:session`
- Offline shell: cache names that start with `will-rubys-garage-`

Those names are separate from other apps hosted on the same `github.io` site. The service worker only deletes caches with that prefix. Clearing this site’s browser data deletes the records. Settings can download a JSON backup and restore one later. That file contains whatever is on the device, including photos. Keep it private. This repository does not include customer records.

## Printing and email

Print / Save PDF opens the browser’s print dialog. Choose Save as PDF there. Email opens the device mail app with a draft and the shop signature. This app never sends the message itself.

The default contact email is `Brennentrevor@yahoo.com` until it is changed in Settings.

## Install on iPhone

Open the Pages site in Safari, tap Share, then Add to Home Screen. After one online visit, the shell can open offline. The records still stay on that device.

## Checks

```
node tests/calc.test.js
node --check app.js
node --check calc.js
node --check sw.js
```
