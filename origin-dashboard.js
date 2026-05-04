let fillRateChart = null;
let weightChart = null;

async function loadData() {
  const { data, error } = await supabaseClient
    .from("origin_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Supabase error:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("No data found");
    return;
  }

  const latestByBin = {};

  data.forEach((row) => {
    const binId = row.bin_id || "BIN-001";
    if (!latestByBin[binId]) {
      latestByBin[binId] = row;
    }
  });

  const bins = Object.values(latestByBin);

  const totalBins = bins.length;
  const totalWeight = bins.reduce((sum, b) => sum + Number(b.weight_lb || 0), 0);
  const totalValue = bins.reduce((sum, b) => sum + Number(b.estimated_value || 0), 0);
  const avgPerBin = totalBins ? totalWeight / totalBins : 0;
  const avgFillRate = totalBins
    ? bins.reduce((sum, b) => sum + Number(b.fill_rate || 0), 0) / totalBins
    : 0;

  const top = bins.reduce((best, b) =>
    !best || Number(b.weight_lb || 0) > Number(best.weight_lb || 0) ? b : best
  , null);

  const worst = bins.reduce((low, b) =>
    !low || Number(b.weight_lb || 0) < Number(low.weight_lb || 0) ? b : low
  , null);

  setText("totalBins", totalBins);
  setText("activeBins", "Active: " + totalBins);
  setText("totalWeight", totalWeight.toFixed(2) + " lb");
  setText("estimatedValue", "$" + totalValue.toFixed(2));
  setText("avgPerBin", avgPerBin.toFixed(2) + " lb");
  setText("avgFillRate", avgFillRate.toFixed(2) + " lb/min");

  if (top) {
    setText("topPerformer", `${top.bin_id || "BIN-001"} (${Number(top.weight_lb || 0).toFixed(2)} lb)`);
  }

  if (worst) {
    setText("needsAttention", `${worst.bin_id || "BIN-001"} (${Number(worst.weight_lb || 0).toFixed(2)} lb)`);
  }

  setText("estimatedRevenue", "$" + totalValue.toFixed(2));
  setText("netImpact", "$" + totalValue.toFixed(2));
  setText("recoverableProfit", "$0.00");
  setText("monthlyRecovery", "$0 / month");
  setText("seasonRecovery", "$0 / season");

  const lastUpdated = document.getElementById("lastUpdated");
  if (lastUpdated) {
    lastUpdated.innerText = "Updated: " + new Date().toLocaleTimeString();
  }

  renderCharts(data);

  console.log("Raw Supabase data:", data);
  console.log("Grouped bins:", bins);
}

function renderCharts(data) {
  const sorted = [...data].reverse();

  const labels = sorted.map((row) => {
    const d = new Date(row.created_at);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  });

  const weightData = sorted.map((row) => Number(row.weight_lb || 0));
  const fillRateData = sorted.map((row) => Number(row.fill_rate || 0));

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        labels: {
          color: "#cbd5e1",
          boxWidth: 12
        }
      }
    },
    scales: {
      x: {
        ticks: { color: "#94a3b8", maxTicksLimit: 6 },
        grid: { color: "rgba(148,163,184,0.12)" }
      },
      y: {
        ticks: { color: "#94a3b8" },
        grid: { color: "rgba(148,163,184,0.12)" }
      }
    }
  };

  const fillCtx = document.getElementById("fillRateChart");
  if (fillCtx) {
    if (fillRateChart) fillRateChart.destroy();

    fillRateChart = new Chart(fillCtx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Fill Rate",
          data: fillRateData,
          borderColor: "#00e08a",
          backgroundColor: "rgba(0,224,138,0.12)",
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 1.5,
          fill: true
        }]
      },
      options: chartOptions
    });
  }

  const weightCtx = document.getElementById("weightChart");
  if (weightCtx) {
    if (weightChart) weightChart.destroy();

    weightChart = new Chart(weightCtx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Weight",
          data: weightData,
          borderColor: "#8b5cf6",
          backgroundColor: "rgba(139,92,246,0.12)",
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 1.5,
          fill: true
        }]
      },
      options: chartOptions
    });
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.innerText = value;
  }
}

setInterval(loadData, 5000);
loadData();
