console.log("dashboard.js loaded - simplified HEKONE store dashboard");

let mainTrendChartInstance = null;
let allRows = [];

const INITIAL_LOAD_LB = 25;
const DEVICE_ID = "hekone_v1";
const DEVICE_ONLINE_THRESHOLD_SEC = 30;

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = byId(id);
  if (!el) return;
  el.textContent = value;
}

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatWeightG(value) {
  return Number(value || 0).toFixed(2);
}

function formatWeightLb(value) {
  return Number(value || 0).toFixed(3);
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseSupabaseDate(value) {
  if (!value) return null;
  const d = new Date(String(value).replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

function getWifiLevel(rssi) {
  const value = Number(rssi);
  if (!Number.isFinite(value)) return 0;
  if (value >= -55) return 4;
  if (value >= -67) return 3;
  if (value >= -75) return 2;
  return 1;
}

function updateWifiBars(rssi, isOnline) {
  const bars = byId("wifiBars");
  const text = byId("wifiSignalText");

  if (!bars || !text) return;

  bars.className = "wifi-bars";

  if (!isOnline || rssi === null || rssi === undefined) {
    text.textContent = "WiFi Signal: Offline";
    return;
  }

  const level = getWifiLevel(rssi);
  bars.classList.add(`level-${level}`);

  let label = "Weak";
  if (level === 4) label = "Excellent";
  if (level === 3) label = "Good";
  if (level === 2) label = "Fair";

  text.textContent = `WiFi Signal: ${label} (${rssi} dBm)`;
}

function setConnected(data, secondsAgo) {
  setText("statusTitle", "Connected");

  setText(
    "statusText",
    `Device online • WiFi: ${data.wifi_ssid || "-"} • RSSI: ${data.rssi ?? "-"} dBm • IP: ${data.local_ip || "-"}`
  );

  setText("statusMeta", `Updated ${secondsAgo} sec ago`);

  const connectionStatus = byId("connectionStatus");
  if (connectionStatus) {
    connectionStatus.textContent = "Live";
    connectionStatus.className = "status-pill live";
  }

  const statusDot = document.querySelector(".status-dot");
  if (statusDot) {
    statusDot.style.background = "#5df2a6";
    statusDot.style.boxShadow = "0 0 12px rgba(93,242,166,0.7)";
  }

  updateWifiBars(data.rssi, true);
}

function setDisconnected(message) {
  setText("statusTitle", "Disconnected");
  setText("statusText", message);
  setText("statusMeta", "Waiting for heartbeat");

  const connectionStatus = byId("connectionStatus");
  if (connectionStatus) {
    connectionStatus.textContent = "Offline";
    connectionStatus.className = "status-pill error";
  }

  const statusDot = document.querySelector(".status-dot");
  if (statusDot) {
    statusDot.style.background = "#ff5a5a";
    statusDot.style.boxShadow = "0 0 12px rgba(255,90,90,0.7)";
  }

  updateWifiBars(null, false);
}

async function updateDeviceStatus() {
  try {
    const { data, error } = await supabaseClient
      .from("device_status")
      .select("*")
      .eq("device_id", DEVICE_ID)
      .single();

    if (error || !data) {
      setDisconnected("No device heartbeat detected");
      return;
    }

    const lastSeenMs = Date.parse(data.last_seen);
    const nowMs = Date.now();

    if (!lastSeenMs || Number.isNaN(lastSeenMs)) {
      setDisconnected("Invalid last_seen timestamp");
      return;
    }

    const secondsAgo = Math.floor((nowMs - lastSeenMs) / 1000);

    if (secondsAgo <= DEVICE_ONLINE_THRESHOLD_SEC) {
      setConnected(data, secondsAgo);
    } else {
      setDisconnected(`Last seen ${secondsAgo} sec ago`);
    }
  } catch (err) {
    console.error(err);
    setDisconnected("Status check failed");
  }
}

async function loadDashboardData() {
  try {
    const { data, error } = await supabaseClient
      .from("traction_events")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    allRows = Array.isArray(data) ? data : [];
    renderDashboard();
  } catch (err) {
    console.error(err);
  }
}

function filterRowsByRange(rows) {
  const range = byId("timeRange") ? byId("timeRange").value : "daily";
  const now = new Date();

  return rows.filter((item) => {
    const d = parseSupabaseDate(item.created_at);
    if (!d) return false;

    const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);

    if (range === "daily") return diffDays <= 1;
    if (range === "weekly") return diffDays <= 7;
    if (range === "monthly") return diffDays <= 
