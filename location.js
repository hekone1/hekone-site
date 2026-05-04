let latestBins = [];
let selectedBinId = null;

const DEFAULT_LAT = 37.3022;
const DEFAULT_LON = -120.4829;

const demoPositions = [
  [22, 14], [45, 17], [61, 23], [18, 33], [36, 29],
  [54, 34], [66, 40], [78, 33], [18, 51], [30, 51],
  [47, 53], [61, 57], [78, 59], [22, 67], [38, 69],
  [55, 70], [72, 73], [24, 83], [43, 85], [63, 86]
];

document.addEventListener("DOMContentLoaded", () => {
  const sortSelect = document.getElementById("sortSelect");

  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      renderPerformanceList(latestBins);
    });
  }

  renderMap(buildDemoBins());
  renderStats(buildDemoBins());
  renderPerformanceList(buildDemoBins());
  updateLastUpdated();

  loadLocationData();
  setInterval(loadLocationData, 5000);
});

async function loadLocationData() {
  try {
    const { data, error } = await supabaseClient
      .from("origin_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      console.error("Supabase error:", error);
      useDemoMode();
      return;
    }

    if (!data || data.length === 0) {
      useDemoMode();
      return;
    }

    const latestByBin = {};

    data.forEach((row) => {
      const binId = row.bin_id || "BIN-001";
      if (!latestByBin[binId]) latestByBin[binId] = row;
    });

    const realBins = Object.values(latestByBin);

    const firstGpsBin = realBins.find(
      (b) => Number(b.latitude || 0) && Number(b.longitude || 0)
    );

    if (realBins.length === 1) {
      latestBins = buildDemoBins(realBins[0]);
    } else {
      latestBins = realBins.map((bin, index) => ({
        ...bin,
        latitude: Number(bin.latitude || firstGpsBin?.latitude || DEFAULT_LAT),
        longitude: Number(bin.longitude || firstGpsBin?.longitude || DEFAULT_LON),
        map_x: demoPositions[index % demoPositions.length][0],
        map_y: demoPositions[index % demoPositions.length][1]
      }));
    }

    if (!selectedBinId && latestBins.length > 0) {
      selectedBinId = latestBins[0].bin_id || "BIN-001";
    }

    renderStats(latestBins);
    renderPerformanceList(latestBins);
    renderMap(latestBins);
    updateLastUpdated();

  } catch (err) {
    console.error("Location load failed:", err);
    useDemoMode();
  }
}

function useDemoMode() {
  latestBins = buildDemoBins();

  if (!selectedBinId) {
    selectedBinId = latestBins[0].bin_id;
  }

  renderStats(latestBins);
  renderPerformanceList(latestBins);
  renderMap(latestBins);
  updateLastUpdated();
}

function buildDemoBins(baseBin = {}) {
  const baseLat = Number(baseBin.latitude || DEFAULT_LAT);
  const baseLon = Number(baseBin.longitude || DEFAULT_LON);

  const weights = [
    648.32, 612.47, 698.37, 586.91, 498.72,
    629.15, 738.94, 642.11, 376.88, 611.23,
    523.18, 658.74, 634.28, 662.11, 604.32,
    587.09, 391.45, 615.87, 715.22, 599.76
  ];

  const rows = [3, 5, 4, 6, 8, 10, 12, 14, 21, 9, 16, 11, 15, 18, 17, 22, 30, 24, 28, 26];

  return weights.map((weight, i) => ({
    ...baseBin,
    bin_id: `BIN-${String(i + 1).padStart(3, "0")}`,
    weight_lb: weight,
    fill_rate: Number(baseBin.fill_rate || 4.8),
    status: "Live",
    block: baseBin.block || "Block A",
    row: `Row ${String(rows[i]).padStart(2, "0")}`,
    latitude: baseLat,
    longitude: baseLon,
    map_x: demoPositions[i][0],
    map_y: demoPositions[i][1]
  }));
}

