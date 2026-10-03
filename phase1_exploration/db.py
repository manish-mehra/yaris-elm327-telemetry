"""Phase 1 SQLite schema for the car telemetry logger.

Design: one `trips` row per trip; every data table points back to it via trip_id.
Timestamps are stored as UTC epoch milliseconds (INTEGER) - compact, sortable,
and easy to convert later when syncing to TimescaleDB.
"""
import json
import sqlite3
import time

SCHEMA = """
PRAGMA foreign_keys = ON;

-- One row per trip. ended_at IS NULL means the trip is still in progress
-- (or was never closed cleanly - handle that in a later phase).
CREATE TABLE IF NOT EXISTS trips (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  INTEGER NOT NULL,          -- epoch ms, UTC
    ended_at    INTEGER                    -- epoch ms, UTC, NULL until trip ends
);

-- Tier 1: captured once at trip start (exactly one row per trip).
CREATE TABLE IF NOT EXISTS trip_start_data (
    trip_id                 INTEGER PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
    vin                     TEXT,
    distance_since_dtc_clr  INTEGER,       -- km (PID 0x31)
    run_time_s              INTEGER,       -- engine run time at capture (PID 0x1F)
    mil_on                  INTEGER,       -- 0/1 (PID 0x01)
    dtc_count               INTEGER,
    stored_dtcs             TEXT           -- JSON list, e.g. '["P0420","P0171"]'
);

-- Tier 2: ~1 Hz live metrics.
CREATE TABLE IF NOT EXISTS samples_1s (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id         INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    ts              INTEGER NOT NULL,      -- epoch ms, UTC
    speed_kmh       REAL,
    rpm             REAL,
    engine_load     REAL,                  -- %
    throttle_pos    REAL,                  -- %
    coolant_temp_c  REAL,
    maf_gps         REAL,                  -- g/s
    intake_temp_c   REAL,
    short_fuel_trim REAL                   -- % (bank 1)
);
CREATE INDEX IF NOT EXISTS idx_samples_1s_trip_ts ON samples_1s(trip_id, ts);

-- Tier 3: ~every 30 s slower-moving context values.
CREATE TABLE IF NOT EXISTS samples_30s (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id           INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    ts                INTEGER NOT NULL,    -- epoch ms, UTC
    long_fuel_trim    REAL,                -- % (bank 1)
    module_voltage_v  REAL,
    ambient_temp_c    REAL,
    baro_pressure_kpa REAL,
    o2_post_cat_v     REAL,                -- bank 1 sensor 2
    catalyst_temp_c   REAL                 -- bank 1 sensor 1
);
CREATE INDEX IF NOT EXISTS idx_samples_30s_trip_ts ON samples_30s(trip_id, ts);
"""


def now_ms() -> int:
    return int(time.time() * 1000)


def connect(path: str = "telemetry.v1.db") -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")    # safer if power is cut mid-write
    conn.execute("PRAGMA synchronous = NORMAL;")  # good balance for 1 Hz writes
    conn.executescript(SCHEMA)
    return conn


def start_trip(conn: sqlite3.Connection, vin=None, distance_since_dtc_clr=None,
               run_time_s=None, mil_on=None, dtc_count=None, dtcs=None) -> int:
    """Create a trip + its tier-1 row. Returns trip_id.

    dtc_count comes from STATUS; only call GET_DTC (-> dtcs) if it is > 0.
    """
    dtcs = dtcs or []
    if dtc_count is None:
        dtc_count = len(dtcs)
    with conn:
        cur = conn.execute("INSERT INTO trips (started_at) VALUES (?)", (now_ms(),))
        trip_id = cur.lastrowid
        conn.execute(
            """INSERT INTO trip_start_data
               (trip_id, vin, distance_since_dtc_clr, run_time_s, mil_on, dtc_count, stored_dtcs)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (trip_id, vin, distance_since_dtc_clr, run_time_s,
             None if mil_on is None else int(mil_on), dtc_count, json.dumps(dtcs)),
        )
    return trip_id


def end_trip(conn: sqlite3.Connection, trip_id: int) -> None:
    with conn:
        conn.execute("UPDATE trips SET ended_at = ? WHERE id = ?", (now_ms(), trip_id))


def log_1s(conn, trip_id, **v) -> None:
    with conn:
        conn.execute(
            """INSERT INTO samples_1s
               (trip_id, ts, speed_kmh, rpm, engine_load, throttle_pos,
                coolant_temp_c, maf_gps, intake_temp_c, short_fuel_trim)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (trip_id, now_ms(), v.get("speed_kmh"), v.get("rpm"), v.get("engine_load"),
             v.get("throttle_pos"), v.get("coolant_temp_c"), v.get("maf_gps"),
             v.get("intake_temp_c"), v.get("short_fuel_trim")),
        )


def log_30s(conn, trip_id, **v) -> None:
    with conn:
        conn.execute(
            """INSERT INTO samples_30s
               (trip_id, ts, long_fuel_trim, module_voltage_v, ambient_temp_c,
                baro_pressure_kpa, o2_post_cat_v, catalyst_temp_c)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (trip_id, now_ms(), v.get("long_fuel_trim"), v.get("module_voltage_v"),
             v.get("ambient_temp_c"), v.get("baro_pressure_kpa"), v.get("o2_post_cat_v"),
             v.get("catalyst_temp_c")),
        )


if __name__ == "__main__":
    conn = connect(":memory:")
    tid = start_trip(conn, vin="TESTVIN123", mil_on=False)
    log_1s(conn, tid, speed_kmh=50, rpm=2100)
    log_30s(conn, tid, module_voltage_v=14.1)
    end_trip(conn, tid)
    print(dict(conn.execute("SELECT * FROM trips").fetchone()))