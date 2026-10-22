/*
 * Coop Oyun — steamwebhelper sarmalayıcısı (MIT)
 *
 * Steam'in Chromium tabanlı arayüzü (steamwebhelper.exe) Mac'te Wine +
 * DXMT altında GPU süreciyle açıldığında siyah pencere verir; ayrı ağ
 * süreci de TLS el sıkışmasında düşer ve giriş başarısız olur. Bu küçük
 * program Steam'in çağırdığı steamwebhelper.exe'nin yerine geçer ve
 * Valve'ın özgün dosyasını (steamwebhelper_real.exe) şu bayraklarla açar:
 *
 *   --disable-gpu      Arayüz CPU ile çizilir; DXMT süreçler arası
 *                      swapchain sınırına takılmaz.
 *   --single-process   Ağ ve çizim aynı süreçte kalır; Wine winsock
 *                      üzerinden düşen TLS bağlantıları önlenir.
 *
 * Yaklaşım: notpop/steam-on-m1-wine (MIT) ve Gcenx/macOS_Wine_builds#159.
 * Kod bu proje için yeniden yazıldı.
 *
 * Derleme: x86_64-w64-mingw32-gcc -municode -O2 -static -mwindows
 */
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <stdlib.h>
#include <wchar.h>

#define REAL_NAME   L"steamwebhelper_real.exe"
#define EXTRA_FLAGS L"--disable-gpu --single-process"

/* Return the argument tail after argv[0], using the Windows rules for the
 * program name: a quoted first token ends at the next quote, otherwise at
 * the first space or tab. */
static const wchar_t *argument_tail(const wchar_t *line)
{
    if (!line) return L"";
    if (*line == L'"') {
        ++line;
        while (*line && *line != L'"') ++line;
        if (*line == L'"') ++line;
    } else {
        while (*line && *line != L' ' && *line != L'\t') ++line;
    }
    while (*line == L' ' || *line == L'\t') ++line;
    return line;
}

int wmain(void)
{
    wchar_t self[32768];
    DWORD length = GetModuleFileNameW(NULL, self, sizeof(self) / sizeof(self[0]));
    if (length == 0 || length >= sizeof(self) / sizeof(self[0])) return 1;
    wchar_t *slash = wcsrchr(self, L'\\');
    if (!slash) return 1;
    slash[1] = L'\0';

    size_t real_length = wcslen(self) + wcslen(REAL_NAME) + 1;
    wchar_t *real = calloc(real_length, sizeof(wchar_t));
    if (!real) return 1;
    wcscpy(real, self);
    wcscat(real, REAL_NAME);

    const wchar_t *tail = argument_tail(GetCommandLineW());
    size_t command_length = wcslen(real) + wcslen(EXTRA_FLAGS) + wcslen(tail) + 8;
    wchar_t *command = calloc(command_length, sizeof(wchar_t));
    if (!command) { free(real); return 1; }
    _snwprintf(command, command_length, L"\"%ls\" %ls %ls", real, EXTRA_FLAGS, tail);

    /* Forward our own startup information so inherited standard handles and
     * window settings reach the real helper unchanged. */
    STARTUPINFOW startup;
    GetStartupInfoW(&startup);
    PROCESS_INFORMATION process;
    ZeroMemory(&process, sizeof(process));

    /* If Steam terminates this wrapper, the real helper must not linger. A
     * failure here (for example an unsupported nested job) is not fatal. */
    HANDLE job = CreateJobObjectW(NULL, NULL);
    if (job) {
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;
        ZeroMemory(&limits, sizeof(limits));
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
            CloseHandle(job);
            job = NULL;
        }
    }

    if (!CreateProcessW(real, command, NULL, NULL, TRUE, CREATE_SUSPENDED, NULL, NULL, &startup, &process)) {
        if (job) CloseHandle(job);
        free(command);
        free(real);
        return 1;
    }
    if (job && !AssignProcessToJobObject(job, process.hProcess)) {
        CloseHandle(job);
        job = NULL;
    }
    ResumeThread(process.hThread);
    CloseHandle(process.hThread);

    WaitForSingleObject(process.hProcess, INFINITE);
    DWORD code = 1;
    GetExitCodeProcess(process.hProcess, &code);
    CloseHandle(process.hProcess);
    if (job) CloseHandle(job);
    free(command);
    free(real);
    return (int)code;
}
