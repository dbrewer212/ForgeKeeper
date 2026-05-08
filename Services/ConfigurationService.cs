using System;
using System.IO;
using System.Text.Json;
using JotunnSystem.Models;

namespace JotunnSystem.Services
{
    public interface IConfigurationService
    {
        AppConfig Current { get; }
        bool Reload(out string? errorMessage);
    }

    public sealed class ConfigurationService : IConfigurationService
    {
        private readonly string _configPath;
        private readonly JsonSerializerOptions _jsonOptions;

        public AppConfig Current { get; private set; } = new();

        public ConfigurationService(string? configPath = null)
        {
            _configPath = configPath ?? Path.Combine(AppContext.BaseDirectory, "Config", "appsettings.json");
            _jsonOptions = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                ReadCommentHandling = JsonCommentHandling.Skip,
                AllowTrailingCommas = true
            };

            Reload(out _);
        }

        public bool Reload(out string? errorMessage)
        {
            try
            {
                if (!File.Exists(_configPath))
                {
                    errorMessage = $"Config file not found: {_configPath}";
                    Current = new AppConfig();
                    return false;
                }

                string json = File.ReadAllText(_configPath);
                AppConfig? config = JsonSerializer.Deserialize<AppConfig>(json, _jsonOptions);

                if (config is null)
                {
                    errorMessage = "Config file was empty or invalid.";
                    Current = new AppConfig();
                    return false;
                }

                Current = config;
                errorMessage = null;
                return true;
            }
            catch (Exception ex)
            {
                Current = new AppConfig();
                errorMessage = $"Failed to load config: {ex.Message}";
                return false;
            }
        }
    }
}