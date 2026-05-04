async function loadData() {
  const { data, error } = await supabaseClient
    .from("origin_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Supabase error:", error);
    return;
  }

  if (!data || data.length === 0) return;

  // -------- GROUP BY BIN --------
  const bins = {};

  data.forEach(row => {
    const binId = row.bin_id;

    if (!bins[binId]) {
      bins[binId] = row; // فقط آخرین رکورد
    }
  });

  const binList = Object.values(bins);

  // -------- TOTALS --------
  const totalBins = binList.length;
  const totalWeight = binList.reduce((sum, b) => sum + (b.weight_lb || 0), 0);
  const totalValue = binList.reduce((sum, b) => sum + (b.estimated_value || 0), 0);
  const avgWeight = totalBins ? totalWeight / totalBins : 0;
  const avgFillRate = totalBins
    ? binList.reduce((sum, b) => sum + (b.fill_rate || 0), 0) / totalBins
    : 0;

  // -------- TOP / WORST --------
  let top = null;
  let worst = null;

  binList.forEach(b => {
    if (!top || b.weight_lb > top.weight_lb) top = b;
    if (!worst || b.weight_lb < worst.weight_lb) worst = b;
  });

  // -------- UPDATE UI --------
  setText("totalBins", totalBins);
  setText("totalWeight", totalWeight.toFixed(2) + " lb");
  setText("estimatedValue", "$" + totalValue.toFixed(2));
  setText("avgPerBin", avgWeight.toFixed(2) + " lb");
  setText("avgFillRate", avgFillRate.toFixed(2) + " lb/min");

  if (top) {
    setText("topPerformer", `${top.bin_id} (${top.weight_lb.toFixed(2)} lb)`);
  }

  if (worst) {
    setText("needsAttention", `${worst.bin_id} (${worst.weight_lb.toFixed(2)} lb)`);
  }

  // -------- DEBUG --------
  console.log("Bins:", binList);
}

// helper
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

setInterval(loadData, 5000);
loadData();
