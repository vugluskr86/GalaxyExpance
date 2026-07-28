; Bootstrap self-hosted assembler.
; Таблица имён находится в статической RAM-секции PCVM.
workspace: .equ 65536

.org 4096
opcode_names: .string "LOAD_A LOAD_B LOAD_C LOAD_D MOV_A_B MOV_A_C MOV_A_D MOV_B_A MOV_C_A MOV_D_A"
.byte 0

; Полная нормативная таблица: 134 legacy + 11 protected-mode команд.
.align 4
opcode_table: .dword 1424441849
.byte 1, 1
.dword 1374108992
.byte 2, 1
.dword 1390886611
.byte 3, 1
.dword 1474774706
.byte 4, 1
.dword -2105580576
.byte 5, 0
.dword -2088802957
.byte 6, 0
.dword -2004914862
.byte 7, 0
.dword 829173460
.byte 8, 0
.dword -829257105
.byte 9, 0
.dword -753285614
.byte 10, 0
.dword 858522533
.byte 11, 1
.dword 808189676
.byte 12, 1
.dword -659064858
.byte 13, 1
.dword -675842477
.byte 14, 1
.dword -2122180627
.byte 15, 0
.dword -2138958246
.byte 16, 0
.dword 1884729212
.byte 17, 0
.dword 1901506831
.byte 18, 0
.dword 37852328
.byte 19, 0
.dword 1985912705
.byte 20, 0
.dword -1176002893
.byte 21, 0
.dword -1390935075
.byte 22, 0
.dword -1568333685
.byte 23, 0
.dword 438189306
.byte 24, 0
.dword -300050357
.byte 25, 0
.dword -2030934689
.byte 26, 0
.dword 1216678624
.byte 27, 1
.dword 921765829
.byte 28, 1
.dword 1418554505
.byte 29, 1
.dword -1320987415
.byte 30, 1
.dword 1942912716
.byte 31, 0
.dword 484874981
.byte 32, 0
.dword -108637516
.byte 33, 0
.dword -1477557922
.byte 34, 0
.dword 1441219468
.byte 35, 1
.dword 152026442
.byte 36, 1
.dword 168804061
.byte 37, 1
.dword 51360728
.byte 38, 1
.dword -1549555951
.byte 39, 0
.dword 1185647699
.byte 40, 0
.dword 1288402841
.byte 41, 0
.dword 1393333832
.byte 42, 0
.dword 1226552564
.byte 43, 0
.dword 1012459837
.byte 44, 0
.dword -904746810
.byte 45, 0
.dword -1396563071
.byte 46, 0
.dword 102926731
.byte 47, 0
.dword -1843351619
.byte 48, 0
.dword 1317483727
.byte 49, 0
.dword -1171397520
.byte 50, 0
.dword -2094302637
.byte 51, 0
.dword 1801249204
.byte 52, 0
.dword -944413855
.byte 53, 0
.dword -672122913
.byte 54, 5
.dword 1831853701
.byte 55, 2
.dword -1614112382
.byte 56, 2
.dword -1890899811
.byte 57, 2
.dword 2110325264
.byte 58, 2
.dword -971457031
.byte 59, 2
.dword -645810411
.byte 60, 2
.dword -1605194876
.byte 61, 2
.dword 1581463828
.byte 62, 2
.dword 1101935823
.byte 63, 2
.dword 876847819
.byte 64, 1
.dword -499349312
.byte 65, 1
.dword -1114625076
.byte 66, 2
.dword -136094435
.byte 67, 1
.dword -204729755
.byte 68, 1
.dword 1153706791
.byte 69, 1
.dword -853454697
.byte 70, 1
.dword -820458460
.byte 71, 1
.dword 1889950551
.byte 72, 1
.dword 639870440
.byte 73, 1
.dword 1443270972
.byte 74, 0
.dword -1051424200
.byte 75, 0
.dword 1158051449
.byte 76, 1
.dword -153753493
.byte 77, 1
.dword -1159286395
.byte 78, 0
.dword 1433157007
.byte 79, 2
.dword 1778037159
.byte 80, 3
.dword 523919159
.byte 81, 5
.dword -1721717289
.byte 82, 6
.dword -1167578375
.byte 83, 5
.dword 1215278414
.byte 84, 0
.dword -620563946
.byte 85, 1
.dword 117817978
.byte 86, 0
.dword -1178881302
.byte 87, 0
.dword -985681893
.byte 88, 0
.dword 223576313
.byte 89, 0
.dword 206798694
.byte 90, 0
.dword -1770844464
.byte 91, 0
.dword -1396039766
.byte 92, 0
.dword -1289135070
.byte 93, 0
.dword 947035465
.byte 94, 0
.dword -361207898
.byte 95, 0
.dword 588339843
.byte 96, 0
.dword -1169247019
.byte 97, 1
.dword -1152694971
.byte 98, 0
.dword 1966621100
.byte 99, 0
.dword -1204644950
.byte 100, 0
.dword 205290934
.byte 101, 0
.dword 187521647
.byte 102, 0
.dword 384071981
.byte 103, 0
.dword -722363742
.byte 104, 0
.dword -283272738
.byte 105, 0
.dword -2014157070
.byte 106, 0
.dword 1310435923
.byte 107, 0
.dword -1556547718
.byte 108, 0
.dword -1181922891
.byte 109, 0
.dword 1499024923
.byte 110, 0
.dword 1064516263
.byte 111, 0
.dword 1454058054
.byte 112, 0
.dword 366532432
.byte 113, 0
.dword 2120094542
.byte 114, 0
.dword 305318971
.byte 115, 0
.dword -1582015929
.byte 116, 0
.dword -1378424874
.byte 117, 0
.dword -78585074
.byte 118, 0
.dword 694015143
.byte 119, 0
.dword -1244162678
.byte 120, 0
.dword 882571081
.byte 121, 0
.dword -209804006
.byte 122, 0
.dword -150609784
.byte 123, 0
.dword -2005004728
.byte 124, 0
.dword 337523592
.byte 125, 0
.dword 1394324018
.byte 126, 0
.dword -812479486
.byte 127, 0
.dword 862728698
.byte 128, 0
.dword 874471585
.byte 129, 0
.dword 778840603
.byte 130, 0
.dword 1851173974
.byte 131, 0
.dword -1640637688
.byte 132, 0
.dword -1413888621
.byte 133, 0
.dword -435112646
.byte 134, 0
.dword 669344900
.byte 135, 0
.dword -1375599859
.byte 136, 0
.dword -877652866
.byte 137, 0
.dword -1352255634
.byte 138, 0
.dword 563810622
.byte 139, 0
.dword 1035817973
.byte 140, 0
.dword 888348489
.byte 141, 0
.dword 517403962
.byte 142, 1
.dword 787636035
.byte 143, 0
.dword 1349145769
.byte 144, 0
.dword 2482385
.byte 145, 0
opcode_table_end: .zero 0

