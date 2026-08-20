// ===============================
// HEKONE Origin - Live Location Map
// Mapbox + Supabase
// ===============================

const MAPBOX_TOKEN =
  "pk.eyJ1Ijoic2hhaHJpeWFyMTk5MCIsImEiOiJjbW9ydzdsbWQwMDhrMnNxMHZ2ZDlpZHBsIn0.mRoamkgO6n05IpoIfw6HcQ";

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

  if (
    !MAPBOX_TOKEN ||
    !MAPBOX_TOKEN.startsWith("pk.")
  ) {
    console.error("Mapbox token missing or invalid.");

    setStatus(
      "Mapbox token is missing. Add your pk... token in location.js."
    );

    renderWaitingStats();
    return;
  }

  mapboxgl.accessToken = MAPBOX_TOKEN;

  initMap(
    DEFAULT_LAT,
    DEFAULT_LON
  );

  loadLocationData();

  setInterval(
    loadLocationData,
    5000
  );
});

// ===============================
// Initialize Map
// ===============================

function initMap(lat, lon) {
  map = new mapboxgl.Map({
    container: "map",
    style:
      "mapbox://styles/mapbox/satellite-streets-v12",
    center: [lon, lat],
    zoom: 17,
    pitch: 0,
    bearing: 0
  });

  map.addControl(
    new mapboxgl.NavigationControl(),
    "bottom-right"
  );

  map.on("load", () => {
    mapReady = true;

    setStatus(
      "Map loaded. Waiting for live GPS data..."
    );

    if (latestBin) {
      renderMap(latestBin);
    }
  });

  map.on("error", (e) => {
    console.error(
      "Mapbox error:",
      e
    );

    setStatus(
      "Mapbox error. Check token or console."
    );
  });
}

// ===============================
// Load Latest GPS + Weight
// ===============================

async function loadLocationData() {
  try {
    if (
      typeof supabaseClient ===
      "undefined"
    ) {
      console.error(
        "supabaseClient is not defined."
      );

      setStatus(
        "Supabase client is not loaded."
      );

      return;
    }

    const { data, error } =
      await supabaseClient
        .from("location_events")
        .select(
          "device_id, latitude, longitude, weight_lb, created_at"
        )
        .eq(
          "device_id",
          "HB000003"
        )
        .not(
          "latitude",
          "is",
          null
        )
        .not(
          "longitude",
          "is",
          null
        )
        .order(
          "created_at",
          {
            ascending: false
          }
        )
        .limit(1);

    if (error) {
      console.error(
        "Supabase error:",
        error
      );

      showWaitingState(
        "Supabase error. Check console."
      );

      return;
    }

    if (
      !data ||
      data.length === 0
    ) {
      showWaitingState(
        "No GPS data found yet."
      );

      return;
    }

    const bin = data[0];

    const lat =
      Number(bin.latitude);

    const lon =
      Number(bin.longitude);

    if (
      !isValidCoordinate(
        lat,
        lon
      )
    ) {
      console.warn(
        "Invalid GPS coordinate:",
        lat,
        lon
      );

      showWaitingState(
        "Latest GPS coordinate is invalid."
      );

      return;
    }

    latestBin = bin;

    renderStats(bin);
    renderPerformanceList(bin);
    renderMap(bin);

    updateLastUpdated(
      bin.created_at
    );

  } catch (err) {
    console.error(
      "Location load failed:",
      err
    );

    showWaitingState(
      "Location load failed. Check console."
    );
  }
}

// ===============================
// Render Map
// ===============================

function renderMap(bin) {
  if (
    !map ||
    !mapReady
  ) {
    console.log(
      "Map not ready yet."
    );

    return;
  }

  const lat =
    Number(bin.latitude);

  const lon =
    Number(bin.longitude);

  if (
    !isValidCoordinate(
      lat,
      lon
    )
  ) {
    showWaitingState(
      "Invalid GPS coordinate."
    );

    return;
  }

  const lngLat = [
    lon,
    lat
  ];

  const tilted =
    isTilted(bin);

  const weight =
    tilted
      ? null
      : num(
          bin.weight_lb
        );

  const status =
    getStatus(bin);

  const binId =
    safeBin(bin);

  const weightText =
    tilted
      ? "Tilted"
      : `${weight.toFixed(2)} lb`;

  map.easeTo({
    center: lngLat,
    zoom: 19,
    duration: 800
  });

  const popupHtml = `
    <div class="popup-content">

      <strong>
        ${binId}
      </strong>

      <br>

      Weight:
      <span
        style="
          color:
          ${
            tilted
              ? "#f97316"
              : "#ffffff"
          };
          font-weight:800;
        "
      >
        ${weightText}
      </span>

      <br>

      Lat:
      ${lat.toFixed(6)}

      <br>

      Lon:
      ${lon.toFixed(6)}

    </div>
  `;

  if (!popup) {
    popup =
      new mapboxgl.Popup({
        offset: 24,
        closeButton: false,
        closeOnClick: false
      })
      .setHTML(
        popupHtml
      );
  } else {
    popup.setHTML(
      popupHtml
    );
  }

  if (marker) {
    marker.remove();
    marker = null;
  }

  const markerEl =
    createMarkerElement(
      bin,
      status
    );

  marker =
    new mapboxgl.Marker({
      element: markerEl,
      anchor: "bottom"
    })
    .setLngLat(
      lngLat
    )
    .setPopup(
      popup
    )
    .addTo(
      map
    );

  marker
    .getElement()
    .addEventListener(
      "mouseenter",
      () => {
        popup
          .setLngLat(
            lngLat
          )
          .addTo(
            map
          );
      }
    );

  marker
    .getElement()
    .addEventListener(
      "mouseleave",
      () => {
        popup.remove();
      }
    );

  setText(
    "latitudeText",
    lat.toFixed(6)
  );

  setText(
    "longitudeText",
    lon.toFixed(6)
  );

  if (tilted) {
    setStatus(
      `Live GPS: ${binId} — Tilted, weight unavailable`
    );
  } else {
    setStatus(
      `Live GPS: ${binId} at ${lat.toFixed(6)}, ${lon.toFixed(6)}`
    );
  }
}

