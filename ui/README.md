# OBD trip log

React + Vite + Chart.js frontend for OBD-II trip data.

    npm install
    npm run dev

Put your exports in public/data/ before starting:

    public/data/trips.json
    public/data/samples_1s.json
    public/data/samples_30s.json
    public/data/trip_start_data.json   (optional)

They load automatically. You can also pick the files with the "Load JSON files" button.

Layout:
- src/App.jsx       page layout, trip list grouped by day, stats, time window
- src/TripChart.jsx one Chart.js chart (shared hover line, time window)
- src/specs.js      which series go on which chart (add or edit charts here)
- src/data.js       JSON parsing and loading from public/data (swap for backend calls later)
