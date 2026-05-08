using LibreHardwareMonitor.Hardware;
using Microsoft.VisualBasic.Devices;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace JotunnSystem.Services
{
    public class HardwareMonitorService
    {
        private readonly LibreHardwareMonitor.Hardware.Computer _computer;
        private readonly ComputerInfo _computerInfo;

        public HardwareVitals CurrentVitals { get; private set; } = new HardwareVitals();

        public event EventHandler<HardwareVitals> VitalsUpdated = delegate { };

        public HardwareMonitorService()
        {
            _computer = new LibreHardwareMonitor.Hardware.Computer
            {
                IsCpuEnabled = true,
                IsGpuEnabled = true,
                IsMemoryEnabled = true,
                IsMotherboardEnabled = true,
                IsControllerEnabled = true,
                IsStorageEnabled = false,
                IsNetworkEnabled = false
            };

            _computer.Open();
            _computerInfo = new ComputerInfo();

            _ = PollLoopAsync();
        }

        private async Task PollLoopAsync()
        {
            while (true)
            {
                try
                {
                    var vitals = ReadVitals();
                    CurrentVitals = vitals;
                    VitalsUpdated(this, vitals);
                }
                catch
                {
                    // Keep polling alive even if one update fails.
                }

                await Task.Delay(1000);
            }
        }

        private HardwareVitals ReadVitals()
        {
            float cpuUsage = 0f;
            float cpuTemperature = 0f;
            float cpuClockSpeed = 0f;

            float gpuUsage = 0f;
            float gpuTemperature = 0f;
            float gpuClockSpeed = 0f;

            foreach (var hardware in _computer.Hardware)
            {
                hardware.Update();

                foreach (var subHardware in hardware.SubHardware)
                    subHardware.Update();

                switch (hardware.HardwareType)
                {
                    case HardwareType.Cpu:
                        ReadCpu(hardware, ref cpuUsage, ref cpuTemperature, ref cpuClockSpeed);
                        break;

                    case HardwareType.GpuNvidia:
                    case HardwareType.GpuAmd:
                    case HardwareType.GpuIntel:
                        ReadGpu(hardware, ref gpuUsage, ref gpuTemperature, ref gpuClockSpeed);
                        break;
                }
            }

            float ramUsagePercent = GetRamUsagePercent();

            return new HardwareVitals
            {
                CpuUsage = cpuUsage,
                CpuTemperature = cpuTemperature,
                CpuClockSpeed = cpuClockSpeed,
                GpuUsage = gpuUsage,
                GpuTemperature = gpuTemperature,
                GpuClockSpeed = gpuClockSpeed,
                RamUsagePercent = ramUsagePercent
            };
        }

        private void ReadCpu(IHardware hardware, ref float usage, ref float temperature, ref float clockSpeed)
        {
            foreach (var sensor in hardware.Sensors)
            {
                if (!sensor.Value.HasValue)
                    continue;

                if (sensor.SensorType == SensorType.Load &&
                    sensor.Name.Equals("CPU Total", StringComparison.OrdinalIgnoreCase))
                {
                    usage = sensor.Value.Value;
                }

                if (sensor.SensorType == SensorType.Temperature)
                {
                    if (sensor.Value.Value > temperature)
                        temperature = sensor.Value.Value;
                }
            }

            var cpuClockSensors = hardware.Sensors
                .Where(s => s.SensorType == SensorType.Clock &&
                            s.Value.HasValue &&
                            s.Name.IndexOf("Core", StringComparison.OrdinalIgnoreCase) >= 0)
                .Select(s => s.Value.Value)
                .ToList();

            if (cpuClockSensors.Count > 0)
                clockSpeed = cpuClockSensors.Average();
        }

        private void ReadGpu(IHardware hardware, ref float usage, ref float temperature, ref float clockSpeed)
        {
            foreach (var sensor in hardware.Sensors)
            {
                if (!sensor.Value.HasValue)
                    continue;

                if (sensor.SensorType == SensorType.Load)
                {
                    if (sensor.Name.IndexOf("GPU Core", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        sensor.Name.Equals("D3D 3D", StringComparison.OrdinalIgnoreCase) ||
                        sensor.Name.Equals("GPU", StringComparison.OrdinalIgnoreCase))
                    {
                        if (sensor.Value.Value > usage)
                            usage = sensor.Value.Value;
                    }
                }

                if (sensor.SensorType == SensorType.Temperature)
                {
                    if (sensor.Name.IndexOf("GPU Core", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        sensor.Name.IndexOf("Hot Spot", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        sensor.Name.IndexOf("Core", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        if (sensor.Value.Value > temperature)
                            temperature = sensor.Value.Value;
                    }
                }

                if (sensor.SensorType == SensorType.Clock)
                {
                    if (sensor.Name.IndexOf("GPU Core", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        sensor.Name.IndexOf("Core", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        if (sensor.Value.Value > clockSpeed)
                            clockSpeed = sensor.Value.Value;
                    }
                }
            }
        }

        private float GetRamUsagePercent()
        {
            try
            {
                ulong total = _computerInfo.TotalPhysicalMemory;
                ulong available = _computerInfo.AvailablePhysicalMemory;

                if (total == 0)
                    return 0f;

                double used = total - available;
                double percent = (used / total) * 100.0;

                return (float)percent;
            }
            catch
            {
                return 0f;
            }
        }
    }

    public class HardwareVitals
    {
        public float CpuUsage { get; set; }
        public float CpuTemperature { get; set; }
        public float CpuClockSpeed { get; set; }
        public float GpuUsage { get; set; }
        public float GpuTemperature { get; set; }
        public float GpuClockSpeed { get; set; }
        public float RamUsagePercent { get; set; }
    }
}