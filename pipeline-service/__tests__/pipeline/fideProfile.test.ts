import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFideProfileHtml } from '../../src/pipeline/fideProfile.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');

describe('parseFideProfileHtml', () => {
  it('parses a complete FIDE profile page', () => {
    const html = readFileSync(join(fixturesDir, 'fide-profile.html'), 'utf-8');
    const profile = parseFideProfileHtml(html, '1503014');

    expect(profile).not.toBeNull();
    expect(profile!.name).toBe('Carlsen, Magnus');
    expect(profile!.title).toBe('GM');
    expect(profile!.rating).toBe(2830);
    expect(profile!.federation).toBe('Norway');
    expect(profile!.birthYear).toBe('1990');
  });

  it('extracts name from title tag', () => {
    const html = '<html><head><title>Nakamura, Hikaru FIDE Profile</title></head><body></body></html>';
    const profile = parseFideProfileHtml(html, '2016192');
    expect(profile).not.toBeNull();
    expect(profile!.name).toBe('Nakamura, Hikaru');
  });

  it('extracts name from player-title class', () => {
    const html = '<html><body><h1 class="player-title">Firouzja, Alireza</h1></body></html>';
    const profile = parseFideProfileHtml(html, '12573981');
    expect(profile).not.toBeNull();
    expect(profile!.name).toBe('Firouzja, Alireza');
  });

  it('extracts name from old div layout', () => {
    const html = '<html><body><div class="profile-top-title">Caruana, Fabiano</div></body></html>';
    const profile = parseFideProfileHtml(html, '2020009');
    expect(profile).not.toBeNull();
    expect(profile!.name).toBe('Caruana, Fabiano');
  });

  it('returns null when no name found', () => {
    const html = '<html><body><p>No player data</p></body></html>';
    const profile = parseFideProfileHtml(html, '999');
    expect(profile).toBeNull();
  });

  it('extracts title from profile-info-title class', () => {
    const html = `<html><head><title>Test Player FIDE Profile</title></head><body>
      <div class="profile-info-title ">IM</div>
    </body></html>`;
    const profile = parseFideProfileHtml(html, '1');
    expect(profile!.title).toBe('IM');
  });

  it('extracts title from span with class="title"', () => {
    const html = `<html><head><title>Test Player FIDE Profile</title></head><body>
      <span class="title">FM</span>
    </body></html>`;
    const profile = parseFideProfileHtml(html, '1');
    expect(profile!.title).toBe('FM');
  });

  it('rejects invalid titles', () => {
    const html = `<html><head><title>Test Player FIDE Profile</title></head><body>
      <div class="profile-info-title ">XX</div>
    </body></html>`;
    const profile = parseFideProfileHtml(html, '1');
    expect(profile!.title).toBe('');
  });

  it('extracts rating from profile-standart container', () => {
    const html = `<html><head><title>Test FIDE Profile</title></head><body>
      <div class="profile-standart active"><p>2750</p><p>STANDARD</p></div>
    </body></html>`;
    const profile = parseFideProfileHtml(html, '1');
    expect(profile!.rating).toBe(2750);
  });

  it('returns rating 0 when no rating found', () => {
    const html = '<html><head><title>Test FIDE Profile</title></head><body></body></html>';
    const profile = parseFideProfileHtml(html, '1');
    expect(profile!.rating).toBe(0);
  });
});