.align 4
source_cursor: .dword 0
source_end: .dword 0
output_cursor: .dword 98313
token_hash: .dword 0
operands_left: .dword 0
instruction_count: .dword 0
operand_start: .dword 0
operand_length: .dword 0
symbol_cursor: .dword 6144
last_symbol: .dword 0
directive_mode: .dword 0
pending_label: .dword 0
data_offset: .dword 0
current_opcode: .dword 0
operand_index: .dword 0
relocation_cursor: .dword 393216
relocation_count: .dword 0
relocation_table: .equ 393216
relocation_table_end: .equ 425984
data_image: .equ 425984
data_max: .dword 0
segment_table: .equ 360448
segment_table_end: .equ 393216
segment_cursor: .dword 360448
segment_count: .dword 0
segment_active: .dword 0
segment_start: .dword 0
segment_emit_cursor: .dword 0
segment_emit_remaining: .dword 0
symbol_table: .equ 6144
symbol_table_end: .equ 32768
output_start: .equ 98304
object_start: .equ 1310720
object_cursor: .dword 1310733
output_name: .string "a.obj"
output_name_end: .zero 0

; Заголовок PCVM v3: magic, version, protected featureFlags, instructionCount.
.org output_start
output_header: .byte 0x50, 0x43, 0x56, 0x4d, 3, 1, 0, 0, 0

; PCOB binary v2:
; magic[4], version:u8, payloadSize:u32, symbolCount:u16, relocationCount:u16.
.org object_start
object_header: .byte 0x50, 0x43, 0x4f, 0x42, 2
.dword 0
.word 0, 0

.org 5376
prompt_text: .string "Введите имя исходного .asm файла:"
.byte 0

.align 256
filename_buffer: .zero 128

TERM_MODE text
PRINT "Pixel Assembler ASM 0.1"
PRINT "Введите имя исходного .asm файла:"

read_name:
LOAD_B filename_buffer
LOAD_C 128
TTY_READLINE
JZ wait_input

; Прочитать исходник с DRIVE в рабочую область.
MOV_C_A
LOAD_D workspace
LOAD_B filename_buffer
FS_READ
JZ source_error
PRINT "Исходник загружен, байт:"
PRINT_A

; Инициализировать границы исходника.
MOV_C_A
LOAD_B workspace
ADD_B_C
MOV_A_B
LOAD_B source_end
STORE32_A_B
LOAD_A workspace
LOAD_B source_cursor
STORE32_A_B

; PASS 1: собрать TEXT-символы до генерации единого байта кода.
LOAD_A 0
LOAD_B instruction_count
STORE32_A_B
LOAD_A symbol_table
LOAD_B symbol_cursor
STORE32_A_B
LOAD_A 0
LOAD_B pending_label
STORE32_A_B
LOAD_B data_offset
STORE32_A_B
LOAD_A relocation_table
LOAD_B relocation_cursor
STORE32_A_B
LOAD_A 0
LOAD_B relocation_count
STORE32_A_B

symbol_pass_next:
LOAD_B source_end
LOAD32_A_B
MOV_C_A
LOAD_B source_cursor
LOAD32_A_B
MOV_B_A
LEX_TOKEN
JZ symbol_pass_done

; Сохранить token {start,length} и следующий cursor.
LOAD_B operand_length
STORE32_A_B
MOV_A_D
LOAD_B source_cursor
STORE32_A_B
LOAD_B operand_length
LOAD32_A_B
MOV_C_A
LOAD_B source_cursor
LOAD32_A_B
SUB_A_C
LOAD_B operand_start
STORE32_A_B

; Метка определяется завершающим ':' (ASCII 58).
MOV_B_D
DEC_B
LOAD8_A_B
LOAD_D 58
CMP_A_D
JZ symbol_define

; Не-метка может быть мнемоникой: полная ISA-таблица определяет TEXT offset.
LOAD_B operand_length
LOAD32_A_B
MOV_C_A
LOAD_B operand_start
LOAD32_A_B
MOV_B_A
STR_HASH
LOAD_B token_hash
STORE32_A_B

