using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.RegularExpressions;

internal static class SebS5NativeKeyReader
{
    private static readonly Regex Sha256 = new Regex("^[0-9a-f]{64}$", RegexOptions.CultureInvariant);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetDllDirectory(string path);

    private static int Main(string[] args)
    {
        if (args == null || args.Length != 3)
        {
            return 10;
        }

        var inputPath = args[0];
        var outputPath = args[1];
        var applicationDirectory = args[2];

        AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs eventArgs)
        {
            var name = new AssemblyName(eventArgs.Name).Name;
            foreach (var extension in new[] { ".dll", ".exe" })
            {
                var candidate = Path.Combine(applicationDirectory, name + extension);
                if (File.Exists(candidate))
                {
                    return Assembly.LoadFrom(candidate);
                }
            }
            return null;
        };

        try
        {
            Directory.SetCurrentDirectory(applicationDirectory);
            SetDllDirectory(applicationDirectory);
            return Calculate(inputPath, outputPath);
        }
        catch
        {
            return 20;
        }
    }

    private static int Calculate(string inputPath, string outputPath)
    {
        SebWindowsConfig.Utilities.SEBClientInfo.SetSebPaths();
        SebWindowsConfig.Utilities.Logger.InitLogger(
            SebWindowsConfig.Utilities.SEBClientInfo.SebClientLogFileDirectory,
            Path.Combine(
                SebWindowsConfig.Utilities.SEBClientInfo.SebClientLogFileDirectory,
                "SebConfig.log"
            )
        );
        SebWindowsConfig.SEBSettings.RestoreDefaultAndCurrentSettings();
        SebWindowsConfig.SEBSettings.AddDefaultProhibitedProcesses();

        string filePassword = null;
        bool passwordIsHash = false;
        X509Certificate2 certificate = null;
        if (!SebWindowsConfig.SEBSettings.ReadSebConfigurationFile(
            inputPath,
            true,
            ref filePassword,
            ref passwordIsHash,
            ref certificate
        ))
        {
            return 21;
        }

        var configurationKey = SebWindowsConfig.Utilities.SEBProtectionController.ComputeConfigurationKey();
        var browserExamKey = SebWindowsConfig.Utilities.SEBProtectionController.ComputeBrowserExamKey();
        if (!Sha256.IsMatch(configurationKey ?? "") || !Sha256.IsMatch(browserExamKey ?? ""))
        {
            return 22;
        }

        File.WriteAllLines(
            outputPath,
            new[] { configurationKey, browserExamKey },
            new UTF8Encoding(false)
        );
        return 0;
    }
}
