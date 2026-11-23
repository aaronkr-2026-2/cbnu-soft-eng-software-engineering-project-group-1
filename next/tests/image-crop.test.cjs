const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    filename,
  );
const {
  validImageFile,
  cropGeometry,
  cropImage,
  MAX_IMAGE_BYTES,
} = require('../libs/image-crop.ts');
const originalImage = global.Image,
  originalDocument = global.document;
afterEach(() => {
  global.Image = originalImage;
  global.document = originalDocument;
});

test('uploaded member images resolve against the API while fallbacks stay local', () => {
  const { memberImageUrl } = require('../libs/api/image-url.ts');
  const prior = process.env.NEXT_PUBLIC_GRAPHQL_URL;
  process.env.NEXT_PUBLIC_GRAPHQL_URL = 'https://api.example.test/graphql';
  try {
    assert.equal(
      memberImageUrl('/uploads/clinic/a/photo.jpg', '/default.png'),
      'https://api.example.test/uploads/clinic/a/photo.jpg',
    );
    assert.equal(
      memberImageUrl('https://images.example.test/photo.jpg', '/default.png'),
      'https://images.example.test/photo.jpg',
    );
    assert.equal(memberImageUrl('', '/default.png'), '/default.png');
    assert.equal(
      memberImageUrl('javascript:alert(1)', '/default.png'),
      '/default.png',
    );
  } finally {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_GRAPHQL_URL;
    else process.env.NEXT_PUBLIC_GRAPHQL_URL = prior;
  }
});

test('image selection accepts supported nonempty files up to the upload bound', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(validImageFile({ type, size: MAX_IMAGE_BYTES }), true);
    assert.equal(validImageFile({ type, size: MAX_IMAGE_BYTES + 1 }), false);
    assert.equal(validImageFile({ type, size: 0 }), false);
  }
  assert.equal(validImageFile({ type: 'image/svg+xml', size: 50 }), false);
});
test('crop geometry bounds output, avoids upscaling and rejects invalid source rectangles', () => {
  assert.deepEqual(
    cropGeometry(3000, 2000, { x: 500, y: 0, width: 2000, height: 2000 }),
    { x: 500, y: 0, side: 2000, size: 1024 },
  );
  assert.equal(
    cropGeometry(600, 400, { x: 100, y: 0, width: 400, height: 400 }).size,
    400,
  );
  for (const area of [
    { x: -1, y: 0, width: 300, height: 300 },
    { x: 350, y: 0, width: 300, height: 300 },
    { x: 0, y: 0, width: 300, height: 100 },
    { x: NaN, y: 0, width: 300, height: 300 },
  ])
    assert.throws(() => cropGeometry(600, 400, area));
});
function browser({
  decodeError = false,
  empty = false,
  contextMissing = false,
  type = 'image/jpeg',
} = {}) {
  const calls = [],
    canvas = {
      width: 0,
      height: 0,
      getContext: () =>
        contextMissing
          ? null
          : {
              fillStyle: '',
              fillRect: (...args) => calls.push(['fill', ...args]),
              drawImage: (...args) => calls.push(['draw', ...args.slice(1)]),
            },
      toBlob: (callback, mime, quality) => {
        calls.push(['encode', mime, quality]);
        callback(empty ? null : new Blob(['jpeg-fixture'], { type }));
      },
    };
  global.document = { createElement: () => canvas };
  global.Image = class {
    naturalWidth = 3000;
    naturalHeight = 2000;
    set src(value) {
      queueMicrotask(() => (decodeError ? this.onerror() : this.onload()));
    }
  };
  return { calls, canvas };
}
const area = { x: 500, y: 0, width: 2000, height: 2000 };
test('export draws the selected rectangle onto a bounded square JPEG canvas', async () => {
  const { calls, canvas } = browser();
  const file = await cropImage('blob:fixture', area, 'clinic.png');
  assert.equal(file.name, 'clinic-square.jpg');
  assert.equal(file.type, 'image/jpeg');
  assert.equal(canvas.width, 1024);
  assert.equal(canvas.height, 1024);
  assert.deepEqual(calls, [
    ['fill', 0, 0, 1024, 1024],
    ['draw', 500, 0, 2000, 2000, 0, 0, 1024, 1024],
    ['encode', 'image/jpeg', 0.9],
  ]);
});
test('decode and canvas failures reject rather than accepting an unusable photo', async () => {
  for (const options of [
    { decodeError: true },
    { empty: true },
    { contextMissing: true },
    { type: 'image/png' },
  ]) {
    browser(options);
    await assert.rejects(cropImage('blob:fixture', area, 'photo.webp'));
  }
});
