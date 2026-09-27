import time
import sys
import obd

PORT = "/dev/rfcomm0"
BAUDRATE = "38400"
OUTPUT_FILE = "ecu_memory_inspection.txt"

def inspect_and_save():
    print("=" * 60)
    print("        READING & SAVING STORED ECU MEMORY DATA          ")
    print("=" * 60)
    
    connection = obd.OBD(PORT, baudrate=BAUDRATE, fast=False)
    if not connection.is_connected():
        print("[!] Failed to connect to ECU. Ensure key is in ON/ACC position.")
        sys.exit(1)

    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    
    # Store all captured inspection lines
    report = []
    report.append("=" * 60)
    report.append(f" TOYOTA YARIS ECU DIAGNOSTIC MEMORY INSPECTION REPORT")
    report.append(f" Timestamp : {timestamp}")
    report.append(f" Protocol  : {connection.protocol_name()}")
    report.append("=" * 60 + "\n")

    # 1. Read Stored Error Codes (Mode 03)
    report.append("[*] STORED DIAGNOSTIC TROUBLE CODES (DTCs - Mode 03):")
    dtc_res = connection.query(obd.commands.GET_DTC)
    if not dtc_res.is_null() and dtc_res.value:
        report.append(f"  [!] Found {len(dtc_res.value)} Stored Code(s):")
        for code, desc in dtc_res.value:
            report.append(f"      - {code}: {desc}")
    else:
        report.append("  [+] No active error codes stored in ECU memory.")
    report.append("")

    # 2. Read Pending Codes (Mode 07)
    report.append("[*] PENDING DIAGNOSTIC TROUBLE CODES (Mode 07):")
    pending_res = connection.query(obd.commands.GET_CURRENT_DTC)
    if not pending_res.is_null() and pending_res.value:
        report.append(f"  [!] Found {len(pending_res.value)} Pending Code(s):")
        for code, desc in pending_res.value:
            report.append(f"      - {code}: {desc}")
    else:
        report.append("  [+] No pending codes found.")
    report.append("")

    # 3. Distance & System Counters
    report.append("[*] STORED MILEAGE & SYSTEM COUNTERS:")
    
    dist_res = connection.query(obd.commands.DISTANCE_SINCE_DTC_CLEAR)
    if not dist_res.is_null() and dist_res.value is not None:
        report.append(f"  -> Distance since codes cleared : {dist_res.value}")
    else:
        report.append("  -> Distance since codes cleared : N/A")

    warmup_res = connection.query(obd.commands.WARMUPS_SINCE_DTC_CLEAR)
    if not warmup_res.is_null() and warmup_res.value is not None:
        report.append(f"  -> Warm-up cycles since cleared  : {warmup_res.value}")
    else:
        report.append("  -> Warm-up cycles since cleared  : N/A")

    time_mil_res = connection.query(obd.commands.TIME_SINCE_DTC_CLEARED)
    if not time_mil_res.is_null() and time_mil_res.value is not None:
        report.append(f"  -> Time elapsed since ECU reset  : {time_mil_res.value}")
    else:
        report.append("  -> Time elapsed since ECU reset  : N/A")
    report.append("")

    # 4. Vehicle Metadata (VIN)
    report.append("[*] VEHICLE METADATA:")
    vin_res = connection.query(obd.commands.VIN)
    if not vin_res.is_null() and vin_res.value:
        report.append(f"  -> Vehicle VIN: {vin_res.value}")
    else:
        report.append("  -> VIN request not supported or protected.")
    report.append("")

    connection.close()

    # Print report to stdout terminal
    report_text = "\n".join(report)
    print(report_text)

    # Save report to separate output file
    with open(OUTPUT_FILE, "a") as f:
        f.write(report_text + "\n\n")

    print("=" * 60)
    print(f"[+] Inspection complete! Saved results to '{OUTPUT_FILE}'.")
    print("=" * 60)

if __name__ == "__main__":
    inspect_and_save()
