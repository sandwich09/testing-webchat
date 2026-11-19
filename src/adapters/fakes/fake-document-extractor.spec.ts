import { describe, expect, it } from 'vitest';
import { FakeDocumentExtractor, interpretExtractedText } from './fake-document-extractor';
import { describeDocumentExtractorSuite } from './suites/document-extractor.suite';

describeDocumentExtractorSuite(() => {
  const extractor = new FakeDocumentExtractor();
  return {
    extractor,
    arrange: (scenario) => {
      switch (scenario.kind) {
        case 'extract_text':
          extractor.enqueueText(scenario.modelText);
          break;
        case 'extract_refused':
          extractor.enqueueRefusal();
          break;
        case 'extract_truncated':
          extractor.enqueueTruncated();
          break;
        case 'extract_error':
          extractor.enqueueError(scenario.code);
          break;
        case 'count_tokens_error':
          extractor.enqueueCountTokensError(scenario.code);
          break;
      }
      return Promise.resolve();
    },
  };
});

describe('FakeDocumentExtractor test controls', () => {
  it('records both kinds of request and copies the pdf', async () => {
    const extractor = new FakeDocumentExtractor().enqueueText('x');
    const pdf = Uint8Array.from([1, 2, 3]);
    await extractor.extract({ model: 'claude-opus-5-5', pdf, maxTokens: 10 });
    pdf[0] = 99;
    await extractor.countTokens('claude-opus-5-5', 'abc');
    expect(extractor.extractRequests[0]?.pdf).toEqual(Uint8Array.from([1, 2, 3]));
    expect(extractor.countTokensRequests).toEqual([{ model: 'claude-opus-5-5', text: 'abc' }]);
  });

  it('counts tokens with the replaceable counter', async () => {
    const extractor = new FakeDocumentExtractor();
    expect(await extractor.countTokens('claude-opus-5-5', 'abcdefgh')).toEqual({
      ok: true,
      value: 2,
    });
    extractor.tokenCounter = () => 7;
    expect(await extractor.countTokens('claude-opus-5-5', 'abcdefgh')).toEqual({
      ok: true,
      value: 7,
    });
  });

  it('throws when nothing is queued', async () => {
    await expect(
      new FakeDocumentExtractor().extract({
        model: 'claude-opus-5-5',
        pdf: new Uint8Array(),
        maxTokens: 1,
      }),
    ).rejects.toThrow('no result enqueued');
  });

  it('interprets text per ai-prompt 7.3', () => {
    expect(interpretExtractedText('=== หน้า 1 ===\nA\n=== หน้า 2 ===\nB')).toEqual({
      text: '=== หน้า 1 ===\nA\n=== หน้า 2 ===\nB',
      pageCount: 2,
    });
    expect(interpretExtractedText('  EMPTY_DOCUMENT\n')).toEqual({ text: null, pageCount: null });
  });
});
