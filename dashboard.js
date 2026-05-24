console.log("dashboard.js loaded - device status version");

let mainTrendChartInstance = null;
let revenueChartInstance = null;
let allRows = [];

const INITIAL_LOAD_LB = 25;
const GAP_TOLERANCE_LB = 0.001;

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

  let s = String(value).trim();
  s = s.replace(" ", "T");

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  return null;
}

// ======================================================
// DEVICE STATUS (CONNECTED / DISCONNECTED)
// ======================================================

async function updateDeviceStatus() {

  try {

    const { data, error } = await supabaseClient
      .from("device_status")
      .select("*")
      .eq("device_id", "hekone_v1")
      .single();

    if (error || !data) {

      setDisconnected("No device heartbeat detected");
      return;
    }

    const lastSeen = parseSupabaseDate(data.last_seen);

    if (!lastSeen) {
      setDisconnected("Invalid last_seen timestamp");
      return;
    }

    const secondsAgo =
      (Date.now() - lastSeen.getTime()) / 1000;

    const statusTitle = byId("statusTitle");
    const statusText = byId("statusText");
    const statusMeta = byId("statusMeta");
    const connectionStatus = byId("connectionStatus");
    const statusDot = document.querySelector(".status-dot");

    if (secondsAgo < 30) {

      if (statusTitle) statusTitle.textContent = "Connected";

      if (statusText) {
        statusText.textContent =
          `Device online • WiFi: ${data.wifi_ssid || "-"} • RSSI: ${data.rssi || "-"} dBm`;
      }

      if (statusMeta) {
        statusMeta.textContent =
          `Updated ${Math.round(secondsAgo)} sec ago`;
      }

      if (connectionStatus) {
        connectionStatus.textContent = "Live";
        connectionStatus.className = "status-pill live";
      }

      if (statusDot) {
        statusDot.style.background = "#5df2a6";
        statusDot.style.boxShadow =
          "0 0 12px rgba(93,242,166,0.7)";
      }

    } else {

      setDisconnected(
        `Last seen ${Math.round(secondsAgo)} sec ago`
      );
    }

  } catch (err) {

    console.error(err);
    setDisconnected("Status check failed");
  }
}

function setDisconnected(message) {

  const statusTitle = byId("statusTitle");
  const statusText = byId("statusText");
  const statusMeta = byId("statusMeta");
  const connectionStatus = byId("connectionStatus");
  const statusDot = document.querySelector(".status-dot");

  if (statusTitle)
    statusTitle.textContent = "Disconnected";

  if (statusText)
    statusText.textContent = message;

  if (statusMeta)
    statusMeta.textContent = "Waiting for heartbeat";

  if (connectionStatus) {
    connectionStatus.textContent = "Offline";
    connectionStatus.className = "status-pill error";
  }

  if (statusDot) {
    statusDot.style.background = "#ff5a5a";
    statusDot.style.boxShadow =
      "0 0 12px rgba(255,90,90,0.7)";
  }
}

// ======================================================
// LOAD DASHBOARD DATA
// ======================================================

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

// ======================================================
// FILTERING
// ======================================================

function filterRowsByRange(rows) {

  const rangeEl = byId("timeRange");
  const range = rangeEl ? rangeEl.value : "daily";

  const now = new Date();

  return rows.filter((item) => {

    const d = parseSupabaseDate(item.created_at);

    if (!d) return false;

    const diffDays =
      (now.getTime() - d.getTime()) /
      (1000 * 60 * 60 * 24);

    if (range === "daily") return diffDays <= 1;
    if (range === "weekly") return diffDays <= 7;
    if (range === "monthly") return diffDays <= 30;
    if (range === "yearly") return diffDays <= 365;

    return true;
  });
}

// ======================================================
// KPI
// ======================================================

