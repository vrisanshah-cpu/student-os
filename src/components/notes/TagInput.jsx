import { useEffect, useState } from 'react';
import { X, Tag as TagIcon } from 'lucide-react';
import api from '../../lib/api.js';

export default function TagInput({ entityType, entityId }) {
  const [tags, setTags] = useState([]);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!entityId) return;
    api.getTagsForEntity(entityType, entityId).then(setTags);
  }, [entityType, entityId]);

  async function addTag() {
    const name = value.trim().replace(/^#/, '');
    if (!name) return;
    await api.tagEntity({ tagName: name, entityType, entityId });
    setTags((t) => (t.some((x) => x.name === name) ? t : [...t, { name }]));
    setValue('');
  }

  async function removeTag(name) {
    await api.untagEntity({ tagName: name, entityType, entityId });
    setTags((t) => t.filter((x) => x.name !== name));
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-xs font-medium text-paper-muted">
        <TagIcon size={12} /> Tags
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((t) => (
          <span
            key={t.name}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-accent/30 bg-accent/10 text-accent"
          >
            #{t.name}
            <button onClick={() => removeTag(t.name)} className="hover:text-accent-danger">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && addTag()}
        onBlur={addTag}
        placeholder="Add tag, e.g. AP_Econ"
        className="w-full bg-white/70 border border-paper-rule rounded-md px-2 py-1 text-xs text-paper-ink focus:outline-none focus:border-accent"
      />
    </div>
  );
}
