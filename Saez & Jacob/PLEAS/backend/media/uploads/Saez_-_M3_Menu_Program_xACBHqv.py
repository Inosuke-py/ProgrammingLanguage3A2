while True:
    print("\n===== Parallel Computing Performance Calculator =====")
    print("1 - Calculate FLOPS")
    print("2 - Calculate Speedup and Efficiency")
    print("3 - Calculate Overall Speedup using Amdahl's Law")
    print("4 - Exit")

    choice = input("Enter your choice: ")

    if choice == "1":
        print("\n--- FLOPS Calculation ---")

        sockets = int(input("Enter number of sockets: "))
        cores = int(input("Enter number of cores: "))
        clock_speed = float(input("Enter clock speed (GHz): "))
        flops_per_sec = float(input("Enter number of floating point operations per second: "))

        clock_speed_ghz = clock_speed * 1000000000

        single_precision_FLOPS = sockets * cores * clock_speed_ghz * flops_per_sec
        double_precision_FLOPS = single_precision_FLOPS / 2
        GFLOPS = single_precision_FLOPS / 1000000000

        print("\nResults:")
        print("Single Precision FLOPS = ", int(single_precision_FLOPS))
        print("Double Precision FLOPS =", int(double_precision_FLOPS))
        print(f"GFLOPS = {GFLOPS:.2f}")

    elif choice == "2":
        print("\n--- Speedup and Efficiency ---")

        time_single = float(input("Enter time using 1 processor: "))
        time_multiple = float(input("Enter time using multiple processors: "))
        processors = int(input("Enter number of processors: "))

        speedup = time_single / time_multiple
        efficiency = speedup / processors

        efficiency_percent = efficiency * 100
        idle_percent = 100 - efficiency_percent

        print("\nResults:")
        print(f"Speedup = {speedup:.2f}")
        print(f"Efficiency = {efficiency:.2f}")
        print(f"Efficiency of the processor is {efficiency_percent:.2f}% which is fully utilized, while {idle_percent:.2f}% is idle.")

    elif choice == "3":
        print("\nAmdahl's Law Options")
        print("1 - Single Program")
        print("2 - Multiple Programs")

        amdahl_choice = input("Choose option: ")

        if amdahl_choice == "1":
            print("\n--- Amdahl's Law (Single Program) ---")

            execution_time = float(input("Enter execution time (parallel portion): "))
            speedup = float(input("Enter speedup: "))

            speedup_amdahls = 1 / ((1 - execution_time) + (execution_time / speedup))

            print(f"\nOverall Speedup = {speedup_amdahls:.2f}")

        elif amdahl_choice == "2":
            print("\n--- Amdahl's Law (Multiple Programs) ---")

            programs = int(input("Enter number of programs to execute: "))
            total = 0

            for i in range(programs):
                print(f"\nProgram {i+1}")
                execution_time = float(input("Enter execution time fraction: "))
                speedup = float(input("Enter speedup: "))

                total += (execution_time / speedup)

            overall_speedup = 1 / total

            print(f"\nOverall System Speedup = {overall_speedup:.2f}")

        else:
            print("Invalid Amdahl option.")

    elif choice == "4":
        print("Program terminated.")
        break

    else:
        print("Invalid choice. Please try again.")