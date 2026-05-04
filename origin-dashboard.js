async function loadData() {
  const { data, error } = await supabaseClient
    .from("origin_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error(error);
    return;
  }

  console.log("DATA:", data);

  // فقط آخرین رکورد هر BIN را نگه می‌داریم
  const latestByBin = {};

  data.forEach((row) => {
    if (!row.bin_id) return;

    if (!latestByBin[row.bin_id]) {
      latestByBin[row.bin_id] = row;
    }
  });

  const latestRows = Object.values(latestByBin);

  const totalWeight = latestRows.reduce((sum, row) => {
    return sum + Number(row.weight_lb || 0);
  }, 0);

  document.getElementById("totalWeight").innerText =
    totalWeight.toFixed(2) + " lb";
}

setInterval(loadData, 5000);
loadData();
