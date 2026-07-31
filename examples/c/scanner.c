/* scanner.c — PCOS graphical scanner. All UI and interaction execute inside PCVM. */
#include <pcos.h>

#define ESC 27
#define TAB 9
#define ENTER 13
#define LEFT 37
#define UP 38
#define RIGHT 39
#define DOWN 40
#define MODE_SYSTEM 0
#define MODE_PLANET 1

static int mode;
static int selected;
static int lock_quality;
static int frequency;
static int bandwidth;
static int bearing;
static int probe_deployed;
static int probe_battery;
static int surface_progress;
static int last_key;
static int running;
static int highlight_y;
static int marker_x;
static int scan_width;



int main(void) {
  mode=MODE_SYSTEM; selected=5; lock_quality=63; frequency=350; bandwidth=120; bearing=71;
  probe_deployed=1; probe_battery=87; surface_progress=42; running=1;
  _sys_tty_mode(1);
  while(running) {
    draw();
    last_key=_sys_input_key();
    if(last_key!=0) handle_key();
    _sys_yield();
  }
  _sys_tty_mode(0); _sys_tty_clear();
  return 0;
}


void system_screen(void) {
  _sys_tty_mode(1); _sys_tty_clear(); _sys_gfx_begin();
  _sys_tty_color(0x8bdcff,0x02070b); _sys_gfx_rect(2,2,416,416); _sys_gfx_rect(5,5,410,24); _sys_gfx_text(10,11,"SCANOS v2.4 :: SYSTEM SCANNER",29);
  _sys_tty_color(0x3b7c93, 0x02070b); _sys_gfx_rect(6,34,145,174); _sys_gfx_rect(156,34,258,174); _sys_gfx_rect(6,213,408,140); _sys_gfx_rect(6,358,408,55);
  _sys_tty_color(0xb7e9f7, 0x02070b); _sys_gfx_text(11,40,"TARGETS / CONTACTS",18); _sys_gfx_text(161,40,"DIRECTIONAL SCAN / ANTENNA VIEW",31);
  highlight_y=selected*14; highlight_y=highlight_y+55;
  _sys_tty_color(0xffd166, 0x02070b); _sys_gfx_rect(8,highlight_y,138,13);
  _sys_tty_color(0x76c98d, 0x02070b);
  _sys_gfx_text(12,58,"[ ] Star KX-19",14); _sys_gfx_text(12,72,"[ ] Planet I",12); _sys_gfx_text(12,86,"[ ] Planet II",13);
  _sys_gfx_text(12,100,"[ ] Planet III",14); _sys_gfx_text(12,114,"[ ] Moon III-a",14); _sys_gfx_text(12,128,"[ ] Unknown Signal A",20);
  _sys_gfx_text(12,142,"[ ] Weak Contact B",18); _sys_gfx_text(12,156,"[ ] Debris Field",16); _sys_gfx_text(12,170,"[ ] Quasar Echo",15);
  _sys_tty_color(0x8bdcff, 0x02070b); _sys_gfx_text(277,52,"N",1); _sys_gfx_text(277,186,"S",1); _sys_gfx_text(171,119,"W",1); _sys_gfx_text(396,119,"E",1);
  _sys_gfx_line(285,68,285,190); _sys_gfx_line(172,125,399,125); _sys_gfx_line(285,125,244,84); _sys_gfx_line(285,125,326,84); _sys_gfx_line(285,125,244,166); _sys_gfx_line(285,125,326,166);
  _sys_tty_color(0xffd166, 0x02070b); _sys_gfx_rect(279,119,12,12);
  _sys_tty_color(0xb7e9f7, 0x02070b); _sys_gfx_text(11,218,"ACTIVE TARGET: Unknown Signal A",31); _sys_gfx_text(215,218,"SIGNAL LOCK:",12);
  _sys_tty_color(0xffd166, 0x02070b); _sys_gfx_rect(298,219,96,7); _sys_tty_color(0x76c98d, 0x02070b); _sys_gfx_rect(299,220,lock_quality,5);
  _sys_tty_color(0xb7e9f7, 0x02070b); _sys_gfx_text(11,232,"CLASS: unresolved",17); _sys_gfx_text(215,232,"RANGE: 2.14 AU  BEARING:",24);
  _sys_tty_color(0x8bdcff, 0x02070b); _sys_gfx_text(11,249,"SPECTRUM ANALYZER",17);
  _sys_tty_color(0x3b7c93, 0x02070b); _sys_gfx_line(12,330,402,330); _sys_gfx_line(12,274,402,274);
  _sys_tty_color(0x76c98d, 0x02070b);
  _sys_gfx_line(12,326,28,321); _sys_gfx_line(28,321,44,307); _sys_gfx_line(44,307,60,316); _sys_gfx_line(60,316,76,287); _sys_gfx_line(76,287,92,321);
  _sys_gfx_line(92,321,108,325); _sys_gfx_line(108,325,124,303); _sys_gfx_line(124,303,140,284); _sys_gfx_line(140,284,156,312); _sys_gfx_line(156,312,172,326);
  _sys_gfx_line(172,326,188,320); _sys_gfx_line(188,320,204,298); _sys_gfx_line(204,298,220,310); _sys_gfx_line(220,310,236,322); _sys_gfx_line(236,322,252,326);
  _sys_gfx_line(252,326,268,314); _sys_gfx_line(268,314,284,290); _sys_gfx_line(284,290,300,304); _sys_gfx_line(300,304,316,324); _sys_gfx_line(316,324,402,326);
  marker_x=frequency-250; marker_x=marker_x/2; marker_x=marker_x+12;
  _sys_tty_color(0xffd166, 0x02070b); _sys_gfx_rect(marker_x,268,4,62);
  _sys_tty_color(0xb7e9f7, 0x02070b); _sys_gfx_text(12,337,"FREQ",4); _sys_gfx_text(55,337,"350 MHz",7); _sys_gfx_text(130,337,"BW 120 MHz",10); _sys_gfx_text(230,337,"BEAM 42 deg",11); _sys_gfx_text(330,337,"POL AUTO",8);
  _sys_gfx_text(12,364,"[Arrows] target/frequency  [Enter] scan/lock",43); _sys_gfx_text(12,379,"[W] bandwidth  [B] beam  [P] polarization",42);
  _sys_gfx_text(12,394,"[Tab] planetary survey                 [Esc] exit",47);
  _sys_gfx_frame(0); _sys_gfx_end();
}

