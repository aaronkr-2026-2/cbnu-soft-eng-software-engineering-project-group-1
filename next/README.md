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
