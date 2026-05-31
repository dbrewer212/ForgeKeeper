using System;

namespace JotunnSystem.Models
{
    public sealed class AppConfig
    {
        public ArmoryConfig Armory { get; set; } = new();
        public SanctumConfig Sanctum { get; set; } = new();
        public ForgekeeperConfig Forgekeeper { get; set; } = new();
    }

    public sealed class ArmoryConfig
    {
        public ArmoryLaunchTargets LaunchTargets { get; set; } = new();
    }

    public sealed class SanctumConfig
    {
        public SanctumLaunchTargets LaunchTargets { get; set; } = new();
    }

    public sealed class ForgekeeperConfig
    {
        public bool Enabled { get; set; } = true;
        public string LaunchMode { get; set; } = "Command";
        public string LocalPath { get; set; } = @"C:\Dev\forgekeeper";
        public string GitHubUrl { get; set; } = "https://github.com/dbrewer212/ForgeKeeper";
        public string WorkingDirectory { get; set; } = @"C:\Dev\forgekeeper";
        public string Command { get; set; } = "npm run desktop";
    }

    public sealed class ArmoryLaunchTargets
    {
        public string Steam { get; set; } = string.Empty;
        public string Epic { get; set; } = string.Empty;
        public string GOG { get; set; } = string.Empty;
        public string BattleNet { get; set; } = string.Empty;
    }

    public sealed class SanctumLaunchTargets
    {
        public string CrunchyrollAppId { get; set; } = string.Empty;
        public string NetflixAppId { get; set; } = string.Empty;
        public string DisneyPlusAppId { get; set; } = string.Empty;
        public string PrimeVideoAppId { get; set; } = string.Empty;
        public string HiDiveUrl { get; set; } = string.Empty;
    }
}
