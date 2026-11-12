import { existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ICON_OPTIONS } from '@/lib/linksPage';
import { LinkIcon } from './linkIcons';

describe('company links brand icons', () => {
  it('renders every icon available in the picker', () => {
    for (const option of ICON_OPTIONS) {
      const html = renderToStaticMarkup(createElement(LinkIcon, { name: option.key }));
      expect(html, option.key).not.toBe('');
    }
  });

  it('uses recognizable Google Play and InstaPay assets', () => {
    const play = renderToStaticMarkup(createElement(LinkIcon, { name: 'googleplay' }));
    expect(play).toContain('#EA4335');
    expect(play).toContain('#34A853');
    const instapay = renderToStaticMarkup(createElement(LinkIcon, { name: 'instapay' }));
    expect(instapay).toContain('/branding/instapay-app.png');
    expect(existsSync(new URL('../../../public/branding/instapay-app.png', import.meta.url))).toBe(true);
  });
});
