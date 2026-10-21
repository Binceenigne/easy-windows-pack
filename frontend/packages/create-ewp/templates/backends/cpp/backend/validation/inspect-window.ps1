$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class EwpInspect {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hwnd, EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int size);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder text, int size);
  public static void Show(int pid) {
    EnumWindows((hwnd, data) => {
      uint owner; GetWindowThreadProcessId(hwnd, out owner);
      if(owner == pid) {
        var text = new StringBuilder(4096); GetWindowText(hwnd, text, text.Capacity);
        var cls = new StringBuilder(4096); GetClassName(hwnd, cls, cls.Capacity); Console.WriteLine($"{hwnd} {cls} {text}");
        EnumChildWindows(hwnd, (child, ignored) => { var t = new StringBuilder(4096); var c = new StringBuilder(4096); GetWindowText(child, t, t.Capacity); GetClassName(child, c, c.Capacity); Console.WriteLine($"{child} {c} {t}"); return true; }, IntPtr.Zero);
      }
      return true;
    }, IntPtr.Zero);
  }
}
'@
Get-Process ewp-host -ErrorAction SilentlyContinue | ForEach-Object { [EwpInspect]::Show($_.Id) }