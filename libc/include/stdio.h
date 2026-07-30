/* Standard I/O for PCVM C compiler */
#ifndef STDIO_H
#define STDIO_H

void putchar(char c);
void puts(const char* s);
void print_int(int n);

/* _sys_tty_write is the low-level syscall; use puts() for strings */

#endif