// ===============================
// Small Square Marker
// ===============================

function createMarkerElement(
  bin,
  status
) {
  const tilted =
    isTilted(bin);

  const weight =
    tilted
      ? null
      : num(
          bin.weight_lb
        );

  const binId =
    safeBin(bin);

  let color =
    "#00c46a";

  if (
    status === "low"
  ) {
    color =
      "#ff453a";

  } else if (
    status === "average"
  ) {
    color =
      "#facc15";

  } else if (
    status === "tilted"
  ) {
    color =
      "#f97316";
  }

  const displayWeight =
    tilted
      ? "Tilted"
      : `${weight.toFixed(2)} lb`;

  const el =
    document.createElement(
      "div"
    );

  el.className =
    "hekone-pin";

  el.style.setProperty(
    "width",
    "100px",
    "important"
  );

  el.style.setProperty(
    "height",
    "72px",
    "important"
  );

  el.style.setProperty(
    "display",
    "block",
    "important"
  );

  el.style.setProperty(
    "position",
    "relative",
    "important"
  );

  el.style.setProperty(
    "pointer-events",
    "auto",
    "important"
  );

  el.style.setProperty(
    "overflow",
    "visible",
    "important"
  );

  el.style.setProperty(
    "max-width",
    "100px",
    "important"
  );

  el.style.setProperty(
    "min-width",
    "100px",
    "important"
  );

  el.innerHTML = `

    <div
      style="
        width: 13px !important;
        height: 13px !important;
        border-radius: 999px !important;
        background: ${color} !important;
        border: 2px solid #061018 !important;
        box-shadow:
          0 0 0 4px
          rgba(0,0,0,0.25)
          !important;
        margin:
          0 auto 5px auto
          !important;
        box-sizing:
          border-box
          !important;
      "
    >
    </div>

    <div
      style="
        width: 100px !important;
        height: 54px !important;
        max-width: 100px !important;
        min-width: 100px !important;

        background:
          rgba(10,15,22,0.96)
          !important;

        border:
          1px solid
          rgba(139,92,246,0.85)
          !important;

        border-radius:
          8px
          !important;

        padding:
          7px
          !important;

        box-shadow:
          0 8px 22px
          rgba(0,0,0,0.35)
          !important;

        display:
          flex
          !important;

        flex-direction:
          column
          !important;

        justify-content:
          center
          !important;

        align-items:
          center
          !important;

        text-align:
          center
          !important;

        overflow:
          hidden
          !important;

        box-sizing:
          border-box
          !important;
      "
    >

      <div
        style="
          color:
            #cbd5e1
            !important;

          font-size:
            13px
            !important;

          font-weight:
            800
            !important;

          line-height:
            1
            !important;

          margin-bottom:
            6px
            !important;

          white-space:
            nowrap
            !important;
        "
      >
        ${binId}
      </div>

      <div
        style="
          color:
            ${color}
            !important;

          font-size:
            16px
            !important;

          font-weight:
            900
            !important;

          line-height:
            1
            !important;

          white-space:
            nowrap
            !important;
        "
      >
        ${displayWeight}
      </div>

    </div>
  `;

  return el;
}

// ===============================
// Sidebar Stats
// ===============================

function renderStats(bin) {
  const tilted =
    isTilted(bin);

  const weight =
    tilted
      ? null
      : num(
          bin.weight_lb
        );

  const binId =
    safeBin(bin);

  setText(
    "totalBins",
    "1"
  );

  setText(
    "allBinsCount",
    "(1)"
  );

  if (tilted) {
    setText(
      "totalWeight",
      "Tilted"
    );

    setText(
      "farmAverage",
      "Tilted"
    );

    setText(
      "topPerformer",
      `${binId} Tilted`
    );

    setText(
      "needsAttention",
      "1 Bin"
    );

    setClass(
      "totalWeight",
      "tilted"
    );

    setClass(
      "farmAverage",
      "tilted"
    );

    setClass(
      "topPerformer",
      "tilted"
    );

  } else {
    setText(
      "totalWeight",
      weight.toFixed(2) +
        " lb"
    );

    setText(
      "farmAverage",
      weight.toFixed(2) +
        " lb"
    );

    setText(
      "topPerformer",
      `${binId} ${weight.toFixed(2)} lb`
    );

    setText(
      "needsAttention",
      weight > 0
        ? "0 Bins"
        : "1 Bin"
    );

    setClass(
      "totalWeight",
      ""
    );

    setClass(
      "farmAverage",
      ""
    );

    setClass(
      "topPerformer",
      "green"
    );
  }
}

