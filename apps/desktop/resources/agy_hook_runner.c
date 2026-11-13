#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>

int wmain(int argc, wchar_t *argv[]) {
    if (argc < 3) {
        fwprintf(stderr, L"Usage: agy_hook_runner <dll_path> <exe_path> [args...]\n");
        return 1;
    }

    const wchar_t *dll_path = argv[1];
    const wchar_t *exe_path = argv[2];

    wchar_t cmdline[32768] = {0};
    wcscat_s(cmdline, 32768, L"\"");
    wcscat_s(cmdline, 32768, exe_path);
    wcscat_s(cmdline, 32768, L"\"");
    for (int i = 3; i < argc; i++) {
        wcscat_s(cmdline, 32768, L" \"");
        wcscat_s(cmdline, 32768, argv[i]);
        wcscat_s(cmdline, 32768, L"\"");
    }

    STARTUPINFOW si = {0};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi = {0};

    if (!CreateProcessW(exe_path, cmdline, NULL, NULL, TRUE, CREATE_SUSPENDED, NULL, NULL, &si, &pi)) {
        fwprintf(stderr, L"CreateProcessW failed: %lu\n", GetLastError());
        return 1;
    }

    size_t dll_bytes = (wcslen(dll_path) + 1) * sizeof(wchar_t);
    LPVOID remote_mem = VirtualAllocEx(pi.hProcess, NULL, dll_bytes, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if (remote_mem) {
        WriteProcessMemory(pi.hProcess, remote_mem, dll_path, dll_bytes, NULL);
        HMODULE k32 = GetModuleHandleW(L"kernel32.dll");
        LPTHREAD_START_ROUTINE load_lib = (LPTHREAD_START_ROUTINE)GetProcAddress(k32, "LoadLibraryW");
        HANDLE th = CreateRemoteThread(pi.hProcess, NULL, 0, load_lib, remote_mem, 0, NULL);
        if (th) {
            WaitForSingleObject(th, 5000);
            CloseHandle(th);
        }
        VirtualFreeEx(pi.hProcess, remote_mem, 0, MEM_RELEASE);
    }

    ResumeThread(pi.hThread);
    WaitForSingleObject(pi.hProcess, INFINITE);

    DWORD exit_code = 1;
    GetExitCodeProcess(pi.hProcess, &exit_code);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return (int)exit_code;
}
