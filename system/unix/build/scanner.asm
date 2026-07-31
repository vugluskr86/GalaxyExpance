.export main

mode: .zero 4

selected: .zero 4

lock_quality: .zero 4

frequency: .zero 4

bandwidth: .zero 4

bearing: .zero 4

probe_deployed: .zero 4

probe_battery: .zero 4

surface_progress: .zero 4

last_key: .zero 4

running: .zero 4

highlight_y: .zero 4

marker_x: .zero 4

scan_width: .zero 4

main:
  LOAD_A 0
  STORE_A mode
  LOAD_A 5
  STORE_A selected
  LOAD_A 63
  STORE_A lock_quality
  LOAD_A 350
  STORE_A frequency
  LOAD_A 120
  STORE_A bandwidth
  LOAD_A 71
  STORE_A bearing
  LOAD_A 1
  STORE_A probe_deployed
  LOAD_A 87
  STORE_A probe_battery
  LOAD_A 42
  STORE_A surface_progress
  LOAD_A 1
  STORE_A running
  LOAD_A 1
  CALL _sys_tty_mode
  __c_loop0:
  LOAD_M_A running
  LOAD_B 0
  CMP_A_B
  JZ __c_wend1
  CALL draw
  CALL _sys_input_key
  STORE_A last_key
  LOAD_M_A last_key
  LOAD_B 0
  CMP_A_B
  JNZ __c_ne_true4
  LOAD_A 0
  JMP __c_ne_end5
  __c_ne_true4:
  LOAD_A 1
  __c_ne_end5:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif3
  CALL handle_key
  __c_endif3:
  CALL _sys_yield
  JMP __c_loop0
  __c_wend1:
  LOAD_A 0
  CALL _sys_tty_mode
  CALL _sys_tty_clear
  LOAD_A 0
  RET
  ; implicit return
  RET

