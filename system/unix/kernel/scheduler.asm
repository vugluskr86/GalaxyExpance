; Round-robin hook. TIMER lifecycle/accounting is completed in Stage 3.
.export scheduler_init
.export timer_handler
.import process_account_tick

scheduler_init:
PRINT "PCOS kernel: scheduler hook ready"
RET

timer_handler:
CALL process_account_tick
IRET
