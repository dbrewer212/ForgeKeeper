using System;
using System.Globalization;
using System.Windows.Data;
using JotunnSystem.Models;

namespace JotunnSystem
{
    public class ModeToNameConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is not OperationalMode mode)
                return "JOTUNN CORE";

            return mode switch
            {
                OperationalMode.Frost => "JOTUNN CORE",
                OperationalMode.Forge => "JOTUNN CORE",
                OperationalMode.Thunder => "PERFORMANCE WATCH",
                OperationalMode.Storm => "PRECISION WATCH",
                OperationalMode.Anvil => "SUSTAIN CHANNEL",
                _ => "JOTUNN CORE"
            };
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotSupportedException();
        }
    }
}