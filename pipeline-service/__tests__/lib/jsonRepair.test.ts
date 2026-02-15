import { describe, it, expect } from 'vitest';
import { repairJson, parseLLMJson } from '../../src/lib/jsonRepair.js';

describe('repairJson', () => {
  it('strips markdown code fences', () => {
    const input = '```json\n{"fideId": 1503014}\n```';
    const result = repairJson(input);
    expect(JSON.parse(result)).toEqual({ fideId: 1503014 });
  });

  it('closes unclosed strings', () => {
    const input = '{"name": "Magnus Carlsen';
    const result = repairJson(input);
    expect(JSON.parse(result)).toEqual({ name: 'Magnus Carlsen' });
  });

  it('closes unclosed braces', () => {
    const input = '{"fideId": 1503014, "uscfId": null';
    const result = repairJson(input);
    expect(JSON.parse(result)).toEqual({ fideId: 1503014, uscfId: null });
  });

  it('closes unclosed brackets and braces', () => {
    const input = '{"candidates": ["magnus", "carlsen';
    const result = repairJson(input);
    expect(JSON.parse(result)).toEqual({ candidates: ['magnus', 'carlsen'] });
  });

  it('removes trailing commas', () => {
    const input = '{"a": 1, "b": 2,}';
    const result = repairJson(input);
    expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
  });

  it('handles already valid JSON', () => {
    const input = '{"fideId": 1503014}';
    const result = repairJson(input);
    expect(JSON.parse(result)).toEqual({ fideId: 1503014 });
  });

  it('extracts JSON from surrounding text', () => {
    const input = 'Here is the result: {"fideId": 42} hope this helps';
    const result = repairJson(input);
    // After extracting from {, it closes properly
    expect(result).toContain('"fideId": 42');
  });
});

describe('parseLLMJson', () => {
  it('parses valid JSON', () => {
    expect(parseLLMJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it('parses markdown-wrapped JSON', () => {
    expect(parseLLMJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('returns null for empty input', () => {
    expect(parseLLMJson('')).toBeNull();
    expect(parseLLMJson('   ')).toBeNull();
  });

  it('returns null for completely invalid input', () => {
    expect(parseLLMJson('not json at all')).toBeNull();
  });

  it('handles trailing commas', () => {
    expect(parseLLMJson('{"a": [1, 2,], "b": 3,}')).toEqual({ a: [1, 2], b: 3 });
  });
});
