import { existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BRAND_ICON_KEYS, ICON_OPTIONS } from '@/lib/linksPage';
import { LinkIcon } from './linkIcons';

describe('company links brand icons', () => {
  it('renders every icon available in the picker', () => {
    for (const option of ICON_OPTIONS) {
      const html = renderToStaticMarkup(createElement(LinkIcon, { name: option.key }));
      expect(html, option.key).not.toBe('');
    }
  });

  it('uses recognizable Google Play and InstaPay assets', () => {
    // in the company's colours it is the four-colour mark; in the page's colours, the plain triangle
    const play = renderToStaticMarkup(createElement(LinkIcon, { name: 'googleplay', brand: true }));
    expect(play).toContain('#EA4335');
    expect(play).toContain('#34A853');
    expect(renderToStaticMarkup(createElement(LinkIcon, { name: 'googleplay' }))).not.toContain('#EA4335');
    const instapay = renderToStaticMarkup(createElement(LinkIcon, { name: 'instapay' }));
    expect(instapay).toContain('/branding/instapay-app.png');
    expect(existsSync(new URL('../../../public/branding/instapay-app.png', import.meta.url))).toBe(true);
  });

  it('draws each company icon in its own colour when asked, and in the page colour otherwise', () => {
    const expected: Record<string, string> = {
      facebook: '#1877F2', youtube: '#FF0000', whatsapp: '#25D366', telegram: '#26A5E4', linkedin: '#0A66C2', x: '#000000', apple: '#000000',
    };
    for (const [key, colour] of Object.entries(expected)) {
      expect(renderToStaticMarkup(createElement(LinkIcon, { name: key, brand: true })), key).toContain(`fill="${colour}"`);
      expect(renderToStaticMarkup(createElement(LinkIcon, { name: key })), key).toContain('fill="currentColor"');
    }
    const insta = renderToStaticMarkup(createElement(LinkIcon, { name: 'instagram', brand: true }));
    expect(insta).toContain('linearGradient');
    expect(insta).toContain('#DD2A7B');
    const tiktok = renderToStaticMarkup(createElement(LinkIcon, { name: 'tiktok', brand: true }));
    expect(tiktok).toContain('#25F4EE');
    expect(tiktok).toContain('#FE2C55');
  });

  it('has a company colour for every icon the page says has one, and none for the plain outline icons', () => {
    for (const key of BRAND_ICON_KEYS) {
      expect(renderToStaticMarkup(createElement(LinkIcon, { name: key, brand: true })), key).not.toBe(renderToStaticMarkup(createElement(LinkIcon, { name: key })));
    }
    for (const key of ['website', 'email', 'store']) {
      expect(renderToStaticMarkup(createElement(LinkIcon, { name: key, brand: true })), key).toBe(renderToStaticMarkup(createElement(LinkIcon, { name: key })));
    }
  });
});
