import time
import sys
import obd

PORT = "/dev/rfcomm0"
BAUDRATE = "38400"
LOG_FILE = "telemetry_log.txt"

def main():
    print("=" * 60)
    print("       YARIS ELM327 FILE LOGGER & LIVE TELEMETRY       ")
    print("=" * 60)
    print(f"[+] Output file: {LOG_FILE}")
    print("[+] Connecting to ECU...")

    connection = obd.OBD(PORT, baudrate=BAUDRATE, fast=False)

    if not connection.is_connected():
        print("[!] Failed to establish ECU handshake. Check ignition.")
        sys.exit(1)

    print(f"[+] Connected! Protocol: {connection.protocol_name()}\n")
    print("Press Ctrl+C to stop logging.\n")

    header_terminal = f"{'Time':<10} | {'RPM':<8} | {'Speed':<8} | {'Coolant (°C)':<13} | {'Voltage (V)':<10}"
    header_file = "Timestamp,RPM,Speed_kmh,Coolant_Temp_C,Voltage_V\n"
    divider = "-" * 60

    print(header_terminal)
    print(divider)

    # Pre-define PID commands
    cmd_rpm = obd.commands.RPM
    cmd_speed = obd.commands.SPEED
    cmd_coolant = obd.commands.COOLANT_TEMP
    cmd_voltage = obd.commands.ELM_VOLTAGE

    # Open the text file in append mode ('a')
    with open(LOG_FILE, "a") as f:
        # Write CSV header if file is newly created / empty
        if f.tell() == 0:
            f.write(header_file)
            f.flush()

        try:
            while True:
                # Query PIDs
                r_rpm = connection.query(cmd_rpm)
                r_speed = connection.query(cmd_speed)
                r_coolant = connection.query(cmd_coolant)
                r_voltage = connection.query(cmd_voltage)

                # Safely extract magnitude values
                rpm_val = r_rpm.value.magnitude if not r_rpm.is_null() else 0.0
                speed_val = r_speed.value.magnitude if not r_speed.is_null() else 0.0
                coolant_val = r_coolant.value.magnitude if not r_coolant.is_null() else 0.0
                voltage_val = r_voltage.value.magnitude if not r_voltage.is_null() else 0.0

                timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                short_time = time.strftime("%H:%M:%S")

                # Format terminal line
                term_line = f"{short_time:<10} | {rpm_val:<8.0f} | {speed_val:<8.0f} | {coolant_val:<13.1f} | {voltage_val:<10.1f}"
                print(term_line)

                # Format text file line (CSV structure)
                file_line = f"{timestamp},{rpm_val:.0f},{speed_val:.0f},{coolant_val:.1f},{voltage_val:.1f}\n"
                f.write(file_line)
                
                # Flush to disk immediately so no data is lost on unexpected shutdowns
                f.flush()

                time.sleep(0.5)

        except KeyboardInterrupt:
            print("\n" + divider)
            print("[+] Logging stopped by user.")
        finally:
            connection.close()
            print("[+] Serial port closed cleanly.")

if __name__ == "__main__":
    main()
