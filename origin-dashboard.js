let mainChart = null;
let currentChartTab = "weightByBin";
let latestChartData = [];

const PRICE_PER_LB = 3.0;
const LABOR_COST_PER_ACTIVE_BIN = 2.5;

const DEMO_BIN_IDS = [
  "BIN-001",
  "BIN-002",
  "BIN-003",
  "BIN-004",
  "BIN-005",
  "BIN-006"
];

const EMPTY_BIN_DISPLAY_WEIGHT = 8;

async function loadData() {
  const { data, error } = await supabaseClient
    .from("origin_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Supabase error:", error);
    return;
  }

  if (!data || data.length === 0) {
    const emptyBins = buildDisplayBins([]);
    renderDashboard(emptyBins, []);
    return;
  }

  latestChartData = data;

  const binStats = buildBinStats(data);
  const displayBins = buildDisplayBins(binStats);

  renderDashboard(displayBins, data);
}

function renderDashboard(displayBins, rawData) {
  const activeBins = displayBins.filter((bin) => bin.isActive);
  const totalBins = displayBins.length;
  const activeCount = activeBins.length;

  const totalCumulativeWeight = activeBins.reduce(
    (sum, bin) => sum + bin.cumulativeWeight,
    0
  );

  const totalValue = totalCumulativeWeight * PRICE_PER_LB;

  const avgPerActiveBin = activeCount
    ? totalCumulativeWeight / activeCount
    : 0;

  const avgFillRate = activeCount
    ? activeBins.reduce((sum, bin) => sum + bin.fillRateLbHour, 0) / activeCount
    : 0;

  const top = [...activeBins].sort(
    (a, b) => b.cumulativeWeight - a.cumulativeWeight
  )[0];

  const worst = [...activeBins].sort(
    (a, b) => a.cumulativeWeight - b.cumulativeWeight
  )[0];

  const laborCost = activeCount * LABOR_COST_PER_ACTIVE_BIN;
  const grossLoss = calculateGrossLoss(activeBins, avgPerActiveBin);
  const netImpact = totalValue - grossLoss - laborCost;

  setText("totalBins", totalBins);
  setText("activeBins", "Active: " + activeCount);
  setText("totalWeight", totalCumulativeWeight.toFixed(1) + " lb");
  setText("estimatedValue", "$" + totalValue.toFixed(2));
  setText("heroEstimatedRevenue", "$" + totalValue.toFixed(2));
  setText("avgPerBin", avgPerActiveBin.toFixed(1) + " lb");
  setText("avgFillRate", avgFillRate.toFixed(1) + " lb/h");

  setText(
    "topPerformer",
    top ? `${top.binId} (${top.cumulativeWeight.toFixed(1)} lb)` : "—"
  );

  setText(
    "needsAttention",
    worst ? `${worst.binId} (${worst.cumulativeWeight.toFixed(1)} lb)` : "—"
  );

  setText("estimatedRevenue", "$" + totalValue.toFixed(2));
  setText("grossLoss", "-$" + grossLoss.toFixed(2));
  setText("laborCost", "$" + laborCost.toFixed(2));
  setText("netImpact", "$" + netImpact.toFixed(2));

  setText("barTotalWeight", totalCumulativeWeight.toFixed(1) + " lb");
  setText("binCountIndicator", activeCount + " / 6");

  const lastUpdated = document.getElementById("lastUpdated");

  if (lastUpdated) {
    lastUpdated.innerText = "Updated: " + new Date().toLocaleTimeString();
  }

  renderMap(displayBins);
  renderInsights(displayBins);
  renderActivityFeed(rawData);
  renderLossTable(displayBins, avgPerActiveBin);
  renderCharts(rawData, displayBins);
}

