async function loadData() {
  const { data, error } = await supabaseClient
    .from("origin_events")
    .select("*")
    .eq("bin_id", "BIN-001")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error(error);
    return;
  }

  console.log("LATEST DATA:", data);

  const latest = data && data.length > 0 ? data[0] : null;
  const weight = latest ? Number(latest.weight_lb || 0) : 0;

  document.getElementById("totalWeight").innerText =
    weight.toFixed(2) + " lb";
}

setInterval(loadData, 3000);
loadData();
