# City Dental Section — Full-Stack Web App

A patient/admin portal for a city dental clinic, rebuilt from the provided screen recording.

- **Frontend:** React + Vite + Tailwind CSS + React Router (`/frontend`)
- **Backend:** Node.js + Express + SQLite (`/backend`)
- **Auth:** JWT-based, with `patient` and `admin` roles

See `GUIDE.md` in this same folder (or the copy shared in chat) for the full step-by-step setup walkthrough, including what software to install.

## Quick start

```bash
# 1. Backend
cd backend
npm install
npm run seed     # creates admin@citydental.gov.ph / Admin123!
npm run dev       # http://localhost:4000

# 2. Frontend (in a new terminal)
cd frontend
npm install
npm run dev       # http://localhost:5173
```

Visit `http://localhost:5173`. Sign up as a patient, or go to **Admin Portal** and log in with:

```
admin@citydental.gov.ph
Admin123!
```

## Project structure

```
city-dental-section/
├── backend/
│   ├── server.js          # Express app entry point
│   ├── db.js               # SQLite schema
│   ├── seed.js              # Creates the demo admin + staff
│   ├── middleware/auth.js  # JWT verification
│   ├── routes/              # auth, appointments, patients, billing, etc.
│   └── lib/importExcel.js  # Shared Excel-import logic (used by the manual Import button)
└── frontend/
    └── src/
        ├── pages/            # Landing, Login, Signup, AdminLogin
        ├── pages/patient/    # Patient portal: Dashboard, My Profile, Barangay Appointments, Dental Record, Support
        ├── pages/admin/      # Admin portal pages, incl. spreadsheet-style Patient Management
        ├── components/       # PortalLayout, ProtectedRoute, EditableCell, shared UI
        ├── context/          # AuthContext (login/signup/logout state)
        └── lib/api.js        # Fetch wrapper that attaches the JWT
```

## How patient data gets entered, in one paragraph

There's no Google Drive/OneDrive connection or background file-watcher — everything lives in the app's own database. Admin edits patient personal info (name, birthdate, sex, barangay, address, occupation, pregnant/senior/PWD status) directly on the website, cell-by-cell like a spreadsheet, in **Patient Management**. Patients can view their own profile on **My Profile** but it's read-only there. Admin also logs the **services applied** (procedures/visits) for each patient as an inline-editable grid. On top of that, admin can export the whole patient list to a real `.xlsx` file (to view/print/share in Excel) or import an `.xlsx` back in for bulk updates — the moment an import finishes, the website re-reads the database and shows the new/updated rows immediately, no separate sync step. When a patient signs up, the system checks their name + barangay against any Excel-imported records: if they match an existing (unclaimed) record, their dental history is linked to their new account immediately; if not, their account starts empty until the clinic logs an actual visit for them. See `GUIDE.md` sections 8–9 for the full details.
