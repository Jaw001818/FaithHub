export interface Song {
  title: string;
  artist: string;
  content: string; // ChordPro-like format: "Hello [C]world"
  key: string;
}

export interface LineupItem extends Song {
  id: string;
}

export interface Folder {
  id: string;
  name: string;
  items: LineupItem[];
}

export interface BibleVerse {
  reference: string;
  text: string;
  version: string;
}

export interface SearchResult {
  title: string;
  artist: string;
}

export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function getRootNote(key: string): string {
  const match = key.match(/^([A-G][#b]?)/);
  return match ? match[1] : 'C';
}

export function transposeChord(chord: string, semitones: number): string {
  const chordRegex = /^([A-G][#b]?)(.*)$/;
  const match = chord.match(chordRegex);
  if (!match) return chord;

  const root = match[1];
  const suffix = match[2];

  let index = NOTES.indexOf(root);
  if (index === -1) index = FLATS.indexOf(root);
  if (index === -1) return chord;

  let newIndex = (index + semitones) % 12;
  if (newIndex < 0) newIndex += 12;

  // Prefer sharps for now, or could be smarter about key
  return NOTES[newIndex] + suffix;
}

export function parseChordPro(content: string, transpose: number): { chords: string, lyrics: string }[] {
  const lines = content.split('\n');
  const result: { chords: string, lyrics: string }[] = [];

  lines.forEach(line => {
    let chordLine = "";
    let lyricLine = "";
    let currentPos = 0;

    const regex = /\[([^\]]+)\]/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(line)) !== null) {
      const chord = match[1];
      const transposed = transposeChord(chord, transpose);
      const index = match.index;

      // Add lyrics before this chord
      const textBefore = line.substring(lastIndex, index);
      lyricLine += textBefore;
      
      // Pad chord line to match lyric position
      while (chordLine.length < lyricLine.length) {
        chordLine += " ";
      }
      chordLine += transposed;

      lastIndex = regex.lastIndex;
    }

    // Add remaining lyrics
    lyricLine += line.substring(lastIndex);
    
    result.push({ chords: chordLine, lyrics: lyricLine });
  });

  return result;
}

export const BIBLE_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", 
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", 
  "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", 
  "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", 
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", 
  "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"
];

export const BIBLE_CHAPTER_COUNTS: Record<string, number> = {
  "Genesis": 50, "Exodus": 40, "Leviticus": 27, "Numbers": 36, "Deuteronomy": 34, "Joshua": 24, "Judges": 21, "Ruth": 4, "1 Samuel": 31, "2 Samuel": 24,
  "1 Kings": 22, "2 Kings": 25, "1 Chronicles": 29, "2 Chronicles": 36, "Ezra": 10, "Nehemiah": 13, "Esther": 10, "Job": 42, "Psalms": 150, "Proverbs": 31,
  "Ecclesiastes": 12, "Song of Solomon": 8, "Isaiah": 66, "Jeremiah": 52, "Lamentations": 5, "Ezekiel": 48, "Daniel": 12, "Hosea": 14, "Joel": 3, "Amos": 9,
  "Obadiah": 1, "Jonah": 4, "Micah": 7, "Nahum": 3, "Habakkuk": 3, "Zephaniah": 3, "Haggai": 2, "Zechariah": 14, "Malachi": 4, "Matthew": 28, "Mark": 16,
  "Luke": 24, "John": 21, "Acts": 28, "Romans": 16, "1 Corinthians": 16, "2 Corinthians": 13, "Galatians": 6, "Ephesians": 6, "Philippians": 4, "Colossians": 4,
  "1 Thessalonians": 5, "2 Thessalonians": 3, "1 Timothy": 6, "2 Timothy": 4, "Titus": 3, "Philemon": 1, "Hebrews": 13, "James": 5, "1 Peter": 5, "2 Peter": 3,
  "1 John": 5, "2 John": 1, "3 John": 1, "Jude": 1, "Revelation": 22
};
