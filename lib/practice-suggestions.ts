export type InstrumentType = 
  | 'six_string_guitar'
  | 'six_string_fourths'
  | 'seven_string_guitar'
  | 'seven_string_fourths'
  | 'four_string_bass'
  | 'five_string_bass'
  | 'b_flat_horn'
  | 'e_flat_horn'
  | 'concert_pitch'

export interface PracticeSuggestion {
  id: string
  text: string
  textZh: string
  category: 'technique' | 'theory' | 'ear_training' | 'creativity'
}

export const PRACTICE_SUGGESTIONS: Record<InstrumentType, PracticeSuggestion[]> = {
  six_string_guitar: [
    { id: 'g1', text: 'Practice finding the root note on all 6 strings', textZh: '练习在所有6根弦上找到根音', category: 'technique' },
    { id: 'g2', text: 'Work on your interval recognition starting from the 6th string', textZh: '从第6弦开始练习音程识别', category: 'ear_training' },
    { id: 'g3', text: 'Practice arpeggios starting from different chord tones', textZh: '从不同的和弦音开始练习琶音', category: 'technique' },
    { id: 'g4', text: 'Try playing scales in different positions on the neck', textZh: '尝试在指板不同位置演奏音阶', category: 'technique' },
    { id: 'g5', text: 'Practice voice leading between chord changes', textZh: '练习和弦转换之间的声部连接', category: 'theory' },
    { id: 'g6', text: 'Work on finding chord tones by ear', textZh: '练习通过听力找到和弦音', category: 'ear_training' },
    { id: 'g7', text: 'Practice playing intervals in different octaves', textZh: '练习在不同八度演奏音程', category: 'technique' },
    { id: 'g8', text: 'Try improvising using only chord tones', textZh: '尝试只使用和弦音进行即兴', category: 'creativity' },
    { id: 'g9', text: 'Practice scales with different rhythmic patterns', textZh: '用不同的节奏模式练习音阶', category: 'technique' },
    { id: 'g10', text: 'Work on connecting scale positions across the fretboard', textZh: '练习连接指板上的音阶位置', category: 'technique' },
    { id: 'g11', text: 'Practice finding the 3rd and 7th of each chord', textZh: '练习找到每个和弦的三音和七音', category: 'theory' },
    { id: 'g12', text: 'Try playing melodies by ear and finding them on the fretboard', textZh: '尝试通过听力演奏旋律并在指板上找到它们', category: 'ear_training' },
    { id: 'g13', text: 'Practice the cycle of 5ths with chord tones', textZh: '用和弦音练习五度圈', category: 'theory' },
    { id: 'g14', text: 'Work on your pentatonic vocabulary in all keys', textZh: '练习所有调的五声音阶词汇', category: 'technique' },
    { id: 'g15', text: 'Practice hearing and playing chord progressions', textZh: '练习听辨和演奏和弦进行', category: 'ear_training' },
  ],
  six_string_fourths: [
    { id: 'f1', text: 'Explore the symmetrical patterns of fourths tuning', textZh: '探索四度调弦的对称模式', category: 'theory' },
    { id: 'f2', text: 'Practice scales using consistent finger patterns', textZh: '使用一致的指法模式练习音阶', category: 'technique' },
    { id: 'f3', text: 'Work on chord voicings that take advantage of fourths tuning', textZh: '练习利用四度调弦的和弦指法', category: 'technique' },
    { id: 'f4', text: 'Practice interval recognition across all strings', textZh: '练习所有弦上的音程识别', category: 'ear_training' },
    { id: 'f5', text: 'Try playing the same lick in different positions', textZh: '尝试在不同位置演奏相同的乐句', category: 'technique' },
    { id: 'f6', text: 'Work on visualizing the fretboard symmetrically', textZh: '练习对称地可视化指板', category: 'theory' },
    { id: 'f7', text: 'Practice arpeggios using the consistent string spacing', textZh: '利用一致的弦距练习琶音', category: 'technique' },
    { id: 'f8', text: 'Explore chord melody possibilities', textZh: '探索和弦旋律的可能性', category: 'creativity' },
  ],
  seven_string_guitar: [
    { id: 's1', text: 'Practice finding root notes on the low B string', textZh: '练习在低音B弦上找到根音', category: 'technique' },
    { id: 's2', text: 'Work on integrating the 7th string into your scales', textZh: '练习将第7弦融入音阶', category: 'technique' },
    { id: 's3', text: 'Practice chord voicings using the extended range', textZh: '利用扩展音域练习和弦指法', category: 'technique' },
    { id: 's4', text: 'Work on interval recognition including the low B', textZh: '练习包括低音B在内的音程识别', category: 'ear_training' },
    { id: 's5', text: 'Practice arpeggios starting from the 7th string', textZh: '从第7弦开始练习琶音', category: 'technique' },
    { id: 's6', text: 'Explore the extended range for chord melody', textZh: '探索扩展音域用于和弦旋律', category: 'creativity' },
    { id: 's7', text: 'Work on connecting positions across 7 strings', textZh: '练习连接7根弦的位置', category: 'technique' },
    { id: 's8', text: 'Practice finding chord tones on the extended range', textZh: '练习在扩展音域上找到和弦音', category: 'ear_training' },
  ],
  seven_string_fourths: [
    { id: 'sf1', text: 'Practice scales across all 7 strings with consistent patterns', textZh: '用一致的模式练习所有7根弦的音阶', category: 'technique' },
    { id: 'sf2', text: 'Work on chord voicings using fourths tuning extended range', textZh: '利用四度调弦扩展音域练习和弦指法', category: 'technique' },
    { id: 'sf3', text: 'Explore the symmetry of 7 strings in fourths', textZh: '探索7弦四度调弦的对称性', category: 'theory' },
    { id: 'sf4', text: 'Practice interval recognition across 7 strings', textZh: '练习7根弦上的音程识别', category: 'ear_training' },
    { id: 'sf5', text: 'Work on arpeggios using the extended range', textZh: '利用扩展音域练习琶音', category: 'technique' },
    { id: 'sf6', text: 'Practice voice leading with extended range chords', textZh: '用扩展音域和弦练习声部连接', category: 'theory' },
  ],
  four_string_bass: [
    { id: 'b1', text: 'Practice finding root notes in different positions', textZh: '练习在不同位置找到根音', category: 'technique' },
    { id: 'b2', text: 'Work on walking bass lines using chord tones', textZh: '用和弦音练习行走低音线', category: 'creativity' },
    { id: 'b3', text: 'Practice arpeggios starting from each string', textZh: '从每根弦开始练习琶音', category: 'technique' },
    { id: 'b4', text: 'Work on interval recognition on the bass', textZh: '练习贝斯上的音程识别', category: 'ear_training' },
    { id: 'b5', text: 'Practice scales in one position across all strings', textZh: '在一个位置练习所有弦的音阶', category: 'technique' },
    { id: 'b6', text: 'Work on connecting chord tones smoothly', textZh: '练习平滑连接和弦音', category: 'technique' },
    { id: 'b7', text: 'Practice playing the 3rd and 7th of each chord', textZh: '练习演奏每个和弦的三音和七音', category: 'theory' },
    { id: 'b8', text: 'Work on hearing and playing chord progressions', textZh: '练习听辨和演奏和弦进行', category: 'ear_training' },
    { id: 'b9', text: 'Practice creating bass lines from chord symbols', textZh: '练习从和弦符号创建低音线', category: 'creativity' },
    { id: 'b10', text: 'Work on your time feel with chord tone exercises', textZh: '用和弦音练习时间感', category: 'technique' },
  ],
  five_string_bass: [
    { id: 'b5_1', text: 'Practice finding root notes on the low B string', textZh: '练习在低音B弦上找到根音', category: 'technique' },
    { id: 'b5_2', text: 'Work on integrating the 5th string into your playing', textZh: '练习将第5弦融入演奏', category: 'technique' },
    { id: 'b5_3', text: 'Practice scales across all 5 strings', textZh: '练习所有5根弦的音阶', category: 'technique' },
    { id: 'b5_4', text: 'Work on chord voicings using the extended range', textZh: '利用扩展音域练习和弦指法', category: 'technique' },
    { id: 'b5_5', text: 'Practice arpeggios starting from the low B', textZh: '从低音B开始练习琶音', category: 'technique' },
    { id: 'b5_6', text: 'Work on walking bass lines in lower registers', textZh: '在低音区练习行走低音线', category: 'creativity' },
    { id: 'b5_7', text: 'Practice interval recognition including the low B', textZh: '练习包括低音B在内的音程识别', category: 'ear_training' },
    { id: 'b5_8', text: 'Work on connecting positions across 5 strings', textZh: '练习连接5根弦的位置', category: 'technique' },
  ],
  b_flat_horn: [
    { id: 'h1', text: 'Practice transposing exercises to concert pitch', textZh: '练习将练习转调到音乐会音高', category: 'theory' },
    { id: 'h2', text: 'Work on hearing intervals in Bb transposition', textZh: '练习Bb转调中的音程听辨', category: 'ear_training' },
    { id: 'h3', text: 'Practice scales in all keys with transposition', textZh: '用转调练习所有调的音阶', category: 'technique' },
    { id: 'h4', text: 'Work on chord tone recognition in transposed keys', textZh: '练习转调后的和弦音识别', category: 'ear_training' },
    { id: 'h5', text: 'Practice arpeggios with Bb transposition in mind', textZh: '练习琶音时考虑Bb转调', category: 'technique' },
    { id: 'h6', text: 'Work on sight-reading with transposition', textZh: '练习带转调的视奏', category: 'technique' },
  ],
  e_flat_horn: [
    { id: 'he1', text: 'Practice transposing exercises to concert pitch', textZh: '练习将练习转调到音乐会音高', category: 'theory' },
    { id: 'he2', text: 'Work on hearing intervals in Eb transposition', textZh: '练习Eb转调中的音程听辨', category: 'ear_training' },
    { id: 'he3', text: 'Practice scales in all keys with transposition', textZh: '用转调练习所有调的音阶', category: 'technique' },
    { id: 'he4', text: 'Work on chord tone recognition in transposed keys', textZh: '练习转调后的和弦音识别', category: 'ear_training' },
    { id: 'he5', text: 'Practice arpeggios with Eb transposition in mind', textZh: '练习琶音时考虑Eb转调', category: 'technique' },
    { id: 'he6', text: 'Work on sight-reading with transposition', textZh: '练习带转调的视奏', category: 'technique' },
  ],
  concert_pitch: [
    { id: 'c1', text: 'Practice finding notes across your instrument range', textZh: '练习在乐器音域范围内找到音符', category: 'technique' },
    { id: 'c2', text: 'Work on interval recognition in all registers', textZh: '练习所有音域的音程识别', category: 'ear_training' },
    { id: 'c3', text: 'Practice scales in all keys', textZh: '练习所有调的音阶', category: 'technique' },
    { id: 'c4', text: 'Work on chord tone recognition', textZh: '练习和弦音识别', category: 'ear_training' },
    { id: 'c5', text: 'Practice arpeggios in all keys', textZh: '练习所有调的琶音', category: 'technique' },
    { id: 'c6', text: 'Work on connecting chord tones melodically', textZh: '练习旋律性地连接和弦音', category: 'creativity' },
    { id: 'c7', text: 'Practice hearing and playing chord progressions', textZh: '练习听辨和演奏和弦进行', category: 'ear_training' },
    { id: 'c8', text: 'Work on improvisation using chord tones', textZh: '用和弦音练习即兴', category: 'creativity' },
  ],
}

