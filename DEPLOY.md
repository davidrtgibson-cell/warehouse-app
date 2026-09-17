> Written for someone with **no prior deployment experience**. Follow it top to bottom, in order,
> on the Windows PC that will host the app on your work network (call this the "server PC" below —
> it can be a normal desktop, it just needs to stay switched on and connected to the network during
> work hours). Every grey box is a command — copy it exactly and press Enter.
>
> Budget about an hour the first time. After that, updates (BACKLOG.md-driven changes going forward)
> take five minutes — see "Updating the app later" at the bottom.

## The big picture, in plain terms

Two separate things need to end up on the server PC:

1. **The code** — what the app does. Lives on GitHub already (private, only you can see it). The
   server PC downloads it with one command (`git clone`) rather than copying files — a folder called
   `node_modules` inside the code is hundreds of MB of other people's library code that isn't copied
   directly, it gets rebuilt fresh on the server PC by one command (`npm install`).
2. **The database** — your actual data (employees, rosters, task movements). This is **not** copied
   from your dev PC. You'll create a brand new, empty database on the server PC and set it up through
   the app itself once it's running — no synthetic test data comes along.

Once both of those are in place, the app runs as an ordinary background program on the server PC, and
anyone on your office network can open it in a browser by typing that PC's address.

---

## Before you start

