console.log("dashboard.js loaded");

let mainTrendChartInstance = null;
let transactionsChartInstance = null;
let allRows = [];

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
  const statusTitle = document.getElementById("statusTitle");
  const statusText = document.getElementById("statusText");
  const statusMeta = document.getElementById("statusMeta");
  const connectionStatus = document.getElementById("connectionStatus");

  if (!statusTitle || !statusText || !statusMeta || !connectionStatus) return;

  statusTitle.textContent = isError ? "Connection issue" : "Connected";
  statusText.textContent = message;
  statusMeta.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  connectionStatus.textContent = isError ? "Issue" : "Live";
  connectionStatus.className = isError ? "status-pill error" : "status-pill live";
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
    updateStatus("Unexpected dashboard error while syncing data.", true);
  }
}

function renderDashboard() {
  try {
    const filteredRows = filterRowsByRange(allRows);

    updateKPIs(filteredRows);
    updateTransactionsTable(filteredRows);
    updateMainChart(filteredRows);
    updateRevenueChart(filteredRows);
  } catch (err) {
    console.error("Render error:", err);
    updateStatus(`Render error: ${err.message}`, true);
  }
}

function filterRowsByRange(rows) {
  const range = document.getElementById("timeRange").value;
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
  const periodText = formatPeriodLabel(document.getElementById("timeRange").value);

  document.getElementById("revenueValue").textContent = formatCurrency(revenue);
  document.getElementById("transactionsValue").textContent = txnCount;
  document.getElementById("weightGValue").textContent = formatWeightG(weightG);
  document.getElementById("avgTicketValue").textContent = formatCurrency(avgTicket);

  document.getElementById("revenueSubtext").textContent = `Total revenue for ${periodText}`;
  document.getElementById("transactionsSubtext").textContent = `Completed events for ${periodText}`;
  document.getElementById("weightGSubtext").textContent = `Total dispensed grams for ${periodText}`;
  document.getElementById("avgTicketSubtext").textContent =
    txnCount > 0 ? `Average across ${txnCount} transactions` : "No transactions in selected range";
}

function updateTransactionsTable(rows) {
  const tbody = document.getElementById("transactionsTableBody");
  const tableSummary = document.getElementById("tableSummary");
  tbody.innerHTML = "";

  const recentRows = rows.slice(0, 10);
  tableSummary.textContent = `${recentRows.length} rows`;

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
  const metric = document.getElementById("metricSelect").value;
  const range = document.getElementById("timeRange").value;
  const config = getMetricConfig(metric);
  const grouped = groupMetricByRange(rows, config.key, range);

  document.getElementById("mainChartTitle").textContent = config.title;
  document.getElementById("mainChartNote").textContent = `Trend for ${config.label.toLowerCase()} in ${formatPeriodLabel(range)}`;

  if (mainTrendChartInstance) {
    mainTrendChartInstance.destroy();
  }

  mainTrendChartInstance = new Chart(document.getElementById("mainTrendChart"), {
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
            label: function(context) {
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
            callback: function(value) {
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
  const range = document.getElementById("timeRange").value;
  const grouped = groupMetricByRange(rows, "price", range);

  if (transactionsChartInstance) {
    transactionsChartInstance.destroy();
  }

  transactionsChartInstance = new Chart(document.getElementById("transactionsChart"), {
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
            label: function(context) {
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
            callback: function(value) {
              return `$${value}`;
            }
          },
          grid: { color: "rgba(255,255,255,0.06)" }
        }
      }
    }
  });
}

document.getElementById("metricSelect").addEventListener("change", renderDashboard);
document.getElementById("timeRange").addEventListener("change", renderDashboard);

loadDashboardData();
setInterval(loadDashboardData, 10000);
