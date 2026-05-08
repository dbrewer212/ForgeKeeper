using Microsoft.Extensions.DependencyInjection;
using System;
using System.IO;
using System.Windows;

namespace JotunnSystem
{
    public partial class App : Application
    {
        public static IServiceProvider Services { get; private set; } = null!;

        protected override void OnStartup(StartupEventArgs e)
        {
            string path = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
                "Jotunn_Startup_Error.txt");

            try
            {
                if (File.Exists(path))
                    File.Delete(path);

                var sc = new ServiceCollection();

                sc.AddSingleton<Services.HardwareMonitorService>();
                sc.AddSingleton<Services.ObsWebSocketService>();
                sc.AddSingleton<Services.HeimdallSpeechService>();
                sc.AddSingleton<Services.ModeEngineService>();

                sc.AddSingleton<ViewModels.ShellViewModel>();
                sc.AddSingleton<ViewModels.SystemMonitorViewModel>();
                sc.AddSingleton<ViewModels.ModeManagerViewModel>();

                Services = sc.BuildServiceProvider();

                DispatcherUnhandledException += (s, ex) =>
                {
                    File.WriteAllText(path, ex.Exception.ToString());
                    System.Windows.MessageBox.Show(
                        "Jotunn crashed.\n\nA log was written to:\n" + path,
                        "Jotunn Error",
                        MessageBoxButton.OK,
                        MessageBoxImage.Error);
                    ex.Handled = true;
                    Shutdown();
                };

                AppDomain.CurrentDomain.UnhandledException += (s, ex) =>
                {
                    File.WriteAllText(path, ex.ExceptionObject?.ToString() ?? "Unknown unhandled exception");
                };

                base.OnStartup(e);

                var window = new MainWindow();
                MainWindow = window;
                window.Show();
            }
            catch (Exception ex)
            {
                File.WriteAllText(path, ex.ToString());

                System.Windows.MessageBox.Show(
                    "Jotunn crashed during startup.\n\nA log was written to:\n" + path,
                    "Jotunn Startup Error",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);

                Shutdown();
            }
        }
    }
}