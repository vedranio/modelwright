import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/index';
import { expectIssue, fixture } from './helpers';

describe('config.json', () => {
  it('parses the notes fixture', () => {
    const result = parseConfig(fixture('config'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.name).toBe('Notes');
      expect(result.doc.preview.url).toBe('http://localhost:5173');
      expect(result.doc.devices).toBeUndefined();
    }
  });

  it('accepts devices', () => {
    const config = fixture('config');
    config.devices = [{ id: 'tablet', name: 'Tablet', width: 834, height: 1194 }];
    expect(parseConfig(config).ok).toBe(true);
  });

  it('rejects a blank name', () => {
    const config = fixture('config');
    config.name = '   ';
    expectIssue(parseConfig(config), ['name'], /must not be empty/);
  });

  it('keeps the name exactly as written', () => {
    const config = fixture('config');
    config.name = '  Notes  ';
    const result = parseConfig(config);
    expect(result.ok && result.doc.name).toBe('  Notes  ');
  });

  it('rejects a non-positive device width', () => {
    const config = fixture('config');
    config.devices = [{ id: 'bad', name: 'Bad', width: 0 }];
    expectIssue(parseConfig(config), ['devices', 0, 'width']);
  });

  it('rejects duplicate device ids', () => {
    const config = fixture('config');
    config.devices = [
      { id: 'phone', name: 'A', width: 390 },
      { id: 'phone', name: 'B', width: 430 },
    ];
    expectIssue(parseConfig(config), ['devices', 1, 'id'], /Duplicate device id/);
  });

  it('requires a preview block', () => {
    const config = fixture('config');
    delete config.preview;
    expectIssue(parseConfig(config), ['preview']);
  });
});
