using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using JotunnSystem.Models;

namespace JotunnSystem
{
    public class BoolToActiveTagConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
            => value is bool b && b ? "Active" : "Inactive";

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class ModeToBrushConverter : IValueConverter
    {
        private static readonly Brush FallbackBrush =
            new SolidColorBrush((Color)ColorConverter.ConvertFromString("#9D7BFF"));

        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            try
            {
                if (value is not OperationalMode mode)
                    return FallbackBrush;

                return mode switch
                {
                    OperationalMode.Frost => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#9D7BFF")),
                    OperationalMode.Forge => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#9D7BFF")),
                    OperationalMode.Thunder => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#00D4FF")),
                    OperationalMode.Storm => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#C62828")),
                    OperationalMode.Anvil => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#6F7BFF")),
                    _ => FallbackBrush
                };
            }
            catch
            {
                return FallbackBrush;
            }
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class ModeToDisplayNameConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is not OperationalMode mode)
                return "JOTUNN";

            return mode switch
            {
                OperationalMode.Frost => "JOTUNN",
                OperationalMode.Forge => "JOTUNN",
                OperationalMode.Thunder => "Performance",
                OperationalMode.Storm => "Precision",
                OperationalMode.Anvil => "Sustain",
                _ => "JOTUNN"
            };
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class ModeEqualsConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is not OperationalMode current || parameter is null)
                return "Inactive";

            if (!Enum.TryParse(parameter.ToString(), true, out OperationalMode compare))
                return "Inactive";

            return current == compare ? "Active" : "Inactive";
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class IntensityToScaleConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is null)
                return 1.0;

            double intensity;

            try
            {
                intensity = System.Convert.ToDouble(value, CultureInfo.InvariantCulture);
            }
            catch
            {
                intensity = 0.35;
            }

            if (intensity < 0.0)
                intensity = 0.0;

            if (intensity > 1.0)
                intensity = 1.0;

            return 1.0 + (intensity * 0.08);
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class IntensityToOpacityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is null)
                return 0.55;

            double intensity;

            try
            {
                intensity = System.Convert.ToDouble(value, CultureInfo.InvariantCulture);
            }
            catch
            {
                intensity = 0.35;
            }

            if (intensity < 0.0)
                intensity = 0.0;

            if (intensity > 1.0)
                intensity = 1.0;

            return 0.35 + (intensity * 0.55);
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class IntensityToWaveScaleConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is null)
                return 1.0;

            double intensity;

            try
            {
                intensity = System.Convert.ToDouble(value, CultureInfo.InvariantCulture);
            }
            catch
            {
                intensity = 0.35;
            }

            if (intensity < 0.0)
                intensity = 0.0;

            if (intensity > 1.0)
                intensity = 1.0;

            return 0.88 + (intensity * 0.52);
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class IntensityToStrokeThicknessConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is null)
                return 2.2;

            double intensity;

            try
            {
                intensity = System.Convert.ToDouble(value, CultureInfo.InvariantCulture);
            }
            catch
            {
                intensity = 0.35;
            }

            if (intensity < 0.0)
                intensity = 0.0;

            if (intensity > 1.0)
                intensity = 1.0;

            return 1.8 + (intensity * 1.2);
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class ModeToAuthorityRoleConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is not OperationalMode mode)
                return "Core command online.";

            return mode switch
            {
                OperationalMode.Frost => "Core command state",
                OperationalMode.Forge => "Core command state",
                OperationalMode.Thunder => "Performance watch state",
                OperationalMode.Storm => "Precision watch state",
                OperationalMode.Anvil => "Sustain channel state",
                _ => "Core command online."
            };
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class ModeToAuthorityGlyphConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is not OperationalMode mode)
                return "◎";

            return mode switch
            {
                OperationalMode.Frost => "◎",
                OperationalMode.Forge => "◎",
                OperationalMode.Thunder => "❋",
                OperationalMode.Storm => "✖",
                OperationalMode.Anvil => "⬢",
                _ => "◎"
            };
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class BoolToAuthorityStateConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
            => value is bool b && b ? "Transitioning" : "Stable";

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class ValueEqualsToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            var left = value?.ToString() ?? string.Empty;
            var right = parameter?.ToString() ?? string.Empty;
            return string.Equals(left, right, StringComparison.OrdinalIgnoreCase)
                ? Visibility.Visible
                : Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }

    public class ValueEqualsToBooleanConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            var left = value?.ToString() ?? string.Empty;
            var right = parameter?.ToString() ?? string.Empty;
            return string.Equals(left, right, StringComparison.OrdinalIgnoreCase);
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotImplementedException();
    }
}