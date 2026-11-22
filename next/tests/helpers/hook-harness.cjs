const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
for (const extension of ['.ts', '.tsx'])
  require.extensions[extension] = (module, filename) =>
    module._compile(compile(fs.readFileSync(filename, 'utf8')), filename);

// A deterministic effect/state harness: tests run the production hooks with
// controlled reads. It does not substitute for React/browser acceptance.
function createHookHarness(stubs = {}, directory = 'components/mypage') {
  const cells = [];
  let index = 0,
    dirty = true,
    effects = [],
    render,
    value;
  const hooks = {
    useState(initial) {
      const i = index++;
      if (!cells[i]) {
        const cell = {
          value: typeof initial === 'function' ? initial() : initial,
        };
        cell.set = (next) => {
          next = typeof next === 'function' ? next(cell.value) : next;
          if (!Object.is(next, cell.value)) {
            cell.value = next;
            dirty = true;
          }
        };
        cells[i] = cell;
      }
      return [cells[i].value, cells[i].set];
    },
    useRef(initial) {
      const i = index++;
      cells[i] ??= { current: initial };
      return cells[i];
    },
    useEffect(effect, deps) {
      const i = index++,
        old = cells[i];
      if (!old || deps.some((dep, j) => !Object.is(dep, old.deps[j]))) {
        cells[i] = { deps, cleanup: old?.cleanup };
        effects.push(() => {
          cells[i].cleanup?.();
          cells[i].cleanup = effect();
        });
      }
    },
  };
  function load(name) {
    const filename = path.resolve(directory, name + '.ts');
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const originalRequire = loaded.require.bind(loaded);
    loaded.require = (id) => {
      if (id === 'react') return hooks;
      if (Object.hasOwn(stubs, id)) return stubs[id];
      if (
        id.startsWith('./') &&
        fs.existsSync(path.resolve(directory, id + '.ts'))
      )
        return load(id);
      return originalRequire(id);
    };
    loaded._compile(compile(fs.readFileSync(filename, 'utf8')), filename);
    return loaded.exports;
  }
  return {
    hooks,
    load,
    mount(fn) {
      render = fn;
    },
    async flush() {
      for (let n = 0; n < 30; n++) {
        if (dirty) {
          dirty = false;
          index = 0;
          effects = [];
          value = render();
          effects.forEach((effect) => effect());
        }
        await new Promise((resolve) => setImmediate(resolve));
        if (!dirty) return value;
      }
      throw new Error('Hook state failed to settle');
    },
    rerender() {
      dirty = true;
    },
    unmount() {
      cells.forEach((cell) => cell?.cleanup?.());
    },
  };
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

module.exports = { createHookHarness, deferred };