system_screen:
  LOAD_A 1
  CALL _sys_tty_mode
  CALL _sys_tty_clear
  CALL _sys_gfx_begin
  LOAD_A 9166079
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 2
  LOAD_B 2
  LOAD_C 416
  LOAD_D 416
  CALL _sys_gfx_rect
  LOAD_A 5
  LOAD_B 5
  LOAD_C 410
  LOAD_D 24
  CALL _sys_gfx_rect
  LOAD_A 10
  LOAD_B 11
  LOAD_C __c_str0
  LOAD_D 29
  CALL _sys_gfx_text
  LOAD_A 3898515
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 6
  LOAD_B 34
  LOAD_C 145
  LOAD_D 174
  CALL _sys_gfx_rect
  LOAD_A 156
  LOAD_B 34
  LOAD_C 258
  LOAD_D 174
  CALL _sys_gfx_rect
  LOAD_A 6
  LOAD_B 213
  LOAD_C 408
  LOAD_D 140
  CALL _sys_gfx_rect
  LOAD_A 6
  LOAD_B 358
  LOAD_C 408
  LOAD_D 55
  CALL _sys_gfx_rect
  LOAD_A 12052983
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 11
  LOAD_B 40
  LOAD_C __c_str1
  LOAD_D 18
  CALL _sys_gfx_text
  LOAD_A 161
  LOAD_B 40
  LOAD_C __c_str2
  LOAD_D 31
  CALL _sys_gfx_text
  LOAD_M_B selected
  LOAD_C 14
  MOV_A_B
  MOV_B_C
  MUL_A_B
  MOV_B_A
  STORE_A highlight_y
  LOAD_M_B highlight_y
  LOAD_C 55
  MOV_A_B
  MOV_B_C
  ADD_A_B
  MOV_B_A
  STORE_A highlight_y
  LOAD_A 16765286
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 8
  LOAD_M_B highlight_y
  LOAD_C 138
  LOAD_D 13
  CALL _sys_gfx_rect
  LOAD_A 7784845
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 12
  LOAD_B 58
  LOAD_C __c_str3
  LOAD_D 14
  CALL _sys_gfx_text
  LOAD_A 12
  LOAD_B 72
  LOAD_C __c_str4
  LOAD_D 12
  CALL _sys_gfx_text
  LOAD_A 12
  LOAD_B 86
  LOAD_C __c_str5
  LOAD_D 13
  CALL _sys_gfx_text
  LOAD_A 12
  LOAD_B 100
  LOAD_C __c_str6
  LOAD_D 14
  CALL _sys_gfx_text
  LOAD_A 12
  LOAD_B 114
  LOAD_C __c_str7
  LOAD_D 14
  CALL _sys_gfx_text
  LOAD_A 12
  LOAD_B 128
  LOAD_C __c_str8
  LOAD_D 20
  CALL _sys_gfx_text
  LOAD_A 12
  LOAD_B 142
  LOAD_C __c_str9
  LOAD_D 18
  CALL _sys_gfx_text
  LOAD_A 12
  LOAD_B 156
  LOAD_C __c_str10
  LOAD_D 16
  CALL _sys_gfx_text
  LOAD_A 12
  LOAD_B 170
  LOAD_C __c_str11
  LOAD_D 15
  CALL _sys_gfx_text
  LOAD_A 9166079
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 277
  LOAD_B 52
  LOAD_C __c_str12
  LOAD_D 1
  CALL _sys_gfx_text
  LOAD_A 277
  LOAD_B 186
  LOAD_C __c_str13
  LOAD_D 1
  CALL _sys_gfx_text
  LOAD_A 171
  LOAD_B 119
  LOAD_C __c_str14
  LOAD_D 1
  CALL _sys_gfx_text
  LOAD_A 396
  LOAD_B 119
  LOAD_C __c_str15
  LOAD_D 1
  CALL _sys_gfx_text
  LOAD_A 285
  LOAD_B 68
  LOAD_C 285
  LOAD_D 190
  CALL _sys_gfx_line
  LOAD_A 172
  LOAD_B 125
  LOAD_C 399
  LOAD_D 125
  CALL _sys_gfx_line
  LOAD_A 285
  LOAD_B 125
  LOAD_C 244
  LOAD_D 84
  CALL _sys_gfx_line
  LOAD_A 285
  LOAD_B 125
  LOAD_C 326
  LOAD_D 84
  CALL _sys_gfx_line
  LOAD_A 285
  LOAD_B 125
  LOAD_C 244
  LOAD_D 166
  CALL _sys_gfx_line
  LOAD_A 285
  LOAD_B 125
  LOAD_C 326
  LOAD_D 166
  CALL _sys_gfx_line
  LOAD_A 16765286
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 279
  LOAD_B 119
  LOAD_C 12
  LOAD_D 12
  CALL _sys_gfx_rect
  LOAD_A 12052983
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 11
  LOAD_B 218
  LOAD_C __c_str16
  LOAD_D 31
  CALL _sys_gfx_text
  LOAD_A 215
  LOAD_B 218
  LOAD_C __c_str17
  LOAD_D 12
  CALL _sys_gfx_text
  LOAD_A 16765286
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 298
  LOAD_B 219
  LOAD_C 96
  LOAD_D 7
  CALL _sys_gfx_rect
  LOAD_A 7784845
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 299
  LOAD_B 220
  LOAD_M_A lock_quality
  MOV_C_A
  LOAD_D 5
  CALL _sys_gfx_rect
  LOAD_A 12052983
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 11
  LOAD_B 232
  LOAD_C __c_str18
  LOAD_D 17
  CALL _sys_gfx_text
  LOAD_A 215
  LOAD_B 232
  LOAD_C __c_str19
  LOAD_D 24
  CALL _sys_gfx_text
  LOAD_A 9166079
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 11
  LOAD_B 249
  LOAD_C __c_str20
  LOAD_D 17
  CALL _sys_gfx_text
  LOAD_A 3898515
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 12
  LOAD_B 330
  LOAD_C 402
  LOAD_D 330
  CALL _sys_gfx_line
  LOAD_A 12
  LOAD_B 274
  LOAD_C 402
  LOAD_D 274
  CALL _sys_gfx_line
  LOAD_A 7784845
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 12
  LOAD_B 326
  LOAD_C 28
  LOAD_D 321
  CALL _sys_gfx_line
  LOAD_A 28
  LOAD_B 321
  LOAD_C 44
  LOAD_D 307
  CALL _sys_gfx_line
  LOAD_A 44
  LOAD_B 307
  LOAD_C 60
  LOAD_D 316
  CALL _sys_gfx_line
  LOAD_A 60
  LOAD_B 316
  LOAD_C 76
  LOAD_D 287
  CALL _sys_gfx_line
  LOAD_A 76
  LOAD_B 287
  LOAD_C 92
  LOAD_D 321
  CALL _sys_gfx_line
  LOAD_A 92
  LOAD_B 321
  LOAD_C 108
  LOAD_D 325
  CALL _sys_gfx_line
  LOAD_A 108
  LOAD_B 325
  LOAD_C 124
  LOAD_D 303
  CALL _sys_gfx_line
  LOAD_A 124
  LOAD_B 303
  LOAD_C 140
  LOAD_D 284
  CALL _sys_gfx_line
  LOAD_A 140
  LOAD_B 284
  LOAD_C 156
  LOAD_D 312
  CALL _sys_gfx_line
  LOAD_A 156
  LOAD_B 312
  LOAD_C 172
  LOAD_D 326
  CALL _sys_gfx_line
  LOAD_A 172
  LOAD_B 326
  LOAD_C 188
  LOAD_D 320
  CALL _sys_gfx_line
  LOAD_A 188
  LOAD_B 320
  LOAD_C 204
  LOAD_D 298
  CALL _sys_gfx_line
  LOAD_A 204
  LOAD_B 298
  LOAD_C 220
  LOAD_D 310
  CALL _sys_gfx_line
  LOAD_A 220
  LOAD_B 310
  LOAD_C 236
  LOAD_D 322
  CALL _sys_gfx_line
  LOAD_A 236
  LOAD_B 322
  LOAD_C 252
  LOAD_D 326
  CALL _sys_gfx_line
  LOAD_A 252
  LOAD_B 326
  LOAD_C 268
  LOAD_D 314
  CALL _sys_gfx_line
  LOAD_A 268
  LOAD_B 314
  LOAD_C 284
  LOAD_D 290
  CALL _sys_gfx_line
  LOAD_A 284
  LOAD_B 290
  LOAD_C 300
  LOAD_D 304
  CALL _sys_gfx_line
  LOAD_A 300
  LOAD_B 304
  LOAD_C 316
  LOAD_D 324
  CALL _sys_gfx_line
  LOAD_A 316
  LOAD_B 324
  LOAD_C 402
  LOAD_D 326
  CALL _sys_gfx_line
  LOAD_M_B frequency
  LOAD_C 250
  MOV_A_B
  MOV_B_C
  SUB_A_B
  MOV_B_A
  STORE_A marker_x
  LOAD_M_B marker_x
  LOAD_C 2
  MOV_A_B
  MOV_B_C
  DIV_A_B
  MOV_B_A
  STORE_A marker_x
  LOAD_M_B marker_x
  LOAD_C 12
  MOV_A_B
  MOV_B_C
  ADD_A_B
  MOV_B_A
  STORE_A marker_x
  LOAD_A 16765286
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_M_A marker_x
  LOAD_B 268
  LOAD_C 4
  LOAD_D 62
  CALL _sys_gfx_rect
  LOAD_A 12052983
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 12
  LOAD_B 337
  LOAD_C __c_str21
  LOAD_D 4
  CALL _sys_gfx_text
  LOAD_A 55
  LOAD_B 337
  LOAD_C __c_str22
  LOAD_D 7
  CALL _sys_gfx_text
  LOAD_A 130
  LOAD_B 337
  LOAD_C __c_str23
  LOAD_D 10
  CALL _sys_gfx_text
  LOAD_A 230
  LOAD_B 337
  LOAD_C __c_str24
  LOAD_D 11
  CALL _sys_gfx_text
  LOAD_A 330
  LOAD_B 337
  LOAD_C __c_str25
  LOAD_D 8
  CALL _sys_gfx_text
  LOAD_A 12
  LOAD_B 364
  LOAD_C __c_str26
  LOAD_D 43
  CALL _sys_gfx_text
  LOAD_A 12
  LOAD_B 379
  LOAD_C __c_str27
  LOAD_D 42
  CALL _sys_gfx_text
  LOAD_A 12
  LOAD_B 394
  LOAD_C __c_str28
  LOAD_D 47
  CALL _sys_gfx_text
  LOAD_A 0
  CALL _sys_gfx_frame
  CALL _sys_gfx_end
  ; implicit return
  RET

