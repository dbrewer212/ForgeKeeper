using CommunityToolkit.Mvvm.ComponentModel;
using JotunnSystem.Services;

namespace JotunnSystem.ViewModels
{
    public partial class SystemMonitorViewModel : ObservableObject
    {
        [ObservableProperty] private float _cpuUsage;
        [ObservableProperty] private float _cpuTemperature;
        [ObservableProperty] private float _cpuClockSpeed;
        [ObservableProperty] private float _gpuUsage;
        [ObservableProperty] private float _gpuTemperature;
        [ObservableProperty] private float _gpuClockSpeed;
        [ObservableProperty] private float _ramUsagePercent;

        public string CpuUsageText => $"{CpuUsage:F0}%";
        public string CpuTempText => $"{CpuTemperature:F0}C";
        public string GpuUsageText => $"{GpuUsage:F0}%";
        public string GpuTempText => $"{GpuTemperature:F0}C";

        public SystemMonitorViewModel(HardwareMonitorService svc)
        {
            svc.VitalsUpdated += (s, v) =>
            {
                CpuUsage = v.CpuUsage;
                CpuTemperature = v.CpuTemperature;
                CpuClockSpeed = v.CpuClockSpeed;
                GpuUsage = v.GpuUsage;
                GpuTemperature = v.GpuTemperature;
                GpuClockSpeed = v.GpuClockSpeed;
                RamUsagePercent = v.RamUsagePercent;
            };
        }

        partial void OnCpuUsageChanged(float value) => OnPropertyChanged(nameof(CpuUsageText));
        partial void OnCpuTemperatureChanged(float value) => OnPropertyChanged(nameof(CpuTempText));
        partial void OnGpuUsageChanged(float value) => OnPropertyChanged(nameof(GpuUsageText));
        partial void OnGpuTemperatureChanged(float value) => OnPropertyChanged(nameof(GpuTempText));
    }
}
