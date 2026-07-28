; Self-hosted colon-separated user database and password primitives.
; The password hash is deliberately game-grade: FNV-1a(salt || password),
; followed by 1024 FNV-1a rounds over the little-endian u32 state.
.export userdb_find
.export userdb_field
.export password_hash
.export password_compare_constant
.export password_format_hex8

.org 8400
ud_buffer: .dword 0
ud_bytes: .dword 0
ud_name: .dword 0
ud_name_bytes: .dword 0
ud_index: .dword 0
ud_line: .dword 0
ud_match: .dword 0
ud_target: .dword 0
ud_field_no: .dword 0
ud_field_start: .dword 0
ud_char: .dword 0
pw_ptr: .dword 0
pw_bytes: .dword 0
pw_salt: .dword 0
pw_round: .dword 0
pw_state: .dword 0
pw_left: .dword 0
pw_right: .dword 0
pw_compare_bytes: .dword 0
pw_diff: .dword 0
pw_format_value: .dword 0
pw_format_ptr: .dword 0
pw_format_index: .dword 0
pw_format_quotient: .dword 0
pw_mix: .zero 264

; B=database, C=database bytes, D=username, A=username bytes.
; Returns A=record start or -1. Empty/malformed records are skipped.
userdb_find:
PUSH_A
MOV_A_D
PUSH_A
MOV_A_C
PUSH_A
MOV_A_B
PUSH_A
; Preserve original username length below the register captures.
; Stack: name_len, username_ptr, database_bytes, database_ptr.
POP_A
LOAD_B ud_buffer
STORE32_A_B
POP_A
LOAD_B ud_bytes
STORE32_A_B
POP_A
LOAD_B ud_name
STORE32_A_B
POP_A
LOAD_B ud_name_bytes
STORE32_A_B
LOAD_A 0
LOAD_B ud_index
STORE32_A_B
LOAD_B ud_line
STORE32_A_B
LOAD_B ud_match
STORE32_A_B
userdb_find_loop:
LOAD_B ud_index
LOAD32_A_B
PUSH_A
LOAD_B ud_bytes
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ userdb_find_missing
; char = buffer[index]
PUSH_A
LOAD_B ud_buffer
LOAD32_A_B
MOV_B_A
POP_A
MOV_D_A
ADD_B_D
LOAD8_A_B
LOAD_B ud_char
STORE32_A_B
LOAD_D 58
CMP_A_D
JZ userdb_find_colon
LOAD_D 10
CMP_A_D
JZ userdb_find_newline
; Compare a username byte while still inside the first field.
LOAD_B ud_match
LOAD32_A_B
PUSH_A
LOAD_B ud_name_bytes
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ userdb_find_skip_line
PUSH_A
LOAD_B ud_name
LOAD32_A_B
MOV_B_A
POP_A
MOV_D_A
ADD_B_D
LOAD8_A_B
PUSH_A
LOAD_B ud_char
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JNZ userdb_find_skip_line
LOAD_B ud_match
LOAD32_A_B
INC_A
STORE32_A_B
JMP userdb_find_next
userdb_find_colon:
LOAD_B ud_match
LOAD32_A_B
PUSH_A
LOAD_B ud_name_bytes
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JNZ userdb_find_skip_line
LOAD_B ud_buffer
LOAD32_A_B
PUSH_A
LOAD_B ud_line
LOAD32_A_B
MOV_B_A
POP_A
ADD_A_B
RET
userdb_find_skip_line:
LOAD_B ud_index
LOAD32_A_B
INC_A
STORE32_A_B
userdb_find_skip_loop:
LOAD_B ud_index
LOAD32_A_B
PUSH_A
LOAD_B ud_bytes
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ userdb_find_missing
PUSH_A
LOAD_B ud_buffer
LOAD32_A_B
MOV_B_A
POP_A
MOV_D_A
ADD_B_D
LOAD8_A_B
LOAD_D 10
CMP_A_D
JZ userdb_find_newline
LOAD_B ud_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP userdb_find_skip_loop
userdb_find_newline:
LOAD_B ud_index
LOAD32_A_B
INC_A
STORE32_A_B
LOAD_B ud_line
STORE32_A_B
LOAD_A 0
LOAD_B ud_match
STORE32_A_B
JMP userdb_find_loop
userdb_find_next:
LOAD_B ud_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP userdb_find_loop
userdb_find_missing:
LOAD_A -1
RET

