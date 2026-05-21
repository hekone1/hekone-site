let mainChart = null;
let currentChartTab = "weightByBin";
let latestChartData = [];

const PRICE_PER_LB = 3.0;
const LABOR_COST_PER_ACTIVE_BIN = 2.5;

const RESET_STORAGE_KEY = "hekone_origin_cumulative_reset_time";

let cumulativeResetTime = localStorage.getItem(RESET_STORAGE_KEY)
  ? new Date(localStorage.getItem(RESET_STORAGE_KEY))
  : null;

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

const EMPTY_BIN_DISPLAY_WEIGHT = 180;

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

  const filteredData = cumulativeResetTime
    ? latestChartData.filter(
        row => new Date(row.created_at) > cumulativeResetTime
      )
    : latestChartData;

  const realBins = buildBinStats(filteredData);
  const displayBins = buildDisplayBins(realBins);

  renderDashboard(displayBins, filteredData);
}

function renderDashboard(displayBins, rawData) {

  const activeBins = displayBins.filter(bin => bin.isActive);

  const totalBins = displayBins.length + OFF_ROUTE_BIN_IDS.length;
  const activeCount = activeBins.length;

  const totalCumulativeWeight = activeBins.reduce(
    (sum, bin) => sum + bin.cumulativeWeight,
    0
  );

  const totalLiveWeight = activeBins.reduce(
    (sum, bin) => sum + bin.currentWeight,
    0
  );

  const totalRevenue = totalCumulativeWeight * PRICE_PER_LB;

  const avgPerActiveBin = activeCount
    ? totalCumulativeWeight / activeCount
    : 0;

  const avgFillRate = activeCount
    ? activeBins.reduce(
        (sum, bin) => sum + bin.fillRateLbHour,
        0
      ) / activeCount
    : 0;

  const top = [...activeBins].sort(
    (a, b) => b.cumulativeWeight - a.cumulativeWeight
  )[0];

  const needsAttention =
    displayBins.find(bin => !bin.isActive) ||
    [...activeBins].sort(
      (a, b) => a.cumulativeWeight - b.cumulativeWeight
    )[0];

  const laborCost = activeCount * LABOR_COST_PER_ACTIVE_BIN;

  const grossLoss = calculateGrossLoss(
    activeBins,
    avgPerActiveBin
  );

  const netImpact =
    totalRevenue - grossLoss - laborCost;

  setText("totalBins", totalBins);

  setText(
    "activeBins",
    "Active: " + activeCount
  );

  setText(
    "totalWeight",
    totalCumulativeWeight.toFixed(1) + " lb"
  );

  setText(
    "heroTotalHarvest",
    "$" + totalRevenue.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );

  setText(
    "bottomTotalHarvest",
    "$" + totalRevenue.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );

  setText(
    "liveWeight",
    totalLiveWeight.toFixed(1) + " lb"
  );

  setText(
    "bottomLiveWeight",
    totalLiveWeight.toFixed(1) + " lb"
  );

  setText(
    "avgPerBin",
    avgPerActiveBin.toFixed(1) + " lb"
  );

  setText(
    "avgFillRate",
    avgFillRate.toFixed(1) + " lb/h"
  );

  setText(
    "connectedBinCount",
    activeCount
  );

  setText(
    "inactiveBinCount",
    OFF_ROUTE_BIN_IDS.length
  );

  setText(
    "barTotalWeight",
    totalCumulativeWeight.toFixed(1) + " lb"
  );

  setText(
    "binCountIndicator",
    "1 / 2"
  );

  setText(
    "topPerformer",
    top
      ? `${top.binId} (${top.cumulativeWeight.toFixed(1)} lb)`
      : "—"
  );

  setText(
    "needsAttention",
    needsAttention
      ? `${needsAttention.binId} (${avgPerActiveBin.toFixed(1)} lb)`
      : "—"
  );

  setText(
    "grossLoss",
    "-$" + grossLoss.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );

  setText(
    "laborCost",
    "$" + laborCost.toFixed(2)
  );

  setText(
    "netImpact",
    "$" + netImpact.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );

  const lastUpdated =
    document.getElementById("lastUpdated");

  if (lastUpdated) {

    lastUpdated.innerText =
      "Updated: " +
      new Date().toLocaleTimeString();
  }

  renderMap(activeBins);

  renderInactiveList();

  renderLossTable(
    displayBins,
    avgPerActiveBin
  );

  renderCharts(rawData, displayBins);
}

function buildBinStats(data) {

  const grouped = {};

  data.forEach(row => {

    const binId =
      row.bin_id || "BIN-001";

    if (!grouped[binId]) {
      grouped[binId] = [];
    }

    grouped[binId].push(row);
  });

  return Object.keys(grouped).map(binId => {

    const rows = grouped[binId].sort(
      (a, b) =>
        new Date(a.created_at) -
        new Date(b.created_at)
    );

    let cumulativeWeight = 0;

    if (rows.length > 0) {
      cumulativeWeight += Math.max(
        0,
        num(rows[0].weight_lb)
      );
    }

    for (let i = 1; i < rows.length; i++) {

      const previousWeight =
        num(rows[i - 1].weight_lb);

      const currentWeight =
        num(rows[i].weight_lb);

      const delta =
        currentWeight - previousWeight;

      if (delta > 0) {
        cumulativeWeight += delta;
      }
    }

    const latest =
      rows[rows.length - 1];

    return {
      binId,
      rows,
      latest,

      currentWeight:
        num(latest.weight_lb),

      cumulativeWeight,

      displayWeight:
        cumulativeWeight,

      fillRateLbHour:
        calculateRecentFillRateLbHour(rows),

      isActive: true
    };
  });
}

