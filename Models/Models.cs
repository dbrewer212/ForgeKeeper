namespace JotunnSystem.Models
{
    public enum OperationalMode { Frost, Forge, Storm, Thunder, Anvil }

    public static class ModeExtensions
    {
        public static string GetDisplayName(this OperationalMode mode) => mode switch
        {
            OperationalMode.Frost => "FROST",
            OperationalMode.Forge => "FORGE",
            OperationalMode.Storm => "STORM",
            OperationalMode.Thunder => "THUNDER",
            OperationalMode.Anvil => "ANVIL",
            _ => "UNKNOWN"
        };

        public static string GetDescription(this OperationalMode mode) => mode switch
        {
            OperationalMode.Frost => "System nominal. Standard operation.",
            OperationalMode.Forge => "High intensity processing active.",
            OperationalMode.Storm => "Latency critical. Isolation engaged.",
            OperationalMode.Thunder => "Maximum throughput. Dual pipeline.",
            OperationalMode.Anvil => "Maintenance mode. Limited operations.",
            _ => "System state unknown."
        };
    }

    public record SystemVitals
    {
        public float CpuUsage { get; init; }
        public float CpuTemperature { get; init; }
        public float CpuClockSpeed { get; init; }
        public float GpuUsage { get; init; }
        public float GpuTemperature { get; init; }
        public float GpuClockSpeed { get; init; }
        public float RamUsagePercent { get; init; }
        public static SystemVitals Empty => new();
    }

    public record HeimdallMessage
    {
        public string Text { get; init; } = string.Empty;
        public bool Speak { get; init; } = true;
        public static HeimdallMessage Info(string text, bool speak = false) => new() { Text = text, Speak = speak };
    }
}