planet_screen:
  LOAD_A 1
  CALL _sys_tty_mode
  CALL _sys_tty_clear
  CALL _sys_gfx_begin
  LOAD_A 9166079
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 2
  LOAD_B 2
  LOAD_C 416
  LOAD_D 416
  CALL _sys_gfx_rect
  LOAD_A 5
  LOAD_B 5
  LOAD_C 410
  LOAD_D 24
  CALL _sys_gfx_rect
  LOAD_A 10
  LOAD_B 11
  LOAD_C __c_str29
  LOAD_D 47
  CALL _sys_gfx_text
  LOAD_A 3898515
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 6
  LOAD_B 34
  LOAD_C 205
  LOAD_D 214
  CALL _sys_gfx_rect
  LOAD_A 216
  LOAD_B 34
  LOAD_C 198
  LOAD_D 214
  CALL _sys_gfx_rect
  LOAD_A 6
  LOAD_B 253
  LOAD_C 408
  LOAD_D 105
  CALL _sys_gfx_rect
  LOAD_A 6
  LOAD_B 363
  LOAD_C 408
  LOAD_D 50
  CALL _sys_gfx_rect
  LOAD_A 12052983
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 11
  LOAD_B 40
  LOAD_C __c_str30
  LOAD_D 12
  CALL _sys_gfx_text
  LOAD_A 221
  LOAD_B 40
  LOAD_C __c_str31
  LOAD_D 14
  CALL _sys_gfx_text
  LOAD_A 9166079
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 108
  LOAD_B 139
  LOAD_C 62
  LOAD_D 0
  CALL _sys_gfx_circle
  LOAD_A 108
  LOAD_B 139
  LOAD_C 42
  LOAD_D 0
  CALL _sys_gfx_circle
  LOAD_A 28
  LOAD_B 139
  LOAD_C 188
  LOAD_D 139
  CALL _sys_gfx_line
  LOAD_A 108
  LOAD_B 59
  LOAD_C 108
  LOAD_D 219
  CALL _sys_gfx_line
  LOAD_A 16765286
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 151
  LOAD_B 92
  LOAD_C 5
  LOAD_D 5
  CALL _sys_gfx_rect
  LOAD_A 160
  LOAD_B 89
  LOAD_C __c_str32
  LOAD_D 5
  CALL _sys_gfx_text
  LOAD_A 16739179
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 78
  LOAD_B 164
  LOAD_C 6
  LOAD_D 6
  CALL _sys_gfx_rect
  LOAD_A 88
  LOAD_B 161
  LOAD_C __c_str33
  LOAD_D 1
  CALL _sys_gfx_text
  LOAD_A 12052983
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 221
  LOAD_B 58
  LOAD_C __c_str34
  LOAD_D 28
  CALL _sys_gfx_text
  LOAD_A 221
  LOAD_B 75
  LOAD_C __c_str35
  LOAD_D 19
  CALL _sys_gfx_text
  LOAD_A 221
  LOAD_B 92
  LOAD_C __c_str36
  LOAD_D 24
  CALL _sys_gfx_text
  LOAD_A 221
  LOAD_B 109
  LOAD_C __c_str37
  LOAD_D 17
  CALL _sys_gfx_text
  LOAD_A 221
  LOAD_B 126
  LOAD_C __c_str38
  LOAD_D 14
  CALL _sys_gfx_text
  LOAD_A 221
  LOAD_B 143
  LOAD_C __c_str39
  LOAD_D 25
  CALL _sys_gfx_text
  LOAD_A 221
  LOAD_B 160
  LOAD_C __c_str40
  LOAD_D 27
  CALL _sys_gfx_text
  LOAD_A 221
  LOAD_B 184
  LOAD_C __c_str41
  LOAD_D 16
  CALL _sys_gfx_text
  LOAD_A 221
  LOAD_B 201
  LOAD_C __c_str42
  LOAD_D 21
  CALL _sys_gfx_text
  LOAD_A 7784845
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 354
  LOAD_B 202
  LOAD_C 45
  LOAD_D 6
  CALL _sys_gfx_rect
  LOAD_A 16765286
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 355
  LOAD_B 203
  LOAD_M_A probe_battery
  LOAD_B 3
  DIV_A_B
  LOAD_D 4
  CALL _sys_gfx_rect
  LOAD_A 12052983
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 11
  LOAD_B 259
  LOAD_C __c_str43
  LOAD_D 25
  CALL _sys_gfx_text
  LOAD_A 3898515
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 15
  LOAD_B 278
  LOAD_C 390
  LOAD_D 61
  CALL _sys_gfx_rect
  LOAD_A 54
  LOAD_B 278
  LOAD_C 54
  LOAD_D 339
  CALL _sys_gfx_line
  LOAD_A 93
  LOAD_B 278
  LOAD_C 93
  LOAD_D 339
  CALL _sys_gfx_line
  LOAD_A 132
  LOAD_B 278
  LOAD_C 132
  LOAD_D 339
  CALL _sys_gfx_line
  LOAD_A 171
  LOAD_B 278
  LOAD_C 171
  LOAD_D 339
  CALL _sys_gfx_line
  LOAD_A 210
  LOAD_B 278
  LOAD_C 210
  LOAD_D 339
  CALL _sys_gfx_line
  LOAD_A 249
  LOAD_B 278
  LOAD_C 249
  LOAD_D 339
  CALL _sys_gfx_line
  LOAD_A 288
  LOAD_B 278
  LOAD_C 288
  LOAD_D 339
  CALL _sys_gfx_line
  LOAD_A 327
  LOAD_B 278
  LOAD_C 327
  LOAD_D 339
  CALL _sys_gfx_line
  LOAD_A 366
  LOAD_B 278
  LOAD_C 366
  LOAD_D 339
  CALL _sys_gfx_line
  LOAD_M_B surface_progress
  LOAD_C 3
  MOV_A_B
  MOV_B_C
  MUL_A_B
  MOV_B_A
  STORE_A scan_width
  LOAD_A 16765286
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 15
  LOAD_B 342
  LOAD_M_A scan_width
  MOV_C_A
  LOAD_D 3
  CALL _sys_gfx_rect
  LOAD_A 7784845
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 96
  LOAD_B 290
  LOAD_C 28
  LOAD_D 18
  CALL _sys_gfx_rect
  LOAD_A 139
  LOAD_B 306
  LOAD_C 24
  LOAD_D 20
  CALL _sys_gfx_rect
  LOAD_A 272
  LOAD_B 285
  LOAD_C 31
  LOAD_D 21
  CALL _sys_gfx_rect
  LOAD_A 16739179
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 179
  LOAD_B 294
  LOAD_C 8
  LOAD_D 8
  CALL _sys_gfx_rect
  LOAD_A 16765286
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 337
  LOAD_B 314
  LOAD_C 8
  LOAD_D 8
  CALL _sys_gfx_rect
  LOAD_A 12052983
  LOAD_B 132875
  CALL _sys_tty_color
  LOAD_A 11
  LOAD_B 345
  LOAD_C __c_str44
  LOAD_D 57
  CALL _sys_gfx_text
  LOAD_M_A probe_deployed
  LOAD_B 1
  CMP_A_B
  JZ __c_eq_true8
  LOAD_A 0
  JMP __c_eq_end9
  __c_eq_true8:
  LOAD_A 1
  __c_eq_end9:
  LOAD_B 0
  CMP_A_B
  JZ __c_else6
  LOAD_A 221
  LOAD_B 218
  LOAD_C __c_str45
  LOAD_D 22
  CALL _sys_gfx_text
  JMP __c_endif7
  __c_else6:
  LOAD_A 221
  LOAD_B 218
  LOAD_C __c_str46
  LOAD_D 22
  CALL _sys_gfx_text
  __c_endif7:
  LOAD_A 12
  LOAD_B 369
  LOAD_C __c_str47
  LOAD_D 45
  CALL _sys_gfx_text
  LOAD_A 12
  LOAD_B 394
  LOAD_C __c_str48
  LOAD_D 48
  CALL _sys_gfx_text
  LOAD_A 0
  CALL _sys_gfx_frame
  CALL _sys_gfx_end
  ; implicit return
  RET

