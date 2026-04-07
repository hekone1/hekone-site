const sampleData = {
  revenue: 124.5,
  transactions: 42,
  weightG: 8350,
  weightLb: 18.41,
  recentTransactions: [
    { time: "10:15", device: "HK-01", g: 220, lb: 0.49, calories: 763, price: 3.30, mode: "manual", txn: "000521" },
    { time: "10:21", device: "HK-01", g: 180, lb: 0.40, calories: 625, price: 2.70, mode: "auto", txn: "000522" },
    { time: "10:29", device: "HK-02", g: 310, lb: 0.68, calories: 1076, price: 4.65, mode: "manual", txn: "000523" },
    { time: "11:05", device: "HK-01", g: 150, lb: 0.33, calories: 521, price: 2.25, mode: "auto", txn: "000524" }
  ],
  labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  revenueSeries: [20, 35, 18, 42, 28, 56, 40],
  transactionSeries: [5, 8, 4, 10, 6, 12, 9]
};

document.getElementById("revenueValue").textContent = `$${sampleData.revenue.toFixed(2)}`;
document.getElementById("transactionsValue").textContent = sampleData.transactions;
document.getElementById("weightGValue").textContent = sampleData.weightG.toLocaleString();
document.getElementById("weightLbValue").textContent = sampleData.weightLb.toFixed(2);

const tbody = document.getElementById("transactionsTableBody");

sampleData.recentTransactions.forEach((item) => {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${item.time}</td>
    <td>${item.device}</td>
    <td>${item.g}</td>
    <td>${item.lb.toFixed(2)}</td>
    <td>${item.calories}</td>
    <td>$${item.price.toFixed(2)}</td>
    <td>${item.mode}</td>
    <td>${item.txn}</td>
  `;
  tbody.appendChild(row);
});

new Chart(document.getElementById("revenueChart"), {
  type: "line",
  data: {
    labels: sampleData.labels,
    datasets: [
      {
        label: "Revenue",
        data: sampleData.revenueSeries,
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

new Chart(document.getElementById("transactionsChart"), {
  type: "bar",
  data: {
    labels: sampleData.labels,
    datasets: [
      {
        label: "Transactions",
        data: sampleData.transactionSeries,
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
