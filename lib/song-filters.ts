// 乐曲选择辅助函数（从 app/page.tsx 抽出，逻辑未改动）

import type { SONG_PROGRESSIONS } from "@/lib/page-songs"

type Song = (typeof SONG_PROGRESSIONS)[number]

export function getSongGroupKey(song: Song, sortBy: string): string {
    switch(sortBy){
        case 'title-asc':
        case 'title-desc':
            // 按标题首字母分组
            const firstChar = song.name.charAt(0).toUpperCase();
            if (/[\u4e00-\u9fff]/.test(song.name)) return '中文';
            if (/^[0-9]/.test(song.name)) return '#';
            return firstChar;
        case 'style-asc':
        case 'style-desc':
            // 按风格分组
            return song.style || '其他';
        case 'composer-asc':
        case 'composer-desc':
            // 按作曲家分组
            // ⚠️ 中文判断必须用「原值」：若拿兜底后的 '未知' 去匹配 CJK，'未知' 两个字本身
            //    就是中文，缺作曲家的歌会被误归到「中文」组，而不是「未知」组。
            const composer = (song.composer || '').trim();
            if (/[\u4e00-\u9fff]/.test(composer)) return '中文';
            if (/^[0-9]/.test(composer)) return '#';
            if (composer) return composer.charAt(0).toUpperCase();
            return '未知';
        case 'year-asc':
        case 'year-desc':
            // 按年代分组（每十年一组）
            const year = parseInt(song.year) || 0;
            if (year === 0) return '未知';
            const decade = Math.floor(year / 10) * 10;
            return `${decade}s`;
        default:
            return '其他';
    }
}
export function sortSongs(songs: typeof SONG_PROGRESSIONS, sortBy: string): typeof SONG_PROGRESSIONS {
    const sorted = [
        ...songs
    ];
    switch(sortBy){
        case 'title-asc':
            return sorted.sort((a, b)=>{
                // 定义分组优先级：数字 < 字母 < 中文
                const getPriority = (text: string) => {
                    if (/[\u4e00-\u9fff]/.test(text)) return 3;
                    if (/^[0-9]/.test(text)) return 1;
                    return 2;
                };
                const aPriority = getPriority(a.name);
                const bPriority = getPriority(b.name);
                if (aPriority !== bPriority) return aPriority - bPriority;
                return a.name.localeCompare(b.name, 'zh-CN');
            });
        case 'title-desc':
            return sorted.sort((a, b)=>{
                const getPriority = (text: string) => {
                    if (/[\u4e00-\u9fff]/.test(text)) return 3;
                    if (/^[0-9]/.test(text)) return 1;
                    return 2;
                };
                const aPriority = getPriority(a.name);
                const bPriority = getPriority(b.name);
                if (aPriority !== bPriority) return aPriority - bPriority;
                return b.name.localeCompare(a.name, 'zh-CN');
            });
        case 'style-asc':
            return sorted.sort((a, b)=>{
                const styleCompare = (a.style || '').localeCompare(b.style || '', 'zh-CN');
                if (styleCompare !== 0) return styleCompare;
                return a.name.localeCompare(b.name, 'zh-CN');
            });
        case 'style-desc':
            return sorted.sort((a, b)=>{
                const styleCompare = (b.style || '').localeCompare(a.style || '', 'zh-CN');
                if (styleCompare !== 0) return styleCompare;
                return a.name.localeCompare(b.name, 'zh-CN');
            });
        case 'composer-asc':
            return sorted.sort((a, b)=>{
                const composerCompare = (a.composer || '').localeCompare(b.composer || '', 'zh-CN');
                if (composerCompare !== 0) return composerCompare;
                return a.name.localeCompare(b.name, 'zh-CN');
            });
        case 'composer-desc':
            return sorted.sort((a, b)=>{
                const composerCompare = (b.composer || '').localeCompare(a.composer || '', 'zh-CN');
                if (composerCompare !== 0) return composerCompare;
                return a.name.localeCompare(b.name, 'zh-CN');
            });
        case 'year-asc':
            return sorted.sort((a, b)=>{
                const yearA = parseInt(a.year) || 0;
                const yearB = parseInt(b.year) || 0;
                if (yearA !== yearB) return yearA - yearB;
                return a.name.localeCompare(b.name, 'zh-CN');
            });
        case 'year-desc':
            return sorted.sort((a, b)=>{
                const yearA = parseInt(a.year) || 0;
                const yearB = parseInt(b.year) || 0;
                if (yearA !== yearB) return yearB - yearA;
                return a.name.localeCompare(b.name, 'zh-CN');
            });
        default:
            return sorted;
    }
}
export function filterAndGroupSongs(
  songs: typeof SONG_PROGRESSIONS,
  searchQuery: string,
  sortBy: string
): { group: string; songs: typeof SONG_PROGRESSIONS }[] {
    // 先过滤
    let filtered = songs;
    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        filtered = songs.filter((song)=>song.name.toLowerCase().includes(query) || song.style && song.style.toLowerCase().includes(query) || song.composer && song.composer.toLowerCase().includes(query) || song.year && song.year.includes(query));
    }
    // 再排序
    const sorted = sortSongs(filtered, sortBy);
    // 最后分组
    const groups: { group: string; songs: typeof SONG_PROGRESSIONS }[] = [];
    let currentGroup = '';
    let currentSongs: typeof SONG_PROGRESSIONS = [];
    sorted.forEach((song)=>{
        const groupKey = getSongGroupKey(song, sortBy);
        if (groupKey !== currentGroup) {
            if (currentSongs.length > 0) {
                groups.push({
                    group: currentGroup,
                    songs: currentSongs
                });
            }
            currentGroup = groupKey;
            currentSongs = [
                song
            ];
        } else {
            currentSongs.push(song);
        }
    });
    if (currentSongs.length > 0) {
        groups.push({
            group: currentGroup,
            songs: currentSongs
        });
    }
    return groups;
}
