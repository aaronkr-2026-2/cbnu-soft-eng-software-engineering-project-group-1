// Owns BOTH mongod processes and all files. Never loads .env or uses app DB URIs.
const { spawn } = require('node:child_process');
const { mkdtemp, mkdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createServer } = require('node:net');
const { setTimeout: delay } = require('node:timers/promises');
const { MongoClient } = require('mongodb');

const processes = [];
let temp;
let cleaning;
async function cleanup() {
  cleaning ??= (async () => {
    for (const child of processes.slice().reverse()) {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null)
        continue;
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      const kill = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(kill);
    }
    if (temp) await rm(temp, { recursive: true, force: true });
  })();
  return cleaning;
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void cleanup().then(() => process.exit(1));
  });
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function startMongo(name, replica) {
  const port = await freePort();
  const path = join(temp, name);
  await mkdir(path);
  const args = [
    '--dbpath',
    path,
    '--bind_ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--wiredTigerCacheSizeGB',
    '0.25',
    '--logpath',
    join(path, 'mongod.log'),
  ];
  if (replica) args.push('--replSet', 'bookingTest', '--oplogSize', '128');
  const child = spawn(process.env.MONGOD_BINARY || 'mongod', args, {
    stdio: 'ignore',
  });
  processes.push(child);
  let startError;
  child.on('error', (error) => {
    startError = error;
  });
  const uri = `mongodb://127.0.0.1:${port}/?directConnection=true`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 500 });
  const deadline = Date.now() + 30000;
  try {
    while (true) {
      if (startError)
        throw new Error(
          'Cannot start mongod. Install MongoDB or set MONGOD_BINARY.',
        );
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error('Disposable mongod exited before becoming ready');
      try {
        await client.connect();
        break;
      } catch {
        if (Date.now() >= deadline)
          throw new Error('Disposable mongod startup timed out');
        await delay(100);
      }
    }
    if (replica) {
      await client
        .db('admin')
        .command({
          replSetInitiate: {
            _id: 'bookingTest',
            members: [{ _id: 0, host: `127.0.0.1:${port}` }],
          },
        });
      while (
        !(await client.db('admin').command({ hello: 1 })).isWritablePrimary
      ) {
        if (Date.now() >= deadline)
          throw new Error('Replica-set election timed out');
        await delay(100);
      }
    }
  } finally {
    await client.close();
  }
  return uri;
}
async function main() {
  temp = await mkdtemp(join(tmpdir(), 'medconnect-booking-'));
  const replica = await startMongo('replica', true);
  const standalone = await startMongo('standalone', false);
  const child = spawn(
    process.execPath,
    [
      '--experimental-vm-modules',
      require.resolve('jest/bin/jest'),
      '--config',
      './test/jest-booking.json',
      '--runInBand',
    ],
    {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        BOOKING_TEST_URI: replica,
        BOOKING_TEST_STANDALONE_URI: standalone,
        BOOKING_TEST_DISPOSABLE: '1',
      },
    },
  );
  processes.push(child);
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  process.exitCode = result;
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
