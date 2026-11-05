# MedConnect — Frontend

A React + TypeScript + TailwindCSS starter. Login, Register, and Dashboard pages are ready and wired up to talk to a backend API.

## Getting started

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

## Connecting to the backend

`vite.config.ts` proxies `/api` requests to `http://localhost:4000` (matching the backend architecture doc). Change this if your backend runs on a different port.

`src/lib/api.ts` — all API calls go through this file; the JWT token is attached automatically.

## Structure

```
src/
├── components/     — reusable UI (Button, TextField, Sidebar, ...)
├── pages/          — Login, Register, Dashboard
├── lib/            — api.ts (axios client), auth.ts (zustand store)
├── types/          — shared TypeScript types
```

## Next steps

- Add new pages under `src/pages/`: Appointments, MedicineSearch, HospitalSearch, Reviews
- Register new routes inside `App.tsx` (commented placeholders are already there for `/dashboard/appointments`, etc.)
- Swap `MOCK_APPOINTMENTS` in `Dashboard.tsx` for a real `useQuery` call to `GET /api/v1/appointments/me`
- For role-specific dashboards (`doctor`, `hospital_admin`, `super_admin`), branch on `useAuthStore().user.role`, or create separate folders under `src/pages/` (`patient/`, `doctor/`, `hospital-admin/`)

## Design tokens

Defined in `tailwind.config.js`: primary color `pine` (brand green), background `sand` (warm off-white), text `ink`. Headings use `font-display` (Fraunces), body text uses `font-sans` (Inter).
