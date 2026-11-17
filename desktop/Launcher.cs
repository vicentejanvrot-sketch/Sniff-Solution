using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class Program
{
    internal static int Result = 0;
    internal static string Home;
    internal static readonly object LogSync = new object();
    internal static bool Smoke;
    internal static string SmokeMode;

    [STAThread]
    private static int Main(string[] args)
    {
        SmokeMode = args.FirstOrDefault(x => x == "--smoke-test-write" || x == "--smoke-test-read");
        Smoke = SmokeMode != null;
        Home = Smoke ? Environment.GetEnvironmentVariable("SNIFF_SMOKE_HOME") : null;
        if (String.IsNullOrWhiteSpace(Home))
            Home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SniffSolution");
        Home = Path.GetFullPath(Home);
        Directory.CreateDirectory(Home);
        bool created;
        using (var mutex = new Mutex(true, "SniffSolutionDesktop", out created))
        {
            if (!created)
            {
                int handled = Instances.HandleRunningCopy(mutex);
                if (handled != Instances.StartThisCopy) return handled;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try { using (var context = new DesktopContext()) Application.Run(context); }
            catch (Exception ex) { Log(ex.Message); if (!Smoke) MessageBox.Show(ex.Message, "Sniff Solution"); Result = 1; }
        }
        return Result;
    }

    internal static bool ValidUrl(string url)
    {
        Uri uri;
        return Uri.TryCreate(url, UriKind.Absolute, out uri)
            && uri.Scheme == "http" && uri.Host == "127.0.0.1"
            && uri.Port >= 1024 && uri.AbsolutePath == "/"
            && String.IsNullOrEmpty(uri.UserInfo) && String.IsNullOrEmpty(uri.Query)
            && String.IsNullOrEmpty(uri.Fragment);
    }
    internal static void OpenUrl(string url)
    {
        if (!ValidUrl(url)) throw new InvalidOperationException("Invalid local application address.");
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }
    internal static void Log(string message)
    {
        lock (LogSync)
        {
            try { File.AppendAllText(Path.Combine(Home, "desktop.log"), DateTime.UtcNow.ToString("O") + " " + message + Environment.NewLine); }
            catch (IOException) {}
        }
    }
    internal static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
}

// Handles a second launch while another Sniff tray copy holds the single-instance mutex.
// An older copy (another folder, or files replaced while it was running) must never be
// reopened silently: that is how an update could keep showing the old interface.
internal static class Instances
{
    internal const int StartThisCopy = -1;

    internal static string Version(string root)
    {
        try
        {
            var package = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(root, "package.json")));
            return package.ContainsKey("version") ? Convert.ToString(package["version"]) : "unknown";
        }
        catch (Exception) { return "unknown"; }
    }

    private static string RunningUrl()
    {
        for (int i = 0; i < 30; i++)
        {
            try
            {
                string url = File.ReadAllText(Path.Combine(Program.Home, "desktop.url")).Trim();
                if (Program.ValidUrl(url)) return url;
            }
            catch (IOException) {}
            Thread.Sleep(200);
        }
        return null;
    }

    private static string RunningVersion(string url)
    {
        try
        {
            using (var client = new WebClient())
            {
                client.Headers["X-Sniff-Client"] = "1";
                var state = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(client.DownloadString(url + "api/state"));
                // Versions before 0.1.2 did not report appVersion.
                return state.ContainsKey("appVersion") ? Convert.ToString(state["appVersion"]) : "0.1.1 or older";
            }
        }
        catch (Exception) { return null; }
    }

    internal static List<Process> OtherLaunchers()
    {
        int self = Process.GetCurrentProcess().Id;
        return Process.GetProcessesByName("SniffSolution").Where(p => p.Id != self).ToList();
    }

    internal static string ExePath(Process process)
    {
        try { return process.MainModule.FileName; } catch (Exception) { return null; }
    }

    internal static int HandleRunningCopy(Mutex mutex)
    {
        string ourExe = Path.GetFullPath(Application.ExecutablePath);
        string ourVersion = Version(AppDomain.CurrentDomain.BaseDirectory);
        string url = RunningUrl();
        string runningVersion = url == null ? null : RunningVersion(url);
        var others = OtherLaunchers();
        var paths = others.Select(ExePath).Where(x => x != null).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        bool sameFolder = paths.Count > 0 && paths.All(x => String.Equals(Path.GetFullPath(x), ourExe, StringComparison.OrdinalIgnoreCase));
        if (url != null && runningVersion == ourVersion && (sameFolder || paths.Count == 0))
        {
            Program.OpenUrl(url);
            return 0;
        }
        string where = paths.Count > 0 ? String.Join("\n", paths.Select(x => Path.GetDirectoryName(x))) : "unknown folder";
        Program.Log("Second launch from " + ourExe + " (v" + ourVersion + ") found running copy v" + (runningVersion ?? "unknown") + " in " + where.Replace("\n", "; "));
        if (Program.Smoke) return 1;
        if (others.Count == 0)
        {
            MessageBox.Show("Sniff Solution is already starting or closing. Try again in a moment.", "Sniff Solution");
            return 1;
        }
        string message = "Another copy of Sniff Solution is still running in the tray, so this copy cannot start yet.\n\n"
            + "Running: version " + (runningVersion ?? "unknown") + "\n" + where + "\n\n"
            + "This copy: version " + ourVersion + "\n" + Path.GetDirectoryName(ourExe) + "\n\n"
            + "Close the running copy and start this one?\n"
            + "Its server finishes any request in progress before stopping. Your settings and records are kept.";
        if (MessageBox.Show(message, "Sniff Solution - older copy running", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
            return 1;
        // Only Sniff Solution launchers are closed, never other Node processes. Closing a launcher
        // closes its server's input, which makes the server finish work and shut down cleanly.
        foreach (var process in others)
        {
            try { Program.Log("Closing running launcher " + (ExePath(process) ?? process.Id.ToString())); process.Kill(); }
            catch (Exception ex) { Program.Log("Could not close launcher: " + ex.Message); }
        }
        bool acquired;
        try { acquired = mutex.WaitOne(30000); }
        catch (AbandonedMutexException) { acquired = true; }
        if (!acquired)
        {
            MessageBox.Show("The running copy did not close. Quit it from its tray icon, then open Sniff Solution again.", "Sniff Solution");
            return 1;
        }
        if (!WaitForServerExit())
        {
            MessageBox.Show("The previous Sniff server is still finishing a request. Wait a minute, then open Sniff Solution again.", "Sniff Solution");
            mutex.ReleaseMutex();
            return 1;
        }
        return StartThisCopy;
    }

    private static bool WaitForServerExit()
    {
        string owner = Path.Combine(Program.Home, "desktop-owner.json");
        for (int i = 0; i < 1200; i++) // up to 4 minutes, matching the tray shutdown allowance
        {
            int pid = 0;
            try
            {
                if (!File.Exists(owner)) return true;
                var record = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(owner));
                pid = Convert.ToInt32(record["pid"]);
            }
            catch (IOException) { Thread.Sleep(200); continue; }
            catch (Exception) { return true; } // An unreadable record is reported by the server runner itself.
            try { using (var p = Process.GetProcessById(pid)) { if (p.HasExited) return true; } }
            catch (ArgumentException) { return true; }
            Thread.Sleep(200);
        }
        return false;
    }
}

