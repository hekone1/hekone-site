let mainChart = null;
let currentChartTab = "weightByBin";
let latestChartData = [];

const PRICE_PER_LB = 3.0;
const LABOR_COST_PER_ACTIVE_BIN = 2.5;
const ACTIVE_BIN_ID = "BIN-001";
const DEMO_MODE = true;

const DEMO_BINS = [
  { binId: "BIN-001", cumulativeWeight: 512.4, currentWeight: 48.0, fillRateLbHour: 42.0 },
  { binId: "BIN-002", cumulativeWeight: 246.7, currentWeight: 32.0, fillRateLbHour: 25.5 },
  { binId: "BIN-003", cumulativeWeight: 214.5, currentWeight: 24.0, fillRateLbHour: 23.2 },
  { binId: "BIN-004", cumulativeWeight: 70.5, currentWeight: 11.5, fillRateLbHour: 8.0 },
  { binId: "BIN-005", cumulativeWeight: 118.7, currentWeight: 18.2, fillRateLbHour: 16.6 },
  { binId: "BIN-006", cumulativeWeight: 162.8, currentWeight: 21.4, fillRateLbHour: 22.8 }
];

async function loadData() {
  const { data, error } = await supabaseClient
    .from("origin_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Supabase error:", error);
  }

  const hasEnoughLiveBins = data && new Set(data.map((row) => row.bin_id || "BIN-001")).size >= 2;
  const binStats = hasEnoughLiveBins ? buildBinStats(data) : buildDemoBinStats();
  latestChartData = hasEnoughLiveBins ? data : buildDemoEvents(binStats);

  updateDashboard(binStats, latestChartData);
}

function updateDashboard(binStats, eventData) {
  const totalBins = binStats.length;
  const totalCumulativeWeight = sum(binStats, "cumulativeWeight");
  const totalValue = totalCumulativeWeight * PRICE_PER_LB;
  const avgPerBin = totalBins ? totalCumulativeWeight / totalBins : 0;
  const avgFillRate = totalBins ? sum(binStats, "fillRateLbHour") / totalBins : 0;

  const top = [...binStats].sort((a, b) => b.cumulativeWeight - a.cumulativeWeight)[0];
  const worst = [...binStats].sort((a, b) => a.cumulativeWeight - b.cumulativeWeight)[0];

  const laborCost = totalBins * LABOR_COST_PER_ACTIVE_BIN;
  const grossLoss = calculateGrossLoss(binStats);
  const netImpact = totalValue - grossLoss - laborCost;

  setText("totalBins", totalBins);
  setText("activeBins", "Active: " + totalBins);
  setText("totalWeight", totalCumulativeWeight.toFixed(1) + " lb");
  setText("estimatedValue", "$" + totalValue.toFixed(2));
  setText("heroEstimatedRevenue", "$" + totalValue.toFixed(2));
  setText("avgPerBin", avgPerBin.toFixed(1) + " lb");
  setText("avgFillRate", avgFillRate.toFixed(1) + " lb/h");

  if (top) setText("topPerformer", `${top.binId} (${top.cumulativeWeight.toFixed(1)} lb)`);
  if (worst) setText("needsAttention", `${worst.binId} (${worst.cumulativeWeight.toFixed(1)} lb)`);

  setText("estimatedRevenue", "$" + totalValue.toFixed(2));
  setText("grossLoss", "-$" + grossLoss.toFixed(2));
  setText("laborCost", "$" + laborCost.toFixed(2));
  setText("netImpact", "$" + netImpact.toFixed(2));
  setText("barTotalWeight", totalCumulativeWeight.toFixed(1) + " lb");
  setText("binCountIndicator", Math.min(totalBins, 6) + " / 6");

  const lastUpdated = document.getElementById("lastUpdated");
  if (lastUpdated) lastUpdated.innerText = "Updated: " + new Date().toLocaleTimeString();

  renderMap(binStats);
  renderInsights(binStats);
  renderLossTable(binStats, avgPerBin);
  renderActivityFeed(eventData, binStats);
  renderCharts(eventData, binStats);
}

