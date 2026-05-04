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

  if (!data || data.length === 0) {
    console.log("No data found");
    return;
  }

  // Keep latest row per bin_id
  const latestByBin = {};

  data.forEach(row => {
    const binId = row.bin_id || "BIN-001";
    if (!latestByBin[binId]) {
      latestByBin[binId] = row;
    }
  });

  const bins = Object.values(latestByBin);

  const totalBins = bins.length;

  const totalWeight = bins.reduce(
    (sum, b) => sum + Number(b.weight_lb || 0),
    0
  );

  const totalValue = bins.reduce(
    (sum, b) => sum + Number(b.estimated_value || 0),
    0
  );

  const avgPerBin = totalBins > 0 ? totalWeight / totalBins : 0;

  const avgFillRate =
    totalBins > 0
      ? bins.reduce((sum, b) => sum + Number(b.fill_rate || 0), 0) / totalBins
      : 0;

  const top = bins.reduce((best, b) => {
    return !best || Number(b.weight_lb || 0) > Number(best.weight_lb || 0)
      ? b
      : best;
  }, null);

  const worst = bins.reduce((low, b) => {
    return !low || Number(b.weight_lb || 0) < Number(low.weight_lb || 0)
      ? b
      : low;
  }, null);

  setText("totalBins", totalBins);
  setText("activeBins", "Active: " + totalBins);

  setText("totalWeight", totalWeight.toFixed(2) + " lb");
  setText("estimatedValue", "$" + totalValue.toFixed(2));
  setText("avgPerBin", avgPerBin.toFixed(2) + " lb");
  setText("avgFillRate", avgFillRate.toFixed(2) + " lb/min");

  if (top) {
    setText(
      "topPerformer",
      `${top.bin_id || "BIN-001"} (${Number(top.weight_lb || 0).toFixed(2)} lb)`
    );
  }

  if (worst) {
    setText(
      "needsAttention",
      `${worst.bin_id || "BIN-001"} (${Number(worst.weight_lb || 0).toFixed(2)} lb)`
    );
  }

  // Bottom financial cards
  setText("estimatedRevenue", "$" + totalValue.toFixed(2));
  setText("netImpact", "$" + totalValue.toFixed(2));
  setText("recoverableProfit", "$0.00");
  setText("monthlyRecovery", "$0 / month");
  setText("seasonRecovery", "$0 / season");

  document.getElementById("lastUpdated") &&
    (document.getElementById("lastUpdated").innerText =
      "Updated: " + new Date().toLocaleTimeString());

  console.log("Raw Supabase data:", data);
  console.log("Grouped bins:", bins);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.innerText = value;
  } else {
    console.warn("Missing HTML id:", id);
  }
}

setInterval(loadData, 5000);
loadData();
