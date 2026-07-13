// Facebook Page Collector (legacy) — control page.
// Same logic as the original popup: drives START_COLLECT / START_VISIT / STOP
// in background.js and polls status. Kept intact so the FB task still works.

const collectBtn = document.getElementById('collectBtn');
const visitBtn = document.getElementById('visitBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');

function render(status) {
  if (!status) { statusEl.textContent = 'Ready'; progressEl.style.width = '0%'; return; }
  statusEl.textContent = status.message || status.phase || 'Ready';
  const pct = status.total ? Math.round((status.done / status.total) * 100) : 0;
  progressEl.style.width = pct + '%';
  collectBtn.disabled = !!status.running;
  visitBtn.disabled = !!status.running;
}

async function poll() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (res?.ok) render(res.status);
  } catch {}
}

function readOptions() {
  return {
    target: parseInt(document.getElementById('target').value, 10) || 10,
    delay: parseInt(document.getElementById('delay').value, 10) || 1200
  };
}

collectBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Starting...';
  const res = await chrome.runtime.sendMessage({ type: 'START_COLLECT', options: readOptions() });
  if (!res?.ok) statusEl.textContent = res?.error || 'Failed to start';
});

visitBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Starting...';
  const res = await chrome.runtime.sendMessage({ type: 'START_VISIT', options: readOptions() });
  if (!res?.ok) statusEl.textContent = res?.error || 'Failed to start';
});

stopBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'STOP_SCRAPE' });
});

document.getElementById('crmBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('crm/crm.html') });
});

poll();
setInterval(poll, 1000);