internal sealed class DesktopContext : ApplicationContext
{
    private readonly NotifyIcon tray;
    private readonly Control dispatcher = new Control();
    private readonly TaskCompletionSource<string> ready = new TaskCompletionSource<string>();
    private readonly System.Windows.Forms.Timer startup = new System.Windows.Forms.Timer();
    private readonly JavaScriptSerializer serializer = new JavaScriptSerializer();
    private Process server;
    private string url;
    private bool stopping;
    private bool initialized;

    internal DesktopContext()
    {
        dispatcher.CreateControl();
        tray = new NotifyIcon();
        string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "SniffSolution.ico");
        tray.Icon = File.Exists(iconPath) ? new Icon(iconPath) : SystemIcons.Application;
        tray.Text = "Sniff Solution - starting";
        tray.Visible = !Program.Smoke;
        var menu = new ContextMenuStrip();
        menu.Items.Add("Open Sniff Solution", null, delegate { if (url != null) Program.OpenUrl(url); });
        menu.Items.Add("Edit API settings", null, delegate
        {
            Process.Start(new ProcessStartInfo("notepad.exe", Program.Quote(Path.Combine(Program.Home, ".env"))) { UseShellExecute = true });
        });
        menu.Items.Add("Open data and logs folder", null, delegate
        {
            Process.Start(new ProcessStartInfo(Program.Home) { UseShellExecute = true });
        });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit Sniff Solution", null, async delegate { await StopAsync(); });
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += delegate { if (url != null) Program.OpenUrl(url); };
        startup.Interval = 100;
        startup.Tick += async delegate { startup.Stop(); await StartAsync(); };
        startup.Start();
    }

    private async Task StartAsync()
    {
        try
        {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string config = Path.Combine(Program.Home, ".env");
            if (!File.Exists(config)) File.Copy(Path.Combine(root, ".env.example"), config);
            var info = new ProcessStartInfo(Path.Combine(root, "runtime", "node.exe"));
            info.Arguments = "--env-file-if-exists=" + Program.Quote(config) + " " + Program.Quote(Path.Combine(root, "desktop", "server-runner.mjs"));
            info.WorkingDirectory = root;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardInput = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.EnvironmentVariables["SNIFF_DESKTOP_HOME"] = Program.Home;
            info.EnvironmentVariables["DATA_DIR"] = Path.Combine(Program.Home, "data");
            info.EnvironmentVariables["PYTHON"] = Path.Combine(root, "runtime", "python", "python.exe");
            server = new Process { StartInfo = info, EnableRaisingEvents = true };
            server.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data == null) return;
                if (e.Data.StartsWith("SNIFF_READY ")) ready.TrySetResult(e.Data.Substring(12).Trim());
                else Program.Log(e.Data);
            };
            server.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) Program.Log(e.Data); };
            server.Exited += delegate
            {
                if (!ready.Task.IsCompleted) ready.TrySetException(new Exception("The local server could not start. Open " + Path.Combine(Program.Home, "desktop.log") + " for details."));
                else if (initialized && !stopping)
                {
                    try { dispatcher.BeginInvoke((Action)delegate
                    {
                        Program.Result = 1;
                        Program.Log("Server exited unexpectedly.");
                        if (!Program.Smoke) MessageBox.Show("The Sniff server stopped. Your saved data is retained. See desktop.log in the data folder.", "Sniff Solution");
                        ExitThread();
                    }); } catch (InvalidOperationException) {}
                }
            };
            if (!server.Start()) throw new Exception("Could not launch the bundled server.");
            server.BeginOutputReadLine(); server.BeginErrorReadLine();
            if (await Task.WhenAny(ready.Task, Task.Delay(90000)) != ready.Task) throw new TimeoutException("Sniff Solution did not start within 90 seconds. See the desktop log.");
            url = await ready.Task;
            if (!Program.ValidUrl(url)) throw new Exception("The local server returned an invalid address.");
            using (var client = Client())
            {
                string state = await client.DownloadStringTaskAsync(url + "api/state");
                if (!state.Contains("developer-owner")) throw new Exception("Unexpected local application response.");
                var live = serializer.Deserialize<Dictionary<string, object>>(state);
                var package = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(root, "package.json")));
                if (!live.ContainsKey("appVersion") || (string)live["appVersion"] != (string)package["version"]) throw new Exception("An older server is still running. Quit all Sniff tray icons, then reopen this copy.");
            }
            initialized = true;
            tray.Text = "Sniff Solution - running";
            if (Program.Smoke)
            {
                await SmokeAsync();
                Program.Log("SMOKE PASS " + Program.SmokeMode);
                await StopAsync();
            }
            else Program.OpenUrl(url);
        }
        catch (Exception ex)
        {
            Program.Result = 1; Program.Log("Startup: " + ex.Message);
            if (!Program.Smoke) MessageBox.Show(ex.Message + "\n\nData and logs: " + Program.Home, "Sniff Solution", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        if (Program.Result != 0) await StopAsync();
    }

    private WebClient Client()
    {
        var client = new WebClient();
        client.Headers["X-Sniff-Client"] = "1";
        client.Headers[HttpRequestHeader.ContentType] = "application/json";
        return client;
    }

    private async Task SmokeAsync()
    {
        using (var client = Client())
        {
            var state = serializer.Deserialize<Dictionary<string, object>>(await client.DownloadStringTaskAsync(url + "api/state"));
            string script = await client.DownloadStringTaskAsync(url + "app.js");
            if (!script.Contains("Suggest from website")) throw new Exception("The packaged website-suggestion button is missing.");
            var skills = (System.Collections.IEnumerable)state["skills"];
            if (skills.Cast<object>().Count() != 13) throw new Exception("Packaged skill count is incorrect.");
            if (Program.SmokeMode == "--smoke-test-write")
            {
                var brand = serializer.Deserialize<Dictionary<string, object>>(await client.UploadStringTaskAsync(url + "api/brands", "POST", serializer.Serialize(new { name = "Desktop installer verification", voice = "Clear and friendly" })));
                await client.UploadStringTaskAsync(url + "api/drafts", "POST", serializer.Serialize(new { brandId = brand["id"], title = "Installer persistence test", text = "Saved from the Windows installer smoke test." }));
            }
            else
            {
                string serializedState = serializer.Serialize(state);
                if (!serializedState.Contains("Saved from the Windows installer smoke test.")) throw new Exception("Saved draft did not survive reinstall/restart.");
            }
            string check = await client.UploadStringTaskAsync(url + "api/checks", "POST", serializer.Serialize(new { command = "caption", text = "test" }));
            if (!check.Contains("\"characters\":4")) throw new Exception("The bundled Python tools did not run.");
        }
    }

    private async Task StopAsync()
    {
        if (stopping) return;
        stopping = true;
        tray.Text = "Sniff Solution - finishing work";
        try
        {
            if (server != null && !server.HasExited)
            {
                try { await server.StandardInput.WriteLineAsync("quit"); await server.StandardInput.FlushAsync(); } catch (IOException) {}
                bool exited = await Task.Run(() => server.WaitForExit(240000));
                if (!exited)
                {
                    Program.Result = 1; Program.Log("Shutdown is still waiting for work to finish.");
                    if (Program.Smoke) { server.Kill(); }
                    else
                    {
                        MessageBox.Show("Sniff is still finishing a request. Leave it in the tray and try Quit again shortly.", "Sniff Solution");
                        stopping = false; return;
                    }
                }
                server.WaitForExit();
            }
        }
        catch (Exception ex) { Program.Result = 1; Program.Log("Shutdown: " + ex.Message); }
        ExitThread();
    }

    protected override void ExitThreadCore()
    {
        tray.Visible = false;
        base.ExitThreadCore();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { startup.Dispose(); tray.Dispose(); dispatcher.Dispose(); if (server != null) server.Dispose(); }
        base.Dispose(disposing);
    }
}

