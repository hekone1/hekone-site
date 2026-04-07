console.log("dashboard.js loaded");
console.log("supabase client:", supabase);

async function loadDashboardData() {
  const { data, error } = await supabase
    .from("traction_events")
    .select("*")
    .order("created_at", { ascending: false });

  console.log("data:", data);
  console.log("error:", error);

  if (error) return;

  document.getElementById("transactionsValue").textContent = data.length;

  let revenue = 0;
  let weightG = 0;
  let weightLb = 0;

  const tbody = document.getElementById("transactionsTableBody");
  tbody.innerHTML = "";

  data.forEach((item) => {
    revenue += Number(item.price || 0);
    weightG += Number(item.weight_g || 0);
    weightLb += Number(item.weight_lb || 0);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(item.created_at).toLocaleString()}</td>
      <td>${item.device_id ?? "-"}</td>
      <td>${Number(item.weight_g ?? 0).toFixed(2)}</td>
      <td>${Number(item.weight_lb ?? 0).toFixed(3)}</td>
      <td>${item.calories ?? 0}</td>
      <td>$${Number(item.price ?? 0).toFixed(2)}</td>
      <td>${item.mode ?? "-"}</td>
      <td>${item.transaction_id ?? "-"}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("revenueValue").textContent = `$${revenue.toFixed(2)}`;
  document.getElementById("weightGValue").textContent = weightG.toFixed(2);
  document.getElementById("weightLbValue").textContent = weightLb.toFixed(3);
}

loadDashboardData();
