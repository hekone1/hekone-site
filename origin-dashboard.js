async function loadData() {
  const { data, error } = await supabaseClient
    .from('origin_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error(error);
    return;
  }

  console.log("DATA:", data);

  const latestByBin = {};

  data.forEach(row => {
    if (!latestByBin[row.bin_id]) {
      latestByBin[row.bin_id] = row;
    }
  });

  const latestRows = Object.values(latestByBin);

  const totalWeight = latestRows.reduce((sum, d) => {
    return sum + Number(d.weight_lb || 0);
  }, 0);

  document.getElementById("totalWeight").innerText =
    totalWeight.toFixed(2) + " lb";
}

setInterval(loadData, 5000);
loadData();