draw:
  LOAD_M_A mode
  LOAD_B 1
  CMP_A_B
  JZ __c_eq_true12
  LOAD_A 0
  JMP __c_eq_end13
  __c_eq_true12:
  LOAD_A 1
  __c_eq_end13:
  LOAD_B 0
  CMP_A_B
  JZ __c_else10
  CALL planet_screen
  JMP __c_endif11
  __c_else10:
  CALL system_screen
  __c_endif11:
  ; implicit return
  RET

handle_key:
  LOAD_M_A last_key
  LOAD_B 27
  CMP_A_B
  JZ __c_eq_true16
  LOAD_A 0
  JMP __c_eq_end17
  __c_eq_true16:
  LOAD_A 1
  __c_eq_end17:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif15
  LOAD_A 0
  STORE_A running
  LOAD_A 0
  CALL _sys_tty_mode
  CALL _sys_tty_clear
  LOAD_A 0
  CALL _sys_exit
  RET
  __c_endif15:
  LOAD_M_A last_key
  LOAD_B 9
  CMP_A_B
  JZ __c_eq_true20
  LOAD_A 0
  JMP __c_eq_end21
  __c_eq_true20:
  LOAD_A 1
  __c_eq_end21:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif19
  LOAD_M_A mode
  LOAD_B 0
  CMP_A_B
  JZ __c_eq_true24
  LOAD_A 0
  JMP __c_eq_end25
  __c_eq_true24:
  LOAD_A 1
  __c_eq_end25:
  LOAD_B 0
  CMP_A_B
  JZ __c_else22
  LOAD_A 1
  STORE_A mode
  JMP __c_endif23
  __c_else22:
  LOAD_A 0
  STORE_A mode
  __c_endif23:
  RET
  __c_endif19:
  LOAD_M_A mode
  LOAD_B 0
  CMP_A_B
  JZ __c_eq_true28
  LOAD_A 0
  JMP __c_eq_end29
  __c_eq_true28:
  LOAD_A 1
  __c_eq_end29:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif27
  LOAD_M_A last_key
  LOAD_B 13
  CMP_A_B
  JZ __c_eq_true32
  LOAD_A 0
  JMP __c_eq_end33
  __c_eq_true32:
  LOAD_A 1
  __c_eq_end33:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif31
  LOAD_M_A lock_quality
  LOAD_B 95
  SUB_A_B
  LOAD_B 0x80000000
  AND_A_B
  LOAD_A 1
  JNZ __c_lt36
  LOAD_A 0
  __c_lt36:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif35
  LOAD_M_B lock_quality
  LOAD_C 8
  MOV_A_B
  MOV_B_C
  ADD_A_B
  MOV_B_A
  STORE_A lock_quality
  __c_endif35:
  RET
  __c_endif31:
  LOAD_M_A last_key
  LOAD_B 37
  CMP_A_B
  JZ __c_eq_true39
  LOAD_A 0
  JMP __c_eq_end40
  __c_eq_true39:
  LOAD_A 1
  __c_eq_end40:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif38
  LOAD_M_B frequency
  LOAD_C 10
  MOV_A_B
  MOV_B_C
  SUB_A_B
  MOV_B_A
  STORE_A frequency
  RET
  __c_endif38:
  LOAD_M_A last_key
  LOAD_B 39
  CMP_A_B
  JZ __c_eq_true43
  LOAD_A 0
  JMP __c_eq_end44
  __c_eq_true43:
  LOAD_A 1
  __c_eq_end44:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif42
  LOAD_M_B frequency
  LOAD_C 10
  MOV_A_B
  MOV_B_C
  ADD_A_B
  MOV_B_A
  STORE_A frequency
  RET
  __c_endif42:
  LOAD_M_A last_key
  LOAD_B 38
  CMP_A_B
  JZ __c_eq_true47
  LOAD_A 0
  JMP __c_eq_end48
  __c_eq_true47:
  LOAD_A 1
  __c_eq_end48:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif46
  LOAD_M_A selected
  LOAD_B 0
  LOAD_A 1
  LOAD_B 0
  CMP_A_B
  JZ __c_endif50
  LOAD_M_B selected
  LOAD_C 1
  MOV_A_B
  MOV_B_C
  SUB_A_B
  MOV_B_A
  STORE_A selected
  __c_endif50:
  RET
  __c_endif46:
  LOAD_M_A last_key
  LOAD_B 40
  CMP_A_B
  JZ __c_eq_true53
  LOAD_A 0
  JMP __c_eq_end54
  __c_eq_true53:
  LOAD_A 1
  __c_eq_end54:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif52
  LOAD_M_A selected
  LOAD_B 8
  SUB_A_B
  LOAD_B 0x80000000
  AND_A_B
  LOAD_A 1
  JNZ __c_lt57
  LOAD_A 0
  __c_lt57:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif56
  LOAD_M_B selected
  LOAD_C 1
  MOV_A_B
  MOV_B_C
  ADD_A_B
  MOV_B_A
  STORE_A selected
  __c_endif56:
  RET
  __c_endif52:
  RET
  __c_endif27:
  LOAD_M_A last_key
  LOAD_B 68
  CMP_A_B
  JZ __c_eq_true60
  LOAD_A 0
  JMP __c_eq_end61
  __c_eq_true60:
  LOAD_A 1
  __c_eq_end61:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif59
  LOAD_A 1
  STORE_A probe_deployed
  RET
  __c_endif59:
  LOAD_M_A last_key
  LOAD_B 100
  CMP_A_B
  JZ __c_eq_true64
  LOAD_A 0
  JMP __c_eq_end65
  __c_eq_true64:
  LOAD_A 1
  __c_eq_end65:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif63
  LOAD_A 1
  STORE_A probe_deployed
  RET
  __c_endif63:
  LOAD_M_A last_key
  LOAD_B 82
  CMP_A_B
  JZ __c_eq_true68
  LOAD_A 0
  JMP __c_eq_end69
  __c_eq_true68:
  LOAD_A 1
  __c_eq_end69:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif67
  LOAD_A 0
  STORE_A probe_deployed
  RET
  __c_endif67:
  LOAD_M_A last_key
  LOAD_B 114
  CMP_A_B
  JZ __c_eq_true72
  LOAD_A 0
  JMP __c_eq_end73
  __c_eq_true72:
  LOAD_A 1
  __c_eq_end73:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif71
  LOAD_A 0
  STORE_A probe_deployed
  RET
  __c_endif71:
  LOAD_M_A last_key
  LOAD_B 83
  CMP_A_B
  JZ __c_eq_true76
  LOAD_A 0
  JMP __c_eq_end77
  __c_eq_true76:
  LOAD_A 1
  __c_eq_end77:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif75
  LOAD_M_A surface_progress
  LOAD_B 100
  SUB_A_B
  LOAD_B 0x80000000
  AND_A_B
  LOAD_A 1
  JNZ __c_lt80
  LOAD_A 0
  __c_lt80:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif79
  LOAD_M_B surface_progress
  LOAD_C 5
  MOV_A_B
  MOV_B_C
  ADD_A_B
  MOV_B_A
  STORE_A surface_progress
  LOAD_M_B probe_battery
  LOAD_C 1
  MOV_A_B
  MOV_B_C
  SUB_A_B
  MOV_B_A
  STORE_A probe_battery
  __c_endif79:
  RET
  __c_endif75:
  LOAD_M_A last_key
  LOAD_B 115
  CMP_A_B
  JZ __c_eq_true83
  LOAD_A 0
  JMP __c_eq_end84
  __c_eq_true83:
  LOAD_A 1
  __c_eq_end84:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif82
  LOAD_M_A surface_progress
  LOAD_B 100
  SUB_A_B
  LOAD_B 0x80000000
  AND_A_B
  LOAD_A 1
  JNZ __c_lt87
  LOAD_A 0
  __c_lt87:
  LOAD_B 0
  CMP_A_B
  JZ __c_endif86
  LOAD_M_B surface_progress
  LOAD_C 5
  MOV_A_B
  MOV_B_C
  ADD_A_B
  MOV_B_A
  STORE_A surface_progress
  LOAD_M_B probe_battery
  LOAD_C 1
  MOV_A_B
  MOV_B_C
  SUB_A_B
  MOV_B_A
  STORE_A probe_battery
  __c_endif86:
  RET
  __c_endif82:
  ; implicit return
  RET

