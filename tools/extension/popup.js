/**
 * Tiny status popup. Asks the service worker for the current state via
 * a runtime message; doesn't talk to the bridge directly so we don't
 * accidentally toggle anything just by opening the popup.
 */
const stateEl = document.getElementById("state");
const hostEl = document.getElementById("host");
const portEl = document.getElementById("port");
const hostsEl = document.getElementById("hosts");

async function refresh() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "ninja2:get-state" });
    if (!res?.ok) {
      stateEl.textContent = "ERROR";
      stateEl.className = "state";
      return;
    }
    const blocked = !!res.lastBlocked;
    stateEl.textContent = blocked ? "BLOCK" : "idle";
    stateEl.className = "state " + (blocked ? "on" : "off");
    hostEl.textContent = res.host || "—";
    portEl.textContent = String(res.cfg?.port ?? "—");
    hostsEl.textContent = (res.cfg?.hosts || []).join(", ") || "—";
  } catch (err) {
    stateEl.textContent = "ERROR";
    stateEl.className = "state";
    hostEl.textContent = String(err?.message || err);
  }
}

document.getElementById("recheck").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "ninja2:reevaluate" });
  refresh();
});

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refresh();
