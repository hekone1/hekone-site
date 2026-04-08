console.log("dashboard.js loaded");

let mainTrendChartInstance = null;
let revenueChartInstance = null;
let allRows = [];

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = byId(id);
  if (!el) {
    console.warn(`Missing element: #${id}`);
    return false;
  }
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

function formatMetricValue(metric, value) {
  if (metric === "price") return `$${Number(value || 0).toFixed(2)}`;
  if (metric === "weight_g") return `${Number(value || 0).toFixed(2)} g`;
  if (metric === "weight_lb") return `${Number(value || 0).toFixed(3)} lb`;
  if (metric === "calories") return `${Number(value || 0).toFixed(0)} cal`;
  return Number(value || 0).toFixed(2);
}

function formatPeriodLabel(range) {
  if (range === "daily") return "today";
  if (range === "weekly") return "this week";
  if (range === "monthly") return "this month";
  if (range === "yearly") return "this year";
  return "selected period";
}

function updateStatus(message, isError = false) {
  const statusTitle = byId("statusTitle");
  const statusText = byId("statusText");
  const statusMeta = byId("statusMeta");
  const connectionStatus = byId("connectionStatus");

  if (statusTitle) statusTitle.textContent = isError ? "Connection issue" : "Connected";
  if (statusText) statusText.textContent = message;
  if (statusMeta) {
    statusMeta.textContent = `Updated ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })}`;
  }

  if (connectionStatus) {
    connectionStatus.textContent = isError ? "Issue" : "Live";
    connectionStatus.className = isError ? "status-pill error" : "status-pill live";
  }
}

async function loadDashboardData() {
  try {
    updateStatus("Loading live data from Supabase...");

    const { data, error } = await supabaseClient
      .from("traction_events")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      updateStatus("Unable to load live data from Supabase.", true);
      return;
    }

    allRows = Array.isArray(data) ? data : [];
    updateStatus(`${allRows.length} rows loaded successfully from the live store feed.`);
    renderDashboard();
  } catch (err) {
    console.error("Unexpected loadDashboardData error:", err);
    updateStatus(`Unexpected error: ${err.message}`, true);
  }
}

function renderDashboard() {
  const filteredRows = filterRowsByRange(allRows);
  updateKPIs(filteredRows);
  updateTransactionsTable(filteredRows);
  updateMainChart(filteredRows);
  updateRevenueChart(filteredRows);
}

