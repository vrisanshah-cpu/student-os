import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Copilot-style inline autocomplete. The actual Gemini call and debouncing
 * lives in RichTextEditor (it needs access to the app's settings/IPC), this
 * extension only owns the ProseMirror side: painting the gray ghost text as
 * a widget decoration at the cursor, and Tab-to-accept / Escape-to-dismiss.
 *
 * Suggestions are set via a transaction meta (`ghostCompletionKey`, {type:
 * 'set', suggestion, from}) so they're just another transaction the plugin
 * state reduces over - any *other* transaction (typing, clicking elsewhere,
 * undo) clears the suggestion, which is what keeps this safe: a stale
 * suggestion can never be accepted into the wrong place because the moment
 * the doc or selection changes for any other reason, the decoration is gone.
 */
export const ghostCompletionKey = new PluginKey('ghostCompletion');

export const GhostCompletion = Extension.create({
  name: 'ghostCompletion',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: ghostCompletionKey,
        state: {
          init() {
            return { suggestion: null, from: null, decorations: DecorationSet.empty };
          },
          apply(tr, prev) {
            const meta = tr.getMeta(ghostCompletionKey);
            if (meta?.type === 'set' && meta.suggestion) {
              const decorations = DecorationSet.create(tr.doc, [
                Decoration.widget(
                  meta.from,
                  () => {
                    const span = document.createElement('span');
                    span.className = 'ghost-suggestion';
                    span.textContent = meta.suggestion;
                    return span;
                  },
                  { side: 1, ignoreSelection: true }
                )
              ]);
              return { suggestion: meta.suggestion, from: meta.from, decorations };
            }
            if (meta?.type === 'clear') {
              return { suggestion: null, from: null, decorations: DecorationSet.empty };
            }
            if (tr.docChanged || tr.selectionSet) {
              return { suggestion: null, from: null, decorations: DecorationSet.empty };
            }
            return prev;
          }
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations ?? DecorationSet.empty;
          }
        }
      })
    ];
  },

  addKeyboardShortcuts() {
    const accept = () => {
      const { state, view } = this.editor;
      const pluginState = ghostCompletionKey.getState(state);
      if (pluginState?.suggestion && pluginState.from === state.selection.from) {
        const tr = state.tr.insertText(pluginState.suggestion, pluginState.from);
        tr.setMeta(ghostCompletionKey, { type: 'clear' });
        view.dispatch(tr);
        return true;
      }
      return false;
    };
    const dismiss = () => {
      const { state, view } = this.editor;
      const pluginState = ghostCompletionKey.getState(state);
      if (pluginState?.suggestion) {
        view.dispatch(state.tr.setMeta(ghostCompletionKey, { type: 'clear' }));
        return true;
      }
      return false;
    };
    return { Tab: accept, Escape: dismiss };
  }
});

/** Helper for the host component: is a suggestion currently showing at the cursor? */
export function hasActiveSuggestion(editor) {
  if (!editor) return false;
  const pluginState = ghostCompletionKey.getState(editor.state);
  return Boolean(pluginState?.suggestion);
}

/** Helper for the host component: push a freshly-fetched suggestion into the plugin. */
export function setGhostSuggestion(editor, suggestion, atPos) {
  if (!editor || editor.isDestroyed) return;
  // Only apply if the cursor is still exactly where the request was made from -
  // otherwise this is a stale response for text the user has since moved past.
  if (editor.state.selection.from !== atPos) return;
  editor.view.dispatch(editor.state.tr.setMeta(ghostCompletionKey, { type: 'set', suggestion, from: atPos }));
}

export default GhostCompletion;