function buildBinStats(data) {
  const grouped = {};

  data.forEach((row) => {
    const binId = row.bin_id || "BIN-001";
    if (!grouped[binId]) grouped[binId] = [];
    grouped[binId].push(row);
  });

  return Object.keys(grouped).map((binId) => {
    const rows = grouped[binId].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let cumulativeWeight = 0;

    if (rows.length > 0) cumulativeWeight += Math.max(0, num(rows[0].weight_lb));

    for (let i = 1; i < rows.length; i++) {
      const previous = num(rows[i - 1].weight_lb);
      const current = num(rows[i].weight_lb);
      const delta = current - previous;
      if (delta > 0) cumulativeWeight += delta;
    }

    const latest = rows[rows.length - 1];

    return {
      binId,
      rows,
      latest,
      currentWeight: num(latest.weight_lb),
      cumulativeWeight,
      fillRateLbHour: calculateRecentFillRateLbHour(rows)
    };
  });
}

function buildDemoBinStats() {
  return DEMO_BINS.map((bin) => ({ ...bin, rows: [] }));
}

function buildDemoEvents(binStats) {
  const now = Date.now();
  const events = [];

  binStats.forEach((bin, binIndex) => {
    for (let i = 10; i >= 0; i--) {
      const createdAt = new Date(now - i * 12 * 60 * 1000 - binIndex * 60000).toISOString();
      const progress = (10 - i) / 10;
      const wave = Math.sin(progress * Math.PI * 2) * 3;
      events.push({
        bin_id: bin.binId,
        weight_lb: Math.max(0, bin.currentWeight * progress + wave).toFixed(2),
        created_at: createdAt
      });
    }
  });

  return events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function calculateRecentFillRateLbHour(rows) {
  if (!rows || rows.length < 2) return 0;

  const sorted = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const recent = sorted.slice(-10);
  let positiveGain = 0;

  for (let i = 1; i < recent.length; i++) {
    const delta = num(recent[i].weight_lb) - num(recent[i - 1].weight_lb);
    if (delta > 0) positiveGain += delta;
  }

  const firstTime = new Date(recent[0].created_at);
  const lastTime = new Date(recent[recent.length - 1].created_at);
  const hours = (lastTime - firstTime) / 3600000;

  if (hours <= 0) return 0;
  return positiveGain / hours;
}

function renderCharts(data, binStats) {
  const barChartHeader = document.getElementById("barChartHeader");
  const barChartFooter = document.getElementById("barChartFooter");
  const showBarUI = currentChartTab === "weightByBin";

  if (barChartHeader) barChartHeader.style.display = showBarUI ? "flex" : "none";
  if (barChartFooter) barChartFooter.style.display = showBarUI ? "flex" : "none";

  const ctx = document.getElementById("mainChart");
  if (!ctx) return;

  if (mainChart) mainChart.destroy();

  if (currentChartTab === "weightByBin") {
    renderWeightByBinChart(ctx, binStats);
    return;
  }

  const byBin = {};
  data.forEach((row) => {
    const binId = row.bin_id || "BIN-001";
    if (!byBin[binId]) byBin[binId] = [];
    byBin[binId].push(row);
  });

  const binIds = Object.keys(byBin).slice(0, 4);
  const colors = ["#00e08a", "#22d3ee", "#ffbf2f", "#ff3333"];
  let labels = [];
  let datasets = [];

  if (currentChartTab === "fillRate") {
    const firstBinData = buildHourlyFillRateSeries(byBin[binIds[0]]);
    labels = firstBinData.map((p) => p.label);

    datasets = binIds.map((binId, index) => {
      const hourlyData = buildHourlyFillRateSeries(byBin[binId]);
      return {
        label: binId,
        data: hourlyData.map((p) => p.value),
        borderColor: colors[index % colors.length],
        backgroundColor: "transparent",
        borderWidth: 3,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
        fill: false
      };
    });
  } else {
    const firstBinRows = [...byBin[binIds[0]]]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(-30);

    labels = firstBinRows.map((row) => formatTime(row.created_at));

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
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
        fill: false
      };
    });
  }

  mainChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: getLineChartOptions()
  });
}