; B=record start, C=maximum record bytes, D=zero-based field number.
; Returns A=field pointer and C=field length, or A=-1 for malformed input.
userdb_field:
MOV_A_B
PUSH_A
MOV_A_C
PUSH_A
MOV_A_D
PUSH_A
POP_A
LOAD_B ud_target
STORE32_A_B
POP_A
LOAD_B ud_bytes
STORE32_A_B
POP_A
LOAD_B ud_buffer
STORE32_A_B
LOAD_A 0
LOAD_B ud_index
STORE32_A_B
LOAD_B ud_field_no
STORE32_A_B
LOAD_B ud_field_start
STORE32_A_B
userdb_field_loop:
LOAD_B ud_index
LOAD32_A_B
PUSH_A
LOAD_B ud_bytes
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ userdb_field_end
PUSH_A
LOAD_B ud_buffer
LOAD32_A_B
MOV_B_A
POP_A
MOV_D_A
ADD_B_D
LOAD8_A_B
LOAD_B ud_char
STORE32_A_B
LOAD_D 58
CMP_A_D
JZ userdb_field_separator
LOAD_D 10
CMP_A_D
JZ userdb_field_end
LOAD_B ud_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP userdb_field_loop
userdb_field_separator:
CALL userdb_field_maybe_return
LOAD_D -1
CMP_A_D
JNZ userdb_field_return
LOAD_B ud_field_no
LOAD32_A_B
INC_A
STORE32_A_B
LOAD_B ud_index
LOAD32_A_B
INC_A
STORE32_A_B
LOAD_B ud_field_start
STORE32_A_B
JMP userdb_field_loop
userdb_field_end:
CALL userdb_field_maybe_return
LOAD_D -1
CMP_A_D
JNZ userdb_field_return
LOAD_A -1
RET
userdb_field_return:
RET
userdb_field_maybe_return:
LOAD_B ud_field_no
LOAD32_A_B
PUSH_A
LOAD_B ud_target
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JNZ userdb_field_not_target
LOAD_B ud_index
LOAD32_A_B
PUSH_A
LOAD_B ud_field_start
LOAD32_A_B
MOV_D_A
POP_A
SUB_A_D
MOV_C_A
LOAD_B ud_buffer
LOAD32_A_B
PUSH_A
LOAD_B ud_field_start
LOAD32_A_B
MOV_B_A
POP_A
ADD_A_B
RET
userdb_field_not_target:
LOAD_A -1
RET

; B=password, C=password bytes (maximum 255), D=salt pointer (8 bytes).
password_hash:
MOV_A_B
PUSH_A
MOV_A_C
PUSH_A
MOV_A_D
PUSH_A
POP_A
LOAD_B pw_salt
STORE32_A_B
POP_A
LOAD_B pw_bytes
STORE32_A_B
POP_A
LOAD_B pw_ptr
STORE32_A_B
; pw_mix = salt[8] || password.
LOAD_B pw_salt
LOAD32_A_B
MOV_B_A
LOAD_C pw_mix
LOAD_D 8
MEM_COPY
LOAD_B pw_ptr
LOAD32_A_B
PUSH_A
LOAD_B pw_mix
LOAD_D 8
ADD_B_D
MOV_C_B
LOAD_B pw_bytes
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
MEM_COPY
LOAD_B pw_mix
PUSH_A
LOAD_B pw_bytes
LOAD32_A_B
LOAD_B 8
ADD_A_B
MOV_C_A
POP_A
LOAD_B pw_mix
STR_HASH
LOAD_B pw_state
STORE32_A_B
LOAD_A 0
LOAD_B pw_round
STORE32_A_B
password_hash_round:
LOAD_B pw_round
LOAD32_A_B
LOAD_D 1024
CMP_A_D
JZ password_hash_done
LOAD_B pw_state
LOAD_C 4
STR_HASH
LOAD_B pw_state
STORE32_A_B
LOAD_B pw_round
LOAD32_A_B
INC_A
STORE32_A_B
JMP password_hash_round
password_hash_done:
LOAD_B pw_state
LOAD32_A_B
RET

