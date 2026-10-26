// Hand-written knowledge about DataTool modes and flags: friendlier names,
// grouping and help. Everything here is optional: modes and flags a new
// DataTool release adds still appear, just with DataTool's own wording.

export interface Category {
  id: string;
  label: string;
  description: string;
}

export const CATEGORIES: Category[] = [
  { id: 'heroes', label: 'Heroes & cosmetics', description: 'Skins, weapons, emotes, poses, intros, hero art' },
  { id: 'collectibles', label: 'Collectibles', description: 'Sprays, player icons, name cards, charms, souvenirs' },
  { id: 'audio', label: 'Voice & audio', description: 'Voice lines, conversations, music, sound banks' },
  { id: 'maps', label: 'Maps & world', description: 'Maps for Blender, environments, objectives, loot boxes' },
  { id: 'ui', label: 'UI, images & video', description: 'UI art, vector images, game mode art, cinematics' },
  { id: 'data', label: 'Game data', description: 'Lists of heroes, unlocks, maps, strings and more' },
  { id: 'other', label: 'Other', description: 'Modes added in newer DataTool builds' },
];

export interface ModeExtra {
  label?: string;
  category?: string;
  help?: string;
  /** DataTool does nothing without a query for this mode. */
  queryRequired?: boolean;
  /** Placeholder shown in the query box. */
  queryPlaceholder?: string;
  /** Example queries offered as one-click chips. */
  examples?: string[];
  positionals?: { label: string; placeholder: string; help: string; required: boolean };
  /** Highlight these flag sections first (e.g. sound options for voice modes). */
  sections?: string[];
  /** Folder DataTool creates inside the output folder. */
  outputFolder?: string;
}