function buildBinStats(data) {
  const grouped = {};

  data.forEach((row) => {
    const binId = row.bin_id || "BIN-001";

    if (!grouped[binId]) {
      grouped[binId] = [];
    }

    grouped[binId].push(row);
  });

  return Object.keys(grouped).map((binId) => {
    const rows = grouped[binId].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    let cumulativeWeight = 0;

    if (rows.length > 0) {
      cumulativeWeight += Math.max(0, num(rows[0].weight_lb));
    }

    for (let i = 1; i < rows.length; i++) {
      const previousWeight = num(rows[i - 1].weight_lb);
      const currentWeight = num(rows[i].weight_lb);
      const delta = currentWeight - previousWeight;

      if (delta > 0) {
        cumulativeWeight += delta;
      }
    }

    const latest = rows[rows.length - 1];

    return {
      binId,
      rows,
      latest,
      currentWeight: num(latest.weight_lb),
      cumulativeWeight,
      displayWeight: cumulativeWeight,
      fillRateLbHour: calculateRecentFillRateLbHour(rows),
      isActive: true
    };
  });
}

function buildDisplayBins(realBins) {
  const byId = {};

  realBins.forEach((bin) => {
    byId[bin.binId] = bin;
  });

  return DEMO_BIN_IDS.map((binId) => {
    if (byId[binId]) {
      return {
        ...byId[binId],
        displayWeight: byId[binId].cumulativeWeight,
        isActive: true
      };
    }

    return {
      binId,
      rows: [],
      latest: null,
      currentWeight: 0,
      cumulativeWeight: 0,
      displayWeight: EMPTY_BIN_DISPLAY_WEIGHT,
      fillRateLbHour: 0,
      isActive: false
    };
  });
}

function calculateRecentFillRateLbHour(rows) {
  if (!rows || rows.length < 2) return 0;

  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  const recent = sorted.slice(-10);

  let positiveGain = 0;

  for (let i = 1; i < recent.length; i++) {
    const delta = num(recent[i].weight_lb) - num(recent[i - 1].weight_lb);

    if (delta > 0) {
      positiveGain += delta;
    }
  }

  const firstTime = new Date(recent[0].created_at);
  const lastTime = new Date(recent[recent.length - 1].created_at);
  const hours = (lastTime - firstTime) / 3600000;

  if (hours <= 0) return 0;

  return positiveGain / hours;
}

