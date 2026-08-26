import { useState } from 'react';
import { Plus } from 'lucide-react';

export default function AddRow({ placeholder, onAdd, indent = 0 }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setOpen(false);
      return;
    }
    await onAdd(trimmed);
    setValue('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ paddingLeft: indent }}
        className="flex items-center gap-2 text-xs text-paper-muted hover:text-accent w-full py-1"
      >
        <Plus size={11} /> {placeholder}
      </button>
    );
  }

  return (
    <div style={{ paddingLeft: indent }} className="py-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') {
            setValue('');
            setOpen(false);
          }
        }}
        onBlur={submit}
        placeholder={placeholder}
        className="w-full bg-white/70 border border-accent/50 rounded-md px-2 py-1 text-xs text-paper-ink focus:outline-none"
      />
    </div>
  );
}