; Директивы первого прохода.
LOAD_D 627723398
CMP_A_D
JZ symbol_equ
LOAD_D 1749312422
CMP_A_D
JZ symbol_equ
LOAD_D -694837976
CMP_A_D
JZ symbol_import
LOAD_D -1707379864
CMP_A_D
JZ symbol_import
LOAD_D 169290375
CMP_A_D
JZ symbol_export
LOAD_D -1051425849
CMP_A_D
JZ symbol_export
LOAD_D 1168326349
CMP_A_D
JZ symbol_org
LOAD_D -931284307
CMP_A_D
JZ symbol_org
LOAD_D -1894456765
CMP_A_D
JZ symbol_dword
LOAD_D 1710408995
CMP_A_D
JZ symbol_dword
LOAD_D -1739540213
CMP_A_D
JZ symbol_byte
LOAD_D -1784406965
CMP_A_D
JZ symbol_byte
LOAD_D -588412687
CMP_A_D
JZ symbol_word
LOAD_D -633382607
CMP_A_D
JZ symbol_word
LOAD_D 1019584780
CMP_A_D
JZ symbol_string
LOAD_D 830956300
CMP_A_D
JZ symbol_string
LOAD_D 1084793055
CMP_A_D
JZ symbol_zero
LOAD_D 1135569119
CMP_A_D
JZ symbol_zero
LOAD_D 299961898
CMP_A_D
JZ symbol_align
LOAD_D -1265256502
CMP_A_D
JZ symbol_align

LOAD_B opcode_table

symbol_opcode_lookup:
MOV_C_B
LOAD32_A_B
MOV_D_A
LOAD_B token_hash
LOAD32_A_B
CMP_A_D
JZ symbol_opcode_found
MOV_B_C
LOAD_D 6
ADD_B_D
MOV_A_B
; Конец фиксированной таблицы 145×6 bytes: 4172 + 870 = 5042.
; Числовая константа нужна bootstrap-поколению до поддержки .zero 0 labels.
LOAD_D 5042
CMP_A_D
JNZ symbol_opcode_lookup
JMP symbol_pass_next

symbol_opcode_found:
LOAD_A 0
LOAD_B pending_label
STORE32_A_B
LOAD_B instruction_count
LOAD32_A_B
INC_A
STORE32_A_B
JMP symbol_pass_next

symbol_define:
; Hash имени без завершающего двоеточия.
LOAD_B operand_length
LOAD32_A_B
DEC_A
MOV_C_A
LOAD_B operand_start
LOAD32_A_B
MOV_B_A
STR_HASH
LOAD_B token_hash
STORE32_A_B

; Проверка повторного определения.
LOAD_B symbol_table
symbol_duplicate_loop:
MOV_C_B
LOAD_A symbol_cursor
MOV_B_A
LOAD32_A_B
MOV_B_C
CMP_A_B
JZ symbol_insert
LOAD32_A_B
MOV_D_A
LOAD_B token_hash
LOAD32_A_B
CMP_A_D
JZ symbol_define_existing
MOV_B_C
LOAD_D 16
ADD_B_D
JMP symbol_duplicate_loop

symbol_define_existing:
; UND placeholder от .export разрешается последующим определением.
MOV_B_C
LOAD_D 4
ADD_B_D
LOAD32_A_B
JNZ duplicate_symbol
MOV_B_C
LOAD_B last_symbol
MOV_A_C
STORE32_A_B
MOV_B_C
LOAD_D 4
ADD_B_D
LOAD_A 1
STORE32_A_B
MOV_B_C
LOAD_D 8
ADD_B_D
MOV_C_B
LOAD_B instruction_count
LOAD32_A_B
MOV_B_C
STORE32_A_B
LOAD_A 1
LOAD_B pending_label
STORE32_A_B
JMP symbol_pass_next

symbol_insert:
; Запись {hash:i32, section:i32, value:i32, flags:i32}; TEXT = 1.
LOAD_A symbol_cursor
MOV_B_A
LOAD32_A_B
MOV_C_A
LOAD_B last_symbol
STORE32_A_B
LOAD_D symbol_table_end
CMP_A_D
JZ symbol_overflow
MOV_B_C
LOAD_B token_hash
LOAD32_A_B
MOV_B_C
STORE32_A_B
LOAD_D 4
ADD_B_D
MOV_C_B
LOAD_A 1
STORE32_A_B
LOAD_D 4
ADD_B_D
MOV_C_B
LOAD_B instruction_count
LOAD32_A_B
MOV_B_C
STORE32_A_B
LOAD_D 4
ADD_B_D
MOV_C_B
LOAD_A 0
STORE32_A_B
LOAD_D 4
ADD_B_D
MOV_A_B
LOAD_B symbol_cursor
STORE32_A_B
LOAD_A 1
LOAD_B pending_label
STORE32_A_B
JMP symbol_pass_next

symbol_equ:
; Синтаксис: name: .equ numeric_value
LOAD_B last_symbol
LOAD32_A_B
JZ equ_without_symbol
LOAD_B source_end
LOAD32_A_B
MOV_C_A
LOAD_B source_cursor
LOAD32_A_B
MOV_B_A
LEX_TOKEN
JZ equ_without_value
LOAD_B operand_length
STORE32_A_B
MOV_A_D
LOAD_B source_cursor
STORE32_A_B
LOAD_B operand_length
LOAD32_A_B
MOV_C_A
LOAD_B source_cursor
LOAD32_A_B
SUB_A_C
MOV_B_A
STR_TO_INT
LOAD_B token_hash
STORE32_A_B
LOAD_B last_symbol
LOAD32_A_B
MOV_C_A
MOV_B_C
LOAD_D 4
ADD_B_D
LOAD_A 3
STORE32_A_B
LOAD_D 4
ADD_B_D
LOAD_B token_hash
LOAD32_A_B
MOV_B_C
LOAD_D 8
ADD_B_D
STORE32_A_B
LOAD_A 0
LOAD_B pending_label
STORE32_A_B
JMP symbol_pass_next

