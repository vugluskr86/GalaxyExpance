/* PCOS convenience wrappers for C programs */
#include "include/pcos.h"

void gfx_pixel(int x, int y, int color) { _sys_gfx_pixel(x, y, color); }
void gfx_rect(int x, int y, int w, int h) { _sys_gfx_rect(x, y, w, h); }
void term_clear(void) { _sys_tty_clear(); }
void term_color(int fg, int bg) { _sys_tty_color(fg, bg); }
int input_key(void) { return _sys_input_key(); }

int input_key_blocking(void) {
    int k;
    do { k = _sys_input_key(); _sys_yield(); } while (k == 0);
    return k;
}

void process_yield(void) { _sys_yield(); }