using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using JotunnSystem.Models;
using JotunnSystem.Services;
using System;
using System.Threading.Tasks;
using System.Windows;

namespace JotunnSystem.ViewModels
{
    public partial class ShellViewModel : ObservableObject
    {
        private readonly ModeEngineService _modeService;
        private readonly HeimdallSpeechService _heimdallService;
        private readonly IConfigurationService _configurationService;
        private readonly ILaunchService _launchService;

        public event Action PulseRequested;

        [ObservableProperty] private string _currentTime = DateTime.Now.ToString("HH:mm:ss");
        [ObservableProperty] private string _currentDate = DateTime.Now.ToString("yyyy.MM.dd");
        [ObservableProperty] private string _systemUptime = "00:00:00";
        [ObservableProperty] private OperationalMode _currentMode = OperationalMode.Frost;
        [ObservableProperty] private string _heimdallStatus = "Shadow authority stable.";
        [ObservableProperty] private bool _isModeTransitioning;
        [ObservableProperty] private bool _isHeimdallSpeaking;
        [ObservableProperty] private float _modeIntensity = 0.35f;

        [ObservableProperty] private string _currentDomain = "Home";

        [ObservableProperty] private string _activeGamingPlatform = "Steam";
        [ObservableProperty] private string _gamingWingStatus = "Gaming wing online. Session staging ready.";
        [ObservableProperty] private string _gamingWingRecommendation = "Choose a launcher or prepare a game session posture.";
        [ObservableProperty] private ArmorySessionPrep _currentArmorySessionPrep = ArmorySessionPrep.Balanced;
        [ObservableProperty] private string _armoryShadowLead = "Bellion";

        [ObservableProperty] private string _activeMediaService = "Crunchyroll";
        [ObservableProperty] private string _mediaWingStatus = "Media wing online. Viewing posture stable.";
        [ObservableProperty] private string _mediaWingRecommendation = "Choose a service or apply a viewing posture.";
        [ObservableProperty] private SanctumViewingPosture _currentSanctumViewingPosture = SanctumViewingPosture.Balanced;
        [ObservableProperty] private string _sanctumShadowLead = "Bellion";

        [ObservableProperty] private string _forgeWingStatus = "Forge wing online. Fenrir Forge systems awaiting command.";
        [ObservableProperty] private string _forgeWingRecommendation = "Prepare a maker session, design flow, or long-run print posture.";

        public SystemMonitorViewModel SystemMonitor { get; }
        public ModeManagerViewModel ModeManager { get; }

        public ShellViewModel(
            HardwareMonitorService hardwareService,
            ModeEngineService modeService,
            HeimdallSpeechService heimdallService,
            ObsWebSocketService obsService)
        {
            _modeService = modeService;
            _heimdallService = heimdallService;
            _configurationService = new ConfigurationService();
            _launchService = new LaunchService();

            SystemMonitor = new SystemMonitorViewModel(hardwareService);
            ModeManager = new ModeManagerViewModel(modeService, heimdallService);

            CurrentMode = _modeService.CurrentMode;

            _modeService.ModeChanged += OnModeChanged;
            _modeService.EngineStatusChanged += OnEngineStatusChanged;
            _modeService.ModeIntensityChanged += HandleModeIntensityChanged;
            _heimdallService.MessageReceived += OnHeimdallMessageReceived;

            _ = UpdateTimeAsync();

            if (!_configurationService.Reload(out var configError))
            {
                HeimdallStatus = string.IsNullOrWhiteSpace(configError)
                    ? "Configuration unavailable."
                    : configError;
            }
            else
            {
                HeimdallStatus = "Arise. Shadow authority has been established.";
            }
        }

        [RelayCommand]
        private void Navigate(string target)
        {
            if (string.IsNullOrWhiteSpace(target))
                return;

            if (string.Equals(CurrentDomain, target, StringComparison.OrdinalIgnoreCase))
                return;

            CurrentDomain = target;

            HeimdallStatus = target switch
            {
                "Home" => "Ashborn: Returning to the throne room.",
                "Armory" => "Ashborn: Armory wing opened.",
                "Gaming" => "Ashborn: Armory wing opened.",
                "System" => "Ashborn: Battlestation systems exposed.",
                "Sanctum" => "Ashborn: Sanctum wing opened.",
                "Media" => "Ashborn: Sanctum wing opened.",
                _ => "Ashborn: Domain shift complete."
            };
        }

