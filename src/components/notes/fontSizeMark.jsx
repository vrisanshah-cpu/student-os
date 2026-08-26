import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * A small mark that sets inline font-size via a style attribute. TipTap's
 * bundled extensions don't include one, and pulling in a whole design
 * system for this would be overkill - it's ~30 lines.
 */
export const FontSize = Mark.create({
  name: 'fontSize',

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (el) => el.style.fontSize || null,
        renderHTML: (attrs) => (attrs.size ? { style: `font-size: ${attrs.size}` } : {})
      }
    };
  },

  parseHTML() {
    return [{ style: 'font-size', getAttrs: (value) => ({ size: value }) }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) =>
          chain().setMark(this.name, { size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run()
    };
  }
});

export default FontSize;
