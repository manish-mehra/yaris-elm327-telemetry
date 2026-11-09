// Reads the JSON files from public/data/. Missing files just come back empty.
const get = (name) =>
  fetch("/data/" + name + ".json").then((r) => r.json()).catch(() => []);

export async function loadDefault() {
  const [trips, samples_1s, samples_30s, trip_start_data] = await Promise.all(
    ["trips", "samples_1s", "samples_30s", "trip_start_data"].map(get)
  );
  return { trips, samples_1s, samples_30s, trip_start_data };
}