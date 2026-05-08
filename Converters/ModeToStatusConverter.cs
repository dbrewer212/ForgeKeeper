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
                return "SHADOW AUTHORITY: STABLE";

            return mode switch
            {
                OperationalMode.Frost => "PRIMARY SHADOW: BELLION ACTIVE",
                OperationalMode.Forge => "AERIAL SHADOW: KAISEL ACTIVE",
                OperationalMode.Thunder => "SWARM SHADOW: BERU ACTIVE",
                OperationalMode.Storm => "BLADE SHADOW: IGRIS ACTIVE",
                OperationalMode.Anvil => "ARCANE SHADOW: TUSK ACTIVE",
                _ => "SHADOW AUTHORITY: STABLE"
            };
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotSupportedException();
        }
    }
}