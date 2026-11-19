'use client';

import { useEffect, type RefObject } from 'react';

/** The audio element playing now, shared by every player of the page: one plays at a time. */
let playing: HTMLAudioElement | null = null;

/** Pauses any other player when this one starts, and forgets it when it unmounts. */
export function useOnlyOnePlaying(ref: RefObject<HTMLAudioElement | null>): void {
  useEffect(() => {
    const audio = ref.current;
    if (audio === null) return;
    const onPlay = () => {
      if (playing !== null && playing !== audio) playing.pause();
      playing = audio;
    };
    audio.addEventListener('play', onPlay);
    return () => {
      audio.removeEventListener('play', onPlay);
      if (playing === audio) playing = null;
    };
  }, [ref]);
}
