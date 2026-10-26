// The prompt invariant (docs/PRD-build-9.md §1), held at the machine level: the question stored
// with an answer is the one on screen when she finished, and it cannot change once she has
// started. Each mode machine owns its prompt; REROLL is accepted only while nothing has been
// answered; the answer it hands over carries that prompt; the book machine saves exactly that.
//
// Everything that touches a device is mocked: prompts come out as Q1, Q2, Q3, …

import { createActor, waitFor } from 'xstate';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let picks = 0;
vi.mock('@/lib/prompts', () => ({ pickPrompt: vi.fn(() => `Q${++picks}`) }));
vi.mock('@/lib/telemetry', () => ({
  captureError: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  traced: vi.fn((_name: string, _data: unknown, fn: () => unknown) => fn()),
}));
vi.mock('@/lib/sounds', () => ({ micOpen: vi.fn(), play: vi.fn(), effectsAudioMode: {} }));
vi.mock('@/lib/recording', () => ({ writeRecordingMarker: vi.fn(async () => {}), clearRecordingMarker: vi.fn() }));
vi.mock('@/lib/images', () => ({ takePhoto: vi.fn() }));
vi.mock('@/lib/machines/unicorn', () => ({ setUnicornPose: vi.fn() }));
vi.mock('@/lib/actions', () => ({
  addTextEntry: vi.fn(async () => {}),
  addDrawingEntry: vi.fn(async () => {}),
  addAudioEntry: vi.fn(async () => {}),
  addPhotoEntry: vi.fn(async () => {}),
  setDrawnCover: vi.fn(async () => {}),
  rateBook: vi.fn(async () => {}),
}));
vi.mock('expo-audio', () => ({
  AudioModule: { requestRecordingPermissionsAsync: vi.fn(async () => ({ granted: true, status: 'granted' })) },
  setAudioModeAsync: vi.fn(async () => {}),
}));

import { addAudioEntry, addDrawingEntry, addTextEntry, setDrawnCover } from '@/lib/actions';
import { bookMachine } from '@/lib/machines/book';
import { canReroll as canRerollDrawing, drawingMachine, drawnAnswer } from '@/lib/machines/drawing';
import { canReroll as canRerollRecorder, recorderMachine, spokenAnswer } from '@/lib/machines/recorder';
import { canReroll as canRerollWriter, writerMachine, writtenAnswer } from '@/lib/machines/writer';
import { writeRecordingMarker } from '@/lib/recording';

beforeEach(() => {
  picks = 0;
  vi.clearAllMocks();
});

describe('writer', () => {
  it('rerolls only while blank, and hands over the question on screen at done', () => {
    const writer = createActor(writerMachine, { input: { bookId: 'b1' } }).start();
    writer.send({ type: 'START' });
    expect(writer.getSnapshot().context.prompt).toBe('Q1');
    expect(canRerollWriter(writer.getSnapshot())).toBe(true);

    writer.send({ type: 'REROLL' });
    expect(writer.getSnapshot().context.prompt).toBe('Q2');

    writer.send({ type: 'SET_TEXT', text: 'H' });
    expect(canRerollWriter(writer.getSnapshot())).toBe(false);
    writer.send({ type: 'REROLL' });
    expect(writer.getSnapshot().context.prompt).toBe('Q2');

    writer.send({ type: 'SET_TEXT', text: '' });
    expect(canRerollWriter(writer.getSnapshot())).toBe(true);
    writer.send({ type: 'REROLL' });
    expect(writer.getSnapshot().context.prompt).toBe('Q3');

    writer.send({ type: 'SET_TEXT', text: 'HEJ ' });
    writer.send({ type: 'DONE' });
    expect(writer.getSnapshot().matches('done')).toBe(true);
    expect(writtenAnswer(writer.getSnapshot())).toEqual({ text: 'HEJ', prompt: 'Q3' });

    writer.send({ type: 'RESET' });
    writer.send({ type: 'START' });
    expect(writer.getSnapshot().context).toMatchObject({ text: '', prompt: 'Q4' });
  });
});

