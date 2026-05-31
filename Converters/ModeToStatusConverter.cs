using System;
using System.Globalization;
using System.Windows.Data;
using JotunnSystem.Models;

namespace JotunnSystem
{
    public class ModeToStatusConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is not OperationalMode mode)
                return "JOTUNN COMMAND CORE STABLE";

            return mode switch
            {
                OperationalMode.Frost => "COMMAND CORE ONLINE",
                OperationalMode.Forge => "EFFICIENCY CHANNEL ONLINE",
                OperationalMode.Thunder => "PERFORMANCE WATCH ONLINE",
                OperationalMode.Storm => "PRECISION WATCH ONLINE",
                OperationalMode.Anvil => "SUSTAIN CHANNEL ONLINE",
                _ => "JOTUNN COMMAND CORE STABLE"
            };
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotSupportedException();
        }
    }
}