import { useState, useCallback } from 'react';
import Icon from './Icon';
import { api } from '../../lib/api';
import { toastError } from '../../lib/toast';

/**
 * REACH — TagChecklist.jsx
 *
 * B-21: a row of tappable chips (checkbox-style, multi-select, none
 * required) for logging outcome tags on a contact ("saved", "healed",
 * "form_filled", etc — see backend TagDefinition, config-driven, not
 * hardcoded here).
 *
 * B-22: optimistic UI — toggle instantly client-side, sync in background,
 * roll back with a toast if the API call fails. This has to feel instant;
 * it's used live on the phone mid-call.
 *
 * A-15: chips meet the 44x44 minimum touch target (--tap-min) so they're
 * easy to tap accurately during a live call.
 *
 * Usage:
 *   <TagChecklist
 *     contactId={contact.id}
 *     tagDefinitions={tagDefs}       // from api.listTagDefinitions(), fetched once at the list level
 *     activeTags={contact.tags}      // string[] of tag_code
 *     onChange={(tags) => ...}       // optional — lifted state for parent list/detail views
 *   />
 */
export default function TagChecklist({ contactId, tagDefinitions = [], activeTags = [], onChange, size = 'md' }) {
  const [tags, setTags] = useState(() => new Set(activeTags));
  const [pending, setPending] = useState(() => new Set());

  const toggle = useCallback(async (tagCode) => {
    if (pending.has(tagCode)) return; // ignore rapid double-taps mid-flight

    const wasActive = tags.has(tagCode);
    // Optimistic flip — instant, before the network call resolves.
    setTags(prev => {
      const next = new Set(prev);
      wasActive ? next.delete(tagCode) : next.add(tagCode);
      onChange?.(Array.from(next));
      return next;
    });
    setPending(prev => new Set(prev).add(tagCode));

    try {
      await api.toggleContactTag(contactId, tagCode);
    } catch (err) {
      // B-22: roll back with a toast if the API call fails.
      setTags(prev => {
        const next = new Set(prev);
        wasActive ? next.add(tagCode) : next.delete(tagCode);
        onChange?.(Array.from(next));
        return next;
      });
      toastError(`Couldn't save "${tagCode}" — tap to try again.`);
    } finally {
      setPending(prev => {
        const next = new Set(prev);
        next.delete(tagCode);
        return next;
      });
    }
  }, [contactId, tags, pending, onChange]);

  if (!tagDefinitions.length) return null;

  return (
    <div className={`tag-checklist tag-checklist-${size}`} role="group" aria-label="Outcome tags">
      {tagDefinitions.map((def) => {
        const active = tags.has(def.code);
        return (
          <button
            key={def.code}
            type="button"
            className={`tag-chip${active ? ' active' : ''}`}
            style={active && def.color ? { '--chip-color': def.color } : undefined}
            onClick={() => toggle(def.code)}
            aria-pressed={active}
            disabled={pending.has(def.code)}
          >
            {def.icon && <Icon name={def.icon} size={14} />}
            <span>{def.label}</span>
            {active && <Icon name="check" size={12} className="tag-chip-check" />}
          </button>
        );
      })}
    </div>
  );
}