// ===============================
// Sidebar Performance
// ===============================

function renderPerformanceList(
  bin
) {
  const list =
    document.getElementById(
      "binPerformanceList"
    );

  if (!list) {
    return;
  }

  const tilted =
    isTilted(bin);

  const weight =
    tilted
      ? null
      : num(
          bin.weight_lb
        );

  const status =
    getStatus(bin);

  const valueText =
    tilted
      ? "Tilted"
      : `${weight.toFixed(2)} lb`;

  list.innerHTML = `
    <div class="bin-row active">

      <div
        class="
          status-dot
          dot-${status}
        "
      >
      </div>

      <strong>
        ${safeBin(bin)}
      </strong>

      <span>
        Live
      </span>

      <b
        class="
          ${statusColorClass(
            status
          )}
        "
      >
        ${valueText}
      </b>

    </div>
  `;
}

// ===============================
// Waiting State
// ===============================

function showWaitingState(
  message
) {
  renderWaitingStats();

  setStatus(
    message
  );
}

function renderWaitingStats() {
  setText(
    "totalBins",
    "0"
  );

  setText(
    "allBinsCount",
    "(0)"
  );

  setText(
    "totalWeight",
    "0.00 lb"
  );

  setText(
    "farmAverage",
    "0.00 lb"
  );

  setText(
    "topPerformer",
    "—"
  );

  setText(
    "needsAttention",
    "0 Bins"
  );

  setText(
    "lastUpdateSmall",
    "● Waiting for GPS"
  );

  setText(
    "latitudeText",
    "—"
  );

  setText(
    "longitudeText",
    "—"
  );

  const list =
    document.getElementById(
      "binPerformanceList"
    );

  if (list) {
    list.innerHTML = "";
  }
}

// ===============================
// Last Updated
// ===============================

function updateLastUpdated(
  createdAt
) {
  const date =
    createdAt
      ? new Date(
          createdAt
        )
      : new Date();

  setText(
    "lastUpdated",
    date.toLocaleString(
      [],
      {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }
    )
  );

  setText(
    "lastUpdateSmall",
    "● Live now"
  );
}

// ===============================
// Display Name Mapping
// ===============================

function safeBin(row) {
  const deviceId =
    row.device_id || "";

  const binNames = {
    "HB000003": "Bin 01",

    // Future bins:
    // "HB000004": "Bin 02",
    // "HB000005": "Bin 03",
    // "HB000006": "Bin 04",
    // "HB000007": "Bin 05"
  };

  return (
    binNames[deviceId] ||
    deviceId ||
    "Bin"
  );
}

// ===============================
// Tilt Check
// ===============================

function isTilted(row) {
  return (
    row.weight_lb === null ||
    typeof row.weight_lb ===
      "undefined"
  );
}

// ===============================
// Number Helper
// ===============================

function num(value) {
  return Number(
    value || 0
  );
}

// ===============================
// GPS Validation
// ===============================

function isValidCoordinate(
  lat,
  lon
) {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return false;
  }

  if (
    lat === 0 &&
    lon === 0
  ) {
    return false;
  }

  if (
    lat < -90 ||
    lat > 90
  ) {
    return false;
  }

  if (
    lon < -180 ||
    lon > 180
  ) {
    return false;
  }

  return true;
}

// ===============================
// Weight Status
// ===============================

function getStatus(bin) {
  if (
    isTilted(bin)
  ) {
    return "tilted";
  }

  const weight =
    num(
      bin.weight_lb
    );

  if (
    weight <= 0
  ) {
    return "low";
  }

  if (
    weight < 1
  ) {
    return "average";
  }

  return "high";
}

// ===============================
// Status Color
// ===============================

function statusColorClass(
  status
) {
  if (
    status === "tilted"
  ) {
    return "tilted";
  }

  if (
    status === "low"
  ) {
    return "red";
  }

  if (
    status === "average"
  ) {
    return "yellow";
  }

  return "green";
}

// ===============================
// Set Text Helper
// ===============================

function setText(
  id,
  value
) {
  const el =
    document.getElementById(
      id
    );

  if (el) {
    el.innerText =
      value;
  }
}

// ===============================
// Set Class Helper
// ===============================

function setClass(
  id,
  className
) {
  const el =
    document.getElementById(
      id
    );

  if (!el) {
    return;
  }

  el.classList.remove(
    "green",
    "red",
    "yellow",
    "tilted"
  );

  if (className) {
    el.classList.add(
      className
    );
  }
}

// ===============================
// Map Status
// ===============================

function setStatus(
  message
) {
  const el =
    document.getElementById(
      "mapStatus"
    );

  if (el) {
    el.innerText =
      message;
  }
}