        [RelayCommand]
        private void ReturnHome()
        {
            Navigate("Home");
        }

        [RelayCommand]
        private void SelectGamingPlatform(string platform)
        {
            if (string.IsNullOrWhiteSpace(platform))
                return;

            ActiveGamingPlatform = platform;
            CurrentDomain = "Armory";

            GamingWingRecommendation = platform switch
            {
                "Steam" => "Best for broad session access and quick library launch.",
                "Epic" => "Best for exclusive library checks and active event titles.",
                "GOG" => "Best for standalone sessions and classic library pulls.",
                "Battle.net" => "Best for Blizzard session prep and live-service focus.",
                _ => "Platform selected."
            };

            if (TryLaunchGamingPlatform(platform, out var launchMessage))
            {
                GamingWingStatus = $"{platform} command path opened.";
            }
            else
            {
                GamingWingStatus = launchMessage;
            }

            HeimdallStatus = GamingWingStatus;
        }

        [RelayCommand]
        private void PrepareGamingSession(string profile)
        {
            if (string.IsNullOrWhiteSpace(profile))
                return;

            string status;
            string recommendation;
            string shadowLead;
            ArmorySessionPrep prep;

            switch (profile)
            {
                case "Balanced":
                    prep = ArmorySessionPrep.Balanced;
                    shadowLead = "Bellion";
                    status = "Bellion posture staged for balanced engagement.";
                    recommendation = "Use this for mixed play, stable thermals, and general readiness.";
                    break;

                case "Competitive":
                    prep = ArmorySessionPrep.Competitive;
                    shadowLead = "Igris";
                    status = "Igris posture staged for competitive response.";
                    recommendation = "Use this for focused response, precision play, and tighter session pressure.";
                    break;

                case "Performance":
                    prep = ArmorySessionPrep.Performance;
                    shadowLead = "Beru";
                    status = "Beru posture staged for performance pressure.";
                    recommendation = "Use this for heavier titles, aggressive load, and maximum system demand.";
                    break;

                case "LongSession":
                    prep = ArmorySessionPrep.LongSession;
                    shadowLead = "Tusk";
                    status = "Tusk posture staged for long-session sustain.";
                    recommendation = "Use this for extended play where sustained control matters more than peak aggression.";
                    break;

                default:
                    return;
            }

            CurrentDomain = "Armory";
            CurrentArmorySessionPrep = prep;
            ArmoryShadowLead = shadowLead;
            GamingWingStatus = status;
            GamingWingRecommendation = recommendation;
            HeimdallStatus = status;
        }

        [RelayCommand]
        private void SelectMediaService(string service)
        {
            if (string.IsNullOrWhiteSpace(service))
                return;

            ActiveMediaService = service;
            CurrentDomain = "Sanctum";

            MediaWingRecommendation = service switch
            {
                "Crunchyroll" => "Anime-first session path selected.",
                "HIDIVE" => "Focused anime library selected.",
                "Disney+" => "Cinematic and franchise viewing path selected.",
                "Prime Video" => "Mixed library viewing path selected.",
                "Netflix" => "General streaming library selected.",
                _ => "Service selected."
            };

            if (TryLaunchMediaService(service, out var launchMessage))
            {
                MediaWingStatus = $"{service} viewing path aligned.";
            }
            else
            {
                MediaWingStatus = launchMessage;
            }

            HeimdallStatus = MediaWingStatus;
        }

        [RelayCommand]
        private void PrepareMediaSession(string profile)
        {
            if (string.IsNullOrWhiteSpace(profile))
                return;

            string status;
            string recommendation;
            string shadowLead;
            SanctumViewingPosture posture;

            switch (profile)
            {
                case "LowNoise":
                    posture = SanctumViewingPosture.LowNoise;
                    shadowLead = "Bellion";
                    status = "Bellion low-noise sanctum posture staged.";
                    recommendation = "Best for quieter system behavior and relaxed watch sessions.";
                    break;

                case "Balanced":
                    posture = SanctumViewingPosture.Balanced;
                    shadowLead = "Bellion";
                    status = "Bellion balanced sanctum posture staged.";
                    recommendation = "Best for normal playback, browser use, and general comfort.";
                    break;

                case "Immersion":
                    posture = SanctumViewingPosture.Immersion;
                    shadowLead = "Tusk";
                    status = "Tusk immersion posture staged.";
                    recommendation = "Best for long-form media sessions, anime marathons, and arcane ambience.";
                    break;

                default:
                    return;
            }

            CurrentDomain = "Sanctum";
            CurrentSanctumViewingPosture = posture;
            SanctumShadowLead = shadowLead;
            MediaWingStatus = status;
            MediaWingRecommendation = recommendation;
            HeimdallStatus = status;
        }

