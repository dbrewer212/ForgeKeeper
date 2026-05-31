using System;
using System.Diagnostics;
using System.IO;
using JotunnSystem.Models;

namespace JotunnSystem.Services
{
    public enum ForgekeeperBridgeState
    {
        Offline,
        LocalReady,
        CommandReady,
        FallbackReady,
        OpenedLocal,
        OpenedCommand,
        OpenedFallback,
        Error
    }

    public sealed class ForgekeeperBridgeResult
    {
        public ForgekeeperBridgeState State { get; set; }
        public string Status { get; set; } = "OFFLINE";
        public string Detail { get; set; } = "Forgekeeper bridge has not been checked.";
        public DateTime CheckedAt { get; set; } = DateTime.Now;
    }

    public sealed class ForgekeeperBridgeService
    {
        private readonly AppConfig _config;

        public ForgekeeperBridgeService(AppConfig config)
        {
            _config = config;
        }

        public ForgekeeperBridgeResult Check()
        {
            if (!_config.Forgekeeper.Enabled)
            {
                return new ForgekeeperBridgeResult
                {
                    State = ForgekeeperBridgeState.Offline,
                    Status = "DISABLED",
                    Detail = "Forgekeeper bridge is disabled in config."
                };
            }

            var mode = NormalizeMode(_config.Forgekeeper.LaunchMode);

            if (mode == "Command")
            {
                if (Directory.Exists(_config.Forgekeeper.WorkingDirectory) &&
                    !string.IsNullOrWhiteSpace(_config.Forgekeeper.Command))
                {
                    return new ForgekeeperBridgeResult
                    {
                        State = ForgekeeperBridgeState.CommandReady,
                        Status = "ONLINE",
                        Detail = $"Command bridge ready: {_config.Forgekeeper.Command}"
                    };
                }

                return FallbackOrOffline("Forgekeeper command bridge is missing a valid working directory or command.");
            }

            if (Directory.Exists(_config.Forgekeeper.LocalPath))
            {
                return new ForgekeeperBridgeResult
                {
                    State = ForgekeeperBridgeState.LocalReady,
                    Status = "ONLINE",
                    Detail = $"Local bridge ready: {_config.Forgekeeper.LocalPath}"
                };
            }

            return FallbackOrOffline("Local Forgekeeper path missing.");
        }

        public ForgekeeperBridgeResult Open()
        {
            try
            {
                if (!_config.Forgekeeper.Enabled)
                {
                    return new ForgekeeperBridgeResult
                    {
                        State = ForgekeeperBridgeState.Offline,
                        Status = "DISABLED",
                        Detail = "Forgekeeper bridge is disabled in config."
                    };
                }

                var mode = NormalizeMode(_config.Forgekeeper.LaunchMode);

                if (mode == "Command")
                {
                    if (Directory.Exists(_config.Forgekeeper.WorkingDirectory) &&
                        !string.IsNullOrWhiteSpace(_config.Forgekeeper.Command))
                    {
                        OpenCommand(_config.Forgekeeper.WorkingDirectory, _config.Forgekeeper.Command);

                        return new ForgekeeperBridgeResult
                        {
                            State = ForgekeeperBridgeState.OpenedCommand,
                            Status = "ONLINE",
                            Detail = $"Launching Forgekeeper app: {_config.Forgekeeper.Command}"
                        };
                    }

                    return OpenFallbackOrOffline("Forgekeeper command bridge is missing a valid working directory or command.");
                }

                if (Directory.Exists(_config.Forgekeeper.LocalPath))
                {
                    OpenTarget(_config.Forgekeeper.LocalPath);

                    return new ForgekeeperBridgeResult
                    {
                        State = ForgekeeperBridgeState.OpenedLocal,
                        Status = "ONLINE",
                        Detail = $"Opened local Forgekeeper bridge: {_config.Forgekeeper.LocalPath}"
                    };
                }

                return OpenFallbackOrOffline("Local Forgekeeper path missing.");
            }
            catch (Exception ex)
            {
                return new ForgekeeperBridgeResult
                {
                    State = ForgekeeperBridgeState.Error,
                    Status = "ERROR",
                    Detail = $"Forgekeeper bridge failed: {ex.Message}"
                };
            }
        }

        private ForgekeeperBridgeResult FallbackOrOffline(string reason)
        {
            if (!string.IsNullOrWhiteSpace(_config.Forgekeeper.GitHubUrl))
            {
                return new ForgekeeperBridgeResult
                {
                    State = ForgekeeperBridgeState.FallbackReady,
                    Status = "FALLBACK",
                    Detail = $"{reason} GitHub fallback is available."
                };
            }

            return new ForgekeeperBridgeResult
            {
                State = ForgekeeperBridgeState.Offline,
                Status = "OFFLINE",
                Detail = $"{reason} No fallback URL is configured."
            };
        }

        private ForgekeeperBridgeResult OpenFallbackOrOffline(string reason)
        {
            if (!string.IsNullOrWhiteSpace(_config.Forgekeeper.GitHubUrl))
            {
                OpenTarget(_config.Forgekeeper.GitHubUrl);

                return new ForgekeeperBridgeResult
                {
                    State = ForgekeeperBridgeState.OpenedFallback,
                    Status = "FALLBACK",
                    Detail = $"{reason} Opened Forgekeeper GitHub fallback."
                };
            }

            return new ForgekeeperBridgeResult
            {
                State = ForgekeeperBridgeState.Offline,
                Status = "OFFLINE",
                Detail = $"{reason} No Forgekeeper bridge target is available."
            };
        }

        private static string NormalizeMode(string? mode)
        {
            if (string.IsNullOrWhiteSpace(mode))
                return "Folder";

            return string.Equals(mode, "Command", StringComparison.OrdinalIgnoreCase)
                ? "Command"
                : "Folder";
        }

        private static void OpenTarget(string target)
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = target,
                UseShellExecute = true
            });
        }

        private static void OpenCommand(string workingDirectory, string command)
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/k \"cd /d \"{workingDirectory}\" && {command}\"",
                WorkingDirectory = workingDirectory,
                UseShellExecute = true,
                CreateNoWindow = false
            });
        }
    }
}
