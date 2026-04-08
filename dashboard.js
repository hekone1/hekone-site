console.log("dashboard.js loaded");

let mainTrendChartInstance = null;
let transactionsChartInstance = null;
let allRows = [];

function showDebug(message, isError = false) {
  let debugBox = document.getElementById("debugBox");

  if (!debugBox) {
    debugBox = document.createElement("div");
    debugBox.id = "debugBox";
    debugBox.style.marginBottom = "16px";
    debugBox.style.padding = "12px 14px";
    debugBox.style.borderRadius = "12px";
    debugBox.style.fontSize = "14px";
    debugBox.style.lineHeight = "1.5";
    debugBox.style.whiteSpace = "pre-wrap";
    debugBox.style.background = isError
      ? "rgba(255, 90, 90, 0.12)"
      : "rgba(123, 97, 255, 0.12)";
    debugBox.style.border = isError
      ? "1px solid rgba(255, 90, 90, 0.25)"
      : "1px solid rgba(123, 97, 255, 0.25)";
    debugBox.style.color = "#edf2ff";

    const mainContent = document.querySelector(".main-content");
    const topbar = document.querySelector(".topbar");
    mainContent.insertBefore(debugBox, topbar.nextSibling);
  }

  debugBox.style.background = isError
    ? "rgba(255, 90, 90, 0.12)"
    : "rgba(123, 97, 255, 0.12)";
  debugBox.style.border = isError
    ? "1px solid rgba(255, 90, 90, 0.25)"
    : "1px solid rgba(123, 97, 255, 0.25)";

  debugBox.textContent = message;
}

async function loadDashboardData() {
  try {
    if (!window.supabase || !window.supabase.createClient) {
      showDebug("Supabase library did not load.", true);
      return;
    }

    if (typeof supabaseClient === "undefined" || !supabaseClient) {
      showDebug("supabaseClient is not defined.", true);
      return;
    }

    showDebug("Loading data from Supabase...");

    const { data, error } = await supabaseClient
      .from("traction_events")
      .select("*")
      .order("created_at", { ascending: false });

    console.log("Supabase data:", data);
    console.log("Supabase error:", error);

    if (error) {
      showDebug("Supabase error:\n" + JSON.stringify(error, null, 2), true);
      return;
    }

    allRows = Array.isArray(data) ? data : [];

    showDebug(`Connected successfully. Rows loaded: ${allRows.length}`);

    renderDashboard();
  } catch (err) {
    console.error("Unexpected loadDashboardData error:", err);
    showDebug("Unexpected JS error:\n" + (err?.message || String(err)), true);
  }
}

function renderDashboard() {
  try {
    const filteredRows = filterRowsByRange(allRows);

    updateKPIs(filteredRows);
    updateTransactionsTable(filteredRows);
    updateMainChart(filteredRows);
    updateTransactionsChart(filteredRows);
  } catch (err) {
    console.error("renderDashboard error:", err);
    showDebug("Render error:\n" + (err?.message || String(err)), true);
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
        transactions: 0
      };
    }

    grouped[label].metric += Number(item[metricKey] || 0);
    grouped[label].transactions += 1;
  });

  const labels = Object.keys(grouped).reverse();
  const metricSeries = labels.map((label) => Number(grouped[label].metric.toFixed(2)));
  const transactionSeries = labels.map((label) => grouped[label].transactions);

  return { labels, metricSeries, transactionSeries };
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

  document.getElementById("revenueValue").textContent = `$${revenue.toFixed(2)}`;
  document.getElementById("transactionsValue").textContent = rows.length;
  document.getElementById("weightGValue").textContent = weightG.toFixed(2);
  document.getElementById("weightLbValue").textContent = weightLb.toFixed(3);
}

function updateTransactionsTable(rows) {
  const tbody = document.getElementById("transactionsTableBody");
  tbody.innerHTML = "";

  rows.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(item.created_at).toLocaleString()}</td>
      <td>${item.device_id ?? "-"}</td>
      <td>${Number(item.weight_g ?? 0).toFixed(2)}</td>
      <td>${Number(item.weight_lb ?? 0).toFixed(3)}</td>
      <td>${item.calories ?? 0}</td>
      <td>$${Number(item.price ?? 0).toFixed(2)}</td>
      <td>${item.mode ?? "-"}</td>
      <td>${item.transaction_id ?? item.id ?? "-"}</td>
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
        }
      },
      scales: {
        x: {
          ticks: { color: "#aeb8d8" },
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

function updateTransactionsChart(rows) {
  const range = document.getElementById("timeRange").value;
  const metric = document.getElementById("metricSelect").value;
  const config = getMetricConfig(metric);
  const grouped = groupMetricByRange(rows, config.key, range);

  if (transactionsChartInstance) {
    transactionsChartInstance.destroy();
  }

  transactionsChartInstance = new Chart(document.getElementById("transactionsChart"), {
    type: "bar",
    data: {
      labels: grouped.labels,
      datasets: [
        {
          label: "Transactions",
          data: grouped.transactionSeries,
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
        }
      },
      scales: {
        x: {
          ticks: { color: "#aeb8d8" },
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

document.getElementById("metricSelect").addEventListener("change", renderDashboard);
document.getElementById("timeRange").addEventListener("change", renderDashboard);

loadDashboardData();
setInterval(loadDashboardData, 10000);
