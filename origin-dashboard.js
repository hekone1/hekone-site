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
    .limit(400);

  if (error) {
    console.error("Supabase error:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("No data found");
    renderInsights([]);
    renderActivityFeed([]);
    return;
  }

  latestChartData = data;

  const latestByBin = {};

  data.forEach((row) => {

    const binId = row.bin_id || "BIN-001";

    if (!latestByBin[binId]) {
      latestByBin[binId] = row;
    }
  });

  const bins = Object.values(latestByBin);

  const totalBins = bins.length;

  const totalWeight = bins.reduce((sum, b) => {
    return sum + num(b.weight_lb);
  }, 0);

  const totalValue = bins.reduce((sum, b) => {

    const value = num(b.estimated_value);

    return sum + (
      value > 0
        ? value
        : num(b.weight_lb) * PRICE_PER_LB
    );

  }, 0);

  const avgPerBin = totalBins
    ? totalWeight / totalBins
    : 0;

  const avgFillRate = totalBins
    ? bins.reduce((sum, b) => {
        return sum + num(b.fill_rate);
      }, 0) / totalBins
    : 0;

  const top = bins.reduce((best, b) => {

    return !best || num(b.weight_lb) > num(best.weight_lb)
      ? b
      : best;

  }, null);

  const worst = bins.reduce((low, b) => {

    return !low || num(b.weight_lb) < num(low.weight_lb)
      ? b
      : low;

  }, null);

  const laborCost = totalBins * LABOR_COST_PER_ACTIVE_BIN;

  const grossLoss = calculateGrossLoss(bins);

  const netImpact = totalValue - grossLoss - laborCost;

  setText("totalBins", totalBins);

  setText("activeBins", "Active: " + totalBins);

  setText(
    "totalWeight",
    totalWeight.toFixed(1) + " lb"
  );

  setText(
    "estimatedValue",
    "$" + totalValue.toFixed(2)
  );

  setText(
    "avgPerBin",
    avgPerBin.toFixed(1) + " lb"
  );

  setText(
    "avgFillRate",
    avgFillRate.toFixed(2) + " lb/min"
  );

  if (top) {

    setText(
      "topPerformer",
      `${safeBin(top)} (${num(top.weight_lb).toFixed(1)} lb)`
    );
  }

  if (worst) {

    setText(
      "needsAttention",
      `${safeBin(worst)} (${num(worst.weight_lb).toFixed(1)} lb)`
    );
  }

  setText(
    "estimatedRevenue",
    "$" + totalValue.toFixed(2)
  );

  setText(
    "grossLoss",
    "-$" + grossLoss.toFixed(2)
  );

  setText(
    "laborCost",
    "$" + laborCost.toFixed(2)
  );

  setText(
    "netImpact",
    "$" + netImpact.toFixed(2)
  );

  setText(
    "recoverableProfit",
    "$" + grossLoss.toFixed(2)
  );

  setText(
    "monthlyRecovery",
    "$" + (grossLoss * 30).toFixed(0) + " / month"
  );

  setText(
    "seasonRecovery",
    "$" + (grossLoss * 120).toFixed(0) + " / season"
  );

  const lastUpdated = document.getElementById("lastUpdated");

  if (lastUpdated) {

    lastUpdated.innerText =
      "Updated: " +
      new Date().toLocaleTimeString();
  }

  renderMap(bins);

  renderInsights(bins);

  renderActivityFeed(data);

  renderLossTable(bins, avgPerBin);

  renderCharts(data);
}

function renderMap(bins) {

  const map = document.getElementById("fieldMap");

  if (!map) return;

  map.innerHTML = `
    <div class="map-grid"></div>
  `;

  const positions = [
    { x: 18, y: 30 },
    { x: 42, y: 42 },
    { x: 65, y: 26 },
    { x: 78, y: 58 },
    { x: 28, y: 70 },
    { x: 55, y: 76 },
    { x: 86, y: 34 }
  ];

  bins.slice(0, 7).forEach((bin, index) => {

    const weight = num(bin.weight_lb);

    let status = "good";

    if (weight < 20) {
      status = "bad";
    }
    else if (weight < 60) {
      status = "warning";
    }

    const pos = positions[index];

    const dot = document.createElement("div");

    dot.className = `map-bin ${status}`;

    dot.style.left = pos.x + "%";

    dot.style.top = pos.y + "%";

    dot.setAttribute(
      "data-label",
      safeBin(bin)
    );

    map.appendChild(dot);
  });
}

