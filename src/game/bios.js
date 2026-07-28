/** Прошивка находится в корпусе компьютера и не занимает место на DRIVE. */
export const BIOS_ASM = `; Pixel Cosmos BIOS
TERM_MODE text
TERM_COLOR 0x7ee08a, 0x000000
TERM_CLEAR
PRINT "PIXEL COSMOS BIOS 1.0"
SYS_TIME
PRINT ""
PRINT "ОБОРУДОВАНИЕ:"
HW_LIST
PRINT ""
PRINT "СЛОТЫ:"
SLOT_LIST
PRINT ""
PRINT "ПОРТЫ:"
PORT_LIST
PRINT ""
PRINT "Поиск загрузочного диска..."
BOOT "os.bin"
HALT`;

/** Минимальная ОС, предустановленная на новых накопителях. */
export const DEFAULT_OS_ASM = `; Pixel Cosmos OS
.protected
PM_ENABLE
TERM_COLOR 0x6fb7ff, 0x000000
PRINT ""
PRINT "---------------------"
PRINT "PIXEL COSMOS OS"
PRINT "Система загружена с DRIVE."
SYS_TIME
PRINT ""
PRINT "Терминал готов."
HALT`;