function renderStats(bins) {
  const totalBins = bins.length;
  const totalWeight = bins.reduce((sum, b) => sum + num(b.weight_lb), 0);
  const avg = totalBins ? totalWeight / totalBins : 0;

  const top = bins.reduce((best, b) =>
    !best || num(b.weight_lb) > num(best.weight_lb) ? b : best
  , null);

  const lowBins = bins.filter((b) => getStatus(b, avg) === "low").length;

  setText("totalBins", totalBins);
  setText("allBinsCount", `(${totalBins})`);
  setText("totalWeight", totalWeight.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " lb");
  setText("farmAverage", avg.toFixed(2) + " lb");

  if (top) {
    setText("topPerformer", `${safeBin(top)} ${num(top.weight_lb).toFixed(2)} lb`);
  }

  setText("needsAttention", `${lowBins} Bins`);
}

function renderPerformanceList(bins) {
  const list = document.getElementById("binPerformanceList");
  const sortSelect = document.getElementById("sortSelect");
  if (!list) return;

  const avg = bins.reduce((sum, b) => sum + num(b.weight_lb), 0) / bins.length;

  let sorted = [...bins];

  if (sortSelect && sortSelect.value === "low") {
    sorted.sort((a, b) => num(a.weight_lb) - num(b.weight_lb));
  } else {
    sorted.sort((a, b) => num(b.weight_lb) - num(a.weight_lb));
  }

  list.innerHTML = "";

  sorted.slice(0, 12).forEach((bin) => {
    const status = getStatus(bin, avg);
    const binId = safeBin(bin);

    const item = document.createElement("div");
    item.className = "bin-row" + (binId === selectedBinId ? " active" : "");

    item.innerHTML = `
      <div class="status-dot dot-${status}"></div>
      <strong>${binId}</strong>
      <span>${bin.row || "Row —"}</span>
      <b class="${statusColorClass(status)}">${num(bin.weight_lb).toFixed(2)} lb</b>
    `;

    item.onclick = () => {
      selectedBinId = binId;
      renderPerformanceList(latestBins);
      renderMap(latestBins);
    };

    list.appendChild(item);
  });
}

function renderMap(bins) {
  const iframe = document.getElementById("satelliteMap");
  const markers = document.getElementById("mapMarkers");
  if (!iframe || !markers) return;

  const gpsBin = bins.find((b) => Number(b.latitude || 0) && Number(b.longitude || 0));

  const lat = gpsBin ? Number(gpsBin.latitude) : DEFAULT_LAT;
  const lon = gpsBin ? Number(gpsBin.longitude) : DEFAULT_LON;

  iframe.src = `https://maps.google.com/maps?q=${lat},${lon}&z=18&t=k&output=embed`;

  markers.innerHTML = "";

  const avg = bins.reduce((sum, b) => sum + num(b.weight_lb), 0) / bins.length;

  bins.forEach((bin, index) => {
    const status = getStatus(bin, avg);
    const binId = safeBin(bin);

    const x = bin.map_x || demoPositions[index % demoPositions.length][0];
    const y = bin.map_y || demoPositions[index % demoPositions.length][1];

    const marker = document.createElement("div");
    marker.className = "bin-marker";
    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;

    marker.innerHTML = `
      <div class="marker-dot dot-${status}"></div>
      <div class="marker-card">
        <div class="bin-icon">▣</div>
        <div>
          <small>${binId}</small>
          <strong class="${statusColorClass(status)}">${num(bin.weight_lb).toFixed(2)} lb</strong>
        </div>
      </div>
    `;

    markers.appendChild(marker);
  });
}

function getStatus(bin, avg) {
  const weight = num(bin.weight_lb);
  if (weight < avg * 0.75) return "low";
  if (weight < avg * 0.9) return "average";
  return "high";
}

function statusColorClass(status) {
  if (status === "low") return "red";
  if (status === "average") return "yellow";
  return "green";
}

function updateLastUpdated() {
  const now = new Date();

  setText("lastUpdated", now.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }));

  setText("lastUpdateSmall", "● Live now");
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
