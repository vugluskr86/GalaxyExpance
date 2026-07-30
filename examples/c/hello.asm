.export main

main:
  LOAD_A Hello from C!
  PUSH_A
  POP_A
  CALL puts
  POP_B
  LOAD_A 0
  RET
  ; implicit return
  RET

__c_str0: .string "Hello from C!"
