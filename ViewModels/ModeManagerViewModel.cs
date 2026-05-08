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
        [ObservableProperty] private string _modeDescription = "Primary shadow authority active.";
        public ObservableCollection<ModeItem> AvailableModes { get; } = new();

        public ModeManagerViewModel(ModeEngineService modeService, HeimdallSpeechService heimdallService)
        {
            _modeService = modeService;
            _heimdallService = heimdallService;

            CurrentMode = _modeService.CurrentMode;

            AvailableModes.Add(new ModeItem { Mode = OperationalMode.Frost, Name = "Bellion", IsActive = CurrentMode == OperationalMode.Frost });
            AvailableModes.Add(new ModeItem { Mode = OperationalMode.Forge, Name = "Kaisel", IsActive = CurrentMode == OperationalMode.Forge });
            AvailableModes.Add(new ModeItem { Mode = OperationalMode.Thunder, Name = "Beru", IsActive = CurrentMode == OperationalMode.Thunder });
            AvailableModes.Add(new ModeItem { Mode = OperationalMode.Storm, Name = "Igris", IsActive = CurrentMode == OperationalMode.Storm });
            AvailableModes.Add(new ModeItem { Mode = OperationalMode.Anvil, Name = "Tusk", IsActive = CurrentMode == OperationalMode.Anvil });

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
                OperationalMode.Frost => "Primary shadow authority active.",
                OperationalMode.Forge => "Aerial shadow authority active.",
                OperationalMode.Thunder => "Swarm shadow authority active.",
                OperationalMode.Storm => "Blade shadow authority active.",
                OperationalMode.Anvil => "Arcane shadow authority active.",
                _ => "Shadow authority stable."
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