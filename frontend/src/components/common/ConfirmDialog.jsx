import React from 'react';
import { createPortal } from 'react-dom';

export default function ConfirmDialog({
  open, title, message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false,
  onConfirm, onCancel,
}) {
  if (!open) return null;

  // Portalled to <body> — a `backdrop-blur`/`filter` ancestor anywhere in the tree
  // (e.g. the auction status strip) creates a new containing block for `fixed`
  // descendants, which would otherwise confine this overlay to that ancestor's box.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
         onClick={onCancel}>
      <div className="bg-surface border border-white/[0.08] rounded-2xl w-full max-w-sm shadow-2xl p-6"
           onClick={(e) => e.stopPropagation()}>
        <h3 className="text-white font-bold text-base">{title}</h3>
        {message && <p className="text-white/50 text-sm mt-2 leading-relaxed">{message}</p>}

        <div className="flex gap-2 mt-6">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/50
                       border border-white/[0.08] hover:border-white/20 hover:text-white/80 transition">
            {cancelLabel}
          </button>
          <button onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition
              ${danger
                ? 'bg-bid-red text-white hover:brightness-110'
                : 'bg-neon text-black hover:brightness-110'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
