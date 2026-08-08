import React, { createContext, useContext } from 'react';

/**
 * react-markdown v10 removed the `inline` prop from the `code` renderer, so inline
 * code (`like this`) and fenced blocks now arrive identically. Branching on `inline`
 * silently sends every inline snippet down the block path, which renders it on its
 * own line mid-sentence.
 *
 * The `pre` renderer flags its own subtree instead: anything rendered outside a
 * `<pre>` is inline. This is deliberately not a `/language-(\w+)/` className check —
 * that misclassifies fenced blocks written without a language tag.
 */
const InFencedBlock = createContext(false);

/**
 * Builds the `code` + `pre` entries for a ReactMarkdown `components` map.
 * Call at module level — calling it during render creates new component types
 * on every pass and remounts the markdown subtree.
 *
 * @param {string} inlineClassName class applied to inline code
 * @param {string} preClassName    class applied to the fenced-block container
 */
export function createCodeRenderers({ inlineClassName, preClassName }) {
  const Code = ({ node, className, children, ...props }) => {
    const isFenced = useContext(InFencedBlock);

    return isFenced
      ? <code className={className} {...props}>{children}</code>
      : <code className={inlineClassName} {...props}>{children}</code>;
  };

  const Pre = ({ node, children, ...props }) => (
    <InFencedBlock.Provider value={true}>
      <pre className={preClassName} {...props}>{children}</pre>
    </InFencedBlock.Provider>
  );

  return { code: Code, pre: Pre };
}
