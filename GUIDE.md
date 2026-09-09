
# Full-Stack Web Development Guide — City Dental Section

This guide walks you through everything needed to run, understand, and extend the City Dental Section web app: a patient/admin portal for a city dental clinic, built to match your screen recording. It covers what to download, how the project is structured, how to run it locally, and how to put it online.

---

## 1. What you're building

A **full-stack** app has two halves that talk to each other over the network:

| Layer | What it does | What we used |
|---|---|---|
| **Frontend** | Everything the user sees and clicks — the landing page, patient portal, admin portal | React + Vite + Tailwind CSS |
| **Backend** | Stores data, checks passwords, enforces who can see what | Node.js + Express + SQLite |

The two communicate over a REST API: the frontend sends HTTP requests like `POST /api/auth/login`, and the backend responds with JSON.

Your recording showed the original layout, which has since been revised at your request. The **patient portal is now view-only**: patients can't book appointments, and there's no Prescription, Billing, or Messages for them — instead they see a **Barangay Appointments** schedule (view-only) showing which barangay the dental team is visiting and when, for services like tooth extraction and cleaning.

- **Public landing page** — sign up / log in / admin portal buttons and an FAQ
- **Patient portal** (view-only): Dashboard, Barangay Appointments, Dental Record, Support
- **Admin portal**: Dashboard, Patient Management, Appointment Management, Barangay Schedule, Billing Management, Messages, Staff Management

All of this has been built and tested for you in the attached project — this guide explains how it works and how to keep building on it.

---

## 2. What to download before you start

Install these once on your computer:

1. **Node.js (LTS version)** — runs both the frontend build tool and the backend server.
   Download: https://nodejs.org (choose the "LTS" button). This also installs `npm`, the package manager.
   Verify it worked by opening a terminal and running:
   ```bash
   node -v
   npm -v
   ```

