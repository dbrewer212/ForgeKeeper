using System;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using JotunnSystem.ViewModels;

namespace JotunnSystem.Views
{
    public partial class ShellView : UserControl
    {
        private ShellViewModel? _viewModel;

        public ShellView()
        {
            InitializeComponent();

            DataContext = App.Services.GetService(typeof(ViewModels.ShellViewModel));

            Loaded += ShellView_Loaded;
            Unloaded += ShellView_Unloaded;
            DataContextChanged += ShellView_DataContextChanged;
        }

        private void ShellView_Loaded(object sender, System.Windows.RoutedEventArgs e)
        {
            HookViewModel(DataContext as ShellViewModel);
        }

        private void ShellView_Unloaded(object sender, System.Windows.RoutedEventArgs e)
        {
            UnhookViewModel();
        }

        private void ShellView_DataContextChanged(object sender, System.Windows.DependencyPropertyChangedEventArgs e)
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
            Dispatcher.Invoke(() =>
            {
                if (CorePulseContainer == null)
                    return;

                if (CorePulseContainer.RenderTransform is not ScaleTransform transform)
                    return;

                transform.BeginAnimation(ScaleTransform.ScaleXProperty, null);
                transform.BeginAnimation(ScaleTransform.ScaleYProperty, null);

                transform.ScaleX = 1.0;
                transform.ScaleY = 1.0;

                var expandX = new DoubleAnimation
                {
                    From = 1.0,
                    To = 1.045,
                    Duration = TimeSpan.FromMilliseconds(120),
                    EasingFunction = new QuadraticEase()
                };

                var expandY = new DoubleAnimation
                {
                    From = 1.0,
                    To = 1.045,
                    Duration = TimeSpan.FromMilliseconds(120),
                    EasingFunction = new QuadraticEase()
                };

                var contractX = new DoubleAnimation
                {
                    From = 1.045,
                    To = 1.0,
                    BeginTime = TimeSpan.FromMilliseconds(120),
                    Duration = TimeSpan.FromMilliseconds(180),
                    EasingFunction = new QuadraticEase()
                };

                var contractY = new DoubleAnimation
                {
                    From = 1.045,
                    To = 1.0,
                    BeginTime = TimeSpan.FromMilliseconds(120),
                    Duration = TimeSpan.FromMilliseconds(180),
                    EasingFunction = new QuadraticEase()
                };

                transform.BeginAnimation(ScaleTransform.ScaleXProperty, expandX);
                transform.BeginAnimation(ScaleTransform.ScaleYProperty, expandY);
                transform.BeginAnimation(ScaleTransform.ScaleXProperty, contractX);
                transform.BeginAnimation(ScaleTransform.ScaleYProperty, contractY);
            });
        }
    }
}