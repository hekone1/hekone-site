let latestBins = [];
let selectedBinId = null;

async function loadLocationData() {
  const { data, error } = await supabaseClient
    .from("origin_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error("Supabase error:", error);
    return;
  }

  if (!data || data.length === 0) {
    showNoGpsMessage("No Origin data found yet.");
    return;
  }

  const latestByBin = {};

  data.forEach((row) => {
    const binId = row.bin_id || "BIN-001";

    if (!latestByBin[binId]) {
      latestByBin[binId] = row;
    }
  });

  latestBins = Object.values(latestByBin).filter((bin) => {
    return Number(bin.latitude || 0) && Number(bin.longitude || 0);
  });

  if (latestBins.length === 0) {
    showNoGpsMessage("No GPS location found yet. Waiting for latitude and longitude data.");
    updateTopStats(null);
    return;
  }

  if (!selectedBinId) {
    selectedBinId = latestBins[0].bin_id || "BIN-001";
  }

  let selectedBin = latestBins.find((b) => (b.bin_id || "BIN-001") === selectedBinId);

  if (!selectedBin) {
    selectedBin = latestBins[0];
    selectedBinId = selectedBin.bin_id || "BIN-001";
  }

  updateTopStats(selectedBin);
  renderMap(selectedBin);
  renderLocationList(latestBins, selectedBinId);
  updateLastUpdated();
}

function renderMap(bin) {
  const iframe = document.getElementById("satelliteMap");
  const label = document.getElementById("mapBinLabel");

  if (!iframe || !bin) return;

  const lat = Number(bin.latitude || 0);
  const lon = Number(bin.longitude || 0);

  if (!lat || !lon) {
    iframe.src = "";
    if (label) label.innerText = "(No GPS)";
    return;
  }

  const binId = bin.bin_id || "BIN-001";

  if (label) {
    label.innerText = `(${binId})`;
  }

  iframe.src = `https://maps.google.com/maps?q=${lat},${lon}&z=18&t=k&output=embed`;
}

function renderLocationList(bins, activeBinId) {
  const container = document.getElementById("locationList");
  if (!container) return;

  container.innerHTML = "";

  bins.forEach((bin) => {
    const binId = bin.bin_id || "BIN-001";
    const lat = Number(bin.latitude || 0);
    const lon = Number(bin.longitude || 0);
    const weight = Number(bin.weight_lb || 0);
    const fillRate = Number(bin.fill_rate || 0);

    const card = document.createElement("div");
    card.className =
      "location-bin-card" + (binId === activeBinId ? " active" : "");

    card.innerHTML = `
      <div class="location-bin-top">
        <strong>${binId}</strong>
        <span>${bin.status || "Live"}</span>
      </div>

      <div class="location-bin-meta">
        <div>Block / Row: <b>${bin.block || "—"} / ${bin.row || "—"}</b></div>
        <div>Weight: <b>${weight.toFixed(2)} lb</b></div>
        <div>Fill Rate: <b>${fillRate.toFixed(2)} lb/min</b></div>
        <div>Lat: <b>${lat.toFixed(6)}</b></div>
        <div>Lon: <b>${lon.toFixed(6)}</b></div>
      </div>
    `;

    card.addEventListener("click", () => {
      selectedBinId = binId;
      updateTopStats(bin);
      renderMap(bin);
      renderLocationList(latestBins, selectedBinId);
    });

    container.appendChild(card);
  });
}

function updateTopStats(bin) {
  setText("trackedBins", latestBins.length);

  if (!bin) {
    setText("selectedBin", "—");
    setText("selectedBlockRow", "No GPS data");
    setText("latitudeValue", "—");
    setText("longitudeValue", "—");
    return;
  }

  const binId = bin.bin_id || "BIN-001";
  const lat = Number(bin.latitude || 0);
  const lon = Number(bin.longitude || 0);

  setText("selectedBin", binId);
  setText("selectedBlockRow", `${bin.block || "—"} / ${bin.row || "—"}`);
  setText("latitudeValue", lat.toFixed(6));
  setText("longitudeValue", lon.toFixed(6));
}

function showNoGpsMessage(message) {
  const container = document.getElementById("locationList");
  const iframe = document.getElementById("satelliteMap");
  const label = document.getElementById("mapBinLabel");

  if (container) {
    container.innerHTML = `
      <div class="no-gps-message">
        ${message}<br><br>
        Make sure the ESP32 is sending <b>latitude</b> and <b>longitude</b> into the <b>origin_events</b> table.
      </div>
    `;
  }

  if (iframe) iframe.src = "";
  if (label) label.innerText = "(No GPS)";
}

function updateLastUpdated() {
  const lastUpdated = document.getElementById("lastUpdated");

  if (lastUpdated) {
    lastUpdated.innerText = "Updated: " + new Date().toLocaleTimeString();
  }
}

function setText(id, value) {
  const el = document.getElementById(id);

  if (el) {
    el.innerText = value;
  }
}

setInterval(loadLocationData, 5000);
loadLocationData();