export function getRandomPracticeSuggestion(instrument: InstrumentType, language: 'zh' | 'en' = 'zh'): PracticeSuggestion {
  const suggestions = PRACTICE_SUGGESTIONS[instrument] || PRACTICE_SUGGESTIONS.concert_pitch
  const randomIndex = Math.floor(Math.random() * suggestions.length)
  return {
    ...suggestions[randomIndex],
    text: language === 'zh' ? suggestions[randomIndex].textZh : suggestions[randomIndex].text,
  }
}

export function getPracticeSuggestionsByCategory(
  instrument: InstrumentType, 
  category: PracticeSuggestion['category'],
  language: 'zh' | 'en' = 'zh'
): PracticeSuggestion[] {
  const suggestions = PRACTICE_SUGGESTIONS[instrument] || PRACTICE_SUGGESTIONS.concert_pitch
  return suggestions
    .filter(s => s.category === category)
    .map(s => ({
      ...s,
      text: language === 'zh' ? s.textZh : s.text,
    }))
}

export const INSTRUMENT_NAMES = {
  zh: {
    six_string_guitar: '六弦吉他',
    six_string_fourths: '六弦吉他(四度调弦)',
    seven_string_guitar: '七弦吉他',
    seven_string_fourths: '七弦吉他(四度调弦)',
    four_string_bass: '四弦贝斯',
    five_string_bass: '五弦贝斯',
    b_flat_horn: '降B调管乐器',
    e_flat_horn: '降E调管乐器',
    concert_pitch: '音乐会音高乐器',
  },
  en: {
    six_string_guitar: '6-String Guitar',
    six_string_fourths: '6-String Guitar (Fourths Tuning)',
    seven_string_guitar: '7-String Guitar',
    seven_string_fourths: '7-String Guitar (Fourths Tuning)',
    four_string_bass: '4-String Bass',
    five_string_bass: '5-String Bass',
    b_flat_horn: 'Bb Horn',
    e_flat_horn: 'Eb Horn',
    concert_pitch: 'Concert Pitch Instrument',
  },
}