function buildDisplayBins(realBins) {

  const byId = {};

  realBins.forEach(bin => {
    byId[bin.binId] = bin;
  });

  return DISPLAY_BIN_IDS.map(binId => {

    if (byId[binId]) {

      return {
        ...byId[binId],
        displayWeight:
          byId[binId].cumulativeWeight,
        isActive: true
      };
    }

    return {
      binId,

      rows: [],
      latest: null,

      currentWeight: 0,

      cumulativeWeight: 0,

      displayWeight:
        EMPTY_BIN_DISPLAY_WEIGHT,

      fillRateLbHour: 0,

      isActive: false
    };
  });
}

function calculateRecentFillRateLbHour(rows) {

  if (!rows || rows.length < 2)
    return 0;

  const sorted = [...rows].sort(
    (a, b) =>
      new Date(a.created_at) -
      new Date(b.created_at)
  );

  const recent = sorted.slice(-10);

  let positiveGain = 0;

  for (let i = 1; i < recent.length; i++) {

    const delta =
      num(recent[i].weight_lb) -
      num(recent[i - 1].weight_lb);

    if (delta > 0) {
      positiveGain += delta;
    }
  }

  const firstTime =
    new Date(recent[0].created_at);

  const lastTime =
    new Date(
      recent[recent.length - 1].created_at
    );

  const hours =
    (lastTime - firstTime) / 3600000;

  if (hours <= 0) return 0;

  return positiveGain / hours;
}

function renderMap(activeBins) {

  const map =
    document.getElementById("fieldMap");

  if (!map) return;

  map.innerHTML =
    `<div class="map-grid"></div>`;

  const positions = [
    { x: 48, y: 52 },
    { x: 35, y: 42 },
    { x: 62, y: 42 },
    { x: 70, y: 62 },
    { x: 28, y: 62 },
    { x: 56, y: 66 }
  ];

  activeBins
    .slice(0, 6)
    .forEach((bin, index) => {

      let status = "good";

      if (bin.fillRateLbHour < 40) {
        status = "warning";
      }

      if (bin.cumulativeWeight <= 0) {
        status = "bad";
      }

      const pos =
        positions[index] || positions[0];

      const dot =
        document.createElement("div");

      dot.className =
        `map-bin ${status}`;

      dot.style.left =
        pos.x + "%";

      dot.style.top =
        pos.y + "%";

      dot.setAttribute(
        "data-label",
        bin.binId
      );

      map.appendChild(dot);
    });
}

function renderInactiveList() {

  const list =
    document.getElementById(
      "inactiveBinList"
    );

  if (!list) return;

  list.innerHTML = "";

  OFF_ROUTE_BIN_IDS.forEach(binId => {

    const row =
      document.createElement("div");

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

function calculateGrossLoss(
  activeBins,
  avgPerActiveBin
) {

  if (!activeBins || activeBins.length === 0)
    return 0;

  return activeBins.reduce(
    (sum, bin) => {

      const lossLb = Math.max(
        0,
        avgPerActiveBin -
        bin.cumulativeWeight
      );

      return (
        sum +
        lossLb * PRICE_PER_LB
      );
    },
    0
  );
}

function setupResetButton() {

  const resetBtn =
    document.getElementById(
      "resetCumulativeBtn"
    );

  if (!resetBtn) return;

  resetBtn.addEventListener(
    "click",
    () => {

      const confirmed = confirm(
        "Reset cumulative harvest weight from now?"
      );

      if (!confirmed) return;

      cumulativeResetTime =
        new Date();

      localStorage.setItem(
        RESET_STORAGE_KEY,
        cumulativeResetTime.toISOString()
      );

      loadData();
    }
  );
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

  const weightByBinTab =
    document.getElementById(
      "weightByBinTab"
    );

  if (
    fillRateTab &&
    weightTab &&
    weightByBinTab
  ) {

    fillRateTab.classList.toggle(
      "active",
      tabName === "fillRate"
    );

    weightTab.classList.toggle(
      "active",
      tabName === "weight"
    );

    weightByBinTab.classList.toggle(
      "active",
      tabName === "weightByBin"
    );
  }

  const filteredData =
    cumulativeResetTime
      ? latestChartData.filter(
          row =>
            new Date(row.created_at) >
            cumulativeResetTime
        )
      : latestChartData;

  const realBins =
    buildBinStats(filteredData || []);

  const displayBins =
    buildDisplayBins(realBins);

  renderCharts(
    filteredData || [],
    displayBins
  );
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

setupResetButton();

setTimeout(() => {
  switchChartTab("weightByBin");
}, 300);
