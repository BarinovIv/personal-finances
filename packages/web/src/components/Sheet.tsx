import type { ComponentChildren } from "preact"

/** Выезжающая снизу панель в стиле iOS: подложка закрывает по тапу, сверху «ручка». */
export const Sheet = ({ onClose, children }: { onClose: () => void; children: ComponentChildren }) => (
  <>
    <div class="sheet-backdrop" onClick={onClose} />
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-handle" />
      {children}
    </div>
  </>
)
