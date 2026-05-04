function buildMinuteFillRateSeries(rows) {
  if (!rows || rows.length === 0) return [];

  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  const minuteBuckets = {};

  sorted.forEach((row) => {
    const d = new Date(row.created_at);

    d.setSeconds(0);
    d.setMilliseconds(0);

    const key = d.toISOString();

    if (!minuteBuckets[key]) {
      minuteBuckets[key] = [];
    }

    minuteBuckets[key].push(row);
  });

  const result = Object.keys(minuteBuckets)
    .sort()
    .slice(-30)
    .map((key) => {
      const bucket = minuteBuckets[key];

      const first = bucket[0];
      const last = bucket[bucket.length - 1];

      const firstWeight = num(first.weight_lb);
      const lastWeight = num(last.weight_lb);

      let lbPerMin = lastWeight - firstWeight;

      if (lbPerMin < 0) lbPerMin = 0;

      const d = new Date(key);

      return {
        label: d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),
        value: lbPerMin
      };
    });

  return result;
}
