let mainChart = null;
let currentChartTab = "fillRate";
let latestChartData = [];

const PRICE_PER_LB = 3.0;
const LABOR_COST_PER_ACTIVE_BIN = 2.5;

async function loadData() {
  const { data, error } = await supabaseClient
    .from("origin_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error("Supabase error:", error);
    renderEmptyStates();
    return;
  }

  if (!data || data.length === 0) {
    renderEmptyStates();
    return;
  }

  const latestByBin = {};

  data.forEach((row) => {
    const binId = row.bin_id || "BIN-001";
    if (!latestByBin[binId]) latestByBin[binId] = row;
  });

  const bins = Object.values(latestByBin);
  const totalBins = bins.length;
  const totalWeight = bins.reduce((sum, b) => sum + num(b.weight_lb), 0);

  const totalValue = bins.reduce((sum, b) => {
    const value = num(b.estimated_value);
    return sum + (value > 0 ? value : num(b.weight_lb) * PRICE_PER_LB);
  }, 0);

  const avgPerBin = totalBins ? totalWeight / totalBins : 0;
  const avgFillRate = totalBins ? bins.reduce((sum, b) => sum + num(b.fill_rate), 0) / totalBins : 0;

  const top = bins.reduce((best, b) => !best || num(b.weight_lb) > num(best.weight_lb) ? b : best, null);
  const worst = bins.reduce((low, b) => !low || num(b.weight_lb) < num(low.weight_lb) ? b : low, null);

  const laborCost = totalBins * LABOR_COST_PER_ACTIVE_BIN;
  const grossLoss = calculateGrossLoss(bins);
  const netImpact = totalValue - grossLoss - laborCost;

  setText("totalBins", totalBins);
  setText("activeBins", "Active: " + totalBins);
  setText("totalWeight", totalWeight.toFixed(2) + " lb");
  setText("estimatedValue", "$" + totalValue.toFixed(2));
  setText("avgPerBin", avgPerBin.toFixed(2) + " lb");
  setText("avgFillRate", avgFillRate.toFixed(2) + " lb/min");

  if (top) setText("topPerformer", `${safeBin(top)} (${num(top.weight_lb).toFixed(2)} lb)`);
  if (worst) setText("needsAttention", `${safeBin(worst)} (${num(worst.weight_lb).toFixed(2)} lb)`);

  setText("estimatedRevenue", "$" + totalValue.toFixed(2));
  setText("grossLoss", "-$" + grossLoss.toFixed(2));
  setText("laborCost", "$" + laborCost.toFixed(2));
  setText("netImpact", "$" + netImpact.toFixed(2));

  setText("heroRecoverableProfit", "$" + grossLoss.toFixed(2));
  setText("heroMonthlyRecovery", "$" + (grossLoss * 30).toFixed(0) + " / month");
  setText("heroSeasonRecovery", "$" + (grossLoss * 120).toFixed(0) + " / season");

  const lastUpdated = document.getElementById("lastUpdated");
  if (lastUpdated) lastUpdated.innerText = "Updated: " + new Date().toLocaleTimeString();

  renderLossTable(bins, avgPerBin);
  renderCharts(data);
  renderFieldMap(bins, avgPerBin);
  renderInsights(bins, avgPerBin, avgFillRate, grossLoss, netImpact);
  renderActivityFeed(data, avgPerBin);
}

