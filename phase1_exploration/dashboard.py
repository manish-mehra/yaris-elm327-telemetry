#!/home/pi/Development/yaris-elm327-telemetry/venv/bin/python
"""Car telemetry dashboard for a 480x320 Raspberry Pi screen.

Runs the OBD logger in a background thread (so only ONE process owns the
Bluetooth serial port) and shows live status in a fullscreen Tk window:
  - scanner connection status
  - speed / RPM / engine load
  - trip number and elapsed trip time

Needs db.py and logger.py in the same folder.
Usage:  python3 dashboard.py            (fullscreen, for the Pi)
        python3 dashboard.py --windowed (480x320 window, for testing)
"""
import argparse
import threading
import time
import tkinter as tk

import obd

import db
import phase1_logger  # reuses poll_tier(), read_trip_start(), tier definitions

# ---------- look & feel ----------
BG = "#0b0f14"
CARD = "#151b23"
TEXT = "#e6edf3"
MUTED = "#7d8590"
GREEN, AMBER, RED = "#3fb950", "#d29922", "#f85149"
FONT = "DejaVu Sans"

STATUS_TEXT = {
    "connecting": ("Connecting to scanner...", AMBER),
    "connected": ("Scanner connected", GREEN),
    "no_data": ("No data from car", RED),
}
MISS_LIMIT = 3  # consecutive empty 1s polls before showing "no data"


# ---------- state shared between logger thread and UI ----------
class Shared:
    def __init__(self):
        self._lock = threading.Lock()
        self._d = dict(status="connecting", trip_id=None, trip_start=None,
                       speed=None, rpm=None, load=None)

    def update(self, **kw):
        with self._lock:
            self._d.update(kw)

    def snapshot(self):
        with self._lock:
            return dict(self._d)


# ---------- logger thread ----------
def logger_worker(shared: Shared, stop: threading.Event):
    connection = None

    # Keep trying until the scanner answers (Pi often boots before the car is on)
    while not stop.is_set():
        shared.update(status="connecting")
        try:
            connection = obd.OBD(logger.PORT, baudrate=logger.BAUDRATE, fast=False)
            if connection.is_connected():
                break
            connection.close()
        except Exception:
            pass
        connection = None
        stop.wait(3)

    if connection is None:
        return

    conn = db.connect(logger.DB_PATH)  # sqlite connection must live in this thread
    trip_id = None
    try:
        trip_id = db.start_trip(conn, **logger.read_trip_start(connection))
        shared.update(status="connected", trip_id=trip_id, trip_start=time.time())

        misses = 0
        now = time.monotonic()
        next_1s = next_30s = now

        while not stop.is_set():
            now = time.monotonic()

            if now >= next_1s:
                vals = logger.poll_tier(connection, logger.TIER_1S)
                db.log_1s(conn, trip_id, **vals)
                shared.update(speed=vals["speed_kmh"], rpm=vals["rpm"],
                              load=vals["engine_load"])
                misses = misses + 1 if all(v is None for v in vals.values()) else 0
                shared.update(status="no_data" if misses >= MISS_LIMIT else "connected")
                next_1s += logger.INTERVAL_1S
                if next_1s < time.monotonic():
                    next_1s = time.monotonic() + logger.INTERVAL_1S

            if now >= next_30s:
                db.log_30s(conn, trip_id, **logger.poll_tier(connection, logger.TIER_30S))
                next_30s += logger.INTERVAL_30S
                if next_30s < time.monotonic():
                    next_30s = time.monotonic() + logger.INTERVAL_30S

            wait = min(next_1s, next_30s) - time.monotonic()
            if wait > 0:
                stop.wait(min(wait, logger.IDLE_SLEEP))
    finally:
        if trip_id is not None:
            db.end_trip(conn, trip_id)
        conn.close()
        connection.close()


# ---------- UI ----------
class Dashboard:
    def __init__(self, root: tk.Tk, shared: Shared, fullscreen: bool):
        self.root, self.shared = root, shared
        root.configure(bg=BG)
        root.geometry("480x320+0+0")
        if fullscreen:
            root.attributes("-fullscreen", True)
            root.config(cursor="none")
        root.resizable(False, False)

        # Top bar: status on the left, trip info on the right
        bar = tk.Frame(root, bg=BG)
        bar.place(x=0, y=0, width=480, height=48)

        self.dot = tk.Canvas(bar, width=16, height=16, bg=BG, highlightthickness=0)
        self.dot.place(x=14, y=16)
        self.dot_id = self.dot.create_oval(2, 2, 14, 14, fill=AMBER, outline="")
        self.status = tk.Label(bar, text="", bg=BG, fg=TEXT, font=(FONT, 12), anchor="w")
        self.status.place(x=36, y=12)

        self.trip = tk.Label(bar, text="Trip --", bg=BG, fg=TEXT,
                             font=(FONT, 12, "bold"), anchor="e")
        self.trip.place(x=300, y=4, width=170)
        self.elapsed = tk.Label(bar, text="--:--:--", bg=BG, fg=MUTED,
                                font=(FONT, 11), anchor="e")
        self.elapsed.place(x=300, y=24, width=170)

        # Three metric cards
        self.values = {}
        specs = [("speed", "SPEED", "km/h"), ("rpm", "RPM", "rpm"), ("load", "ENGINE LOAD", "%")]
        for i, (key, title, unit) in enumerate(specs):
            card = tk.Frame(root, bg=CARD)
            card.place(x=8 + i * 156, y=56, width=148, height=256)
            tk.Label(card, text=title, bg=CARD, fg=MUTED, font=(FONT, 10)).place(
                relx=0.5, y=18, anchor="n")
            val = tk.Label(card, text="--", bg=CARD, fg=TEXT, font=(FONT, 36, "bold"))
            val.place(relx=0.5, rely=0.5, anchor="center")
            tk.Label(card, text=unit, bg=CARD, fg=MUTED, font=(FONT, 11)).place(
                relx=0.5, rely=1.0, y=-18, anchor="s")
            self.values[key] = val

        root.bind("<Escape>", lambda e: root.event_generate("<<Quit>>"))
        self.refresh()

    @staticmethod
    def fmt(v):
        return "--" if v is None else f"{v:.0f}"

    def refresh(self):
        s = self.shared.snapshot()

        text, color = STATUS_TEXT[s["status"]]
        self.status.config(text=text)
        self.dot.itemconfig(self.dot_id, fill=color)

        if s["trip_id"] is None:
            self.trip.config(text="Trip --")
            self.elapsed.config(text="--:--:--")
        else:
            secs = int(time.time() - s["trip_start"])
            self.trip.config(text=f"Trip #{s['trip_id']}")
            self.elapsed.config(text=f"{secs // 3600}:{secs % 3600 // 60:02d}:{secs % 60:02d}")

        for key in ("speed", "rpm", "load"):
            self.values[key].config(text=self.fmt(s[key]))

        self.root.after(200, self.refresh)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--windowed", action="store_true", help="don't go fullscreen")
    args = ap.parse_args()

    shared, stop = Shared(), threading.Event()
    worker = threading.Thread(target=logger_worker, args=(shared, stop), daemon=True)
    worker.start()

    root = tk.Tk()
    Dashboard(root, shared, fullscreen=not args.windowed)

    def shutdown(*_):
        stop.set()
        worker.join(timeout=5)  # lets end_trip() run and the port close cleanly
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", shutdown)
    root.bind("<<Quit>>", shutdown)
    try:
        root.mainloop()
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    main()
