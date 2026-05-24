console.log("dashboard.js loaded - device status + WiFi signal bars");

let mainTrendChartInstance = null;
let revenueChartInstance = null;
let allRows = [];

const INITIAL_LOAD_LB = 25;
const GAP_TOLERANCE_LB = 0.001;
const DEVICE_ID = "hekone_v1";
const DEVICE_ONLINE_THRESHOLD_SEC = 30;

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = byId(id);
  if (!el) return false;
  el.textContent = value;
  return true;
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
  const statusTitle = byId("statusTitle");
  const statusText = byId("statusText");
  const statusMeta = byId("statusMeta");
  const connectionStatus = byId("connectionStatus");
  const statusDot = document.querySelector(".status-dot");

  if (statusTitle) statusTitle.textContent = "Connected";

  if (statusText) {
    statusText.textContent =
      `Device online • WiFi: ${data.wifi_ssid || "-"} • RSSI: ${data.rssi ?? "-"} dBm • IP: ${data.local_ip || "-"}`;
  }

  if (statusMeta) {
    statusMeta.textContent = `Updated ${secondsAgo} sec ago`;
  }

  if (connectionStatus) {
    connectionStatus.textContent = "Live";
    connectionStatus.className = "status-pill live";
  }

  if (statusDot) {
    statusDot.style.background = "#5df2a6";
    statusDot.style.boxShadow = "0 0 12px rgba(93,242,166,0.7)";
  }

  updateWifiBars(data.rssi, true);
}

function setDisconnected(message) {
  const statusTitle = byId("statusTitle");
  const statusText = byId("statusText");
  const statusMeta = byId("statusMeta");
  const connectionStatus = byId("connectionStatus");
  const statusDot = document.querySelector(".status-dot");

  if (statusTitle) statusTitle.textContent = "Disconnected";
  if (statusText) statusText.textContent = message;
  if (statusMeta) statusMeta.textContent = "Waiting for heartbeat";

  if (connectionStatus) {
    connectionStatus.textContent = "Offline";
    connectionStatus.className = "status-pill error";
  }

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
  const rangeEl = byId("timeRange");
  const range = rangeEl ? rangeEl.value : "daily";
  const now = new Date();

  return rows.filter((item) => {
    const d = parseSupabaseDate(item.created_at);
    if (!d) return false;

    const diffDays =
      (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);

    if (range === "daily") return diffDays <= 1;
    if (range === "weekly") return diffDays <= 7;
    if (range === "monthly") return diffDays <= 30;
    if (range === "yearly") return diffDays <= 365;

    return true;
  });
}

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
  const avgTicket = txnCount > 0 ? revenue / txnCount : 0;

  setText("revenueValue", formatCurrency(revenue));
  setText("transactionsValue", String(txnCount));
  setText("weightGValue", formatWeightG(weightG));
  setText("avgTicketValue", formatCurrency(avgTicket));

  setText("revenueSubtext", "Selected range total revenue");
  setText("transactionsSubtext", "Completed dispensing events");
  setText("weightGSubtext", "Total dispensed weight in grams");
  setText("avgTicketSubtext", "Average value per transaction");

  const recordedDispenseLb = weightLb;
  const projectedRemainingLb = Math.max(INITIAL_LOAD_LB - recordedDispenseLb, 0);
  const accountedFlowPct = clamp((recordedDispenseLb / INITIAL_LOAD_LB) * 100, 0, 100);
  const inventoryGapLb = Math.max(
    0,
    INITIAL_LOAD_LB - (recordedDispenseLb + projectedRemainingLb)
  );

  setText("initialLoadValue", `${formatWeightLb(INITIAL_LOAD_LB)} lb`);
  setText("recordedDispenseValue", `${formatWeightLb(recordedDispenseLb)} lb`);
  setText("remainingInventoryValue", `${formatWeightLb(projectedRemainingLb)} lb`);
  setText("accountedFlowValue", formatPercent(accountedFlowPct));
  setText("inventoryGapValue", `${formatWeightLb(inventoryGapLb)} lb`);

  setText("initialLoadSubtext", "Configured cycle starting inventory");
  setText("recordedDispenseSubtext", "Tracked outflow captured by transactions");
  setText("remainingInventorySubtext", "Projected inventory remaining in cycle");
  setText("accountedFlowSubtext", "Recorded outflow versus configured load");

  if (inventoryGapLb <= GAP_TOLERANCE_LB) {
    setText("inventoryGapSubtext", "Balanced under the current projection model");
  } else {
    setText("inventoryGapSubtext", "Detected gap in inventory projection");
  }

  setText(
    "inventoryBannerText",
    `Projection based on a configured ${formatWeightLb(INITIAL_LOAD_LB)} lb loaded cycle.`
  );

  const gapCard = byId("inventoryGapCard");
  if (gapCard) {
    gapCard.classList.remove("gap-ok", "gap-alert");
    gapCard.classList.add(inventoryGapLb <= GAP_TOLERANCE_LB ? "gap-ok" : "gap-alert");
  }
}

