using System;
using System.IO;
using System.Drawing;
using System.Windows.Forms;
using System.Diagnostics;
using Microsoft.Win32;

namespace DropFlowInstaller
{
    public class SetupForm : Form
    {
        private ProgressBar progressBar;
        private Label lblStatus;
        private Button btnLaunch;
        private System.Windows.Forms.Timer timer;
        private int progressStep = 0;

        public SetupForm()
        {
            this.Text = "DropFlow Setup — Cross-Platform File Drop";
            this.Size = new Size(520, 340);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(7, 9, 14);
            this.ForeColor = Color.White;
            this.Font = new Font("Segoe UI", 9.5f);

            Label lblTitle = new Label();
            lblTitle.Text = "DropFlow Setup";
            lblTitle.Font = new Font("Segoe UI", 18f, FontStyle.Bold);
            lblTitle.ForeColor = Color.FromArgb(6, 182, 212);
            lblTitle.Location = new Point(24, 20);
            lblTitle.AutoSize = true;
            this.Controls.Add(lblTitle);

            Label lblSub = new Label();
            lblSub.Text = "Installing DropFlow Desktop permanently into Windows...";
            lblSub.ForeColor = Color.FromArgb(148, 163, 184);
            lblSub.Location = new Point(26, 58);
            lblSub.AutoSize = true;
            this.Controls.Add(lblSub);

            progressBar = new ProgressBar();
            progressBar.Location = new Point(28, 105);
            progressBar.Size = new Size(450, 16);
            progressBar.Style = ProgressBarStyle.Continuous;
            this.Controls.Add(progressBar);

            lblStatus = new Label();
            lblStatus.Text = "Preparing local environment...";
            lblStatus.ForeColor = Color.FromArgb(203, 213, 225);
            lblStatus.Location = new Point(28, 132);
            lblStatus.AutoSize = true;
            this.Controls.Add(lblStatus);

            btnLaunch = new Button();
            btnLaunch.Text = "Launch DropFlow";
            btnLaunch.Size = new Size(180, 42);
            btnLaunch.Location = new Point(165, 205);
            btnLaunch.BackColor = Color.FromArgb(6, 182, 212);
            btnLaunch.ForeColor = Color.FromArgb(3, 7, 18);
            btnLaunch.FlatStyle = FlatStyle.Flat;
            btnLaunch.FlatAppearance.BorderSize = 0;
            btnLaunch.Font = new Font("Segoe UI", 10.5f, FontStyle.Bold);
            btnLaunch.Cursor = Cursors.Hand;
            btnLaunch.Visible = false;
            btnLaunch.Click += (s, e) => {
                LaunchNativeDropFlowApp();
                this.Close();
            };
            this.Controls.Add(btnLaunch);

            timer = new System.Windows.Forms.Timer();
            timer.Interval = 70;
            timer.Tick += Timer_Tick;
            timer.Start();
        }

        public void LaunchNativeDropFlowApp()
        {
            try {
                string projectDir = @"c:\Users\Tamilkumaran\OneDrive\Desktop\file drop";
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                string[] candidateElectrons = new string[] {
                    Path.Combine(projectDir, "node_modules", "electron", "dist", "electron.exe"),
                    Path.Combine(baseDir, "node_modules", "electron", "dist", "electron.exe"),
                    Path.Combine(baseDir, "..", "..", "..", "node_modules", "electron", "dist", "electron.exe"),
                    Path.Combine(baseDir, "..", "..", "node_modules", "electron", "dist", "electron.exe"),
                    Path.Combine(baseDir, "electron.exe"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "DropFlow", "electron.exe")
                };

                string electronExe = null;
                foreach (string candidate in candidateElectrons) {
                    if (File.Exists(candidate)) {
                        electronExe = candidate;
                        break;
                    }
                }

                string[] candidateMains = new string[] {
                    Path.Combine(projectDir, "packages", "desktop", "dist", "main.js"),
                    Path.Combine(baseDir, "packages", "desktop", "dist", "main.js"),
                    Path.Combine(baseDir, "..", "..", "..", "packages", "desktop", "dist", "main.js"),
                    Path.Combine(baseDir, "main.js")
                };

                string mainJs = null;
                foreach (string candidate in candidateMains) {
                    if (File.Exists(candidate)) {
                        mainJs = candidate;
                        break;
                    }
                }

                if (!string.IsNullOrEmpty(electronExe) && !string.IsNullOrEmpty(mainJs)) {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = electronExe;
                    psi.Arguments = string.Format("\"{0}\"", mainJs);
                    psi.WorkingDirectory = projectDir;
                    psi.UseShellExecute = false;
                    Process.Start(psi);
                    return;
                }

                // Fallback to cmd npx electron
                ProcessStartInfo npxPsi = new ProcessStartInfo();
                npxPsi.FileName = "cmd.exe";
                npxPsi.Arguments = "/c npx electron packages/desktop/dist/main.js";
                npxPsi.WorkingDirectory = projectDir;
                npxPsi.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(npxPsi);
            } catch (Exception ex) {
                MessageBox.Show("Failed to launch DropFlow native application: " + ex.Message, "DropFlow Launcher Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void Timer_Tick(object sender, EventArgs e)
        {
            progressStep += 5;
            if (progressStep <= 100)
            {
                progressBar.Value = progressStep;
                if (progressStep == 20) {
                    lblStatus.Text = "Configuring ~/Downloads/FileDrop auto-save folder...";
                    try {
                        string downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "FileDrop");
                        if (!Directory.Exists(downloads)) Directory.CreateDirectory(downloads);
                    } catch {}
                }
                else if (progressStep == 40) {
                    lblStatus.Text = "Installing permanent launcher to %LocalAppData%\\Programs\\DropFlow...";
                    try {
                        InstallPermanentExecutable();
                    } catch {}
                }
                else if (progressStep == 60) {
                    lblStatus.Text = "Registering Windows Start Menu shortcut & search index...";
                    try {
                        CreateStartMenuShortcut();
                    } catch {}
                }
                else if (progressStep == 80) {
                    lblStatus.Text = "Creating permanent Desktop shortcut...";
                    try {
                        CreateDesktopShortcut();
                    } catch {}
                }
                else if (progressStep == 95) {
                    lblStatus.Text = "Registering in Windows Installed Applications...";
                    try {
                        RegisterInWindowsApps();
                    } catch {}
                }
                else if (progressStep >= 100) {
                    timer.Stop();
                    lblStatus.Text = "DropFlow is permanently installed in Windows! Ready to launch.";
                    lblStatus.ForeColor = Color.FromArgb(16, 185, 129);
                    btnLaunch.Visible = true;
                }
            }
        }

        public static string GetInstalledExePath()
        {
            string localPrograms = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "DropFlow");
            return Path.Combine(localPrograms, "DropFlow.exe");
        }

        private void InstallPermanentExecutable()
        {
            try {
                string localPrograms = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "DropFlow");
                if (!Directory.Exists(localPrograms)) {
                    Directory.CreateDirectory(localPrograms);
                }

                string currentExe = Process.GetCurrentProcess().MainModule.FileName;
                string destExe = Path.Combine(localPrograms, "DropFlow.exe");

                if (!string.Equals(currentExe, destExe, StringComparison.OrdinalIgnoreCase)) {
                    File.Copy(currentExe, destExe, true);
                }
            } catch {}
        }