function renderLossTable(bins, avgPerBin) {
  const tbody = document.getElementById("lossTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const rows = bins.map((bin) => {
    const weight = num(bin.weight_lb);
    const expected = avgPerBin || weight;
    const lossLb = Math.max(0, expected - weight);
    const grossLoss = lossLb * PRICE_PER_LB;
    let reason = "Normal";
    if (lossLb > 0.5) reason = "Below avg";
    if (lossLb > 5) reason = "Needs review";
    return { binId: safeBin(bin), weight, lossLb, grossLoss, reason };
  }).sort((a, b) => b.grossLoss - a.grossLoss);

  rows.slice(0, 6).forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.binId}</td>
      <td>${row.weight.toFixed(2)} lb</td>
      <td class="${row.lossLb > 0 ? "loss-red" : ""}">${row.lossLb > 0 ? "-" : ""}${row.lossLb.toFixed(2)} lb</td>
      <td class="${row.grossLoss > 0 ? "loss-red" : ""}">${row.grossLoss > 0 ? "-$" : "$"}${row.grossLoss.toFixed(2)}</td>
      <td>${row.reason}</td>
    `;
    tbody.appendChild(tr);
  });
}

function calculateGrossLoss(bins) {
  if (!bins || bins.length === 0) return 0;
  const avgWeight = bins.reduce((sum, b) => sum + num(b.weight_lb), 0) / bins.length;
  return bins.reduce((sum, b) => {
    const lossLb = Math.max(0, avgWeight - num(b.weight_lb));
    return sum + lossLb * PRICE_PER_LB;
  }, 0);
}

function renderCharts(data) {
  latestChartData = data;
  const byBin = {};
  data.forEach((row) => {
    const binId = row.bin_id || "BIN-001";
    if (!byBin[binId]) byBin[binId] = [];
    byBin[binId].push(row);
  });

  const binIds = Object.keys(byBin).slice(0, 4);
  if (binIds.length === 0) return;

  const colors = ["#00e08a", "#f5a524", "#ff3b3b", "#22d3ee"];
  let labels = [];
  let datasets = [];

  if (currentChartTab === "fillRate") {
    const firstBinMinuteData = buildMinuteFillRateSeries(byBin[binIds[0]]);
    labels = firstBinMinuteData.map((p) => p.label);
    datasets = binIds.map((binId, index) => {
      const minuteData = buildMinuteFillRateSeries(byBin[binId]);
      return {
        label: binId,
        data: minuteData.map((p) => p.value),
        borderColor: colors[index % colors.length],
        backgroundColor: "transparent",
        borderWidth: 3,
        tension: 0.38,
        pointRadius: 2.5,
        pointHoverRadius: 5,
        fill: false
      };
    });
  } else {
    const firstBinRows = [...byBin[binIds[0]]]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(-30);

    labels = firstBinRows.map((row) => new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));

    datasets = binIds.map((binId, index) => {
      const rows = [...byBin[binId]]
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .slice(-30);
      return {
        label: binId,
        data: rows.map((r) => num(r.weight_lb)),
        borderColor: colors[index % colors.length],
        backgroundColor: "transparent",
        borderWidth: 3,
        tension: 0.38,
        pointRadius: 2,
        pointHoverRadius: 5,
        fill: false
      };
    });
  }

  const ctx = document.getElementById("mainChart");
  if (!ctx) return;
  if (mainChart) mainChart.destroy();

  mainChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { labels: { color: "#cbd5e1", boxWidth: 12, padding: 14, usePointStyle: true } },
        tooltip: {
          backgroundColor: "rgba(2, 12, 18, 0.95)",
          borderColor: "rgba(34, 211, 238, 0.25)",
          borderWidth: 1,
          callbacks: {
            label: (context) => {
              const unit = currentChartTab === "fillRate" ? " lb/min" : " lb";
              return context.dataset.label + ": " + context.parsed.y.toFixed(2) + unit;
            }
          }
        }
      },
      scales: {
        x: {
          offset: true,
          ticks: { color: "#94a3b8", maxTicksLimit: 6, padding: 12, autoSkip: true, maxRotation: 0, minRotation: 0 },
          grid: { color: "rgba(148,163,184,0.10)" }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: currentChartTab === "fillRate" ? "lb/min" : "lb", color: "#94a3b8" },
          ticks: { color: "#94a3b8", padding: 6 },
          grid: { color: "rgba(148,163,184,0.10)" }
        }
      }
    }
  });
}

function buildMinuteFillRateSeries(rows) {
  if (!rows || rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const minuteBuckets = {};

  sorted.forEach((row) => {
    const d = new Date(row.created_at);
    d.setSeconds(0);
    d.setMilliseconds(0);
    const key = d.toISOString();
    if (!minuteBuckets[key]) minuteBuckets[key] = [];
    minuteBuckets[key].push(row);
  });

  return Object.keys(minuteBuckets).sort().slice(-30).map((key) => {
    const bucket = minuteBuckets[key];
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    let lbPerMin = num(last.weight_lb) - num(first.weight_lb);
    if (lbPerMin < 0) lbPerMin = 0;
    const d = new Date(key);
    return { label: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), value: lbPerMin };
  });
}

function renderFieldMap(bins, avgPerBin) {
  const map = document.getElementById("fieldMap");
  if (!map) return;
  map.querySelectorAll(".map-bin").forEach((el) => el.remove());

  const positions = [
    [18, 28], [36, 52], [55, 30], [74, 58], [27, 74], [62, 76], [84, 34], [45, 18]
  ];

  bins.slice(0, 8).forEach((bin, index) => {
    const weight = num(bin.weight_lb);
    const diffPercent = avgPerBin > 0 ? ((weight - avgPerBin) / avgPerBin) * 100 : 0;
    let statusClass = "good";
    if (diffPercent < -15) statusClass = "bad";
    else if (diffPercent < -5) statusClass = "warning";

    const point = document.createElement("div");
    point.className = `map-bin ${statusClass}`;
    point.style.left = positions[index % positions.length][0] + "%";
    point.style.top = positions[index % positions.length][1] + "%";
    point.dataset.label = safeBin(bin);
    point.title = `${safeBin(bin)} - ${weight.toFixed(2)} lb`;
    map.appendChild(point);
  });
}

function renderInsights(bins, avgPerBin, avgFillRate, grossLoss, netImpact) {
  const list = document.getElementById("insightsList");
  if (!list) return;

  const top = bins.reduce((best, b) => !best || num(b.weight_lb) > num(best.weight_lb) ? b : best, null);
  const worst = bins.reduce((low, b) => !low || num(b.weight_lb) < num(low.weight_lb) ? b : low, null);
  const insights = [];

  if (grossLoss > 0) insights.push(`<b>$${grossLoss.toFixed(2)}</b> in recoverable profit opportunity detected today.`);
  if (worst && avgPerBin > 0) insights.push(`<b>${safeBin(worst)}</b> is below the current bin average and may need review.`);
  if (top) insights.push(`<b>${safeBin(top)}</b> is the current top-performing bin by live weight.`);
  if (avgFillRate > 0) insights.push(`Average harvest speed is currently <b>${avgFillRate.toFixed(2)} lb/min</b>.`);
  insights.push(`Net operational impact is currently <b>$${netImpact.toFixed(2)}</b> after estimated loss and labor.`);

  list.innerHTML = insights.slice(0, 4).map((text) => `<div class="insight-item">${text}</div>`).join("");
}

function renderActivityFeed(data, avgPerBin) {
  const feed = document.getElementById("activityFeed");
  if (!feed) return;

  const recentRows = [...data]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6);

  feed.innerHTML = recentRows.map((row) => {
    const time = new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const weight = num(row.weight_lb);
    const fillRate = num(row.fill_rate);
    let text = `<b>${safeBin(row)}</b> reported ${weight.toFixed(2)} lb`;

    if (avgPerBin > 0 && weight < avgPerBin * 0.85) text = `<b>${safeBin(row)}</b> may need attention. Weight is below average.`;
    else if (fillRate > 0) text = `<b>${safeBin(row)}</b> fill rate updated to ${fillRate.toFixed(2)} lb/min.`;

    return `<div class="activity-item"><div class="activity-time">${time}</div><div class="activity-text">${text}</div></div>`;
  }).join("");
}

function switchChartTab(tabName) {
  currentChartTab = tabName;
  const fillRateTab = document.getElementById("fillRateTab");
  const weightTab = document.getElementById("weightTab");
  if (fillRateTab && weightTab) {
    fillRateTab.classList.toggle("active", tabName === "fillRate");
    weightTab.classList.toggle("active", tabName === "weight");
  }
  if (latestChartData && latestChartData.length > 0) renderCharts(latestChartData);
}

function renderEmptyStates() {
  setText("lastUpdated", "Waiting for data");
  const insights = document.getElementById("insightsList");
  const activity = document.getElementById("activityFeed");
  if (insights) insights.innerHTML = `<div class="empty-state">Waiting for live field insights...</div>`;
  if (activity) activity.innerHTML = `<div class="empty-state">Waiting for live telemetry...</div>`;
}

function safeBin(row) { return row.bin_id || "BIN-001"; }
function num(value) { return Number(value || 0); }
function setText(id, value) { const el = document.getElementById(id); if (el) el.innerText = value; }

setInterval(loadData, 5000);
loadData();
