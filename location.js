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
    console.error("Mapbox GL JS is not loaded.");
    setStatus("Mapbox library not loaded.");
    return;
  }

  if (!MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith("pk.")) {
    console.error("Mapbox token missing or invalid.");
    setStatus("Mapbox token is missing. Add your pk... token in location.js.");
    renderWaitingStats();
    return;
  }

  mapboxgl.accessToken = MAPBOX_TOKEN;

  initMap(DEFAULT_LAT, DEFAULT_LON);

  loadLocationData();
  setInterval(loadLocationData, 5000);
});

// ===============================
// Initialize Map
// ===============================
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

    if (latestBin) {
      renderMap(latestBin);
    }
  });

  map.on("error", (e) => {
    console.error("Mapbox error:", e);
    setStatus("Mapbox error. Check token or console.");
  });
}

// ===============================
// Load Latest GPS from Supabase
// ===============================
async function loadLocationData() {
  try {
    if (typeof supabaseClient === "undefined") {
      console.error("supabaseClient is not defined.");
      setStatus("Supabase client is not loaded.");
      return;
    }

    const { data, error } = await supabaseClient
      .from("origin_events")
      .select("*")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Supabase error:", error);
      showWaitingState("Supabase error. Check console.");
      return;
    }

    if (!data || data.length === 0) {
      showWaitingState("No GPS data found yet.");
      return;
    }

    const bin = data[0];

    const lat = Number(bin.latitude);
    const lon = Number(bin.longitude);

    if (!isValidCoordinate(lat, lon)) {
      console.warn("Invalid GPS coordinate:", lat, lon);
      showWaitingState("Latest GPS coordinate is invalid.");
      return;
    }

    latestBin = bin;

    renderStats(bin);
    renderPerformanceList(bin);
    renderMap(bin);
    updateLastUpdated();

  } catch (err) {
    console.error("Location load failed:", err);
    showWaitingState("Location load failed. Check console.");
  }
}

// ===============================
// Render Map
// ===============================
function renderMap(bin) {
  if (!map || !mapReady) {
    console.log("Map not ready yet.");
    return;
  }

  const lat = Number(bin.latitude);
  const lon = Number(bin.longitude);

  if (!isValidCoordinate(lat, lon)) {
    showWaitingState("Invalid GPS coordinate.");
    return;
  }

  const lngLat = [lon, lat];
  const weight = num(bin.weight_lb);
  const status = getStatus(bin);
  const binId = safeBin(bin);

  map.easeTo({
    center: lngLat,
    zoom: 19,
    duration: 800
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
      offset: 28,
      closeButton: false,
      closeOnClick: false
    }).setHTML(popupHtml);
  } else {
    popup.setHTML(popupHtml);
  }

  if (!marker) {
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

  } else {
    marker.setLngLat(lngLat);

    const oldEl = marker.getElement();
    const newEl = createMarkerElement(bin, status);

    oldEl.className = newEl.className;
    oldEl.innerHTML = newEl.innerHTML;
  }

  setText("latitudeText", lat.toFixed(6));
  setText("longitudeText", lon.toFixed(6));
  setStatus(`Live GPS: ${binId} at ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
}

// ===============================
// Small Square Marker
// ===============================
function createMarkerElement(bin, status) {
  const el = document.createElement("div");
  el.className = `origin-marker ${status}`;

  const weight = num(bin.weight_lb);
  const binId = safeBin(bin);

  el.innerHTML = `
    <div class="origin-marker-dot"></div>

    <div class="origin-marker-card">
      <div class="origin-marker-info">
        <small>${binId}</small>
        <strong>${weight.toFixed(2)} lb</strong>
      </div>
    </div>
  `;

  return el;
}

// ===============================
// Sidebar Stats
// ===============================
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

// ===============================
// Sidebar Performance
// ===============================
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

// ===============================
// Waiting State
// ===============================
function showWaitingState(message) {
  renderWaitingStats();
  setStatus(message);
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

// ===============================
// Last Updated
// ===============================
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

// ===============================
// Helpers
// ===============================
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
