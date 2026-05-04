function renderLocationMap(bins) {
  const iframe = document.getElementById("satelliteMap");
  const label = document.getElementById("mapBinLabel");

  if (!iframe || !bins || bins.length === 0) return;

  const bin = bins[0];

  const lat = Number(bin.latitude || 0);
  const lon = Number(bin.longitude || 0);

  if (!lat || !lon) {
    iframe.src = "";
    if (label) label.innerText = "(No GPS yet)";
    return;
  }

  if (label) label.innerText = `(${bin.bin_id})`;

  iframe.src =
    `https://maps.google.com/maps?q=${lat},${lon}&z=18&t=k&output=embed`;
}
