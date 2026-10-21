param([int]$ProcessId, [ValidateSet('inspect','snap','restore','press','move','release')][string]$Action='inspect', [int]$X, [int]$Y)
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeBackendsWindow {
  public delegate bool EnumProc(IntPtr h, IntPtr data);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left,top,right,bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x,y; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx,dy; public uint data,flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mouse; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION data; }
  [DllImport("user32.dll",SetLastError=true)] public static extern uint SendInput(uint count,INPUT[] inputs,int size);
  public static uint Mouse(uint flags) { var input=new INPUT();input.data.mouse.flags=flags;return SendInput(1,new[]{input},Marshal.SizeOf(typeof(INPUT))); }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT monitor,work; public int flags; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p,IntPtr data);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h,uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr h,ref MONITORINFO info);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint data,UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk,byte scan,uint flags,UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h,int index);
  public static IntPtr Find(int process) {IntPtr found=IntPtr.Zero;EnumWindows((h,d)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid==process&&IsWindowVisible(h)){found=h;return false;}return true;},IntPtr.Zero);return found;}
}
'@
[NativeBackendsWindow]::SetProcessDPIAware() | Out-Null
$handle=[NativeBackendsWindow]::Find($ProcessId)
if($handle -eq [IntPtr]::Zero){throw 'Native host window not found'}
if($Action -eq 'press'){
 $activated=[NativeBackendsWindow]::SetForegroundWindow($handle)
 [NativeBackendsWindow]::SetCursorPos($X,$Y)|Out-Null
 $injected=[NativeBackendsWindow]::Mouse(2)
 if($injected -ne 1){throw "SendInput failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"}
}
if($Action -eq 'move'){[NativeBackendsWindow]::SetCursorPos($X,$Y)|Out-Null}
if($Action -eq 'release'){[NativeBackendsWindow]::Mouse(4)|Out-Null}
if($Action -eq 'restore'){[NativeBackendsWindow]::ShowWindow($handle,9)|Out-Null}
if($Action -eq 'snap'){
 [NativeBackendsWindow]::SetForegroundWindow($handle)|Out-Null
 [NativeBackendsWindow]::keybd_event(0x5B,0,0,[UIntPtr]::Zero)
 [NativeBackendsWindow]::keybd_event(0x25,0,0,[UIntPtr]::Zero)
 [NativeBackendsWindow]::keybd_event(0x25,0,2,[UIntPtr]::Zero)
 [NativeBackendsWindow]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)
}
$client=New-Object NativeBackendsWindow+RECT
$rect=New-Object NativeBackendsWindow+RECT
[NativeBackendsWindow]::GetClientRect($handle,[ref]$client)|Out-Null
[NativeBackendsWindow]::GetWindowRect($handle,[ref]$rect)|Out-Null
$info=New-Object NativeBackendsWindow+MONITORINFO
$info.cbSize=[Runtime.InteropServices.Marshal]::SizeOf($info)
[NativeBackendsWindow]::GetMonitorInfo([NativeBackendsWindow]::MonitorFromWindow($handle,2),[ref]$info)|Out-Null
$cursor=New-Object NativeBackendsWindow+POINT
[NativeBackendsWindow]::GetCursorPos([ref]$cursor)|Out-Null
@{nativeCaption=(([NativeBackendsWindow]::GetWindowLongPtr($handle,-16).ToInt64() -band 0x00C00000) -eq 0x00C00000);leftDown=([NativeBackendsWindow]::GetAsyncKeyState(1) -lt 0);enabled=[NativeBackendsWindow]::IsWindowEnabled($handle);activated=$activated;foreground=[NativeBackendsWindow]::GetForegroundWindow().ToInt64();pointWindow=[NativeBackendsWindow]::WindowFromPoint($cursor).ToInt64();cursor=@{x=$cursor.x;y=$cursor.y};handle=$handle.ToInt64();maximized=[NativeBackendsWindow]::IsZoomed($handle);client=@{width=$client.right-$client.left;height=$client.bottom-$client.top};rect=@{left=$rect.left;top=$rect.top;right=$rect.right;bottom=$rect.bottom};work=@{left=$info.work.left;top=$info.work.top;width=$info.work.right-$info.work.left;height=$info.work.bottom-$info.work.top}} | ConvertTo-Json -Compress