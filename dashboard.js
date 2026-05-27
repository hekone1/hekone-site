console.log("dashboard.js loaded - updated dashboard");

let mainTrendChartInstance = null;
let allRows = [];

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

  text.textContent = `WiFi Signal: ${label}`;
}

function setConnected(data, secondsAgo) {
  setText("statusTitle", "Connected");
  setText("statusText", `Device online • WiFi: ${data.wifi_ssid || "-"}`);
  setText("statusMeta", `Updated ${secondsAgo} sec ago`);

  const connectionStatus = byId("connectionStatus");
  const statusDot = document.querySelector(".status-dot");

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
  setText("statusTitle", "Disconnected");
  setText("statusText", message);
  setText("statusMeta", "Waiting for heartbeat");

  const connectionStatus = byId("connectionStatus");
  const statusDot = document.querySelector(".status-dot");

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
      setDisconnected("Invalid device heartbeat");
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

function filterRowsByRange(rows, rangeOverride = null) {
  const rangeEl = byId("timeRange");
  const range = rangeOverride || (rangeEl ? rangeEl.value : "daily");
  const now = new Date();

  return rows.filter((item) => {
    const d = parseSupabaseDate(item.created_at);
    if (!d) return false;

    const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);

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

  setText("revenueValue", formatCurrency(revenue));
  setText("transactionsValue", String(rows.length));
  setText("dispensedWeightValue", `${formatWeightLb(weightLb)} lb`);
  setText("dispensedWeightSubtext", `${formatWeightG(weightG)} g`);
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

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${displayTime}</td>
      <td><span class="device-chip">${item.device_id ?? "-"}</span></td>
      <td>
        <strong>${formatWeightLb(item.weight_lb)} lb</strong>
        <span class="muted-table-text">${formatWeightG(item.weight_g)} g</span>
      </td>
      <td class="price-cell">${formatCurrency(item.price)}</td>
    `;

    tbody.appendChild(tr);
  });
}

function getMetricConfig(metric) {
  if (metric === "weight_g") {
    return { key: "weight_g", label: "Weight (g)", title: "Dispensed Weight" };
  }

  if (metric === "weight_lb") {
    return { key: "weight_lb", label: "Weight (lb)", title: "Dispensed Weight" };
  }

  if (metric === "calories") {
    return { key: "calories", label: "Calories", title: "Calories Activity" };
  }

  return { key: "price", label: "Revenue", title: "Revenue Activity" };
}

function makeCumulative(series) {
  let running = 0;

  return series.map((value) => {
    running += Number(value || 0);
    return Number(running.toFixed(2));
  });
}

function getChartLabel(date, range) {
  if (!date) return "-";

  if (range === "daily") {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  if (range === "weekly") {
    return date.toLocaleDateString([], {
      weekday: "short"
    });
  }

  if (range === "monthly") {
    return date.toLocaleDateString([], {
      month: "short"
    });
  }

  if (range === "yearly") {
    return date.getFullYear().toString();
  }

  return date.toLocaleString();
}

function groupMetricByRange(rows, metricKey) {
  const rangeEl = byId("timeRange");
  const range = rangeEl ? rangeEl.value : "daily";

  const groupedMap = new Map();

  rows.slice().reverse().forEach((item) => {
    const d = parseSupabaseDate(item.created_at);
    if (!d) return;

    const label = getChartLabel(d, range);
    const value = Number(item[metricKey] || 0);

    if (!groupedMap.has(label)) {
      groupedMap.set(label, 0);
    }

    groupedMap.set(label, groupedMap.get(label) + value);
  });

  return {
    labels: Array.from(groupedMap.keys()),
    metricSeries: Array.from(groupedMap.values()).map((v) => Number(v.toFixed(2)))
  };
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
      ? `${config.title} - Cumulative`
      : `${config.title} - Incremental`
  );

  setText(
    "mainChartNote",
    chartMode === "cumulative"
      ? `Running total of ${config.label.toLowerCase()}`
      : "Individual dispensing activity over time"
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
          fill: true,
          backgroundColor: "rgba(65, 156, 255, 0.12)",
          borderColor: "rgba(65, 156, 255, 1)",
          pointBackgroundColor: "rgba(65, 156, 255, 1)"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: "#dce6ff",
            boxWidth: 28
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#aeb8d8",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8
          },
          grid: {
            color: "rgba(255,255,255,0.05)"
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#aeb8d8",
            maxTicksLimit: 5
          },
          grid: {
            color: "rgba(255,255,255,0.05)"
          }
        }
      }
    }
  });
}

function getRangeName(range) {
  if (range === "daily") return "Today";
  if (range === "weekly") return "Last 7 Days";
  if (range === "monthly") return "Monthly";
  if (range === "yearly") return "Yearly";
  return range;
}

function downloadExcel() {
  const excelRangeEl = byId("excelRange");
  const range = excelRangeEl ? excelRangeEl.value : "daily";

  const rows = filterRowsByRange(allRows, range);

  let revenue = 0;
  let weightG = 0;
  let weightLb = 0;
  let calories = 0;

  rows.forEach((item) => {
    revenue += Number(item.price || 0);
    weightG += Number(item.weight_g || 0);
    weightLb += Number(item.weight_lb || 0);
    calories += Number(item.calories || 0);
  });

  const summaryData = [
    ["Range", getRangeName(range)],
    ["Total Revenue", Number(revenue.toFixed(2))],
    ["Transactions", rows.length],
    ["Total Weight (g)", Number(weightG.toFixed(2))],
    ["Total Weight (lb)", Number(weightLb.toFixed(3))],
    ["Total Calories", Number(calories.toFixed(2))],
    ["Generated At", new Date().toLocaleString()]
  ];

  const transactionData = rows.slice().reverse().map((item) => {
    const d = parseSupabaseDate(item.created_at);

    return {
      Time: d ? d.toLocaleString() : item.created_at || "-",
      Device: item.device_id || "-",
      "Weight (g)": Number(item.weight_g || 0),
      "Weight (lb)": Number(item.weight_lb || 0),
      Calories: Number(item.calories || 0),
      Price: Number(item.price || 0)
    };
  });

  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  const transactionSheet = XLSX.utils.json_to_sheet(transactionData);

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, transactionSheet, "Transactions");

  const fileName = `HEKONE_${getRangeName(range).replaceAll(" ", "_")}_Report.xlsx`;

  XLSX.writeFile(workbook, fileName);
}

function renderDashboard() {
  const filteredRows = filterRowsByRange(allRows);

  updateKPIs(filteredRows);
  updateTransactionsTable(filteredRows);
  updateMainChart(filteredRows);
}

const metricSelect = byId("metricSelect");
const timeRange = byId("timeRange");
const chartMode = byId("chartMode");
const downloadExcelBtn = byId("downloadExcelBtn");

if (metricSelect) metricSelect.addEventListener("change", renderDashboard);
if (timeRange) timeRange.addEventListener("change", renderDashboard);
if (chartMode) chartMode.addEventListener("change", renderDashboard);
if (downloadExcelBtn) downloadExcelBtn.addEventListener("click", downloadExcel);

document.querySelectorAll(".range-tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".range-tab").forEach((btn) => {
      btn.classList.remove("active");
    });

    button.classList.add("active");

    const range = button.dataset.range;
    const timeRangeSelect = byId("timeRange");

    if (timeRangeSelect) {
      timeRangeSelect.value = range;
    }

    renderDashboard();
  });
});

loadDashboardData();
updateDeviceStatus();

setInterval(loadDashboardData, 10000);
setInterval(updateDeviceStatus, 5000);
