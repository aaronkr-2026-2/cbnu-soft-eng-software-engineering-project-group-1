const checks = [{ id: 'api', path: '/' }, { id: 'live', path: '/health/live' }, { id: 'ready', path: '/health/ready' }];
const button = document.getElementById('refresh');
let running = false;

async function checkService(check) {
  const card = document.getElementById(check.id);
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let status;
  try {
    const response = await fetch(check.path, { cache: 'no-store', signal: controller.signal });
    status = response.status;
    const data = await response.json();
    const healthy = response.status === 200 && data.status === 'ok' &&
      (check.id !== 'ready' || data.database === 'connected');
    card.dataset.state = healthy ? 'ok' : 'error';
    card.querySelector('.badge').textContent = healthy ? 'Operational' : 'Unavailable';
    card.querySelector('.detail').textContent = check.id === 'api' && healthy
      ? String(data.name) + ' · ' + String(data.version) + ' · ' + String(data.status)
      : check.id === 'ready'
        ? (healthy ? 'Database connected and ready.' : 'Database is not ready.')
        : (healthy ? 'The API is responding.' : 'The service reported an unhealthy response.');
    return healthy;
  } catch {
    card.dataset.state = 'error';
    card.querySelector('.badge').textContent = 'Check failed';
    card.querySelector('.detail').textContent = controller.signal.aborted
      ? 'No complete response within 8 seconds.'
      : 'Could not read a valid response. Check your connection and try again.';
    return false;
  } finally {
    clearTimeout(timeout);
    card.querySelector('.meta').textContent = (status ? 'HTTP ' + status : 'No HTTP response') + ' · ' + Math.round(performance.now() - started) + ' ms';
  }
}

async function refresh() {
  if (running) return;
  running = true;
  button.disabled = true;
  button.textContent = 'Checking…';
  document.getElementById('summary').textContent = 'Checking services…';
  const results = await Promise.all(checks.map(checkService));
  document.getElementById('summary').textContent = results.every(Boolean)
    ? 'All systems operational' : 'One or more checks need attention';
  document.getElementById('updated').textContent = 'Last checked ' + new Date().toLocaleString();
  button.disabled = false;
  button.textContent = 'Refresh status';
  running = false;
}
button.addEventListener('click', refresh);
setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
void refresh();
