using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using JotunnSystem.Models;
using JotunnSystem.Services;
using System.Collections.ObjectModel;

namespace JotunnSystem.ViewModels
{
    public partial class ModeManagerViewModel : ObservableObject
    {
        private readonly ModeEngineService _modeService;
        private readonly HeimdallSpeechService _heimdallService;

        [ObservableProperty] private OperationalMode _currentMode;
        [ObservableProperty] private string _modeDescription = "Core command state active.";
        public ObservableCollection<ModeItem> AvailableModes { get; } = new();

        public ModeManagerViewModel(ModeEngineService modeService, HeimdallSpeechService heimdallService)
        {
            _modeService = modeService;
            _heimdallService = heimdallService;

            CurrentMode = _modeService.CurrentMode;

            AvailableModes.Add(new ModeItem { Mode = OperationalMode.Frost, Name = "JOTUNN CORE", IsActive = CurrentMode == OperationalMode.Frost });
            AvailableModes.Add(new ModeItem { Mode = OperationalMode.Forge, Name = "EFFICIENCY CORE", IsActive = CurrentMode == OperationalMode.Forge });
            AvailableModes.Add(new ModeItem { Mode = OperationalMode.Thunder, Name = "PERFORMANCE WATCH", IsActive = CurrentMode == OperationalMode.Thunder });
            AvailableModes.Add(new ModeItem { Mode = OperationalMode.Storm, Name = "PRECISION WATCH", IsActive = CurrentMode == OperationalMode.Storm });
            AvailableModes.Add(new ModeItem { Mode = OperationalMode.Anvil, Name = "SUSTAIN CHANNEL", IsActive = CurrentMode == OperationalMode.Anvil });

            ModeDescription = GetShadowDescription(CurrentMode);

            _modeService.ModeChanged += (s, mode) =>
            {
                CurrentMode = mode;
                ModeDescription = GetShadowDescription(mode);

                foreach (var i in AvailableModes)
                    i.IsActive = i.Mode == mode;

                _heimdallService.EnqueueMessage(
                    HeimdallMessage.Info(_heimdallService.GetModeActivationLine(mode), speak: true));
            };
        }

        private static string GetShadowDescription(OperationalMode mode)
        {
            return mode switch
            {
                OperationalMode.Frost => "Core command state active.",
                OperationalMode.Forge => "Efficiency channel active.",
                OperationalMode.Thunder => "Performance watch active.",
                OperationalMode.Storm => "Precision watch active.",
                OperationalMode.Anvil => "Sustain channel active.",
                _ => "JOTUNN command core stable."
            };
        }

        [RelayCommand]
        private void SetMode(OperationalMode mode)
        {
            if (mode != CurrentMode)
                _modeService.SetMode(mode);
        }
    }

    public partial class ModeItem : ObservableObject
    {
        [ObservableProperty] private OperationalMode _mode;
        [ObservableProperty] private string _name = string.Empty;
        [ObservableProperty] private bool _isActive;
    }
}