void planet_screen(void) {
  _sys_tty_mode(1); _sys_tty_clear(); _sys_gfx_begin();
  _sys_tty_color(0x8bdcff,0x02070b); _sys_gfx_rect(2,2,416,416); _sys_gfx_rect(5,5,410,24); _sys_gfx_text(10,11,"SCANOS v2.4 :: PLANETARY SURVEY / PROBE CONTROL",47);
  _sys_tty_color(0x3b7c93, 0x02070b); _sys_gfx_rect(6,34,205,214); _sys_gfx_rect(216,34,198,214); _sys_gfx_rect(6,253,408,105); _sys_gfx_rect(6,363,408,50);
  _sys_tty_color(0xb7e9f7, 0x02070b); _sys_gfx_text(11,40,"ORBITAL VIEW",12); _sys_gfx_text(221,40,"PLANETARY DATA",14);
  _sys_tty_color(0x8bdcff, 0x02070b); _sys_gfx_circle(108,139,62,0); _sys_gfx_circle(108,139,42,0); _sys_gfx_line(28,139,188,139); _sys_gfx_line(108,59,108,219);
  _sys_tty_color(0xffd166, 0x02070b); _sys_gfx_rect(151,92,5,5); _sys_gfx_text(160,89,"PROBE",5); _sys_tty_color(0xff6b6b, 0x02070b); _sys_gfx_rect(78,164,6,6); _sys_gfx_text(88,161,"A",1);
  _sys_tty_color(0xb7e9f7, 0x02070b); _sys_gfx_text(221,58,"Planet III / Rocky-Temperate",28); _sys_gfx_text(221,75,"Atmosphere: N2 + O2",19);
  _sys_gfx_text(221,92,"Temperature: -12..+18 C",24); _sys_gfx_text(221,109,"Pressure: 0.8 atm",17); _sys_gfx_text(221,126,"Radiation: LOW",14);
  _sys_gfx_text(221,143,"Minerals: Fe / Ni / Quartz",25); _sys_gfx_text(221,160,"Lifeforms: possible microbial",27);
  _sys_gfx_text(221,184,"PROBE Survey Mk1",16); _sys_gfx_text(221,201,"Link: STABLE  Battery:",21);
  _sys_tty_color(0x76c98d, 0x02070b); _sys_gfx_rect(354,202,45,6); _sys_tty_color(0xffd166, 0x02070b); _sys_gfx_rect(355,203,probe_battery/3,4);
  _sys_tty_color(0xb7e9f7, 0x02070b); _sys_gfx_text(11,259,"SURFACE SCAN / SIGNAL MAP",25);
  _sys_tty_color(0x3b7c93, 0x02070b); _sys_gfx_rect(15,278,390,61); _sys_gfx_line(54,278,54,339); _sys_gfx_line(93,278,93,339); _sys_gfx_line(132,278,132,339); _sys_gfx_line(171,278,171,339);
  _sys_gfx_line(210,278,210,339); _sys_gfx_line(249,278,249,339); _sys_gfx_line(288,278,288,339); _sys_gfx_line(327,278,327,339); _sys_gfx_line(366,278,366,339);
  scan_width=surface_progress*3;
  _sys_tty_color(0xffd166, 0x02070b); _sys_gfx_rect(15,342,scan_width,3);
  _sys_tty_color(0x76c98d, 0x02070b); _sys_gfx_rect(96,290,28,18); _sys_gfx_rect(139,306,24,20); _sys_gfx_rect(272,285,31,21); _sys_tty_color(0xff6b6b, 0x02070b); _sys_gfx_rect(179,294,8,8); _sys_tty_color(0xffd166, 0x02070b); _sys_gfx_rect(337,314,8,8);
  _sys_tty_color(0xb7e9f7, 0x02070b); _sys_gfx_text(11,345,"Findings: A metallic echo   B organic cluster   X safe zone",57);
  if(probe_deployed==1) _sys_gfx_text(221,218,"PROBE STATUS: DEPLOYED",22);
  else _sys_gfx_text(221,218,"PROBE STATUS: RECALLED",22);
  _sys_gfx_text(12,369,"[D] deploy probe  [R] recall  [S] surface scan",45); _sys_gfx_text(12,394,"[Tab] system scanner                    [Esc] exit",48);
  _sys_gfx_frame(0); _sys_gfx_end();
}

