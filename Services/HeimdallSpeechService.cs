using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
using System.Threading.Tasks;
using JotunnSystem.Models;

namespace JotunnSystem.Services
{
    public class HeimdallSpeechService
    {
        private readonly SpeechSynthesizer _synth;
        private readonly Queue<HeimdallMessage> _queue = new();
        private bool _speaking = false;

        public event EventHandler<HeimdallMessage>? MessageReceived;

        public HeimdallSpeechService()
        {
            _synth = new SpeechSynthesizer();
            _synth.SetOutputToDefaultAudioDevice();
            _synth.Volume = 70;
            _synth.Rate = -2;

            foreach (var v in _synth.GetInstalledVoices())
            {
                if (v.VoiceInfo.Name.Contains("David"))
                {
                    _synth.SelectVoice(v.VoiceInfo.Name);
                    break;
                }
            }
        }

        public void EnqueueMessage(HeimdallMessage msg)
        {
            if (msg == null || string.IsNullOrWhiteSpace(msg.Text))
                return;

            _queue.Enqueue(msg);
            MessageReceived?.Invoke(this, msg);

            if (!_speaking && msg.Speak)
                _ = ProcessQueueAsync();
        }

        private async Task ProcessQueueAsync()
        {
            if (_speaking)
                return;

            _speaking = true;

            while (_queue.Count > 0)
            {
                var msg = _queue.Dequeue();

                if (msg.Speak)
                {
                    await Task.Run(() => _synth.Speak(msg.Text));
                    await Task.Delay(450);
                }
            }

            _speaking = false;
        }

        public string GetModeActivationLine(OperationalMode mode)
        {
            return mode switch
            {
                OperationalMode.Frost => "JOTUNN core command state engaged.",
                OperationalMode.Forge => "JOTUNN efficiency channel engaged.",
                OperationalMode.Thunder => "Performance watch engaged.",
                OperationalMode.Storm => "Precision watch engaged.",
                OperationalMode.Anvil => "Sustain channel engaged.",
                _ => "JOTUNN command core stable."
            };
        }

        public string GetModeStatusLine(OperationalMode mode)
        {
            return mode switch
            {
                OperationalMode.Frost => "JOTUNN core command state stable.",
                OperationalMode.Forge => "JOTUNN efficiency channel stable.",
                OperationalMode.Thunder => "Performance response stable.",
                OperationalMode.Storm => "Precision response stable.",
                OperationalMode.Anvil => "Sustain channel stable.",
                _ => "JOTUNN command core stable."
            };
        }
    }
}