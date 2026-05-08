using System;
using System.Globalization;
using System.Windows.Data;
using JotunnSystem.Models;

namespace JotunnSystem
{
    public class ModeToGlyphConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is not OperationalMode mode)
                return "◎";

            return mode switch
            {
                OperationalMode.Frost => "◎",
                OperationalMode.Forge => "⟁",
                OperationalMode.Storm => "✖",
                OperationalMode.Thunder => "❋",
                OperationalMode.Anvil => "⬢",
                _ => "◎"
            };
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotSupportedException();
        }
    }
}
