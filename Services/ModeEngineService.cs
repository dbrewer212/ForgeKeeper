using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using JotunnSystem.Models;

namespace JotunnSystem.Services
{
    public class ModeEngineService
    {
        private readonly HardwareMonitorService _hardware;
        private CancellationTokenSource _cts;

        private OperationalMode _current = OperationalMode.Frost;
        private float _modeIntensity = 0.35f;

        public OperationalMode CurrentMode
        {
            get => _current;
            private set
            {
                if (_current != value)
                {
                    _current = value;
                    ApplyModeBehavior(value);
                    ModeChanged?.Invoke(this, value);
                }
            }
        }

        public float ModeIntensity
        {
            get => _modeIntensity;
            private set
            {
                var clamped = Math.Max(0f, Math.Min(1f, value));

                if (Math.Abs(_modeIntensity - clamped) > 0.01f)
                {
                    _modeIntensity = clamped;
                    ModeIntensityChanged?.Invoke(_modeIntensity);
                }
            }
        }

        public event EventHandler<OperationalMode> ModeChanged;
        public event Action<string> EngineStatusChanged;
        public event Action<float> ModeIntensityChanged;

        public ModeEngineService(HardwareMonitorService hardware)
        {
            _hardware = hardware;
        }

        public void SetMode(OperationalMode mode)
        {
            CurrentMode = mode;
        }

        public void CycleMode()
        {
            CurrentMode = CurrentMode switch
            {
                OperationalMode.Frost => OperationalMode.Forge,
                OperationalMode.Forge => OperationalMode.Storm,
                OperationalMode.Storm => OperationalMode.Thunder,
                OperationalMode.Thunder => OperationalMode.Anvil,
                _ => OperationalMode.Frost
            };
        }

        private void ApplyModeBehavior(OperationalMode mode)
        {
            CancelAdaptiveLoop();

            switch (mode)
            {
                case OperationalMode.Frost:
                    SetBalanced();
                    break;

                case OperationalMode.Forge:
                    SetEfficiency();
                    break;

                case OperationalMode.Thunder:
                    SetBeru();
                    break;

                case OperationalMode.Storm:
                    SetIgris();
                    break;

                case OperationalMode.Anvil:
                    SetTusk();
                    break;

                default:
                    SetBalanced();
                    break;
            }
        }

        private void SetBalanced()
        {
            RunPowerCfg("SCHEME_BALANCED");
            SetPriority(ProcessPriorityClass.Normal);
            ModeIntensity = 0.35f;
            UpdateStatus("Bellion: Primary shadow authority stable.");
        }

        private void SetEfficiency()
        {
            RunPowerCfg("SCHEME_MIN");
            SetPriority(ProcessPriorityClass.BelowNormal);
            ModeIntensity = 0.20f;
            UpdateStatus("Kaisel: Efficiency pattern active.");
        }

        private void SetBeru()
        {
            RunPowerCfg("SCHEME_MAX");
            SetPriority(ProcessPriorityClass.High);
            ModeIntensity = 0.75f;
            UpdateStatus("Beru: Aggression pattern active.");

            StartAdaptiveLoop(() =>
            {
                var v = _hardware.CurrentVitals;

                ModeIntensity = Clamp(v.CpuUsage / 100f, 0.45f, 1.0f);

                if (v.CpuUsage > 85f)
                    UpdateStatus("Beru: High load detected.");

                if (v.CpuTemperature > 80f)
                {
                    UpdateStatus("Beru: Thermal limit reached. Returning to Bellion.");
                    SetMode(OperationalMode.Frost);
                }
            });
        }

        private void SetIgris()
        {
            RunPowerCfg("SCHEME_MAX");
            SetPriority(ProcessPriorityClass.High);
            ModeIntensity = 0.70f;
            UpdateStatus("Igris: Combat pattern active.");

            StartAdaptiveLoop(() =>
            {
                var v = _hardware.CurrentVitals;
                var demand = Math.Max(v.CpuUsage, v.GpuUsage) / 100f;

                ModeIntensity = Clamp(demand, 0.40f, 1.0f);

                if (v.CpuUsage > 70f || v.GpuUsage > 70f)
                    UpdateStatus("Igris: Combat load rising.");

                if (v.CpuTemperature > 85f || v.GpuTemperature > 80f)
                {
                    UpdateStatus("Igris: Thermal threshold exceeded. Returning to Bellion.");
                    SetMode(OperationalMode.Frost);
                }
            });
        }

        private void SetTusk()
        {
            RunPowerCfg("SCHEME_MAX");
            SetPriority(ProcessPriorityClass.AboveNormal);
            ModeIntensity = 0.60f;
            UpdateStatus("Tusk: Arcane sustain active.");

            StartAdaptiveLoop(() =>
            {
                var v = _hardware.CurrentVitals;
                var sustain = ((v.CpuUsage + v.GpuUsage) / 2f) / 100f;

                ModeIntensity = Clamp(sustain, 0.35f, 0.90f);

                if (v.CpuTemperature > 78f || v.GpuTemperature > 74f)
                    UpdateStatus("Tusk: Sustained load under watch.");

                if (v.CpuTemperature > 82f || v.GpuTemperature > 78f)
                {
                    UpdateStatus("Tusk: Arcane sustain broken. Returning to Bellion.");
                    SetMode(OperationalMode.Frost);
                }
            });
        }

        private void StartAdaptiveLoop(Action check)
        {
            _cts = new CancellationTokenSource();
            var token = _cts.Token;

            _ = Task.Run(async () =>
            {
                while (!token.IsCancellationRequested)
                {
                    try
                    {
                        check();
                        await Task.Delay(1000, token);
                    }
                    catch (TaskCanceledException)
                    {
                        break;
                    }
                    catch
                    {
                    }
                }
            }, token);
        }

        private void CancelAdaptiveLoop()
        {
            try
            {
                if (_cts != null)
                {
                    _cts.Cancel();
                    _cts.Dispose();
                }
            }
            catch
            {
            }
            finally
            {
                _cts = null;
            }
        }

        private void SetPriority(ProcessPriorityClass level)
        {
            try
            {
                Process.GetCurrentProcess().PriorityClass = level;
            }
            catch
            {
                UpdateStatus("Ashborn: Unable to change process priority.");
            }
        }

        private void RunPowerCfg(string scheme)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "powercfg",
                    Arguments = "/setactive " + scheme,
                    CreateNoWindow = true,
                    UseShellExecute = false
                });
            }
            catch
            {
                UpdateStatus("Ashborn: Unable to change power profile.");
            }
        }

        private void UpdateStatus(string status)
        {
            if (!string.IsNullOrWhiteSpace(status))
                EngineStatusChanged?.Invoke(status);
        }

        private static float Clamp(float value, float min, float max)
        {
            if (value < min) return min;
            if (value > max) return max;
            return value;
        }
    }
}