function updateKPIs(rows) {

  let revenue = 0;
  let weightG = 0;
  let weightLb = 0;

  rows.forEach((item) => {

    revenue += Number(item.price || 0);
    weightG += Number(item.weight_g || 0);
    weightLb += Number(item.weight_lb || 0);
  });

  const txnCount = rows.length;
  const avgTicket =
    txnCount > 0 ? revenue / txnCount : 0;

  setText("revenueValue", formatCurrency(revenue));
  setText("transactionsValue", txnCount);
  setText("weightGValue", formatWeightG(weightG));
  setText("avgTicketValue", formatCurrency(avgTicket));

  setText(
    "recordedDispenseValue",
    `${formatWeightLb(weightLb)} lb`
  );

  const remaining =
    Math.max(INITIAL_LOAD_LB - weightLb, 0);

  setText(
    "remainingInventoryValue",
    `${formatWeightLb(remaining)} lb`
  );

  const pct =
    (weightLb / INITIAL_LOAD_LB) * 100;

  setText(
    "accountedFlowValue",
    formatPercent(pct)
  );
}

// ======================================================
// TABLE
// ======================================================

function updateTransactionsTable(rows) {

  const tbody = byId("transactionsTableBody");

  if (!tbody) return;

  tbody.innerHTML = "";

  rows.slice(0, 10).forEach((item) => {

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${item.created_at || "-"}</td>
      <td>${item.device_id || "-"}</td>
      <td>${formatWeightG(item.weight_g)}</td>
      <td>${formatWeightLb(item.weight_lb)}</td>
      <td>${item.calories || 0}</td>
      <td>${formatCurrency(item.price)}</td>
      <td>${item.mode || "-"}</td>
      <td>${item.transaction_id || "-"}</td>
    `;

    tbody.appendChild(tr);
  });
}

// ======================================================
// CHARTS
// ======================================================

function updateMainChart(rows) {

  const canvas = byId("mainTrendChart");

  if (!canvas) return;

  const labels = [];
  const values = [];

  rows.slice().reverse().forEach((item) => {

    labels.push(
      new Date(item.created_at)
      .toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    );

    values.push(Number(item.price || 0));
  });

  if (mainTrendChartInstance)
    mainTrendChartInstance.destroy();

  mainTrendChartInstance = new Chart(canvas, {

    type: "line",

    data: {
      labels,
      datasets: [{
        label: "Revenue",
        data: values,
        tension: 0.35,
        borderWidth: 2
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

function updateRevenueChart(rows) {

  const canvas = byId("transactionsChart");

  if (!canvas) return;

  const labels = [];
  const values = [];

  rows.slice().reverse().forEach((item) => {

    labels.push(
      new Date(item.created_at)
      .toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    );

    values.push(Number(item.price || 0));
  });

  if (revenueChartInstance)
    revenueChartInstance.destroy();

  revenueChartInstance = new Chart(canvas, {

    type: "bar",

    data: {
      labels,
      datasets: [{
        label: "Revenue",
        data: values,
        borderWidth: 1
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

// ======================================================
// RENDER
// ======================================================

function renderDashboard() {

  const filteredRows =
    filterRowsByRange(allRows);

  updateKPIs(filteredRows);
  updateTransactionsTable(filteredRows);
  updateMainChart(filteredRows);
  updateRevenueChart(filteredRows);
}

// ======================================================
// EVENTS
// ======================================================

const metricSelect = byId("metricSelect");
const timeRange = byId("timeRange");
const chartMode = byId("chartMode");

if (metricSelect)
  metricSelect.addEventListener(
    "change",
    renderDashboard
  );

if (timeRange)
  timeRange.addEventListener(
    "change",
    renderDashboard
  );

if (chartMode)
  chartMode.addEventListener(
    "change",
    renderDashboard
  );

// ======================================================
// START
// ======================================================

loadDashboardData();
updateDeviceStatus();

setInterval(loadDashboardData, 10000);
setInterval(updateDeviceStatus, 5000);
