async function loadData() {
  const { data, error } = await supabaseClient
    .from("origin_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error(error);
    return;
  }

  if (!data || data.length === 0) return;

  const latest = data[0];

  // Total Weight
  document.getElementById("totalWeight").innerText =
    Number(latest.weight_lb || 0).toFixed(2) + " lb";

  // Fill Rate
  document.getElementById("fillRate").innerText =
    Number(latest.fill_rate || 0).toFixed(2) + " lb/min";

  // Estimated Value
  document.getElementById("estimatedValue").innerText =
    "$" + Number(latest.estimated_value || 0).toFixed(2);

  // Status
  document.getElementById("status").innerText =
    latest.status || "Live";
}

setInterval(loadData, 5000);
loadData();