symbol_import:
LOAD_A 1
LOAD_B directive_mode
STORE32_A_B
CALL read_directive_symbol
JZ directive_without_symbol
JMP directive_symbol_lookup

symbol_export:
LOAD_A 2
LOAD_B directive_mode
STORE32_A_B
CALL read_directive_symbol
JZ directive_without_symbol

directive_symbol_lookup:
LOAD_B token_hash
STORE32_A_B
LOAD_B symbol_table
directive_lookup_loop:
MOV_C_B
LOAD_A symbol_cursor
MOV_B_A
LOAD32_A_B
MOV_B_C
CMP_A_B
JZ directive_insert_und
LOAD32_A_B
MOV_D_A
LOAD_B token_hash
LOAD32_A_B
CMP_A_D
JZ directive_symbol_found
MOV_B_C
LOAD_D 16
ADD_B_D
JMP directive_lookup_loop

directive_symbol_found:
LOAD_B directive_mode
LOAD32_A_B
LOAD_D 1
CMP_A_D
JZ duplicate_import
; export flag = 2 (импортированный символ экспортировать нельзя).
MOV_B_C
LOAD_D 4
ADD_B_D
LOAD32_A_B
JZ export_set_flag
LOAD_D 1
CMP_A_D
JZ export_set_flag
JMP export_imported

export_set_flag:
MOV_B_C
LOAD_D 12
ADD_B_D
LOAD_A 2
STORE32_A_B
LOAD_A 0
LOAD_B pending_label
STORE32_A_B
JMP symbol_pass_next

symbol_org:
CALL read_directive_symbol
JZ directive_without_value
CALL resolve_directive_value
LOAD_B data_offset
STORE32_A_B
CALL mark_pending_data
JMP symbol_pass_next

symbol_dword:
LOAD_A 4
LOAD_B directive_mode
STORE32_A_B
JMP symbol_data_values

symbol_word:
LOAD_A 2
LOAD_B directive_mode
STORE32_A_B
JMP symbol_data_values

symbol_byte:
LOAD_A 1
LOAD_B directive_mode
STORE32_A_B

symbol_data_values:
CALL mark_pending_data
symbol_data_value:
CALL read_directive_symbol
JZ directive_without_value
LOAD_B data_offset
LOAD32_A_B
MOV_C_A
LOAD_B directive_mode
LOAD32_A_B
MOV_D_A
MOV_B_C
ADD_B_D
MOV_A_B
LOAD_B data_offset
STORE32_A_B
; FA содержит разделитель после прочитанного значения.
FTOI
LOAD_D 10
CMP_A_D
JZ symbol_pass_next
LOAD_D 13
CMP_A_D
JZ symbol_pass_next
LOAD_D 0
CMP_A_D
JZ symbol_pass_next
JMP symbol_data_value

symbol_string:
CALL mark_pending_data
CALL read_directive_symbol
JZ directive_without_value
LOAD_B operand_length
LOAD32_A_B
LOAD_D 2
SUB_A_D
MOV_D_A
LOAD_B data_offset
LOAD32_A_B
MOV_B_A
ADD_B_D
MOV_A_B
LOAD_B data_offset
STORE32_A_B
JMP symbol_pass_next

symbol_zero:
CALL mark_pending_data
CALL read_directive_symbol
JZ directive_without_value
CALL resolve_directive_value
MOV_D_A
LOAD_B data_offset
LOAD32_A_B
MOV_B_A
ADD_B_D
MOV_A_B
LOAD_B data_offset
STORE32_A_B
JMP symbol_pass_next

symbol_align:
CALL read_directive_symbol
JZ directive_without_value
CALL resolve_directive_value
LOAD_B directive_mode
STORE32_A_B
symbol_align_loop:
LOAD_B data_offset
LOAD32_A_B
MOV_D_A
LOAD_B directive_mode
LOAD32_A_B
MOV_B_A
MOV_A_D
DIV_A_B
MUL_A_B
CMP_A_D
JZ symbol_align_done
MOV_A_D
INC_A
LOAD_B data_offset
STORE32_A_B
JMP symbol_align_loop
symbol_align_done:
CALL mark_pending_data
JMP symbol_pass_next

directive_insert_und:
LOAD_A symbol_cursor
MOV_B_A
LOAD32_A_B
MOV_C_A
LOAD_D symbol_table_end
CMP_A_D
JZ symbol_overflow
MOV_B_C
LOAD_B token_hash
LOAD32_A_B
MOV_B_C
STORE32_A_B
LOAD_D 4
ADD_B_D
LOAD_A 0
STORE32_A_B
LOAD_D 4
ADD_B_D
LOAD_A 0
STORE32_A_B
LOAD_D 4
ADD_B_D
MOV_C_B
LOAD_B directive_mode
LOAD32_A_B
MOV_B_C
STORE32_A_B
LOAD_D 4
ADD_B_D
MOV_A_B
LOAD_B symbol_cursor
STORE32_A_B
LOAD_A 0
LOAD_B pending_label
STORE32_A_B
JMP symbol_pass_next

symbol_pass_done:
; Начать PASS 2 с начала исходника и чистого счётчика инструкций.
LOAD_A workspace
LOAD_B source_cursor
STORE32_A_B
LOAD_A 0
LOAD_B instruction_count
STORE32_A_B
LOAD_B data_offset
LOAD32_A_B
LOAD_B data_max
STORE32_A_B
LOAD_A 0
LOAD_B data_offset
STORE32_A_B
LOAD_A segment_table
LOAD_B segment_cursor
STORE32_A_B
LOAD_A 0
LOAD_B segment_count
STORE32_A_B
LOAD_B segment_active
STORE32_A_B
PRINT "PASS 1 SYMBOLS COMPLETE"

