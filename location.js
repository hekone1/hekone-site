// ===============================
// HEKONE Origin - Live Location Map
// Mapbox + Supabase
// ===============================

const MAPBOX_TOKEN = "PASTE_YOUR_MAPBOX_PUBLIC_TOKEN_HERE";

const DEFAULT_LAT = 37.3022;
const DEFAULT_LON = -120.4829;

let map = null;
let marker = null;
let popup = null;
let latestBin = null;
let mapReady = false;

document.addEventListener("DOMContentLoaded", () => {
  console.log("location.js loaded");

  if (!window.mapboxgl) {
    setStatus("Mapbox library not loaded.");
    return;
  }

  if (!MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith("pk.")) {
    setStatus("Mapbox token is missing. Add your pk... token in location.js.");
    renderWaitingStats();
    return;
  }

  mapboxgl.accessToken = MAPBOX_TOKEN;

  initMap(DEFAULT_LAT, DEFAULT_LON);

  loadLocationData();
  setInterval(loadLocationData, 2000);
});

function initMap(lat, lon) {
  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/satellite-streets-v12",
    center: [lon, lat],
    zoom: 17,
    pitch: 0,
    bearing: 0
  });

  map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

  map.on("load", () => {
    mapReady = true;
    setStatus("Map loaded. Waiting for live GPS data...");

    if (latestBin) renderMap(latestBin);
  });

  map.on("error", (e) => {
    console.error("Mapbox error:", e);
    setStatus("Mapbox error. Check token or console.");
  });
}

async function loadLocationData() {
  try {
    if (typeof supabaseClient === "undefined") {
      setStatus("Supabase client is not loaded.");
      return;
    }

    const { data, error } = await supabaseClient
      .from("origin_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Supabase error:", error);
      setStatus("Supabase error. Check console.");
      return;
    }

    if (!data || data.length === 0) {
      setStatus("No data found.");
      return;
    }

    const gpsRow = data.find(row =>
      isValidCoordinate(Number(row.latitude), Number(row.longitude))
    );

    if (!gpsRow) {
      setStatus("No valid GPS data found.");
      return;
    }

    const binId = gpsRow.bin_id || "BIN-001";

    const sameBinRows = data.filter(row =>
      (row.bin_id || "BIN-001") === binId
    );

    const latestWeightRow =
      sameBinRows.find(row => Number(row.weight_lb || 0) > 0) ||
      sameBinRows[0] ||
      gpsRow;

    const bin = {
      ...gpsRow,
      weight_lb: latestWeightRow.weight_lb,
      fill_rate: latestWeightRow.fill_rate,
      estimated_value: latestWeightRow.estimated_value,
      status: latestWeightRow.status || gpsRow.status,
      block: latestWeightRow.block || gpsRow.block,
      row: latestWeightRow.row || gpsRow.row
    };

    latestBin = bin;

    renderStats(bin);
    renderPerformanceList(bin);
    renderMap(bin);
    updateLastUpdated();

    console.log("Location page live row:", bin);

  } catch (err) {
    console.error("Location load failed:", err);
    setStatus("Location load failed. Check console.");
  }
}

function renderMap(bin) {
  if (!map || !mapReady) return;

  const lat = Number(bin.latitude);
  const lon = Number(bin.longitude);

  if (!isValidCoordinate(lat, lon)) {
    setStatus("Invalid GPS coordinate.");
    return;
  }

  const lngLat = [lon, lat];
  const weight = num(bin.weight_lb);
  const status = getStatus(bin);
  const binId = safeBin(bin);

  map.easeTo({
    center: lngLat,
    zoom: 19,
    duration: 700
  });

  const popupHtml = `
    <div class="popup-content">
      <strong>${binId}</strong><br>
      Weight: ${weight.toFixed(2)} lb<br>
      Block: ${bin.block || "—"}<br>
      Row: ${bin.row || "—"}<br>
      Lat: ${lat.toFixed(6)}<br>
      Lon: ${lon.toFixed(6)}
    </div>
  `;

  if (!popup) {
    popup = new mapboxgl.Popup({
      offset: 24,
      closeButton: false,
      closeOnClick: false
    }).setHTML(popupHtml);
  } else {
    popup.setHTML(popupHtml);
  }

  if (marker) {
    marker.remove();
    marker = null;
  }

  const markerEl = createMarkerElement(bin, status);

  marker = new mapboxgl.Marker({
    element: markerEl,
    anchor: "bottom"
  })
    .setLngLat(lngLat)
    .setPopup(popup)
    .addTo(map);

  marker.getElement().addEventListener("mouseenter", () => {
    popup.setLngLat(lngLat).addTo(map);
  });

  marker.getElement().addEventListener("mouseleave", () => {
    popup.remove();
  });

  setText("latitudeText", lat.toFixed(6));
  setText("longitudeText", lon.toFixed(6));
  setStatus(`Live GPS: ${binId} | ${weight.toFixed(2)} lb`);
}

