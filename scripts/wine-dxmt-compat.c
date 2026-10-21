/* DXMT 0.80 compatibility for Wine 11.18's private Mac window layout.
 * SPDX-License-Identifier: LGPL-2.1-or-later
 * Wine's COPYING.LIB applies to the combined driver.
 */
#pragma makedep unix
#include "config.h"
#include <stdlib.h>
#include "macdrv.h"

/* macdrv.h maps Wine's internal callers to these internal functions. */
#undef get_win_data
#undef release_win_data

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

__attribute__((visibility("default")))
struct coop_dxmt_window_data *get_win_data(HWND hwnd)
{
    struct macdrv_win_data *original = coop_wine_get_win_data(hwnd);
    struct coop_dxmt_window_data *compat;
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
