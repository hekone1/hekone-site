let fillRateChart = null;
let weightChart = null;

const PRICE_PER_LB = 3.0;
const LABOR_COST_PER_ACTIVE_BIN = 2.5;

async function loadData() {
  const { data, error } = await supabaseClient
    .from("origin_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(120);

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
  const totalWeight = bins.reduce((sum, b) => sum + num(b.weight_lb), 0);
  const totalValue = bins.reduce((sum, b) => {
    const value = num(b.estimated_value);
    return sum + (value > 0 ? value : num(b.weight_lb) * PRICE_PER_LB);
  }, 0);

  const avgPerBin = totalBins ? totalWeight / totalBins : 0;
  const avgFillRate = totalBins
    ? bins.reduce((sum, b) => sum + num(b.fill_rate), 0) / totalBins
    : 0;

  const top = bins.reduce((best, b) => {
    return !best || num(b.weight_lb) > num(best.weight_lb) ? b : best;
  }, null);

  const worst = bins.reduce((low, b) => {
    return !low || num(b.weight_lb) < num(low.weight_lb) ? b : low;
  }, null);

  const laborCost = totalBins * LABOR_COST_PER_ACTIVE_BIN;
  const grossLoss = calculateGrossLoss(bins);
  const netImpact = totalValue - grossLoss - laborCost;

  setText("totalBins", totalBins);
  setText("activeBins", "Active: " + totalBins);
  setText("totalWeight", totalWeight.toFixed(2) + " lb");
  setText("estimatedValue", "$" + totalValue.toFixed(2));
  setText("avgPerBin", avgPerBin.toFixed(2) + " lb");
  setText("avgFillRate", avgFillRate.toFixed(2) + " lb/min");

  if (top) {
    setText("topPerformer", `${safeBin(top)} (${num(top.weight_lb).toFixed(2)} lb)`);
  }

  if (worst) {
    setText("needsAttention", `${safeBin(worst)} (${num(worst.weight_lb).toFixed(2)} lb)`);
  }

  setText("estimatedRevenue", "$" + totalValue.toFixed(2));
  setText("grossLoss", "-$" + grossLoss.toFixed(2));
  setText("laborCost", "$" + laborCost.toFixed(2));
  setText("netImpact", "$" + netImpact.toFixed(2));
  setText("recoverableProfit", "$" + grossLoss.toFixed(2));
  setText("monthlyRecovery", "$" + (grossLoss * 30).toFixed(0) + " / month");
  setText("seasonRecovery", "$" + (grossLoss * 120).toFixed(0) + " / season");

  const lastUpdated = document.getElementById("lastUpdated");
  if (lastUpdated) {
    lastUpdated.innerText = "Updated: " + new Date().toLocaleTimeString();
  }

  renderBinCards(bins, avgPerBin);
  renderLossTable(bins, avgPerBin);
  renderCharts(data);

  console.log("Raw Supabase data:", data);
  console.log("Grouped bins:", bins);
}

function renderBinCards(bins, avgPerBin) {
  const container = document.getElementById("binCards");
  if (!container) return;

  container.innerHTML = "";

  bins.slice(0, 4).forEach((bin) => {
    const weight = num(bin.weight_lb);
    const fillRate = num(bin.fill_rate);
    const value = num(bin.estimated_value) || weight * PRICE_PER_LB;

    const diffPercent = avgPerBin > 0 ? ((weight - avgPerBin) / avgPerBin) * 100 : 0;

    let statusText = "Live";
    let statusClass = "good";

    if (diffPercent < -15) {
      statusText = "Below Average";
      statusClass = "bad";
    } else if (diffPercent < -5) {
      statusText = "Slightly Below";
      statusClass = "warning";
    } else if (diffPercent > 5) {
      statusText = "Above Average";
      statusClass = "good";
    }

    const card = document.createElement("div");
    card.className = "bin-card";

    card.innerHTML = `
      <div class="bin-card-top">
        <span>${safeBin(bin)}</span>
        <strong class="${statusClass}">
          ${diffPercent >= 0 ? "+" : ""}${diffPercent.toFixed(0)}%
        </strong>
      </div>

      <div class="bin-weight">${weight.toFixed(2)} <span>lb</span></div>
      <div class="bin-status ${statusClass}">${statusText}</div>

      <div class="bin-meta">
        <span>Fill Rate</span>
        <strong>${fillRate.toFixed(2)} lb/min</strong>
      </div>

      <div class="sparkline ${statusClass}"></div>

      <div class="bin-meta">
        <span>Est. Value</span>
        <strong>$${value.toFixed(2)}</strong>
        <small>@ $${PRICE_PER_LB.toFixed(2)} / lb</small>
      </div>
    `;

    container.appendChild(card);
  });
}

function renderLossTable(bins, avgPerBin) {
  const tbody = document.getElementById("lossTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const rows = bins
    .map((bin) => {
      const weight = num(bin.weight_lb);
      const expected = avgPerBin || weight;
      const lossLb = Math.max(0, expected - weight);
      const grossLoss = lossLb * PRICE_PER_LB;

      let reason = "Normal";
      if (lossLb > 0.5) reason = "Below avg";
      if (lossLb > 5) reason = "Needs review";

      return {
        binId: safeBin(bin),
        weight,
        lossLb,
        grossLoss,
        reason
      };
    })
    .sort((a, b) => b.grossLoss - a.grossLoss);

  rows.slice(0, 6).forEach((row) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.binId}</td>
      <td>${row.weight.toFixed(2)} lb</td>
      <td class="${row.lossLb > 0 ? "loss-red" : ""}">
        ${row.lossLb > 0 ? "-" : ""}${row.lossLb.toFixed(2)} lb
      </td>
      <td class="${row.grossLoss > 0 ? "loss-red" : ""}">
        ${row.grossLoss > 0 ? "-$" : "$"}${row.grossLoss.toFixed(2)}
      </td>
      <td>${row.reason}</td>
    `;

    tbody.appendChild(tr);
  });
}

function calculateGrossLoss(bins) {
  if (!bins || bins.length === 0) return 0;

  const avgWeight =
    bins.reduce((sum, b) => sum + num(b.weight_lb), 0) / bins.length;

  return bins.reduce((sum, b) => {
    const lossLb = Math.max(0, avgWeight - num(b.weight_lb));
    return sum + lossLb * PRICE_PER_LB;
  }, 0);
}

function renderCharts(data) {
  const byBin = {};

  data.forEach((row) => {
    const binId = row.bin_id || "BIN-001";
    if (!byBin[binId]) byBin[binId] = [];
    byBin[binId].push(row);
  });

  const binIds = Object.keys(byBin).slice(0, 4);

  const labels = [...data]
    .reverse()
    .slice(-30)
    .map((row) => {
      const d = new Date(row.created_at);
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
    });

  const colors = ["#00e08a", "#f59e0b", "#ef4444", "#8b5cf6"];

  const fillRateDatasets = binIds.map((binId, index) => {
    const rows = [...byBin[binId]]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(-30);

    return {
      label: binId,
      data: rows.map((r) => num(r.fill_rate)),
      borderColor: colors[index % colors.length],
      backgroundColor: "transparent",
      borderWidth: 2,
      tension: 0.35,
      pointRadius: 1.5,
      fill: false
    };
  });

  const weightDatasets = binIds.map((binId, index) => {
    const rows = [...byBin[binId]]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(-30);

    return {
      label: binId,
      data: rows.map((r) => num(r.weight_lb)),
      borderColor: colors[index % colors.length],
      backgroundColor: "transparent",
      borderWidth: 2,
      tension: 0.35,
      pointRadius: 1.5,
      fill: false
    };
  });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        labels: {
          color: "#cbd5e1",
          boxWidth: 12,
          padding: 12
        }
      }
    },
    layout: {
      padding: {
        bottom: 12
      }
    },
    scales: {
      x: {
        ticks: {
          color: "#94a3b8",
          maxTicksLimit: 6,
          padding: 8
        },
        grid: {
          color: "rgba(148,163,184,0.12)"
        }
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: "#94a3b8",
          padding: 6
        },
        grid: {
          color: "rgba(148,163,184,0.12)"
        }
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
        datasets: fillRateDatasets
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
        datasets: weightDatasets
      },
      options: chartOptions
    });
  }
}

function safeBin(row) {
  return row.bin_id || "BIN-001";
}

function num(value) {
  return Number(value || 0);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.innerText = value;
  }
}

setInterval(loadData, 5000);
loadData();