pass1_next:
; Загрузить cursor/end и получить следующий токен.
LOAD_B source_cursor
LOAD32_A_B
MOV_B_A
LOAD_D source_end
MOV_A_D
MOV_B_A
LOAD32_A_B
MOV_C_A
LOAD_B source_cursor
LOAD32_A_B
MOV_B_A
LEX_TOKEN
JZ pass1_done

; Хеш токена и адрес следующего токена.
MOV_C_A
STR_HASH
LOAD_B token_hash
STORE32_A_B
MOV_A_D
LOAD_B source_cursor
STORE32_A_B

; Поиск hash в таблице мнемоник.
LOAD_B opcode_table
lookup_opcode:
MOV_C_B
LOAD32_A_B
MOV_D_A
LOAD_B token_hash
LOAD32_A_B
CMP_A_D
JZ opcode_found
MOV_B_C
LOAD_D 6
ADD_B_D
MOV_A_B
LOAD_D 5042
CMP_A_D
JNZ lookup_opcode
; Во втором проходе неизвестный mnemonic может быть data-директивой.
LOAD_B token_hash
LOAD32_A_B
LOAD_D 1168326349
CMP_A_D
JZ emit_data_org
LOAD_D -931284307
CMP_A_D
JZ emit_data_org
LOAD_D -1739540213
CMP_A_D
JZ emit_data_byte
LOAD_D -1784406965
CMP_A_D
JZ emit_data_byte
LOAD_D -588412687
CMP_A_D
JZ emit_data_word
LOAD_D -633382607
CMP_A_D
JZ emit_data_word
LOAD_D -1894456765
CMP_A_D
JZ emit_data_dword
LOAD_D 1710408995
CMP_A_D
JZ emit_data_dword
LOAD_D 1019584780
CMP_A_D
JZ emit_data_string
LOAD_D 830956300
CMP_A_D
JZ emit_data_string
LOAD_D 1084793055
CMP_A_D
JZ emit_data_zero
LOAD_D 1135569119
CMP_A_D
JZ emit_data_zero
LOAD_D 299961898
CMP_A_D
JZ emit_data_align
LOAD_D -1265256502
CMP_A_D
JZ emit_data_align
JMP pass1_next

emit_data_org:
CALL finalize_data_segment
CALL read_directive_symbol
JZ directive_without_value
CALL resolve_directive_value
LOAD_B data_offset
STORE32_A_B
LOAD_B segment_start
STORE32_A_B
LOAD_A 1
LOAD_B segment_active
STORE32_A_B
JMP pass1_next

emit_data_byte:
CALL ensure_data_segment
LOAD_A 1
LOAD_B directive_mode
STORE32_A_B
JMP emit_data_values

emit_data_word:
CALL ensure_data_segment
LOAD_A 2
LOAD_B directive_mode
STORE32_A_B
JMP emit_data_values

emit_data_dword:
CALL ensure_data_segment
LOAD_A 4
LOAD_B directive_mode
STORE32_A_B

emit_data_values:
CALL read_directive_symbol
JZ directive_without_value
STR_TO_INT
CALL write_data_value
FTOI
LOAD_D 10
CMP_A_D
JZ pass1_next
LOAD_D 13
CMP_A_D
JZ pass1_next
LOAD_D 0
CMP_A_D
JZ pass1_next
JMP emit_data_values

emit_data_zero:
CALL ensure_data_segment
CALL read_directive_symbol
JZ directive_without_value
CALL resolve_directive_value
MOV_D_A
LOAD_B data_offset
LOAD32_A_B
MOV_B_A
ADD_B_D
MOV_A_B
LOAD_B data_offset
STORE32_A_B
CALL update_data_max
JMP pass1_next

emit_data_align:
CALL ensure_data_segment
CALL read_directive_symbol
JZ directive_without_value
CALL resolve_directive_value
LOAD_B directive_mode
STORE32_A_B
emit_data_align_loop:
LOAD_B data_offset
LOAD32_A_B
MOV_D_A
LOAD_B directive_mode
LOAD32_A_B
MOV_B_A
MOV_A_D
DIV_A_B
MUL_A_B
CMP_A_D
JZ emit_data_align_done
MOV_A_D
INC_A
LOAD_B data_offset
STORE32_A_B
JMP emit_data_align_loop
emit_data_align_done:
CALL update_data_max
JMP pass1_next

emit_data_string:
CALL ensure_data_segment
CALL read_directive_symbol
JZ directive_without_value
; Сохранить source start+1 и длину без кавычек.
INC_B
MOV_A_B
LOAD_B operand_start
STORE32_A_B
LOAD_B operand_length
LOAD32_A_B
LOAD_D 2
SUB_A_D
LOAD_B operand_length
STORE32_A_B
; MEM_COPY: B=source, C=destination, D=length.
MOV_D_A
LOAD_B data_offset
LOAD32_A_B
MOV_B_A
LOAD_D data_image
ADD_B_D
MOV_C_B
LOAD_B operand_start
LOAD32_A_B
MOV_B_A
LOAD_D operand_length
MOV_A_D
MOV_B_D
LOAD32_A_B
MOV_D_A
LOAD_B operand_start
LOAD32_A_B
MOV_B_A
MEM_COPY
; dataOffset += length.
LOAD_B data_offset
LOAD32_A_B
MOV_B_A
ADD_B_D
MOV_A_B
LOAD_B data_offset
STORE32_A_B
CALL update_data_max
JMP pass1_next

opcode_found:
; Увеличить число инструкций заголовка.
LOAD_B instruction_count
LOAD32_A_B
INC_A
STORE32_A_B