; B=left, C=right, D=length. Always visits exactly length bytes.
password_compare_constant:
MOV_A_B
PUSH_A
MOV_A_C
PUSH_A
MOV_A_D
PUSH_A
POP_A
LOAD_B pw_compare_bytes
STORE32_A_B
POP_A
LOAD_B pw_right
STORE32_A_B
POP_A
LOAD_B pw_left
STORE32_A_B
LOAD_A 0
LOAD_B ud_index
STORE32_A_B
LOAD_B pw_diff
STORE32_A_B
password_compare_loop:
LOAD_B ud_index
LOAD32_A_B
PUSH_A
LOAD_B pw_compare_bytes
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ password_compare_done
PUSH_A
LOAD_B pw_left
LOAD32_A_B
MOV_B_A
POP_A
MOV_D_A
ADD_B_D
LOAD8_A_B
PUSH_A
LOAD_B pw_right
LOAD32_A_B
PUSH_A
LOAD_B ud_index
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
ADD_B_D
LOAD8_A_B
MOV_B_A
POP_A
XOR_A_B
PUSH_A
LOAD_B pw_diff
LOAD32_A_B
MOV_B_A
POP_A
OR_A_B
LOAD_B pw_diff
STORE32_A_B
LOAD_B ud_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP password_compare_loop
password_compare_done:
LOAD_B pw_diff
LOAD32_A_B
JZ password_compare_equal
LOAD_A 0
RET
password_compare_equal:
LOAD_A 1
RET

; A=u32 value, B=output. Writes exactly eight lowercase hexadecimal digits.
password_format_hex8:
PUSH_A
MOV_A_B
LOAD_B pw_format_ptr
STORE32_A_B
POP_A
LOAD_B pw_format_value
STORE32_A_B
LOAD_A 7
LOAD_B pw_format_index
STORE32_A_B
password_format_loop:
LOAD_B pw_format_value
LOAD32_A_B
PUSH_A
LOAD_B 16
DIV_A_B
LOAD_B pw_format_quotient
STORE32_A_B
LOAD_B 16
MUL_A_B
MOV_D_A
POP_A
SUB_A_D
LOAD_D 10
CMP_A_D
JNZ password_format_decimal
; CMP only exposes equality; values 10..15 are selected explicitly.
LOAD_A 97
JMP password_format_store
password_format_decimal:
LOAD_D 11
CMP_A_D
JNZ password_format_decimal_2
LOAD_A 98
JMP password_format_store
password_format_decimal_2:
LOAD_D 12
CMP_A_D
JNZ password_format_decimal_3
LOAD_A 99
JMP password_format_store
password_format_decimal_3:
LOAD_D 13
CMP_A_D
JNZ password_format_decimal_4
LOAD_A 100
JMP password_format_store
password_format_decimal_4:
LOAD_D 14
CMP_A_D
JNZ password_format_decimal_5
LOAD_A 101
JMP password_format_store
password_format_decimal_5:
LOAD_D 15
CMP_A_D
JNZ password_format_digit
LOAD_A 102
JMP password_format_store
password_format_digit:
LOAD_B 48
ADD_A_B
password_format_store:
PUSH_A
LOAD_B pw_format_ptr
LOAD32_A_B
PUSH_A
LOAD_B pw_format_index
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
ADD_B_D
POP_A
STORE8_A_B
LOAD_B pw_format_quotient
LOAD32_A_B
LOAD_B pw_format_value
STORE32_A_B
LOAD_B pw_format_index
LOAD32_A_B
JZ password_format_done
DEC_A
STORE32_A_B
JMP password_format_loop
password_format_done:
LOAD_A 8
RET
