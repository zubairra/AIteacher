'use client';

import { createMathPlugin } from '@streamdown/math';
import { Streamdown, defaultRemarkPlugins } from 'streamdown';
import remarkCjkFriendly from 'remark-cjk-friendly';

import { remarkSelectiveSingleDollarMath } from '@/lib/workbench/markdown-math';

const REMARK_PLUGINS = [
  remarkCjkFriendly,
  remarkSelectiveSingleDollarMath,
  ...Object.values(defaultRemarkPlugins),
];

const PLUGINS = { math: createMathPlugin({ singleDollarTextMath: false }) } as const;

export function TutorMarkdown({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="tutor-prose text-sm leading-6 text-slate-800">
      <Streamdown
        remarkPlugins={REMARK_PLUGINS}
        plugins={PLUGINS}
        remend={{ katex: false }}
        controls={{ table: false }}
        parseIncompleteMarkdown
      >
        {text}
      </Streamdown>
    </div>
  );
}