function renderCharts(data, displayBins) {
  const barChartHeader = document.getElementById("barChartHeader");
  const barChartFooter = document.getElementById("barChartFooter");

  if (barChartHeader && barChartFooter) {
    const showBarUI = currentChartTab === "weightByBin";
    barChartHeader.style.display = showBarUI ? "flex" : "none";
    barChartFooter.style.display = showBarUI ? "flex" : "none";
  }

  const ctx = document.getElementById("mainChart");
  if (!ctx) return;

  if (mainChart) {
    mainChart.destroy();
  }

  if (currentChartTab === "weightByBin") {
    renderWeightByBinChart(ctx, displayBins);
    return;
  }

  if (!data || data.length === 0) return;

  const byBin = {};

  data.forEach((row) => {
    const binId = row.bin_id || "BIN-001";

    if (!byBin[binId]) {
      byBin[binId] = [];
    }

    byBin[binId].push(row);
  });

  const binIds = Object.keys(byBin).slice(0, 4);
  if (binIds.length === 0) return;

  const colors = ["#00e08a", "#22d3ee", "#ffb020", "#ff2e2e"];

  let labels = [];
  let datasets = [];

  if (currentChartTab === "fillRate") {
    const firstBinData = buildHourlyFillRateSeries(byBin[binIds[0]]);
    labels = firstBinData.map((point) => point.label);

    datasets = binIds.map((binId, index) => {
      const hourlyData = buildHourlyFillRateSeries(byBin[binId]);

      return {
        label: binId,
        data: hourlyData.map((point) => point.value),
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

  if (currentChartTab === "weight") {
    const firstBinRows = [...byBin[binIds[0]]]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(-30);

    labels = firstBinRows.map((row) =>
      new Date(row.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    );

    datasets = binIds.map((binId, index) => {
      const rows = [...byBin[binId]]
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .slice(-30);

      return {
        label: binId,
        data: rows.map((row) => num(row.weight_lb)),
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
    data: {
      labels,
      datasets
    },
    options: getLineChartOptions()
  });
}

function renderWeightByBinChart(ctx, displayBins) {
  const sortedBins = [...displayBins].slice(0, 6);

  const labels = sortedBins.map((bin) => bin.binId);
  const values = sortedBins.map((bin) => bin.displayWeight);

  const backgroundColors = sortedBins.map((bin) => {
    if (bin.isActive) {
      return "#00e08a";
    }

    return "rgba(148, 163, 184, 0.35)";
  });

  const borderColors = sortedBins.map((bin) => {
    if (bin.isActive) {
      return "#00e08a";
    }

    return "rgba(148, 163, 184, 0.55)";
  });

  const valueLabelPlugin = {
    id: "valueLabelPlugin",

    afterDatasetsDraw(chart) {
      const { ctx } = chart;

      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);

        meta.data.forEach((bar, index) => {
          const bin = sortedBins[index];
          const value = bin.isActive ? bin.cumulativeWeight : 0;

          ctx.save();
          ctx.fillStyle = bin.isActive ? "#00e08a" : "#cbd5e1";
          ctx.font = "700 13px Arial";
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
      datasets: [
        {
          label: "Cumulative Harvested Weight",
          data: values,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1,
          borderRadius: 7,
          maxBarThickness: 88,
          categoryPercentage: 0.62,
          barPercentage: 0.88
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,

      plugins: {
        legend: {
          display: false
        },

        tooltip: {
          callbacks: {
            label(context) {
              const bin = sortedBins[context.dataIndex];

              if (!bin.isActive) {
                return bin.binId + ": inactive empty bin";
              }

              return (
                bin.binId +
                ": " +
                bin.cumulativeWeight.toFixed(1) +
                " lb cumulative"
              );
            }
          }
        }
      },

      scales: {
        x: {
          ticks: {
            color: "#cbd5e1",
            font: {
              weight: "700"
            }
          },

          grid: {
            display: false
          }
        },

        y: {
          beginAtZero: true,
          suggestedMax: Math.max(
            100,
            Math.max(...values) * 1.25
          ),

          title: {
            display: true,
            text: "Weight (lb)",
            color: "#94a3b8"
          },

          ticks: {
            color: "#94a3b8"
          },

          grid: {
            color: "rgba(148,163,184,0.09)"
          }
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
      legend: {
        labels: {
          color: "#cbd5e1",
          boxWidth: 12,
          padding: 12
        }
      },

      tooltip: {
        callbacks: {
          label(context) {
            const unit = currentChartTab === "fillRate" ? " lb/h" : " lb";

            return (
              context.dataset.label +
              ": " +
              context.parsed.y.toFixed(2) +
              unit
            );
          }
        }
      }
    },

    scales: {
      x: {
        ticks: {
          color: "#94a3b8",
          maxTicksLimit: 6
        },

        grid: {
          color: "rgba(148,163,184,0.08)"
        }
      },

      y: {
        beginAtZero: true,

        title: {
          display: true,
          text: currentChartTab === "fillRate" ? "lb/h" : "lb",
          color: "#94a3b8"
        },

        ticks: {
          color: "#94a3b8"
        },

        grid: {
          color: "rgba(148,163,184,0.08)"
        }
      }
    }
  };
}

function buildHourlyFillRateSeries(rows) {
  if (!rows || rows.length === 0) return [];

  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  const minuteBuckets = {};

  sorted.forEach((row) => {
    const d = new Date(row.created_at);
    d.setSeconds(0);
    d.setMilliseconds(0);

    const key = d.toISOString();

    if (!minuteBuckets[key]) {
      minuteBuckets[key] = [];
    }

    minuteBuckets[key].push(row);
  });

  return Object.keys(minuteBuckets)
    .sort()
    .slice(-30)
    .map((key) => {
      const bucket = minuteBuckets[key];

      const first = bucket[0];
      const last = bucket[bucket.length - 1];

      let lbPerMinute = num(last.weight_lb) - num(first.weight_lb);

      if (lbPerMinute < 0) {
        lbPerMinute = 0;
      }

      const d = new Date(key);

      return {
        label: d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),
        value: lbPerMinute * 60
      };
    });
}

function renderMap(displayBins) {
  const map = document.getElementById("fieldMap");
  if (!map) return;

  map.innerHTML = `<div class="map-grid"></div>`;

  const positions = [
    { x: 18, y: 30 },
    { x: 42, y: 44 },
    { x: 65, y: 26 },
    { x: 78, y: 58 },
    { x: 28, y: 72 },
    { x: 55, y: 76 }
  ];

  displayBins.slice(0, 6).forEach((bin, index) => {
    let status = "warning";

    if (bin.isActive) {
      status = "good";
    }

    const pos = positions[index];

    const dot = document.createElement("div");
    dot.className = `map-bin ${status}`;
    dot.style.left = pos.x + "%";
    dot.style.top = pos.y + "%";
    dot.setAttribute("data-label", bin.binId);

    map.appendChild(dot);
  });
}

function renderInsights(displayBins) {
  const list = document.getElementById("insightsList");
  if (!list) return;

  list.innerHTML = "";

  const activeBins = displayBins.filter((bin) => bin.isActive);

  if (activeBins.length === 0) {
    list.innerHTML = `<div class="empty-state">Waiting for live field insights...</div>`;
    return;
  }

  const avg =
    activeBins.reduce((sum, bin) => sum + bin.cumulativeWeight, 0) /
    activeBins.length;

  const insights = [];

  activeBins.forEach((bin) => {
    if (avg > 0 && bin.cumulativeWeight >= avg) {
      insights.push(
        `<b>${bin.binId}</b> is actively harvesting and tracking cumulative yield.`
      );
    }

    if (bin.fillRateLbHour < 1) {
      insights.push(`<b>${bin.binId}</b> may indicate idle harvesting time.`);
    }
  });

  const inactiveCount = displayBins.filter((bin) => !bin.isActive).length;

  if (inactiveCount > 0) {
    insights.push(
      `<b>${inactiveCount}</b> additional bins are staged but inactive.`
    );
  }

  insights.slice(0, 5).forEach((text) => {
    const item = document.createElement("div");
    item.className = "insight-item";
    item.innerHTML = text;
    list.appendChild(item);
  });
}

function renderActivityFeed(data) {
  const feed = document.getElementById("activityFeed");
  if (!feed) return;

  feed.innerHTML = "";

  if (!data || data.length === 0) {
    feed.innerHTML = `<div class="empty-state">Waiting for live telemetry...</div>`;
    return;
  }

  data.slice(0, 8).forEach((row) => {
    const item = document.createElement("div");
    item.className = "activity-item";

    const time = new Date(row.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

    item.innerHTML = `
      <div class="activity-time">${time}</div>
      <div class="activity-text">
        <b>${safeBin(row)}</b> updated to ${num(row.weight_lb).toFixed(1)} lb
      </div>
    `;

    feed.appendChild(item);
  });
}

function renderLossTable(displayBins, avgPerActiveBin) {
  const tbody = document.getElementById("lossTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const rows = displayBins.map((bin) => {
    const actualWeight = bin.isActive ? bin.cumulativeWeight : 0;
    const lossLb = bin.isActive ? 0 : avgPerActiveBin;
    const grossLoss = lossLb * PRICE_PER_LB;

    let reason = "Inactive";
    if (bin.isActive) reason = "Normal";

    return {
      binId: bin.binId,
      weight: actualWeight,
      lossLb,
      grossLoss,
      reason,
      isActive: bin.isActive
    };
  });

  rows.slice(0, 6).forEach((row) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.binId}</td>
      <td>${row.weight.toFixed(1)} lb</td>
      <td class="${row.lossLb > 0 ? "loss-red" : ""}">
        ${row.lossLb.toFixed(1)} lb
      </td>
      <td class="${row.grossLoss > 0 ? "loss-red" : ""}">
        $${row.grossLoss.toFixed(2)}
      </td>
      <td>${row.reason}</td>
    `;

    tbody.appendChild(tr);
  });
}

function calculateGrossLoss(activeBins, avgPerActiveBin) {
  if (!activeBins || activeBins.length === 0) return 0;

  return activeBins.reduce((sum, bin) => {
    const lossLb = Math.max(0, avgPerActiveBin - bin.cumulativeWeight);
    return sum + lossLb * PRICE_PER_LB;
  }, 0);
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
    const binStats = buildBinStats(latestChartData);
    const displayBins = buildDisplayBins(binStats);
    renderCharts(latestChartData, displayBins);
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

setTimeout(() => {
  switchChartTab("weightByBin");
}, 300);