MOV_B_C
LOAD_D 4
ADD_B_D
LOAD8_A_B
LOAD_B current_opcode
STORE32_A_B
CALL emit_byte
MOV_B_C
LOAD_D 5
ADD_B_D
LOAD8_A_B
MOV_D_A
CALL emit_byte
MOV_A_D
LOAD_B operands_left
STORE32_A_B
LOAD_A 0
LOAD_B operand_index
STORE32_A_B

encode_operands:
LOAD_B operands_left
LOAD32_A_B
JZ pass1_next
DEC_A
STORE32_A_B

; Получить следующий токен исходника как числовой литерал.
LOAD_B source_end
LOAD32_A_B
MOV_C_A
LOAD_B source_cursor
LOAD32_A_B
MOV_B_A
LEX_TOKEN
JZ pass1_done

; Сохранить descriptor операнда.
LOAD_B operand_length
STORE32_A_B
MOV_A_D
LOAD_D source_cursor
MOV_B_D
STORE32_A_B
LOAD_B operand_length
LOAD32_A_B
MOV_C_A
LOAD_B source_cursor
LOAD32_A_B
SUB_A_C
LOAD_B operand_start
STORE32_A_B

; Число -> type 0 + Float64, остальное -> type 1 + UTF-8.
LOAD_B operand_start
LOAD32_A_B
MOV_B_A
LOAD_D operand_length
MOV_A_D
MOV_B_D
LOAD32_A_B
MOV_C_A
LOAD_B operand_start
LOAD32_A_B
MOV_B_A
STR_IS_NUMBER
JNZ encode_number

; Не число: попробовать разрешить как TEXT-символ.
LOAD_B operand_length
LOAD32_A_B
MOV_C_A
LOAD_B operand_start
LOAD32_A_B
MOV_B_A
STR_HASH
LOAD_B token_hash
STORE32_A_B
LOAD_B symbol_table

operand_symbol_lookup:
MOV_C_B
LOAD_A symbol_cursor
MOV_B_A
LOAD32_A_B
MOV_B_C
CMP_A_B
JZ encode_string
LOAD32_A_B
MOV_D_A
LOAD_B token_hash
LOAD32_A_B
CMP_A_D
JZ encode_symbol
MOV_B_C
LOAD_D 16
ADD_B_D
JMP operand_symbol_lookup

encode_number:
LOAD_B operand_length
LOAD32_A_B
MOV_C_A
LOAD_B operand_start
LOAD32_A_B
MOV_B_A
STR_TO_INT
ITOF
JMP encode_number_payload

encode_symbol:
MOV_B_C
LOAD_D 8
ADD_B_D
LOAD32_A_B
ITOF
MOV_B_C
LOAD_D 4
ADD_B_D
LOAD32_A_B
LOAD_D 3
CMP_A_D
JZ encode_number_payload
CALL emit_relocation

; type=0, затем Float64.
encode_number_payload:
LOAD_A 0
CALL emit_byte
LOAD_B output_cursor
LOAD32_A_B
MOV_B_A
STORE64_FA_B
LOAD_D 8
ADD_B_D
MOV_A_B
LOAD_B output_cursor
STORE32_A_B
JMP operand_done

encode_string:
; type=1
LOAD_A 1
CALL emit_byte

; u16 длина
LOAD_B operand_length
LOAD32_A_B
MOV_D_A
LOAD_B output_cursor
LOAD32_A_B
MOV_B_A
MOV_A_D
STORE16_A_B
LOAD_D 2
ADD_B_D
MOV_A_B
LOAD_B output_cursor
STORE32_A_B

; Копирование UTF-8 токена в выход.
LOAD_B operand_start
LOAD32_A_B
MOV_B_A
LOAD_D operand_length
MOV_A_D
MOV_B_D
LOAD32_A_B
MOV_D_A
LOAD_B output_cursor
LOAD32_A_B
MOV_C_A
LOAD_B operand_start
LOAD32_A_B
MOV_B_A
MEM_COPY
MOV_B_C
ADD_B_D
MOV_A_B
LOAD_B output_cursor
STORE32_A_B
JMP operand_done

operand_done:
LOAD_B operand_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP encode_operands

pass1_done:
CALL finalize_data_segment
PRINT "PASS 1 COMPLETE"

; Выпустить разреженную таблицу PCVM DATA segments.
LOAD_B segment_count
LOAD32_A_B
CALL emit_u16
LOAD_A segment_table
LOAD_B segment_emit_cursor
STORE32_A_B
LOAD_B segment_count
LOAD32_A_B
LOAD_B segment_emit_remaining
STORE32_A_B
emit_data_segment_next:
LOAD_B segment_emit_remaining
LOAD32_A_B
JZ data_emitted
DEC_A
STORE32_A_B
LOAD_B segment_emit_cursor
LOAD32_A_B
MOV_C_A
MOV_B_C
LOAD32_A_B
CALL emit_u32
MOV_B_C
LOAD_D 4
ADD_B_D
LOAD32_A_B
CALL emit_u16
; Скопировать data_image[address..address+length].
MOV_B_C
LOAD32_A_B
MOV_D_A
MOV_B_C
LOAD_D 4
ADD_B_D
LOAD32_A_B
MOV_D_A
LOAD_B output_cursor
LOAD32_A_B
MOV_C_A
LOAD_B segment_emit_cursor
LOAD32_A_B
MOV_B_A
LOAD32_A_B
LOAD_B data_image
ADD_A_B
MOV_B_A
MEM_COPY
MOV_B_C
ADD_B_D
MOV_A_B
LOAD_B output_cursor
STORE32_A_B
LOAD_B segment_emit_cursor
LOAD32_A_B
MOV_B_A
LOAD_D 8
ADD_B_D
MOV_A_B
LOAD_B segment_emit_cursor
STORE32_A_B
JMP emit_data_segment_next
data_emitted:

; Пропатчить instructionCount в заголовке.
LOAD_B instruction_count
LOAD32_A_B
LOAD_B 98311
STORE16_A_B

; Завершить бинарный объект PCOB v2 вокруг временного PCVM payload.
LOAD_B output_cursor
LOAD32_A_B
LOAD_B output_start
MOV_D_A
LOAD_B output_start
SUB_A_B
LOAD_B token_hash
STORE32_A_B
LOAD_B 1310725
STORE32_A_B

; symbolCount = (symbolCursor-symbolTable)/16.
LOAD_B symbol_cursor
LOAD32_A_B
LOAD_B symbol_table
SUB_A_B
LOAD_B 16
DIV_A_B
LOAD_B 1310729
STORE16_A_B

LOAD_B relocation_count
LOAD32_A_B
LOAD_B 1310731
STORE16_A_B

; Скопировать PCVM payload.
LOAD_B token_hash
LOAD32_A_B
MOV_D_A
LOAD_B object_cursor
LOAD32_A_B
MOV_C_A
LOAD_B output_start
MEM_COPY
MOV_B_C
ADD_B_D
MOV_A_B
LOAD_B object_cursor
STORE32_A_B

; Скопировать symbol table.
LOAD_B symbol_cursor
LOAD32_A_B
LOAD_B symbol_table
SUB_A_B
MOV_D_A
LOAD_B object_cursor
LOAD32_A_B
MOV_C_A
LOAD_B symbol_table
MEM_COPY
MOV_B_C
ADD_B_D
MOV_A_B
LOAD_B object_cursor
STORE32_A_B

; Скопировать relocation table.
LOAD_B relocation_count
LOAD32_A_B
LOAD_B 16
MUL_A_B
MOV_D_A
LOAD_B object_cursor
LOAD32_A_B
MOV_C_A
LOAD_B relocation_table
MEM_COPY
MOV_B_C
ADD_B_D
MOV_A_B
LOAD_B object_cursor
STORE32_A_B

; Записать готовый PCOB.
LOAD_B object_cursor
LOAD32_A_B
LOAD_B object_start
SUB_A_B
LOAD_D object_start
LOAD_B output_name
LOAD_C 5
FS_WRITE
PRINT "Создан a.obj (PCOB v2)"
HALT

; A -> следующий байт выходного буфера.
emit_byte:
MOV_D_A
LOAD_B output_cursor
LOAD32_A_B
MOV_B_A
MOV_A_D
STORE8_A_B
INC_B
MOV_A_B
LOAD_B output_cursor
STORE32_A_B
RET

emit_u16:
MOV_D_A
LOAD_B output_cursor
LOAD32_A_B
MOV_B_A
MOV_A_D
STORE16_A_B
LOAD_D 2
ADD_B_D
MOV_A_B
LOAD_B output_cursor
STORE32_A_B
RET

emit_u32:
MOV_D_A
LOAD_B output_cursor
LOAD32_A_B
MOV_B_A
MOV_A_D
STORE32_A_B
LOAD_D 4
ADD_B_D
MOV_A_B
LOAD_B output_cursor
STORE32_A_B
RET

; A=value, directive_mode=1/2/4.
write_data_value:
LOAD_B token_hash
STORE32_A_B
LOAD_B data_offset
LOAD32_A_B
MOV_B_A
LOAD_D data_image
ADD_B_D
MOV_C_B
LOAD_B directive_mode
LOAD32_A_B
LOAD_D 1
CMP_A_D
JZ write_data_byte
LOAD_D 2
CMP_A_D
JZ write_data_word
MOV_B_C
LOAD_B token_hash
LOAD32_A_B
MOV_B_C
STORE32_A_B
JMP write_data_advance
write_data_word:
MOV_B_C
LOAD_B token_hash
LOAD32_A_B
MOV_B_C
STORE16_A_B
JMP write_data_advance
write_data_byte:
MOV_B_C
LOAD_B token_hash
LOAD32_A_B
MOV_B_C
STORE8_A_B
write_data_advance:
LOAD_B data_offset
LOAD32_A_B
MOV_C_A
LOAD_B directive_mode
LOAD32_A_B
MOV_D_A
MOV_B_C
ADD_B_D
MOV_A_B
LOAD_B data_offset
STORE32_A_B
RET

; data_max уже вычислен первым проходом; точка расширения для sparse segments.
ensure_data_segment:
LOAD_B segment_active
LOAD32_A_B
JNZ ensure_data_segment_done
LOAD_B data_offset
LOAD32_A_B
LOAD_B segment_start
STORE32_A_B
LOAD_A 1
LOAD_B segment_active
STORE32_A_B
ensure_data_segment_done:
RET

finalize_data_segment:
LOAD_B segment_active
LOAD32_A_B
JZ finalize_data_segment_done
LOAD_B data_offset
LOAD32_A_B
MOV_D_A
LOAD_B segment_start
LOAD32_A_B
MOV_B_A
MOV_A_D
SUB_A_B
JZ finalize_data_segment_clear
MOV_D_A
LOAD_B segment_cursor
LOAD32_A_B
MOV_C_A
LOAD_D segment_table_end
CMP_A_D
JZ segment_overflow
MOV_B_C
LOAD_B segment_start
LOAD32_A_B
MOV_B_C
STORE32_A_B
LOAD_D 4
ADD_B_D
MOV_C_B
LOAD_B data_offset
LOAD32_A_B
MOV_D_A
LOAD_B segment_start
LOAD32_A_B
MOV_B_A
MOV_A_D
SUB_A_B
MOV_B_C
STORE32_A_B
LOAD_D 4
ADD_B_D
MOV_A_B
LOAD_B segment_cursor
STORE32_A_B
LOAD_B segment_count
LOAD32_A_B
INC_A
STORE32_A_B
finalize_data_segment_clear:
LOAD_A 0
LOAD_B segment_active
STORE32_A_B
finalize_data_segment_done:
RET