- Admin rights on the server PC (you'll be installing software).
- The server PC's job is to stay on and connected to the network — a laptop that gets closed and
  taken home every night isn't a great fit; a desktop that's always plugged in and on is ideal.
- Know your GitHub login (you'll need to sign in once during step 2).

---

## Step 1 — Install three free programs on the server PC

Install these one at a time, accepting all the default options in each installer unless told otherwise
below.

1. **Node.js** (runs the app itself) — download the "LTS" version from
   [nodejs.org](https://nodejs.org). Just click through the installer with defaults.
2. **Git** (downloads the code from GitHub) — download from
   [git-scm.com/download/win](https://git-scm.com/download/win). Defaults are fine.
3. **PostgreSQL** (the database) — download from
   [postgresql.org/download/windows](https://www.postgresql.org/download/windows). During its
   installer:
   - It'll ask you to set a **password for the `postgres` user** — pick one and **write it down
     somewhere safe**, you'll need it in Step 3.
   - Leave the port as the default (`5432`).
   - When it offers to open "Stack Builder" at the end, you can skip/close that — not needed.

Once all three are installed, **close and reopen PowerShell** (search "PowerShell" in the Start menu)
so it picks up the new programs, then check they're there:

```powershell
node --version
git --version
```

Both should print a version number. If either says "not recognized," the install didn't complete —
re-run that installer.

---

## Step 2 — Get the code onto the server PC

Pick a simple location, e.g. `C:\Apps`. Two ways to do this — use whichever fits your work network.

**Option A — `git clone` (needs the work PC to reach github.com):**

```powershell
New-Item -ItemType Directory -Force C:\Apps
Set-Location C:\Apps
git clone https://github.com/davidrtgibson-cell/warehouse-app.git
Set-Location C:\Apps\warehouse-app
```

The first `git clone` will ask you to sign in to GitHub in a browser window that pops up — sign in
with your normal GitHub account.

**Option B — copy a zip file across (no GitHub access needed at all):**

Everything git tracks — the app's source code, not its dependencies — packages down to well under 1 MB,
small enough for a USB stick, a network share, or even email. On the dev machine this is produced with:

```powershell
git archive --format=zip -o warehouse-app-source.zip HEAD
```

Copy that zip to the server PC by whatever means your network allows (USB drive is simplest), then:

```powershell
New-Item -ItemType Directory -Force C:\Apps\warehouse-app
Expand-Archive -Path "<path to the zip you copied over>" -DestinationPath C:\Apps\warehouse-app
Set-Location C:\Apps\warehouse-app
```

> **One thing to check either way:** the very next step (`npm install`) still needs the server PC to
> reach the **npm registry** (`npmjs.org`) to download the app's dependency code — that's a different,
> much more commonly-allowed address than GitHub, so it's usually fine even on a locked-down network,
> but confirm it before relying on this. If the server PC genuinely has **no internet access at all**,
> say so and a different, fully self-contained package (with dependencies already included — a few
> hundred MB instead of under 1 MB) is the way to go instead.

Now download the app's own dependency code (the `node_modules` folder mentioned above — this step is
what rebuilds it fresh, rather than copying it):

```powershell
npm install
```

This takes a minute or two and prints a lot of text — that's normal.

---

## Step 3 — Create a fresh database

Open **pgAdmin** (installed alongside PostgreSQL — search for it in the Start menu). It'll ask for the
`postgres` password from Step 1.

1. In the tree on the left, right-click **Databases → Create → Database…**
2. Name it `warehouse` and click Save.

Back in PowerShell, tell the app how to reach that database. Create a file called `.env` in the
`warehouse-app` folder — the easiest way is this command (replace `YOUR_PASSWORD` with the password
you set in Step 1):

```powershell
'DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/warehouse"' | Out-File -Encoding utf8 .env
```

The app's database client is generated into its own folder from the schema, and isn't downloaded by
`npm install` — generate it now:

```powershell
npm run db:generate
```

Now build the actual tables inside that empty database:

```powershell
npm run db:migrate
```

This reads the app's schema and creates every table it needs. You'll see a list of migrations being
applied — that's expected and correct.

> **If `npm install` didn't go cleanly** (interrupted, or the server PC lost network mid-install), run
> it again before continuing. A partial install can leave the commands above resolving to the wrong,
> unpinned version of a tool instead of the exact one this app was built against, which fails in
> confusing ways. `npm run` (used above) mostly protects you from this — unlike `npx`, it only ever
> runs the copy already sitting in this project's `node_modules`, and errors loudly if that's missing,
> rather than silently fetching something else off the internet.

---

## Step 4 — Build the app

```powershell
npm run build
```

This compiles the app into its fast, production-ready form. Takes a minute or two.

---

## Step 5 — Create your first admin login

This is the one login that lets you sign in and set everything else up (your real employees, tasks,
shifts, etc.) through the app itself:

```powershell
npm run create-admin -- --email you@yourcompany.com --name "Your Name"
```

Use your own real email and name. It'll print a password — **copy it somewhere safe right now**, it's
only ever shown this once. (You can pass `--password "something"` instead if you'd rather choose your
own.)

---

## Step 6 — Make it run permanently in the background

Right now, `npm run start` would run the app — but only in that one PowerShell window, and it stops the
moment you close it. To have it run permanently and restart itself automatically (including after the
PC reboots), we'll use a small free tool called **NSSM** that turns it into a proper Windows background
service.

1. Download NSSM from [nssm.cc/download](https://nssm.cc/download) — get the latest stable version
   (a `.zip` file, not an installer).
2. Extract the zip. Inside, find `win64\nssm.exe` and copy it to `C:\Apps\nssm.exe` (simplest place to
   find it again).
3. In PowerShell, **as Administrator** (right-click PowerShell in the Start menu → "Run as
   administrator"), run:

```powershell
C:\Apps\nssm.exe install WarehouseApp
```

A small window pops up. Fill in:
- **Path**: click `...` and browse to `C:\Program Files\nodejs\npm.cmd`
- **Startup directory**: `C:\Apps\warehouse-app`
- **Arguments**: `run start`

Click **Install service**. Then start it:

```powershell
Start-Service WarehouseApp
```

Check it's actually running by opening a browser **on the server PC itself** and going to
`http://localhost:3000` — you should see the login page.

From now on, this service starts automatically every time the server PC boots — you don't need to
open PowerShell again unless you're updating the app (see below).

---

## Step 7 — Let your colleagues reach it

Find the server PC's address on your office network:

```powershell
ipconfig
```

Look for **IPv4 Address** (something like `192.168.1.50`) under whichever network adapter is actually
connected (Wi-Fi or Ethernet). That address, followed by `:3000`, is the app's address for everyone
else on the same office network — e.g. `http://192.168.1.50:3000`. Bookmark that on your and your
colleagues' computers; you may want to ask whoever manages your office network to set up a friendlier
name for it later (optional, not required to get started).

If colleagues on other PCs can't reach it, Windows Firewall on the server PC is the most likely
reason — allow the app through it (**as Administrator**):

```powershell
New-NetFirewallRule -DisplayName "Warehouse App" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

> **This setup is plain HTTP, on purpose.** The login cookie is deliberately *not* marked `Secure`,
> because browsers silently refuse to store `Secure` cookies on a non-HTTPS connection — with it set,
> login would appear to succeed (valid session created server-side) but the browser would drop the
> cookie and bounce you straight back to `/login`. If you ever put this behind HTTPS (a reverse proxy,
> a real domain, etc.), add `COOKIE_SECURE=true` to `.env` and rebuild — see the comment in
> `src/lib/auth.ts`.

---

## What does *not* come along automatically

- **No demo/test data.** You're starting from a genuinely empty database — go to Settings once
  logged in and add your real departments, employees, tasks, shift hours, etc.
- **Branding (logo/colour)**, if you'd set one up on your dev PC, isn't copied — it's a small
  uploaded file, easy to just re-upload once on the server PC via Settings > Branding.

---

## Updating the app later

When new features land (pushed to GitHub), bringing them onto the server PC is much shorter than the
initial setup. Run the **entire** sequence below in **one** PowerShell window opened **as Administrator**
(right-click PowerShell in the Start menu → "Run as administrator") — `Stop-Service`/`Start-Service`
and the app's own build/migrate steps all need to happen in the same session, and mixing an elevated
window for some steps with a normal one for others is the most common way this goes wrong (see gotchas
below).

An Administrator PowerShell window opens in `C:\Windows\system32` by default, **not** the project
folder — that's what the `Set-Location` line below is for; don't skip it.

```powershell
Stop-Service WarehouseApp
Set-Location C:\Apps\warehouse-app
git pull
npm install
npm run db:generate
npm run db:migrate
npm run build
Start-Service WarehouseApp
```

That's the whole update process, every time. If anything seems not to have taken effect (old page still
showing after a rebuild, etc.), check the service actually cycled:

```powershell
Get-Service WarehouseApp
```

---

## Ops gotchas

- **`Stop-Service` / `Start-Service` / `Restart-Service` and the firewall rule (Step 7) all require an
  elevated (Administrator) PowerShell window.** Run in a normal window, they fail with something like
  *"Cannot open WarehouseApp service on computer '.'."* — but a failed `Stop-Service` fails silently as
  far as the rest of the sequence is concerned: the old process keeps running and keeps serving old code
  even after a full `npm run build`, and the following `Start-Service` on an "already running" service
  does nothing and reports success. If a rebuild ever doesn't seem to have taken effect, re-run the
  whole update sequence above in a genuinely elevated window rather than assuming the code is wrong.
- **A PowerShell window opened as Administrator starts in `C:\Windows\system32`**, not wherever your
  normal PowerShell starts — easy to forget the `Set-Location C:\Apps\warehouse-app` and get a confusing
  "access denied" a step later (e.g. trying to create `.env` in `system32`).