export const MODE_EXTRAS: Record<string, ModeExtra> = {
  // --- Heroes & cosmetics ---------------------------------------------------
  'extract-unlocks': {
    label: 'Hero cosmetics',
    category: 'heroes',
    help: 'Skins (models, textures, animations), weapon skins, emotes, victory poses, highlight intros, sprays, icons, voice lines and more, per hero. Use the query to pick heroes and items; "*" means everything (very slow).',
    queryRequired: true,
    queryPlaceholder: 'Tracer|skin=Overwatch Classic',
    examples: ['Tracer|skin=Overwatch Classic', '*|skin=*', 'Reaper|spray=*', 'Reinhardt|emote=*', 'Mercy|skin=(rarity=legendary)'],
    sections: ['models', 'textures'],
    outputFolder: 'Heroes',
  },
  'extract-npcs': {
    label: 'NPCs',
    category: 'heroes',
    help: 'Models and skins of non-playable characters (training bots, story and event characters).',
    queryRequired: true,
    queryPlaceholder: 'Training Bot (16B)',
    examples: ['*'],
    sections: ['models', 'textures'],
    outputFolder: 'NPCs',
  },
  'extract-hero-icons': { label: 'Hero portraits & icons', category: 'heroes', help: 'Hero GUI images: portraits, icons and selection art.', sections: ['textures'] },
  'extract-abilities': { label: 'Abilities', category: 'heroes', help: 'Ability icons and preview videos for every hero.', sections: ['textures'], outputFolder: 'Abilities' },
  'extract-talents': { label: 'Talents & perks', category: 'heroes', help: 'Talent and perk icons.', sections: ['textures'], outputFolder: 'Talents' },
  'extract-general': { label: 'General unlocks', category: 'heroes', help: 'Unlocks that belong to no single hero: shared sprays, player icons, portraits and more.', outputFolder: 'General' },

  // --- Collectibles -----------------------------------------------------------
  'extract-sprays': { label: 'Sprays', category: 'collectibles', help: 'Every spray, or only the named ones.', queryPlaceholder: 'Spray name (empty = all)', sections: ['textures'] },
  'extract-player-icons': { label: 'Player icons', category: 'collectibles', help: 'Every player icon, or only the named ones.', queryPlaceholder: 'Icon name (empty = all)', sections: ['textures'] },
  'extract-name-cards': { label: 'Name cards', category: 'collectibles', help: 'Every name card, or only the named ones.', queryPlaceholder: 'Name card (empty = all)', sections: ['textures'] },
  'extract-charms': { label: 'Weapon charms', category: 'collectibles', help: 'Every weapon charm (models and textures), or only the named ones.', queryPlaceholder: 'Charm name (empty = all)', sections: ['models'] },
  'extract-souvenirs': { label: 'Souvenirs', category: 'collectibles', help: 'Every souvenir (models and animations), or only the named ones.', queryPlaceholder: 'Souvenir name (empty = all)', sections: ['models'] },

  // --- Audio ------------------------------------------------------------------
  'extract-hero-voice': {
    label: 'Hero voice lines',
    category: 'audio',
    help: 'All voice lines of the chosen heroes, grouped by hero and voice line type. "*" extracts every hero.',
    queryRequired: true,
    queryPlaceholder: 'Tracer',
    examples: ['Tracer', '*'],
    sections: ['sound'],
  },
  'extract-conversations': {
    label: 'Hero conversations',
    category: 'audio',
    help: 'Back-and-forth conversations between heroes, saved in order. Leave the query empty for every hero.',
    queryPlaceholder: 'Hero name (empty = all)',
    sections: ['sound'],
    outputFolder: 'HeroConvo',
  },
  'extract-npc-voice': { label: 'NPC voice lines', category: 'audio', help: 'Voice lines of NPCs and announcers.', sections: ['sound'], outputFolder: 'NPCVoice' },
  'extract-voice-sets': { label: 'All voice sets', category: 'audio', help: 'Every voice set in the game, by GUID. Takes a long time.', sections: ['sound'], outputFolder: 'VoiceSets' },
  'extract-music': { label: 'Music', category: 'audio', help: 'Every sound classified as music. Music is Ogg Opus: VLC can\'t play most of it, foobar2000 can.', sections: ['sound'] },

  // --- Maps & world -----------------------------------------------------------
  'extract-maps': {
    label: 'Maps',
    category: 'maps',
    help: 'Map geometry, props, lights and sounds as .owmap for the io_scene_owm Blender add-on. Maps are big: pick specific ones rather than "*".',
    queryRequired: true,
    queryPlaceholder: 'Dorado',
    examples: ['Dorado', "King's Row", '*'],
    sections: ['models', 'textures'],
  },
  'extract-map-envs': { label: 'Map environments', category: 'maps', help: 'Skyboxes, lighting, ground and environment sounds for every map.', sections: ['textures', 'sound'] },
  'extract-map-objectives': { label: 'Map objectives', category: 'maps', help: 'Objective areas and their bounds for every map.' },
  'extract-lootbox': { label: 'Loot boxes', category: 'maps', help: 'Loot box models, animations and shop cards.', sections: ['models'], outputFolder: 'LootBoxes' },

  // --- UI, images & video -----------------------------------------------------
  'extract-vector-images': { label: 'Vector images (SVG)', category: 'ui', help: 'Vector images used by the UI, saved as SVG.', outputFolder: 'VectorImages' },
  'extract-gamemode-images': { label: 'Game mode images', category: 'ui', help: 'Game mode and arcade card art.', sections: ['textures'], outputFolder: 'GamemodeImages' },
  'extract-intel-database': { label: 'Intel database', category: 'ui', help: 'Assets from the in-game Intel Database (lore codex).', sections: ['textures'] },
  'extract-movies': { label: 'Movies', category: 'ui', help: 'In-game videos (Bink .bk2) with their audio.', sections: ['sound'], outputFolder: 'Movies' },
  'dump-ui-textures': { label: 'All UI textures', category: 'ui', help: 'Every UI texture. Large.', sections: ['textures'], outputFolder: 'UITextureDump' },
  'dump-textures': { label: 'All textures', category: 'ui', help: 'Every texture in the game. Very large and slow.', sections: ['textures'] },

  // --- Game data --------------------------------------------------------------
  'list-heroes': { label: 'Heroes', category: 'data', help: 'Every hero with role, description, abilities and colors.' },
  'list-unlocks': { label: 'Hero unlocks', category: 'data', help: 'Every hero\'s cosmetics with rarity, event and availability.' },
  'list-general-unlocks': { label: 'General unlocks', category: 'data', help: 'Unlocks shared across heroes.' },
  'list-maps': { label: 'Maps', category: 'data', help: 'Every map and variant with its game modes and GUIDs.' },
  'list-abilities': { label: 'Abilities', category: 'data', help: 'Every ability with description and GUIDs.' },
  'list-talents': { label: 'Talents', category: 'data', help: 'Every talent and perk.' },
  'list-achievements': { label: 'Achievements', category: 'data', help: 'Every achievement with its reward.' },
  'list-challenges': { label: 'Challenges', category: 'data', help: 'Challenges and their rewards.' },
  'list-subtitles': { label: 'Subtitles', category: 'data', help: 'Subtitle text for voice lines.' },
  'list-subtitles-real': { label: 'Subtitles (from audio)', category: 'data', help: 'Subtitles gathered from voice line data. Text output only.' },
  'list-workshop': { label: 'Workshop', category: 'data', help: 'Workshop actions, values, events and their descriptions.' },
  'dump-strings': { label: 'All strings', category: 'data', help: 'Every localized string in your text language.' },
  'dump-lootbox-pools': { label: 'Loot box pools', category: 'data', help: 'Loot box drop pools, saved as CSV and JSON into the output folder.', outputFolder: 'LootboxPools' },

};

export function categoryFor(keyword: string): string {
  if (keyword.startsWith('list-')) return 'data';
  if (/voice|sound|music|audio|convo/.test(keyword)) return 'audio';
  if (/map/.test(keyword)) return 'maps';
  if (/texture|image|ui|movie|icon/.test(keyword)) return 'ui';
  return 'other';
}