        [RelayCommand]
        private void PrepareForgeSession(string profile)
        {
            if (string.IsNullOrWhiteSpace(profile))
                return;

            string status;
            string recommendation;

            switch (profile)
            {
                case "SystemPrep":
                    status = "Forge systems staged under Bellion.";
                    recommendation = "Use this before general setup, printer checks, and workflow stabilization.";
                    break;

                case "Design":
                    status = "Design posture staged under Igris.";
                    recommendation = "Use this for focused modeling, slicing, and precision-heavy maker work.";
                    break;

                case "LongPrint":
                    status = "Long-print posture staged under Tusk.";
                    recommendation = "Use this for extended maker sessions and sustained printer oversight.";
                    break;

                default:
                    return;
            }

            ForgeWingStatus = status;
            ForgeWingRecommendation = recommendation;
            HeimdallStatus = status;
        }

        private bool TryLaunchGamingPlatform(string platform, out string message)
        {
            var targets = _configurationService.Current.Armory.LaunchTargets;

            return platform switch
            {
                "Steam" => _launchService.LaunchExecutable(targets.Steam, out message),
                "Epic" => _launchService.LaunchExecutable(targets.Epic, out message),
                "GOG" => _launchService.LaunchExecutable(targets.GOG, out message),
                "Battle.net" => _launchService.LaunchExecutable(targets.BattleNet, out message),
                _ => ReturnUnknownTarget($"Unknown gaming platform: {platform}", out message)
            };
        }

        private bool TryLaunchMediaService(string service, out string message)
        {
            var targets = _configurationService.Current.Sanctum.LaunchTargets;

            return service switch
            {
                "Crunchyroll" => _launchService.LaunchStoreApp(targets.CrunchyrollAppId, out message),
                "Netflix" => _launchService.LaunchStoreApp(targets.NetflixAppId, out message),
                "Disney+" => _launchService.LaunchStoreApp(targets.DisneyPlusAppId, out message),
                "Prime Video" => _launchService.LaunchStoreApp(targets.PrimeVideoAppId, out message),
                "HIDIVE" => _launchService.LaunchUrl(targets.HiDiveUrl, out message),
                _ => ReturnUnknownTarget($"Unknown media service: {service}", out message)
            };
        }

        private static bool ReturnUnknownTarget(string error, out string message)
        {
            message = error;
            return false;
        }

        private async void OnModeChanged(object sender, OperationalMode mode)
        {
            await Application.Current.Dispatcher.InvokeAsync(() =>
            {
                CurrentMode = mode;
                PulseRequested?.Invoke();
            });

            IsModeTransitioning = true;
            await Task.Delay(320);
            IsModeTransitioning = false;
        }

        private void OnEngineStatusChanged(string message)
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                HeimdallStatus = message;
            });
        }

        private void HandleModeIntensityChanged(float intensity)
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                ModeIntensity = intensity;
            });
        }

        private async void OnHeimdallMessageReceived(object sender, HeimdallMessage message)
        {
            await Application.Current.Dispatcher.InvokeAsync(() =>
            {
                HeimdallStatus = message.Text;
                IsHeimdallSpeaking = true;
            });

            await Task.Delay(message.Speak ? 900 : 450);

            await Application.Current.Dispatcher.InvokeAsync(() =>
            {
                IsHeimdallSpeaking = false;
            });
        }

        private async Task UpdateTimeAsync()
        {
            while (true)
            {
                await Task.Delay(1000);

                await Application.Current.Dispatcher.InvokeAsync(() =>
                {
                    CurrentTime = DateTime.Now.ToString("HH:mm:ss");
                    CurrentDate = DateTime.Now.ToString("yyyy.MM.dd");
                    SystemUptime = GetUptimeString();
                });
            }
        }

        private string GetUptimeString()
        {
            var uptime = DateTime.Now - System.Diagnostics.Process.GetCurrentProcess().StartTime;
            return $"{uptime.Hours:D2}:{uptime.Minutes:D2}:{uptime.Seconds:D2}";
        }
    }
}