function renderInsights(bins) {

  const list = document.getElementById("insightsList");

  if (!list) return;

  list.innerHTML = "";

  if (!bins || bins.length === 0) {

    list.innerHTML = `
      <div class="empty-state">
        Waiting for live field insights...
      </div>
    `;

    return;
  }

  const avgWeight = bins.reduce((sum, b) => {
    return sum + num(b.weight_lb);
  }, 0) / bins.length;

  const insights = [];

  bins.forEach((bin) => {

    const weight = num(bin.weight_lb);

    const fillRate = num(bin.fill_rate);

    if (weight < avgWeight * 0.7) {

      insights.push(`
        <b>${safeBin(bin)}</b>
        is harvesting below average today.
      `);
    }

    if (fillRate > 10) {

      insights.push(`
        <b>${safeBin(bin)}</b>
        shows unusually high fill activity.
      `);
    }

    if (fillRate < 1) {

      insights.push(`
        <b>${safeBin(bin)}</b>
        may indicate idle harvesting time.
      `);
    }
  });

  if (insights.length === 0) {

    insights.push(`
      All active bins are operating normally.
    `);
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

    feed.innerHTML = `
      <div class="empty-state">
        Waiting for live telemetry...
      </div>
    `;

    return;
  }

  data.slice(0, 8).forEach((row) => {

    const item = document.createElement("div");

    item.className = "activity-item";

    const time = new Date(
      row.created_at
    ).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

    item.innerHTML = `
      <div class="activity-time">
        ${time}
      </div>

      <div class="activity-text">
        <b>${safeBin(row)}</b>
        updated to
        ${num(row.weight_lb).toFixed(1)} lb
      </div>
    `;

    feed.appendChild(item);
  });
}

