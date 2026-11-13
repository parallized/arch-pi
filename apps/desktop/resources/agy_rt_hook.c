#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincred.h>
#include <string.h>
#include <stdlib.h>

static char g_refresh_token[4096] = {0};
static BYTE g_orig_bytes[14] = {0};
static void *g_target_addr = NULL;
static void *g_write_addr = NULL;
static CRITICAL_SECTION g_cs;

typedef BOOL (WINAPI *CredReadW_t)(LPCWSTR, DWORD, DWORD, PCREDENTIALW *);

static BOOL WINAPI HookedCredWriteW(PCREDENTIALW Credential, DWORD Flags) {
    (void)Credential;
    (void)Flags;
    return TRUE;
}

static void write_jump(void *src, void *dst) {
    DWORD old_prot = 0;
    VirtualProtect(src, 14, PAGE_EXECUTE_READWRITE, &old_prot);
    BYTE *p = (BYTE *)src;
    p[0] = 0xFF; p[1] = 0x25; p[2] = 0x00; p[3] = 0x00; p[4] = 0x00; p[5] = 0x00;
    *(UINT64 *)(p + 6) = (UINT64)dst;
    VirtualProtect(src, 14, old_prot, &old_prot);
    FlushInstructionCache(GetCurrentProcess(), src, 14);
}

static void restore_orig(void) {
    DWORD old_prot = 0;
    VirtualProtect(g_target_addr, 14, PAGE_EXECUTE_READWRITE, &old_prot);
    memcpy(g_target_addr, g_orig_bytes, 14);
    VirtualProtect(g_target_addr, 14, old_prot, &old_prot);
    FlushInstructionCache(GetCurrentProcess(), g_target_addr, 14);
}

static char *replace_json_string_field(const char *json, const char *key_quoted, const char *new_val) {
    const char *pos = strstr(json, key_quoted);
    if (!pos) return NULL;
    const char *colon = strchr(pos + strlen(key_quoted), ':');
    const char *q1 = colon ? strchr(colon + 1, '"') : NULL;
    const char *q2 = q1 ? strchr(q1 + 1, '"') : NULL;
    if (!q1 || !q2) return NULL;

    size_t prefix_len = (size_t)(q1 + 1 - json);
    size_t val_len = strlen(new_val);
    size_t suffix_len = strlen(q2);
    char *out = (char *)malloc(prefix_len + val_len + suffix_len + 1);
    if (!out) return NULL;

    memcpy(out, json, prefix_len);
    memcpy(out + prefix_len, new_val, val_len);
    memcpy(out + prefix_len + val_len, q2, suffix_len);
    out[prefix_len + val_len + suffix_len] = '\0';
    return out;
}

static BOOL WINAPI HookedCredReadW(LPCWSTR TargetName, DWORD Type, DWORD Flags, PCREDENTIALW *Credential) {
    EnterCriticalSection(&g_cs);
    restore_orig();
    CredReadW_t orig = (CredReadW_t)g_target_addr;
    BOOL ok = orig(TargetName, Type, Flags, Credential);
    write_jump(g_target_addr, (void *)HookedCredReadW);
    LeaveCriticalSection(&g_cs);

    if (ok && Credential && *Credential && (*Credential)->CredentialBlob && (*Credential)->CredentialBlobSize > 0 && g_refresh_token[0] != '\0') {
        DWORD blob_size = (*Credential)->CredentialBlobSize;
        char *buf = (char *)malloc(blob_size + 1);
        if (buf) {
            memcpy(buf, (*Credential)->CredentialBlob, blob_size);
            buf[blob_size] = '\0';

            char *step1 = replace_json_string_field(buf, "\"refresh_token\"", g_refresh_token);
            if (step1) {
                char *step2 = replace_json_string_field(step1, "\"access_token\"", "");
                char *step3 = replace_json_string_field(step2 ? step2 : step1, "\"expiry\"", "1970-01-01T00:00:00Z");
                const char *final_json = step3 ? step3 : (step2 ? step2 : step1);
                size_t new_len = strlen(final_json);
                BYTE *new_blob = (BYTE *)LocalAlloc(LMEM_FIXED, new_len);
                if (new_blob) {
                    memcpy(new_blob, final_json, new_len);
                    (*Credential)->CredentialBlob = new_blob;
                    (*Credential)->CredentialBlobSize = (DWORD)new_len;
                }
                if (step3) free(step3);
                if (step2) free(step2);
                free(step1);
            }
            free(buf);
        }
    }
    return ok;
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved) {
    (void)hModule;
    (void)lpReserved;
    if (ul_reason_for_call == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(hModule);
        if (GetEnvironmentVariableA("ARCHPI_HOOK_REFRESH_TOKEN", g_refresh_token, sizeof(g_refresh_token)) > 0) {
            HMODULE adv = GetModuleHandleA("advapi32.dll");
            if (!adv) adv = LoadLibraryA("advapi32.dll");
            if (adv) {
                g_target_addr = (void *)GetProcAddress(adv, "CredReadW");
                if (g_target_addr) {
                    InitializeCriticalSection(&g_cs);
                    memcpy(g_orig_bytes, g_target_addr, 14);
                    write_jump(g_target_addr, (void *)HookedCredReadW);
                }
                g_write_addr = (void *)GetProcAddress(adv, "CredWriteW");
                if (g_write_addr) {
                    write_jump(g_write_addr, (void *)HookedCredWriteW);
                }
            }
        }
    }
    return TRUE;
}
