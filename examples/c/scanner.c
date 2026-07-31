/* scanner.c — Self-hosted scanner v4.0 (C + libc)
 * ============================================================================
 * Режим 0: System Scanner — спектр, список целей, настройки
 * Режим 1: Planetary Survey — орбитальный вид, зонд, данные планеты
 * Переключение режимов: Tab (9)
 *
 * Target list queried from fitted scanner hardware via _sys_scan_list().
 * ============================================================================
 */
#include <pcos.h>
#include <stdio.h>

/* ─── Константы клавиш ────────────────────────────────────────────────── */
#define KEY_ESC     27
#define KEY_TAB     9
#define KEY_ENTER   13
#define KEY_LEFT    37
#define KEY_RIGHT   39
#define KEY_UP      38
#define KEY_DOWN    40
#define KEY_R       82
#define KEY_r       114
#define KEY_S       83
#define KEY_s       115
#define KEY_D       68
#define KEY_d       100
#define KEY_B       66
#define KEY_b       98
#define KEY_P       80
#define KEY_p       112
#define KEY_W       87
#define KEY_w       119

/* ─── Режимы ───────────────────────────────────────────────────────────── */
#define MODE_SCANNER  0
#define MODE_PLANET   1

/* ─── Глобальные переменные ──────────────────────────────────────────── */
static int var_mode;
static int var_sel;
static int var_freq;
static int var_bw;
static int var_beam;
static int var_pol;
static int var_bearing;
static int var_rx;
static int var_tx;
static int var_prog;
static int var_scan;
static int var_probe;
static int var_surf;

/* ─── Текстовые константы ─────────────────────────────────────────────── */
static const char* s_title_sys = "SCANOS v4.0 :: SYSTEM SCANNER (C)";
static const char* s_title_pln = "SCANOS v4.0 :: PLANETARY SURVEY";
static const char* s_targets   = "TARGETS:";
static const char* s_help0     = "[Tab]planet [Enter]scan [S]save [Esc]exit";
static const char* s_help_p    = "[Tab]scanner [D]eploy [S]can [B]ack";
static const char* s_freq_lbl  = "Freq: ";
static const char* s_bw_lbl    = "  BW: ";
static const char* s_beam_lbl  = "Beam: ";
static const char* s_pol_lbl   = "  Pol: ";
static const char* s_signal    = "SIGNAL: ";
static const char* s_mhz       = " MHz ";
static const char* s_deg       = " deg ";
static const char* s_nl        = "\n";
static const char* s_bar_full  = "########";
static const char* s_bar_half  = "####----";
static const char* s_bar_low   = "#-------";

/* Buffer pointer for scanner target list (filled by _sys_scan_list) */
static int scan_target_buf;
static int scan_target_count;

/* ─── Helpers ──────────────────────────────────────────────────────────── */
int min(int a, int b) { return a < b ? a : b; }

void draw_bar(const char* label, int value) {
    _sys_tty_write(label, 9);
    if (value > 50)         _sys_tty_write(s_bar_full, 8);
    else if (value > 10)    _sys_tty_write(s_bar_half, 8);
    else                    _sys_tty_write(s_bar_low, 8);
    _sys_tty_write(s_nl, 1);
}

/* ─── draw_waterfall ───────────────────────────────────────────────────── */
void draw_waterfall(void) {
    _sys_gfx_pixel(340, 30,  0x7ee08a);
    _sys_gfx_pixel(345, 35,  0x7ee08a);
    _sys_gfx_pixel(350, 45,  0x7ee08a);
    _sys_gfx_pixel(355, 40,  0x7ee08a);
    _sys_gfx_pixel(340, 60,  0x5ba85c);
    _sys_gfx_pixel(345, 65,  0x5ba85c);
    _sys_gfx_pixel(350, 75,  0x5ba85c);
    _sys_gfx_pixel(355, 70,  0x5ba85c);
    _sys_gfx_pixel(340, 90,  0x3a6e3a);
    _sys_gfx_pixel(345, 95,  0x3a6e3a);
    _sys_gfx_pixel(350, 105, 0x3a6e3a);
    _sys_gfx_pixel(355, 100, 0x3a6e3a);
    _sys_gfx_pixel(340, 120, 0x294e29);
    _sys_gfx_pixel(345, 125, 0x294e29);
    _sys_gfx_pixel(350, 135, 0x294e29);
    _sys_gfx_pixel(355, 130, 0x294e29);
    _sys_gfx_pixel(340, 150, 0x182e18);
    _sys_gfx_pixel(350, 165, 0x182e18);
}

