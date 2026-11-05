const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const compile = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;
const React = require('react');
const { renderToString } = require('react-dom/server');
const {
  RouterContext,
} = require('next/dist/shared/lib/router-context.shared-runtime');
const { ClinicsPage } = require('../components/clinics/ClinicsPage.tsx');
const { DoctorsPage } = require('../components/doctors/DoctorsPage.tsx');

for (const [kind, Component, nameLabel] of [
  ['clinics', ClinicsPage, 'Clinic name'],
  ['doctors', DoctorsPage, 'Doctor full name'],
]) {
  test(`${kind} render a correctly labeled public shell while URL state is not ready`, () => {
    const router = {
      pathname: '/' + kind,
      asPath: '/' + kind,
      query: {},
      isReady: false,
      events: { on() {}, off() {} },
      prefetch: async () => {},
      push: async () => true,
      replace: async () => true,
    };
    const html = renderToString(
      React.createElement(
        RouterContext.Provider,
        { value: router },
        React.createElement(Component),
      ),
    );
    assert.match(html, new RegExp(nameLabel));
    assert.match(html, new RegExp('Finding ' + kind));
    assert.doesNotMatch(
      html,
      /first 100 listed doctors|Showing up to 100 clinics/,
    );
    assert.match(html, /Clear filters/);
    assert.match(html, /aria-busy="true"/);
    assert.doesNotMatch(html, /View doctors at|View times/);
  });
}
