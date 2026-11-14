const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function loadComponent(relativePath, overrides) {
  const filename = path.resolve(__dirname, relativePath);
  const localRequire = createRequire(filename);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(
    (name) => overrides[name] ?? localRequire(name), exports,
  );
  return exports;
}

test('desktop and mobile care links follow login, staff roles and logout', () => {
  let session = null;
  const { SiteHeader } = loadComponent('../components/layout/SiteHeader.tsx', {
    '../../libs/auth-session': {
      useSession: () => session,
      clearSession: () => { session = null; },
    },
    '../../libs/api/image-url': { memberImageUrl: () => '' },
  });
  for (const memberType of [null, 'USER', 'CLINIC', 'DOCTOR', null]) {
    session = memberType ? { member: { memberType } } : null;
    const html = renderToStaticMarkup(React.createElement(SiteHeader));
    const navs = [...html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/g)];
    assert.equal(navs.length, 2);
    for (const [, nav] of navs) {
      assert.match(nav, /href="\/clinics"/);
      assert.match(nav, /href="\/doctors"/);
      assert.doesNotMatch(nav, /Your care|your-care/);
      if (memberType === 'USER') {
        assert.match(nav, /href="\/appointments">My Care/);
        assert.match(nav, /href="\/notifications"/);
      } else if (memberType) {
        assert.match(nav, /href="\/workspace">Workspace/);
        assert.doesNotMatch(nav, /My Care|href="\/appointments"/);
      } else {
        assert.doesNotMatch(nav, /My Care|Workspace|href="\/(appointments|notifications|workspace)"/);
      }
    }
  }
});

test('footer identifies South Korea and removes duplicate care navigation', () => {
  const { SiteFooter } = loadComponent('../components/layout/SiteFooter.tsx', {
    './SiteHeader': { Brand: () => React.createElement('span', null, 'MedConnect') },
  });
  const html = renderToStaticMarkup(React.createElement(SiteFooter));
  assert.match(html, /Helping people currently in South Korea find clinics and doctors\./);
  assert.doesNotMatch(html, /Your care|your-care/);
  assert.match(html, /How it works/);
});
