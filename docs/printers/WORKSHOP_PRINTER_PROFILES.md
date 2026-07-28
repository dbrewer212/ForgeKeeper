# Fenrir Forgeworks Workshop Printer Profiles

Status: Implemented  
Profile revision: 1  
Research date: 2026-07-27

ForgeKeeper installs these three machines as the Fenrir Forgeworks workshop fleet. The records are ordinary, editable Printer Pool records after installation. A profile revision prevents a deliberately removed printer from reappearing on every launch; **Restore Workshop Profiles** can reinstall or refresh the researched defaults when requested.

## Profile Summary

| Printer | Build volume | Motion / enclosure | Thermal limits | Speed / acceleration | Color system | Foundry route |
|---|---:|---|---|---|---|---|
| Anycubic Kobra S1 Max Combo | 350 × 350 × 350 mm | Enclosed CoreXY; 65°C active chamber | 350°C nozzle; 120°C bed | 300 mm/s recommended; 600 mm/s max; 20,000 mm/s² max | ACE 2 Pro; 4 included, 16 max | Anycubic Slicer Next; Anycubic Cloud/LAN |
| ELEGOO Neptune 4 Max | 420 × 420 × 480 mm | Open Cartesian bed slinger | 300°C nozzle; 85°C bed | 250 mm/s normal; 500 mm/s max; 8,000 mm/s² max | Single material | OrcaSlicer; Moonraker/Fluidd |
| Anycubic Kobra 3 Combo | 250 × 250 × 260 mm | Open gantry bed slinger | 300°C nozzle; 110°C bed | 300 mm/s recommended; 600 mm/s max; 20,000 mm/s² max | ACE Pro; 4 included, 8 max | Anycubic Slicer Next; Anycubic Cloud/LAN |

## Data Semantics

- `watts` is an editable **costing estimate** used by Foundry cost calculations. It is intentionally separate from nameplate maximum power.
- `ratedPowerWatts` and `accessoryPowerWatts` record maximum electrical ratings or accessory heater ratings where the manufacturer publishes them.
- `connectionEndpoint` is blank until the actual printer IP, Fluidd URL, or approved service endpoint is configured.
- Connection types describe supported routing. They do not claim that live telemetry or remote control is already enabled in ForgeKeeper.
- Supported materials follow the printer manufacturer's stated compatibility. Multicolor-system restrictions remain in printer notes.
- Manufacturer speed and acceleration limits are capability ceilings, not guaranteed production settings for every model or material.

## Authoritative Sources

### Anycubic Kobra S1 Max Combo

- [Official product specifications](https://store.anycubic.com/products/kobra-s1-max-combo)
- [Official Kobra S1 Max FAQ](https://wiki.anycubic.com/en/fdm-3d-printer/kobra-s1-max/faq)
- [Official filament compatibility guide](https://wiki.anycubic.com/en/fdm-3d-printer/kobra-s1-max-combo/filament-compatibility-guide)

The official profile establishes the 350 mm cube volume, CoreXY enclosure, 65°C chamber, 350°C hotend, 120°C bed, 300/600 mm/s speed values, 20,000 mm/s² maximum acceleration, Kobra OS, LeviQ 3.0, supported nozzle sizes, ACE 2 Pro drying, and 4-to-16-color expansion. It also records that the first-generation ACE Pro is incompatible.

### ELEGOO Neptune 4 Max

- [Official product specifications](https://us.elegoo.com/products/neptune-4-max-fdm-3d-printer)
- [Official user manual V1.8](https://download.elegoo.com/06%20FDM%20Printer/02%20ELEGOO%20Neptune%20Series%20Files/Neptune%204%20Max/3.%20User%27s%20Guide/1.User%20Manual/NEPTUNE%204%20MAX%20User%20Manual-English-V1.8.pdf)

The official profile establishes the 420 × 420 × 480 mm volume, Klipper firmware, 250/500 mm/s speed values, 8,000 mm/s² maximum acceleration, 300°C hotend, 85°C bed, 121-point leveling, network interfaces, machine envelope, and supported materials. Moonraker/Fluidd is the Foundry integration route selected for this Klipper machine.

### Anycubic Kobra 3 Combo

- [Official product specifications](https://store.anycubic.com/products/kobra-3-combo)
- [Official user manual](https://wiki.anycubic.com/kobra-3-combo/anycubic_kobra_3_user_manual-en-v1.2-20240529.pdf)
- [Official Kobra 3 Series FAQ](https://wiki.anycubic.com/en/fdm-3d-printer/kobra-3-combo/faq)

The official profile establishes the 250 × 250 × 260 mm volume, 300/600 mm/s speed values, 20,000 mm/s² maximum acceleration, 300°C hotend, 110°C bed, Kobra OS, LeviQ 3.0, nozzle choices, direct drive, ACE Pro drying, and 4-to-8-color expansion.

## Known Operational Follow-Up

The profile data is ready for scheduling, costing, slicer selection, and future connection work. Live control still requires:

1. The Neptune 4 Max Moonraker/Fluidd endpoint.
2. An approved Anycubic LAN/cloud integration path for each Kobra.
3. Measured average print wattage for more accurate electricity costing.
4. Actual installed nozzle and maintenance state per machine.
