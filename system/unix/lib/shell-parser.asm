; Bounded shell syntax scanner. It records AST node kinds before execution.
.export shell_parse_line
.export shell_parse_flags
.export shell_next_segment
.export shell_segment_pipe

SHELL_NODE_SEQUENCE: .equ 1
SHELL_NODE_PIPELINE: .equ 2
SHELL_NODE_INPUT: .equ 4
SHELL_NODE_OUTPUT: .equ 8
SHELL_NODE_APPEND: .equ 16
SHELL_NODE_COMMENT: .equ 32
SHELL_NODE_QUOTED: .equ 64

.org 14500
shell_parse_ptr: .dword 0
shell_parse_bytes: .dword 0
shell_parse_index: .dword 0
shell_parse_quote: .dword 0
shell_parse_flags: .dword 0
shell_parse_flag: .dword 0
shell_parse_char: .dword 0
shell_segment_start: .dword 0
shell_segment_next: .dword 0
shell_segment_len: .dword 0
shell_parser_segment_ptr: .dword 0
shell_segment_pipe: .dword 0

; B=line, C=bytes. Returns AST flags in A. Quotes/backslash suppress operators.
shell_parse_line:
MOV_A_B
LOAD_B shell_parse_ptr
STORE32_A_B
MOV_A_C
LOAD_B shell_parse_bytes
STORE32_A_B
LOAD_A 0
LOAD_B shell_parse_index
STORE32_A_B
LOAD_B shell_parse_quote
STORE32_A_B
LOAD_B shell_parse_flags
STORE32_A_B
shell_parse_loop:
LOAD_B shell_parse_index
LOAD32_A_B
PUSH_A
LOAD_B shell_parse_bytes
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ shell_parse_done
PUSH_A
LOAD_B shell_parse_ptr
LOAD32_A_B
MOV_B_A
POP_A
MOV_D_A
ADD_B_D
LOAD8_A_B
LOAD_B shell_parse_char
STORE32_A_B
LOAD_D 92
CMP_A_D
JZ shell_parse_escape
LOAD_D 34
CMP_A_D
JZ shell_parse_toggle_quote
LOAD_B shell_parse_quote
LOAD32_A_B
JNZ shell_parse_next
LOAD_B shell_parse_char
LOAD32_A_B
LOAD_D 35
CMP_A_D
JZ shell_parse_comment
LOAD_D 59
CMP_A_D
JZ shell_parse_sequence
LOAD_D 124
CMP_A_D
JZ shell_parse_pipeline
LOAD_D 60
CMP_A_D
JZ shell_parse_input
LOAD_D 62
CMP_A_D
JZ shell_parse_output
JMP shell_parse_next
shell_parse_escape:
LOAD_B shell_parse_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP shell_parse_next
shell_parse_toggle_quote:
LOAD_B shell_parse_quote
LOAD32_A_B
JZ shell_parse_quote_on
LOAD_A 0
LOAD_B shell_parse_quote
STORE32_A_B
JMP shell_parse_next
shell_parse_quote_on:
LOAD_A 1
LOAD_B shell_parse_quote
STORE32_A_B
LOAD_D SHELL_NODE_QUOTED
CALL shell_parse_add_flag
JMP shell_parse_next
shell_parse_comment:
LOAD_D SHELL_NODE_COMMENT
CALL shell_parse_add_flag
JMP shell_parse_done
shell_parse_sequence:
LOAD_D SHELL_NODE_SEQUENCE
CALL shell_parse_add_flag
JMP shell_parse_next
shell_parse_pipeline:
LOAD_D SHELL_NODE_PIPELINE
CALL shell_parse_add_flag
JMP shell_parse_next
shell_parse_input:
LOAD_D SHELL_NODE_INPUT
CALL shell_parse_add_flag
JMP shell_parse_next
shell_parse_output:
LOAD_D SHELL_NODE_OUTPUT
CALL shell_parse_add_flag
; A second adjacent '>' is represented by APPEND during execution parsing.
LOAD_B shell_parse_index
LOAD32_A_B
INC_A
PUSH_A
LOAD_B shell_parse_bytes
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ shell_parse_next
PUSH_A
LOAD_B shell_parse_ptr
LOAD32_A_B
MOV_B_A
POP_A
MOV_D_A
ADD_B_D
LOAD8_A_B
LOAD_D 62
CMP_A_D
JNZ shell_parse_next
LOAD_D SHELL_NODE_APPEND
CALL shell_parse_add_flag
shell_parse_next:
LOAD_B shell_parse_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP shell_parse_loop
shell_parse_done:
LOAD_B shell_parse_flags
LOAD32_A_B
RET
shell_parse_add_flag:
MOV_A_D
LOAD_B shell_parse_flag
STORE32_A_B
LOAD_B shell_parse_flags
LOAD32_A_B
PUSH_A
LOAD_B shell_parse_flag
LOAD32_A_B
MOV_B_A
POP_A
OR_A_B
LOAD_B shell_parse_flags
STORE32_A_B
RET