describe('drawing', () => {
  const capture = vi.fn(async () => 'file:///drawing.png');

  it('rerolls only while the canvas is blank, and hands over the question with the picture', async () => {
    const drawing = createActor(drawingMachine, { input: { capture } }).start();
    drawing.send({ type: 'START', cover: false });
    expect(drawing.getSnapshot().context.prompt).toBe('Q1');
    drawing.send({ type: 'REROLL' });
    expect(drawing.getSnapshot().context.prompt).toBe('Q2');

    // A finger on the canvas already locks the wand, before the stroke is finished.
    drawing.send({ type: 'BEGIN' });
    expect(canRerollDrawing(drawing.getSnapshot())).toBe(false);
    drawing.send({ type: 'STROKE', stroke: { color: '#000', d: 'M 0 0 L 1 1' } });
    expect(canRerollDrawing(drawing.getSnapshot())).toBe(false);
    drawing.send({ type: 'REROLL' });
    expect(drawing.getSnapshot().context.prompt).toBe('Q2');

    drawing.send({ type: 'UNDO' });
    expect(canRerollDrawing(drawing.getSnapshot())).toBe(true);
    drawing.send({ type: 'REROLL' });
    expect(drawing.getSnapshot().context.prompt).toBe('Q3');

    drawing.send({ type: 'STROKE', stroke: { color: '#000', d: 'M 0 0 L 2 2' } });
    drawing.send({ type: 'DONE' });
    const done = await waitFor(drawing, (s) => s.matches('done'));
    expect(drawnAnswer(done)).toEqual({ uri: 'file:///drawing.png', prompt: 'Q3' });
  });

  it('has no question for a cover, so there is nothing to reroll', () => {
    const drawing = createActor(drawingMachine, { input: { capture } }).start();
    drawing.send({ type: 'START', cover: true });
    expect(drawing.getSnapshot().context.prompt).toBeNull();
    expect(canRerollDrawing(drawing.getSnapshot())).toBe(false);
    drawing.send({ type: 'DONE' });
    expect(drawnAnswer(drawing.getSnapshot())).toEqual({ uri: null, prompt: null });
  });
});

describe('recorder', () => {
  const recorder = {
    isRecording: true,
    uri: 'file:///voice.m4a',
    record: vi.fn(),
    prepareToRecordAsync: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
  };

  it('rerolls only before the press, and the marker and the answer carry that question', async () => {
    const actor = createActor(recorderMachine, { input: { bookId: 'b1', recorder: recorder as never } }).start();
    expect(canRerollRecorder(actor.getSnapshot())).toBe(false);
    actor.send({ type: 'OPEN' });
    expect(actor.getSnapshot().context.prompt).toBe('Q1');
    actor.send({ type: 'REROLL' });
    expect(actor.getSnapshot().context.prompt).toBe('Q2');

    actor.send({ type: 'RECORD' });
    expect(canRerollRecorder(actor.getSnapshot())).toBe(false);
    actor.send({ type: 'REROLL' });
    await waitFor(actor, (s) => s.matches('recording'));
    expect(writeRecordingMarker).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'b1', uri: 'file:///voice.m4a', prompt: 'Q2' }));

    actor.send({ type: 'STOP' });
    const done = await waitFor(actor, (s) => s.matches('done'));
    expect(spokenAnswer(done)).toMatchObject({ uri: 'file:///voice.m4a', prompt: 'Q2' });

    // Closing and reopening is a new question; closing before the press forgets the old one.
    actor.send({ type: 'RESET' });
    actor.send({ type: 'OPEN' });
    expect(actor.getSnapshot().context.prompt).toBe('Q3');
    actor.send({ type: 'CLOSE' });
    expect(actor.getSnapshot().context.prompt).toBeNull();
  });
});

describe('book', () => {
  it('saves each answer with the question it came with, and nothing when there is nothing', async () => {
    const book = createActor(bookMachine, { input: { bookId: 'b1' } }).start();

    book.send({ type: 'START_WRITING' });
    book.send({ type: 'WRITING_DONE', text: 'HEJ', prompt: 'Q7' });
    await waitFor(book, (s) => s.matches('idle'));
    expect(addTextEntry).toHaveBeenCalledWith('b1', 'HEJ', 'Q7');

    book.send({ type: 'START_WRITING' });
    book.send({ type: 'WRITING_DONE', text: '', prompt: 'Q8' });
    await waitFor(book, (s) => s.matches('idle'));
    expect(addTextEntry).toHaveBeenCalledTimes(1);

    book.send({ type: 'START_DRAWING' });
    book.send({ type: 'DRAWING_DONE', uri: 'file:///d.png', prompt: 'Q9' });
    await waitFor(book, (s) => s.matches('idle'));
    expect(addDrawingEntry).toHaveBeenCalledWith('b1', 'file:///d.png', 'Q9');

    book.send({ type: 'DRAW_COVER' });
    book.send({ type: 'DRAWING_DONE', uri: 'file:///c.png', prompt: null });
    await waitFor(book, (s) => s.matches('idle'));
    expect(setDrawnCover).toHaveBeenCalledWith('b1', 'file:///c.png');
    expect(addDrawingEntry).toHaveBeenCalledTimes(1);

    book.send({ type: 'START_RECORDING' });
    book.send({ type: 'RECORDING_DONE', uri: 'file:///v.m4a', durationMs: 1200, prompt: 'Q10' });
    await waitFor(book, (s) => s.matches('idle'));
    expect(addAudioEntry).toHaveBeenCalledWith('b1', 'file:///v.m4a', 1200, 'Q10');
  });

  it('cannot be asked to save without the question (a compile-time rule, checked by tsc)', () => {
    const book = createActor(bookMachine, { input: { bookId: 'b1' } });
    // @ts-expect-error WRITING_DONE requires the prompt it was answered under.
    const forgotten = { type: 'WRITING_DONE', text: 'HEJ' } satisfies Parameters<typeof book.send>[0];
    expect(forgotten.type).toBe('WRITING_DONE');
  });
});
