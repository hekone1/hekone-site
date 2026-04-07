let revenueChartInstance = null;
let transactionsChartInstance = null;

async function loadDashboardData() {
  const { data, error } = await supabase
    .from("traction_events")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase error:", error);
    return;
  }

  console.log("Supabase data:", data);

  updateKPIs(data);
  updateTransactionsTable(data);
  updateCharts(data);
}

function updateKPIs(data) {
  let revenue = 0;
  let transactions = data.length;
  let weightG = 0;
  let weightLb = 0;

  data.forEach((item) => {
    revenue += Number(item.price || 0);
    weightG += Number(item.weight_g || 0);
    weightLb += Number(item.weight_lb || 0);
  });

  document.getElementById("revenueValue").textContent = `$${revenue.toFixed(2)}`;
  document.getElementById("transactionsValue").textContent = transactions.toLocaleString();
  document.getElementById("weightGValue").textContent = weightG.toFixed(2);
  document.getElementById("weightLbValue").textContent = weightLb.toFixed(3);
}

function updateTransactionsTable(data) {
  const tbody = document.getElementById("transactionsTableBody");
  tbody.innerHTML = "";

  data.slice(0, 20).forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatDateTime(item.created_at)}</td>
      <td>${item.device_id ?? "-"}</td>
      <td>${Number(item.weight_g ?? 0).toFixed(2)}</td>
      <td>${Number(item.weight_lb ?? 0).toFixed(3)}</td>
      <td>${item.calories ?? 0}</td>
      <td>$${Number(item.price ?? 0).toFixed(2)}</td>
      <td>${item.mode ?? "-"}</td>
      <td>${item.transaction_id ?? "-"}</td>
    `;
    tbody.appendChild(row);
  });
}

function updateCharts(data) {
  const grouped = groupByDay(data);

  const labels = grouped.labels;
  const revenueSeries = grouped.revenueSeries;
  const transactionSeries = grouped.transactionSeries;

  if (revenueChartInstance) {
    revenueChartInstance.destroy();
  }

  revenueChartInstance = new Chart(document.getElementById("revenueChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Revenue",
          data: revenueSeries,
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

  if (transactionsChartInstance) {
    transactionsChartInstance.destroy();
  }

  transactionsChartInstance = new Chart(document.getElementById("transactionsChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Transactions",
          data: transactionSeries,
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

function groupByDay(data) {
  const map = {};

  data.forEach((item) => {
    const date = new Date(item.created_at);
    const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    if (!map[label]) {
      map[label] = {
        revenue: 0,
        transactions: 0
      };
    }

    map[label].revenue += Number(item.price || 0);
    map[label].transactions += 1;
  });

  const labels = Object.keys(map).reverse();
  const revenueSeries = labels.map((label) => Number(map[label].revenue.toFixed(2)));
  const transactionSeries = labels.map((label) => map[label].transactions);

  return { labels, revenueSeries, transactionSeries };
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  return d.toLocaleString();
}

loadDashboardData();
setInterval(loadDashboardData, 10000);