update_data_max:
RET

; Добавить relocation {instruction, operand, type, symbolHash}.
emit_relocation:
LOAD_B relocation_cursor
LOAD32_A_B
LOAD_D relocation_table_end
CMP_A_D
JZ relocation_overflow
LOAD_B instruction_count
LOAD32_A_B
DEC_A
CALL relocation_append
LOAD_B operand_index
LOAD32_A_B
CALL relocation_append
LOAD_B current_opcode
LOAD32_A_B
LOAD_D 27
CMP_A_D
JZ relocation_text
LOAD_D 28
CMP_A_D
JZ relocation_text
LOAD_D 29
CMP_A_D
JZ relocation_text
LOAD_D 30
CMP_A_D
JZ relocation_text
LOAD_A 2
JMP relocation_type_ready
relocation_text:
LOAD_A 1
relocation_type_ready:
CALL relocation_append
LOAD_B token_hash
LOAD32_A_B
CALL relocation_append
LOAD_B relocation_count
LOAD32_A_B
INC_A
STORE32_A_B
RET

relocation_append:
MOV_D_A
LOAD_B relocation_cursor
LOAD32_A_B
MOV_B_A
MOV_A_D
STORE32_A_B
LOAD_D 4
ADD_B_D
MOV_A_B
LOAD_B relocation_cursor
STORE32_A_B
RET

; Если предыдущий token был label, преобразовать его запись в DATA.
; Разрешить аргумент директивы как literal или символ секции CONST (.equ).
; read_directive_symbol уже сохранил operand_start/operand_length.
resolve_directive_value:
LOAD_B operand_length
LOAD32_A_B
MOV_C_A
LOAD_B operand_start
LOAD32_A_B
MOV_B_A
STR_IS_NUMBER
JNZ resolve_directive_numeric

LOAD_B operand_length
LOAD32_A_B
MOV_C_A
LOAD_B operand_start
LOAD32_A_B
MOV_B_A
STR_HASH
LOAD_B token_hash
STORE32_A_B
LOAD_B symbol_table
resolve_directive_lookup:
MOV_C_B
LOAD_A symbol_cursor
MOV_B_A
LOAD32_A_B
MOV_B_C
CMP_A_B
JZ directive_without_value
LOAD32_A_B
MOV_D_A
LOAD_B token_hash
LOAD32_A_B
CMP_A_D
JZ resolve_directive_found
MOV_B_C
LOAD_D 16
ADD_B_D
JMP resolve_directive_lookup

resolve_directive_found:
MOV_B_C
LOAD_D 4
ADD_B_D
LOAD32_A_B
LOAD_D 3
CMP_A_D
JNZ directive_without_value
MOV_B_C
LOAD_D 8
ADD_B_D
LOAD32_A_B
RET

resolve_directive_numeric:
LOAD_B operand_length
LOAD32_A_B
MOV_C_A
LOAD_B operand_start
LOAD32_A_B
MOV_B_A
STR_TO_INT
RET

mark_pending_data:
LOAD_B pending_label
LOAD32_A_B
JZ mark_pending_data_end
LOAD_B last_symbol
LOAD32_A_B
MOV_C_A
MOV_B_C
LOAD_D 4
ADD_B_D
LOAD_A 2
STORE32_A_B
MOV_B_C
LOAD_D 8
ADD_B_D
MOV_C_B
LOAD_B data_offset
LOAD32_A_B
MOV_B_C
STORE32_A_B
LOAD_A 0
LOAD_B pending_label
STORE32_A_B
mark_pending_data_end:
RET

; Прочитать следующий токен директивы, обновить source_cursor и вернуть hash в A.
read_directive_symbol:
LOAD_B source_end
LOAD32_A_B
MOV_C_A
LOAD_B source_cursor
LOAD32_A_B
MOV_B_A
LEX_TOKEN
JZ read_directive_symbol_end
LOAD_B operand_length
STORE32_A_B
MOV_A_D
LOAD_B source_cursor
STORE32_A_B
LOAD_B operand_length
LOAD32_A_B
MOV_C_A
LOAD_B source_cursor
LOAD32_A_B
SUB_A_C
MOV_B_A
MOV_A_B
LOAD_B operand_start
STORE32_A_B
MOV_B_A
STR_HASH
RET

read_directive_symbol_end:
LOAD_A 0
RET

source_error:
PRINT "Ошибка чтения исходника"
HALT

wait_input:
YIELD
JMP read_name

duplicate_symbol:
PRINT "Ошибка: повторное определение символа"
HALT

symbol_overflow:
PRINT "Ошибка: таблица символов переполнена"
HALT

relocation_overflow:
PRINT "Ошибка: таблица relocation переполнена"
HALT

segment_overflow:
PRINT "Ошибка: таблица DATA-сегментов переполнена"
HALT

equ_without_symbol:
PRINT "Ошибка: .equ без имени"
HALT

equ_without_value:
PRINT "Ошибка: .equ без значения"
HALT

directive_without_symbol:
PRINT "Ошибка: директива без имени символа"
HALT

directive_without_value:
PRINT "Ошибка: директива без значения"
HALT

duplicate_import:
PRINT "Ошибка: повторный или конфликтующий import"
HALT

export_imported:
PRINT "Ошибка: импортированный символ нельзя экспортировать"
HALT
