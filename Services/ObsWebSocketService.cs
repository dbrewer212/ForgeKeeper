using OBSWebsocketDotNet;

namespace JotunnSystem.Services
{
    public class ObsWebSocketService
    {
        private readonly OBSWebsocket _obs = new();
        public bool IsConnected => _obs.IsConnected;
        public void Connect(string url = "ws://localhost:4455", string password = "") { try { _obs.ConnectAsync(url, password); } catch { } }
        public void SetScene(string sceneName) { if (IsConnected) _obs.SetCurrentProgramScene(sceneName); }
    }
}
