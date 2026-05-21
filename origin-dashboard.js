let mainChart = null;
let currentChartTab = "weightByBin";
let latestChartData = [];

const PRICE_PER_LB = 3.0;
const LABOR_COST_PER_ACTIVE_BIN = 2.5;

const DISPLAY_BIN_IDS = [
  "BIN-001",
  "BIN-002",
  "BIN-003",
  "BIN-004",
  "BIN-005",
  "BIN-006"
];

const OFF_ROUTE_BIN_IDS = [
  "BIN-007",
  "BIN-008",
  "BIN-009",
  "BIN-010",
  "BIN-011"
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

  latestChartData = data || [];

  const realBins = buildBinStats(latestChartData);
  const displayBins = buildDisplayBins(realBins);

  renderDashboard(displayBins, latestChartData);
}

function renderDashboard(displayBins, rawData) {
  const activeBins = displayBins.filter((bin) => bin.isActive);

  const totalBins = displayBins.length + OFF_ROUTE_BIN_IDS.length;
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

  const needsAttention =
    displayBins.find((bin) => !bin.isActive) ||
    [...activeBins].sort((a, b) => a.cumulativeWeight - b.cumulativeWeight)[0];

  const laborCost = activeCount * LABOR_COST_PER_ACTIVE_BIN;
  const grossLoss = calculateGrossLoss(activeBins, avgPerActiveBin);
  const netImpact = totalValue - grossLoss - laborCost;

  setText("totalBins", totalBins);
  setText("activeBins", "Active: " + activeCount);

  setText("totalWeight", totalCumulativeWeight.toFixed(1) + " lb");
  setText("heroTotalHarvest", totalCumulativeWeight.toFixed(1) + " lb");
  setText("bottomTotalHarvest", totalCumulativeWeight.toFixed(1) + " lb");

  setText("avgPerBin", avgPerActiveBin.toFixed(1) + " lb");
  setText("avgFillRate", avgFillRate.toFixed(1) + " lb/h");

  setText("connectedBinCount", activeCount);
  setText("inactiveBinCount", OFF_ROUTE_BIN_IDS.length);
  setText("barTotalWeight", totalCumulativeWeight.toFixed(1) + " lb");
  setText("binCountIndicator", "1 / 2");

  setText(
    "topPerformer",
    top ? `${top.binId} (${top.cumulativeWeight.toFixed(1)} lb)` : "—"
  );

  setText(
    "needsAttention",
    needsAttention
      ? `${needsAttention.binId} (${avgPerActiveBin.toFixed(1)} lb)`
      : "—"
  );

  setText("grossLoss", "-$" + grossLoss.toFixed(2));
  setText("laborCost", "$" + laborCost.toFixed(2));
  setText("netImpact", "$" + netImpact.toFixed(2));

  const lastUpdated = document.getElementById("lastUpdated");
  if (lastUpdated) {
    lastUpdated.innerText = "Updated: " + new Date().toLocaleTimeString();
  }

  renderMap(activeBins);
  renderInactiveList();
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

  return DISPLAY_BIN_IDS.map((binId) => {
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

function renderMap(activeBins) {
  const map = document.getElementById("fieldMap");
  if (!map) return;

  map.innerHTML = `<div class="map-grid"></div>`;

  const positions = [
    { x: 48, y: 52 },
    { x: 35, y: 42 },
    { x: 62, y: 42 },
    { x: 70, y: 62 },
    { x: 28, y: 62 },
    { x: 56, y: 66 }
  ];

  activeBins.slice(0, 6).forEach((bin, index) => {
    let status = "good";

    if (bin.fillRateLbHour < 1) {
      status = "warning";
    }

    if (bin.cumulativeWeight <= 0) {
      status = "bad";
    }

    const pos = positions[index] || positions[0];

    const dot = document.createElement("div");
    dot.className = `map-bin ${status}`;
    dot.style.left = pos.x + "%";
    dot.style.top = pos.y + "%";
    dot.setAttribute("data-label", bin.binId);

    map.appendChild(dot);
  });
}

function renderInactiveList() {
  const list = document.getElementById("inactiveBinList");
  if (!list) return;

  list.innerHTML = "";

  OFF_ROUTE_BIN_IDS.forEach((binId) => {
    const row = document.createElement("div");
    row.className = "inactive-row";

    row.innerHTML = `
      <b>
        <i class="inactive-dot"></i>
        ${binId}
      </b>

      <span>Inactive / Off-route</span>
    `;

    list.appendChild(row);
  });
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
  const labels = displayBins.map((bin) => bin.binId);
  const values = displayBins.map((bin) => bin.displayWeight);

  const backgroundColors = displayBins.map((bin) =>
    bin.isActive ? "#00e08a" : "rgba(148, 163, 184, 0.42)"
  );

  const borderColors = displayBins.map((bin) =>
    bin.isActive ? "#00e08a" : "rgba(148, 163, 184, 0.62)"
  );

  const valueLabelPlugin = {
    id: "valueLabelPlugin",

    afterDatasetsDraw(chart) {
      const { ctx } = chart;

      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);

        meta.data.forEach((bar, index) => {
          const bin = displayBins[index];
          const value = bin.isActive ? bin.cumulativeWeight : 0;

          ctx.save();
          ctx.fillStyle = "#ffffff";
          ctx.font = "700 12px Arial";
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
          borderRadius: 6,
          maxBarThickness: 70,
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
              const bin = displayBins[context.dataIndex];

              if (!bin.isActive) {
                return bin.binId + ": inactive staged bin";
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
            color: "#f0f7f3",
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
            color: "#f0f7f3"
          },

          ticks: {
            color: "#f0f7f3"
          },

          grid: {
            color: "rgba(202,226,215,0.12)"
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
          color: "#f0f7f3",
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
          color: "#f0f7f3",
          maxTicksLimit: 6
        },

        grid: {
          color: "rgba(202,226,215,0.10)"
        }
      },

      y: {
        beginAtZero: true,

        title: {
          display: true,
          text: currentChartTab === "fillRate" ? "lb/h" : "lb",
          color: "#f0f7f3"
        },

        ticks: {
          color: "#f0f7f3"
        },

        grid: {
          color: "rgba(202,226,215,0.10)"
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

function renderLossTable(displayBins, avgPerActiveBin) {
  const tbody = document.getElementById("lossTableBody");
  const tfoot = document.getElementById("lossTableFoot");

  if (!tbody || !tfoot) return;

  tbody.innerHTML = "";
  tfoot.innerHTML = "";

  let totalExpected = 0;
  let totalActual = 0;
  let totalLossLb = 0;
  let totalGrossLoss = 0;

  displayBins.forEach((bin) => {
    const expected = avgPerActiveBin || 0;
    const actual = bin.isActive ? bin.cumulativeWeight : 0;
    const lossLb = bin.isActive ? Math.max(0, expected - actual) : expected;
    const grossLoss = lossLb * PRICE_PER_LB;

    totalExpected += expected;
    totalActual += actual;
    totalLossLb += lossLb;
    totalGrossLoss += grossLoss;

    const statusClass = bin.isActive ? "status-green" : "status-orange";
    const reasonDot = bin.isActive ? "status-green" : "status-red";
    const reason = bin.isActive ? "Normal" : "Inactive / staged";

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <span class="bin-cell">
          <i class="status-dot ${statusClass}"></i>
          ${bin.binId}
        </span>
      </td>

      <td>${expected.toFixed(1)} lb</td>
      <td>${actual.toFixed(1)} lb</td>

      <td class="${lossLb > 0 ? "loss-red" : ""}">
        ${lossLb > 0 ? "-" : ""}${lossLb.toFixed(1)} lb
      </td>

      <td class="${grossLoss > 0 ? "loss-red" : ""}">
        ${grossLoss > 0 ? "-$" : "$"}${grossLoss.toFixed(2)}
      </td>

      <td>
        <span class="bin-cell">
          <i class="status-dot ${reasonDot}"></i>
          ${reason}
        </span>
      </td>
    `;

    tbody.appendChild(tr);
  });

  const totalRow = document.createElement("tr");

  totalRow.innerHTML = `
    <td>
      <span class="total-label">♙ Total (Top 6 Bins)</span>
    </td>

    <td>${totalExpected.toFixed(1)} lb</td>
    <td>${totalActual.toFixed(1)} lb</td>
    <td class="loss-red">-${totalLossLb.toFixed(1)} lb</td>
    <td class="loss-red">-$${totalGrossLoss.toFixed(2)}</td>
    <td></td>
  `;

  tfoot.appendChild(totalRow);
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

  const realBins = buildBinStats(latestChartData || []);
  const displayBins = buildDisplayBins(realBins);

  renderCharts(latestChartData || [], displayBins);
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
