import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/** 画面の上に重ねて出す入力欄。表示するときだけ描画する（{open && <Dialog …/>}） */
export function Dialog({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={e => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={e => {
        // 外側（背景）をクリックしたら閉じる
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-body">
        <header className="dialog-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