// ---------------------------------------------------------------------------
// Flags

export interface FlagSection {
  id: string;
  label: string;
}

export const FLAG_SECTIONS: FlagSection[] = [
  { id: 'textures', label: 'Textures' },
  { id: 'models', label: 'Models & animations' },
  { id: 'sound', label: 'Sound & subtitles' },
  { id: 'raw', label: 'Raw output' },
  { id: 'output', label: 'Output' },
  { id: 'game', label: 'Game data' },
  { id: 'other', label: 'Other' },
];

export interface FlagExtra {
  label?: string;
  section?: string;
  help?: string;
}

export const FLAG_EXTRAS: Record<string, FlagExtra> = {
  // General
  language: { label: 'Text language', section: 'game', help: 'Language for names, strings and subtitles. Default: the game\'s language (from Battle.net or Steam).' },
  'speech-language': { label: 'Speech language', section: 'game', help: 'Language for voice lines. It must be installed in the game. Default: the game\'s audio language.' },
  online: { label: 'Download damaged files', section: 'game', help: 'Fetch files that are missing or corrupted in your install from Blizzard\'s CDN.' },
  'deduplicate-textures': { label: 'Deduplicate textures', section: 'textures', help: 'Re-use textures already saved for other models instead of saving them again (smaller output when extracting many skins).' },
  rcn: { label: 'China region content', section: 'game', help: 'Load China-exclusive content (detected automatically for China installs).' },
  rkr: { label: 'Korea region content', section: 'game', help: 'Load Korea-exclusive content (detected automatically for Korean installs).' },

  // Extract
  'convert-textures-type': { label: 'Texture format', section: 'textures', help: 'png: widest support. tif: keeps multi-surface textures. dds: GPU format, fastest.' },
  'convert-animations-type': { label: 'Animation format', section: 'models', help: 'owanimclip: for the io_scene_owm Blender add-on. seanim: SEAnim tools.' },
  'extract-refpose': { label: 'Skeleton reference poses', section: 'models' },
  'raw-textures': { label: 'Raw textures', section: 'raw', help: 'Save textures in the game\'s format, unconverted.' },
  'raw-sound': { label: 'Raw sound', section: 'raw', help: 'Save sounds in the game\'s Wwise format, unconverted.' },
  'raw-models': { label: 'Raw models', section: 'raw' },
  'raw-animations': { label: 'Raw animations', section: 'raw' },
  raw: { label: 'Skip all conversion', section: 'raw' },
  'force-dds-multisurface': { label: 'Multi-surface as DDS', section: 'textures', help: 'Save multi-surface textures (cubemaps, arrays) as DDS even when another format is chosen.' },
  'sheet-multisurface': { label: 'Multi-surface as sheet', section: 'textures', help: 'Tile all surfaces vertically into one large image.' },
  'combine-multisurface': { label: 'Combine surfaces', section: 'textures', help: 'Combine all surfaces into one image (TIF and DDS only).' },
  grayscale: { label: 'Single channel as grayscale', section: 'textures', help: 'Convert single-channel textures to grayscale RGB.' },
  'subtitles-with-sounds': { label: 'Subtitles next to sounds', section: 'sound', help: 'Save a .txt with the subtitle next to each voice line.' },
  'subtitles-as-sounds': { label: 'Name sounds by subtitle', section: 'sound', help: 'Name voice line files after their subtitle text.' },
  'use-texture-decoder': { label: 'Accurate texture decoder', section: 'textures', help: 'Decode textures with TextureDecoder: slower, more accurate.' },
  'all-lods': { label: 'All model LODs', section: 'models', help: 'Save every level of detail, not just the best one.' },

  // List
  json: { label: 'JSON', section: 'output' },
  out: { label: 'Output file', section: 'output' },
  simplify: { label: 'Simplified', section: 'output', help: 'Print less detail (text output only).' },
};

export function flagSection(name: string): string {
  return FLAG_EXTRAS[name]?.section ?? (/sound|voice|subtitle|audio/.test(name) ? 'sound' : /texture/.test(name) ? 'textures' : /model|anim|lod/.test(name) ? 'models' : 'other');
}

export function flagLabel(name: string): string {
  if (FLAG_EXTRAS[name]?.label) return FLAG_EXTRAS[name].label!;
  const s = name.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Text languages DataTool accepts. */
export const LANGUAGES: Record<string, string> = {
  deDE: 'German',
  enUS: 'English',
  esES: 'Spanish (Spain)',
  esMX: 'Spanish (Latin America)',
  frFR: 'French',
  itIT: 'Italian',
  jaJP: 'Japanese',
  koKR: 'Korean',
  plPL: 'Polish',
  ptBR: 'Portuguese (Brazil)',
  ruRU: 'Russian',
  thTH: 'Thai',
  trTR: 'Turkish',
  zhCN: 'Chinese (Simplified)',
  zhTW: 'Chinese (Traditional)',
};
