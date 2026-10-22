"""Phase 1 telemetry logger: polls OBD-II and writes tiered data to SQLite.

Tiers are scheduled by monotonic clock deadlines, not by loop counts:
  - trip start : once
  - 1s tier    : every 1 s
  - 30s tier   : every 30 s
"""
import signal
import sys
import time

import obd
from obd import OBDStatus

import db

PORT = "/dev/rfcomm0"
BAUDRATE = "38400"
DB_PATH = "telemetry.v1.db"

INTERVAL_1S = 1.0
INTERVAL_30S = 30.0
IDLE_SLEEP = 0.02  # max wait between deadline checks
MAXIMUM_CONNECTION_RETRY = 5

C = obd.commands

# column name in DB -> OBD command
TIER_1S = {
    "speed_kmh": C.SPEED,
    "rpm": C.RPM,
    "engine_load": C.ENGINE_LOAD,
    "throttle_pos": C.THROTTLE_POS,
    "coolant_temp_c": C.COOLANT_TEMP,
    "maf_gps": C.MAF,
    "intake_temp_c": C.INTAKE_TEMP,
    "short_fuel_trim": C.SHORT_FUEL_TRIM_1,
}

TIER_30S = {
    "long_fuel_trim": C.LONG_FUEL_TRIM_1,
    "module_voltage_v": C.CONTROL_MODULE_VOLTAGE,
    "ambient_temp_c": C.AMBIANT_AIR_TEMP,
    "baro_pressure_kpa": C.BAROMETRIC_PRESSURE,
    "o2_post_cat_v": C.O2_B1S2,
    "catalyst_temp_c": C.CATALYST_TEMP_B1S1,
}


def read_value(connection, cmd):
    """Query one command; return a float, or None if no/invalid response."""
    try:
        resp = connection.query(cmd)
        if resp.is_null():
            return None
        return float(resp.value.magnitude)
    except Exception:
        return None


def poll_tier(connection, tier):
    return {col: read_value(connection, cmd) for col, cmd in tier.items()}


def read_trip_start(connection):
    """Tier 1: one-off values captured at the start of the trip."""
    info = {"vin": None, "mil_on": None, "dtc_count": None, "dtcs": []}

    try:
        status = connection.query(C.STATUS)
        if not status.is_null():
            info["mil_on"] = bool(status.value.MIL)
            info["dtc_count"] = int(status.value.DTC_count)
    except Exception:
        pass

    # Only fetch the codes if STATUS says there are some
    if info["dtc_count"]:
        try:
            resp = connection.query(C.GET_DTC)
            if not resp.is_null():
                info["dtcs"] = [code for code, _desc in resp.value]
        except Exception:
            pass

    run_time = read_value(connection, C.RUN_TIME)
    dist = read_value(connection, C.DISTANCE_SINCE_DTC_CLEAR)
    info["run_time_s"] = None if run_time is None else int(run_time)
    info["distance_since_dtc_clr"] = None if dist is None else int(dist)

    # python-obd doesn't ship a VIN command in every version
    vin_cmd = getattr(C, "VIN", None)
    if vin_cmd is not None:
        try:
            resp = connection.query(vin_cmd)
            if not resp.is_null():
                v = resp.value
                info["vin"] = v.decode() if isinstance(v, (bytes, bytearray)) else str(v)
        except Exception:
            pass

    return info


def _raise_exit(signum, frame):
    # lets `finally` run on SIGTERM (e.g. systemd stop)
    raise SystemExit(0)

            
def main():
    print("starting program....") 
    signal.signal(signal.SIGTERM, _raise_exit)
    connection = obd.OBD(PORT, baudrate=BAUDRATE, fast=False)
    if not connection.is_connected():
        print("Connection Failed 🔴: Failed to establish connection with OBD.")
        sys.exit(1)

    conn = db.connect(DB_PATH)
    trip_id = db.start_trip(conn, **read_trip_start(connection))

    now = time.monotonic()
    next_1s = now
    next_30s = now  # first 30s-tier sample is taken immediately
    
    

    try:
        while True:
            now = time.monotonic()

            if now >= next_1s:
                db.log_1s(conn, trip_id, **poll_tier(connection, TIER_1S))
                next_1s += INTERVAL_1S
                if next_1s < time.monotonic():  # fell behind; don't burst-catch-up
                    next_1s = time.monotonic() + INTERVAL_1S

            if now >= next_30s:
                db.log_30s(conn, trip_id, **poll_tier(connection, TIER_30S))
                next_30s += INTERVAL_30S
                if next_30s < time.monotonic():
                    next_30s = time.monotonic() + INTERVAL_30S

            wait = min(next_1s, next_30s) - time.monotonic()
            if wait > 0:
                time.sleep(min(wait, IDLE_SLEEP))
    except KeyboardInterrupt:
        pass
    finally:
        db.end_trip(conn, trip_id)
        conn.close()
        connection.close()


if __name__ == "__main__":
    main()
