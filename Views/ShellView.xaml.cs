using System.Windows;
using System.Windows.Controls;
using JotunnSystem.ViewModels;

namespace JotunnSystem.Views
{
    public partial class ShellView : UserControl
    {
        private ShellViewModel? _viewModel;

        public ShellView()
        {
            InitializeComponent();

            DataContext = App.Services.GetService(typeof(ShellViewModel));

            Loaded += ShellView_Loaded;
            Unloaded += ShellView_Unloaded;
            DataContextChanged += ShellView_DataContextChanged;
        }

        private void ShellView_Loaded(object sender, RoutedEventArgs e)
        {
            HookViewModel(DataContext as ShellViewModel);
        }

        private void ShellView_Unloaded(object sender, RoutedEventArgs e)
        {
            UnhookViewModel();
        }

        private void ShellView_DataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
        {
            UnhookViewModel();
            HookViewModel(e.NewValue as ShellViewModel);
        }

        private void HookViewModel(ShellViewModel? vm)
        {
            if (vm == null)
                return;

            _viewModel = vm;
            _viewModel.PulseRequested -= OnPulseRequested;
            _viewModel.PulseRequested += OnPulseRequested;
        }

        private void UnhookViewModel()
        {
            if (_viewModel == null)
                return;

            _viewModel.PulseRequested -= OnPulseRequested;
            _viewModel = null;
        }

        private void OnPulseRequested()
        {
            // The Fenrir full-overhaul ShellView no longer contains the old CorePulseContainer element.
            // Keep the event hook alive so mode changes do not crash, but do not animate a removed element.
        }
    }
}