function renderLossTable(bins, avgPerBin) {

  const tbody =
    document.getElementById("lossTableBody");

  if (!tbody) return;

  tbody.innerHTML = "";

  const rows = bins
    .map((bin) => {

      const weight = num(bin.weight_lb);

      const expected = avgPerBin || weight;

      const lossLb = Math.max(
        0,
        expected - weight
      );

      const grossLoss =
        lossLb * PRICE_PER_LB;

      let reason = "Normal";

      if (lossLb > 10) {
        reason = "Needs review";
      }
      else if (lossLb > 3) {
        reason = "Below avg";
      }

      return {
        binId: safeBin(bin),
        weight,
        lossLb,
        grossLoss,
        reason
      };

    })
    .sort((a, b) => {
      return b.grossLoss - a.grossLoss;
    });

  rows.slice(0, 6).forEach((row) => {

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.binId}</td>

      <td>
        ${row.weight.toFixed(1)} lb
      </td>

      <td class="${
        row.lossLb > 0
          ? "loss-red"
          : ""
      }">

        ${
          row.lossLb > 0
            ? "-"
            : ""
        }

        ${row.lossLb.toFixed(1)} lb

      </td>

      <td class="${
        row.grossLoss > 0
          ? "loss-red"
          : ""
      }">

        ${
          row.grossLoss > 0
            ? "-$"
            : "$"
        }

        ${row.grossLoss.toFixed(2)}

      </td>

      <td>${row.reason}</td>
    `;

    tbody.appendChild(tr);
  });
}

function calculateGrossLoss(bins) {

  if (!bins || bins.length === 0) {
    return 0;
  }

  const avgWeight =
    bins.reduce((sum, b) => {
      return sum + num(b.weight_lb);
    }, 0) / bins.length;

  return bins.reduce((sum, b) => {

    const lossLb = Math.max(
      0,
      avgWeight - num(b.weight_lb)
    );

    return sum + (
      lossLb * PRICE_PER_LB
    );

  }, 0);
}

function renderCharts(data) {

  const byBin = {};

  data.forEach((row) => {

    const binId =
      row.bin_id || "BIN-001";

    if (!byBin[binId]) {
      byBin[binId] = [];
    }

    byBin[binId].push(row);
  });

  const binIds =
    Object.keys(byBin).slice(0, 4);

  if (binIds.length === 0) return;

  const colors = [
    "#00e08a",
    "#22d3ee",
    "#f5a524",
    "#ff3b3b"
  ];

  let labels = [];

  let datasets = [];

  if (currentChartTab === "fillRate") {

    const firstBinMinuteData =
      buildMinuteFillRateSeries(
        byBin[binIds[0]]
      );

    labels = firstBinMinuteData.map((p) => {
      return p.label;
    });

    datasets = binIds.map((binId, index) => {

      const minuteData =
        buildMinuteFillRateSeries(
          byBin[binId]
        );

      return {
        label: binId,

        data: minuteData.map((p) => {
          return p.value;
        }),

        borderColor:
          colors[index % colors.length],

        backgroundColor:
          "transparent",

        borderWidth: 3,

        tension: 0.4,

        pointRadius: 1.8,

        pointHoverRadius: 5,

        fill: false
      };
    });

  } else {

    const firstBinRows = [
      ...byBin[binIds[0]]
    ]
      .sort((a, b) => {
        return new Date(a.created_at)
          - new Date(b.created_at);
      })
      .slice(-30);

    labels = firstBinRows.map((row) => {

      const d = new Date(
        row.created_at
      );

      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
    });

    datasets = binIds.map((binId, index) => {

      const rows = [
        ...byBin[binId]
      ]
        .sort((a, b) => {
          return new Date(a.created_at)
            - new Date(b.created_at);
        })
        .slice(-30);

      return {
        label: binId,

        data: rows.map((r) => {
          return num(r.weight_lb);
        }),

        borderColor:
          colors[index % colors.length],

        backgroundColor:
          "transparent",

        borderWidth: 3,

        tension: 0.4,

        pointRadius: 1.8,

        pointHoverRadius: 5,

        fill: false
      };
    });
  }

  const ctx =
    document.getElementById("mainChart");

  if (!ctx) return;

  if (mainChart) {
    mainChart.destroy();
  }

  mainChart = new Chart(ctx, {

    type: "line",

    data: {
      labels,
      datasets
    },

    options: {

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

          ticks: {
            color: "#94a3b8"
          },

          grid: {
            color: "rgba(148,163,184,0.08)"
          }
        }
      }
    }
  });
}

function buildMinuteFillRateSeries(rows) {

  if (!rows || rows.length === 0) {
    return [];
  }

  const sorted = [...rows].sort(
    (a, b) => {
      return new Date(a.created_at)
        - new Date(b.created_at);
    }
  );

  const minuteBuckets = {};

  sorted.forEach((row) => {

    const d = new Date(
      row.created_at
    );

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

      const bucket =
        minuteBuckets[key];

      const first = bucket[0];

      const last =
        bucket[bucket.length - 1];

      const firstWeight =
        num(first.weight_lb);

      const lastWeight =
        num(last.weight_lb);

      let lbPerMin =
        lastWeight - firstWeight;

      if (lbPerMin < 0) {
        lbPerMin = 0;
      }

      const d = new Date(key);

      return {

        label: d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),

        value: lbPerMin
      };
    });
}

function switchChartTab(tabName) {

  currentChartTab = tabName;

  const fillRateTab =
    document.getElementById(
      "fillRateTab"
    );

  const weightTab =
    document.getElementById(
      "weightTab"
    );

  if (fillRateTab && weightTab) {

    fillRateTab.classList.toggle(
      "active",
      tabName === "fillRate"
    );

    weightTab.classList.toggle(
      "active",
      tabName === "weight"
    );
  }

  if (
    latestChartData &&
    latestChartData.length > 0
  ) {

    renderCharts(latestChartData);
  }
}

function safeBin(row) {
  return row.bin_id || "BIN-001";
}

function num(value) {
  return Number(value || 0);
}

function setText(id, value) {

  const el =
    document.getElementById(id);

  if (el) {
    el.innerText = value;
  }
}

setInterval(loadData, 5000);

loadData();
