let map = null;
let marker = null;
let latestBin = null;

const DEFAULT_LAT = 37.3022;
const DEFAULT_LON = -120.4829;

document.addEventListener("DOMContentLoaded", () => {
  loadLocationData();
  setInterval(loadLocationData, 5000);
});


// ===============================
// Load Data from Supabase
// ===============================
async function loadLocationData() {
  try {
    const { data, error } = await supabaseClient
      .from("origin_events")
      .select("*")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Supabase error:", error);
      showWaitingState();
      return;
    }

    if (!data || data.length === 0) {
      showWaitingState();
      return;
    }

    latestBin = data[0];

    const lat = Number(latestBin.latitude);
    const lon = Number(latestBin.longitude);

    if (!lat || !lon) {
      showWaitingState();
      return;
    }

    // 🔥 این مهم‌ترین خطه
    renderMap(latestBin);

    renderStats(latestBin);
    renderPerformanceList(latestBin);
    updateLastUpdated();

  } catch (err) {
    console.error("Location load failed:", err);
    showWaitingState();
  }
}


// ===============================
// Render Map (REAL)
// ===============================
function renderMap(bin) {
  if (!window.google || !google.maps) {
    console.error("Google Maps not loaded");
    return;
  }

  const lat = Number(bin.latitude);
  const lon = Number(bin.longitude);

  const position = { lat: lat, lng: lon };

  // اگر اولین باره
  if (!map) {
    map = new google.maps.Map(document.getElementById("map"), {
      center: position,
      zoom: 19,
      mapTypeId: "satellite",
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: true,
      zoomControl: true
    });
  } else {
    map.setCenter(position);
  }

  const labelText = `${safeBin(bin)} | ${num(bin.weight_lb).toFixed(2)} lb`;

  // اگر marker نداریم
  if (!marker) {
    marker = new google.maps.Marker({
      position: position,
      map: map,
      title: labelText,
      label: {
        text: labelText,
        color: "#ffffff",
        fontWeight: "700",
        fontSize: "13px"
      }
    });
  } else {
    // آپدیت marker
    marker.setPosition(position);
    marker.setTitle(labelText);
    marker.setLabel({
      text: labelText,
      color: "#ffffff",
      fontWeight: "700",
      fontSize: "13px"
    });
  }
}


// ===============================
// Stats
// ===============================
function renderStats(bin) {
  const weight = num(bin.weight_lb);

  setText("totalBins", "1");
  setText("allBinsCount", "(1)");
  setText("totalWeight", weight.toFixed(2) + " lb");
  setText("farmAverage", weight.toFixed(2) + " lb");
  setText("topPerformer", `${safeBin(bin)} ${weight.toFixed(2)} lb`);
  setText("needsAttention", weight > 0 ? "0 Bins" : "1 Bin");
}


// ===============================
// Sidebar List
// ===============================
function renderPerformanceList(bin) {
  const list = document.getElementById("binPerformanceList");
  if (!list) return;

  const weight = num(bin.weight_lb);
  const status = weight > 0 ? "high" : "low";

  list.innerHTML = `
    <div class="bin-row active">
      <div class="status-dot dot-${status}"></div>
      <strong>${safeBin(bin)}</strong>
      <span>${bin.row || "Row —"}</span>
      <b class="${status === "high" ? "green" : "red"}">
        ${weight.toFixed(2)} lb
      </b>
    </div>
  `;
}


// ===============================
// Waiting State
// ===============================
function showWaitingState() {
  setText("totalBins", "0");
  setText("allBinsCount", "(0)");
  setText("totalWeight", "0.00 lb");
  setText("farmAverage", "0.00 lb");
  setText("topPerformer", "—");
  setText("needsAttention", "0 Bins");
  setText("lastUpdateSmall", "● Waiting for GPS");

  const list = document.getElementById("binPerformanceList");
  if (list) list.innerHTML = "";

  // نقشه پیش‌فرض
  if (!map && window.google && google.maps) {
    map = new google.maps.Map(document.getElementById("map"), {
      center: { lat: DEFAULT_LAT, lng: DEFAULT_LON },
      zoom: 18,
      mapTypeId: "satellite"
    });
  }
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

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}