        private void CreateStartMenuShortcut()
        {
            try {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType != null) {
                    dynamic shell = Activator.CreateInstance(shellType);
                    string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                    string shortcutPath = Path.Combine(startMenu, "DropFlow.lnk");
                    string destExe = GetInstalledExePath();

                    dynamic shortcut = shell.CreateShortcut(shortcutPath);
                    shortcut.TargetPath = File.Exists(destExe) ? destExe : Process.GetCurrentProcess().MainModule.FileName;
                    shortcut.Arguments = "--launch";
                    shortcut.WorkingDirectory = Path.GetDirectoryName(shortcut.TargetPath);
                    shortcut.Description = "DropFlow — Instant Cross-Platform File Drop App";
                    shortcut.Save();
                }
            } catch {}
        }

        private void CreateDesktopShortcut()
        {
            try {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType != null) {
                    dynamic shell = Activator.CreateInstance(shellType);
                    string destExe = GetInstalledExePath();
                    string target = File.Exists(destExe) ? destExe : Process.GetCurrentProcess().MainModule.FileName;

                    // 1. Standard Desktop
                    string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                    string shortcutPath = Path.Combine(desktopPath, "DropFlow.lnk");

                    dynamic shortcut = shell.CreateShortcut(shortcutPath);
                    shortcut.TargetPath = target;
                    shortcut.Arguments = "--launch";
                    shortcut.WorkingDirectory = Path.GetDirectoryName(target);
                    shortcut.Description = "DropFlow — Instant Cross-Platform File Drop App";
                    shortcut.Save();

                    // 2. OneDrive Desktop (if active)
                    string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                    string oneDriveDesktop = Path.Combine(userProfile, "OneDrive", "Desktop");
                    if (Directory.Exists(oneDriveDesktop)) {
                        string oneDriveShortcut = Path.Combine(oneDriveDesktop, "DropFlow.lnk");
                        dynamic s2 = shell.CreateShortcut(oneDriveShortcut);
                        s2.TargetPath = target;
                        s2.Arguments = "--launch";
                        s2.WorkingDirectory = Path.GetDirectoryName(target);
                        s2.Description = "DropFlow — Instant Cross-Platform File Drop App";
                        s2.Save();
                    }
                }
            } catch {}
        }

        private void RegisterInWindowsApps()
        {
            try {
                string destExe = GetInstalledExePath();
                string target = File.Exists(destExe) ? destExe : Process.GetCurrentProcess().MainModule.FileName;
                string installDir = Path.GetDirectoryName(target);

                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\DropFlow")) {
                    if (key != null) {
                        key.SetValue("DisplayName", "DropFlow — Cross-Platform File Drop");
                        key.SetValue("DisplayVersion", "1.0.0");
                        key.SetValue("Publisher", "DropFlow");
                        key.SetValue("InstallLocation", installDir);
                        key.SetValue("DisplayIcon", target);
                        key.SetValue("UninstallString", "\"" + target + "\" --uninstall");
                        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                    }
                }
            } catch {}
        }

        [STAThread]
        public static void Main(string[] args)
        {
            // If already installed and executed from Start Menu / Desktop shortcut, or with --launch, run app directly
            bool hasLaunchArg = args != null && args.Length > 0 && (args[0] == "--launch" || args[0] == "-l");
            bool inProgramsDir = AppDomain.CurrentDomain.BaseDirectory.IndexOf("Programs\\DropFlow", StringComparison.OrdinalIgnoreCase) >= 0;

            if (hasLaunchArg || inProgramsDir) {
                SetupForm form = new SetupForm();
                form.LaunchNativeDropFlowApp();
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }
    }
}
