/**
 * Options page wiring. Keeps the same default list as the service worker
 * so a fresh install starts with sensible behavior.
 */
const DEFAULT_HOSTS = ["x.com", "twitter.com", "youtube.com"];
const DEFAULT_PORT = 7727;

const hostsEl = document.getElementById("hosts");
const portEl = document.getElementById("port");
const statusEl = document.getElementById("status");

function flash(msg, isError) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", !!isError);
  if (msg) {
    setTimeout(() => {
      if (statusEl.textContent === msg) statusEl.textContent = "";
      statusEl.classList.remove("error");
    }, 2500);
  }
}

function parseHosts(raw) {
  return raw
    .split(/\r?\n/)
    .map((h) => h.trim())
    .filter((h) => h && !h.startsWith("#"))
    .map((h) => h.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
}

async function load() {
  const stored = await chrome.storage.sync.get({
    hosts: DEFAULT_HOSTS,
    port: DEFAULT_PORT,
  });
  hostsEl.value = (stored.hosts || DEFAULT_HOSTS).join("\n");
  portEl.value = stored.port || DEFAULT_PORT;
}

async function save() {
  const hosts = parseHosts(hostsEl.value);
  const portRaw = Number(portEl.value);
  const port =
    Number.isFinite(portRaw) && portRaw > 0 && portRaw < 65536
      ? portRaw
      : DEFAULT_PORT;
  await chrome.storage.sync.set({ hosts, port });
  // Re-paint canonical form so the user sees the cleaned list.
  hostsEl.value = hosts.join("\n");
  portEl.value = port;
  // Wake the service worker so the new list takes effect immediately.
  try {
    await chrome.runtime.sendMessage({ type: "ninja2:reevaluate" });
  } catch {
    // Fine — the worker will pick it up on the next event/alarm.
  }
  flash("Saved.");
}

async function ping() {
  const port = Number(portEl.value) || DEFAULT_PORT;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/block`, {
      cache: "no-store",
    });
    const json = await res.json();
    flash(`OK · port ${port} · blockMode=${json.blockMode}`);
  } catch (err) {
    flash(`Unreachable: ${err?.message || err}`, true);
  }
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("ping").addEventListener("click", ping);
load();
