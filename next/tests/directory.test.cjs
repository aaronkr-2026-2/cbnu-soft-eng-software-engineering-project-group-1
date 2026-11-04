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
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const {
  DirectoryNavigation,
  directoryRead,
  parseDirectoryUrl,
  directoryUrl,
  defaultDirectory,
  directoryCities,
  directorySpecialties,
} = require('../libs/directory.ts');
const {
  searchDoctors,
  suggestDoctorNames,
} = require('../libs/api/directory.ts');
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
process.env.NEXT_PUBLIC_GRAPHQL_URL = 'http://api.example.test/graphql';
const signal = () => new AbortController().signal;
function fixture(context, url = '/doctors') {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const navigation = new DirectoryNavigation(async (filters, replace) => {
    calls.push({ filters, replace });
    return true;
  });
  navigation.restore(url);
  return {
    navigation,
    calls,
    tick: (ms = 300) => context.mock.timers.tick(ms),
  };
}
test('deep links round-trip literal Unicode/URL symbols and every filter', () => {
  const filters = {
    name: '김 [A]&+?',
    city: 'SEOUL',
    specialty: 'DENTIST',
    sort: 'NAME_DESC',
    page: 2,
  };
  assert.deepEqual(
    parseDirectoryUrl(directoryUrl('/doctors', filters)),
    filters,
  );
  assert.equal(directoryUrl('/doctors', defaultDirectory), '/doctors');
});
test('malformed, repeated, unknown, out-of-bound URL values use safe defaults', () => {
  for (const page of ['-1', '0', '1001', '1.5', 'Infinity', '2x', '01'])
    assert.equal(parseDirectoryUrl('/doctors?page=' + page).page, 1);
  assert.deepEqual(
    parseDirectoryUrl(
      '/doctors?name=First&name=Second&city=BAD&specialty=BAD&sort=BAD&page=2&page=3',
    ),
    defaultDirectory,
  );
  assert.equal(
    Array.from(parseDirectoryUrl('/doctors?name=' + '김'.repeat(101)).name)
      .length,
    100,
  );
  assert.equal(parseDirectoryUrl('/doctors?page=1000').page, 1000);
  assert.equal(directoryCities.length, 10);
  assert.equal(directorySpecialties.length, 13);
});
test('typing debounces and replaces history while resetting page', (context) => {
  const { navigation, calls, tick } = fixture(
    context,
    '/doctors?city=BUSAN&page=3',
  );
  navigation.edit('K');
  tick(200);
  navigation.edit('Kim');
  tick(299);
  assert.equal(calls.length, 0);
  tick(1);
  assert.deepEqual(calls, [
    {
      replace: true,
      filters: { ...defaultDirectory, name: 'Kim', city: 'BUSAN' },
    },
  ]);
});
test('Enter and suggestion selection submit immediately with a history entry and no later debounce', async (context) => {
  const { navigation, calls, tick } = fixture(context, '/doctors?page=3');
  navigation.edit('Ki');
  await navigation.submit('Kim');
  tick(1000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].replace, false);
  assert.equal(calls[0].filters.name, 'Kim');
  assert.equal(calls[0].filters.page, 1);
});
test('filter/sort changes commit current draft and cancel pending typing', async (context) => {
  const { navigation, calls, tick } = fixture(context, '/doctors?page=5');
  navigation.edit('Kim');
  await navigation.filter({
    city: 'SEOUL',
    specialty: 'DENTIST',
    sort: 'NAME_DESC',
  });
  tick(1000);
  assert.deepEqual(calls, [
    {
      replace: false,
      filters: {
        name: 'Kim',
        city: 'SEOUL',
        specialty: 'DENTIST',
        sort: 'NAME_DESC',
        page: 1,
      },
    },
  ]);
});
test('page changes only page; clear resets all filters and page', async (context) => {
  const { navigation, calls, tick } = fixture(
    context,
    '/doctors?name=Kim&city=BUSAN&specialty=DENTIST&sort=NAME_DESC&page=2',
  );
  navigation.edit('Uncommitted');
  await navigation.page(3);
  tick(1000);
  assert.deepEqual(calls[0].filters, {
    name: 'Kim',
    city: 'BUSAN',
    specialty: 'DENTIST',
    sort: 'NAME_DESC',
    page: 3,
  });
  await navigation.clear();
  assert.deepEqual(calls[1].filters, defaultDirectory);
});
test('Back/Forward restoration cancels typing and restores controls from the URL', (context) => {
  const { navigation, calls, tick } = fixture(context);
  navigation.edit('Stale');
  navigation.leaving('/doctors?city=BUSAN');
  navigation.restore('/doctors?city=BUSAN');
  tick(1000);
  assert.equal(calls.length, 0);
  assert.equal(navigation.snapshot().draft, '');
  assert.equal(navigation.snapshot().filters.city, 'BUSAN');
  navigation.restore('/doctors?name=Kim&page=2');
  assert.equal(navigation.snapshot().draft, 'Kim');
  assert.equal(navigation.snapshot().filters.page, 2);
});
test('typing during own route transition survives completion and later commits', async (context) => {
  const { navigation, calls, tick } = fixture(context);
  await navigation.submit('Kim');
  navigation.leaving('/doctors?name=Kim');
  navigation.edit('Kim Lee');
  navigation.restore('/doctors?name=Kim');
  assert.equal(navigation.snapshot().draft, 'Kim Lee');
  tick();
  assert.equal(calls[1].filters.name, 'Kim Lee');
});
test('rapid deliberate selections compose using the pending target', async (context) => {
  const { navigation, calls } = fixture(context);
  await navigation.filter({ city: 'SEOUL' });
  await navigation.filter({ specialty: 'DENTIST' });
  assert.equal(calls[1].filters.city, 'SEOUL');
  assert.equal(calls[1].filters.specialty, 'DENTIST');
});
test('navigation failure recovers the previous committed URL and allows retry', async () => {
  const navigation = new DirectoryNavigation(async () => {
    throw new Error('private details');
  });
  navigation.restore('/doctors');
  await navigation.filter({ city: 'SEOUL' });
  assert.equal(navigation.snapshot().navigating, false);
  assert.equal(navigation.snapshot().filters.city, '');
  assert.match(navigation.snapshot().error, /Please try again/);
  assert.doesNotMatch(navigation.snapshot().error, /private/);
});
test('public search sends server filters, fixed pagination, no credentials and no cache', async () => {
  const filters = {
    ...defaultDirectory,
    name: ' Kim ',
    city: 'SEOUL',
    specialty: 'DENTIST',
    sort: 'NAME_DESC',
    page: 2,
  };
  global.fetch = async (url, options) => {
    assert.equal(url, 'http://api.example.test/graphql');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, undefined);
    const body = JSON.parse(options.body);
    assert.match(body.query, /searchDoctors/);
    assert.deepEqual(body.variables.input, {
      name: 'Kim',
      city: 'SEOUL',
      specialty: 'DENTIST',
      sort: 'NAME_DESC',
      page: 2,
      limit: 12,
    });
    return Response.json({
      data: { searchDoctors: { entries: [], total: 25, page: 2, limit: 12 } },
    });
  };
  assert.equal((await searchDoctors(filters, signal())).total, 25);
});
test('suggestions skip short names and send only name/city/specialty', async () => {
  global.fetch = () => assert.fail('Short name must not fetch');
  assert.deepEqual(
    await suggestDoctorNames(
      { name: ' A ', city: '', specialty: '' },
      signal(),
    ),
    [],
  );
  global.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body).variables.input, {
      name: 'Kim',
      city: 'BUSAN',
    });
    return Response.json({ data: { suggestDoctorNames: ['Kim'] } });
  };
  assert.deepEqual(
    await suggestDoctorNames(
      { name: ' Kim ', city: 'BUSAN', specialty: '' },
      signal(),
    ),
    ['Kim'],
  );
});
test('HTTP and GraphQL errors do not expose server details', async () => {
  for (const response of [
    Response.json({ message: 'private internal error' }, { status: 503 }),
    Response.json({ errors: [{ message: 'private internal error' }] }),
  ]) {
    global.fetch = async () => response;
    await assert.rejects(
      searchDoctors(defaultDirectory, signal()),
      (error) =>
        /Please try again/.test(error.message) &&
        !/private/.test(error.message),
    );
  }
});
test('malformed page and suggestion responses fail instead of showing a successful empty result', async () => {
  global.fetch = async () =>
    Response.json({
      data: { searchDoctors: { entries: [], total: -1, page: 1, limit: 12 } },
    });
  await assert.rejects(searchDoctors(defaultDirectory, signal()));
  for (const names of [Array(9).fill('Kim'), [42]]) {
    global.fetch = async () =>
      Response.json({ data: { suggestDoctorNames: names } });
    await assert.rejects(
      suggestDoctorNames({ name: 'Kim', city: '', specialty: '' }, signal()),
    );
  }
});
test('aborting an obsolete request propagates to fetch', async () => {
  const controller = new AbortController();
  let requestSignal;
  global.fetch = async (_url, options) => {
    requestSignal = options.signal;
    return new Promise((_resolve, reject) =>
      options.signal.addEventListener('abort', () =>
        reject(new Error('aborted')),
      ),
    );
  };
  const pending = searchDoctors(defaultDirectory, controller.signal);
  controller.abort();
  await assert.rejects(pending);
  assert.equal(requestSignal.aborted, true);
});

test('late results and suggestions cannot replace a newer result even when transport ignores abort', async () => {
  for (const lateFailure of [false, true]) {
    const old = new AbortController();
    let resolve, reject;
    const pending = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const received = [];
    const failed = [];
    const stale = directoryRead(
      old.signal,
      () => pending,
      (data) => received.push(data),
      (error) => failed.push(error),
    );
    old.abort();
    await directoryRead(
      new AbortController().signal,
      async () => 'new results',
      (data) => received.push(data),
      (error) => failed.push(error),
    );
    if (lateFailure) reject(new Error('old failure'));
    else resolve('old results');
    await stale;
    assert.deepEqual(received, ['new results']);
    assert.deepEqual(failed, []);
  }
});
