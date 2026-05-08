using System;
using System.Diagnostics;
using System.IO;

namespace JotunnSystem.Services
{
    public interface ILaunchService
    {
        bool LaunchExecutable(string path, out string message);
        bool LaunchStoreApp(string appId, out string message);
        bool LaunchUrl(string url, out string message);
    }

    public sealed class LaunchService : ILaunchService
    {
        public bool LaunchExecutable(string path, out string message)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(path))
                {
                    message = "Launch path is not configured.";
                    return false;
                }

                if (!File.Exists(path))
                {
                    message = $"Launch path not found: {path}";
                    return false;
                }

                Process.Start(new ProcessStartInfo
                {
                    FileName = path,
                    UseShellExecute = true
                });

                message = "Executable launched.";
                return true;
            }
            catch (Exception ex)
            {
                message = $"Failed to launch executable: {ex.Message}";
                return false;
            }
        }

        public bool LaunchStoreApp(string appId, out string message)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(appId))
                {
                    message = "Store app target is not configured.";
                    return false;
                }

                Process.Start(new ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = $"shell:AppsFolder\\{appId}",
                    UseShellExecute = true
                });

                message = "Store app launched.";
                return true;
            }
            catch (Exception ex)
            {
                message = $"Failed to launch Store app: {ex.Message}";
                return false;
            }
        }

        public bool LaunchUrl(string url, out string message)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(url))
                {
                    message = "URL is not configured.";
                    return false;
                }

                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });

                message = "URL launched.";
                return true;
            }
            catch (Exception ex)
            {
                message = $"Failed to launch URL: {ex.Message}";
                return false;
            }
        }
    }
}
