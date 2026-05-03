async function loadData() {
  const { data, error } = await supabaseClient
    .from('origin_events')
    .select('*')

  if (error) {
    console.error(error)
    return
  }

  console.log("DATA:", data)

  const totalWeight = data.reduce((sum, d) => sum + (d.weight_lb || 0), 0)

  document.getElementById("totalWeight").innerText =
    totalWeight.toFixed(2) + " lb"
}

setInterval(loadData, 5000)
loadData()
