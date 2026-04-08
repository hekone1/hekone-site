console.log("dashboard.js loaded");
console.log("supabase client:", supabaseClient);

async function loadDashboardData() {
  const { data, error } = await supabaseClient
    .from("traction_events")
    .select("*")
    .order("created_at", { ascending: false });

  console.log("data:", data);
  console.log("error:", error);

  if (error) return;

  allRows = data || [];

  renderDashboard();
}

function renderDashboard() {
  const filteredRows = filterRowsByRange(allRows);

  updateKPIs(filteredRows);
  updateTransactionsTable(filteredRows);
  updateMainChart(filteredRows);
  updateTransactionsChart(filteredRows);
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

  let revenue = 0;
  let weightG = 0;
  let weightLb = 0;
  
  let mainTrendChartInstance = null;
  let transactionsChartInstance = null;
  let allRows = [];

  const tbody = document.getElementById("transactionsTableBody");
  tbody.innerHTML = "";

  data.forEach((item) => {
    revenue += Number(item.price || 0);
    weightG += Number(item.weight_g || 0);
    weightLb += Number(item.weight_lb || 0);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(item.created_at).toLocaleString()}</td>
      <td>${item.device_id ?? "-"}</td>
      <td>${Number(item.weight_g ?? 0).toFixed(2)}</td>
      <td>${Number(item.weight_lb ?? 0).toFixed(3)}</td>
      <td>${item.calories ?? 0}</td>
      <td>$${Number(item.price ?? 0).toFixed(2)}</td>
      <td>${item.mode ?? "-"}</td>
      <td>${item.transaction_id ?? "-"}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("revenueValue").textContent = `$${revenue.toFixed(2)}`;
  document.getElementById("weightGValue").textContent = weightG.toFixed(2);
  document.getElementById("weightLbValue").textContent = weightLb.toFixed(3);
}

loadDashboardData();


document.getElementById("metricSelect").addEventListener("change", renderDashboard);
document.getElementById("timeRange").addEventListener("change", renderDashboard);

setInterval(loadDashboardData, 10000);
