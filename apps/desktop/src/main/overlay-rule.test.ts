import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every full-viewport overlay must position itself with `.ajn-overlay`.
 *
 * The app header is layered ABOVE overlays on purpose — locking must stay one
 * click away even with a form open. So anything an overlay draws in the header
 * band is not merely overlapped, it is UNCLICKABLE: the header swallows the
 * pointer. Close buttons live at exactly that top edge.
 *
 * Three components had each hand-rolled `fixed inset-0`, and each had to
 * remember the header exists. The photo viewer did not: its entire toolbar —
 * zoom in, zoom out, reset, ✕ — sat at y=0 and was dead at every window size,
 * with only Escape left to close it. The modal's ✕ went the same way on a
 * screen smaller than a developer's.
 *
 * A grep is a blunt instrument, but the failure it prevents is invisible in
 * every unit test (no layout engine) and in every developer's manual pass (big
 * screen). The next person to write `fixed inset-0` should be told why not.
 *
 * It lives outside `renderer/` because the renderer is unprivileged and may not
 * import `node:fs` — a rule worth more than the tidiness of co-location.
 */

const RENDERER = path.join(__dirname, '..', 'renderer');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return entry.endsWith('.tsx') && !entry.endsWith('.test.tsx') ? [full] : [];
  });
}

describe('full-viewport overlays', () => {
  it('never hand-roll `fixed inset-0` — they use .ajn-overlay, which clears the header', () => {
    const offenders = tsxFiles(RENDERER)
      .filter((file) => /fixed\s+inset-0/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(RENDERER, file));

    expect(offenders).toEqual([]);
  });

  it('the three overlays that exist all carry the class', () => {
    // Named explicitly so deleting the class from one of them fails here
    // rather than silently reintroducing an unclickable close button.
    for (const file of [
      'components/Modal.tsx',
      'photos/PhotoViewer.tsx',
      'consultations/ProgressCharts.tsx',
    ]) {
      expect(readFileSync(path.join(RENDERER, file), 'utf8')).toContain('ajn-overlay');
    }
  });
});
