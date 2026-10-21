/* DXMT 0.80 compatibility for Wine 11.18's private Mac window layout.
 * SPDX-License-Identifier: LGPL-2.1-or-later
 * Wine's COPYING.LIB applies to the combined driver.
 */
#pragma makedep unix
#include "config.h"
#include <stdlib.h>
#include <stddef.h>
#include <stdio.h>
#include <dlfcn.h>
#include <pthread.h>
#include "macdrv.h"

/* macdrv.h maps Wine's internal callers to these internal functions. */
#undef get_win_data
#undef release_win_data

struct coop_dxmt_surface
{
    HWND hwnd;
    struct client_surface *client;
    struct coop_dxmt_surface *next;
};
static pthread_mutex_t coop_surfaces_lock = PTHREAD_MUTEX_INITIALIZER;
static struct coop_dxmt_surface *coop_surfaces;

/* Wine 11 creates host client views lazily for rendering surfaces. DXMT 0.80
 * predates that API, so keep one host surface for each DXMT window and release
 * it before Wine destroys the window. No borrowed GDI view is fabricated.
 */
static void coop_ensure_client_surface(HWND hwnd)
{
    struct coop_dxmt_surface *entry;
    pthread_mutex_lock(&coop_surfaces_lock);
    for (entry = coop_surfaces; entry; entry = entry->next)
        if (entry->hwnd == hwnd) break;
    if (!entry && (entry = calloc(1, sizeof(*entry))))
    {
        entry->hwnd = hwnd;
        entry->client = macdrv_CreateClientSurface(hwnd, 0, TRUE);
        if (entry->client)
        {
            entry->next = coop_surfaces;
            coop_surfaces = entry;
        }
        else free(entry);
    }
    pthread_mutex_unlock(&coop_surfaces_lock);
}

void coop_dxmt_update_window(HWND hwnd)
{
    struct coop_dxmt_surface *entry;
    pthread_mutex_lock(&coop_surfaces_lock);
    for (entry = coop_surfaces; entry; entry = entry->next)
        if (entry->hwnd == hwnd) { client_surface_present(entry->client); break; }
    pthread_mutex_unlock(&coop_surfaces_lock);
}

void coop_dxmt_destroy_window(HWND hwnd)
{
    struct coop_dxmt_surface **link, *entry = NULL;
    pthread_mutex_lock(&coop_surfaces_lock);
    for (link = &coop_surfaces; *link; link = &(*link)->next)
        if ((*link)->hwnd == hwnd) { entry = *link; *link = entry->next; break; }
    pthread_mutex_unlock(&coop_surfaces_lock);
    if (entry) { client_surface_release(entry->client); free(entry); }
}

/* DXMT 0.80 reads the first four pointer fields of the older layout.
 * Never expose Wine 11.18's rects at the old client_cocoa_view offset.
 */
struct coop_dxmt_window_data
{
    HWND hwnd;
    WineWindow *cocoa_window;
    WineContentView *cocoa_view;
    WineContentView *client_cocoa_view;
    struct macdrv_win_data *original;
};

_Static_assert(offsetof(struct coop_dxmt_window_data, client_cocoa_view) == 3 * sizeof(void *),
               "DXMT 0.80 requires its client view at the fourth pointer slot");

/* Wine loads Unix modules with RTLD_NOW; DXMT looks in RTLD_DEFAULT.
 * Retain this already-loaded module in the global lookup scope as well.
 */
__attribute__((constructor)) static void coop_register_dxmt_exports(void)
{
    Dl_info info;
    void *global_handle = NULL;
    if (dladdr((void *)&coop_register_dxmt_exports, &info))
        global_handle = dlopen(info.dli_fname, RTLD_NOW | RTLD_GLOBAL | RTLD_NOLOAD);
    if (getenv("COOP_DXMT_DIAGNOSTICS"))
        fprintf(stderr,"COOP_DXMT_EXPORTS global=%u get=%u release=%u create=%u layer=%u destroy=%u\n",
                global_handle != NULL, dlsym(RTLD_DEFAULT,"get_win_data") != NULL,
                dlsym(RTLD_DEFAULT,"release_win_data") != NULL,
                dlsym(RTLD_DEFAULT,"macdrv_view_create_metal_view") != NULL,
                dlsym(RTLD_DEFAULT,"macdrv_view_get_metal_layer") != NULL,
                dlsym(RTLD_DEFAULT,"macdrv_view_release_metal_view") != NULL);
}

__attribute__((visibility("default")))
struct coop_dxmt_window_data *get_win_data(HWND hwnd)
{
    struct macdrv_win_data *original = coop_wine_get_win_data(hwnd);
    struct coop_dxmt_window_data *compat;
    if (original && !original->client_view)
    {
        coop_wine_release_win_data(original);
        coop_ensure_client_surface(hwnd);
        original = coop_wine_get_win_data(hwnd);
    }
    if (getenv("COOP_DXMT_DIAGNOSTICS"))
        fprintf(stderr,"COOP_DXMT_WINDOW found=%u client_view=%u\n",original != NULL,
                original && original->client_view != NULL);
    if (!original) return NULL;
    compat = malloc(sizeof(*compat));
    if (!compat)
    {
        coop_wine_release_win_data(original);
        return NULL;
    }
    compat->hwnd = original->hwnd;
    compat->cocoa_window = original->cocoa_window;
    compat->cocoa_view = original->client_view;
    compat->client_cocoa_view = original->client_view;
    compat->original = original;
    return compat;
}

__attribute__((visibility("default")))
void release_win_data(struct coop_dxmt_window_data *compat)
{
    if (!compat) return;
    coop_wine_release_win_data(compat->original);
    free(compat);
}