; B=line, C=bytes, D=starting offset.
; Returns B=segment pointer, A=segment bytes and D=next offset, or D=-1 after
; the last segment. Semicolons/comments inside double quotes are data.
shell_next_segment:
MOV_A_B
LOAD_B shell_parse_ptr
STORE32_A_B
MOV_A_C
LOAD_B shell_parse_bytes
STORE32_A_B
MOV_A_D
LOAD_B shell_parse_index
STORE32_A_B
LOAD_B shell_segment_start
STORE32_A_B
LOAD_A 0
LOAD_B shell_parse_quote
STORE32_A_B
LOAD_B shell_segment_pipe
STORE32_A_B
shell_segment_scan:
LOAD_B shell_parse_index
LOAD32_A_B
MOV_D_A
LOAD_B shell_parse_bytes
LOAD32_A_B
CMP_A_D
JZ shell_segment_end
LOAD_B shell_parse_ptr
LOAD32_A_B
MOV_B_A
ADD_B_D
LOAD8_A_B
LOAD_D 92
CMP_A_D
JZ shell_segment_escape
LOAD_D 34
CMP_A_D
JZ shell_segment_quote
LOAD_B shell_parse_quote
LOAD32_A_B
JNZ shell_segment_advance
LOAD_B shell_parse_ptr
LOAD32_A_B
PUSH_A
LOAD_B shell_parse_index
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
ADD_B_D
LOAD8_A_B
LOAD_D 35
CMP_A_D
JZ shell_segment_comment
LOAD_D 59
CMP_A_D
JZ shell_segment_separator
LOAD_D 124
CMP_A_D
JZ shell_segment_pipe_separator
JMP shell_segment_advance
shell_segment_escape:
LOAD_B shell_parse_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP shell_segment_advance
shell_segment_quote:
LOAD_B shell_parse_quote
LOAD32_A_B
JZ shell_segment_quote_on
LOAD_A 0
LOAD_B shell_parse_quote
STORE32_A_B
JMP shell_segment_advance
shell_segment_quote_on:
LOAD_A 1
LOAD_B shell_parse_quote
STORE32_A_B
shell_segment_advance:
LOAD_B shell_parse_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP shell_segment_scan
shell_segment_separator:
LOAD_B shell_parse_index
LOAD32_A_B
INC_A
MOV_D_A
JMP shell_segment_return
shell_segment_pipe_separator:
LOAD_A 1
LOAD_B shell_segment_pipe
STORE32_A_B
LOAD_B shell_parse_index
LOAD32_A_B
INC_A
MOV_D_A
JMP shell_segment_return
shell_segment_comment:
LOAD_D -1
JMP shell_segment_return
shell_segment_end:
LOAD_D -1
shell_segment_return:
MOV_A_D
LOAD_B shell_segment_next
STORE32_A_B
LOAD_B shell_parse_index
LOAD32_A_B
PUSH_A
LOAD_B shell_segment_start
LOAD32_A_B
MOV_B_A
POP_A
SUB_A_B
LOAD_B shell_segment_len
STORE32_A_B
LOAD_B shell_parse_ptr
LOAD32_A_B
PUSH_A
LOAD_B shell_segment_start
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
ADD_B_D
MOV_A_B
LOAD_B shell_parser_segment_ptr
STORE32_A_B
LOAD_B shell_segment_len
LOAD32_A_B
PUSH_A
LOAD_B shell_segment_next
LOAD32_A_B
MOV_D_A
POP_A
PUSH_A
LOAD_B shell_parser_segment_ptr
LOAD32_A_B
MOV_B_A
POP_A
RET