function renderWeightByBinChart(ctx, binStats) {
  const sortedBins = [...binStats].sort((a, b) => b.cumulativeWeight - a.cumulativeWeight).slice(0, 6);
  const labels = sortedBins.map((b) => b.binId);
  const values = sortedBins.map((b) => b.cumulativeWeight);

  const backgroundColors = sortedBins.map((b, index) => {
    if (b.binId === ACTIVE_BIN_ID || index === 0) return "#00e08a";
    return "rgba(148, 163, 184, 0.58)";
  });

  const valueLabelPlugin = {
    id: "valueLabelPlugin",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        meta.data.forEach((bar, index) => {
          const value = dataset.data[index];
          ctx.save();
          ctx.fillStyle = index === 0 ? "#00e08a" : "#cbd5e1";
          ctx.font = "800 14px Arial";
          ctx.textAlign = "center";
          ctx.fillText(value.toFixed(1) + " lb", bar.x, bar.y - 8);
          ctx.restore();
        });
      });
    }
  };

  mainChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Cumulative Harvested Weight",
        data: values,
        backgroundColor: backgroundColors,
        borderColor: backgroundColors,
        borderWidth: 1,
        borderRadius: 6,
        maxBarThickness: 74
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              return context.label + ": " + context.parsed.y.toFixed(1) + " lb cumulative";
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#cbd5e1", font: { weight: "800" } },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Weight (lb)", color: "#cbd5e1" },
          ticks: { color: "#cbd5e1" },
          grid: { color: "rgba(148,163,184,0.10)" }
        }
      }
    },
    plugins: [valueLabelPlugin]
  });
}

function getLineChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { labels: { color: "#cbd5e1", boxWidth: 12, padding: 12 } },
      tooltip: {
        callbacks: {
          label(context) {
            const unit = currentChartTab === "fillRate" ? " lb/h" : " lb";
            return context.dataset.label + ": " + context.parsed.y.toFixed(2) + unit;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: { color: "#94a3b8", maxTicksLimit: 6 },
        grid: { color: "rgba(148,163,184,0.08)" }
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: currentChartTab === "fillRate" ? "lb/h" : "lb", color: "#94a3b8" },
        ticks: { color: "#94a3b8" },
        grid: { color: "rgba(148,163,184,0.08)" }
      }
    }
  };
}

function buildHourlyFillRateSeries(rows) {
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
    let lbPerMinute = num(last.weight_lb) - num(first.weight_lb);
    if (lbPerMinute < 0) lbPerMinute = 0;
    return { label: formatTime(key), value: lbPerMinute * 60 };
  });
}

function renderMap(binStats) {
  const map = document.getElementById("fieldMap");
  if (!map) return;

  map.innerHTML = `<div class="map-grid"></div>`;

  const positions = [
    { x: 18, y: 28 },
    { x: 43, y: 45 },
    { x: 63, y: 58 },
    { x: 78, y: 32 },
    { x: 28, y: 75 },
    { x: 80, y: 78 }
  ];

  binStats.slice(0, 6).forEach((bin, index) => {
    let status = "good";
    if (bin.cumulativeWeight < 90) status = "bad";
    else if (bin.cumulativeWeight < 170) status = "warning";

    const pos = positions[index];
    const dot = document.createElement("div");
    dot.className = `map-bin ${status}`;
    dot.style.left = pos.x + "%";
    dot.style.top = pos.y + "%";
    dot.setAttribute("data-label", bin.binId);
    map.appendChild(dot);
  });
}

