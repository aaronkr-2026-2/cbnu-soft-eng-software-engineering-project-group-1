# MedConnect Next.js

<p align="center">
  <img src="public/logo.png" alt="MedConnect logo" width="480" />
</p>

Initial package setup for the Next.js frontend, using
`/Users/killashaw/projects/medi-bridge-next` as its structural reference.
The existing React/Vite frontend remains in `../frontend/`.

The manifest declares Next.js 16.4.1, React 19.3.1, TypeScript 5.x, and Yarn 4.18.1.
It requires Node.js 20.9 or newer; Node.js 24 LTS is the recommended project baseline.
The dependency versions were checked against the [Next.js registry metadata](https://registry.npmjs.org/next/latest),
[React registry metadata](https://registry.npmjs.org/react/latest), and
[Yarn release tags](https://repo.yarnpkg.com/tags).

## Install dependencies

If Corepack is unavailable, install and enable it as described in the
[Yarn installation guide](https://yarnpkg.com/getting-started/install):

```bash
npm install --global corepack
corepack enable
```

From the repository root:

```bash
cd next
yarn install
```

Yarn uses `node_modules/`, matching the reference project. Commit the generated
`yarn.lock` after installation; do not use `npm install` for this application.

## Scripts and current status

Shared brand colors live in `styles/variables.scss`: blue `$primary` (`#014b9f`),
green `$secondaryColor` (`#1ca54c`), and `$whiteColor` (`#ffffff`). Blue and green
are representative colors sampled from the gradient logo. Stylesheets can import
them with `@use "./variables" as *;` (adjust the path for their location).
The manifest includes Sass, using the reference project's installed version as
the baseline. Dependency installation in this project remains pending.

### Style foundation

```text
styles/
  variables.scss           # Shared Sass values, including logo colors
  _tokens.scss             # CSS custom properties derived from those values
  style.scss               # Single global stylesheet entry point
  sections/
    _index.scss            # Loads base, layout, then feature styles
    base/                  # Minimal reset, typography/focus, shared button
    layout/                # Site shell, responsive container, section spacing
    features/              # Add feature partials as screens are implemented
```

When the Pages Router app is scaffolded, import `../styles/style.scss` once from
`pages/_app.tsx`. No app entry point exists yet, so these styles are not rendered.
Use `.site-shell` around the app with a direct `<main>` child, `.container` for
centered content, `.section` for section spacing, and `.button` on semantic buttons
or navigation links. Use native `disabled` on buttons; `aria-disabled` only styles
the state and does not prevent link activation.

Add a feature partial under `sections/features/` and forward it from that folder's
`_index.scss`. Scope selectors under a feature class and keep its responsive rules
in the same partial. Use `var(--color-primary)` for normal CSS values and import
`variables.scss` with `@use` when Sass calculations are needed. Do not repeat brand
hex values in components or add a second palette. Dark mode is not implemented.

The stylesheet compiled successfully with the reference project's Sass 1.97.3;
Next.js compilation and browser behavior remain unverified.

The scripts match the reference project:

| Command | Purpose |
|---|---|
| `yarn dev` | Start development with Turbopack (`next dev --turbo`) |
| `yarn build` | Create a production build |
| `yarn start` | Start the production server after building |
| `yarn typecheck` | Check TypeScript without emitting files (`tsc --noEmit`) |

The default frontend port is 3000; configure the backend separately.

This step creates the package setup only. Dependencies have not been installed,
and there are no pages, TypeScript configuration, or UI/API integrations yet.
Development and build commands require application scaffolding before they can
be verified. Type checking requires a `tsconfig.json`, which has not been created
yet. A linting script will be added with its configuration.
