import { useStore } from '../lib/store';
import { toastStore } from '../timer/ui';

export function Toast() {
  const toast = useStore(toastStore);
  return (
    <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">
      {toast?.text}
    </div>
  );
}