/* ─── draw_scanner ─────────────────────────────────────────────────────── */
void draw_scanner(void) {
    int i;

    _sys_tty_mode(1);
    _sys_gfx_begin();

    /* Spectrum frame */
    _sys_gfx_rect(10, 14, 400, 260);

    /* 18 spectrum bars */
    _sys_gfx_rect(20,  40,  14, 220);
    _sys_gfx_rect(38,  80,  14, 180);
    _sys_gfx_rect(56,  60,  14, 200);
    _sys_gfx_rect(74,  30,  14, 230);
    _sys_gfx_rect(92,  20,  14, 240);
    _sys_gfx_rect(110, 10,  14, 250);
    _sys_gfx_rect(128, 45,  14, 215);
    _sys_gfx_rect(146, 90,  14, 170);
    _sys_gfx_rect(164, 55,  14, 205);
    _sys_gfx_rect(182, 25,  14, 235);
    _sys_gfx_rect(200, 70,  14, 190);
    _sys_gfx_rect(218, 35,  14, 225);
    _sys_gfx_rect(236, 15,  14, 245);
    _sys_gfx_rect(254, 50,  14, 210);
    _sys_gfx_rect(272, 85,  14, 175);
    _sys_gfx_rect(290, 65,  14, 195);
    _sys_gfx_rect(308, 5,   14, 255);
    _sys_gfx_rect(326, 95,  14, 165);

    draw_waterfall();
    _sys_gfx_end();

    /* Text mode — info panel */
    _sys_tty_mode(0);
    _sys_tty_color(0xd7e8ff, 0x000000);

    _sys_tty_write(s_title_sys, 38);
    _sys_tty_write(s_nl, 1);

    /* Dynamic target list from scanner equipment */
    _sys_tty_write(s_targets, 8);
    _sys_tty_write(s_nl, 1);

    /* Query fitted scanner for available targets — raw syscall */
    scan_target_count = _sys_scan_list(scan_target_buf, 255);
    if (scan_target_count > 0) {
        _sys_tty_write(scan_target_buf, scan_target_count);
    }

    /* Settings */
    _sys_tty_write(s_freq_lbl, 6); _sys_print_int(var_freq); _sys_tty_write(s_mhz, 5);
    _sys_tty_write(s_bw_lbl, 6);   _sys_print_int(var_bw);   _sys_tty_write(s_mhz, 5);
    _sys_tty_write(s_beam_lbl, 6); _sys_print_int(var_beam); _sys_tty_write(s_deg, 5);

    draw_bar(s_signal, var_prog);

    _sys_tty_write(s_help0, 42);
    _sys_tty_write(s_nl, 1);
}

/* ─── draw_planet ──────────────────────────────────────────────────────── */
void draw_planet(void) {
    _sys_tty_mode(0);
    _sys_tty_color(0xd7e8ff, 0x000000);

    _sys_tty_write(s_title_pln, 31); _sys_tty_write(s_nl, 1);
    _sys_tty_write("PLANETARY DATA:", 15); _sys_tty_write(s_nl, 1);
    _sys_tty_write("Planet III / Rocky-Temperate", 28); _sys_tty_write(s_nl, 1);
    _sys_tty_write("Survey: 42%  Atmosphere: N2+O2", 31); _sys_tty_write(s_nl, 1);
    _sys_tty_write("Temp: -12..+18C  Press: 0.8atm", 30); _sys_tty_write(s_nl, 1);
    _sys_tty_write("Minerals: Fe/Ni/Quartz  Life: ?", 31); _sys_tty_write(s_nl, 1);
    _sys_tty_write("PROBE: Survey Mk1  Int:100% Bat:87%", 36); _sys_tty_write(s_nl, 1);
    _sys_tty_write("Link: Stable  Cache: 18/64 GB", 29); _sys_tty_write(s_nl, 1);

    draw_bar("SURFACE: ", var_surf);

    _sys_tty_write("MAP: . . * * . A . . * . . B .", 30); _sys_tty_write(s_nl, 1);
    _sys_tty_write(s_help_p, 36); _sys_tty_write(s_nl, 1);
}