function createMarkerElement(bin, status) {
  const weight = num(bin.weight_lb);
  const binId = safeBin(bin);

  let color = "#00c46a";
  if (status === "low") color = "#ff453a";
  if (status === "average") color = "#facc15";

  const el = document.createElement("div");
  el.className = "hekone-pin";

  el.style.setProperty("width", "88px", "important");
  el.style.setProperty("height", "66px", "important");
  el.style.setProperty("display", "block", "important");
  el.style.setProperty("position", "relative", "important");
  el.style.setProperty("pointer-events", "auto", "important");
  el.style.setProperty("overflow", "visible", "important");
  el.style.setProperty("max-width", "88px", "important");
  el.style.setProperty("min-width", "88px", "important");

  el.innerHTML = `
    <div style="
      width: 12px !important;
      height: 12px !important;
      border-radius: 999px !important;
      background: ${color} !important;
      border: 2px solid #061018 !important;
      box-shadow: 0 0 0 4px rgba(0,0,0,0.25) !important;
      margin: 0 auto 5px auto !important;
      box-sizing: border-box !important;
    "></div>

    <div style="
      width: 88px !important;
      height: 49px !important;
      background: rgba(10, 15, 22, 0.96) !important;
      border: 1px solid rgba(139, 92, 246, 0.85) !important;
      border-radius: 8px !important;
      padding: 6px !important;
      box-shadow: 0 8px 22px rgba(0,0,0,0.35) !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      align-items: center !important;
      text-align: center !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    ">
      <div style="
        color: #cbd5e1 !important;
        font-size: 10px !important;
        font-weight: 800 !important;
        line-height: 1 !important;
        margin-bottom: 4px !important;
        white-space: nowrap !important;
      ">${binId}</div>

      <div style="
        color: ${color} !important;
        font-size: 12px !important;
        font-weight: 900 !important;
        line-height: 1 !important;
        white-space: nowrap !important;
      ">${weight.toFixed(2)} lb</div>
    </div>
  `;

  return el;
}

function renderStats(bin) {
  const weight = num(bin.weight_lb);
  const binId = safeBin(bin);

  setText("totalBins", "1");
  setText("allBinsCount", "(1)");
  setText("totalWeight", weight.toFixed(2) + " lb");
  setText("farmAverage", weight.toFixed(2) + " lb");
  setText("topPerformer", `${binId} ${weight.toFixed(2)} lb`);
  setText("needsAttention", weight > 0 ? "0 Bins" : "1 Bin");
}

function renderPerformanceList(bin) {
  const list = document.getElementById("binPerformanceList");
  if (!list) return;

  const weight = num(bin.weight_lb);
  const status = getStatus(bin);

  list.innerHTML = `
    <div class="bin-row active">
      <div class="status-dot dot-${status}"></div>
      <strong>${safeBin(bin)}</strong>
      <span>${bin.row || "Row —"}</span>
      <b class="${statusColorClass(status)}">${weight.toFixed(2)} lb</b>
    </div>
  `;
}

function renderWaitingStats() {
  setText("totalBins", "0");
  setText("allBinsCount", "(0)");
  setText("totalWeight", "0.00 lb");
  setText("farmAverage", "0.00 lb");
  setText("topPerformer", "—");
  setText("needsAttention", "0 Bins");
  setText("lastUpdateSmall", "● Waiting for GPS");
  setText("latitudeText", "—");
  setText("longitudeText", "—");

  const list = document.getElementById("binPerformanceList");
  if (list) list.innerHTML = "";
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

function isValidCoordinate(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  if (lat < -90 || lat > 90) return false;
  if (lon < -180 || lon > 180) return false;
  return true;
}

function getStatus(bin) {
  const weight = num(bin.weight_lb);
  if (weight <= 0) return "low";
  if (weight < 1) return "average";
  return "high";
}

function statusColorClass(status) {
  if (status === "low") return "red";
  if (status === "average") return "yellow";
  return "green";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function setStatus(message) {
  const el = document.getElementById("mapStatus");
  if (el) el.innerText = message;
}
