using System;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows;

namespace JotunnSystem
{
    public partial class MainWindow : Window
    {
        [DllImport("user32.dll")]
        private static extern bool SetWindowPos(
            IntPtr hWnd,
            IntPtr hWndInsertAfter,
            int X,
            int Y,
            int cx,
            int cy,
            uint uFlags);

        private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        private const uint SWP_SHOWWINDOW = 0x0040;

        public MainWindow()
        {
            InitializeComponent();
            Loaded += Window_Loaded;
        }

        private void Window_Loaded(object sender, RoutedEventArgs e)
        {
            var targetScreen = System.Windows.Forms.Screen.AllScreens.FirstOrDefault(s =>
                (s.Bounds.Width == 720 && s.Bounds.Height == 1920) ||
                (s.Bounds.Width == 1920 && s.Bounds.Height == 720) ||
                s.DeviceName.Contains("HYTE", StringComparison.OrdinalIgnoreCase) ||
                s.DeviceName.Contains("Touch", StringComparison.OrdinalIgnoreCase));

            targetScreen ??= System.Windows.Forms.Screen.AllScreens.Length > 1
                ? System.Windows.Forms.Screen.AllScreens[1]
                : System.Windows.Forms.Screen.PrimaryScreen;

            if (targetScreen == null)
                return;

            var bounds = targetScreen.Bounds;

            Left = bounds.Left;
            Top = bounds.Top;

            if (bounds.Width == 720 && bounds.Height == 1920)
            {
                Width = 720;
                Height = 1920;
            }
            else if (bounds.Width == 1920 && bounds.Height == 720)
            {
                Width = 720;
                Height = 1920;
            }
            else
            {
                Width = bounds.Width;
                Height = bounds.Height;
            }

            WindowState = WindowState.Normal;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            Topmost = true;

            var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;

            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                (int)Left,
                (int)Top,
                (int)Width,
                (int)Height,
                SWP_SHOWWINDOW);
        }
    }
}