function renderInsights(binStats) {
  const list = document.getElementById("insightsList");
  if (!list) return;

  const avg = binStats.length ? sum(binStats, "cumulativeWeight") / binStats.length : 0;
  const sorted = [...binStats].sort((a, b) => b.cumulativeWeight - a.cumulativeWeight);
  const top = sorted[0];
  const low = sorted[sorted.length - 1];

  const insights = [];
  if (top && avg > 0) {
    insights.push({ icon: "↑", cls: "up", text: `<b>${top.binId}</b> harvesting above average by ${(((top.cumulativeWeight - avg) / avg) * 100).toFixed(0)}%.` });
  }
  if (low && avg > 0) {
    insights.push({ icon: "↓", cls: "down", text: `<b>${low.binId}</b> fill rate dropped <b>${Math.max(10, (((avg - low.cumulativeWeight) / avg) * 100)).toFixed(0)}%</b> below average.` });
  }
  insights.push({ icon: "↑", cls: "up", text: `<b>Team B</b> efficiency improved by <b>14%</b> today.` });
  insights.push({ icon: "ⓘ", cls: "info", text: `Potential recoverable revenue: <b>$${calculateGrossLoss(binStats).toFixed(0)} / day</b>.` });

  list.innerHTML = "";
  insights.slice(0, 4).forEach((item) => {
    const el = document.createElement("div");
    el.className = "insight-item";
    el.innerHTML = `<span class="${item.cls}">${item.icon}</span><span>${item.text}</span><span class="chev">›</span>`;
    list.appendChild(el);
  });
}

function renderLossTable(binStats, avgPerBin) {
  const tbody = document.getElementById("lossTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const rows = binStats.map((bin) => {
    const lossLb = Math.max(0, avgPerBin - bin.cumulativeWeight);
    const grossLoss = lossLb * PRICE_PER_LB;
    let reason = "Normal";
    let reasonClass = "";

    if (lossLb > 100) { reason = "Needs review"; reasonClass = "reason-danger"; }
    else if (lossLb > 30) { reason = "Below avg"; reasonClass = "reason-warning"; }

    return { binId: bin.binId, weight: bin.cumulativeWeight, lossLb, grossLoss, reason, reasonClass };
  }).sort((a, b) => b.grossLoss - a.grossLoss);

  rows.slice(0, 6).forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.binId}</td>
      <td>${row.weight.toFixed(1)} lb</td>
      <td class="${row.lossLb > 0 ? "loss-red" : ""}">${row.lossLb.toFixed(1)} lb</td>
      <td class="${row.grossLoss > 0 ? "loss-red" : ""}">$${row.grossLoss.toFixed(2)}</td>
      <td class="${row.reasonClass}">${row.reason}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderActivityFeed(data, binStats) {
  const feed = document.getElementById("activityFeed");
  if (!feed) return;

  feed.innerHTML = "";

  const activities = binStats
    .slice(0, 6)
    .map((bin, index) => ({
      time: new Date(Date.now() - index * 2 * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      text: `<b>${bin.binId}</b> updated to ${bin.cumulativeWeight.toFixed(1)} lb`
    }));

  activities.forEach((activity) => {
    const item = document.createElement("div");
    item.className = "activity-item";
    item.innerHTML = `<div class="activity-time">${activity.time}</div><div class="activity-text">${activity.text}</div>`;
    feed.appendChild(item);
  });
}

function calculateGrossLoss(binStats) {
  if (!binStats || binStats.length === 0) return 0;
  const avg = sum(binStats, "cumulativeWeight") / binStats.length;
  return binStats.reduce((total, bin) => total + Math.max(0, avg - bin.cumulativeWeight) * PRICE_PER_LB, 0);
}

function switchChartTab(tabName) {
  currentChartTab = tabName;

  const fillRateTab = document.getElementById("fillRateTab");
  const weightTab = document.getElementById("weightTab");
  const weightByBinTab = document.getElementById("weightByBinTab");

  if (fillRateTab && weightTab && weightByBinTab) {
    fillRateTab.classList.toggle("active", tabName === "fillRate");
    weightTab.classList.toggle("active", tabName === "weight");
    weightByBinTab.classList.toggle("active", tabName === "weightByBin");
  }

  if (latestChartData && latestChartData.length > 0) {
    const hasEnoughLiveBins = new Set(latestChartData.map((row) => row.bin_id || "BIN-001")).size >= 2;
    const binStats = hasEnoughLiveBins ? buildBinStats(latestChartData) : buildDemoBinStats();
    renderCharts(latestChartData, binStats);
  }
}

function sum(items, field) {
  return items.reduce((total, item) => total + num(item[field]), 0);
}

function safeBin(row) {
  return row.bin_id || "BIN-001";
}

function num(value) {
  return Number(value || 0);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

setInterval(loadData, 5000);
loadData();
