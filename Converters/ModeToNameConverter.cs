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
                return "BELLION";

            return mode switch
            {
                OperationalMode.Frost => "BELLION",
                OperationalMode.Forge => "KAISEL",
                OperationalMode.Thunder => "BERU",
                OperationalMode.Storm => "IGRIS",
                OperationalMode.Anvil => "TUSK",
                _ => "BELLION"
            };
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotSupportedException();
        }
    }
}