function filterRowsByRange(rows) {
  const rangeEl = byId("timeRange");
  const range = rangeEl ? rangeEl.value : "daily";
  const now = new Date();

  return rows.filter((item) => {
    const d = new Date(item.created_at);
    const diffMs = now - d;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (range === "daily") return diffDays <= 1;
    if (range === "weekly") return diffDays <= 7;
    if (range === "monthly") return diffDays <= 30;
    if (range === "yearly") return diffDays <= 365;

    return true;
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

function groupMetricByRange(rows, metricKey, range) {
  const grouped = {};

  rows.forEach((item) => {
    const d = new Date(item.created_at);
    let label = "";

    if (range === "daily") {
      label = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (range === "weekly") {
      label = d.toLocaleDateString([], { weekday: "short" });
    } else if (range === "monthly") {
      label = d.toLocaleDateString([], { month: "short", day: "numeric" });
    } else {
      label = d.toLocaleDateString([], { month: "short", year: "numeric" });
    }

    if (!grouped[label]) {
      grouped[label] = {
        metric: 0,
        revenue: 0,
        count: 0
      };
    }

    grouped[label].metric += Number(item[metricKey] || 0);
    grouped[label].revenue += Number(item.price || 0);
    grouped[label].count += 1;
  });

  const labels = Object.keys(grouped).reverse();

  return {
    labels,
    metricSeries: labels.map((label) => Number(grouped[label].metric.toFixed(2))),
    revenueSeries: labels.map((label) => Number(grouped[label].revenue.toFixed(2))),
    countSeries: labels.map((label) => grouped[label].count)
  };
}

function updateKPIs(rows) {
  let revenue = 0;
  let weightG = 0;

  rows.forEach((item) => {
    revenue += Number(item.price || 0);
    weightG += Number(item.weight_g || 0);
  });

  const txnCount = rows.length;
  const avgTicket = txnCount > 0 ? revenue / txnCount : 0;

  const rangeEl = byId("timeRange");
  const periodText = formatPeriodLabel(rangeEl ? rangeEl.value : "daily");

  setText("revenueValue", formatCurrency(revenue));
  setText("transactionsValue", String(txnCount));
  setText("weightGValue", formatWeightG(weightG));
  setText("avgTicketValue", formatCurrency(avgTicket));

  setText("revenueSubtext", `Total revenue for ${periodText}`);
  setText("transactionsSubtext", `Completed events for ${periodText}`);
  setText("weightGSubtext", `Total dispensed grams for ${periodText}`);
  setText(
    "avgTicketSubtext",
    txnCount > 0 ? `Average across ${txnCount} transactions` : "No transactions in selected range"
  );
}

function updateTransactionsTable(rows) {
  const tbody = byId("transactionsTableBody");
  const tableSummary = byId("tableSummary");

  if (!tbody) return;

  tbody.innerHTML = "";
  const recentRows = rows.slice(0, 10);

  if (tableSummary) {
    tableSummary.textContent = `${recentRows.length} rows`;
  }

  recentRows.forEach((item) => {
    const mode = String(item.mode || "-").toLowerCase();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(item.created_at).toLocaleString()}</td>
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

function updateMainChart(rows) {
  const metricEl = byId("metricSelect");
  const rangeEl = byId("timeRange");
  const canvas = byId("mainTrendChart");

  if (!metricEl || !rangeEl || !canvas) return;

  const metric = metricEl.value;
  const range = rangeEl.value;
  const config = getMetricConfig(metric);
  const grouped = groupMetricByRange(rows, config.key, range);

  setText("mainChartTitle", config.title);
  setText("mainChartNote", `Trend for ${config.label.toLowerCase()} in ${formatPeriodLabel(range)}`);

  if (mainTrendChartInstance) {
    mainTrendChartInstance.destroy();
  }

  mainTrendChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: grouped.labels,
      datasets: [
        {
          label: config.label,
          data: grouped.metricSeries,
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
          labels: {
            color: "#dce6ff"
          }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return formatMetricValue(metric, context.parsed.y);
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#aeb8d8" },
          grid: { color: "rgba(255,255,255,0.06)" }
        },
        y: {
          ticks: {
            color: "#aeb8d8",
            callback: function (value) {
              if (metric === "price") return `$${value}`;
              if (metric === "weight_g") return `${value}g`;
              if (metric === "weight_lb") return `${value}lb`;
              if (metric === "calories") return `${value}`;
              return value;
            }
          },
          grid: { color: "rgba(255,255,255,0.06)" }
        }
      }
    }
  });
}

function updateRevenueChart(rows) {
  const rangeEl = byId("timeRange");
  const canvas = byId("transactionsChart");
  if (!rangeEl || !canvas) return;

  const grouped = groupMetricByRange(rows, "price", rangeEl.value);

  if (revenueChartInstance) {
    revenueChartInstance.destroy();
  }

  revenueChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: grouped.labels,
      datasets: [
        {
          label: "Revenue",
          data: grouped.revenueSeries,
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#dce6ff"
          }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return formatCurrency(context.parsed.y);
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#aeb8d8" },
          grid: { color: "rgba(255,255,255,0.06)" }
        },
        y: {
          ticks: {
            color: "#aeb8d8",
            callback: function (value) {
              return `$${value}`;
            }
          },
          grid: { color: "rgba(255,255,255,0.06)" }
        }
      }
    }
  });
}

const metricSelect = byId("metricSelect");
const timeRange = byId("timeRange");

if (metricSelect) metricSelect.addEventListener("change", renderDashboard);
if (timeRange) timeRange.addEventListener("change", renderDashboard);

loadDashboardData();
setInterval(loadDashboardData, 10000);
