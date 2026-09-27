import time
import sys
import obd

PORT = "/dev/rfcomm0"
BAUDRATE = "38400"
OUTPUT_FILE = "supported_metrics.txt"

def main():
    print("=" * 60)
    print("      OBD-II ECU SUPPORTED METRICS DISCOVERY TOOL      ")
    print("=" * 60)
    print(f"[*] Connecting to ECU via {PORT}...")

    # Fast=False ensures standard single-PID queries during ECU scan
    connection = obd.OBD(PORT, baudrate=BAUDRATE, fast=False)

    if not connection.is_connected():
        print("[!] Connection failed. Ensure key is in ON / ACC position.")
        sys.exit(1)

    print(f"[+] Connected via protocol: {connection.protocol_name()}")
    
    # connection.supported_commands contains the set of all commands supported by this car
    supported = connection.supported_commands
    print(f"[+] Total supported metrics found: {len(supported)}\n")

    print(f"{'Command Name':<28} | {'Description':<35}")
    print("-" * 65)

    with open(OUTPUT_FILE, "w") as f:
        f.write(f"Supported OBD-II Commands for protocol: {connection.protocol_name()}\n")
        f.write(f"Total commands: {len(supported)}\n")
        f.write("=" * 60 + "\n\n")

        # Sort commands by name for easy scanning
        for cmd in sorted(supported, key=lambda c: c.name):
            line_term = f"{cmd.name:<28} | {cmd.desc:<35}"
            print(line_term)
            f.write(f"{cmd.name} - {cmd.desc} (PID: {cmd.command})\n")

    print("-" * 65)
    print(f"\n[+] Full list saved to '{OUTPUT_FILE}'.")
    
    # Live Query Sample of Supported Metrics
    print("\n[*] Sampling live readings for all supported commands...\n")
    for cmd in sorted(supported, key=lambda c: c.name):
        try:
            res = connection.query(cmd)
            if not res.is_null() and res.value is not None:
                print(f" -> {cmd.name:<25}: {res.value}")
        except Exception:
            pass

    connection.close()

if __name__ == "__main__":
    main()
