import { copyText } from '../clipboard';
import { useToast } from '../Toast';

/** A toolbar button that copies the view's diagram as Mermaid source, with a toast. */
export function CopyMermaidButton({ source }: { source: () => string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn btn-quiet btn-tight"
      title="Copy this diagram as Mermaid source"
      onClick={() => {
        void copyText(source()).then((ok) =>
          toast.show({ message: ok ? 'Mermaid copied' : 'Couldn’t copy to the clipboard' }),
        );
      }}
    >
      Copy Mermaid
    </button>
  );
}
