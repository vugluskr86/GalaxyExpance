/* PCOS-specific system call declarations for PCVM C compiler */
#ifndef PCOS_H
#define PCOS_H

/* Terminal I/O */
void _sys_tty_write(int str, int len);
void _sys_tty_clear(void);
void _sys_tty_color(int fg, int bg);
void _sys_tty_mode(int mode);
void _sys_print_int(int value);

void _sys_gfx_begin(void);
void _sys_gfx_frame(int delay_ms);
void _sys_gfx_end(void);
void _sys_gfx_rect(int x, int y, int w, int h);
void _sys_gfx_line(int x1, int y1, int x2, int y2);
void _sys_gfx_circle(int x, int y, int radius, int fill);
void _sys_gfx_pixel(int x, int y, int color);
void _sys_gfx_text(int x, int y, int text, int len);

/* Input */
int _sys_input_key(void);

/* Network / Device I/O */
int  _sys_net_info(int buf, int buf_size);
int  _sys_net_device_io(int mac, int cmd, int data);
int  _sys_scan_list(int buf, int buf_size);

/* Process */
void _sys_yield(void);
void _sys_exit(int status);
int _sys_time(void);

/* Memory helpers */
int _sys_mem_load8(int addr);
void _sys_mem_store8(int addr, int value);

/* Convenience wrappers */
void gfx_pixel(int x, int y, int color);
void gfx_rect(int x, int y, int w, int h);
void term_clear(void);
void term_color(int fg, int bg);
int input_key(void);
int input_key_blocking(void);
void process_yield(void);

#endif