2. **A code editor** — [Visual Studio Code](https://code.visualstudio.com/) is the standard free choice.

3. **Git** — for version control and deploying. Download: https://git-scm.com/downloads

4. **A terminal** — macOS/Linux have one built in (Terminal). On Windows, use the terminal built into VS Code, or [Windows Terminal](https://apps.microsoft.com/detail/9n0dx20hk701).

That's it — no database software to install separately. This project uses **SQLite**, which is just a single file (`citydental.db`) that the backend creates automatically; there's no server to set up.

Optional, for later:
- A **GitHub** account (https://github.com) — to store your code and connect to hosting.
- **Postman** or the built-in `curl`/browser dev tools — to test API endpoints directly while developing.

---

## 3. Project structure

```
city-dental-section/
├── backend/                 ← Node.js + Express API + SQLite database
│   ├── server.js            ← app entry point
│   ├── db.js                ← table definitions (schema)
│   ├── seed.js               ← creates the demo admin account
│   ├── middleware/auth.js   ← checks the login token on protected routes
│   └── routes/               ← one file per resource (auth, appointments, billing…)
└── frontend/                 ← React app (what the browser loads)
    └── src/
        ├── pages/             ← Landing, Login, Signup, AdminLogin
        ├── pages/patient/     ← the 4 view-only patient portal screens
        ├── pages/admin/       ← the 7 admin portal screens
        ├── components/        ← reusable pieces (sidebar layout, cards, route guards)
        ├── context/            ← keeps track of who's logged in
        └── lib/api.js          ← the one place that talks to the backend
```

---

## 4. Running it on your computer

Open two terminal windows/tabs — one for the backend, one for the frontend.

**Terminal 1 — backend:**
```bash
cd city-dental-section/backend
npm install       # downloads the packages listed in package.json
npm run seed      # creates the demo admin account (only needs to run once)
npm run dev       # starts the API on http://localhost:4000
```

**Terminal 2 — frontend:**
```bash
cd city-dental-section/frontend
npm install
npm run dev       # starts the app on http://localhost:5173
```

Open **http://localhost:5173** in your browser. You should see the landing page.

- **As a patient:** click "Get started" to sign up, or use any email/password you register.
- **As an admin:** click "Admin Portal" and log in with:
  ```
  Email: admin@citydental.gov.ph
  Password: Admin123!
  ```

Leave both terminals running while you work — closing either one stops that half of the app. `npm run dev` auto-reloads when you edit files, so you can leave them running and just edit code.

---

## 5. How the pieces fit together (for when you want to change something)

**Adding a new field to a form**, e.g. patient phone number:
1. Add a `phone` column in `backend/db.js`'s `users` table definition, delete `citydental.db` and re-run `npm run seed` (SQLite doesn't auto-migrate columns).
2. Accept `phone` in the `POST /api/auth/register` handler in `backend/routes/auth.js`.
3. Add a `phone` input to the signup form in `frontend/src/pages/Signup.jsx`.

**Adding a new page**, e.g. a "Reviews" tab in the patient portal:
1. Create `frontend/src/pages/patient/Reviews.jsx`.
2. Import it and add a `<Route path="reviews" element={<Reviews />} />` inside the `/patient` route block in `frontend/src/App.jsx`.
3. Add it to the `patientNav` array (also in `App.jsx`) so it shows in the sidebar.

**Adding a new API endpoint:**
1. Add a route handler in the relevant file under `backend/routes/`.
2. Call it from the frontend using the existing `api` helper: `api.get("/your-path")`, `api.post("/your-path", body)` — see `frontend/src/lib/api.js`.

**Authentication in one sentence:** on login, the backend signs a JWT (a signed token) containing the user's id and role; the frontend stores it in `localStorage` and attaches it to every request; the backend's `requireAuth` middleware checks it on every protected route, and `requireRole("admin")` blocks patients from admin-only endpoints.

---

## 6. Putting it online (deployment)

Once you're happy with it locally, you need to host the frontend and backend somewhere public. A simple, mostly-free path:

1. **Push your code to GitHub.**
   ```bash
   cd city-dental-section
   git init
   git add .
   git commit -m "Initial commit"
   # create a new empty repo on github.com, then:
   git remote add origin https://github.com/<your-username>/city-dental-section.git
   git push -u origin main
   ```

2. **Deploy the backend** to a service that keeps a Node process running — [Render](https://render.com) or [Railway](https://railway.app) both have free/cheap tiers and support SQLite-backed Node apps out of the box.
   - Connect your GitHub repo.
   - Set the root directory to `backend`.
   - Build command: `npm install`. Start command: `npm start`.
   - Add an environment variable `JWT_SECRET` with a long random string (don't reuse the placeholder from `.env`).
   - Note the public URL it gives you, e.g. `https://city-dental-api.onrender.com`.

3. **Deploy the frontend** to [Vercel](https://vercel.com) or [Netlify](https://netlify.com), both built for this.
   - Connect the same GitHub repo, set the root directory to `frontend`.
   - Add an environment variable `VITE_API_URL` set to your backend's public URL + `/api` (e.g. `https://city-dental-api.onrender.com/api`).
   - Deploy — you'll get a public link like `https://city-dental-section.vercel.app`.

4. **Note on SQLite in production:** SQLite writes to a local file, which works fine on Render/Railway as long as you attach a persistent disk (both offer this on paid tiers; free tiers may reset the file on redeploy). For a database that survives redeploys without a persistent disk, swap in a hosted Postgres database later (e.g. via [Supabase](https://supabase.com) or [Neon](https://neon.tech)) — the `better-sqlite3` calls in `backend/routes/` would need to be swapped for a Postgres client like `pg`, but the route logic and endpoints stay the same.

---

## 8. Patient records: edit directly on the website, plus Excel export/import

There is **no external Google Drive/OneDrive connection or background file-watcher** — everything lives in the site's own database, and every screen reads straight from it. Two ways data gets in:

1. **Spreadsheet-style editing right on the website** (the normal, everyday way). Admin edits everything — patient personal info and services applied. See 8.1–8.2.
2. **Excel export/import**, for bulk backup or bulk one-off updates (e.g. a batch of new patients from a barangay mission written down on paper first). See 8.3–8.4. Because import writes straight into the same database everything else reads from, the website re-reads and shows the new/updated rows the instant the import finishes — no separate sync step, no delay.

### 8.1 Admin edits patient personal information (spreadsheet-style, in Patient Management)
- **Where:** Admin Portal → Patient Management. Every field (name, email, sex, barangay, address, occupation, and pregnant/senior citizen/PWD status) is an inline editable cell — click it, type, and it saves immediately (`PATCH /api/patients/:id`), the same click-to-edit pattern used in a spreadsheet.
- **Why admin, not the patient:** the clinic staff are the ones keeping the official record up to date. The Patient Portal → **My Profile** page shows this information to the patient **read-only** — if a patient needs a correction, they let the front desk/admin know and admin updates it here.

### 8.2 Admin manages accounts and logs services applied (also spreadsheet-style)
- **Where:** Admin Portal → Patient Management.
- Admin can **add a new patient account** (name + optional email — the patient logs in and can view, but not edit, their info) and **delete** an account, plus search/print/export the list.
- Selecting a patient opens their **Services Applied** table — an editable grid of dental procedures/visits (date, procedure, dentist, notes) that admin adds, edits, or deletes inline, the same click-to-edit pattern as the patient info grid.

### 8.3 Manual export (database → Excel)
- **Where:** Admin Portal → Patient Management → "⬇ Export to Excel" (top right).
- **What's in the file:** one row per dental procedure per patient, with columns Full Name, Age, Sex, Barangay, Pregnant, Senior Citizen, PWD, Procedure / Service, Date of Visit / Procedure, Attending Dentist, Notes. Patients with no procedures yet still get one row with the demographic columns filled in.
- **How it's generated:** `backend/routes/patients.js` (`GET /api/patients/export/xlsx`) builds the workbook server-side with the `exceljs` package and streams it back as a file download.

### 8.4 Manual import (Excel → database)
- **Where:** Admin Portal → Patient Management → "⬆ Import from Excel" (top right, next to Export).
- Reads an `.xlsx` with the same column headers Export produces, upserts patients and their procedures, and — because the frontend re-fetches the patient list right after the import call resolves — the updated table is visible on screen immediately, with no page refresh needed.

### 8.5 How a row is matched to a patient (used by import **and** patient sign-up)
- **Key:** `LOWER(name) + LOWER(barangay)` (case-insensitive). If found, that patient's demographic fields are updated **in place**; if not found, a new patient record is created with a placeholder login (`name.barangay@imported.local`) — a record that exists in the system but that nobody has logged into yet, until the real patient signs up and claims it (see section 9).
- Each row's procedure becomes a `dental_records` entry tied to that patient's ID; re-importing the same row won't create a duplicate procedure entry (matched by patient + date + procedure name).

## 9. Patient sign-up ↔ Excel records (identity matching)

This is separate from — but works together with — the sync above, and answers "how does the portal know whether someone signing up is an existing patient?"

- **On sign-up** (`POST /api/auth/register`, `backend/routes/auth.js`), the backend checks the person's typed name + barangay against the same `name + barangay` key the Excel importer uses:
  - **Match found, and it's a placeholder/imported record nobody has claimed yet** → the new account is linked to that existing record. Their dental history (already sitting in `dental_records` from a previous Excel import) shows up in their portal immediately, along with a green banner: *"We found your existing dental records on file and linked them to your new account."*
  - **Match found, but it's already claimed by a real login** → sign-up is rejected with a message pointing them to log in instead (or contact the front desk), so two accounts can't both claim the same identity.
  - **No match** → a normal new account is created, but it starts with **zero dental records**. The portal correctly shows "No dental records on file yet" everywhere (Dashboard, Dental Record page) rather than making up a status — the person has an account on the *website*, but isn't a recorded patient of the clinic until their first visit gets logged (by Excel import or an admin adding a service record directly).
- **Login is blocked for unclaimed imported rows** (`...@imported.local`) — someone can't accidentally (or on purpose) log into another person's placeholder record; they have to go through Sign Up so the matching logic runs and the record gets properly claimed with a real email + password.
- **Dashboard stats:** once a patient has records, their Dashboard shows Total Recorded Visits, a Tooth Extractions count (matched from the procedure text — "extraction"/"bunot"/"hilas"), and their Last Visit date — this is the "ilang beses na sila nagpabunot" view the portal now surfaces directly.

## 10. Where to go from here

Things worth adding as you extend it:
- **Real-time messaging** (so admin replies show up instantly) — swap the polling in the Messages pages for a WebSocket library like `socket.io`.
- **Birthdate/age double-check on sign-up matching** — right now matching relies on name + barangay only; you could add a soft warning (not a hard block) if the typed birthdate implies an age far from what's on the imported row, to help admins catch true name collisions.
- **Email/SMS notifications** for appointment approvals — services like Resend (email) or Twilio (SMS) have simple Node SDKs.
- **Password reset flow** — currently there isn't one; you'd add a `POST /api/auth/forgot-password` route that emails a reset link with a short-lived token.

If you want, I can also help you build out any of the above, or convert this to TypeScript, or write automated tests — just ask.
