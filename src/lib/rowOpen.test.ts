import { describe, expect, it } from 'vitest';
import { shouldOpenRow } from './rowOpen';

// vitest runs in node here, so the elements are stand-ins that answer `closest` the way a DOM element does.
class FakeElement {
  constructor(private readonly insideControl: boolean) {}
  closest() {
    return this.insideControl ? ({} as Element) : null;
  }
}
(globalThis as { Element?: unknown }).Element = FakeElement;

describe('shouldOpenRow', () => {
  it('opens on a plain cell', () => {
    expect(shouldOpenRow(new FakeElement(false) as unknown as Element, '')).toBe(true);
  });
  it('does not open when the click landed on a control inside the row', () => {
    expect(shouldOpenRow(new FakeElement(true) as unknown as Element, '')).toBe(false);
  });
  it('does not open while text is selected', () => {
    expect(shouldOpenRow(new FakeElement(false) as unknown as Element, '01234')).toBe(false);
  });
  it('a click with no element target (the document) does open, nothing to protect', () => {
    expect(shouldOpenRow(null, '')).toBe(true);
  });
});