function updateTransactionsTable(rows) {
  const tbody = byId("transactionsTableBody");
  const tableSummary = byId("tableSummary");

  if (!tbody) return;

  tbody.innerHTML = "";

  const recentRows = rows.slice(0, 10);
  if (tableSummary) tableSummary.textContent = `${recentRows.length} rows`;

  recentRows.forEach((item) => {
    const parsedDate = parseSupabaseDate(item.created_at);
    const displayTime = parsedDate ? parsedDate.toLocaleString() : item.created_at || "-";
    const mode = String(item.mode || "-").toLowerCase();

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${displayTime}</td>
      <td><span class="device-chip">${item.device_id ?? "-"}</span></td>
      <td>${formatWeightG(item.weight_g)}</td>
      <td>${formatWeightLb(item.weight_lb)}</td>
      <td>${item.calories ?? 0}</td>
      <td class="price-cell">${formatCurrency(item.price)}</td>
      <td><span class="mode-badge ${mode}">${item.mode ?? "-"}</span></td>
      <td class="txn-id">${item.transaction_id ?? item.id ?? "-"}</td>
    `;

    tbody.appendChild(tr);
  });
}

function getMetricConfig(metric) {
  if (metric === "weight_g") {
    return { key: "weight_g", label: "Weight (g)", title: "Weight (g) Trend" };
  }

  if (metric === "weight_lb") {
    return { key: "weight_lb", label: "Weight (lb)", title: "Weight (lb) Trend" };
  }

  if (metric === "calories") {
    return { key: "calories", label: "Calories", title: "Calories Trend" };
  }

  return { key: "price", label: "Price", title: "Price Trend" };
}

function makeCumulative(series) {
  let running = 0;
  return series.map((value) => {
    running += Number(value || 0);
    return Number(running.toFixed(2));
  });
}

function groupMetricByRange(rows, metricKey) {
  const labels = [];
  const metricSeries = [];
  const revenueSeries = [];

  rows.slice().reverse().forEach((item) => {
    const d = parseSupabaseDate(item.created_at);

    labels.push(
      d
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "-"
    );

    metricSeries.push(Number(item[metricKey] || 0));
    revenueSeries.push(Number(item.price || 0));
  });

  return { labels, metricSeries, revenueSeries };
}

function updateMainChart(rows) {
  const metricEl = byId("metricSelect");
  const chartModeEl = byId("chartMode");
  const canvas = byId("mainTrendChart");

  if (!metricEl || !canvas) return;

  const metric = metricEl.value;
  const chartMode = chartModeEl ? chartModeEl.value : "incremental";
  const config = getMetricConfig(metric);
  const grouped = groupMetricByRange(rows, config.key);

  let chartSeries = grouped.metricSeries;
  if (chartMode === "cumulative") {
    chartSeries = makeCumulative(grouped.metricSeries);
  }

  setText(
    "mainChartTitle",
    chartMode === "cumulative"
      ? `${config.title} (Cumulative)`
      : `${config.title} (Incremental)`
  );

  setText(
    "mainChartNote",
    chartMode === "cumulative"
      ? `Cumulative ${config.label.toLowerCase()}`
      : `Trend for ${config.label.toLowerCase()}`
  );

  if (mainTrendChartInstance) mainTrendChartInstance.destroy();

  mainTrendChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: grouped.labels,
      datasets: [
        {
          label: config.label,
          data: chartSeries,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#dce6ff" }
        }
      },
      scales: {
        x: {
          ticks: { color: "#aeb8d8", maxRotation: 0, autoSkip: true },
          grid: { color: "rgba(255,255,255,0.06)" }
        },
        y: {
          ticks: { color: "#aeb8d8" },
          grid: { color: "rgba(255,255,255,0.06)" }
        }
      }
    }
  });
}

function updateRevenueChart(rows) {
  const chartModeEl = byId("chartMode");
  const canvas = byId("transactionsChart");

  if (!canvas) return;

  const chartMode = chartModeEl ? chartModeEl.value : "incremental";
  const grouped = groupMetricByRange(rows, "price");

  let revenueSeries = grouped.revenueSeries;
  if (chartMode === "cumulative") {
    revenueSeries = makeCumulative(grouped.revenueSeries);
  }

  setText(
    "revenueChartTitle",
    chartMode === "cumulative" ? "Cumulative Revenue" : "Revenue by Period"
  );

  setText(
    "revenueChartNote",
    chartMode === "cumulative"
      ? "Running total revenue across selected range"
      : "Aggregated revenue across selected range"
  );

  if (revenueChartInstance) revenueChartInstance.destroy();

  revenueChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: grouped.labels,
      datasets: [
        {
          label: "Revenue",
          data: revenueSeries,
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#dce6ff" }
        }
      },
      scales: {
        x: {
          ticks: { color: "#aeb8d8", maxRotation: 0, autoSkip: true },
          grid: { color: "rgba(255,255,255,0.06)" }
        },
        y: {
          ticks: { color: "#aeb8d8" },
          grid: { color: "rgba(255,255,255,0.06)" }
        }
      }
    }
  });
}

function renderDashboard() {
  const filteredRows = filterRowsByRange(allRows);

  updateKPIs(filteredRows);
  updateTransactionsTable(filteredRows);
  updateMainChart(filteredRows);
  updateRevenueChart(filteredRows);
}

const metricSelect = byId("metricSelect");
const timeRange = byId("timeRange");
const chartMode = byId("chartMode");

if (metricSelect) metricSelect.addEventListener("change", renderDashboard);
if (timeRange) timeRange.addEventListener("change", renderDashboard);
if (chartMode) chartMode.addEventListener("change", renderDashboard);

loadDashboardData();
updateDeviceStatus();

setInterval(loadDashboardData, 10000);
setInterval(updateDeviceStatus, 5000);