/* ─── draw_screen ──────────────────────────────────────────────────────── */
void draw_screen(void) {
    _sys_tty_clear();
    if (var_mode == MODE_PLANET) draw_planet();
    else                         draw_scanner();
}

/* ─── Scanner key handlers ─────────────────────────────────────────────── */
void hks_freq_dn(void)  { var_freq = var_freq - 10; }
void hks_freq_up(void)  { var_freq = var_freq + 10; }
void hks_sel_up(void)   { if (var_sel > 0) var_sel = var_sel - 1; }
void hks_sel_dn(void)   { if (var_sel < 7) var_sel = var_sel + 1; }
void hks_save(void)     { var_scan = 2; }
void hks_bw_up(void)    { var_bw = var_bw + 20; }
void hks_beam_up(void)  { var_beam = var_beam + 5; }
void hks_pol(void)      { var_pol = var_pol + 1; if (var_pol >= 3) var_pol = 0; }

void hk_scanner(int key) {
    if (key == KEY_LEFT)              hks_freq_dn();
    else if (key == KEY_RIGHT)        hks_freq_up();
    else if (key == KEY_UP)           hks_sel_up();
    else if (key == KEY_DOWN)         hks_sel_dn();
    else if (key == KEY_S || key == KEY_s)  hks_save();
    else if (key == KEY_W || key == KEY_w)  hks_bw_up();
    else if (key == KEY_B || key == KEY_b)  hks_beam_up();
    else if (key == KEY_P || key == KEY_p)  hks_pol();
}

/* ─── Planet key handlers ──────────────────────────────────────────────── */
void hkp_deploy(void)    { var_probe = 1; }
void hkp_recall(void)    { var_probe = 0; }
void hkp_surf_scan(void) { var_surf = min(1000, var_surf + 30); }

void hk_planet(int key) {
    if (key == KEY_D || key == KEY_d)       hkp_deploy();
    else if (key == KEY_R || key == KEY_r)  hkp_recall();
    else if (key == KEY_S || key == KEY_s)  hkp_surf_scan();
}

/* ─── handle_key ───────────────────────────────────────────────────────── */
void handle_key(int key) {
    if (key == KEY_TAB) {
        var_mode = var_mode == MODE_PLANET ? MODE_SCANNER : MODE_PLANET;
        return;
    }
    if (key == KEY_ESC) {
        _sys_exit(0);
        return;
    }
    if (key == KEY_ENTER) {
        var_prog = min(1000, var_prog + 20);
        var_scan = 1;
        return;
    }
    if (var_mode == MODE_PLANET) hk_planet(key);
    else                          hk_scanner(key);
}

/* ─── main ─────────────────────────────────────────────────────────────── */
int main(void) {
    var_mode    = MODE_SCANNER;
    var_sel     = 0;
    var_scan    = 0;
    var_probe   = 0;
    var_freq    = 350;
    var_bw      = 120;
    var_bearing = 0;
    var_beam    = 42;
    var_pol     = 0;
    var_rx      = 85;
    var_tx      = 60;
    var_prog    = 0;
    var_surf    = 0;

    _sys_tty_mode(0);
    _sys_tty_color(0xd7e8ff, 0x000000);

    while (1) {
        int key;
        draw_screen();
        key = _sys_input_key();
        if (key != 0) handle_key(key);
        _sys_yield();
    }
    return 0;
}