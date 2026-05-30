/**
 * Ninja2 Block Watcher — MV3 service worker.
 *
 * Watches the active tab's hostname and pings the Ninja2 desktop companion
 * (loopback HTTP bridge, default 127.0.0.1:7727) when the user enters or
 * leaves a configured "blocked" site.
 *
 * Design notes:
 * - We only fire on *transitions* (debounced via `lastBlocked`) so rapid
 *   navigation / SPA URL updates don't spam the bridge.
 * - MV3 service workers can be evicted at any time, so the matching state
 *   is persisted in `chrome.storage.session` and an `alarms` 1-minute tick
 *   re-checks the active tab in case events were missed across a sleep.
 * - The bridge call is best-effort; failures (companion not running) are
 *   logged but never thrown.
 */

const DEFAULT_HOSTS = ["x.com", "twitter.com", "youtube.com"];
const DEFAULT_PORT = 7727;
const STATE_KEY = "ninja2:lastBlocked";
const ALARM_NAME = "ninja2-tick";

async function getConfig() {
  const stored = await chrome.storage.sync.get({
    hosts: DEFAULT_HOSTS,
    port: DEFAULT_PORT,
    token: "",
  });
  return {
    hosts: Array.isArray(stored.hosts) ? stored.hosts : DEFAULT_HOSTS,
    port: Number(stored.port) || DEFAULT_PORT,
    token: typeof stored.token === "string" ? stored.token.trim() : "",
  };
}

async function getLastBlocked() {
  const got = await chrome.storage.session.get({ [STATE_KEY]: false });
  return !!got[STATE_KEY];
}

async function setLastBlocked(value) {
  await chrome.storage.session.set({ [STATE_KEY]: !!value });
}

/**
 * Suffix-match against a list of host patterns.
 * `x.com` matches `x.com` and `*.x.com` (e.g. `www.x.com`, `mobile.x.com`).
 */
function hostMatches(hostname, patterns) {
  const h = hostname.toLowerCase();
  return patterns.some((raw) => {
    if (!raw) return false;
    const p = String(raw).trim().toLowerCase().replace(/^\./, "");
    if (!p) return false;
    return h === p || h.endsWith("." + p);
  });
}

async function pingCompanion(blocked, port, token) {
  if (!token) {
    console.warn("[ninja2-ext] block bridge token not set (extension options)");
    return;
  }
  const url = `http://127.0.0.1:${port}/block`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: blocked, token }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[ninja2-ext] ping rejected", res.status, url);
      return;
    }
    console.debug("[ninja2-ext] ping", { url, blocked });
  } catch (err) {
    console.warn("[ninja2-ext] companion unreachable", url, err);
  }
}

function isInspectableUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function getActiveTab() {
  // `lastFocusedWindow: true` ignores background windows that aren't
  // really visible to the user (e.g. minimized DevTools).
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tabs[0];
}

async function evaluateActiveTab() {
  const cfg = await getConfig();
  const tab = await getActiveTab();
  let blocked = false;
  if (tab?.url && isInspectableUrl(tab.url)) {
    try {
      const u = new URL(tab.url);
      blocked = hostMatches(u.hostname, cfg.hosts);
    } catch {
      blocked = false;
    }
  }
  const previous = await getLastBlocked();
  if (blocked === previous) return;
  await setLastBlocked(blocked);
  await pingCompanion(blocked, cfg.port, cfg.token);
}

// ---- Event wiring ----------------------------------------------------------

chrome.tabs.onActivated.addListener(() => {
  evaluateActiveTab();
});

chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  // Only react to URL/status changes on the *active* tab — background tabs
  // refreshing themselves shouldn't toggle block mode.
  if (!tab.active) return;
  if (info.status === "complete" || typeof info.url === "string") {
    evaluateActiveTab();
  }
});

chrome.windows.onFocusChanged.addListener(() => {
  evaluateActiveTab();
});

// 1-minute heartbeat. MV3 service workers can sleep and miss events;
// the alarm wakes us up so the state can never drift indefinitely.
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  evaluateActiveTab();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  evaluateActiveTab();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) evaluateActiveTab();
});

// Allow the popup / options page to force a re-evaluation (e.g. after the
// user edits the host list).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ninja2:reevaluate") {
    evaluateActiveTab().then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  if (msg?.type === "ninja2:get-state") {
    Promise.all([getConfig(), getLastBlocked(), getActiveTab()]).then(
      ([cfg, lastBlocked, tab]) => {
        let host = "";
        try {
          if (tab?.url) host = new URL(tab.url).hostname;
        } catch {
          host = "";
        }
        sendResponse({ ok: true, cfg, lastBlocked, host });
      }
    );
    return true;
  }
  return false;
});