void draw(void) { if(mode==MODE_PLANET) planet_screen(); else system_screen(); }
void handle_key(void) {
  /* Keep every test deliberately simple. The current C backend does not yet
     preserve both operands reliably across compound && / || expressions. */
  if(last_key==ESC) {
    running=0;
    _sys_tty_mode(0);
    _sys_tty_clear();
    _sys_exit(0);
    return;
  }
  if(last_key==TAB) {
    if(mode==MODE_SYSTEM) mode=MODE_PLANET;
    else mode=MODE_SYSTEM;
    return;
  }
  if(mode==MODE_SYSTEM) {
    if(last_key==ENTER) {
      if(lock_quality<95) lock_quality=lock_quality+8;
      return;
    }
    if(last_key==LEFT) { frequency=frequency-10; return; }
    if(last_key==RIGHT) { frequency=frequency+10; return; }
    if(last_key==UP) {
      if(selected>0) selected=selected-1;
      return;
    }
    if(last_key==DOWN) {
      if(selected<8) selected=selected+1;
      return;
    }
    return;
  }
  if(last_key==68) { probe_deployed=1; return; }
  if(last_key==100) { probe_deployed=1; return; }
  if(last_key==82) { probe_deployed=0; return; }
  if(last_key==114) { probe_deployed=0; return; }
  if(last_key==83) {
    if(surface_progress<100) { surface_progress=surface_progress+5; probe_battery=probe_battery-1; }
    return;
  }
  if(last_key==115) {
    if(surface_progress<100) { surface_progress=surface_progress+5; probe_battery=probe_battery-1; }
    return;
  }
}