.DATA
__c_str0: .string "SCANOS v2.4 :: SYSTEM SCANNER"
__c_str1: .string "TARGETS / CONTACTS"
__c_str2: .string "DIRECTIONAL SCAN / ANTENNA VIEW"
__c_str3: .string "[ ] Star KX-19"
__c_str4: .string "[ ] Planet I"
__c_str5: .string "[ ] Planet II"
__c_str6: .string "[ ] Planet III"
__c_str7: .string "[ ] Moon III-a"
__c_str8: .string "[ ] Unknown Signal A"
__c_str9: .string "[ ] Weak Contact B"
__c_str10: .string "[ ] Debris Field"
__c_str11: .string "[ ] Quasar Echo"
__c_str12: .string "N"
__c_str13: .string "S"
__c_str14: .string "W"
__c_str15: .string "E"
__c_str16: .string "ACTIVE TARGET: Unknown Signal A"
__c_str17: .string "SIGNAL LOCK:"
__c_str18: .string "CLASS: unresolved"
__c_str19: .string "RANGE: 2.14 AU  BEARING:"
__c_str20: .string "SPECTRUM ANALYZER"
__c_str21: .string "FREQ"
__c_str22: .string "350 MHz"
__c_str23: .string "BW 120 MHz"
__c_str24: .string "BEAM 42 deg"
__c_str25: .string "POL AUTO"
__c_str26: .string "[Arrows] target/frequency  [Enter] scan/lock"
__c_str27: .string "[W] bandwidth  [B] beam  [P] polarization"
__c_str28: .string "[Tab] planetary survey                 [Esc] exit"
__c_str29: .string "SCANOS v2.4 :: PLANETARY SURVEY / PROBE CONTROL"
__c_str30: .string "ORBITAL VIEW"
__c_str31: .string "PLANETARY DATA"
__c_str32: .string "PROBE"
__c_str33: .string "A"
__c_str34: .string "Planet III / Rocky-Temperate"
__c_str35: .string "Atmosphere: N2 + O2"
__c_str36: .string "Temperature: -12..+18 C"
__c_str37: .string "Pressure: 0.8 atm"
__c_str38: .string "Radiation: LOW"
__c_str39: .string "Minerals: Fe / Ni / Quartz"
__c_str40: .string "Lifeforms: possible microbial"
__c_str41: .string "PROBE Survey Mk1"
__c_str42: .string "Link: STABLE  Battery:"
__c_str43: .string "SURFACE SCAN / SIGNAL MAP"
__c_str44: .string "Findings: A metallic echo   B organic cluster   X safe zone"
__c_str45: .string "PROBE STATUS: DEPLOYED"
__c_str46: .string "PROBE STATUS: RECALLED"
__c_str47: .string "[D] deploy probe  [R] recall  [S] surface scan"
__c_str48: .string "[Tab] system scanner                    [Esc] exit"
