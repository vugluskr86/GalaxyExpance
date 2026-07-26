/** Единая точка ввода: pan-drag, tap, wheel. Маршрутизируется в активную сцену. */
export function attachInput(canvas, handlers){
  let drag = null;
  canvas.addEventListener("pointerdown", e => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x:e.clientX, y:e.clientY, moved:false, state: handlers.onDragStart?.() };
  });
  canvas.addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    const rect = canvas.getBoundingClientRect();
    handlers.onDragMove?.(dx*canvas.width/rect.width, dy*canvas.height/rect.height, drag.state);
  });
  canvas.addEventListener("pointerup", e => {
    if (drag && !drag.moved){
      const rect = canvas.getBoundingClientRect();
      handlers.onTap?.(
        (e.clientX - rect.left)/rect.width*canvas.width,
        (e.clientY - rect.top)/rect.height*canvas.height
      );
    }
    drag = null;
  });
  canvas.addEventListener("pointercancel", () => drag = null);
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    handlers.onWheel?.(
      (e.clientX - rect.left)/rect.width*canvas.width,
      (e.clientY - rect.top)/rect.height*canvas.height,
      e.deltaY
    );
  }, { passive:false });
}
